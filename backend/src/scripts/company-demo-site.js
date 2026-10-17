'use strict';

const { assertDemoTarget } = require('./company-demo-common');
const TARGET = Object.freeze({ projectName: 'erp-demo-20261017', baseUrl: 'http://127.0.0.1:8092',
  dbName: 'construction_erp_demo', dbHost: '127.0.0.1', dbPort: '55442' });

function rows(response, route) {
  if (response.status !== 200 || !Array.isArray(response.body?.data)) throw new Error(`Demo list ${route}: HTTP ${response.status}`);
  return response.body.data;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalJson(value[key])]));
  }
  return value;
}

async function ensureSiteRecord({ request, account, listPath, createPath, key, keyField, body, match, headers }) {
  if (typeof request !== 'function' || !account || !listPath || !createPath || !key || !keyField || body?.[keyField] !== key) {
    throw new Error('Refusing demo: invalid site stable key');
  }
  const available = rows(await request(account, listPath), listPath);
  const found = available.filter(row => match ? match(row) : row?.[keyField] === key);
  if (found.length > 1) throw new Error('Refusing demo: ambiguous site stable key');
  if (found.length === 1) return { row: found[0], created: false };
  const response = await request(account, createPath, { method: 'POST', body, ...(headers ? { headers } : {}) });
  if (response.status !== 201 || !response.body?.data) throw new Error(`Demo create ${createPath}: HTTP ${response.status}`);
  return { row: response.body.data, created: true };
}

