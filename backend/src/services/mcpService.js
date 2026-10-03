// Phase 27 — MCP (Model Context Protocol) server.
//
// ADAPTER ONLY (prompt 27 point 1): every tool executes the SAME internal
// route handler chain the UI uses — authenticate → authorize (Phase 4 policy
// engine) → handler — by remounting the internal operation with a short-lived
// token for the acting user. The MCP layer never touches the database
// directly; authorization resolution is identical to the API layer (point 5).
//
// Transport: MCP Streamable HTTP (JSON-RPC 2.0 over POST /api/mcp).
//   initialize · tools/list · tools/call · ping
// Sessions: stateless per-request; Mcp-Session-Id is echoed for clients that
// require it but no server-side session state is kept.
//
// Risk classes (agentPolicy.TOOLS):
//   read  — immediate execution
//   draft — safe transactional draft writes (draft records only); tools with
//           no safe internal write path store a draft PROPOSAL for a human
//   gated — high-risk: a confirmation record is stored (agent_action_requests)
//           and NOTHING executes until a human with the required approver
//           role approves it (prompt 27 points 4 + 6)
//
// Every call is logged to agent_tool_calls (the "Agent Activity" surface,
// point 7). Responses are redacted per the user's policy visibility flags
// before anything model-facing is returned (point 8).

'use strict';

const crypto = require('crypto');
const { query } = require('../config/database');
const agentPolicy = require('./agentPolicy');
const policy = require('./policy');
const { logActivity } = require('../utils/activity');

// routes/v1 exposes the internal router registry; require it lazily —
// routes/v1 → assistantService → mcpService is a cycle and top-level
// destructuring would capture an incomplete exports object.
let v1Module = null;
function getV1() {
  if (!v1Module) v1Module = require('../routes/v1');
  return v1Module;
}

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'construction-erp-mcp', version: '1.0.0' };

// ---------------------------------------------------------------------------
// Tool → input schema (JSON Schema for tools/list)
// ---------------------------------------------------------------------------

function inputSchemaFor(toolName, def) {
  const props = {
    project_id: { type: 'number', description: 'Project id (when the tool is project-scoped)' },
    id: { type: 'number', description: 'Record id (when the tool targets a single record)' },
    status: { type: 'string', description: 'Optional status filter' },
    q: { type: 'string', description: 'Optional text search' },
  };
  if (def && def.argMap) {
    for (const arg of Object.keys(def.argMap)) {
      props[arg] = { type: 'number', description: `Target record id (${arg})` };
    }
  }
  const required = def && def.argMap ? Object.keys(def.argMap).filter((k) => k !== 'project_id') : [];
  return {
    type: 'object',
    properties: props,
    required: def && def.risk === 'gated' ? [] : required,
    additionalProperties: true,
  };
}

function toolDescriptor(name, def) {
  return {
    name,
    description: `${def.risk === 'gated' ? 'HIGH-RISK (requires human approval): ' : ''}${name.replace(/_/g, ' ')}`,
    inputSchema: inputSchemaFor(name, def),
    'x-risk': def.risk,
  };
}

// ---------------------------------------------------------------------------
// Internal execution — the SAME handler chains as the API layer
// ---------------------------------------------------------------------------

function makeResponseStub() {
  const res = {
    statusCode: 200,
    headersSent: false,
    setHeader: () => {},
    status(code) { res.statusCode = code; return res; },
    _body: null,
    json(body) { res._body = body; return res; },
    send(body) { res._body = body; return res; },
    end() { return res; },
  };
  return res;
}

function buildSyntheticRequest(def, routerName, args, user, readOnly = false) {
  const argMap = def.argMap || {};
  const params = {}; const query = {}; const body = {};
  const { reason: _reason, ...toolArgs } = args || {};
  void _reason;
  for (const [key, value] of Object.entries(toolArgs)) {
    if (argMap[key]) params[argMap[key]] = String(value);
    else if (def.method === 'GET') query[key] = value;
    else body[key] = value;
  }
  const internalMount = getV1().ROUTERS[routerName].mount;
  return {
    method: def.method,
    params,
    query,
    body,
    // Already authenticated by routes/mcp.js (typed token); the handler chain must not re-verify.
    user, preAuthenticated: true,
    preview: readOnly ? { actor_id: user.id, role: user.role, read_only: true } : undefined,
    headers: { 'x-request-id': `mcp-${crypto.randomUUID()}` },
    originalUrl: `${internalMount}${def.path}`,
    ip: 'mcp-session',
    baseUrl: '/api/mcp',
  };
}

