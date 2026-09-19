// Phase 18 migration core — subcontractor & supplier portals.
//
// Steps (all idempotent):
//   ensureTables — additive widening only: organization_documents gains an
//                  expiry_date (compliance-document expiry tracking the
//                  supplier dashboard needs). Everything else this phase uses
//                  already exists from Phases 3/6/7/8/12/13/15/16.

'use strict';

const DDL = [
  `ALTER TABLE organization_documents ADD COLUMN IF NOT EXISTS expiry_date DATE`,
  `ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS portal_visibility VARCHAR(30) DEFAULT 'internal'`,
  `ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS sub_contract_id INTEGER REFERENCES sub_contracts(id) ON DELETE SET NULL`,
  `ALTER TABLE observations ADD COLUMN IF NOT EXISTS sub_contract_id INTEGER REFERENCES sub_contracts(id) ON DELETE SET NULL`,
  `ALTER TABLE ncrs ADD COLUMN IF NOT EXISTS sub_contract_id INTEGER REFERENCES sub_contracts(id) ON DELETE SET NULL`,
  `ALTER TABLE project_rfis ADD COLUMN IF NOT EXISTS sub_contract_id INTEGER REFERENCES sub_contracts(id) ON DELETE SET NULL`,
  `ALTER TABLE project_submittals ADD COLUMN IF NOT EXISTS sub_contract_id INTEGER REFERENCES sub_contracts(id) ON DELETE SET NULL`,
  `ALTER TABLE engineer_instructions ADD COLUMN IF NOT EXISTS sub_contract_id INTEGER REFERENCES sub_contracts(id) ON DELETE SET NULL`,
  `CREATE TABLE IF NOT EXISTS portal_submissions (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    submission_type VARCHAR(60) NOT NULL,
    related_entity_type VARCHAR(60),
    related_entity_id INTEGER,
    payload JSONB DEFAULT '{}',
    status VARCHAR(30) DEFAULT 'submitted',
    submitted_by INTEGER REFERENCES users(id),
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_portal_submissions_scope ON portal_submissions(organization_id, project_id, submission_type)`,
];

async function ensureTables(query) {
  for (const ddl of DDL) {
    await query(ddl);
  }
}

module.exports = { DDL, ensureTables };
