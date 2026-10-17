'use strict';

const { assertDemoTarget } = require('./company-demo-common');

const TARGET = Object.freeze({ projectName: 'erp-demo-20261017', baseUrl: 'http://127.0.0.1:8092',
  dbName: 'construction_erp_demo', dbHost: '127.0.0.1', dbPort: '55442' });

const CLIENTS = [
  { code: 'DEMO-CLI-001', name_en: 'Alexandria Waterfront Development', name_ar: 'تطوير واجهة الإسكندرية', client_type: 'corporate', city: 'Alexandria' },
  { code: 'DEMO-CLI-002', name_en: 'Corniche Hospitality Group', name_ar: 'مجموعة الكورنيش للضيافة', client_type: 'corporate', city: 'Alexandria' },
  { code: 'DEMO-CLI-003', name_en: 'Delta Medical Properties', name_ar: 'دلتا للعقارات الطبية', client_type: 'corporate', city: 'Alexandria' },
];
const PROJECTS = [
  { code: 'DEMO-PRJ-A', name_en: 'Waterfront Tower', name_ar: 'برج الواجهة البحرية', contract_value: 120000000, budget: 90000000, progress: 55, client: 0 },
  { code: 'DEMO-PRJ-B', name_en: 'Corniche Hotel Renovation', name_ar: 'تجديد فندق الكورنيش', contract_value: 48000000, budget: 36000000, progress: 90, client: 1, retention_percentage: 5, retention_cap_amount: 2400000 },
  { code: 'DEMO-PRJ-C', name_en: 'Delta Clinic Fit-out', name_ar: 'تجهيز عيادات دلتا', contract_value: 18500000, budget: 14000000, progress: 5, client: 2 },
];
const SUPPLIERS = Array.from({ length: 6 }, (_, i) => ({ code: `DEMO-SUP-${String(i + 1).padStart(3, '0')}`,
  name_en: ['Nile Cement Supply', 'Delta Steel Trading', 'Alexandria Electricals', 'Mediterranean Tiles', 'Blue Coast Plumbing', 'Cairo Safety Products'][i],
  name_ar: ['النيل لتوريد الأسمنت', 'الدلتا لتجارة الحديد', 'كهرباء الإسكندرية', 'بلاط الساحل', 'بلو كوست للسباكة', 'القاهرة لمهمات السلامة'][i],
  specialty: ['concrete', 'steel', 'electrical', 'paint_coating', 'plumbing', 'safety'][i], city: 'Alexandria', payment_terms: '30 days' }));
