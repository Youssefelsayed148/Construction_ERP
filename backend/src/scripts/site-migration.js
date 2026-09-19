// Phase 15 migration core — site operations.
//
// Steps (all idempotent):
//   ensureTables        — photos (the shared photo-metadata model), sticky_notes
//   widenSiteVisits     — visitor organization/user/role, visit type, attendees,
//                         purpose, inspected activities, referenced documents
//   widenDailyReports   — assembled_from JSONB (the auto-populated source
//                         census) + engineer's typed-only fields
//   widenInstructions   — assigned_to_user_id (who must act on it) +
//                         acknowledged_at/implemented_at stamps
//
// photos is built once and reused by daily reports, site visits and the
// Phase 16 observation workflow alike (project, location, linked record,
// uploader, organization, captured/uploaded time, optional GPS, caption,
// annotation layer).

'use strict';

const DDL = [
  `CREATE TABLE IF NOT EXISTS uploaded_files (
    file_name VARCHAR(255) PRIMARY KEY,
    uploaded_by INTEGER NOT NULL REFERENCES users(id),
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  // ------------------------------------------------------------------
  // Shared photo-metadata model
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS photos (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    location_id INTEGER REFERENCES project_locations(id) ON DELETE SET NULL,
    linked_entity_type VARCHAR(50),
    linked_entity_id INTEGER,
    file_name VARCHAR(500),
    file_url VARCHAR(1000),
    uploader_user_id INTEGER REFERENCES users(id),
    organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    captured_at TIMESTAMPTZ,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    gps_lat DECIMAL(10,7),
    gps_lng DECIMAL(10,7),
    caption VARCHAR(1000),
    annotations JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_photos_project ON photos(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_photos_linked ON photos(linked_entity_type, linked_entity_id)`,

  // ------------------------------------------------------------------
  // Sticky notes — personal / project-shared / location-linked /
  // record-linked, optional reminder, convert-to-action feeds Phase 7.
  // These are NEVER contractual correspondence (no document number, no
  // register, no workflow) — they are workspace scratch, deliberately
  // unsuitable to become an official document.
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS sticky_notes (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    scope VARCHAR(20) NOT NULL DEFAULT 'personal', -- personal | project | location | record
    owner_user_id INTEGER NOT NULL REFERENCES users(id),
    location_id INTEGER REFERENCES project_locations(id) ON DELETE SET NULL,
    linked_entity_type VARCHAR(50),
    linked_entity_id INTEGER,
    text VARCHAR(2000) NOT NULL,
    color VARCHAR(20) DEFAULT 'yellow',
    reminder_at TIMESTAMPTZ,
    reminder_notified_at TIMESTAMPTZ,
    converted_action_item_id INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sticky_notes_project ON sticky_notes(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sticky_notes_owner ON sticky_notes(owner_user_id)`,

  // ------------------------------------------------------------------
  // site_visits widening
  // ------------------------------------------------------------------
  `ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS visitor_organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL`,
  `ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS visitor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`,
  `ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS visit_type VARCHAR(50) DEFAULT 'inspection'`,
  `ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS attendees JSONB DEFAULT '[]'`,
  `ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS purpose TEXT`,
  `ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS inspected_activities JSONB DEFAULT '[]'`,
  `ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS referenced_document_ids JSONB DEFAULT '[]'`,

  // ------------------------------------------------------------------
  // site_daily_reports widening — the auto-assembled census lives in
  // assembled_from; the engineer types only narrative/issues/blockers/plan.
  // ------------------------------------------------------------------
  `ALTER TABLE site_daily_reports ADD COLUMN IF NOT EXISTS assembled_from JSONB DEFAULT '{}'`,
  `ALTER TABLE site_daily_reports ADD COLUMN IF NOT EXISTS narrative TEXT`,
  `ALTER TABLE site_daily_reports ADD COLUMN IF NOT EXISTS issues_blockers TEXT`,
  `ALTER TABLE site_daily_reports ADD COLUMN IF NOT EXISTS next_day_plan TEXT`,
  `ALTER TABLE site_daily_reports ADD COLUMN IF NOT EXISTS assembled_at TIMESTAMPTZ`,

  // ------------------------------------------------------------------
  // engineer_instructions widening — the assignee the Phase 7 action item
  // targets, plus explicit lifecycle stamps.
  // ------------------------------------------------------------------
  `ALTER TABLE engineer_instructions ADD COLUMN IF NOT EXISTS assigned_to_user_id INTEGER REFERENCES users(id)`,
  `ALTER TABLE engineer_instructions ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ`,
  `ALTER TABLE engineer_instructions ADD COLUMN IF NOT EXISTS implemented_at TIMESTAMPTZ`,
  `ALTER TABLE engineer_instructions ADD COLUMN IF NOT EXISTS action_item_id INTEGER`,
];

async function ensureTables(query) {
  for (const ddl of DDL) {
    await query(ddl);
  }
}

module.exports = { DDL, ensureTables };
