'use strict';

const { group } = require('./util');

let requestId = 900000;
const request = async ctx => {
  const r = await ctx.api('POST', '/api/approvals/request', { module_name: 'expenses', request_type: `r02-${ctx.n()}`, request_id: ++requestId });
  return r.request || r;
};

module.exports = {
  ...group(['POST /api/approvals/request'], async ctx => ({ body: { module_name: 'expenses', request_type: `r02-${ctx.n()}`, request_id: ++requestId }, status: 200 })),
  ...group(['PUT /api/approvals/:id/approve'], async ctx => ({ params: { id: (await request(ctx)).id }, body: { notes: 'r02' } })),
  ...group(['PUT /api/approvals/:id/reject'], async ctx => ({ params: { id: (await request(ctx)).id }, body: { notes: 'r02' } })),
  ...group(['PUT /api/approvals/:id/cancel', 'PUT /api/v1/approvals/:id/cancel'], async ctx => ({ params: { id: (await request(ctx)).id }, body: { reason: 'r02' } })),
};
