// Phase 19 migration — QA/QC deepening (ITP, WIR, checklists, CAPA,
// mock-ups, calibration, punch items) + NCR/quality-test widening.
//
// Run:  node backend/src/scripts/migrate-31-qaqc.js
//
// Design notes:
//   * Every later-phase read treats a missing table as an EMPTY state, never
//     an error — but the tables are created here so the API has schema.
//   * `material_inspection_requests` (Phase 12's MIR) is widened, not
//     duplicated: it already links PO + delivery + supplier + warehouse and
//     controls the Phase 10 quarantine gate. Phase 19 adds the remaining
//     links (material submittal, GRN, project) and the Phase 6 workflow sync.
//   * `punch_items` is created here and REUSED by Phase 25 (handover) — the
//     handover punch register is this table, not a second one.
//   * Nothing existing is removed: ncrs keep severity + open → in_progress →
//     resolved → closed progression, widened in place.

const DDL = [
  // ------------------------------------------------------------------
  // ITP + ITP points
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS itps (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    itp_number VARCHAR(50) UNIQUE,
    title VARCHAR(255) NOT NULL,
    discipline VARCHAR(100),
    work_package VARCHAR(255),
    project_location_id INTEGER REFERENCES project_locations(id) ON DELETE SET NULL,
    status VARCHAR(30) DEFAULT 'active',
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_itps_project ON itps(project_id)`,
  `CREATE TABLE IF NOT EXISTS itp_points (
    id SERIAL PRIMARY KEY,
    itp_id INTEGER NOT NULL REFERENCES itps(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL DEFAULT 1,
    title VARCHAR(255) NOT NULL,
    point_type VARCHAR(20) NOT NULL DEFAULT 'review', -- hold | witness | review
    required_documents JSONB DEFAULT '[]',
    responsible_party VARCHAR(150),
    responsible_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    consultant_responsibility VARCHAR(150),
    acceptance_criteria TEXT,
    checklist_template_id INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_itp_points_itp ON itp_points(itp_id)`,

  // ------------------------------------------------------------------
  // WIRs — work inspection requests, routed through the Phase 6 'wir'
  // template: Site -> QA/QC -> PM (optional) -> Consultant -> result
  // (approved / approved with comments / rejected / reinspect).
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS wirs (
    id SERIAL PRIMARY KEY,
    wir_number VARCHAR(50) UNIQUE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    itp_id INTEGER REFERENCES itps(id) ON DELETE SET NULL,
    itp_point_id INTEGER REFERENCES itp_points(id) ON DELETE SET NULL,
    boq_item_id INTEGER,
    project_location_id INTEGER REFERENCES project_locations(id) ON DELETE SET NULL,
    work_package VARCHAR(255),
    subcontractor_organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    inspection_date DATE DEFAULT CURRENT_DATE,
    latest_drawing_ref VARCHAR(500),
    method_statement_ref VARCHAR(500),
    checklist_instance_id INTEGER,
    photos JSONB DEFAULT '[]',
    notes TEXT,
    status VARCHAR(40) DEFAULT 'draft',
    result VARCHAR(40),
    decision_comment TEXT,
    submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    qa_qc_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    qa_qc_at TIMESTAMPTZ,
    pm_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    pm_at TIMESTAMPTZ,
    consultant_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    consultant_at TIMESTAMPTZ,
    decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ,
    workflow_instance_id INTEGER,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_wirs_project ON wirs(project_id)`,

  // ------------------------------------------------------------------
  // Checklists — templates + instances (WIR/MIR/inspection-grade)
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS checklist_templates (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    discipline VARCHAR(100),
    items JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS checklist_instances (
    id SERIAL PRIMARY KEY,
    template_id INTEGER REFERENCES checklist_templates(id) ON DELETE SET NULL,
    context_type VARCHAR(40) NOT NULL DEFAULT 'wir',
    context_id INTEGER,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255),
    items JSONB DEFAULT '[]',
    completed_at TIMESTAMPTZ,
    completed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_checklist_instances_ctx ON checklist_instances(context_type, context_id)`,

  // ------------------------------------------------------------------
  // CAPA — corrective + preventive actions
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS corrective_actions (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    source_type VARCHAR(40) NOT NULL DEFAULT 'ncr',
    source_id INTEGER,
    description TEXT NOT NULL,
    assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    assigned_role VARCHAR(100),
    due_date DATE,
    status VARCHAR(30) DEFAULT 'open',
    completed_at TIMESTAMPTZ,
    completed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    verification_notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_corrective_actions_project ON corrective_actions(project_id)`,
  `CREATE TABLE IF NOT EXISTS preventive_actions (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    source_type VARCHAR(40) NOT NULL DEFAULT 'ncr',
    source_id INTEGER,
    description TEXT NOT NULL,
    assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    assigned_role VARCHAR(100),
    due_date DATE,
    status VARCHAR(30) DEFAULT 'open',
    completed_at TIMESTAMPTZ,
    completed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    verification_notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_preventive_actions_project ON preventive_actions(project_id)`,

  // ------------------------------------------------------------------
  // Mock-ups + calibration
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS mock_ups (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    discipline VARCHAR(100),
    project_location_id INTEGER REFERENCES project_locations(id) ON DELETE SET NULL,
    subcontractor_organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    status VARCHAR(30) DEFAULT 'proposed', -- proposed | under_review | approved | rejected | rework
    remarks TEXT,
    photos JSONB DEFAULT '[]',
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mock_ups_project ON mock_ups(project_id)`,
  `CREATE TABLE IF NOT EXISTS calibration_records (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    asset_id INTEGER,
    instrument_name VARCHAR(255) NOT NULL,
    serial_no VARCHAR(150),
    calibration_date DATE DEFAULT CURRENT_DATE,
    next_calibration_date DATE,
    certificate_ref VARCHAR(150),
    result VARCHAR(20) DEFAULT 'pass',
    issued_by VARCHAR(255),
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_calibration_records_project ON calibration_records(project_id)`,

  // ------------------------------------------------------------------
  // Punch items (Phase 19 creation, Phase 25 reuse — handover register)
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS punch_items (
    id SERIAL PRIMARY KEY,
    punch_number VARCHAR(50) UNIQUE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    project_location_id INTEGER REFERENCES project_locations(id) ON DELETE SET NULL,
    asset_id INTEGER,
    discipline VARCHAR(100),
    description TEXT NOT NULL,
    photos JSONB DEFAULT '[]',
    responsible_subcontractor_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    responsible_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    due_date DATE,
    verification_authority VARCHAR(100),
    severity VARCHAR(20) DEFAULT 'minor',
    status VARCHAR(30) DEFAULT 'open', -- open | rectified | verified | closed
    raised_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    rectified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    rectified_at TIMESTAMPTZ,
    verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    closed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    closed_at TIMESTAMPTZ,
    workflow_instance_id INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_punch_items_project ON punch_items(project_id)`,

  // ------------------------------------------------------------------
  // Widening — ncrs gain the full Phase 19 field set (severity & state
  // progression untouched).
  // ------------------------------------------------------------------
  `ALTER TABLE ncrs ADD COLUMN IF NOT EXISTS project_location_id INTEGER REFERENCES project_locations(id) ON DELETE SET NULL`,
  `ALTER TABLE ncrs ADD COLUMN IF NOT EXISTS exact_location VARCHAR(255)`,
  `ALTER TABLE ncrs ADD COLUMN IF NOT EXISTS responsible_party VARCHAR(150)`,
  `ALTER TABLE ncrs ADD COLUMN IF NOT EXISTS responsible_organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL`,
  `ALTER TABLE ncrs ADD COLUMN IF NOT EXISTS root_cause TEXT`,
  `ALTER TABLE ncrs ADD COLUMN IF NOT EXISTS corrective_action TEXT`,
  `ALTER TABLE ncrs ADD COLUMN IF NOT EXISTS preventive_action TEXT`,
  `ALTER TABLE ncrs ADD COLUMN IF NOT EXISTS cost_impact DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE ncrs ADD COLUMN IF NOT EXISTS schedule_impact_days INTEGER DEFAULT 0`,
  `ALTER TABLE ncrs ADD COLUMN IF NOT EXISTS verification_notes TEXT`,
  `ALTER TABLE ncrs ADD COLUMN IF NOT EXISTS verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL`,
  `ALTER TABLE ncrs ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ`,
  `ALTER TABLE ncrs ADD COLUMN IF NOT EXISTS closure_authority VARCHAR(150)`,
  `ALTER TABLE ncrs ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ`,
  `ALTER TABLE ncrs ADD COLUMN IF NOT EXISTS corrective_action_id INTEGER`,
  `ALTER TABLE ncrs ADD COLUMN IF NOT EXISTS preventive_action_id INTEGER`,
  `ALTER TABLE ncrs ADD COLUMN IF NOT EXISTS workflow_instance_id INTEGER`,

  // ------------------------------------------------------------------
  // Widening — quality_tests link to an ITP / ITP point / checklist.
  // ------------------------------------------------------------------
  `ALTER TABLE quality_tests ADD COLUMN IF NOT EXISTS itp_id INTEGER REFERENCES itps(id) ON DELETE SET NULL`,
  `ALTER TABLE quality_tests ADD COLUMN IF NOT EXISTS itp_point_id INTEGER REFERENCES itp_points(id) ON DELETE SET NULL`,
  `ALTER TABLE quality_tests ADD COLUMN IF NOT EXISTS checklist_instance_id INTEGER`,

  // ------------------------------------------------------------------
  // Widening — Phase 12's MIR gains the remaining links + Phase 6 sync.
  // ------------------------------------------------------------------
  `ALTER TABLE material_inspection_requests ADD COLUMN IF NOT EXISTS project_id INTEGER`,
  `ALTER TABLE material_inspection_requests ADD COLUMN IF NOT EXISTS material_submittal_id INTEGER`,
  `ALTER TABLE material_inspection_requests ADD COLUMN IF NOT EXISTS grn_id INTEGER`,
  `ALTER TABLE material_inspection_requests ADD COLUMN IF NOT EXISTS certificates JSONB DEFAULT '[]'`,
  `ALTER TABLE material_inspection_requests ADD COLUMN IF NOT EXISTS workflow_instance_id INTEGER`,
];

async function ensureTables(query) {
  for (const ddl of DDL) {
    await query(ddl);
  }
}

module.exports = { DDL, ensureTables };
