'use strict';

const { group } = require('./util');
const { world, mir } = require('./proc-flow');

const test = ctx => ctx.api('POST', '/api/qhse/quality-tests', { project_id: ctx.pid, test_type: `r02 slump ${ctx.n()}` });
const ncr = ctx => ctx.api('POST', '/api/qhse/ncrs', { project_id: ctx.pid, description: `r02 ncr ${ctx.n()}` });
const incident = ctx => ctx.api('POST', '/api/qhse/incidents', { project_id: ctx.pid, description: `r02 incident ${ctx.n()}` });
const inspection = ctx => ctx.api('POST', '/api/qhse/inspections', { project_id: ctx.pid });
const itp = ctx => ctx.api('POST', '/api/qhse/itps', { project_id: ctx.pid, title: `r02 itp ${ctx.n()}` });
const template = ctx => ctx.api('POST', '/api/qhse/checklists/templates', { name: `r02 template ${ctx.n()}`, items: [{ item: 'check' }] });
const instance = ctx => ctx.api('POST', '/api/qhse/checklists/instances', { project_id: ctx.pid, title: `r02 checklist ${ctx.n()}` });
const action = ctx => ctx.api('POST', '/api/qhse/actions', { project_id: ctx.pid, description: `r02 action ${ctx.n()}` });
const mockUp = ctx => ctx.api('POST', '/api/qhse/mock-ups', { project_id: ctx.pid, title: `r02 mock-up ${ctx.n()}` });

module.exports = {
  ...group(['POST /api/qhse/quality-tests'], async ctx => ({ body: { project_id: ctx.pid, test_type: `r02 slump ${ctx.n()}` }, status: 201 })),
  ...group(['PUT /api/qhse/quality-tests/:id'], async ctx => ({ params: { id: (await test(ctx)).id }, body: { result: 'pass' } })),
  ...group(['DELETE /api/qhse/quality-tests/:id'], async ctx => ({ params: { id: (await test(ctx)).id } })),
  ...group(['POST /api/qhse/ncrs', 'POST /api/v1/ncrs'], async ctx => ({ body: { project_id: ctx.pid, description: `r02 ncr ${ctx.n()}` }, status: 201 })),
  ...group(['PUT /api/qhse/ncrs/:id', 'PUT /api/v1/ncrs/:id'], async ctx => ({ params: { id: (await ncr(ctx)).id }, body: { severity: 'major' } })),
  ...group(['POST /api/qhse/incidents'], async ctx => ({ body: { project_id: ctx.pid, description: `r02 incident ${ctx.n()}` }, status: 201 })),
  ...group(['PUT /api/qhse/incidents/:id'], async ctx => ({ params: { id: (await incident(ctx)).id }, body: { corrective_action: 'r02' } })),
  ...group(['POST /api/qhse/inspections', 'POST /api/v1/inspections'], async ctx => ({ body: { project_id: ctx.pid }, status: 201 })),
  ...group(['PUT /api/qhse/inspections/:id', 'PUT /api/v1/inspections/:id'], async ctx => ({ params: { id: (await inspection(ctx)).id }, body: { status: 'passed' } })),
  ...group(['POST /api/qhse/itps'], async ctx => ({ body: { project_id: ctx.pid, title: `r02 itp ${ctx.n()}` }, status: 201 })),
  ...group(['PUT /api/qhse/itps/:id'], async ctx => ({ params: { id: (await itp(ctx)).id }, body: { status: 'active' } })),
  ...group(['POST /api/qhse/itps/:id/points'], async ctx => ({ params: { id: (await itp(ctx)).id }, body: { title: `r02 point ${ctx.n()}` }, status: 201 })),
  ...group(['POST /api/qhse/checklists/templates'], async ctx => ({ body: { name: `r02 template ${ctx.n()}`, items: [{ item: 'check' }] }, status: 201 })),
  ...group(['POST /api/qhse/checklists/instances'], async ctx => ({ body: { project_id: ctx.pid, template_id: (await template(ctx)).id }, status: 201 })),
  ...group(['PUT /api/qhse/checklists/instances/:id'], async ctx => ({ params: { id: (await instance(ctx)).id }, body: { complete: true } })),
  ...group(['POST /api/qhse/actions'], async ctx => ({ body: { project_id: ctx.pid, description: `r02 action ${ctx.n()}` }, status: 201 })),
  ...group(['POST /api/qhse/actions/:id/status'], async ctx => ({ params: { id: (await action(ctx)).id }, body: { status: 'in_progress' } })),
  ...group(['POST /api/qhse/mock-ups'], async ctx => ({ body: { project_id: ctx.pid, title: `r02 mock-up ${ctx.n()}` }, status: 201 })),
  ...group(['POST /api/qhse/mock-ups/:id/status'], async ctx => ({ params: { id: (await mockUp(ctx)).id }, body: { status: 'under_review' } })),
  ...group(['PUT /api/qhse/mirs/:id'], async ctx => ({ params: { id: (await mir(ctx, await world(ctx))).id }, body: { notes: 'r02 edited' } })),
  ...group(['POST /api/qhse/mirs/:id/workflow'], async ctx => ({ params: { id: (await mir(ctx, await world(ctx))).id }, body: {}, status: 201 })),
  ...group(['POST /api/qhse/mirs/:id/workflow/decision'], async ctx => {
    const m = await mir(ctx, await world(ctx));
    await ctx.api('POST', `/api/qhse/mirs/${m.id}/workflow`, {}, [200, 201]);
    return { params: { id: m.id }, body: { result: 'accepted' } };
  }),
};