async function seedSite({ target, request, accounts, projects }) {
  assertDemoTarget(target);
  const account = key => {
    const row = accounts.find(item => item.key === key);
    if (!row) throw new Error(`Refusing demo: missing role account ${key}`);
    return row;
  };
  const owner = account('workflow_owner');
  const siteEngineer = account('site_engineer');
  const hse = account('hse_manager');
  const qa = account('qa_qc_manager');
  const projectManager = account('project_manager');
  const commercial = account('commercial_manager');
  const byCode = projects.slice().sort((a, b) => a.code.localeCompare(b.code));
  const projectA = byCode.find(row => row.code.endsWith('-A'));
  const projectB = byCode.find(row => row.code.endsWith('-B'));
  const projectC = byCode.find(row => row.code.endsWith('-C'));
  if (byCode.length !== 3 || !projectA || !projectB || !projectC) throw new Error('Refusing demo: site/QHSE projects are incomplete');
  const counts = {};
  const bump = key => { counts[key] = (counts[key] || 0) + 1; };

  const companies = rows(await request(owner, '/api/organizations/company'), '/api/organizations/company');
  const companyBody = { legal_name_ar: 'شركة العرض التوضيحي للمقاولات', legal_name_en: 'ERP Demo Construction Company',
    address_ar: 'الإسكندرية، مصر', address_en: 'Alexandria, Egypt', currency: 'EGP', email: 'demo-office@demo.example.com' };
  if (companies.length > 1) throw new Error('Refusing demo: ambiguous company profile');
  const currentCompany = companies[0];
  const profileMatches = currentCompany && Object.entries(companyBody).every(([key, value]) => String(currentCompany[key] ?? '') === value);
  if (!profileMatches) {
    const saved = await request(owner, '/api/organizations/company', { method: 'POST', body: companyBody });
    if (saved.status !== 201 || !saved.body?.data) throw new Error(`Demo create /api/organizations/company: HTTP ${saved.status}`);
    bump('admin_company_profile');
  }

  for (const [project, date] of [[projectA, '2026-02-16'], [projectB, '2026-02-17'], [projectC, '2026-02-18']]) {
    const key = `DEMO-SITE-REPORT-${project.code.slice(-1)}`;
    const body = { report_date: date, weather: 'Clear', temperature: '22 C', workers_count: 18,
      work_summary: key, material_received: 'Fictional demo materials received', equipment_on_site: 'Tower crane, mixer',
      issues_notes: 'No safety stop; follow up on temporary access route.', photos: [], measurements: [] };
    const result = await ensureSiteRecord({ request, account: siteEngineer,
      listPath: `/api/projects/${project.id}/site-reports?from=${date}&to=${date}&limit=100`,
      createPath: `/api/projects/${project.id}/site-reports`, key: date, keyField: 'report_date', body,
      match: row => String(row.report_date).slice(0, 10) === date,
      headers: { 'Idempotency-Key': key } });
    if (result.created) bump('site_reports');
  }

  const inspectionPlans = [projectA, projectB, projectC];
  for (let index = 0; index < inspectionPlans.length; index += 1) {
    const project = inspectionPlans[index];
    const findings = `DEMO-HSE-INSPECTION-${String(index + 1).padStart(3, '0')}`;
    const body = { project_id: project.id, inspection_date: '2026-02-20', inspection_type: index === 0 ? 'site' : 'housekeeping',
      checklist_items: [{ item: 'Access routes clear', ok: true }, { item: 'PPE available', ok: index !== 1, note: index === 1 ? 'Replenish ear protection.' : '' }],
      findings, follow_up_due: index === 1 ? '2026-02-27' : null, status: index === 1 ? 'failed' : 'passed' };
    const result = await ensureSiteRecord({ request, account: hse,
      listPath: `/api/hse/inspections?project_id=${project.id}&limit=100`, createPath: '/api/hse/inspections',
      key: findings, keyField: 'findings', body });
    if (result.created) bump('inspections');
  }

  const ncrDescription = 'DEMO-NCR-OPEN-001: reinforcement spacing differs from approved drawing; reinspection required.';
  const ncr = await ensureSiteRecord({ request, account: qa,
    listPath: `/api/qhse/ncrs?project_id=${projectA.id}&limit=100`, createPath: '/api/qhse/ncrs',
    key: ncrDescription, keyField: 'description', body: { project_id: projectA.id, description: ncrDescription, severity: 'major' } });
  if (ncr.created) bump('ncrs');

  const incidentDescription = 'DEMO-HSE-INCIDENT-001: minor hand abrasion during materials handling; first aid applied.';
  const incident = await ensureSiteRecord({ request, account: hse,
    listPath: `/api/hse/incidents?project_id=${projectB.id}&limit=100`, createPath: '/api/hse/incidents',
    key: incidentDescription, keyField: 'description', body: { project_id: projectB.id, incident_date: '2026-02-21',
      incident_type: 'First aid', incident_category: 'injury', severity: 'minor', description: incidentDescription,
      injured_party: 'Demo Employee 03', is_lti: false, lost_days: 0, corrective_action: 'Refresh manual handling briefing.' } });
  if (incident.created) bump('hse_incidents');

  const permitTitle = 'DEMO-PERMIT-HOTWORK-001';
  const permit = await ensureSiteRecord({ request, account: hse,
    listPath: `/api/hse/permits?project_id=${projectC.id}&limit=100`, createPath: '/api/hse/permits',
    key: permitTitle, keyField: 'title', body: { project_id: projectC.id, permit_type: 'hot_work', title: permitTitle,
      description: 'Fictional demo hot work permit for controlled welding activity.', conditions: 'Fire watch and extinguisher required.',
      precautions: ['Clear combustible materials', 'Maintain fire watch'], valid_from: '2026-02-22', valid_to: '2026-02-22' } });
  if (permit.created) bump('permits');

  const rfiSubject = 'DEMO-RFI-001: confirm sleeve detail at north service riser';
  const rfi = await ensureSiteRecord({ request, account: projectManager,
    listPath: `/api/docs/rfis?project_id=${projectA.id}&limit=100`, createPath: '/api/docs/rfis',
    key: rfiSubject, keyField: 'subject', body: { project_id: projectA.id, subject: rfiSubject,
      question: 'Please confirm the approved sleeve spacing and firestop detail.', category: 'Coordination', priority: 'high',
      due_date: '2026-03-01', cost_impact: 0, schedule_impact_days: 0 } });
  if (rfi.created) bump('rfis');

  const variationTitle = 'DEMO-VAR-PENDING-001: reroute drainage around discovered services';
  const variation = await ensureSiteRecord({ request, account: commercial,
    listPath: `/api/commercial/variations/${projectB.id}?limit=100`, createPath: '/api/commercial/variations',
    key: variationTitle, keyField: 'title', body: { project_id: projectB.id, title: variationTitle,
      description: 'Fictional demo variation awaiting commercial and owner review.', variation_type: 'client',
      cause: 'site_condition', responsibility: 'shared', time_impact_days: 3,
      lines: [{ description: 'Drainage reroute work', quantity: 1, unit: 'lot', unit_rate: 25000 }],
      cost_buildup: [{ component: 'Direct works', quantity: 1, unit_rate: 25000, amount: 25000, notes: 'Demo estimate' }] } });
  if (variation.created) bump('variations');
  let variationRow = variation.row;
  if (!variationRow.workflow_instance_id) {
    const started = await request(commercial, `/api/commercial/variations/${variationRow.id}/start`, { method: 'POST', body: {} });
    if (started.status < 200 || started.status >= 300) throw new Error(`Demo start /api/commercial/variations/${variationRow.id}: HTTP ${started.status}`);
    variationRow = { ...variationRow, workflow_instance_id: started.body?.data?.instance?.id || started.body?.data?.workflow_instance_id };
    bump('variation_workflows_started');
  }

  const settingsKey = 'demo.admin_setup';
  const settingsValue = { target: TARGET.projectName, locale: 'en', currency: 'EGP', city: 'Alexandria', configured: true };
  let settingsWritten = 0;
  for (const project of [projectA, projectB, projectC]) {
    const get = await request(owner, `/api/projects/${project.id}/settings`);
    if (get.status !== 200 || !get.body?.data || typeof get.body.data !== 'object') throw new Error(`Demo list /api/projects/${project.id}/settings: HTTP ${get.status}`);
    let existingValue = get.body.data[settingsKey];
    if (typeof existingValue === 'string') { try { existingValue = JSON.parse(existingValue); } catch (_) { /* mismatch triggers safe overwrite in demo target */ } }
    if (JSON.stringify(canonicalJson(existingValue)) === JSON.stringify(canonicalJson(settingsValue))) continue;
    const saved = await request(owner, `/api/projects/${project.id}/settings`, { method: 'PUT', body: { settings: { [settingsKey]: settingsValue } } });
    if (saved.status !== 200) throw new Error(`Demo update /api/projects/${project.id}/settings: HTTP ${saved.status}`);
    settingsWritten += 1;
  }
  if (settingsWritten) counts.project_admin_settings = settingsWritten;

  return { stage: 'site_qhse', created: Object.values(counts).reduce((sum, value) => sum + value, 0), counts,
    documents: { siteReports: ['DEMO-SITE-REPORT-A', 'DEMO-SITE-REPORT-B', 'DEMO-SITE-REPORT-C'],
      inspections: 3, ncrNumber: ncr.row.ncr_number, incident: 'DEMO-HSE-INCIDENT-001', permitNumber: permit.row.permit_number,
      rfiNumber: rfi.row.rfi_number, variationNumber: variation.row.variation_number, variationStatus: variationRow.status,
      company: companyBody.legal_name_en, projectSettings: 3 } };
}

module.exports = { TARGET, ensureSiteRecord, seedSite };
