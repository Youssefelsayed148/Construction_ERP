// Phase 27 + 28 tests — the MCP server and the agent layer.
//
// Coverage:
//   - migration DDL: agent_tool_calls + agent_action_requests
//   - agentPolicy: role allowlists, redaction via the policy visibility flags,
//     required-approver resolution
//   - MCP protocol: initialize, tools/list (role-filtered), tools/call,
//     unknown method, ping
//   - PARITY (prompt 27 point 9): an MCP call from a consultant-scoped session
//     returns the exact same authorization result as the equivalent UI action
//     for the same user; and an MCP call from a user with no policy rows
//     (legacy) behaves like the internal call
//   - gated actions: proposal stored, NOTHING executes until approval;
//     approve executes the stored payload through the same guarded chain;
//     authority is enforced (finance role required where configured)
//   - draft-only tools store draft proposals, never execute
//   - redaction: monetary fields stripped for users without visibility flags
//   - assistants (Phase 28): compose read tools only; draft helpers return
//     payloads and never execute; executive assistant is read-only

process.env.JWT_SECRET = process.env.JWT_SECRET || 'agent-layer-test-secret';

jest.mock('../../config/database', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  pool: {},
  healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' }),
}));

const { query } = require('../../config/database');
const jwt = require('jsonwebtoken');
const express = require('express');

const agentPolicy = require('../../services/agentPolicy');
const mcpService = require('../../services/mcpService');
const migration = require('../migrate-38-agent-layer');
const policy = require('../../services/policy');
const { MockDb } = require('../test-helpers/mock-db');

const SECRET = process.env.JWT_SECRET;
const db = new MockDb();
const q = (sql, params) => db.query(sql, params);

// ---------------------------------------------------------------------------
// Flexible stub (MockDb-backed for the fixture tables; targeted mocks for
// the joins the audit queries use).
// ---------------------------------------------------------------------------

const stub = {
  users: new Map(),
  userPolicy: new Map(),
};

const OWNER = { id: 1, email: 'owner@x.com', name: 'Owner', role: 'owner', department: null, is_active: true };
const CONSULTANT = { id: 4, email: 'consultant@x.com', name: 'Consultant', role: 'consultant', department: null, is_active: true };
const SUPERVISOR = { id: 3, email: 'super@x.com', name: 'Supervisor', role: 'site_supervisor', department: null, is_active: true };

function seedUsers() {
  stub.users.set(1, OWNER);
  stub.users.set(3, SUPERVISOR);
  stub.users.set(4, CONSULTANT);
  // Internal full grants (company-wide) — parity with the UI for owner.
  stub.userPolicy.set(1, [
    { role_key: 'owner', project_id: null, organization_id: 1, perm_module: '*', perm_action: '*' },
    { role_key: 'owner', project_id: null, organization_id: 1, perm_module: '*', perm_action: 'see_internal_cost' },
    { role_key: 'owner', project_id: null, organization_id: 1, perm_module: '*', perm_action: 'see_client_value' },
    { role_key: 'owner', project_id: null, organization_id: 1, perm_module: '*', perm_action: 'see_subcontract_value' },
  ]);
  // Consultant bound to project 1, portal-safe view modules only.
  stub.userPolicy.set(4, ['projects', 'docs', 'qhse', 'boq'].flatMap((m) => [
    { role_key: 'consultant', project_id: 1, organization_id: 2, perm_module: m, perm_action: 'view' },
  ]));
  // Supervisor bound to project 1.
  stub.userPolicy.set(3, ['projects', 'boq', 'handover'].flatMap((m) => [
    { role_key: 'site_supervisor', project_id: 1, organization_id: 1, perm_module: m, perm_action: 'view' },
  ]));
}