const SUBCONTRACTORS = [
  { code: 'DEMO-SUB-001', name_en: 'Coastal MEP Works', name_ar: 'أعمال الساحل الكهروميكانيكية', classification: 'MEP', specialties: ['electrical', 'plumbing'] },
  { code: 'DEMO-SUB-002', name_en: 'Delta Finishes Team', name_ar: 'فريق الدلتا للتشطيبات', classification: 'Finishes', specialties: ['tiling', 'painting'] },
];
const MATERIALS = [
  ['cement', 'bag', 'Portland Cement 50 kg', 'أسمنت بورتلاند 50 كجم'], ['steel', 'ton', 'Rebar 12 mm', 'حديد تسليح 12 مم'],
  ['concrete_premix', 'm3', 'Ready Mix Concrete C30', 'خرسانة جاهزة C30'], ['aggregate', 'm3', 'Crushed Aggregate 20 mm', 'ركام مكسر 20 مم'],
  ['brick_block', 'piece', 'Hollow Concrete Block', 'بلوك خرساني مفرغ'], ['wood', 'm3', 'Formwork Plywood', 'خشب شدات معاكس'],
  ['piping', 'linear_m', 'PPR Water Pipe 25 mm', 'أنبوب مياه PPR 25 مم'], ['electrical', 'linear_m', 'Copper Cable 4 mm', 'كابل نحاس 4 مم'],
  ['insulation', 'm2', 'Roof Waterproof Membrane', 'غشاء عزل الأسطح'], ['paint_coating', 'liter', 'Interior Acrylic Paint', 'دهان أكريليك داخلي'],
  ['tile_flooring', 'm2', 'Ceramic Floor Tile', 'بلاط أرضيات سيراميك'], ['sanitary_fixture', 'piece', 'Close Coupled Toilet', 'مرحاض قطعة واحدة'],
  ['lighting', 'piece', 'LED Panel Light', 'لوحة إضاءة LED'], ['door', 'piece', 'Fire Rated Door', 'باب مقاوم للحريق'],
  ['window', 'm2', 'Aluminium Window Unit', 'وحدة نافذة ألومنيوم'], ['cabinetry', 'linear_m', 'Kitchen Cabinet', 'خزانة مطبخ'],
  ['protective_gear', 'piece', 'Safety Helmet', 'خوذة سلامة'], ['fire_safety', 'piece', 'ABC Fire Extinguisher', 'طفاية حريق ABC'],
  ['fastener', 'piece', 'Anchor Bolt M16', 'مسمار تثبيت M16'], ['adhesive_sealant', 'bag', 'Tile Adhesive 20 kg', 'لاصق بلاط 20 كجم'],
  ['generator', 'set', 'Diesel Generator 100 kVA', 'مولد ديزل 100 ك.ف.أ'], ['scaffolding', 'set', 'Mobile Scaffold Tower', 'سقالة متحركة'],
  ['fuel', 'liter', 'Diesel Fuel', 'وقود ديزل'], ['measuring', 'piece', 'Laser Distance Meter', 'مقياس مسافة ليزري'],
  ['first_aid', 'set', 'Site First Aid Kit', 'حقيبة إسعافات أولية للموقع'],
].map(([sub_category, unit, name_en, name_ar], i) => ({ code: `DEMO-MAT-${String(i + 1).padStart(3, '0')}`,
  category: i === 10 || i === 11 || i === 12 || i === 13 || i === 14 || i === 15 ? 'finished_material' :
    (i >= 16 && i !== 20 && i !== 21 ? (i === 22 ? 'consumable' : 'safety') : (i === 20 || i === 21 ? 'equipment_rental' : 'raw_material')),
  sub_category, unit, name_en, name_ar, description: `Fictional Alexandria demo material ${i + 1}`, reorder_policy: 'reorder_point', reorder_point: i < 2 ? 20 : 0 }));

function rowsFrom(response, route) {
  if (response.status !== 200 || !Array.isArray(response.body?.data)) {
    throw new Error(`Demo list ${route}: HTTP ${response.status}`);
  }
  return response.body.data;
}

async function ensureApi({ request, account, listPath, createPath, key, keyField = 'code', body }) {
  if (body[keyField] !== key) throw new Error('Refusing demo: unstable master key');
  const listed = rowsFrom(await request(account, listPath), listPath);
  const matches = listed.filter(row => row?.[keyField] === key);
  if (matches.length > 1) throw new Error('Refusing demo: ambiguous master key');
  if (matches.length) return { row: matches[0], created: false };
  const created = await request(account, createPath, { method: 'POST', body });
  if (created.status !== 201 || !created.body?.data) throw new Error(`Demo create ${createPath}: HTTP ${created.status}`);
  return { row: created.body.data, created: true };
}

async function ensureDemoWarehouses({ target, query, projects }) {
  assertDemoTarget(target);
  if (typeof query !== 'function' || !Array.isArray(projects) || projects.length < 2) {
    throw new Error('Refusing demo: warehouse seed requires a guarded query and two projects');
  }
  const definitions = [
    { name: 'DEMO-2026-A Central Store', project: projects[0], type: 'central', warehouseType: 'central', capacity: 5000 },
    { name: 'DEMO-2026-B Site Store', project: projects[1], type: 'site', warehouseType: 'site', capacity: 2500 },
  ];
  const records = [];
  let created = 0;
  for (const item of definitions) {
    const projectId = Number(item.project.id);
    const existing = await query('SELECT id FROM warehouses WHERE name = $1 AND project_id = $2', [item.name, projectId]);
    if (existing.rows.length > 1) throw new Error('Refusing demo: ambiguous warehouse stable key');
    if (existing.rows.length === 1) {
      records.push({ name: item.name, id: existing.rows[0].id, created: false });
      continue;
    }
    const result = await query(
      `INSERT INTO warehouses (name, name_en, name_ar, type, warehouse_type, project_id, storage_capacity)
       VALUES ($1, $1, $2, $3, $4, $5, $6) RETURNING id`,
      [item.name, item.name, item.type, item.warehouseType, projectId, item.capacity]);
    if (result.rows.length !== 1) throw new Error('Demo warehouse insert returned no row');
    created += 1;
    records.push({ name: item.name, id: result.rows[0].id, created: true });
  }
  return { created, records };
}

