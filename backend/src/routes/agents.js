// Phase 27 — admin "Agent Activity" API (prompt 27 point 7).
//
// Serves the Agent Activity screen: every MCP tool call with its
// authorization decision and response summary, plus the pending gated
// action requests with approve/reject (which executes through the same
// guarded chain as the original tool call).
//
// Access: owner/admin — this is the oversight surface for the agent layer.

'use strict';

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { queryPaginated } = require('../utils/pagination');
const { authenticate, authorize } = require('../middleware/auth');
const mcpService = require('../services/mcpService');
const crypto = require('crypto');
const oauthService = require('../services/oauthService');
const apiTokenService = require('../services/apiTokenService');
const { auditedTransaction } = require('../utils/auditedTransaction');
const { typedFail, routeFail } = require('../utils/typedRoute');

// Personal API tokens --------------------------------------------------------

router.get('/tokens', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const tokens = await auditedTransaction((q) => queryPaginated(req, res, q, {
      sql: `SELECT id, name, audience, token_prefix, scopes, expires_at, last_used_at, revoked_at, created_at
       FROM api_tokens WHERE user_id = $1`,
      params: [req.user.id],
      orderBy: [{ column: 'created_at', direction: 'DESC' }],
    }), (result) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'read', module: 'agents',
      description: 'Read personal API token list', entityType: 'api_token' }));
    res.json({ success: true, data: tokens.rows });
  } catch (error) { return typedFail(res, error, 'AGENT_API_TOKEN_LIST', req); }
});

router.post('/tokens', authenticate, authorize('owner', 'admin'), async (req, res) => {
  const schema = Joi.object({
    name: Joi.string().trim().min(1).max(120).required(),
    scopes: Joi.array().items(Joi.string()).min(1).unique().required(),
    expires_in_days: Joi.number().integer().min(1).max(90).default(30),
  }).unknown(false);
  const { error, value } = schema.validate(req.body);
  if (error || value.scopes.some((scope) => !oauthService.validScope(scope) || scope.startsWith('api:'))) {
    return res.status(400).json({ success: false, error_code: 'invalid_api_token_request' });
  }
  const rawToken = `erp_pat_${crypto.randomBytes(32).toString('hex')}`;
  const expiresAt = new Date(Date.now() + value.expires_in_days * 86400000);
  try {
    const result = await auditedTransaction(async (q) => {
      const user = (await q('SELECT token_version FROM users WHERE id = $1 AND is_active = true', [req.user.id])).rows[0];
      if (!user) throw Object.assign(new Error('api_token_user_inactive'), { code: 'api_token_user_inactive', status: 401 });
      return q(
        `INSERT INTO api_tokens (user_id, name, token_prefix, token_hash, scopes, token_version, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id, name, audience, token_prefix, scopes, expires_at, created_at`,
        [req.user.id, value.name, rawToken.slice(0, 16), apiTokenService.hashToken(rawToken), value.scopes, user.token_version || 0, expiresAt]
      );
    }, (r) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'agents',
      description: `Created API token ${r.rows[0].name}`, entityId: r.rows[0].id, entityType: 'api_token' }));
    res.status(201).json({ success: true, data: { ...result.rows[0], token: rawToken } });
  } catch (error) { return typedFail(res, error, 'AGENT_API_TOKEN_CREATE', req); }
});

router.post('/tokens/:id/revoke', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const result = await auditedTransaction(async (q) => {
      const token = (await q('SELECT id, name FROM api_tokens WHERE id = $1 AND user_id = $2 FOR UPDATE', [req.params.id, req.user.id])).rows[0];
      if (!token) throw Object.assign(new Error('api_token_not_found'), { code: 'api_token_not_found', status: 404 });
      await q('UPDATE api_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE id = $1', [token.id]);
      return { rows: [token] };
    }, (r) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'agents',
      description: `Revoked API token ${r.rows[0].name}`, entityId: r.rows[0].id, entityType: 'api_token' }));
    res.json({ success: true, data: { id: result.rows[0].id, revoked: true } });
  } catch (error) { return typedFail(res, error, 'AGENT_API_TOKEN_REVOKE', req); }
});

// Durable MCP agent session administration ----------------------------------

