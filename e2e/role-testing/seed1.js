// Stage 1: client > project > locations/team > BOQ > cost codes > schedule
const x = require('./seedlib');
const { S, act, check, readBack, snap, evidenceSince, idOf, sql, section } = x;
const T = '2026-11-02';
module.exports = async function stage1() {
  section('1. client');
  S.client = idOf('clients', 'name_en', 'DEMO-Nile Developments');
  if (!S.client) { const s0 = snap(); const r = await act('business_development', 'POST', '/api/clients', { code: 'DEMO-CL-001', name_ar: 'DEMO-شركة النيل للتطوير', name_en: 'DEMO-Nile Developments', client_type: 'company', contact_person: 'DEMO Contact', phone: '+20-000-0000', email: 'demo-client@example.com', city: 'Cairo', credit_limit: 5000000, payment_terms: 'net30' }, { label: 'create client' }); S.client = r.data?.id; evidenceSince(s0, 'client'); }

  section('2. employees (HR) for the wizard team');
  S.emp = S.emp || {};
  const staff = [['project_manager', 'DEMO-Project Manager', 'مدير مشروع'], ['site_engineer', 'DEMO-Site Engineer', 'مهندس موقع'], ['qs', 'DEMO-Quantity Surveyor', 'مهندس كميات'], ['safety_officer', 'DEMO-Safety Officer', 'مسؤول سلامة']];
  for (const [key, en, ar] of staff) {
    S.emp[key] = idOf('employees', 'name_en', en);
    if (!S.emp[key]) { const s0 = snap(); const r = await act('hr_manager', 'POST', '/api/hr/employees', { code: 'DEMO-E-' + key.toUpperCase().slice(0, 4), name_ar: 'DEMO-' + ar, name_en: en, department: 'Projects', designation: key, hire_date: '2026-01-15', salary: 18000, status: 'active', email: `demo-${key}@example.com` }, { label: `create employee ${key}` }); S.emp[key] = r.data?.id; evidenceSince(s0, 'employee ' + key); }
  }
  section('3. project (wizard: creates the project and seats the first team atomically)');
  S.project = idOf('projects', 'name_en', 'DEMO-Palm Tower Main');
  const uid = (r) => Number(sql(`select id from users where email='pilot-${r}@pilot.example.com'`));
  if (!S.project) {
    const s0 = snap();
    const r = await act('owner_ceo', 'POST', '/api/projects/wizard', { code: 'DEMO-PRJ-003', name_ar: 'DEMO-برج النخيل الرئيسي', name_en: 'DEMO-Palm Tower Main', project_type: 'residential', client_id: S.client, address: 'DEMO New Cairo', city: 'Cairo', contract_value: 2000000, budget: 1500000, retention_percentage: 10, status: 'active',
      participants: [{ organization_id: 2, participant_type: 'client', portal_access_enabled: true }, { organization_id: 3, participant_type: 'supplier', portal_access_enabled: true }],
      team: [{ employee_id: S.emp.project_manager, user_id: uid('project_manager'), role: 'project_manager' }, { employee_id: S.emp.site_engineer, user_id: uid('site_engineer'), role: 'site_engineer' }, { employee_id: S.emp.qs, user_id: uid('quantity_surveyor'), role: 'qs' }, { employee_id: S.emp.safety_officer, user_id: uid('hse_manager'), role: 'safety_officer' }] }, { label: 'create project via wizard (with team seats)' });
    S.project = r.data?.project?.id || r.data?.id; evidenceSince(s0, 'project', { notif: false });
  }
  if (S.project && !sql(`select start_date from projects where id=${S.project}`)) await act('project_manager', 'PUT', `/api/projects/${S.project}`, { start_date: '2026-11-01', expected_completion: '2027-10-31' }, { label: 'set project dates' });
  await readBack('project_manager', `/api/projects/${S.project}`, { name_en: 'DEMO-Palm Tower Main' }, 'project exists (read by seated project_manager)');
  await act('storekeeper', 'POST', '/api/projects', { name_ar: 'DEMO-x', name_en: 'DEMO-forbidden' }, { expect: 403, forbidden: true, label: 'storekeeper creates project (forbidden)' });

  section('4. team seats (existing accounts only; no user created or edited)');
  const seats = [['site_manager', null], ['planning_engineer', null], ['technical_office_engineer', null], ['commercial_manager', null], ['contracts_manager', null], ['procurement_manager', null], ['procurement_officer', null], ['finance_manager', null], ['accountant_ar', null], ['accountant_ap', null], ['storekeeper', null], ['qa_qc_manager', null], ['document_controller', null], ['equipment_manager', null], ['hr_manager', null], ['construction_manager', null], ['projects_director', null], ['owner_ceo', null], ['coo', null], ['business_development', null],
    ['client_executive', 2], ['client_reviewer', null], ['pmc_manager', null], ['consultant_coordinator', null], ['consultant_reviewer', null], ['subcontractor_manager', null], ['subcontractor_site_engineer', null], ['supplier_sales', 3], ['testing_lab', null], ['workflow_owner', null, 'owner'], ['workflow_checker', null, 'purchasing_mgr'], ['workflow_budget', null, 'accountant']];
  for (const [acct, org, roleKey] of seats) {
    const role = roleKey || acct; const u = uid(acct); if (!u) continue;
    const have = sql(`select count(*) from user_project_roles upr join roles r on r.id=upr.role_id where upr.user_id=${u} and upr.project_id=${S.project} and r.key='${role}'`);
    if (have !== '0') continue;
    await act('project_manager', 'POST', '/api/team', { project_id: S.project, user_id: u, role_key: role, ...(org ? { organization_id: org } : {}) }, { label: `seat ${acct} (${role}) on DEMO project` });
  }
  check('seats exist for DEMO project', Number(sql(`select count(*) from user_project_roles where project_id=${S.project}`)) >= 30, `seats=${sql(`select count(*) from user_project_roles where project_id=${S.project}`)}`);
  await readBack('finance_manager', `/api/clients/${S.client}`, { name_en: 'DEMO-Nile Developments' }, 'client exists (visible once linked to the seated project)');
  x.save();
};
if (require.main === module) module.exports().then(x.finish);
