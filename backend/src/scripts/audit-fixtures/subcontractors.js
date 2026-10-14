'use strict';

const { group } = require('./util');

const sub = ctx => ctx.api('POST', '/api/subcontractors', { name_ar: `مقاول ${ctx.n()}`, name_en: 'Sub' });
const boqItem = async ctx => {
  const s = await ctx.api('POST', '/api/boq/sections', { project_id: ctx.pid, name_ar: `قسم ${ctx.n()}` });
  return ctx.api('POST', '/api/boq/items', { project_id: ctx.pid, section_id: s.id, description_ar: `بند ${ctx.n()}`, quantity: 5, unit_rate: 10 });
};
const contract = async ctx => ctx.api('POST', '/api/subcontractors/contracts', { project_id: ctx.pid, subcontractor_id: (await sub(ctx)).id, contract_value: 1000, scope: 'r02' });
const verification = async ctx => ctx.api('POST', '/api/subcontractors/verifications', { sub_contract_id: (await contract(ctx)).id, boq_item_id: (await boqItem(ctx)).id, period_from: '2026-10-01', period_to: '2026-10-14', quantity_claimed: 2, quantity_verified: 1 });
const certificate = async ctx => ctx.api('POST', '/api/subcontractors/certificates', { sub_contract_id: (await contract(ctx)).id, period_from: '2026-10-01', period_to: '2026-10-14', work_value: 500 });

module.exports = {
  ...group(['POST /api/subcontractors'], async ctx => ({ body: { name_ar: `مقاول ${ctx.n()}`, name_en: 'Sub' }, status: 201 })),
  ...group(['PUT /api/subcontractors/:id'], async ctx => ({ params: { id: (await sub(ctx)).id }, body: { rating: 4 } })),
  ...group(['POST /api/subcontractors/contracts'], async ctx => ({ body: { project_id: ctx.pid, subcontractor_id: (await sub(ctx)).id, contract_value: 2000 }, status: 201 })),
  ...group(['POST /api/subcontractors/verifications', 'POST /api/v1/subcontracts/verifications'], async ctx => ({
    body: { sub_contract_id: (await contract(ctx)).id, boq_item_id: (await boqItem(ctx)).id, period_from: '2026-10-01', period_to: '2026-10-14', quantity_claimed: 2, quantity_verified: 1 }, status: 201,
  })),
  ...group(['PUT /api/subcontractors/verifications/:id', 'PUT /api/v1/subcontracts/verifications/:id'], async ctx => ({ params: { id: (await verification(ctx)).id }, body: { status: 'approved' } })),
  ...group(['POST /api/subcontractors/certificates', 'POST /api/v1/subcontracts/certificates'], async ctx => ({
    body: { sub_contract_id: (await contract(ctx)).id, period_from: '2026-10-01', period_to: '2026-10-14', work_value: 500 }, status: 201,
  })),
  ...group(['PUT /api/subcontractors/certificates/:id', 'PUT /api/v1/subcontracts/certificates/:id'], async ctx => ({ params: { id: (await certificate(ctx)).id }, body: { status: 'certified' } })),
  ...group(['POST /api/v1/subcontracts'], async ctx => ({ body: { project_id: ctx.pid, subcontractor_id: (await sub(ctx)).id, contract_value: 3000 }, status: 201 })),
};
