// Phase 20 migration — HSE: inductions, toolbox talks, JSA/risk assessments,
// typed permits, near misses, PPE, equipment inspections, emergency drills.
//
// Run:  node backend/src/scripts/migrate-32-hse.js
//
// Legacy conversion (real DB only — see convertLegacy()):
//   safety_incidents  → typed `incidents` (safety_incidents becomes a
//                       compatibility view over it)
//   safety_inspections→ typed `hse_inspections` (safety_inspections view)
// The old table names keep working for every existing reader until each one
// has moved; the simple column-preserving views stay auto-updatable, so the
// legacy INSERT/UPDATE paths keep their exact behavior.
//
// The `permit` workflow template (draft → HSE review → PM approval →
// approved) is seeded here for the sign-off-before-work permit types
// (hot work, confined space, lifting).

const { setSequenceToMax } = require('./migration-support');

const DDL = [
  // ------------------------------------------------------------------
  // Incidents (typed) — created beside the legacy table; the copy +
  // rename happens in convertLegacy(). New columns: incident category
  // (typed incidents: injury / near-miss / environmental / property),
  // LTI flag, lost-days.
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS incidents (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    incident_date DATE DEFAULT CURRENT_DATE,
    incident_type VARCHAR(100),
    severity VARCHAR(20) DEFAULT 'minor',
    description TEXT NOT NULL,
    injured_party VARCHAR(255),
    reported_by INTEGER REFERENCES users(id),
    corrective_action TEXT,
    status VARCHAR(30) DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    incident_category VARCHAR(50),      -- injury | environmental | property | vehicle | other
    is_lti BOOLEAN DEFAULT false,        -- lost-time injury (drives days-without-LTI)
    lost_days INTEGER DEFAULT 0,
    investigation_notes TEXT,
    root_cause TEXT,
    closed_at TIMESTAMPTZ,
    closed_by INTEGER REFERENCES users(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_incidents_project ON incidents(project_id, status)`,

  // HSE inspections (typed) — inspection_type carries the register kind
  // (site | equipment | housekeeping | ppe | permit-compliance | other).
  `CREATE TABLE IF NOT EXISTS hse_inspections (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    inspection_date DATE DEFAULT CURRENT_DATE,
    inspector_id INTEGER REFERENCES users(id),
    checklist_items JSONB DEFAULT '[]',
    findings TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    inspection_type VARCHAR(50),
    location_id INTEGER,
    photos JSONB DEFAULT '[]',
    follow_up_due DATE,
    action_item_id INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS idx_hse_inspections_project ON hse_inspections(project_id)`,

  // ------------------------------------------------------------------
  // New HSE entities
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS inductions (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    person_name VARCHAR(255) NOT NULL,
    organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    induction_date DATE DEFAULT CURRENT_DATE,
    induction_type VARCHAR(50) DEFAULT 'site', -- site | general | visitor | refresher
    status VARCHAR(30) DEFAULT 'completed',     -- completed | pending | expired
    trainer VARCHAR(255),
    valid_until DATE,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_inductions_project ON inductions(project_id)`,

  `CREATE TABLE IF NOT EXISTS toolbox_talks (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    topic VARCHAR(255),
    held_at TIMESTAMPTZ DEFAULT NOW(),
    conducted_by VARCHAR(255),
    attendees_count INTEGER DEFAULT 0,
    attendees JSONB DEFAULT '[]',
    notes TEXT,
    photos JSONB DEFAULT '[]',
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_toolbox_talks_project ON toolbox_talks(project_id)`,

  `CREATE TABLE IF NOT EXISTS jsas (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    activity VARCHAR(255),
    hazards JSONB DEFAULT '[]',     -- [{ hazard, risk, control }]
    controls TEXT,
    status VARCHAR(30) DEFAULT 'draft', -- draft | reviewed | approved | superseded
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_jsas_project ON jsas(project_id)`,

  `CREATE TABLE IF NOT EXISTS risk_assessments (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    activity VARCHAR(255),
    likelihood VARCHAR(20),       -- low | medium | high
    severity VARCHAR(20),         -- low | medium | high
    risk_level VARCHAR(20),       -- derived: low | medium | high | critical
    controls TEXT,
    residual_risk VARCHAR(20),
    assessor VARCHAR(255),
    assessment_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(30) DEFAULT 'draft',
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_risk_assessments_project ON risk_assessments(project_id)`,

  // Permits to work — typed; sign-off types route through the Phase 6
  // 'permit' workflow template before work may start.
  `CREATE TABLE IF NOT EXISTS permits (
    id SERIAL PRIMARY KEY,
    permit_number VARCHAR(50) UNIQUE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    permit_type VARCHAR(30) NOT NULL DEFAULT 'work', -- work | hot_work | lifting | excavation | confined_space
    title VARCHAR(255) NOT NULL,
    project_location_id INTEGER REFERENCES project_locations(id) ON DELETE SET NULL,
    description TEXT,
    conditions TEXT,
    precautions JSONB DEFAULT '[]',
    valid_from TIMESTAMPTZ,
    valid_to TIMESTAMPTZ,
    status VARCHAR(30) DEFAULT 'draft',
    requested_by INTEGER REFERENCES users(id),
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    approved_by INTEGER REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    suspended_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    workflow_instance_id INTEGER,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_permits_project ON permits(project_id, status)`,

  `CREATE TABLE IF NOT EXISTS near_misses (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    near_miss_number VARCHAR(50) UNIQUE,
    incident_date DATE DEFAULT CURRENT_DATE,
    project_location_id INTEGER REFERENCES project_locations(id) ON DELETE SET NULL,
    category VARCHAR(100),
    severity VARCHAR(20) DEFAULT 'minor',
    description TEXT NOT NULL,
    immediate_action TEXT,
    reported_by INTEGER REFERENCES users(id),
    status VARCHAR(30) DEFAULT 'open', -- open | closed
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_near_misses_project ON near_misses(project_id)`,

  `CREATE TABLE IF NOT EXISTS ppe_records (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    person_name VARCHAR(255) NOT NULL,
    organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    item VARCHAR(150) NOT NULL,
    quantity INTEGER DEFAULT 1,
    size VARCHAR(50),
    issue_date DATE DEFAULT CURRENT_DATE,
    issued_by VARCHAR(255),
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ppe_records_project ON ppe_records(project_id)`,

  `CREATE TABLE IF NOT EXISTS equipment_inspections (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    asset_id INTEGER,
    equipment_name VARCHAR(255) NOT NULL,
    inspection_date DATE DEFAULT CURRENT_DATE,
    inspector VARCHAR(255),
    result VARCHAR(20) DEFAULT 'pass', -- pass | fail
    defects TEXT,
    next_inspection_date DATE,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_equipment_inspections_project ON equipment_inspections(project_id)`,

  `CREATE TABLE IF NOT EXISTS emergency_drills (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    drill_type VARCHAR(100) NOT NULL,   -- fire | evacuation | rescue | first-aid | other
    drill_date DATE DEFAULT CURRENT_DATE,
    participants_count INTEGER DEFAULT 0,
    findings TEXT,
    improvements TEXT,
    conducted_by VARCHAR(255),
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_emergency_drills_project ON emergency_drills(project_id)`,
];

// The Phase 6 'permit' template — sign-off-before-work for the permit types
// that require it (hot work, confined space, lifting). Seeded idempotently.
async function seedPermitTemplate(query) {
  const exists = await query(`SELECT id FROM workflow_templates WHERE key = $1`, ['permit']);
  if (exists.rows[0]) return false;
  const t = await query(
    `INSERT INTO workflow_templates (key, name, is_active) VALUES ($1, $2, $3) RETURNING id`,
    ['permit', 'Permit to Work', true]
  );
  const templateId = t.rows[0].id;
  const steps = [
    { step_key: 'draft', name: 'Draft', resolver: 'requester' },
    { step_key: 'hse_review', name: 'HSE Review', resolver: 'role', resolver_value: 'engineer' },
    { step_key: 'pm_approval', name: 'PM Approval', resolver: 'role', resolver_value: 'project_manager', is_terminal: true },
  ];
  for (const s of steps) {
    await query(
      `INSERT INTO workflow_steps (template_id, step_key, name, sort_order, mode, resolver_type, resolver_value, conditions, sla_hours, is_terminal)
       VALUES ($1, $2, $3, $4, 'sequential', $5, $6, $7, NULL, $8)`,
      [templateId, s.step_key, s.name, s.step_key === 'draft' ? 1 : (s.step_key === 'hse_review' ? 2 : 3),
       s.resolver === 'requester' ? 'requester' : 'role', s.resolver === 'requester' ? null : s.resolver_value,
       JSON.stringify({}), s.is_terminal === true]
    );
  }
  return true;
}

// Legacy conversion — real PostgreSQL only (the MockDb test subset has no
// DROP/VIEW support, so tests exercise ensureTables() only).
async function convertLegacy(query) {
  // safety_incidents → incidents
  const incidentCols = 'id, project_id, incident_date, incident_type, severity, description, injured_party, reported_by, corrective_action, status, created_at, updated_at';
  const hasLegacy = await query(
    `SELECT 1 AS ok FROM information_schema.tables WHERE table_name = $1 AND table_schema = 'public'`,
    ['safety_incidents']
  );
  const isView = (await query(
    `SELECT COUNT(*)::int AS c FROM information_schema.views WHERE table_name = 'safety_incidents'`
  )).rows[0].c > 0;
  if (hasLegacy.rows[0] && !isView) {
    // One multi-statement query = one implicit transaction: copy, drop and view succeed or fail together.
    await query(`INSERT INTO incidents (${incidentCols}) SELECT ${incidentCols} FROM safety_incidents;
                 DROP TABLE safety_incidents;
                 CREATE VIEW safety_incidents AS SELECT ${incidentCols} FROM incidents;`);
    await setSequenceToMax(query, 'incidents');
  }

  // safety_inspections → hse_inspections
  const inspectionCols = 'id, project_id, inspection_date, inspector_id, checklist_items, findings, status, created_at';
  const hasLegacyI = await query(
    `SELECT 1 AS ok FROM information_schema.tables WHERE table_name = $1 AND table_schema = 'public'`,
    ['safety_inspections']
  );
  const isViewI = (await query(
    `SELECT COUNT(*)::int AS c FROM information_schema.views WHERE table_name = 'safety_inspections'`
  )).rows[0].c > 0;
  if (hasLegacyI.rows[0] && !isViewI) {
    await query(`INSERT INTO hse_inspections (${inspectionCols}) SELECT ${inspectionCols} FROM safety_inspections;
                 DROP TABLE safety_inspections;
                 CREATE VIEW safety_inspections AS SELECT ${inspectionCols} FROM hse_inspections;`);
    await setSequenceToMax(query, 'hse_inspections');
  }
}

async function ensureTables(query) {
  for (const ddl of DDL) {
    await query(ddl);
  }
}

module.exports = { DDL, ensureTables, convertLegacy, seedPermitTemplate };
