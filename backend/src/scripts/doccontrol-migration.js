// Phase 21 migration — enterprise document control: controlled registers,
// transmittals, correspondence, auto-numbering, revision rules.
//
// Run:  node backend/src/scripts/migrate-33-doccontrol.js
//
// The existing version-history and approval-reset logic in doccontrol.js is
// kept and upgraded in place — nothing is removed. `project_documents` gains
// the controlled-register dimension (discipline/type/status/location/
// package/originator/recipient) plus the doc number; `document_versions`
// gains the current/superseded revision semantics (exactly one current
// revision, previous revisions immutable + superseded).

const DDL = [
  // ------------------------------------------------------------------
  // Widening — project_documents (the register dimension)
  // ------------------------------------------------------------------
  `ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS discipline VARCHAR(100)`,
  `ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS doc_type VARCHAR(100)`,
  `ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS doc_status VARCHAR(30) DEFAULT 'draft'`,
  `ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS project_location_id INTEGER REFERENCES project_locations(id) ON DELETE SET NULL`,
  `ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS package VARCHAR(150)`,
  `ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS originator_organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL`,
  `ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS recipient_organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL`,
  `ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS doc_number VARCHAR(120)`,
  `ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS revision_code VARCHAR(20)`,
  `ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS is_current BOOLEAN DEFAULT true`,
  `ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS superseded_by_doc_id INTEGER`,
  `ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS review_due_date DATE`,
  `ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_project_documents_doc_number ON project_documents(project_id, doc_number)`,
  `CREATE INDEX IF NOT EXISTS idx_project_documents_register ON project_documents(project_id, doc_type, discipline)`,
  `CREATE INDEX IF NOT EXISTS idx_project_documents_current ON project_documents(project_id, is_current)`,

  // ------------------------------------------------------------------
  // Widening — document_versions (current/superseded revision semantics)
  // ------------------------------------------------------------------
  `ALTER TABLE document_versions ADD COLUMN IF NOT EXISTS revision_code VARCHAR(20)`,
  `ALTER TABLE document_versions ADD COLUMN IF NOT EXISTS is_current BOOLEAN DEFAULT true`,
  `ALTER TABLE document_versions ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ`,
  `ALTER TABLE document_versions ADD COLUMN IF NOT EXISTS superseded_by_version_id INTEGER`,
  `ALTER TABLE document_versions ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'current'`,

  // ------------------------------------------------------------------
  // Auto-numbering — PROJECT-DISCIPLINE-TYPE-SEQ-REV, configurable per
  // project; per-(project, discipline, type) sequences.
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS project_numbering_settings (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    doc_prefix VARCHAR(30),             -- defaults to the project code / id
    include_discipline BOOLEAN DEFAULT true,
    include_type BOOLEAN DEFAULT true,
    seq_pad INTEGER DEFAULT 4,
    rev_prefix VARCHAR(5) DEFAULT 'R',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS document_number_sequences (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    discipline VARCHAR(100) NOT NULL DEFAULT '-',
    doc_type VARCHAR(100) NOT NULL DEFAULT '-',
    seq INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_number_sequences ON document_number_sequences(project_id, discipline, doc_type)`,

  // ------------------------------------------------------------------
  // Transmittals (incoming / outgoing) + items
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS transmittals (
    id SERIAL PRIMARY KEY,
    transmittal_number VARCHAR(60) UNIQUE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    direction VARCHAR(20) NOT NULL DEFAULT 'outgoing', -- outgoing | incoming
    purpose TEXT,
    sender_organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    sender_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    recipient_organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    recipient_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    attention VARCHAR(255),
    response_due DATE,
    status VARCHAR(30) DEFAULT 'draft',  -- draft | sent | acknowledged | closed
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ack_note TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_transmittals_project ON transmittals(project_id)`,
  `CREATE TABLE IF NOT EXISTS transmittal_items (
    id SERIAL PRIMARY KEY,
    transmittal_id INTEGER NOT NULL REFERENCES transmittals(id) ON DELETE CASCADE,
    document_id INTEGER REFERENCES project_documents(id) ON DELETE SET NULL,
    item_description VARCHAR(500),
    ref_number VARCHAR(120),
    rev_code VARCHAR(20),
    copies_note VARCHAR(120),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_transmittal_items ON transmittal_items(transmittal_id)`,

  // ------------------------------------------------------------------
  // Correspondence — numbered, revision-safe, audit-trailed
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS correspondence (
    id SERIAL PRIMARY KEY,
    corr_number VARCHAR(60) UNIQUE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    direction VARCHAR(20) NOT NULL DEFAULT 'outgoing',
    corr_type VARCHAR(30) NOT NULL DEFAULT 'letter', -- letter | notice | instruction | claim
    subject VARCHAR(500) NOT NULL,
    body TEXT,
    sender_organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    sender_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    recipient_organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    recipient_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    linked_entity_type VARCHAR(50),
    linked_entity_id INTEGER,
    contract_ref VARCHAR(150),
    response_due DATE,
    status VARCHAR(30) DEFAULT 'draft',  -- draft | sent | received | responded | closed
    responded_at TIMESTAMPTZ,
    response_note TEXT,
    revision INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_correspondence_project ON correspondence(project_id)`,
  `CREATE TABLE IF NOT EXISTS correspondence_history (
    id SERIAL PRIMARY KEY,
    correspondence_id INTEGER NOT NULL REFERENCES correspondence(id) ON DELETE CASCADE,
    from_revision INTEGER NOT NULL,
    to_revision INTEGER NOT NULL,
    note TEXT,
    changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ DEFAULT NOW()
  )`,
];

async function ensureTables(query) {
  for (const ddl of DDL) {
    await query(ddl);
  }
}

module.exports = { DDL, ensureTables };
