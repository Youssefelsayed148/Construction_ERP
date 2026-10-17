'use strict';

const { assertDemoTarget } = require('./company-demo-common');
const TARGET = Object.freeze({ projectName: 'erp-demo-20261017', baseUrl: 'http://127.0.0.1:8092',
  dbName: 'construction_erp_demo', dbHost: '127.0.0.1', dbPort: '55442' });

function listRows(response, route) {
  if (response.status !== 200 || !Array.isArray(response.body?.data)) throw new Error(`Demo list ${route}: HTTP ${response.status}`);
  return response.body.data;
}

async function ensureHrRecord({ request, account, listPath, createPath, key, keyField, body, match }) {
  if (typeof request !== 'function' || !account || !listPath || !createPath || !key || !keyField || body?.[keyField] !== key) {
    throw new Error('Refusing demo: invalid HR stable key');
  }
  const rows = listRows(await request(account, listPath), listPath);
  const found = rows.filter(row => match ? match(row) : row?.[keyField] === key);
  if (found.length > 1) throw new Error('Refusing demo: ambiguous HR stable key');
  if (found.length === 1) return { row: found[0], created: false };
  const response = await request(account, createPath, { method: 'POST', body });
  if (response.status !== 201 || !response.body?.data) throw new Error(`Demo create ${createPath}: HTTP ${response.status}`);
  return { row: response.body.data, created: true };
}

async function seedHr({ target, request, accounts, projects }) {
  assertDemoTarget(target);
  const account = key => {
    const row = accounts.find(item => item.key === key);
    if (!row) throw new Error(`Refusing demo: missing role account ${key}`);
    return row;
  };
  const owner = account('workflow_owner');
  const hr = account('hr_manager');
  const finance = account('finance_manager');
  const byProject = projects.slice().sort((a, b) => a.code.localeCompare(b.code));
  if (byProject.length !== 3) throw new Error('Refusing demo: HR project masters are incomplete');
  const counts = {};
  const bump = key => { counts[key] = (counts[key] || 0) + 1; };
  const employees = [];
  for (let index = 1; index <= 25; index += 1) {
    const code = `DEMO-EMP-${String(index).padStart(3, '0')}`;
    const body = { code, name_ar: `موظف تجريبي ${String(index).padStart(2, '0')}`,
      name_en: `Demo Employee ${String(index).padStart(2, '0')}`, phone: `+20100000${String(index).padStart(4, '0')}`,
      email: `demo-employee-${String(index).padStart(2, '0')}@demo.example.com`, national_id: `DEMO-NID-${String(index).padStart(4, '0')}`,
      department: ['Construction', 'Engineering', 'Safety', 'Commercial', 'Finance'][index % 5],
      designation: ['Engineer', 'Supervisor', 'Technician', 'Coordinator', 'Accountant'][index % 5],
      hire_date: '2026-02-01', salary: 12000 + index * 500, is_manager: index % 8 === 0 };
    const result = await ensureHrRecord({ request, account: owner, listPath: '/api/hr/employees?limit=200',
      createPath: '/api/hr/employees', key: code, keyField: 'code', body });
    if (result.created) bump('employees');
    employees.push(result.row);
  }
  for (let index = 0; index < employees.length; index += 1) {
    const employee = employees[index];
    const date = '2026-02-16';
    const body = { employee_id: employee.id, date,
      status: index % 13 === 0 ? 'late' : (index % 17 === 0 ? 'absent' : 'present'),
      check_in: index % 13 === 0 ? '08:25' : '08:00', check_out: '17:00', notes: `DEMO-ATT-${String(index + 1).padStart(3, '0')}` };
    const result = await ensureHrRecord({ request, account: hr,
      listPath: `/api/hr/attendance?employee_id=${employee.id}&date=${date}&limit=50`,
      createPath: '/api/hr/attendance', key: date, keyField: 'date',
      match: row => Number(row.employee_id) === Number(employee.id) && String(row.date).slice(0, 10) === date, body });
    if (result.created) bump('attendance');
  }
  const leavePlans = [
    { index: 0, status: 'approved' }, { index: 4, status: 'approved' },
    { index: 9, status: 'pending' }, { index: 16, status: 'pending' },
  ];
  for (let i = 0; i < leavePlans.length; i += 1) {
    const plan = leavePlans[i]; const employee = employees[plan.index];
    const reason = `DEMO-LEAVE-${String(i + 1).padStart(3, '0')}`;
    const body = { employee_id: employee.id, leave_type: i % 2 ? 'annual' : 'sick',
      start_date: `2026-03-${String(10 + i * 3).padStart(2, '0')}`,
      end_date: `2026-03-${String(11 + i * 3).padStart(2, '0')}`, reason };
    const result = await ensureHrRecord({ request, account: hr,
      listPath: `/api/hr/leaves?employee_id=${employee.id}&limit=50`, createPath: '/api/hr/leaves',
      key: reason, keyField: 'reason', body });
    if (result.created) bump('leave_requests');
    const leave = result.row;
    if (plan.status === 'approved' && leave.status === 'pending') {
      const approved = await request(owner, `/api/hr/leaves/${leave.id}`, { method: 'PUT', body: { status: 'approved' } });
      if (approved.status !== 200) throw new Error(`Demo approve /api/hr/leaves/${leave.id}: HTTP ${approved.status}`);
      bump('leave_approvals');
    }
  }
  for (let index = 0; index < 3; index += 1) {
    const project = byProject[index];
    const person = `Demo Employee ${String(index + 1).padStart(2, '0')}`;
    const body = { project_id: project.id, person_name: person, induction_date: '2026-02-10',
      induction_type: index === 0 ? 'general' : 'site', trainer: 'Demo HSE Officer', valid_until: '2027-02-10',
      notes: `DEMO-IND-${String(index + 1).padStart(3, '0')}` };
    const result = await ensureHrRecord({ request, account: owner,
      listPath: `/api/hse/inductions?project_id=${project.id}&limit=100`, createPath: '/api/hse/inductions',
      key: person, keyField: 'person_name', body });
    if (result.created) bump('inductions');
  }
  const payrollBody = { period_name: 'DEMO-PAYROLL-2026-02', month: 2, year: 2026 };
  const payroll = await ensureHrRecord({ request, account: finance,
    listPath: '/api/payroll?month=2&year=2026&limit=100', createPath: '/api/payroll',
    key: payrollBody.period_name, keyField: 'period_name', body: payrollBody });
  if (payroll.created) bump('payroll_periods');
  const details = await request(finance, `/api/payroll/${payroll.row.id}`);
  if (details.status !== 200 || !Array.isArray(details.body?.data?.details)) throw new Error(`Demo list /api/payroll/${payroll.row.id}: HTTP ${details.status}`);
  return { stage: 'hr', created: Object.values(counts).reduce((sum, value) => sum + value, 0), counts,
    payroll: { period_name: payrollBody.period_name, month: 2, year: 2026, employees: payroll.row.total_employees,
      payroll_lines: details.body.data.details.length }, employee_codes: employees.map(row => row.code) };
}

module.exports = { TARGET, ensureHrRecord, seedHr };
