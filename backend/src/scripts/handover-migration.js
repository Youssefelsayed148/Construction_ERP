// Phase 25 migration — handover, closeout & warranty (§79, §80).
//
// Run:  node backend/src/scripts/migrate-36-handover.js
//
// Pure net-new build — there is no existing handover path to migrate away
// from. `punch_items` (Phase 19) is REUSED as the handover punch register
// (not duplicated). `handover_package_items` carries the register checklist
// with a 'complete' terminal status that drives the readiness percentage.

const DDL = [
  // The handover lifecycle — the exact §79 state chain, each state a
  // Phase 6 workflow step ('handover' template, seeded below).
  `CREATE TABLE IF NOT EXISTS handover_processes (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    process_number VARCHAR(50) UNIQUE,
    status VARCHAR(40) NOT NULL DEFAULT 'pre_handover',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    workflow_instance_id INTEGER,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS handover_package_items (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    item_type VARCHAR(40) NOT NULL, -- as_built_drawings | o_m_manuals | warranties | test_commissioning_results | certificates | asset_register | keys_access | training_records | authority_approvals
    title VARCHAR(255) NOT NULL,
    required BOOLEAN DEFAULT true,
    status VARCHAR(30) DEFAULT 'pending', -- pending | uploaded | approved | complete
    document_url VARCHAR(1000),
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMPTZ,
    verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_handover_package_items_project ON handover_package_items(project_id)`,

  `CREATE TABLE IF NOT EXISTS asset_register (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    asset_code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    project_location_id INTEGER REFERENCES project_locations(id) ON DELETE SET NULL,
    model VARCHAR(150),
    serial_no VARCHAR(150),
    supplier_organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    subcontractor_organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    commissioning_date DATE,
    warranty_start DATE,
    warranty_end DATE,
    documents JSONB DEFAULT '[]',
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_asset_register_project ON asset_register(project_id)`,

  `CREATE TABLE IF NOT EXISTS warranty_claims (
    id SERIAL PRIMARY KEY,
    claim_number VARCHAR(50) UNIQUE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    asset_id INTEGER REFERENCES asset_register(id) ON DELETE SET NULL,
    project_location_id INTEGER REFERENCES project_locations(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    raised_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    raised_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(30) DEFAULT 'raised', -- raised | assigned | rectification_in_progress | submitted_for_acceptance | accepted | rejected | closed
    assigned_organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ,
    sla_days INTEGER DEFAULT 30,
    due_date DATE,
    rectification_evidence JSONB DEFAULT '[]',
    accepted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    accepted_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    workflow_instance_id INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_warranty_claims_project ON warranty_claims(project_id)`,
];

const HANDOVER_STATE_KEYS = [
  'pre_handover', 'punch_snag', 'rectification', 'final_inspection',
  'testing_commissioning', 'as_builts', 'o_m', 'training', 'taking_over',
  'dlp_warranty', 'final_completion',
];

const WARRANTY_STATE_KEYS = [
  'raised', 'assigned', 'rectification_in_progress', 'submitted_for_acceptance',
  'accepted', 'rejected', 'closed',
];

// Domain status → workflow template step key (the Phase 6 sync surface).
const WARRANTY_STEP_FOR_STATE = {
  raised: 'raised',
  assigned: 'assigned',
  rectification_in_progress: 'rectification_in_progress',
  submitted_for_acceptance: 'submitted_for_acceptance',
  accepted: 'accepted_rejected',
  rejected: 'accepted_rejected',
  closed: 'closed',
};

async function ensureTables(query) {
  for (const ddl of DDL) {
    await query(ddl);
  }
}

// Phase 6 workflow templates for the handover lifecycle and warranty claims —
// seeded idempotently so the domain machines have their catalog entries.
async function seedTemplates(query) {
  let seeded = 0;
  const specs = [
    {
      key: 'handover', name: 'Handover',
      steps: HANDOVER_STATE_KEYS.map((s) => ({ step_key: s, name: s.replace(/_/g, ' ') })),
    },
    {
      key: 'warranty_claim', name: 'Warranty Claim',
      steps: [
        { step_key: 'raised', name: 'Raised' },
        { step_key: 'assigned', name: 'Assigned (PM/subcontractor)' },
        { step_key: 'rectification_in_progress', name: 'Rectification' },
        { step_key: 'submitted_for_acceptance', name: 'Submitted for acceptance' },
        { step_key: 'accepted_rejected', name: 'Accepted/Rejected' },
        { step_key: 'closed', name: 'Closed', is_terminal: true },
      ],
    },
  ];
  for (const spec of specs) {
    const exists = await query(`SELECT id FROM workflow_templates WHERE key = $1`, [spec.key]);
    if (exists.rows[0]) continue;
    const t = await query(
      `INSERT INTO workflow_templates (key, name, is_active) VALUES ($1,$2,$3) RETURNING id`,
      [spec.key, spec.name, true]
    );
    for (const s of spec.steps) {
      await query(
        `INSERT INTO workflow_steps (template_id, step_key, name, sort_order, mode, resolver_type, resolver_value, conditions, sla_hours, is_terminal)
         VALUES ($1,$2,$3,$4,'sequential',$5,$6,$7,NULL,$8)`,
        [t.rows[0].id, s.step_key, s.name, spec.steps.indexOf(s) + 1,
         s.step_key === 'raised' || s.step_key === 'pre_handover' ? 'requester' : 'role',
         s.step_key === 'raised' || s.step_key === 'pre_handover' ? null : 'project_manager',
         JSON.stringify({}), s.is_terminal === true]
      );
    }
    seeded++;
  }
  return seeded;
}

module.exports = { DDL, ensureTables, seedTemplates, WARRANTY_STEP_FOR_STATE };
