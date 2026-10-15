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
const { createPostgresRateLimit } = require('../middleware/postgresRateLimit');

router.use(correlationId);

const rateLimit = createPostgresRateLimit({
  scope: 'mcp', windowMs: 60_000,
  limit: () => parseInt(process.env.MCP_RATE_LIMIT_PER_MIN || '120', 10),
  key: (req) => `u${req.user.id}`,
  onExceeded: (_req, res) => res.status(429).json({ jsonrpc: '2.0', id: null, error: { code: -32029, message: 'Rate limit exceeded' } }),
  onUnavailable: (_req, res) => res.status(503).json({ jsonrpc: '2.0', id: null, error: { code: -32003, message: 'Rate limit service unavailable' } }),
});

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
