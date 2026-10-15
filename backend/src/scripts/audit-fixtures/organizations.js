'use strict';
const { group } = require('./util');
let sharedPromise;
const orgBody = ctx => ({ code: `r02-org-${ctx.n()}`, org_type: 'other', name_en: 'r02 organization', name_ar: 'جهة الاختبار' });
const departmentBody = ctx => ({ code: `r02-dept-${ctx.n()}`, name_en: 'r02 department', name_ar: 'قسم الاختبار' });
const shared = ctx => sharedPromise ||= (async () => ({ org: await ctx.api('POST', '/api/organizations', orgBody(ctx)), department: await ctx.api('POST', '/api/organizations/departments', departmentBody(ctx)), member: await ctx.actor('engineer') }))();
const bank = async ctx => ctx.api('POST', '/api/organizations/bank-accounts', { organization_id: (await shared(ctx)).org.id, bank_name: 'r02 mock bank', account_no: `r02-${ctx.n()}` });
const positionBody = async ctx => ({ code: `r02-job-${ctx.n()}`, department_id: (await shared(ctx)).department.id, name_en: 'r02 engineer', name_ar: 'مهندس الاختبار' });
const teamBody = async ctx => ({ project_id: ctx.pid, user_id: (await ctx.actor('engineer')).userId, role_key: 'engineer' });
const entry = (method, path, setup) => group([`${method} /api/organizations${path}`], setup);
module.exports = {
  ...entry('POST', '', async ctx => ({ body: orgBody(ctx), status: 201 })),
  ...entry('PUT', '/:id', async ctx => ({ params: { id: (await ctx.api('POST', '/api/organizations', orgBody(ctx))).id }, body: { city: 'r02 Cairo' } })),
  ...entry('POST', '/:id/deactivate', async ctx => ({ params: { id: (await ctx.api('POST', '/api/organizations', orgBody(ctx))).id } })),
  ...entry('POST', '/company', async ctx => ({ body: { legal_name_en: `r02 company ${ctx.n()}`, legal_name_ar: 'شركة الاختبار', currency: 'EGP' }, status: 201 })),
  ...entry('POST', '/departments', async ctx => ({ body: { ...departmentBody(ctx), parent_department_id: (await shared(ctx)).department.id }, status: 201 })),
  ...entry('PUT', '/departments/:id', async ctx => ({ params: { id: (await ctx.api('POST', '/api/organizations/departments', departmentBody(ctx))).id }, body: { name_en: 'r02 revised', name_ar: 'قسم معدل' } })),
  ...entry('POST', '/job-positions', async ctx => ({ body: await positionBody(ctx), status: 201 })),
  ...entry('PUT', '/job-positions/:id', async ctx => ({ params: { id: (await ctx.api('POST', '/api/organizations/job-positions', await positionBody(ctx))).id }, body: { grade: 'r02 senior' } })),
  ...entry('POST', '/qualifications', async ctx => ({ body: { user_id: (await shared(ctx)).member.userId, name_en: 'r02 qualification', name_ar: 'مؤهل الاختبار', issuer: ctx.n() }, status: 201 })),
  ...entry('DELETE', '/qualifications/:id', async ctx => ({ params: { id: (await ctx.api('POST', '/api/organizations/qualifications', { user_id: (await shared(ctx)).member.userId, name_en: 'r02 qualification', name_ar: 'مؤهل الاختبار', issuer: ctx.n() })).id } })),
  ...entry('POST', '/bank-accounts', async ctx => ({ body: { organization_id: (await shared(ctx)).org.id, bank_name: 'r02 mock bank', account_no: `r02-${ctx.n()}`, is_primary: true }, status: 201 })),
  ...entry('PUT', '/bank-accounts/:id', async ctx => ({ params: { id: (await bank(ctx)).id }, body: { bank_name: 'r02 revised mock bank' } })),
  ...entry('POST', '/bank-accounts/:id/make-primary', async ctx => ({ params: { id: (await bank(ctx)).id }, body: { organization_id: (await shared(ctx)).org.id } })),
  ...entry('POST', '/performance-scores', async ctx => ({ body: { organization_id: (await shared(ctx)).org.id, period: ctx.n().slice(-20), score: 80 }, status: 201 })),
  ...entry('POST', '/team', async ctx => ({ body: await teamBody(ctx), status: 201 })),
  ...entry('DELETE', '/team/:userProjectRoleId', async ctx => ({ params: { userProjectRoleId: (await ctx.api('POST', '/api/organizations/team', await teamBody(ctx))).assignment.id } })),
};
