'use strict';

const { group } = require('./util');

const employee = ctx => ctx.api('POST', '/api/hr/employees', { name_ar: `موظف ${ctx.n()}`, name_en: 'r02 employee', salary: 1000 });
const laborer = ctx => ctx.api('POST', '/api/hr/laborers', { full_name: `عامل ${ctx.n()}`, daily_rate: 100 });
// Deletion exercises a legacy/unposted payment; API creation queues its cost
// posting atomically and must therefore refuse deletion.
const laborPayment = async ctx => ctx.one('INSERT INTO labor_payments (project_id, laborer_id, days_worked, daily_rate, total_amount) VALUES ($1, $2, 1, 100, 100) RETURNING *', [ctx.pid, (await laborer(ctx)).id]);
let day = 0;
const date = () => `2031-${String(1 + (day % 12)).padStart(2, '0')}-${String(1 + (Math.floor(day++ / 12) % 28)).padStart(2, '0')}`;

module.exports = {
  ...group(['POST /api/hr/employees'], async ctx => ({ body: { name_ar: `موظف ${ctx.n()}`, name_en: 'r02 employee', salary: 1000 }, status: 201 })),
  ...group(['PUT /api/hr/employees/:id'], async ctx => ({ params: { id: (await employee(ctx)).id }, body: { designation: 'Engineer' } })),
  ...group(['DELETE /api/hr/employees/:id'], async ctx => ({ params: { id: (await employee(ctx)).id } })),
  ...group(['POST /api/hr/attendance'], async ctx => ({ body: { employee_id: (await employee(ctx)).id, date: date(), status: 'present' }, status: 201 })),
  ...group(['POST /api/hr/leaves'], async ctx => ({ body: { employee_id: (await employee(ctx)).id, start_date: '2026-11-01', end_date: '2026-11-03' }, status: 201 })),
  ...group(['PUT /api/hr/leaves/:id'], async ctx => {
    const leave = await ctx.api('POST', '/api/hr/leaves', { employee_id: (await employee(ctx)).id, start_date: '2026-11-01', end_date: '2026-11-03' });
    return { params: { id: leave.id }, body: { status: 'approved' } };
  }),
  ...group(['POST /api/hr/laborers'], async ctx => ({ body: { full_name: `عامل ${ctx.n()}`, daily_rate: 100 }, status: 201 })),
  ...group(['PUT /api/hr/laborers/:id'], async ctx => ({ params: { id: (await laborer(ctx)).id }, body: { daily_rate: 120 } })),
  ...group(['DELETE /api/hr/laborers/:id'], async ctx => ({ params: { id: (await laborer(ctx)).id } })),
  ...group(['POST /api/hr/labor-payments'], async ctx => ({
    body: { project_id: ctx.pid, laborer_id: (await laborer(ctx)).id, payment_date: '2026-10-14', days_worked: 2, daily_rate: 100 }, status: 201,
  })),
  ...group(['DELETE /api/hr/labor-payments/:id'], async ctx => ({ params: { id: (await laborPayment(ctx)).id } })),
};
