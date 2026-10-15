'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { group } = require('./util');
const token = async ctx => ctx.api('POST', '/api/agent/tokens', { name: `r02 token ${ctx.n()}`, scopes: ['projects:read'], expires_in_days: 30 });
const authUser = async (ctx, password = 'r02-valid-password-123') => {
  const who = await ctx.actor('owner');
  const email = `r02-${ctx.n()}@example.com`;
  await ctx.db.query('UPDATE users SET password = $1, email = $2 WHERE id = $3', [await bcrypt.hash(password, 4), email, who.userId]);
  return { ...who, password, email };
};

module.exports = {
  ...group(['POST /api/mcp'], async ctx => ({
    body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_invoice_draft', arguments: { project_id: ctx.pid, amount: 10 } } },
  })),
  ...group(['POST /api/agent/requests/:id/decision'], async ctx => {
    const requester = await ctx.actor('owner');
    const row = await ctx.one("INSERT INTO agent_action_requests (tool, operation, payload, requesting_user_id, required_approver_role, project_id, execution_status) VALUES ('create_invoice_draft', '{}', '{}', $1, 'owner', $2, 'draft') RETURNING id", [requester.userId, ctx.pid]);
    return { params: { id: row.id }, body: { decision: 'reject', comment: 'r02 registry' } };
  }),
  ...group(['POST /api/users/preview/:role'], async () => ({ params: { role: 'site_engineer' }, body: {} })),
  ...group(['POST /api/v1/oauth/token'], async ctx => {
    const who = await ctx.actor('owner');
    const secret = crypto.randomBytes(24).toString('hex');
    const clientId = `r02-oauth-${ctx.n()}`;
    await ctx.db.query("INSERT INTO service_accounts (name, client_id, client_secret_hash, user_id, scopes) VALUES ('r02 registry', $1, $2, $3, $4::jsonb)", [clientId, await bcrypt.hash(secret, 4), who.userId, JSON.stringify(['api:read'])]);
    return { body: { grant_type: 'client_credentials', client_id: clientId, client_secret: secret }, actor: who };
  }),
  ...group(['POST /api/agent/tokens'], async ctx => ({ body: { name: `r02 token ${ctx.n()}`, scopes: ['projects:read'], expires_in_days: 30 }, status: 201 })),
  ...group(['POST /api/agent/tokens/:id/revoke'], async ctx => ({ params: { id: (await token(ctx)).id }, body: {} })),
  ...group(['POST /api/agent/sessions/:id/status'], async ctx => {
    const id = crypto.randomUUID();
    await ctx.db.query("INSERT INTO agent_sessions (id, user_id, client_name, status, expires_at) VALUES ($1, $2, 'R02 fixture', 'active', NOW() + INTERVAL '1 day')", [id, ctx.owner.id]);
    return { params: { id }, body: { status: 'revoked' } };
  }),
  ...group(['POST /api/auth/register'], async ctx => ({ body: { name: `R02 user ${ctx.n()}`, email: `r02-${ctx.n()}@example.com`, password: 'r02-valid-password-123', role: 'viewer' }, status: 201 })),
  ...group(['POST /api/auth/login'], async ctx => {
    const who = await authUser(ctx);
    return { body: { email: who.email, password: who.password }, actor: who };
  }),
  ...group(['POST /api/auth/change-password'], async ctx => {
    const who = await authUser(ctx);
    return { body: { currentPassword: who.password, newPassword: 'r02-new-password-456' }, actor: who };
  }),
  ...group(['POST /api/auth/logout-all'], async ctx => ({ body: {}, actor: await authUser(ctx) })),
};
