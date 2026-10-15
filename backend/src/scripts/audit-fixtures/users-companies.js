'use strict';
const { group } = require('./util');
const companyBody = ctx => ({ code: `r02-company-${ctx.n()}`, name_en: 'R02 company', name_ar: 'R02 company' });
const company = ctx => ctx.api('POST', '/api/clients', companyBody(ctx), [201]);
const user = ctx => ctx.actor('engineer');
module.exports = {
  ...group(['POST /api/v1/companies'], async ctx => ({ body: companyBody(ctx), status: 201 })),
  ...group(['PUT /api/v1/companies/:id'], async ctx => ({ params: { id: (await company(ctx)).id }, body: { city: 'R02 Cairo' } })),
  ...group(['DELETE /api/v1/companies/:id'], async ctx => ({ params: { id: (await company(ctx)).id } })),
  ...group(['PUT /api/users/:id', 'PUT /api/v1/users/:id'], async ctx => ({ params: { id: (await user(ctx)).userId }, body: { department: 'R02 updated' } })),
  ...group(['DELETE /api/users/:id'], async ctx => ({ params: { id: (await user(ctx)).userId } })),
};
