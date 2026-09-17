// Phase 5 migration core — project creation wizard.
//
// Adds the ~15 wizard columns to projects, creates the template tables
// (project_templates, template_locations, template_wbs, template_folders,
// template_workflows, template_approval_rules), the runtime tables the
// provisioning transaction writes (project_folders, project_registers,
// numbering_sequences, project_workflows, project_dashboard_preferences),
// and seeds:
//   - the missing location types ('chainage' for infrastructure projects,
//     'unit' for tower floors),
//   - one 'residential_tower' template matching the Phase 31 seed shape:
//     2 towers × 12 floors × 4 units/floor.
//
// The logic lives here (not in the migrate-18 wrapper) so tests can run it
// against the in-memory mock-db, exactly like policy-migration.js in Phase 4.
// Everything is idempotent: ALTER ... ADD COLUMN IF NOT EXISTS, CREATE TABLE
// IF NOT EXISTS, ON CONFLICT DO NOTHING seeds.

'use strict';

// ---------------------------------------------------------------------------
// Wizard columns for projects (15 additions — dates already exist).
// ---------------------------------------------------------------------------

const PROJECT_COLUMNS = [
  ['project_number', 'VARCHAR(50)'],
  ['country', 'VARCHAR(100)'],
  ['gps_latitude', 'DECIMAL(10,7)'],
  ['gps_longitude', 'DECIMAL(10,7)'],
  ['timezone', 'VARCHAR(64) DEFAULT \'Africa/Cairo\''],
  ['currency', 'VARCHAR(8) DEFAULT \'EGP\''],
  ['tax_profile', 'VARCHAR(50) DEFAULT \'standard_vat\''],
  ['original_contract_value', 'DECIMAL(15,2)'],
  ['original_budget', 'DECIMAL(15,2)'],
  ['dlp_period_months', 'INTEGER'],
  ['warranty_period_months', 'INTEGER'],
  ['retention_percentage', 'DECIMAL(5,2)'],
  ['retention_cap_amount', 'DECIMAL(15,2)'],
  ['advance_payment_amount', 'DECIMAL(15,2)'],
  ['advance_payment_percentage', 'DECIMAL(5,2)'],
  ['liquidated_damages_rate', 'DECIMAL(5,2)'],
  ['liquidated_damages_cap', 'DECIMAL(15,2)'],
];

const ALTER_STATEMENTS = PROJECT_COLUMNS.map(
  ([col, type]) => `ALTER TABLE projects ADD COLUMN IF NOT EXISTS ${col} ${type}`
);

// ---------------------------------------------------------------------------
// Template + runtime DDL.
// ---------------------------------------------------------------------------

const TABLE_DDL = [
  `CREATE TABLE IF NOT EXISTS project_templates (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    project_type VARCHAR(100) DEFAULT 'residential',
    description TEXT,
    default_values JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS template_locations (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
    parent_code VARCHAR(100),
    code VARCHAR(100) NOT NULL,
    location_type_code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    name_ar VARCHAR(255),
    sort_order INTEGER DEFAULT 0,
    UNIQUE(template_id, code)
  )`,
  `CREATE TABLE IF NOT EXISTS template_wbs (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
    parent_code VARCHAR(100),
    code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    name_ar VARCHAR(255),
    wbs_level INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    UNIQUE(template_id, code)
  )`,
  `CREATE TABLE IF NOT EXISTS template_folders (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
    code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    folder_type VARCHAR(50) DEFAULT 'documents',
    sort_order INTEGER DEFAULT 0,
    UNIQUE(template_id, code)
  )`,
  `CREATE TABLE IF NOT EXISTS template_workflows (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
    code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    steps JSONB,
    sort_order INTEGER DEFAULT 0,
    UNIQUE(template_id, code)
  )`,
  `CREATE TABLE IF NOT EXISTS template_approval_rules (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
    module VARCHAR(100) NOT NULL,
    threshold_amount DECIMAL(15,2) DEFAULT 0,
    approver_role VARCHAR(100) NOT NULL,
    stage VARCHAR(50) DEFAULT 'manager_review',
    sort_order INTEGER DEFAULT 0,
    UNIQUE(template_id, module, stage, approver_role)
  )`,
  `CREATE TABLE IF NOT EXISTS project_folders (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    folder_type VARCHAR(50) DEFAULT 'documents',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, code)
  )`,
  `CREATE TABLE IF NOT EXISTS project_registers (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    register_type VARCHAR(50) DEFAULT 'log',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, code)
  )`,
  `CREATE TABLE IF NOT EXISTS numbering_sequences (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    entity VARCHAR(100) NOT NULL,
    prefix VARCHAR(100) NOT NULL,
    next_value INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, entity)
  )`,
  `CREATE TABLE IF NOT EXISTS project_workflows (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    workflow_code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    steps JSONB,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, workflow_code)
  )`,
  `CREATE TABLE IF NOT EXISTS project_dashboard_preferences (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    preference_key VARCHAR(100) NOT NULL,
    preference_value JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, preference_key)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_template_locations_template ON template_locations(template_id)`,
  `CREATE INDEX IF NOT EXISTS idx_template_wbs_template ON template_wbs(template_id)`,
  `CREATE INDEX IF NOT EXISTS idx_project_folders_project ON project_folders(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_project_workflows_project ON project_workflows(project_id)`,
];

