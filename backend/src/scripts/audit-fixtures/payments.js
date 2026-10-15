'use strict';
const { group } = require('./util');
const paymentBody = async ctx => {
  const client = await ctx.one('INSERT INTO clients (code, name_en, name_ar) VALUES ($1, $1, $1) RETURNING id', [`r02-payment-client-${ctx.n()}`]);
  return { project_id: ctx.pid, client_id: client.id, direction: 'ar', amount: 1, payment_date: '2026-10-15', payment_method: 'cash', reference_number: `r02-${ctx.n()}` };
};
const payment = async ctx => ctx.api('POST', '/api/payments', await paymentBody(ctx), [201]);
module.exports = {
  ...group(['POST /api/payments', 'POST /api/v1/payments'], async ctx => ({ body: await paymentBody(ctx), status: 201 })),
  ...group(['DELETE /api/payments/:id'], async ctx => ({ params: { id: (await payment(ctx)).id }, body: { reason: 'r02 audit fixture void' } })),
};
