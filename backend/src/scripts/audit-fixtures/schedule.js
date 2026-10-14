'use strict';

const { group } = require('./util');

const activity = ctx => ctx.api('POST', '/api/schedule/activities', { project_id: ctx.pid, name: `r02 activity ${ctx.n()}`, planned_start: '2026-11-01', planned_finish: '2026-11-10' });
const milestone = ctx => ctx.api('POST', `/api/projects/${ctx.pid}/milestones`, { title_ar: `معلم ${ctx.n()}`, target_date: '2026-12-01' });

module.exports = {
  ...group(['POST /api/schedule/calendars', 'POST /api/v1/schedule/calendars'], async ctx => ({ body: { project_id: ctx.pid, name: `r02 calendar ${ctx.n()}` }, status: 201 })),
  ...group(['POST /api/schedule/activities', 'POST /api/v1/schedule/activities'], async ctx => ({
    body: { project_id: ctx.pid, name: `r02 activity ${ctx.n()}`, planned_start: '2026-11-01', planned_finish: '2026-11-10' }, status: 201,
  })),
  ...group(['PUT /api/schedule/activities/:id', 'PUT /api/v1/schedule/activities/:id'], async ctx => ({ params: { id: (await activity(ctx)).id }, body: { notes: 'r02 edited' } })),
  ...group(['DELETE /api/schedule/activities/:id', 'DELETE /api/v1/schedule/activities/:id'], async ctx => ({ params: { id: (await activity(ctx)).id } })),
  ...group(['POST /api/schedule/relationships', 'POST /api/v1/schedule/relationships'], async ctx => ({
    body: { project_id: ctx.pid, predecessor_id: (await activity(ctx)).id, successor_id: (await activity(ctx)).id }, status: 201,
  })),
  ...group(['DELETE /api/schedule/relationships/:id', 'DELETE /api/v1/schedule/relationships/:id'], async ctx => {
    const rel = await ctx.api('POST', '/api/schedule/relationships', { project_id: ctx.pid, predecessor_id: (await activity(ctx)).id, successor_id: (await activity(ctx)).id });
    return { params: { id: rel.id } };
  }),
  ...group(['POST /api/schedule/schedule/milestones/:id/link'], async ctx => ({
    params: { id: (await milestone(ctx)).id }, body: { schedule_activity_id: (await activity(ctx)).id },
  })),
  ...group(['POST /api/schedule/baselines', 'POST /api/v1/schedule/baselines'], async ctx => ({ body: { project_id: ctx.pid, name: `r02 baseline ${ctx.n()}` }, status: 201 })),
};
