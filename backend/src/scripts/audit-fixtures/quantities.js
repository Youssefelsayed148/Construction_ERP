'use strict';

const { group } = require('./util');

const boqItem = async ctx => {
  const s = await ctx.api('POST', '/api/boq/sections', { project_id: ctx.pid, name_ar: `قسم ${ctx.n()}` });
  return ctx.api('POST', '/api/boq/items', { project_id: ctx.pid, section_id: s.id, description_ar: `بند ${ctx.n()}`, quantity: 100, unit_rate: 10 });
};
const location = ctx => ctx.api('POST', '/api/locations', { project_id: ctx.pid, location_type_code: 'zone', code: `Z-${ctx.n()}`, name: `Zone ${ctx.n()}` });
const allocationBody = async ctx => ({ boq_item_id: (await boqItem(ctx)).id, project_location_id: (await location(ctx)).id, planned_quantity: 10 });
const allocation = async ctx => ctx.api('POST', '/api/quantities/allocations', await allocationBody(ctx));
const measurementBody = async ctx => {
  const item = await boqItem(ctx);
  return { project_id: ctx.pid, project_location_id: (await location(ctx)).id, boq_item_id: item.id, measured_date: '2026-10-14', quantity: 2 };
};
const measurement = async ctx => ctx.api('POST', '/api/quantities/measurements', await measurementBody(ctx));

module.exports = {
  ...group(['POST /api/quantities/allocations', 'POST /api/v1/quantities/allocations'], async ctx => ({ body: await allocationBody(ctx), status: 201 })),
  ...group(['PUT /api/quantities/allocations/:id', 'PUT /api/v1/quantities/allocations/:id'], async ctx => ({ params: { id: (await allocation(ctx)).id }, body: { planned_quantity: 20 } })),
  ...group(['POST /api/quantities/measurements', 'POST /api/v1/quantities/measurements'], async ctx => ({ body: await measurementBody(ctx), status: 201 })),
  ...group(['POST /api/quantities/measurements/:id/review', 'POST /api/v1/quantities/measurements/:id/review'], async ctx => ({
    params: { id: (await measurement(ctx)).id }, body: { state: 'approved' },
  })),
};