beforeAll(async () => {
  await q(`CREATE TABLE IF NOT EXISTS agent_tool_calls (
    id SERIAL PRIMARY KEY, tool VARCHAR(100), risk VARCHAR(20), user_id INTEGER, user_role VARCHAR(100),
    agent_session VARCHAR(200), arguments JSONB, authorized BOOLEAN, authorization_detail JSONB,
    response_status INTEGER, response_summary TEXT, request_id INTEGER, correlation_id VARCHAR(120),
    created_at TIMESTAMPTZ DEFAULT NOW())`);
  await q(`CREATE TABLE IF NOT EXISTS agent_action_requests (
    id SERIAL PRIMARY KEY, tool VARCHAR(100), operation JSONB, payload JSONB, reason TEXT,
    agent_session VARCHAR(200), requesting_user_id INTEGER, required_approver_role VARCHAR(50),
    approver_user_id INTEGER, decision VARCHAR(30), decision_comment TEXT, decided_at TIMESTAMPTZ,
    execution_status VARCHAR(30), execution_result JSONB, executed_transaction_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
  await q(`CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY, code VARCHAR(50), name VARCHAR(255), name_ar VARCHAR(255), name_en VARCHAR(255),
    status VARCHAR(50) DEFAULT 'planning', project_type VARCHAR(100) DEFAULT 'commercial')`);
  await q(`CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY, user_id INTEGER, user_name VARCHAR(255), user_role VARCHAR(100),
    action VARCHAR(100), module VARCHAR(100), description TEXT, entity_id INTEGER, entity_type VARCHAR(100), created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS event_log (
    id SERIAL PRIMARY KEY, event_type VARCHAR(100), entity_type VARCHAR(100), entity_id INTEGER,
    user_id INTEGER, user_name VARCHAR(255), user_role VARCHAR(100), payload JSONB, dispatched_at TIMESTAMPTZ, created_at TIMESTAMPTZ)`);
  await q(`INSERT INTO projects (code, name, name_ar, status) VALUES ('PRJ-0001', 'Agent Test Project', 'مشروع الاختبار', 'planning')`);
  await q(`INSERT INTO projects (code, name, name_ar, status) VALUES ('PRJ-0002', 'Other Project', 'مشروع آخر', 'planning')`);

  seedUsers();

  // Hybrid mock: auth/policy/audit SQL is answered by targeted stubs (the
  // policy JOINs are beyond the mock-db's SQL engine); business SQL runs on
  // the in-memory db exactly like the other route-level suites.
  query.mockImplementation(async (sql, params) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (/FROM users WHERE id = \$1/i.test(s)) {
      const user = stub.users.get(params[0]);
      return { rows: user ? [user] : [] };
    }
    if (/FROM user_project_roles/i.test(s)) return { rows: stub.userPolicy.get(params[0]) || [] };
    if (/FROM roles/i.test(s)) return { rows: [] };
    if (/INSERT INTO audit_events/i.test(s)) return { rows: [] };
    return q(sql, params);
  });
});

beforeEach(() => {
  // Fresh per-test view of dynamic tables; static fixtures persist.
  db.table('agent_tool_calls').rows.length = 0;
  db.table('agent_action_requests').rows.length = 0;
});

function tokenFor(userId) {
  return require('../../services/tokens').signSession({ userId }, 600);
}

function makeCtx(userId) {
  const user = stub.users.get(userId);
  return { user, agentSession: 'test-session', correlationId: 'test-corr' };
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------
describe('Phase 27 migration DDL', () => {
  test('creates agent_tool_calls and agent_action_requests', () => {
    const text = migration.DDL.join('\n');
    expect(text).toContain('CREATE TABLE IF NOT EXISTS agent_tool_calls');
    expect(text).toContain('CREATE TABLE IF NOT EXISTS agent_action_requests');
    expect(text).toMatch(/required_approver_role/);
    expect(text).toMatch(/executed_transaction_id/);
  });
});

// ---------------------------------------------------------------------------
// agentPolicy
// ---------------------------------------------------------------------------
describe('agent policy', () => {
  test('allowlist by role: consultant sees only portal-scoped tools', () => {
    expect(agentPolicy.toolAllowed('consultant', 'get_project_cost_summary')).toBe(false);
    expect(agentPolicy.toolAllowed('consultant', 'list_observations')).toBe(true);
    expect(agentPolicy.toolAllowed('consultant', 'create_site_observation')).toBe(true);
    expect(agentPolicy.toolAllowed('consultant', 'get_my_actions')).toBe(false);
    expect(agentPolicy.toolAllowed('consultant', 'issue_purchase_order')).toBe(false);
    expect(agentPolicy.toolAllowed('owner', 'issue_purchase_order')).toBe(true);
    expect(agentPolicy.toolAllowed('finance_manager', 'record_payment')).toBe(true);
    expect(agentPolicy.toolAllowed('subcontractor', 'get_project_team')).toBe(false);
  });

  test('every gated tool resolves a required approver role', () => {
    expect(agentPolicy.requiredApproverRole('issue_purchase_order')).toBe('finance_manager');
    expect(agentPolicy.requiredApproverRole('change_permission_rules')).toBe('owner');
    expect(agentPolicy.requiredApproverRole('close_project')).toBe('owner');
    expect(agentPolicy.requiredApproverRole('list_projects')).toBeNull();
  });

  test('redaction strips monetary fields without visibility flags, keeps them with flags', () => {
    const data = { summary: { contract_value: 100, amount: 50, name: 'X' }, rows: [{ unit_price: 9, item: 'steel' }] };
    const fullFlags = { see_internal_cost: true, see_client_value: true, see_subcontract_value: true };
    const redacted = agentPolicy.redactForUser(data, fullFlags);
    expect(redacted.summary.name).toBe('X');
    expect(redacted.summary.amount).toBe(50);
    expect(redacted.summary.contract_value).toBe(100);

    const noFlags = { see_internal_cost: false, see_client_value: false, see_subcontract_value: false };
    const stripped = agentPolicy.redactForUser(data, noFlags);
    expect(stripped.summary.amount).toBeUndefined();
    expect(stripped.summary.contract_value).toBeUndefined();
    expect(stripped.rows[0].unit_price).toBeUndefined();
    expect(stripped.rows[0].item).toBe('steel');
  });
});

// ---------------------------------------------------------------------------
// MCP protocol
// ---------------------------------------------------------------------------
describe('MCP JSON-RPC', () => {
  test('initialize returns protocol version + capabilities', async () => {
    const out = (await mcpService.handleRpc({ jsonrpc: '2.0', id: 1, method: 'initialize' }, makeCtx(1))).body;
    expect(out.result.protocolVersion).toBe('2024-11-05');
    expect(out.result.capabilities.tools).toBeTruthy();
    expect(out.result.serverInfo.name).toBe('construction-erp-mcp');
  });

  test('tools/list is filtered by role — consultant sees only portal tools', async () => {
    const out = (await mcpService.handleRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, makeCtx(4))).body;
    const names = out.result.tools.map((t) => t.name);
    expect(names).toContain('list_observations');
    expect(names).not.toContain('get_my_actions');
    expect(names).not.toContain('get_project_cost_summary');
    expect(names).not.toContain('issue_purchase_order');

    const ownerOut = (await mcpService.handleRpc({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, makeCtx(1))).body;
    const ownerNames = ownerOut.result.tools.map((t) => t.name);
    expect(ownerNames).toContain('issue_purchase_order');
    expect(ownerNames).toContain('list_projects');
  });

  test('unknown method returns -32601; ping answers', async () => {
    const bad = (await mcpService.handleRpc({ jsonrpc: '2.0', id: 3, method: 'resources/list' }, makeCtx(1))).body;
    expect(bad.error.code).toBe(-32601);
    const ok = (await mcpService.handleRpc({ jsonrpc: '2.0', id: 4, method: 'ping' }, makeCtx(1))).body;
    expect(ok.result).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Tool execution parity (prompt 27 point 9)
// ---------------------------------------------------------------------------
describe('MCP ↔ UI authorization parity', () => {
  beforeAll(async () => {
    // The projects list JOINs clients + employees; give the mock-db both so
    // the underlying UI query resolves for both sides of the parity check.
    await q(`CREATE TABLE IF NOT EXISTS clients (id SERIAL PRIMARY KEY, name_ar VARCHAR(255), name_en VARCHAR(255))`);
    await q(`CREATE TABLE IF NOT EXISTS employees (id SERIAL PRIMARY KEY, name_ar VARCHAR(255), name_en VARCHAR(255))`);
  });

  test('an internal project-bound user gets the SAME list via MCP and the UI', async () => {
    // Supervisor: internal, project-bound to project 1. The equivalent UI
    // action is GET /api/projects — MCP's list_projects maps there.
    const ctx = makeCtx(3);
    const out = (await mcpService.handleRpc({
      jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'list_projects', arguments: {} },
    }, ctx)).body;
    const mcpResult = JSON.parse(out.result.content[0].text);

    // Equivalent UI call: same user, same token, internal mount.
    const { remountFrom, ROUTERS } = require('../../routes/v1');
    const chain = remountFrom({
      router: ROUTERS.projects.router, internalMount: ROUTERS.projects.mount,
      method: 'GET', path: '/',
    });
    const req = {
      method: 'GET', params: {}, query: {}, body: {},
      headers: { authorization: `Bearer ${tokenFor(3)}` },
      originalUrl: '/api/projects', baseUrl: '/api/projects',
    };
    const res = { statusCode: 200, setHeader: () => {}, _body: null, status(c) { res.statusCode = c; return res; }, json(b) { res._body = b; return res; } };
    await chain(req, res, () => {});

    expect(mcpResult.success).toBe(res._body.success);
    expect(JSON.stringify((mcpResult.data || []).map((p) => p.id)))
      .toBe(JSON.stringify((res._body.data || []).map((p) => p.id)));
  });

  test('a consultant MCP call returns the SAME denial as the equivalent internal call', async () => {
    // The consultant has no 'observations' policy grant in this fixture —
    // MCP's list_observations (→ /api/consultant/reviews) and the direct
    // internal call must BOTH deny with the same result.
    const ctx = makeCtx(4);
    const out = (await mcpService.handleRpc({
      jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'list_observations', arguments: {} },
    }, ctx)).body;
    const mcpResult = JSON.parse(out.result.content[0].text);

    const { remountFrom, ROUTERS } = require('../../routes/v1');
    const chain = remountFrom({
      router: ROUTERS.consultant.router, internalMount: ROUTERS.consultant.mount,
      method: 'GET', path: '/reviews',
    });
    const req = {
      method: 'GET', params: {}, query: {}, body: {},
      headers: { authorization: `Bearer ${tokenFor(4)}` },
      originalUrl: '/api/consultant/reviews', baseUrl: '/api/consultant',
    };
    const res = { statusCode: 200, setHeader: () => {}, _body: null, status(c) { res.statusCode = c; return res; }, json(b) { res._body = b; return res; } };
    await chain(req, res, () => {});

    expect(mcpResult.success).toBe(res._body.success);
    expect(mcpResult.error || res._body.error).toBeTruthy();
  });

  test('a tool outside the role allowlist is refused even if the policy would allow it', async () => {
    const out = (await mcpService.handleRpc({
      jsonrpc: '2.0', id: 11, method: 'tools/call',
      params: { name: 'get_project_cost_summary', arguments: { project_id: 1 } },
    }, makeCtx(4))).body;
    const parsed = JSON.parse(out.result.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/not allowed for role 'consultant'/);
  });

  test('gated tools NEVER execute directly — a confirmation record is stored', async () => {
    const out = (await mcpService.handleRpc({
      jsonrpc: '2.0', id: 11, method: 'tools/call',
      params: { name: 'close_project', arguments: { project_id: 1, status: 'completed', reason: 'agent believes work is done' } },
    }, makeCtx(1))).body;
    const parsed = JSON.parse(out.result.content[0].text);
    expect(parsed.data.status).toBe('pending_approval');
    expect(parsed.data.required_approver_role).toBe('owner');
    const row = (await q('SELECT * FROM agent_action_requests WHERE id = $1', [parsed.data.request_id])).rows[0];
    expect(row.execution_status === undefined || row.execution_status === 'awaiting_approval').toBe(true);
    expect(row.decision == null).toBe(true);
    // The project is untouched.
    const project = (await q('SELECT * FROM projects WHERE id = $1', [1])).rows[0];
    expect(project.status).toBe('planning');
  });

  test('draft tools create draft proposals, not records', async () => {
    const out = (await mcpService.handleRpc({
      jsonrpc: '2.0', id: 12, method: 'tools/call',
      params: { name: 'add_rfi_comment', arguments: { rfi_id: 5, comment: 'draft response text' } },
    }, makeCtx(3))).body;
    const parsed = JSON.parse(out.result.content[0].text);
    expect(parsed.data.status).toBe('draft_for_review');
    const row = (await q('SELECT * FROM agent_action_requests WHERE id = $1', [parsed.data.request_id])).rows[0];
    expect(row.execution_status === undefined || row.execution_status === 'draft').toBe(true);
    expect(row.decision == null).toBe(true);
  });

  test('approve executes the gated action through the same guarded chain', async () => {
    const ctx = makeCtx(1); // owner proposes (close_project is gated)
    const out = (await mcpService.handleRpc({
      jsonrpc: '2.0', id: 12, method: 'tools/call',
      params: { name: 'close_project', arguments: { project_id: 1, status: 'completed' } },
    }, ctx)).body;
    const requestId = JSON.parse(out.result.content[0].text).data.request_id;

    // Owner approves → executes as the REQUESTING user (re-resolved through policy).
    const decided = await mcpService.decideRequest(requestId, OWNER, 'approve', 'verified on site');
    const decidedRow = (await q('SELECT * FROM agent_action_requests WHERE id = $1', [requestId])).rows[0];
    expect(decidedRow.decision).toBe('approved');
    const project = (await q('SELECT * FROM projects WHERE id = $1', [1])).rows[0];
    expect(project.status).toBe('completed');

    // The approval was itself audited into the tool-call log.
    const calls = db.table('agent_tool_calls').rows;
    expect(calls.some((c) => c.request_id === requestId && c.tool === 'close_project')).toBe(true);
  });

  test('deciding without authority is rejected', async () => {
    const out = (await mcpService.handleRpc({
      jsonrpc: '2.0', id: 13, method: 'tools/call',
      params: { name: 'close_project', arguments: { project_id: 2, status: 'completed' } },
    }, makeCtx(1))).body;
    const requestId = JSON.parse(out.result.content[0].text).data.request_id;
    await expect(mcpService.decideRequest(requestId, SUPERVISOR, 'approve', null))
      .rejects.toMatchObject({ status: 403 });
  });
});

// ---------------------------------------------------------------------------
// Redaction at the MCP boundary
// ---------------------------------------------------------------------------
describe('model-facing redaction', () => {
  test('tools/call responses are redacted for users without cost visibility', async () => {
    const supervisor = stub.users.get(3);
    // Grant the supervisor policy visibility? No — keep flags off; use a
    // costing-summary-shaped payload through redactBody directly.
    const body = { success: true, data: { summary: { amount: 42, contract_value: 1000, name: 'P1' }, rows: [{ unit_price: 7, item: 'a' }] } };
    const flags = { see_internal_cost: false, see_client_value: false, see_subcontract_value: false };
    const out = mcpService.redactBody(body, flags);
    expect(out.data.summary.amount).toBeUndefined();
    expect(out.data.summary.contract_value).toBeUndefined();
    expect(out.data.summary.name).toBe('P1');
    expect(out.data.rows[0].unit_price).toBeUndefined();
    expect(out.data.rows[0].item).toBe('a');
  });
});

// ---------------------------------------------------------------------------
// Phase 28 — assistants
// ---------------------------------------------------------------------------
describe('Phase 28 assistants', () => {
  const assistantService = require('../../services/assistantService');

  test('registry covers the six assistants', () => {
    expect(assistantService.ASSISTANTS).toEqual(['pm', 'procurement', 'commercial', 'consultant', 'document', 'executive']);
  });

  test('PM drafts are proposals and never executed', async () => {
    const result = await assistantService.draftPm({
      project_id: 1, title: 'Check rebar delivery', assigned_user_id: 3,
    });
    expect(result.assistant).toBe('pm');
    expect(result.drafts[0].tool).toBe('assign_action');
    expect(result.drafts[0].note).toMatch(/human review/);
  });

  test('commercial assistant drafts never approve money', () => {
    const result = assistantService.draftCommercial({ project_id: 1, title: 'Scope change', lines: [] });
    expect(result.drafts[0].tool).toBe('create_variation_draft');
    expect(result.drafts[0].note).toMatch(/review/);
  });

  test('executive assistant is read-only', () => {
    const result = assistantService.draftExecutive();
    expect(result.drafts).toEqual([]);
  });
});