router.get('/sessions', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const sessions = await auditedTransaction(async (q) => {
      const page = await queryPaginated(req, res, q, {
        sql: `SELECT s.id, s.user_id, u.name AS user_name, u.role AS user_role, s.client_name, s.status,
              s.created_at, s.last_seen_at, s.expires_at, s.ended_at
       FROM agent_sessions s JOIN users u ON u.id = s.user_id
       `,
        orderBy: [{ column: 's.last_seen_at', direction: 'DESC' }, { column: 's.id', direction: 'DESC' }],
      });
      return { rows: page.rows };
    }, (result) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'read', module: 'agents',
      description: 'Read agent sessions', entityType: 'agent_session' }));
    res.json({ success: true, data: sessions.rows });
  } catch (error) { return typedFail(res, error, 'AGENT_SESSION_LIST', req); }
});

router.post('/sessions/:id/status', authenticate, authorize('owner', 'admin'), async (req, res) => {
  const { error, value } = Joi.object({ status: Joi.string().valid('completed', 'revoked').required() }).validate(req.body);
  if (error) return res.status(400).json({ success: false, error_code: 'invalid_agent_session_status' });
  try {
    const result = await auditedTransaction(async (q) => {
      const session = (await q('SELECT id, status FROM agent_sessions WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      if (!session) throw Object.assign(new Error('agent_session_not_found'), { code: 'agent_session_not_found', status: 404 });
      if (session.status !== 'active') throw Object.assign(new Error('agent_session_not_active'), { code: 'agent_session_not_active', status: 409 });
      const updated = await q(
        `UPDATE agent_sessions SET status = $1, ended_at = COALESCE(ended_at, NOW())
         WHERE id = $2 RETURNING id, status, ended_at`, [value.status, session.id]);
      return updated;
    }, (r) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'agents',
      description: `Set agent session ${req.params.id} state to ${r.rows[0].status}`, entityType: 'agent_session' }));
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { return typedFail(res, error, 'AGENT_SESSION_STATUS', req); }
});

// Every tool call (audit trail) ----------------------------------------------
router.get('/activity', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const page = await queryPaginated(req, res, query, {
      sql: `SELECT c.*, u.name as user_name
       FROM agent_tool_calls c LEFT JOIN users u ON c.user_id = u.id
       `,
      orderBy: [{ column: 'c.created_at', direction: 'DESC' }, { column: 'c.id', direction: 'DESC' }],
    });
    res.json({ success: true, data: page.rows });
  } catch (e) { routeFail(res, e, 'agents.GET /activity', req); }
});

// Gated action requests (pending + history) -----------------------------------
router.get('/requests', authenticate, authorize('owner', 'admin', 'finance_manager'), async (req, res) => {
  try {
    const status = req.query.status; // pending | draft | all
    let sql = 'SELECT r.*, ru.name as requesting_user_name, au.name as approver_name FROM agent_action_requests r';
    let where = ' WHERE 1 = 1'; const params = [];
    if (status === 'pending') where = " WHERE r.decision IS NULL AND r.execution_status = 'awaiting_approval'";
    else if (status === 'draft') where = " WHERE r.execution_status = 'draft' AND r.decision IS NULL";
    const page = await queryPaginated(req, res, query, {
      sql: `SELECT r.*, ru.name as requesting_user_name, au.name as approver_name
       FROM agent_action_requests r
       LEFT JOIN users ru ON r.requesting_user_id = ru.id
       LEFT JOIN users au ON r.approver_user_id = au.id${where}`,
      params,
      orderBy: [{ column: 'r.created_at', direction: 'DESC' }, { column: 'r.id', direction: 'DESC' }],
    });
    res.json({ success: true, data: page.rows });
  } catch (e) { routeFail(res, e, 'agents.GET /requests', req); }
});

// Approve / reject a gated request; approve EXECUTES the stored operation.
router.post('/requests/:id/decision', authenticate, authorize('owner', 'admin', 'finance_manager'), async (req, res) => {
  try {
    const schema = Joi.object({ decision: Joi.string().valid('approve', 'reject').required(), comment: Joi.string().allow('', null) });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const result = await mcpService.decideRequest(parseInt(req.params.id, 10), req.user, value.decision, value.comment);
    res.json({ success: true, data: result });
  } catch (e) {
    routeFail(res, e, 'agents.POST /requests/:id/decision', req);
  }
});

module.exports = router;
