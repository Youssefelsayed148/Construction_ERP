'use strict';

const { group } = require('./util');

let year = 2100;
const period = ctx => ctx.api('POST', '/api/payroll', { month: 1 + (++year % 12), year });

module.exports = {
  ...group(['POST /api/payroll'], async () => ({ body: { month: 1 + (++year % 12), year }, status: 201 })),
  ...group(['PUT /api/payroll/:id'], async ctx => ({ params: { id: (await period(ctx)).id }, body: { status: 'approved' } })),
  // The API includes every active employee, including other suites' rows.
  // Migration 0010 deliberately restricts deleting periods with payroll details.
  // A successful hard-delete fixture must therefore own an empty draft period.
  ...group(['DELETE /api/payroll/:id'], async ctx => ({ params: { id: (await ctx.one(
    "INSERT INTO payroll_periods (period_name, month, year, total_employees, total_basic_salary, total_net_salary, created_by) VALUES ($1, $2, $3, 0, 0, 0, $4) RETURNING id",
    [`r02-empty-${ctx.n()}`, 1 + (++year % 12), year, ctx.owner.id]
  )).id } })),
};
