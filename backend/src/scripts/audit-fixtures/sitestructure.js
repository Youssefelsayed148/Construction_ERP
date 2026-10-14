'use strict';

// Locations, maintenance reminders and sales buildings/units.
const { group } = require('./util');

const location = (ctx, extra = {}) => ctx.api('POST', '/api/locations', { project_id: ctx.pid, location_type_code: 'zone', code: `Z-${ctx.n()}`, name: `Zone ${ctx.n()}`, ...extra });
const asset = ctx => ctx.api('POST', '/api/assets', { name_ar: `معدة ${ctx.n()}`, name_en: 'r02 asset', category: 'tool', equipment_type: 'owned', current_project_id: ctx.pid });
const reminder = async ctx => ctx.api('POST', '/api/maintenance', { asset_id: (await asset(ctx)).id, project_id: ctx.pid, title: `r02 service ${ctx.n()}`, scheduled_date: '2026-11-01' });
const building = (ctx, extra = {}) => ctx.api('POST', '/api/sales/buildings', { project_id: ctx.pid, code: `B-${ctx.n()}`, name: `Building ${ctx.n()}`, floors: 1, ...extra });
const unit = async (ctx, b = null) => ctx.api('POST', `/api/sales/buildings/${(b || await building(ctx)).id}/units`, { code: `U-${ctx.n()}`, price: 1000, area: 50 });

module.exports = {
  ...group(['POST /api/locations', 'POST /api/v1/projects/:projectId/locations'], async ctx => ({
    params: { projectId: ctx.pid }, body: { project_id: ctx.pid, location_type_code: 'zone', code: `Z-${ctx.n()}`, name: `Zone ${ctx.n()}` }, status: 201,
  })),
  ...group(['PUT /api/locations/:id'], async ctx => ({ params: { id: (await location(ctx)).id }, body: { name: `Renamed ${ctx.n()}` } })),
  ...group(['DELETE /api/locations/:id'], async ctx => ({ params: { id: (await location(ctx)).id } })),
  ...group(['POST /api/maintenance'], async ctx => ({
    body: { asset_id: (await asset(ctx)).id, project_id: ctx.pid, title: `r02 service ${ctx.n()}`, scheduled_date: '2026-11-01' }, status: 201,
  })),
  ...group(['PUT /api/maintenance/:id'], async ctx => ({ params: { id: (await reminder(ctx)).id }, body: { title: `r02 edited ${ctx.n()}` } })),
  ...group(['DELETE /api/maintenance/:id'], async ctx => ({ params: { id: (await reminder(ctx)).id } })),
  ...group(['POST /api/sales/buildings'], async ctx => ({ body: { project_id: ctx.pid, code: `B-${ctx.n()}`, name: `Building ${ctx.n()}`, floors: 2 }, status: 201 })),
  ...group(['PUT /api/sales/buildings/:id'], async ctx => ({ params: { id: (await building(ctx)).id }, body: { name: `Renamed ${ctx.n()}`, floors: 2 } })),
  ...group(['DELETE /api/sales/buildings/:id'], async ctx => ({ params: { id: (await building(ctx)).id } })),
  ...group(['POST /api/sales/buildings/:buildingId/units'], async ctx => ({ params: { buildingId: (await building(ctx)).id }, body: { code: `U-${ctx.n()}`, price: 1000, area: 50 }, status: 201 })),
  ...group(['POST /api/sales/buildings/:buildingId/bulk-units'], async ctx => ({ params: { buildingId: (await building(ctx)).id }, body: { floors: 1, units_per_floor: 2, prefix: 'R' }, status: 201 })),
  ...group(['PUT /api/sales/units/:id'], async ctx => ({ params: { id: (await unit(ctx)).id }, body: { price: 2000 } })),
  ...group(['POST /api/sales/units/:id/status'], async ctx => ({ params: { id: (await unit(ctx)).id }, body: { status: 'reserved', client_id: (await ctx.one("INSERT INTO clients (name_en, name_ar) VALUES ($1, $1) RETURNING id", [`r02-client-${ctx.n()}`])).id } })),
  ...group(['DELETE /api/sales/units/:id'], async ctx => ({ params: { id: (await unit(ctx)).id } })),
};
