'use strict';
const { group } = require('./util');
const assetBody = ctx => ({ name_ar: `r02 asset ${ctx.n()}`, name_en: 'r02 asset', category: 'tool', equipment_type: 'owned', current_project_id: ctx.pid });
const asset = async ctx => ctx.api('POST', '/api/assets', assetBody(ctx));
const assignmentBody = ctx => ({ project_id: ctx.pid, assigned_from: '2026-10-15' });
const usageBody = ctx => ({ project_id: ctx.pid, log_date: '2026-10-15', hours_operated: 2, fuel_liters: 1 });
module.exports = {
  ...group(['POST /api/assets'], async ctx => ({ body: assetBody(ctx), status: 201 })),
  ...group(['PUT /api/assets/:id'], async ctx => ({ params: { id: (await asset(ctx)).id }, body: { manufacturer: 'r02 updated' } })),
  ...group(['DELETE /api/assets/:id'], async ctx => ({ params: { id: (await asset(ctx)).id } })),
  ...group(['POST /api/assets/:id/assignments'], async ctx => ({ params: { id: (await asset(ctx)).id }, body: assignmentBody(ctx), status: 201 })),
  ...group(['POST /api/assets/:id/usage-logs'], async ctx => ({ params: { id: (await asset(ctx)).id }, body: usageBody(ctx), status: 201 })),
};
