'use strict';

const { group } = require('./util');

const material = async ctx => (await ctx.one("INSERT INTO item_master (code, category, name_en, name_ar, unit) VALUES ($1, 'r02', $1, $1, 'ea') RETURNING id", [`r02-mat-${ctx.n()}`])).id;
const recipe = ctx => ctx.api('POST', '/api/materials/recipes', { project_id: ctx.pid, name: `r02 recipe ${ctx.n()}` });
const recipeLine = async ctx => {
  const r = await recipe(ctx);
  const line = await ctx.api('POST', `/api/materials/recipes/${r.id}/lines`, { material_id: await material(ctx), factor_per_unit: 2 });
  return { recipe: r, line };
};

module.exports = {
  ...group(['POST /api/materials/recipes', 'POST /api/v1/materials/recipes'], async ctx => ({ body: { project_id: ctx.pid, name: `r02 recipe ${ctx.n()}` }, status: 201 })),
  ...group(['PUT /api/materials/recipes/:id', 'PUT /api/v1/materials/recipes/:id'], async ctx => ({ params: { id: (await recipe(ctx)).id }, body: { notes: 'r02' } })),
  ...group(['POST /api/materials/recipes/:id/lines'], async ctx => ({ params: { id: (await recipe(ctx)).id }, body: { material_id: await material(ctx), factor_per_unit: 3 }, status: 201 })),
  ...group(['DELETE /api/materials/recipes/:id/lines/:lineId'], async ctx => {
    const { recipe: r, line } = await recipeLine(ctx);
    return { params: { id: r.id, lineId: line.id } };
  }),
  ...group(['PUT /api/materials/replenishment/policies', 'PUT /api/v1/materials/replenishment/policies'], async ctx => ({ body: { scope: 'material', ref: String(await material(ctx)), mode: 'alert_only' } })),
  ...group(['DELETE /api/materials/replenishment/policies', 'DELETE /api/v1/materials/replenishment/policies'], async ctx => {
    const ref = String(await material(ctx));
    await ctx.api('PUT', '/api/materials/replenishment/policies', { scope: 'material', ref, mode: 'alert_only' });
    return { query: `scope=material&ref=${ref}` };
  }),
  // The sweep runs under a leader lock across several transactions by design: its completion audit is a
  // documented non-atomic exception (owner-recorded), so only the audit row is asserted, not rollback.
  ...group(['POST /api/materials/replenishment/sweep', 'POST /api/v1/materials/replenishment/sweep'], async () => ({
    body: {}, nonAtomic: 'replenishment sweep is a leader-locked multi-transaction job; the completion audit is separate by design',
  })),
};
