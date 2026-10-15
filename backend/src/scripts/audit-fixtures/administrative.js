'use strict';

const { group } = require('./util');

const teamBody = async ctx => ({ project_id: ctx.pid, user_id: (await ctx.actor('engineer')).userId, role_key: 'engineer' });
const delegation = async ctx => {
  const delegate = await ctx.actor('engineer');
  return ctx.api('POST', '/api/delegations', { delegate_user_id: delegate.userId, module_scope: '*', valid_to: '2026-11-15', notes: 'R02 fixture' }, [201]);
};

module.exports = {
  ...group(['POST /api/team'], async ctx => ({ body: await teamBody(ctx), status: 201 })),
  ...group(['DELETE /api/team/:userProjectRoleId'], async ctx => {
    const assigned = await ctx.api('POST', '/api/organizations/team', await teamBody(ctx), [201]);
    return { params: { userProjectRoleId: assigned.assignment.id }, body: {} };
  }),
  ...group(['POST /api/delegations'], async ctx => ({
    body: { delegate_user_id: (await ctx.actor('engineer')).userId, module_scope: '*', valid_to: '2026-11-15', notes: 'R02 fixture' }, status: 201,
  })),
  ...group(['POST /api/delegations/:id/deactivate'], async ctx => ({ params: { id: (await delegation(ctx)).id }, body: {} })),
  ...group(['POST /api/reports/saved-views'], async ctx => ({ body: { module: 'projects', name: `r02 saved view ${ctx.n()}` }, status: 201 })),
  ...group(['POST /api/reports/scheduled'], async ctx => ({ body: { project_id: ctx.pid, report_key: 'projects', name: `r02 scheduled report ${ctx.n()}` }, status: 201 })),
};
