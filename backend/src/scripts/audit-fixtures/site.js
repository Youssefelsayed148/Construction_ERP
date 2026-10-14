'use strict';

const { group } = require('./util');

let day = 0;
const nextDate = () => `2030-${String(1 + (day % 12)).padStart(2, '0')}-${String(1 + (Math.floor(day++ / 12) % 28)).padStart(2, '0')}`;
const idem = ctx => ({ 'Idempotency-Key': `r02-${ctx.n()}` });
const report = async ctx => {
  const r = await ctx.api('POST', `/api/projects/${ctx.pid}/site-reports`, { report_date: nextDate(), work_summary: 'r02 summary' }, [200, 201], idem(ctx));
  return r;
};
const instruction = ctx => ctx.api('POST', `/api/projects/${ctx.pid}/instructions`, { title: `r02 instruction ${ctx.n()}` });
const visit = ctx => ctx.api('POST', `/api/projects/${ctx.pid}/site-visits`, { visit_date: '2026-10-14', visitor_name: `r02 visitor ${ctx.n()}` });
const note = ctx => ctx.api('POST', `/api/projects/${ctx.pid}/sticky-notes`, { scope: 'project', text: `r02 follow-up ${ctx.n()}` });
let assembledDay = 0;
const assembledDate = () => `2032-${String(1 + (assembledDay % 12)).padStart(2, '0')}-${String(1 + (Math.floor(assembledDay++ / 12) % 28)).padStart(2, '0')}`;

module.exports = {
  ...group(['POST /api/projects/:projectId/instructions/:id/:action(acknowledge|implement|close)'], async ctx => ({ params: { projectId: ctx.pid, id: (await instruction(ctx)).id, action: 'acknowledge' }, body: { response: 'r02 acknowledged' } })),
  ...group(['POST /api/projects/:projectId/site-reports/assemble'], async ctx => ({ params: { projectId: ctx.pid }, body: { report_date: assembledDate(), narrative: 'r02 assembled' }, status: 201 })),
  ...group(['POST /api/projects/:projectId/photos'], async ctx => ({ params: { projectId: ctx.pid }, body: { file_name: 'r02-photo.jpg', file_url: '/uploads/r02-metadata-only.jpg', caption: 'r02 site photo' }, status: 201 })),
  ...group(['POST /api/projects/:projectId/sticky-notes'], async ctx => ({ params: { projectId: ctx.pid }, body: { scope: 'project', text: `r02 follow-up ${ctx.n()}` }, status: 201 })),
  ...group(['POST /api/projects/:projectId/sticky-notes/:id/convert-to-action'], async ctx => ({ params: { projectId: ctx.pid, id: (await note(ctx)).id }, body: { priority: 'high' }, status: 201 })),
  ...group(['POST /api/projects/:projectId/site-reports', 'POST /api/v1/daily-reports/:projectId'], async ctx => ({
    params: { projectId: ctx.pid }, body: { report_date: nextDate(), work_summary: 'r02 summary' }, headers: idem(ctx), status: 201,
  })),
  ...group(['PUT /api/projects/:projectId/site-reports/:id', 'PUT /api/v1/daily-reports/:projectId/:id'], async ctx => {
    const r = await report(ctx);
    return { params: { projectId: ctx.pid, id: r.id }, body: { work_summary: 'r02 edited', workers_count: 3 } };
  }),
  ...group(['POST /api/projects/:projectId/instructions'], async ctx => ({ params: { projectId: ctx.pid }, body: { title: `r02 instruction ${ctx.n()}` }, status: 201 })),
  ...group(['PUT /api/projects/:projectId/instructions/:id'], async ctx => ({ params: { projectId: ctx.pid, id: (await instruction(ctx)).id }, body: { description: 'r02 edited' } })),
  ...group(['POST /api/projects/:projectId/site-visits', 'POST /api/v1/site-visits/:projectId'], async ctx => ({
    params: { projectId: ctx.pid }, body: { visit_date: '2026-10-14', visitor_name: `r02 visitor ${ctx.n()}` }, status: 201,
  })),
  ...group(['PUT /api/projects/:projectId/site-visits/:id', 'PUT /api/v1/site-visits/:projectId/:id'], async ctx => ({
    params: { projectId: ctx.pid, id: (await visit(ctx)).id }, body: { notes: 'r02 edited' },
  })),
  ...group(['DELETE /api/projects/:projectId/site-visits/:id', 'DELETE /api/v1/site-visits/:projectId/:id'], async ctx => ({
    params: { projectId: ctx.pid, id: (await visit(ctx)).id },
  })),
};