async function seedMasters({ target, request, accounts, dbQuery }) {
  assertDemoTarget(target);
  if (typeof request !== 'function' || !Array.isArray(accounts) || typeof dbQuery !== 'function') {
    throw new Error('Refusing demo: incomplete masters dependencies');
  }
  const account = (key) => {
    const found = accounts.find(row => row.key === key);
    if (!found) throw new Error(`Refusing demo: missing role account ${key}`);
    return found;
  };
  const counts = {};
  const add = (kind, result) => { counts[kind] = (counts[kind] || 0) + Number(result.created); };
  const owner = account('workflow_owner');
  const business = account('business_development');
  const ceo = account('owner_ceo');
  const purchasing = account('procurement_manager');
  const commercial = account('commercial_manager');

  const clients = [];
  for (const body of CLIENTS) {
    const result = await ensureApi({ request, account: business, listPath: '/api/clients?limit=200', createPath: '/api/clients', key: body.code, body });
    clients.push(result.row); add('clients', result);
  }

  const projectRows = [];
  for (let projectIndex = 0; projectIndex < PROJECTS.length; projectIndex += 1) {
    const definition = PROJECTS[projectIndex];
    const { client: clientIndex, ...fields } = definition;
    const body = { code: fields.code, name_en: fields.name_en, name_ar: fields.name_ar, client_id: clients[clientIndex].id,
      project_type: 'commercial', city: 'Alexandria', status: 'active', address: 'Alexandria, Egypt',
      contract_value: fields.contract_value, budget: fields.budget, start_date: '2026-02-01', expected_completion: '2027-12-31' };
    const result = await ensureApi({ request, account: ceo, listPath: '/api/projects?limit=200', createPath: '/api/projects', key: body.code, body });
    let project = result.row;
    if (Number(project.completion_percentage || 0) !== Number(definition.progress)) {
      const update = await request(owner, `/api/projects/${project.id}`, { method: 'PUT', body: { completion_percentage: definition.progress } });
      if (update.status !== 200 || !update.body?.data) throw new Error(`Demo update /api/projects/${project.id}: HTTP ${update.status}`);
      project = update.body.data;
    }
    projectRows.push(project); add('projects', result);
  }

  const userRows = rowsFrom(await request(owner, '/api/users?limit=200'), '/api/users?limit=200');
  const usersByEmail = new Map(userRows.map(user => [user.email, user]));
  const seats = [
    ['project_manager', 'project_manager'], ['site_engineer', 'site_engineer'],
    ['procurement_officer', 'procurement_officer'], ['procurement_manager', 'procurement_manager'], ['quantity_surveyor', 'quantity_surveyor'],
    ['storekeeper', 'storekeeper'], ['accountant_ap', 'accountant_ap'], ['accountant_ar', 'accountant_ar'],
  ];
  for (let projectIndex = 0; projectIndex < projectRows.length; projectIndex += 1) {
    const project = projectRows[projectIndex];
    const teamAccount = owner;
    const current = rowsFrom(await request(teamAccount, `/api/team?project_id=${project.id}&limit=200`), `/api/team?project_id=${project.id}`);
    for (const [userKey, roleKey] of seats) {
      const user = usersByEmail.get(`demo-${userKey}@demo.example.com`);
      if (!user) throw new Error(`Refusing demo: no user record for ${userKey}`);
      const match = current.some(row => Number(row.project_id) === Number(project.id) && Number(row.user_id) === Number(user.id) && row.role_key === roleKey);
      if (match) continue;
      const response = await request(teamAccount, '/api/team', { method: 'POST', body: { project_id: project.id, user_id: user.id, role_key: roleKey, organization_id: null, expires_at: null } });
      if (response.status !== 201) throw new Error(`Demo create /api/team: HTTP ${response.status}`);
      add('team_seats', { created: true });
    }
  }
  for (const assignment of [
    { projectIndex: 0, accountKey: 'supplier_sales', roleKey: 'supplier_sales', expiresAt: null },
    { projectIndex: 2, accountKey: 'expired_assignment', roleKey: 'site_engineer', expiresAt: '2026-10-17T23:59:59.000Z' },
  ]) {
    const user = usersByEmail.get(`demo-${assignment.accountKey}@demo.example.com`);
    if (!user) throw new Error(`Refusing demo: no user record for ${assignment.accountKey}`);
    const project = projectRows[assignment.projectIndex];
    const current = rowsFrom(await request(owner, `/api/team?project_id=${project.id}&limit=200`), `/api/team?project_id=${project.id}`);
    const exists = current.some(row => Number(row.project_id) === Number(project.id) && Number(row.user_id) === Number(user.id) && row.role_key === assignment.roleKey);
    if (!exists) {
      const response = await request(owner, '/api/team', { method: 'POST', body: { project_id: project.id, user_id: user.id, role_key: assignment.roleKey, organization_id: null, expires_at: assignment.expiresAt } });
      if (response.status !== 201) throw new Error(`Demo create /api/team: HTTP ${response.status}`);
      add(assignment.expiresAt ? 'expired_seats' : 'external_seats', { created: true });
    }
  }

  for (let projectIndex = 0; projectIndex < projectRows.length; projectIndex += 1) {
    const project = projectRows[projectIndex];
    const detailRoute = `/api/projects/${project.id}`;
    const detail = await request(account('project_manager'), detailRoute);
    if (detail.status !== 200 || !detail.body?.data) throw new Error(`Demo list ${detailRoute}: HTTP ${detail.status}`);
    const targetProgress = Number(PROJECTS[projectIndex].progress);
    for (let phaseIndex = 0; phaseIndex < 4; phaseIndex += 1) {
      const body = { code: `DEMO-PH-${projectIndex + 1}-${phaseIndex + 1}`, name_en: ['Mobilization', 'Structure', 'MEP', 'Finishes'][phaseIndex], name_ar: ['التجهيز', 'الهيكل الإنشائي', 'الأعمال الكهروميكانيكية', 'التشطيبات'][phaseIndex], sort_order: phaseIndex + 1, budget: Math.round(Number(project.budget || 0) / 4), start_date: '2026-02-01', end_date: '2026-12-31' };
      const existing = (detail.body.data.phases || []).filter(row => row.code === body.code);
      if (existing.length > 1) throw new Error('Refusing demo: ambiguous project phase key');
      let phase = existing[0];
      if (!existing.length) {
        const response = await request(account('project_manager'), `${detailRoute}/phases`, { method: 'POST', body });
        if (response.status !== 201 || !response.body?.data) throw new Error(`Demo create ${detailRoute}/phases: HTTP ${response.status}`);
        phase = response.body.data;
        add('phases', { created: true });
      }
      if (Number(phase.completion_percentage || 0) !== targetProgress) {
        const update = await request(account('project_manager'), `${detailRoute}/phases/${phase.id}`, { method: 'PUT', body: { completion_percentage: targetProgress } });
        if (update.status !== 200) throw new Error(`Demo update ${detailRoute}/phases/${phase.id}: HTTP ${update.status}`);
      }
    }
    for (let milestoneIndex = 0; milestoneIndex < 3; milestoneIndex += 1) {
      const title = `DEMO-${project.code}-M${milestoneIndex + 1}`;
      const exists = (detail.body.data.milestones || []).some(row => row.title_en === title);
      if (exists) continue;
      const response = await request(account('project_manager'), `${detailRoute}/milestones`, { method: 'POST', body: { title_en: title, title_ar: `مرحلة ${milestoneIndex + 1} ${project.name_ar}`, target_date: `2026-${String(4 + milestoneIndex * 2).padStart(2, '0')}-15` } });
      if (response.status !== 201) throw new Error(`Demo create ${detailRoute}/milestones: HTTP ${response.status}`);
      add('milestones', { created: true });
    }
    for (let locationIndex = 0; locationIndex < 3; locationIndex += 1) {
      const code = `DEMO-LOC-${projectIndex + 1}-${locationIndex + 1}`;
      const path = `/api/locations/project/${project.id}?limit=200`;
      const locations = rowsFrom(await request(owner, path), path);
      const exists = locations.some(row => row.code === code);
      if (exists) continue;
      const response = await request(owner, '/api/locations', { method: 'POST', body: { project_id: project.id, location_type_code: locationIndex === 0 ? 'site' : 'zone', code, name: `${project.name_en} area ${locationIndex + 1}`, name_en: `${project.name_en} area ${locationIndex + 1}`, name_ar: `منطقة ${locationIndex + 1} ${project.name_ar}`, sort_order: locationIndex } });
      if (response.status !== 201) throw new Error(`Demo create /api/locations: HTTP ${response.status}`);
      add('locations', { created: true });
    }
    const sectionBody = { project_id: project.id, code: `DEMO-BOQ-SEC-${projectIndex + 1}`, name_en: 'Construction Works', name_ar: 'أعمال الإنشاءات', sort_order: 1 };
    const sectionsPath = `/api/boq/sections/${project.id}?limit=200`;
    const sections = rowsFrom(await request(account('quantity_surveyor'), sectionsPath), sectionsPath);
    let section = sections.find(row => row.code === sectionBody.code);
    if (!section) {
      const response = await request(account('quantity_surveyor'), '/api/boq/sections', { method: 'POST', body: sectionBody });
      if (response.status !== 201 || !response.body?.data) throw new Error(`Demo create /api/boq/sections: HTTP ${response.status}`);
      section = response.body.data; add('boq_sections', { created: true });
    }
    for (let itemIndex = 0; itemIndex < 5; itemIndex += 1) {
      const code = `DEMO-BOQ-${projectIndex + 1}-${itemIndex + 1}`;
      const path = `/api/boq/items/${project.id}?limit=200`;
      const items = rowsFrom(await request(account('quantity_surveyor'), path), path);
      if (items.some(row => row.code === code)) continue;
      const body = { project_id: project.id, section_id: section.id, code, description_en: `Construction item ${itemIndex + 1}`, description_ar: `بند إنشاء ${itemIndex + 1}`, unit: itemIndex === 0 ? 'm3' : 'm2', quantity: 100 + itemIndex * 25, unit_rate: 1250 + itemIndex * 275, type: 'material' };
      const response = await request(account('quantity_surveyor'), '/api/boq/items', { method: 'POST', body });
      if (response.status !== 201) throw new Error(`Demo create /api/boq/items: HTTP ${response.status}`);
      add('boq_items', { created: true });
    }
  }

  for (const body of SUPPLIERS) {
    const result = await ensureApi({ request, account: account('procurement_officer'), listPath: '/api/suppliers?limit=200', createPath: '/api/suppliers', key: body.code, body });
    add('suppliers', result);
  }
  for (const body of SUBCONTRACTORS) {
    const result = await ensureApi({ request, account: commercial, listPath: '/api/subcontractors?limit=200', createPath: '/api/subcontractors', key: body.code, body });
    add('subcontractors', result);
  }
  const codes = rowsFrom(await request(owner, '/api/costing/codes?limit=200'), '/api/costing/codes?limit=200');
  if (codes.length !== 12) throw new Error(`Demo cost code catalog count mismatch: ${codes.length}`);
  for (const body of MATERIALS) {
    const materialBody = { ...body, preferred_supplier_ids: [] };
    const result = await ensureApi({ request, account: purchasing, listPath: '/api/items?limit=200', createPath: '/api/items', key: body.code, body: materialBody });
    add('materials', result);
  }

  const warehouseResult = await ensureDemoWarehouses({ target, query: dbQuery,
    projects: projectRows.map(row => ({ id: row.id, code: row.code })) });
  counts.warehouses = warehouseResult.created;
  return { created: Object.values(counts).reduce((sum, value) => sum + (Number(value) || 0), 0), counts,
    catalog: { cost_codes: codes.length },
    projects: projectRows.map(row => ({ code: row.code, id: row.id })), warehouses: warehouseResult.records };
}

module.exports = { TARGET, CLIENTS, PROJECTS, SUPPLIERS, SUBCONTRACTORS, MATERIALS, ensureApi, ensureDemoWarehouses, seedMasters };