// ---------------------------------------------------------------------------
// Seeds
// ---------------------------------------------------------------------------

// Extra location types Phase 3 did not seed.
const EXTRA_LOCATION_TYPES = [
  ['unit', 'Unit', 'Unit', 'وحدة', 5],
  ['chainage', 'Chainage', 'Chainage', 'قطاع طولي', 2],
];

const TEMPLATE_SEED_SQL =
  `INSERT INTO project_templates (key, name, project_type, description, default_values, is_active)
   VALUES ($1, $2, $3, $4, $5, $6)
   ON CONFLICT (key) DO NOTHING`;

async function seedLocationTypes(query) {
  for (const [code, name, nameEn, nameAr, sortOrder] of EXTRA_LOCATION_TYPES) {
    await query(
      `INSERT INTO location_types (code, name, name_en, name_ar, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (code) DO NOTHING`,
      [code, name, nameEn, nameAr, sortOrder]
    );
  }
}// The "Residential Tower" template — Phase 31 seed shape: 2 towers ×
// 12 floors × 4 units per floor.
function buildResidentialTowerTemplate() {
  const locations = [];
  const towers = ['T-A', 'T-B'];
  for (const [ti, tower] of towers.entries()) {
    locations.push({
      parent_code: null,
      code: tower,
      location_type: 'building',
      name: `Tower ${tower === 'T-A' ? 'A' : 'B'}`,
      name_en: `Tower ${tower === 'T-A' ? 'A' : 'B'}`,
      name_ar: tower === 'T-A' ? 'برج أ' : 'برج ب',
      sort_order: ti + 1,
    });
    for (let f = 1; f <= 12; f++) {
      const floorCode = `${tower}-F${String(f).padStart(2, '0')}`;
      locations.push({
        parent_code: tower,
        code: floorCode,
        location_type: 'floor',
        name: `${tower === 'T-A' ? 'Tower A' : 'Tower B'} Floor ${f}`,
        name_en: `Floor ${f} (${tower === 'T-A' ? 'A' : 'B'})`,
        name_ar: `طابق ${f} (${tower === 'T-A' ? 'أ' : 'ب'})`,
        sort_order: f,
      });
      for (let u = 1; u <= 4; u++) {
        locations.push({
          parent_code: floorCode,
          code: `${floorCode}-U${u}`,
          location_type: 'unit',
          name: `Unit ${u} — Floor ${f} (${tower === 'T-A' ? 'A' : 'B'})`,
          name_en: `Unit ${u} Floor ${f} ${tower === 'T-A' ? 'A' : 'B'}`,
          name_ar: `وحدة ${u} طابق ${f}`,
          sort_order: u,
        });
      }
    }
  }

  const wbs = [
    { parent_code: null, code: '100', name: 'Preliminaries', name_en: 'Preliminaries', name_ar: 'أعمال تمهيدية', level: 1, sort_order: 1 },
    { parent_code: null, code: '200', name: 'Substructure', name_en: 'Substructure', name_ar: 'أعمال الأساسات', level: 1, sort_order: 2 },
    { parent_code: null, code: '300', name: 'Superstructure', name_en: 'Superstructure', name_ar: 'الهيكل الخرساني', level: 1, sort_order: 3 },
    { parent_code: '300', code: '300-1', name: 'Columns and walls', name_en: 'Columns and walls', name_ar: 'أعمدة وحوائط', level: 2, sort_order: 1 },
    { parent_code: '300', code: '300-2', name: 'Slabs and beams', name_en: 'Slabs and beams', name_ar: 'أسقف وكمرات', level: 2, sort_order: 2 },
    { parent_code: null, code: '400', name: 'Finishes', name_en: 'Finishes', name_ar: 'أعمال التشطيبات', level: 1, sort_order: 4 },
    { parent_code: null, code: '500', name: 'MEP', name_en: 'MEP', name_ar: 'أعمال الكهرباء والصحية', level: 1, sort_order: 5 },
    { parent_code: null, code: '600', name: 'Handover', name_en: 'Handover', name_ar: 'التسليم', level: 1, sort_order: 5 },
  ];

  const folders = [
    ['contracts', 'Contracts', 'documents'],
    ['drawings', 'Drawings', 'documents'],
    ['boq', 'BOQ and CBS', 'documents'],
    ['submittals', 'Submittals', 'submittals'],
    ['rfi', 'RFIs', 'rfi'],
    ['hse', 'HSE', 'documents'],
    ['financial', 'Financial', 'documents'],
  ];

  const workflows = [
    {
      code: 'material_approval',
      name: 'Material approval',
      description: 'Site request to PM approval',
      steps: [
        { stage: 'site_review', role: 'site_engineer' },
        { stage: 'manager_review', role: 'project_manager' },
      ],
    },
    {
      code: 'payment_certificate',
      name: 'Payment certificate',
      description: 'QS certification chain',
      steps: [
        { stage: 'qs_review', role: 'qs' },
        { stage: 'manager_review', role: 'project_manager' },
        { stage: 'finance_review', role: 'finance_manager' },
      ],
    },
    {
      code: 'submittal_review',
      name: 'Submittal review',
      description: 'Consultant review cycle',
      steps: [
        { stage: 'consultant_review', role: 'consultant' },
        { stage: 'manager_review', role: 'project_manager' },
      ],
    },
  ];

  const approvalRules = [
    { module: 'expenses', threshold: 50000, approver_role: 'finance_manager', stage: 'manager_review' },
    { module: 'expenses', threshold: 50000, approver_role: 'owner', stage: 'owner_review' },
    { module: 'sub_contracts', threshold: 0, approver_role: 'project_manager', stage: 'manager_review' },
    { module: 'legal', threshold: 0, approver_role: 'legal_mgr', stage: 'manager_review' },
  ];

  const defaultValues = {
    timezone: 'Africa/Cairo',
    currency: 'EGP',
    tax_profile: 'standard_vat',
    dlp_period_months: 12,
    warranty_period_months: 12,
    retention_percentage: 5,
    advance_payment_percentage: 10,
    liquidated_damages_rate: 0.5,
  };

  return { key: 'residential_tower', name: 'Residential Tower', projectType: 'residential', description: 'Two towers × 12 floors × 4 units per floor', locations, wbs, folders, workflows, approvalRules, defaultValues };
}

