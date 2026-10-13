'use strict';

const crypto = require('crypto');
const { query } = require('../config/database');
const { auditedTransaction } = require('../utils/auditedTransaction');

const SESSION_TTL_DAYS = 90;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getOrCreateMcpSession({ user, sessionId = null }, opts = {}) {
  if (!user?.id) throw Object.assign(new Error('session_owner_required'), { code: 'session_owner_required', status: 401 });
  if (sessionId && !UUID_RE.test(sessionId)) throw Object.assign(new Error('agent_session_not_found'), { code: 'agent_session_not_found', status: 404 });
  if (!sessionId) {
    const id = crypto.randomUUID();
    const result = await auditedTransaction((q) => q(
      `INSERT INTO agent_sessions (id, user_id, client_name, expires_at)
       VALUES ($1,$2,'MCP client',NOW() + ($3 * INTERVAL '1 day')) RETURNING id`,
      [id, user.id, SESSION_TTL_DAYS]
    ), (r) => ({ userId: user.id, userName: user.name, userRole: user.role, action: 'create', module: 'agents',
      description: `Created MCP agent session ${r.rows[0].id}`, entityType: 'agent_session' }), opts);
    return result.rows[0].id;
  }
  const result = await auditedTransaction(async (q) => {
    const session = (await q('SELECT id, status, expires_at FROM agent_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE', [sessionId, user.id])).rows[0];
    if (!session || session.status !== 'active') {
      throw Object.assign(new Error('agent_session_not_found'), { code: 'agent_session_not_found', status: 404 });
    }
    if (new Date(session.expires_at).getTime() <= Date.now()) {
      await q("UPDATE agent_sessions SET status = 'expired', ended_at = COALESCE(ended_at, NOW()) WHERE id = $1", [sessionId]);
      return { rows: [session], expired: true };
    }
    await q('UPDATE agent_sessions SET last_seen_at = NOW() WHERE id = $1', [sessionId]);
    return { rows: [session], expired: false };
  }, (r) => ({ userId: user.id, userName: user.name, userRole: user.role, action: r.expired ? 'update' : 'read', module: 'agents',
    description: `${r.expired ? 'Expired' : 'Resumed'} MCP agent session ${r.rows[0].id}`, entityType: 'agent_session' }), opts);
  if (result.expired) throw Object.assign(new Error('agent_session_not_found'), { code: 'agent_session_not_found', status: 404 });
  return result.rows[0].id;
}

module.exports = { SESSION_TTL_DAYS, UUID_RE, getOrCreateMcpSession };
