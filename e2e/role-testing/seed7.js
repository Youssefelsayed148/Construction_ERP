// Stage 7: HR / payroll, assets / maintenance, handover
const x = require('./seedlib');
const { S, act, actAs, check, readBack, snap, evidenceSince, idOf, sql, num, call, section } = x;
module.exports = async function stage7() {
  const P = S.project; const today = '2026-11-02';
  section('22. HR: laborer, attendance, leave (approve + reject), labour payment');
  S.lab = idOf('daily_laborers', 'full_name_en', 'DEMO-Laborer Hassan');
  if (!S.lab) { const s0 = snap(); const r = await act('hr_manager', 'POST', '/api/hr/laborers', { code: 'DEMO-LB-001', full_name: 'DEMO-عامل حسن', full_name_en: 'DEMO-Laborer Hassan', skill_category: 'general', daily_rate: 450, national_id: 'DEMO-NID-1' }, { label: 'hr_manager registers laborer' }); S.lab = r.data?.id; evidenceSince(s0, 'laborer'); }
  const emp = S.emp.site_engineer;
  if (sql(`select count(*) from attendance where employee_id=${emp} and date='${today}'`) === '0') await act('hr_manager', 'POST', '/api/hr/attendance', { employee_id: emp, date: today, status: 'present', check_in: '07:30', check_out: '16:00', notes: 'DEMO' }, { label: 'attendance recorded' });
  if (sql(`select count(*) from leave_requests where employee_id=${emp}`) === '0') {
    for (const [from, to, decision] of [['2026-12-10', '2026-12-12', 'approved'], ['2026-12-20', '2026-12-30', 'rejected']]) {
      const s0 = snap(); const r = await act('hr_manager', 'POST', '/api/hr/leaves', { employee_id: emp, leave_type: 'annual', start_date: from, end_date: to, reason: 'DEMO leave ' + decision }, { label: `leave request (${decision} path)` });
      await act('hr_manager', 'PUT', `/api/hr/leaves/${r.data?.id}`, { status: decision }, { label: `hr_manager ${decision} leave` });
      check(`leave ${decision}`, sql(`select status from leave_requests where id=${r.data?.id}`) === decision, sql(`select status from leave_requests where id=${r.data?.id}`), 'hr_manager', 'hr');
    }
  }
  if (sql(`select count(*) from labor_payments where project_id=${P}`) === '0') {
    const s0 = snap(); await act('hr_manager', 'POST', '/api/hr/labor-payments', { project_id: P, laborer_id: S.lab, payment_date: today, days_worked: 12, daily_rate: 450, paid_by: 'DEMO', notes: 'DEMO' }, { label: 'labour payment 12 days x 450' });
    check('labour cost = labor_payments.total_amount = 5,400', num(sql(`select coalesce(sum(total_amount),0) from labor_payments where project_id=${P}`)) === 5400, sql(`select coalesce(sum(total_amount),0) from labor_payments where project_id=${P}`), 'hr_manager', 'hr');
    const lc = num(sql(`select coalesce(sum(amount),0) from project_costs where project_id=${P} and source_type ilike '%labor%'`)); check('project labour cost posted from the payment', lc >= 5400 || sql(`select count(*) from project_costs where project_id=${P} and source_type like '%labor%'`) !== '0', `labor cost=${lc}`, 'hr_manager', 'costing');
    evidenceSince(s0, 'labour payment');
  }
  const emps = await call('site_engineer', 'GET', '/api/hr/employees');
  x.log.push({ role: 'site_engineer', module: 'hr', action: 'GET /api/hr/employees (salary visibility)', expected: 'denied or salary hidden', actual: `HTTP ${emps.status}`, result: emps.status === 403 || !JSON.stringify(emps.data || {}).includes('"salary"') ? 'PASS' : 'FAIL', evidence: '', section: 'HR', forbidden: true });

  section('23. payroll (approve + reject)');
  for (const [month, year, decision] of [[11, 2026, 'approved'], [12, 2026, 'rejected']]) {
    let id = Number(sql(`select id from payroll_periods where month=${month} and year=${year}`)) || null;
    if (!id) { const s0 = snap(); const r = await actAs(['hr_manager', 'finance_manager', 'workflow_owner'], 'POST', '/api/payroll', { period_name: `DEMO-Payroll ${year}-${month}`, month, year }, { label: `generate payroll ${year}-${month}` }); id = r.data?.id; evidenceSince(s0, 'payroll'); }
    if (id && sql(`select status from payroll_periods where id=${id}`) === 'draft') await actAs(['finance_manager', 'workflow_owner'], 'PUT', `/api/payroll/${id}`, { status: decision }, { label: `payroll ${year}-${month} ${decision}` });
    if (id) check(`payroll ${year}-${month} ${decision}`, sql(`select status from payroll_periods where id=${id}`) === decision, sql(`select status from payroll_periods where id=${id}`), 'finance_manager', 'payroll');
  }
  await act('site_engineer', 'POST', '/api/payroll', { month: 1, year: 2027 }, { expect: 403, forbidden: true, label: 'site_engineer generates payroll (forbidden)' });

  section('24. assets and maintenance (equipment_manager)');
  S.asset = idOf('assets', 'name_en', 'DEMO-Tower crane TC-01');
  if (!S.asset) { const s0 = snap(); const r = await act('equipment_manager', 'POST', '/api/assets', { code: 'DEMO-AST-001', name_ar: 'DEMO-رافعة برجية', name_en: 'DEMO-Tower crane TC-01', category: 'lifting', equipment_type: 'rented', manufacturer: 'DEMO', model: 'TC-5013', serial_number: 'DEMO-SN-1', purchase_cost: 0, hourly_rate: 600, daily_rate: 4000, current_project_id: P }, { label: 'create asset' }); S.asset = r.data?.id; evidenceSince(s0, 'asset'); }
  if (sql(`select count(*) from equipment_assignments where equipment_id=${S.asset}`) === '0') {
    await act('equipment_manager', 'POST', `/api/assets/${S.asset}/assignments`, { project_id: P, assigned_from: today, assigned_to: '2026-12-31' }, { label: 'assign asset to project' });
    await act('equipment_manager', 'POST', `/api/assets/${S.asset}/usage-logs`, { project_id: P, log_date: today, hours_operated: 8, fuel_liters: 40, notes: 'DEMO' }, { label: 'log usage 8h' });
  }
  S.mnt = idOf('maintenance_reminders', 'title', 'DEMO-Crane monthly inspection');
  if (!S.mnt) { const s0 = snap(); const r = await act('equipment_manager', 'POST', '/api/maintenance', { asset_id: S.asset, project_id: P, title: 'DEMO-Crane monthly inspection', description: 'DEMO', maintenance_type: 'preventive', priority: 'medium', scheduled_date: '2026-11-20', estimated_hours: 4, estimated_cost: 800, assigned_tech: 'DEMO tech' }, { label: 'schedule maintenance' }); S.mnt = r.data?.id; evidenceSince(s0, 'maintenance'); await act('equipment_manager', 'PUT', `/api/maintenance/${S.mnt}`, { status: 'completed', actual_hours: 3.5, actual_cost: 700 }, { label: 'complete maintenance' }); }
  await act('storekeeper', 'POST', '/api/assets', { name_ar: 'x', category: 'tool', equipment_type: 'owned' }, { expect: 403, forbidden: true, label: 'storekeeper creates asset (forbidden)' });

  section('25. handover (project_manager)');
  if (sql(`select count(*) from handover_processes where project_id=${P}`) === '0') {
    const s0 = snap(); await actAs(['project_manager'], 'POST', `/api/handover/process/${P}/start`, {}, { label: 'start handover' }); evidenceSince(s0, 'handover start');
  }
  const hp = Number(sql(`select id from handover_processes where project_id=${P} limit 1`));
  S.pkg = S.pkg || [];
  S.pkg = S.pkg.filter(Boolean); if (S.pkg.length === 0) for (const [t, title] of [['as_built_drawings', 'DEMO as-built drawings'], ['o_m_manuals', 'DEMO O&M manuals']]) { const r = await actAs(['project_manager', 'document_controller'], 'POST', `/api/handover/package/${P}/items`, { item_type: t, title, required: true }, { label: `handover package item ${t}` }); S.pkg.push(r.data?.id); }
  if (S.pkg[0]) {
    await actAs(['project_manager'], 'PUT', `/api/handover/package/items/${S.pkg[0]}`, { status: 'uploaded', notes: 'DEMO' }, { expect: [200, 400], label: 'package item uploaded' });
    await actAs(['project_manager'], 'POST', `/api/handover/package/items/${S.pkg[0]}/verify`, { status: 'approved', notes: 'DEMO verified' }, { expect: [200, 400, 409], label: 'project_manager verifies package item (approve)' });
    await actAs(['project_manager'], 'POST', `/api/handover/package/items/${S.pkg[1]}/verify`, { status: 'pending', notes: 'DEMO incomplete - rejected' }, { expect: [200, 400, 409], label: 'project_manager returns package item as pending (reject path)' });
  }
  if (sql(`select status from handover_processes where id=${hp}`) === 'pre_handover') await actAs(['project_manager'], 'POST', `/api/handover/process/${hp}/transition`, { status: 'punch_snag' }, { label: 'handover -> punch_snag' });
  check('handover process advanced beyond pre_handover', sql(`select status from handover_processes where id=${hp}`) !== 'pre_handover', sql(`select status from handover_processes where id=${hp}`), 'project_manager', 'handover');
  await act('client_executive', 'POST', `/api/handover/process/${hp}/transition`, { status: 'rectification' }, { expect: 403, forbidden: true, label: 'client_executive advances handover (forbidden)' });
  x.save();
};
if (require.main === module) module.exports().then(x.finish);
