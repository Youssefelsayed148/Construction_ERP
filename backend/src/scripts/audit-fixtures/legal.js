'use strict';
const { group } = require('./util');
const body = ctx => ({ title: `r02 legal ${ctx.n()}`, document_type: 'contract', project_id: ctx.pid, description: 'r02 legal audit fixture' });
const document = ctx => ctx.api('POST', '/api/legal', body(ctx));
module.exports = {
  ...group(['POST /api/legal'], async ctx => ({ body: body(ctx), status: 201 })),
  ...group(['PUT /api/legal/:id'], async ctx => ({ params: { id: (await document(ctx)).id }, body: { description: 'r02 updated legal fixture' } })),
  ...group(['DELETE /api/legal/:id'], async ctx => ({ params: { id: (await document(ctx)).id } })),
};
