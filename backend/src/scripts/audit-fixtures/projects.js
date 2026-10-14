'use strict';

const { group } = require('./util');

const employee = ctx => ctx.api('POST', '/api/hr/employees', { name_ar: `موظف ${ctx.n()}`, name_en: 'r02 employee', salary: 1000 });
const phase = ctx => ctx.api('POST', `/api/projects/${ctx.pid}/phases`, { name_ar: `مرحلة ${ctx.n()}`, sort_order: 1 });
const milestone = ctx => ctx.api('POST', `/api/projects/${ctx.pid}/milestones`, { title_ar: `معلم ${ctx.n()}`, target_date: '2026-12-01' });
const member = async ctx => ctx.api('POST', `/api/projects/${ctx.pid}/team`, { employee_id: (await employee(ctx)).id, role: 'site_engineer' });
const newProject = ctx => ({ name_ar: `مشروع ${ctx.n()}`, name_en: `r02 project ${ctx.n()}` });

module.exports = {
  ...group(['POST /api/projects', 'POST /api/v1/projects', 'POST /api/projects/wizard'], async ctx => ({ body: newProject(ctx), status: 201 })),
  ...group(['PUT /api/projects/:id', 'PUT /api/v1/projects/:id'], async ctx => ({ params: { id: ctx.pid }, body: { city: `City ${ctx.n()}` } })),
  ...group(['POST /api/projects/:id/phases', 'POST /api/v1/projects/:id/phases'], async ctx => ({ params: { id: ctx.pid }, body: { name_ar: `مرحلة ${ctx.n()}`, sort_order: 1 }, status: 201 })),
  ...group(['PUT /api/projects/:projectId/phases/:phaseId', 'PUT /api/v1/projects/:projectId/phases/:phaseId'], async ctx => ({
    params: { projectId: ctx.pid, phaseId: (await phase(ctx)).id }, body: { status: 'active' },
  })),
  ...group(['DELETE /api/projects/:projectId/phases/:phaseId', 'DELETE /api/v1/projects/:projectId/phases/:phaseId'], async ctx => ({
    params: { projectId: ctx.pid, phaseId: (await phase(ctx)).id },
  })),
  ...group(['POST /api/projects/:id/team', 'POST /api/v1/projects/:id/participants'], async ctx => ({
    params: { id: ctx.pid }, body: { employee_id: (await employee(ctx)).id, role: 'site_engineer' }, status: 201,
  })),
  ...group(['DELETE /api/projects/:projectId/team/:teamId', 'DELETE /api/v1/projects/:projectId/participants/:teamId'], async ctx => ({
    params: { projectId: ctx.pid, teamId: (await member(ctx)).id },
  })),
  ...group(['POST /api/projects/:id/milestones', 'POST /api/v1/projects/:id/milestones'], async ctx => ({
    params: { id: ctx.pid }, body: { title_ar: `معلم ${ctx.n()}`, target_date: '2026-12-01' }, status: 201,
  })),
  ...group(['PUT /api/projects/:projectId/milestones/:milestoneId', 'PUT /api/v1/projects/:projectId/milestones/:milestoneId'], async ctx => ({
    params: { projectId: ctx.pid, milestoneId: (await milestone(ctx)).id }, body: { status: 'achieved' },
  })),
  ...group(['DELETE /api/projects/:projectId/milestones/:milestoneId', 'DELETE /api/v1/projects/:projectId/milestones/:milestoneId'], async ctx => ({
    params: { projectId: ctx.pid, milestoneId: (await milestone(ctx)).id },
  })),
};
