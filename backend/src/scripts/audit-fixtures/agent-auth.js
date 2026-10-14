'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { group } = require('./util');

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
};
