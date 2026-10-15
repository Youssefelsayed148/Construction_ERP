'use strict';
const { group } = require('./util');
const body = ctx => ({ category: 'office', description: `r02 expense ${ctx.n()}`, amount: 25, project_id: ctx.pid });
const unpostedExpense = async ctx => (await ctx.one(
  "INSERT INTO expenses (category, description, amount, project_id, status, created_by) VALUES ('office', $1, 25, $2, 'pending', $3) RETURNING id",
  [`r02 unposted expense ${ctx.n()}`, ctx.pid, ctx.owner.id]
)).id;
module.exports = {
  ...group(['POST /api/expenses'], async ctx => ({ body: body(ctx), status: 201 })),
  ...group(['PUT /api/expenses/:id'], async ctx => ({ params: { id: await unpostedExpense(ctx) }, body: { notes: 'r02 audit fixture' } })),
  ...group(['DELETE /api/expenses/:id'], async ctx => ({ params: { id: await unpostedExpense(ctx) } })),
};
