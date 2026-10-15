'use strict';

// Actions, notifications, reports, consultant, document control, handover, uploads.
const { group } = require('./util');
const crypto = require('crypto');

const action = (ctx, extra = {}) => ctx.api('POST', '/api/actions', { title: `r02 action ${ctx.n()}`, project_id: ctx.pid, assigned_user_id: ctx.owner.id, ...extra });
// Notifications are per user, so the route is called as the notification's owner.
const notification = async (ctx, userId) => (await ctx.one("INSERT INTO notifications (user_id, channel, event_type, title, status) VALUES ($1, 'in_app', 'r02.test', $2, 'unread') RETURNING id", [userId, `r02 notification ${ctx.n()}`]));
const observation = ctx => ctx.api('POST', '/api/consultant/observations', { project_id: ctx.pid, title: `r02 observation ${ctx.n()}` });
const png = () => new Blob([Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082', 'hex')], { type: 'image/png' });

module.exports = {
  ...group(['POST /api/actions'], async ctx => ({ body: { title: `r02 action ${ctx.n()}`, project_id: ctx.pid, assigned_user_id: ctx.owner.id }, status: 201 })),
  ...group(['POST /api/actions/:id/acknowledge'], async ctx => ({ params: { id: (await action(ctx)).id }, body: {} })),
  ...group(['POST /api/actions/:id/complete'], async ctx => ({ params: { id: (await action(ctx)).id }, body: {} })),
  ...group(['POST /api/actions/:id/comments', 'POST /api/v1/actions/:id/comments'], async ctx => ({ params: { id: (await action(ctx)).id }, body: { body: 'r02 action comment' }, status: 201 })),
  ...group(['POST /api/actions/:id/delegate'], async ctx => {
    const other = await ctx.actor('project_manager');
    return { params: { id: (await action(ctx)).id }, body: { to_user_id: other.userId, comment: 'r02' } };
  }),
  ...group(['POST /api/v1/actions'], async ctx => ({ body: { title: `r02 v1 action ${ctx.n()}`, project_id: ctx.pid, assigned_user_id: ctx.owner.id }, status: 201 })),
  ...group(['POST /api/v1/actions/:id/acknowledge', 'POST /api/v1/actions/:id/complete'], async ctx => ({ params: { id: (await action(ctx)).id }, body: {} })),
  ...group(['POST /api/v1/actions/:id/delegate'], async ctx => {
    const other = await ctx.actor('project_manager');
    return { params: { id: (await action(ctx)).id }, body: { to_user_id: other.userId, comment: 'r02' } };
  }),
  ...group(['POST /api/notifications/:id/read'], async ctx => {
    const who = await ctx.actor('project_manager');
    return { params: { id: (await notification(ctx, who.userId)).id }, body: {}, actor: who };
  }),
  ...group(['PUT /api/notifications/preferences'], async ctx => ({ body: { event_type: `r02.event.${ctx.n()}`, channel: 'in_app', enabled: false } })),
  ...group(['POST /api/v1/notifications/:id/read'], async ctx => {
    const who = await ctx.actor('project_manager');
    return { params: { id: (await notification(ctx, who.userId)).id }, body: {}, actor: who };
  }),
  ...group(['PUT /api/v1/notifications/preferences'], async ctx => ({ body: { event_type: `r02.v1.event.${ctx.n()}`, channel: 'in_app', enabled: false } })),
  ...group(['POST /api/notifications/deliveries/:id/retry'], async ctx => {
    const key = crypto.createHash('sha256').update(ctx.n()).digest('hex');
    const row = await ctx.one(
      `INSERT INTO notification_deliveries (user_id, channel, event_type, idempotency_key, provider, status, attempts, max_attempts, next_retry_at, payload)
       VALUES ($1, 'in_app', 'r02.retry', $2, 'database', 'failed', 0, 5, NOW() - INTERVAL '1 minute', $3::jsonb) RETURNING id`,
      [ctx.owner.id, key, JSON.stringify({ title: 'R02 retry fixture', body: 'local fixture only', eventType: 'r02.retry' })]
    );
    return { params: { id: row.id }, body: {}, actor: { userId: ctx.owner.id, token: ctx.token } };
  }),
  ...group(['POST /api/client-portal/preview'], async ctx => ({ body: { project_id: ctx.pid }, status: 200 })),
  ...group(['POST /api/v1/daily-reports/:projectId/assemble'], async ctx => ({ params: { projectId: ctx.pid }, body: { report_date: '2099-01-01', narrative: 'R02 assembly fixture' }, status: 201 })),
  ...group(['PUT /api/approval-limits'], async () => ({ body: { role: 'engineer', action: 'record_payment', max_amount: 1000, currency: 'EGP', enabled: true }, status: 200 })),
  ...group(['DELETE /api/reports/saved-views/:id'], async ctx => ({
    params: { id: (await ctx.api('POST', '/api/reports/saved-views', { module: 'projects', name: `r02 view ${ctx.n()}` })).id },
  })),
  ...group(['POST /api/v1/reports/saved-views'], async ctx => ({ body: { module: 'projects', name: `r02 v1 view ${ctx.n()}` }, status: 201 })),
  ...group(['DELETE /api/v1/reports/saved-views/:id'], async ctx => ({
    params: { id: (await ctx.api('POST', '/api/reports/saved-views', { module: 'projects', name: `r02 v1 view ${ctx.n()}` })).id },
  })),
  ...group(['DELETE /api/reports/scheduled/:id'], async ctx => ({
    params: { id: (await ctx.api('POST', '/api/reports/scheduled', { project_id: ctx.pid, report_key: 'projects', name: `r02 schedule ${ctx.n()}` })).id },
  })),
  ...group(['POST /api/v1/reports/scheduled'], async ctx => ({ body: { project_id: ctx.pid, report_key: 'projects', name: `r02 v1 schedule ${ctx.n()}` }, status: 201 })),
  ...group(['DELETE /api/v1/reports/scheduled/:id'], async ctx => ({
    params: { id: (await ctx.api('POST', '/api/reports/scheduled', { project_id: ctx.pid, report_key: 'projects', name: `r02 v1 schedule ${ctx.n()}` })).id },
  })),
  ...group(['POST /api/consultant/observations/:id/comments'], async ctx => ({ params: { id: (await observation(ctx)).id }, body: { body: 'r02 comment' }, status: 201 })),
  ...group(['POST /api/docs/categories'], async ctx => ({ body: { name: `r02 category ${ctx.n()}` }, status: 201 })),
  ...group(['PUT /api/docs/numbering/:project_id'], async ctx => ({ params: { project_id: ctx.pid }, body: { doc_prefix: 'R02' } })),
  ...group(['POST /api/handover/package/:projectId/items'], async ctx => ({
    params: { projectId: ctx.pid }, body: { item_type: require('../../services/handoverEngine').PACKAGE_ITEM_TYPES[0], title: `r02 item ${ctx.n()}` }, status: 201,
  })),
  ...group(['POST /api/handover/package/items/:id/verify'], async ctx => {
    const item = await ctx.api('POST', `/api/handover/package/${ctx.pid}/items`, { item_type: require('../../services/handoverEngine').PACKAGE_ITEM_TYPES[0], title: `r02 item ${ctx.n()}` });
    return { params: { id: item.id }, body: { status: 'approved' } };
  }),
  ...group(['POST /api/documents/upload'], async () => {
    const form = new FormData();
    form.append('files', png(), 'r02-audit.png');
    return { body: form, status: 201 };
  }),
};
