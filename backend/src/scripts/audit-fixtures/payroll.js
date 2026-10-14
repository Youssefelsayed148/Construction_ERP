'use strict';

const { group } = require('./util');

let year = 2100;
const period = ctx => ctx.api('POST', '/api/payroll', { month: 1 + (++year % 12), year });

module.exports = {
  ...group(['POST /api/payroll'], async () => ({ body: { month: 1 + (++year % 12), year }, status: 201 })),
  ...group(['PUT /api/payroll/:id'], async ctx => ({ params: { id: (await period(ctx)).id }, body: { status: 'approved' } })),
  ...group(['DELETE /api/payroll/:id'], async ctx => ({ params: { id: (await period(ctx)).id } })),
};
