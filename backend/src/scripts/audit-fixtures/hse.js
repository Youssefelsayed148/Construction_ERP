'use strict';

const { group } = require('./util');

const incident = ctx => ctx.api('POST', '/api/hse/incidents', { project_id: ctx.pid, description: `r02 incident ${ctx.n()}` });
const inspection = ctx => ctx.api('POST', '/api/hse/inspections', { project_id: ctx.pid });
const jsa = ctx => ctx.api('POST', '/api/hse/jsas', { project_id: ctx.pid, title: `r02 jsa ${ctx.n()}` });
const nearMiss = ctx => ctx.api('POST', '/api/hse/near-misses', { project_id: ctx.pid, description: `r02 near miss ${ctx.n()}` });
const permitBody = ctx => ({ project_id: ctx.pid, title: `r02 permit ${ctx.n()}` });
const permit = ctx => ctx.api('POST', '/api/hse/permits', permitBody(ctx));
const submittedPermit = async ctx => { const row = await permit(ctx); await ctx.api('POST', `/api/hse/permits/${row.id}/submit`, {}); return row; };
const riskBody = ctx => ({ project_id: ctx.pid, title: `r02 risk ${ctx.n()}` });

module.exports = {
  ...group(['POST /api/hse/permits'], async ctx => ({ body: permitBody(ctx), status: 201 })),
  ...group(['POST /api/hse/permits/:id/submit'], async ctx => ({ params: { id: (await permit(ctx)).id } })),
  ...group(['POST /api/hse/permits/:id/decision'], async ctx => ({ params: { id: (await submittedPermit(ctx)).id }, body: { decision: 'approve' } })),
  ...group(['POST /api/hse/permits/:id/status'], async ctx => ({ params: { id: (await submittedPermit(ctx)).id }, body: { status: 'rejected' } })),
  ...group(['POST /api/hse/risk-assessments'], async ctx => ({ body: riskBody(ctx), status: 201 })),
  ...group(['POST /api/hse/risk-assessments/:id/status'], async ctx => ({ params: { id: (await ctx.api('POST', '/api/hse/risk-assessments', riskBody(ctx))).id }, body: { status: 'reviewed' } })),
  ...group(['POST /api/hse/toolbox-talks'], async ctx => ({ body: { project_id: ctx.pid, title: `r02 toolbox ${ctx.n()}`, attendees: ['r02 attendee'] }, status: 201 })),
  ...group(['POST /api/hse/incidents'], async ctx => ({ body: { project_id: ctx.pid, description: `r02 incident ${ctx.n()}` }, status: 201 })),
  ...group(['PUT /api/hse/incidents/:id'], async ctx => ({ params: { id: (await incident(ctx)).id }, body: { corrective_action: 'r02 action' } })),
  ...group(['POST /api/hse/incidents/:id/status'], async ctx => ({ params: { id: (await incident(ctx)).id }, body: { status: 'investigating' } })),
  ...group(['POST /api/hse/inspections', 'POST /api/v1/inspections/safety'], async ctx => ({ body: { project_id: ctx.pid }, status: 201 })),
  ...group(['PUT /api/hse/inspections/:id'], async ctx => ({ params: { id: (await inspection(ctx)).id }, body: { status: 'passed' } })),
  ...group(['POST /api/hse/jsas'], async ctx => ({ body: { project_id: ctx.pid, title: `r02 jsa ${ctx.n()}` }, status: 201 })),
  ...group(['POST /api/hse/jsas/:id/status'], async ctx => ({ params: { id: (await jsa(ctx)).id }, body: { status: 'reviewed' } })),
  ...group(['POST /api/hse/near-misses'], async ctx => ({ body: { project_id: ctx.pid, description: `r02 near miss ${ctx.n()}` }, status: 201 })),
  ...group(['POST /api/hse/near-misses/:id/status'], async ctx => ({ params: { id: (await nearMiss(ctx)).id }, body: { status: 'closed' } })),
  ...group(['POST /api/hse/inductions'], async ctx => ({ body: { project_id: ctx.pid, person_name: `r02 person ${ctx.n()}` }, status: 201 })),
  ...group(['POST /api/hse/ppe-records'], async ctx => ({ body: { project_id: ctx.pid, person_name: `r02 person ${ctx.n()}`, item: 'helmet' }, status: 201 })),
  ...group(['POST /api/hse/equipment-inspections'], async ctx => ({ body: { project_id: ctx.pid, equipment_name: `r02 crane ${ctx.n()}` }, status: 201 })),
  ...group(['POST /api/hse/emergency-drills'], async ctx => ({ body: { project_id: ctx.pid, drill_type: 'fire' }, status: 201 })),
};
