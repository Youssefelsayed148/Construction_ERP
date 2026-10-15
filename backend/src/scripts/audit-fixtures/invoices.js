'use strict';
const { group } = require('./util');
let sharedPromise;
const shared = ctx => sharedPromise ||= ctx.one('INSERT INTO clients (name_en, name_ar) VALUES ($1, $1) RETURNING id, CURRENT_DATE::text AS day', [`r02-invoice-${ctx.n()}`]);
const body = async ctx => { const client = await shared(ctx); return { project_id: ctx.pid, client_id: client.id, amount: 100, issue_date: client.day, description: 'r02 invoice' }; };
const invoice = async ctx => ctx.api('POST', '/api/invoices', await body(ctx));
module.exports = {
  ...group(['POST /api/invoices', 'POST /api/v1/invoices'], async ctx => ({ body: await body(ctx), status: 201 })),
  ...group(['PUT /api/invoices/:id', 'PUT /api/v1/invoices/:id'], async ctx => ({ params: { id: (await invoice(ctx)).id }, body: { description: 'r02 revised invoice' } })),
  ...group(['DELETE /api/invoices/:id'], async ctx => ({ params: { id: (await invoice(ctx)).id }, body: { reason: 'r02 correction' } })),
};