async function getTemplateId(query, key) {
  const res = await query('SELECT id FROM project_templates WHERE key = $1', [key]);
  return res.rows.length ? res.rows[0].id : null;
}

async function seedTemplate(query, template) {
  await query(TEMPLATE_SEED_SQL, [
    template.key, template.name, template.projectType, template.description,
    JSON.stringify(template.defaultValues), true,
  ]);
  const templateId = await getTemplateId(query, template.key);
  if (templateId == null) return;

  for (const loc of template.locations) {
    await query(
      `INSERT INTO template_locations (template_id, parent_code, code, location_type_code, name, name_en, name_ar, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (template_id, code) DO NOTHING`,
      [templateId, loc.parent_code, loc.code, loc.location_type, loc.name, loc.name_en, loc.name_ar, loc.sort_order]
    );
  }
  for (const node of template.wbs) {
    await query(
      `INSERT INTO template_wbs (template_id, parent_code, code, name, name_en, name_ar, wbs_level, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (template_id, code) DO NOTHING`,
      [templateId, node.parent_code, node.code, node.name, node.name_en, node.name_ar, node.level, node.sort_order]
    );
  }
  for (const [i, folder] of template.folders.entries()) {
    const [code, name] = folder;
    await query(
      `INSERT INTO template_folders (template_id, code, name, folder_type, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (template_id, code) DO NOTHING`,
      [templateId, code, name, code === 'submittals' ? 'submittals' : (code === 'rfi' ? 'rfi' : 'documents'), i]
    );
  }
  for (const wf of template.workflows) {
    await query(
      `INSERT INTO template_workflows (template_id, code, name, description, steps, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (template_id, code) DO NOTHING`,
      [templateId, wf.code, wf.name, wf.description, JSON.stringify(wf.steps), template.workflows.indexOf(wf) + 1]
    );
  }
  for (const rule of template.approvalRules) {
    await query(
      `INSERT INTO template_approval_rules (template_id, module, threshold_amount, approver_role, stage, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (template_id, module, stage, approver_role) DO NOTHING`,
      [templateId, rule.module, rule.threshold, rule.approver_role, rule.stage, template.approvalRules.indexOf(rule) + 1]
    );
  }
}

async function ensureLocationTypeSeed(query) {
  for (const [code, name, nameEn, nameAr, sortOrder] of EXTRA_LOCATION_TYPES) {
    await query(
      `INSERT INTO location_types (code, name, name_en, name_ar, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (code) DO NOTHING`,
      [code, name, nameEn, nameAr, sortOrder]
    );
  }
}

async function ensureTables(query) {
  for (const ddl of TABLE_DDL) {
    await query(ddl);
  }
}

async function runAlters(query) {
  for (const stmt of ALTER_STATEMENTS) {
    await query(stmt);
  }
}

async function seedTemplates(query) {
  await seedTemplate(query, buildResidentialTowerTemplate());
}

async function run(query) {
  await runAlters(query);
  await ensureTables(query);
  await ensureLocationTypeSeed(query);
  await seedTemplates(query);
}

module.exports = {
  PROJECT_COLUMNS,
  ALTER_STATEMENTS,
  TABLE_DDL,
  EXTRA_LOCATION_TYPES,
  TEMPLATE_SEED_SQL,
  buildResidentialTowerTemplate,
  ensureTables,
  runAlters,
  ensureLocationTypeSeed,
  seedLocationTypes,
  seedTemplates,
  run,
};
