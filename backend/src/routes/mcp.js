// Phase 27 — MCP Streamable HTTP endpoint.
//
// POST /api/mcp with a Bearer token (internal UI JWT or v1 scoped token) and
// a JSON-RPC 2.0 body (single message or batch). The acting user's role
// drives the tool allowlist and redaction; the response for tools/call is
// the same JSON the internal API would produce for that user.
//
// This router is mounted WITHOUT the global express auth (it authenticates
// itself), so server.js must mount it before nothing else depends on order.

'use strict';

const express = require('express');
const router = express.Router();
const oauthService = require('../services/oauthService');
const mcpService = require('../services/mcpService');
const agentSessionService = require('../services/agentSessionService');
const { correlationId } = require('../middleware/v1');

router.use(correlationId);

// Fixed-window limiter per user (the env is read per request so it can be tuned without a restart).
const buckets = new Map();
function rateLimit(req, res, next) {
  const limit = parseInt(process.env.MCP_RATE_LIMIT_PER_MIN || '120', 10);
  const subject = `u${req.user.id}`;
  const window = Math.floor(Date.now() / 60000);
  let bucket = buckets.get(subject);
  if (!bucket || bucket.window !== window) { bucket = { window, count: 0 }; buckets.set(subject, bucket); }
  bucket.count += 1;
  if (buckets.size > 5000) for (const [k, b] of buckets) if (b.window !== window) buckets.delete(k);
  res.setHeader('X-RateLimit-Limit', limit);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - bucket.count));
  if (bucket.count > limit) {
    res.setHeader('Retry-After', 60);
    return res.status(429).json({ jsonrpc: '2.0', id: null, error: { code: -32029, message: 'Rate limit exceeded' } });
  }
  return next();
}

// MCP accepts the same bearer tokens as /api/v1: internal UI tokens (full
// parity) and v1 tokens (scopes: api:read for read tools, api:write for
// draft/gated tools; narrow family scopes are additionally honored at call
// time through the role allowlist).
router.use(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Authentication required' } });
  }
  try {
    const auth = await oauthService.verifyToken(header.slice(7));
    req.user = auth.user;
    req.preAuthenticated = true;
    req.authType = auth.type;
    req.v1Scopes = auth.scopes;
    req.readOnly = auth.type === 'preview';
    req.actorUserId = auth.actorId || null;
    req.mcpSession = await agentSessionService.getOrCreateMcpSession({
      user: req.user,
      sessionId: req.headers['mcp-session-id'] || null,
    });
    next();
  } catch (e) {
    if (!e.status) console.error('[MCP] session resolution failed:', e);
    const status = e.status || 500;
    const code = e.code === 'agent_session_not_found' ? -32004 : (e.status ? -32001 : -32603);
    res.status(status).json({ jsonrpc: '2.0', id: null, error: { code, message: e.code || 'internal_error' } });
  }
});

router.post('/', rateLimit, async (req, res) => {
  const ctx = {
    user: req.user,
    authType: req.authType,
    readOnly: req.readOnly,
    scopes: req.v1Scopes,
    agentSession: req.mcpSession,
    correlationId: req.correlationId,
  };
  try {
    const { httpStatus, body } = await mcpService.handleRpc(req.body, ctx);
    if (body) res.setHeader('Mcp-Session-Id', ctx.agentSession);
    res.status(httpStatus).json(body);
  } catch (e) {
    console.error('[MCP] rpc failed:', e.stack || e.message);
    res.status(500).json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error' } });
  }
});

// MCP Streamable HTTP may negotiate an SSE stream; this server responds with
// single JSON messages; it does not keep an SSE streaming connection.
router.get('/', (req, res) => {
  res.status(405).json({ error: 'MCP over this endpoint is stateless JSON (POST only); no SSE stream' });
});

module.exports = router;