// Execute one internal operation through its exact guarded handler chain.
async function invokeInternal(routerName, method, path, def, args, user, readOnly = false) {
  const chain = getV1().remountFrom({ router: getV1().ROUTERS[routerName].router, internalMount: getV1().ROUTERS[routerName].mount, method, path });
  const req = buildSyntheticRequest(def, routerName, args, user, readOnly);
  const res = makeResponseStub();
  let chainError = null;
  try {
    await chain(req, res, (err) => { chainError = err || chainError; });
  } catch (e) {
    chainError = e;
  }
  if (chainError) {
    return { status: 500, body: { success: false, error: chainError.message } };
  }
  return { status: res.statusCode, body: res._body };
}

// ---------------------------------------------------------------------------
// Audit surfaces
// ---------------------------------------------------------------------------

async function logToolCall({ toolName, def, user, agentSession, args, authorized, authorizationDetail, result, requestId, correlationId }) {
  try {
    const summary = result && result.body && result.body.success
      ? JSON.stringify(result.body).slice(0, 500)
      : `status ${result ? result.status : 'n/a'}: ${result && result.body ? (result.body.error || '') : ''}`;
    await query(
      `INSERT INTO agent_tool_calls (tool, risk, user_id, user_role, agent_session, arguments,
         authorized, authorization_detail, response_status, response_summary, request_id, correlation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [toolName, def.risk, user.id, user.role, agentSession || null, JSON.stringify(args || {}),
        authorized, JSON.stringify(authorizationDetail || {}), result ? result.status : null,
        summary, requestId || null, correlationId || null]
    );
  } catch (e) {
    console.error('[MCP] tool call logging failed:', e.message);
  }
}

async function recordActivity({ tool, user, detail }) {
  try {
    await logActivity({
      userId: user.id, userName: user.name, userRole: user.role,
      action: 'agent_tool', module: 'agents',
      description: `MCP tool ${tool}`,
      entityType: 'agent_tool_call',
    });
  } catch (e) { /* activity log best-effort */ }
  void detail;
}

async function createConfirmationRecord({ toolName, def, args, reason, user, agentSession }) {
  const requiredApproverRole = agentPolicy.requiredApproverRole(toolName);
  const r = await query(
    `INSERT INTO agent_action_requests
       (tool, operation, payload, reason, agent_session, requesting_user_id, required_approver_role, execution_status, project_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [toolName,
      JSON.stringify({ router: def.router || null, method: def.method || null, path: def.path || null }),
      JSON.stringify(args || {}),
      reason || null,
      agentSession || null,
      user.id,
      requiredApproverRole,
      def.draftOnly ? 'draft' : 'awaiting_approval',
      args?.project_id == null ? null : Number(args.project_id)]
  );
  return r.rows[0];
}

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

async function callTool({ toolName, args, reason, user, agentSession, flags, readOnly = false }) {
  const def = agentPolicy.TOOLS[toolName];
  if (!def) return { ok: false, status: 400, body: { success: false, error: `Unknown tool '${toolName}'` } };
  if (readOnly && def.risk !== 'read') {
    return { ok: false, status: 403, body: { success: false, error: 'Preview mode is read-only' } };
  }
  if (!agentPolicy.toolAllowed(user.role, toolName)) {
    return { ok: false, status: 403, body: { success: false, error: `Tool '${toolName}' is not allowed for role '${user.role}'` } };
  }

  // ---- gated: propose, never execute immediately --------------------------
  if (def.risk === 'gated') {
    const request = await createConfirmationRecord({ toolName, def, args, reason, user, agentSession });
    return {
      ok: true,
      status: 202,
      gated: true,
      body: {
        success: true,
        data: {
          status: 'pending_approval',
          request_id: request.id,
          tool: toolName,
          required_approver_role: request.required_approver_role,
          note: 'A human with the required authority must approve this action before it executes.',
        },
      },
      request,
    };
  }

  // ---- draft-only (no safe internal write path): store a draft proposal ---
  if (def.draftOnly) {
    const request = await createConfirmationRecord({ toolName, def, args, reason, user, agentSession });
    return {
      ok: true,
      status: 201,
      draft: true,
      body: {
        success: true,
        data: {
          status: 'draft_for_review',
          request_id: request.id,
          tool: toolName,
          payload: args || {},
        },
      },
      request,
    };
  }

  // ---- read / draft (mapped): run the internal chain immediately ----------
  const result = await invokeInternal(def.router, def.method, def.path, def, args, user, readOnly);
  const ok = result.status < 400;
  return { ok, status: result.status, body: result.body };
}

// Tool-call wrapper that redacts the response and logs the call.
async function executeTool({ toolName, args, reason, user, agentSession, correlationId, readOnly = false }) {
  const def = agentPolicy.TOOLS[toolName];
  if (!def) return { status: 400, body: { success: false, error: `Unknown tool '${toolName}'` } };

  const allowed = agentPolicy.toolAllowed(user.role, toolName);
  let result;
  if (!allowed) {
    result = { ok: false, status: 403, body: { success: false, error: `Tool '${toolName}' is not allowed for role '${user.role}'` } };
  } else {
    result = await callTool({ toolName, args, reason, user, agentSession, readOnly });
  }

  // Redact before anything model-facing is built (point 8). Gated/draft
  // proposal responses carry no business records, but redact uniformly.
  const flags = await agentPolicy.resolveVisibilityFlags(user);
  const redacted = redactBody(result.body, flags);

  await logToolCall({
    toolName, def, user, agentSession, args, authorized: allowed,
    authorizationDetail: { class: def.risk, allowlisted: allowed },
    result: { status: result.status, body: result.body },
    requestId: result.request ? result.request.id : null,
    correlationId,
  });
  await recordActivity({ tool: toolName, user, detail: {} });

  return { ...result, body: redacted };
}

function redactBody(body, flags) {
  if (!body || typeof body !== 'object') return body;
  if (body.success === false) return body;
  return { ...body, data: agentPolicy.redactForUser(body.data, flags) };
}

// ---------------------------------------------------------------------------
// Approval / apply (high-risk gate + draft application) — prompt 27 point 6
// ---------------------------------------------------------------------------

// The approver (a human with the required authority) decides. On approve the
// stored operation executes through the SAME guarded chain as the original
// tool call, re-resolving the requesting user's permissions at execution
// time; the human decision is the added gate on top of the policy engine.
async function decideRequest(requestId, approver, decision, comment) {
  const request = (await query('SELECT * FROM agent_action_requests WHERE id = $1', [requestId])).rows[0];
  if (!request) throw Object.assign(new Error('Request not found'), { status: 404 });
  if (request.decision) throw Object.assign(new Error('Request already decided'), { status: 409 });

  // Authority check: owner/admin always; otherwise the configured approver role.
  const canDecide = approver.role === 'owner' || approver.role === 'admin'
    || approver.role === request.required_approver_role;
  if (!canDecide) {
    throw Object.assign(new Error(`Requires '${request.required_approver_role}' authority`), { status: 403 });
  }
  // Four-eyes: the person (or agent session) that asked is never the one who approves.
  if (Number(request.requesting_user_id) === Number(approver.id)) {
    throw Object.assign(new Error('You cannot decide a request you made'), { status: 403 });
  }
  // The approver needs authority over the request's project (company-wide requests need company-wide authority).
  const authority = await policy.evaluate({ user: approver, module: 'agent', action: 'create', projectId: request.project_id });
  const hasAuthority = request.project_id == null ? authority.company_wide : authority.allowed;
  if (!hasAuthority) {
    throw Object.assign(new Error('You do not have authority over the project of this request'), { status: 403 });
  }

  const def = agentPolicy.TOOLS[request.tool] || {};
  const args = typeof request.payload === 'string' ? JSON.parse(request.payload) : request.payload;

  let requestingUser = null;
  if (decision !== 'reject') {
    requestingUser = (await query(
      'SELECT id, email, name, role, department, is_active FROM users WHERE id = $1',
      [request.requesting_user_id]
    )).rows[0];
    if (!requestingUser || !requestingUser.is_active) {
      throw Object.assign(new Error('Requesting user is inactive — cannot execute'), { status: 409 });
    }
  }

  // Claim the request atomically. Only the caller whose UPDATE returns the row may act on it, so two
  // concurrent approvals (or an approve racing a reject) cannot both run the stored operation.
  const claimed = (await query(
    `UPDATE agent_action_requests
        SET decision = $2, approver_user_id = $3, decision_comment = $4, decided_at = NOW(),
            execution_status = $5, updated_at = NOW()
      WHERE id = $1 AND decision IS NULL RETURNING *`,
    [requestId, decision === 'reject' ? 'rejected' : 'approved', approver.id, comment || null,
      decision === 'reject' ? 'rejected' : 'executing']
  )).rows[0];
  if (!claimed) throw Object.assign(new Error('Request already decided'), { status: 409 });

  if (decision === 'reject') {
    await logToolCall({
      toolName: request.tool, def: { risk: 'gated' }, user: { id: request.requesting_user_id },
      agentSession: request.agent_session, args,
      authorized: true, authorizationDetail: { decision: 'rejected', approver: approver.id },
      result: { status: 200, body: { success: true } }, requestId, correlationId: null,
    });
    return claimed;
  }

  // Approve → execute the stored payload as the requesting user.
  let executionResult;
  let executionStatus = 'executed';
  let transactionId = null;
  const op = typeof request.operation === 'string' ? JSON.parse(request.operation) : request.operation;

  try {
    if (op.router) {
      executionResult = await invokeInternal(op.router, op.method, op.path, def, args, requestingUser);
    } else {
      // Draft-only proposals without an internal operation remain documents
      // for the human workflow — "approved" simply marks them applied.
      executionResult = { status: 200, body: { success: true, data: { applied: 'manual' } } };
    }
    if (executionResult.status >= 400) executionStatus = 'failed';
    const data = executionResult.body && executionResult.body.data;
    if (data && (data.id != null || data.project_id != null)) {
      transactionId = String(data.id != null ? data.id : data.project_id);
    }
  } catch (e) {
    executionResult = { status: 500, body: { success: false, error: e.message } };
    executionStatus = 'failed';
  }

  const r = await query(
    `UPDATE agent_action_requests
       SET execution_status = $2, execution_result = $3, executed_transaction_id = $4, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [requestId, executionStatus, JSON.stringify(executionResult.body || {}), transactionId]
  );
  await logToolCall({
    toolName: request.tool, def: { risk: 'gated' }, user: requestingUser, agentSession: request.agent_session,
    args, authorized: true, authorizationDetail: { decision: 'approved', approver: approver.id },
    result: executionResult, requestId, correlationId: null,
  });
  return { request: r.rows[0], execution: executionResult };
}

// ---------------------------------------------------------------------------
// JSON-RPC handling (MCP Streamable HTTP)
// ---------------------------------------------------------------------------

function toolListFor(user) {
  return Object.entries(agentPolicy.TOOLS)
    .filter(([name]) => agentPolicy.toolAllowed(user.role, name))
    .map(([name, def]) => toolDescriptor(name, def));
}

// Handles one JSON-RPC message with an authenticated MCP session context.
async function handleRpcMessage(message, ctx) {
  const { jsonrpc, id, method, params } = message || {};
  if (jsonrpc !== '2.0' || !method) {
    return { jsonrpc: '2.0', id: id ?? null, error: { code: -32600, message: 'Invalid Request' } };
  }

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
          instructions: 'Construction ERP tools. Every call resolves the acting user\'s role, project memberships and permissions through the same policy engine as the UI. Draft tools create draft records; high-risk actions require human approval before execution.',
        },
      };
    case 'notifications/initialized':
      return null; // notification — no response
    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };
    case 'tools/list': {
      const tools = Object.entries(agentPolicy.TOOLS)
        .filter(([name]) => agentPolicy.toolAllowed(ctx.user.role, name))
        .map(([name, def]) => toolDescriptor(name, def));
      return { jsonrpc: '2.0', id, result: { tools } };
    }
    case 'tools/call': {
      const toolName = params && params.name;
      const args = (params && params.arguments) || {};
      const reason = args && args.reason;
      const execution = await executeTool({
        toolName, args, reason, user: ctx.user,
        agentSession: ctx.agentSession, correlationId: ctx.correlationId, readOnly: !!ctx.readOnly,
      });
      const payload = execution.body;
      const isError = payload && payload.success === false;
      return {
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(payload) }],
          isError: !!isError,
          structuredContent: payload,
        },
      };
    }
    default:
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
  }
}

// Entry point used by routes/mcp.js.
async function handleRpc(rawBody, ctx) {
  let parsed;
  let messages;
  try {
    parsed = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    messages = Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    return { httpStatus: 400, body: { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } } };
  }

  const flags = await agentPolicy.resolveVisibilityFlags(ctx.user);
  const results = [];
  for (const message of messages) {
    const out = await handleRpcMessage(message, ctx);
    if (out) results.push(out);
  }
  // Redaction applies to tools/call structuredContent as well.
  const redactedResults = results.map((r) => {
    if (r.result && r.result.structuredContent) {
      r.result.structuredContent = redactBody(r.result.structuredContent, flags);
      const first = r.result.content && r.result.content[0];
      if (first) first.text = JSON.stringify(r.result.structuredContent);
    }
    return r;
  });

  return {
    httpStatus: 200,
    body: Array.isArray(parsed) ? redactedResults : redactedResults[0] || null,
  };
}

module.exports = {
  PROTOCOL_VERSION,
  SERVER_INFO,
  inputSchemaFor,
  toolDescriptor,
  callTool,
  executeTool,
  decideRequest,
  handleRpc,
  redactBody,
  invokeInternal,
};
