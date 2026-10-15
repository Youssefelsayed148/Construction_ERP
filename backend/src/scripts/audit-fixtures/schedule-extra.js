'use strict';
const { group } = require('./util');
const activity = ctx => ctx.api('POST', '/api/schedule/activities', { project_id: ctx.pid, name: `r02 extra schedule ${ctx.n()}`, planned_start: '2026-11-01', planned_finish: '2026-11-10' });
const assetRegister = async ctx => (await ctx.one(
  'INSERT INTO asset_register (project_id, asset_code, name, created_by) VALUES ($1,$2,$3,$4) RETURNING id',
  [ctx.pid, `r02-schedule-asset-${ctx.n()}`, 'r02 schedule resource', ctx.owner.id]
)).id;
const assignment = async ctx => {
  const a = await activity(ctx);
  return ctx.api('POST', `/api/schedule/activities/${a.id}/assignments`, {
    asset_register_id: await assetRegister(ctx), assigned_from: '2026-11-01', assigned_to: '2026-11-02',
  }, [201]);
};
const importBody = ctx => ({
  project_id: ctx.pid,
  csv: `activity_code,name,wbs_path,work_package,planned_start,planned_finish,original_duration,planned_quantity,percent_complete,is_milestone\nR02-${ctx.n()},Imported activity,,,,,2,,0,false`,
});
module.exports = {
  ...group(['PUT /api/schedule/activities/:id/budgeted-cost'], async ctx => ({ params: { id: (await activity(ctx)).id }, body: { budgeted_cost: 250 } })),
  ...group(['POST /api/schedule/activities/:id/progress', 'POST /api/v1/schedule/activities/:id/progress'], async ctx => ({ params: { id: (await activity(ctx)).id }, body: { percent_complete: 25, data_date: '2026-10-15' } })),
  ...group(['POST /api/schedule/activities/:id/assignments'], async ctx => ({ params: { id: (await activity(ctx)).id }, body: { asset_register_id: await assetRegister(ctx), assigned_from: '2026-11-01', assigned_to: '2026-11-02' }, status: 201 })),
  ...group(['PUT /api/schedule/assignments/:id/status'], async ctx => ({ params: { id: (await assignment(ctx)).id }, body: { status: 'active' } })),
  ...group(['POST /api/schedule/activities/import'], async ctx => ({ body: importBody(ctx), status: 200 })),
};
