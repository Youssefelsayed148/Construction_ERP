'use strict';
const { group } = require('./util');
const body = ctx => ({ code: `r02-client-${ctx.n()}`, name_en: 'r02 client', name_ar: 'r02 client' });
const client = ctx => ctx.api('POST', '/api/clients', body(ctx));
module.exports = {
  ...group(['POST /api/clients'], async ctx => ({ body: body(ctx), status: 201 })),
  ...group(['PUT /api/clients/:id'], async ctx => ({ params: { id: (await client(ctx)).id }, body: { city: 'r02 Cairo' } })),
  ...group(['DELETE /api/clients/:id'], async ctx => ({ params: { id: (await client(ctx)).id } })),
};
