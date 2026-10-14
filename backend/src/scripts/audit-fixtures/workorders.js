'use strict';

const { group } = require('./util');

const wo = ctx => ctx.api('POST', '/api/work-orders', { project_id: ctx.pid, title_ar: `أمر ${ctx.n()}`, title_en: 'r02 work order' });
const item = async ctx => (await ctx.one("INSERT INTO item_master (code, category, name_en, name_ar, unit) VALUES ($1, 'r02', $1, $1, 'ea') RETURNING id", [`r02-wom-${ctx.n()}`])).id;
const boqItem = async ctx => {
  const s = await ctx.api('POST', '/api/boq/sections', { project_id: ctx.pid, name_ar: `قسم ${ctx.n()}` });
  return ctx.api('POST', '/api/boq/items', { project_id: ctx.pid, section_id: s.id, description_ar: `بند ${ctx.n()}`, quantity: 5, unit_rate: 10 });
};
const completion = async ctx => {
  const w = await wo(ctx);
  const c = await ctx.api('POST', `/api/work-orders/${w.id}/completions`, { boq_item_id: (await boqItem(ctx)).id, quantity_completed: 1, completion_date: '2026-10-14' });
  return { wo: w, completion: c };
};

module.exports = {
  ...group(['POST /api/work-orders'], async ctx => ({ body: { project_id: ctx.pid, title_ar: `أمر ${ctx.n()}` }, status: 201 })),
  ...group(['PUT /api/work-orders/:id'], async ctx => ({ params: { id: (await wo(ctx)).id }, body: { status: 'in_progress' } })),
  ...group(['DELETE /api/work-orders/:id'], async ctx => ({ params: { id: (await wo(ctx)).id } })),
  ...group(['POST /api/work-orders/:id/materials'], async ctx => ({ params: { id: (await wo(ctx)).id }, body: { item_id: await item(ctx), planned_quantity: 5 }, status: 201 })),
  ...group(['POST /api/work-orders/:id/labor'], async ctx => ({ params: { id: (await wo(ctx)).id }, body: { skill_category: 'mason', worker_count: 2, hours: 8, work_date: '2026-10-14' }, status: 201 })),
  ...group(['POST /api/work-orders/:id/equipment'], async ctx => {
    const a = await ctx.api('POST', '/api/assets', { name_ar: `معدة ${ctx.n()}`, category: 'tool', equipment_type: 'owned', current_project_id: ctx.pid });
    return { params: { id: (await wo(ctx)).id }, body: { equipment_id: a.id, hours: 2, hourly_cost: 10, work_date: '2026-10-14' }, status: 201 };
  }),
  ...group(['POST /api/work-orders/:id/completions'], async ctx => ({
    params: { id: (await wo(ctx)).id }, body: { boq_item_id: (await boqItem(ctx)).id, quantity_completed: 1, completion_date: '2026-10-14' }, status: 201,
  })),
  ...group(['PUT /api/work-orders/:woId/completions/:compId/verify'], async ctx => {
    const { wo: w, completion: c } = await completion(ctx);
    return { params: { woId: w.id, compId: c.id }, body: { status: 'verified' } };
  }),
};
