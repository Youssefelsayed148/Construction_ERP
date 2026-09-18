// Phase 16 migration core — consultant portal, observation workflow, and the
// multi-stage RFI / submittal flows.
//
// Steps (all idempotent):
//   ensureTables          — observations + observation_comments +
//                           observation_status_history (the full status
//                           history a construction dispute would need);
//                           rfi_responses + submittal_revisions (multi-stage
//                           revision history)
//   widenRfisSubmittals   — workflow_instance_id / discipline / coordinator /
//                           revision + response-code columns
//   widenObservationTpl   — the Phase 6 catalog's 'consultant_observation'
//                           template gets allow_roles backfilled on its
//                           requester-resolved steps so non-owner actors can
//                           legitimately decide them
//
// Observation states are EXACTLY the Phase 6 catalog states:
//   raised → acknowledged → assigned → rectification_in_progress →
//   submitted_for_verification → accepted/rejected → closed

'use strict';

const DDL = [
  // ------------------------------------------------------------------
  // Observations
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS observations (
    id SERIAL PRIMARY KEY,
    observation_number VARCHAR(50) UNIQUE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    consultant_organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    consultant_user_id INTEGER REFERENCES users(id),
    discipline VARCHAR(100),
    location_id INTEGER REFERENCES project_locations(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    severity VARCHAR(20) DEFAULT 'normal',
    status VARCHAR(50) DEFAULT 'raised',
    workflow_instance_id INTEGER,
    assigned_user_id INTEGER REFERENCES users(id),
    assigned_organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    raised_by_user_id INTEGER REFERENCES users(id),
    raised_at TIMESTAMPTZ DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    assigned_at TIMESTAMPTZ,
    rectification_started_at TIMESTAMPTZ,
    submitted_for_verification_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_observations_project ON observations(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_observations_status ON observations(status)`,
  `CREATE INDEX IF NOT EXISTS idx_observations_org ON observations(consultant_organization_id)`,

  `CREATE TABLE IF NOT EXISTS observation_comments (
    id SERIAL PRIMARY KEY,
    observation_id INTEGER NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
    author_user_id INTEGER REFERENCES users(id),
    organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    comment_type VARCHAR(30) DEFAULT 'comment', -- comment | rectification | rejection | verification | assignment
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_observation_comments_obs ON observation_comments(observation_id)`,

  `CREATE TABLE IF NOT EXISTS observation_status_history (
    id SERIAL PRIMARY KEY,
    observation_id INTEGER NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
    from_status VARCHAR(50),
    to_status VARCHAR(50) NOT NULL,
    actor_user_id INTEGER REFERENCES users(id),
    actor_name VARCHAR(255),
    actor_organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    note TEXT,
    changed_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_observation_status_history ON observation_status_history(observation_id)`,

  // ------------------------------------------------------------------
  // Multi-stage RFI flow (widening the single-answer project_rfis)
  // ------------------------------------------------------------------
  `ALTER TABLE project_rfis ADD COLUMN IF NOT EXISTS workflow_instance_id INTEGER`,
  `ALTER TABLE project_rfis ADD COLUMN IF NOT EXISTS discipline VARCHAR(100)`,
  `ALTER TABLE project_rfis ADD COLUMN IF NOT EXISTS coordinator_user_id INTEGER REFERENCES users(id)`,
  `ALTER TABLE project_rfis ADD COLUMN IF NOT EXISTS revision INTEGER DEFAULT 1`,
  `CREATE TABLE IF NOT EXISTS rfi_responses (
    id SERIAL PRIMARY KEY,
    rfi_id INTEGER NOT NULL REFERENCES project_rfis(id) ON DELETE CASCADE,
    revision INTEGER DEFAULT 1,
    stage VARCHAR(50) NOT NULL,           -- coordinator | discipline_review | official_response | acknowledgement
    responder_user_id INTEGER REFERENCES users(id),
    responder_name VARCHAR(255),
    responder_organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    responder_organization_name VARCHAR(255),
    body TEXT,
    attachments JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_rfi_responses_rfi ON rfi_responses(rfi_id)`,

  // ------------------------------------------------------------------
  // Multi-stage submittals: revisions with A/B/C/D codes
  // ------------------------------------------------------------------
  `ALTER TABLE project_submittals ADD COLUMN IF NOT EXISTS workflow_instance_id INTEGER`,
  `ALTER TABLE project_submittals ADD COLUMN IF NOT EXISTS revision_number INTEGER DEFAULT 1`,
  `ALTER TABLE project_submittals ADD COLUMN IF NOT EXISTS response_code VARCHAR(2)`,
  `CREATE TABLE IF NOT EXISTS submittal_revisions (
    id SERIAL PRIMARY KEY,
    submittal_id INTEGER NOT NULL REFERENCES project_submittals(id) ON DELETE CASCADE,
    revision_number INTEGER DEFAULT 1,
    stage VARCHAR(50) NOT NULL,           -- internal_technical_review | pm | consultant_coordinator | reviewer | response
    actor_user_id INTEGER REFERENCES users(id),
    actor_name VARCHAR(255),
    actor_organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    actor_organization_name VARCHAR(255),
    response_code VARCHAR(2),             -- A (no exceptions) | B | C | D (reject/resubmit)
    comments TEXT,
    attachments JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_submittal_revisions_submittal ON submittal_revisions(submittal_id)`,
];

// The Phase 6 catalog's consultant_observation template has two
// requester-resolved steps ('raised' — completed by the act of raising, and
// 'verification_requested'/'closed'). Without explicit allow_roles only
// owner/admin could decide them; backfill the conditions so the portal roles
// can run the whole lifecycle honestly.
const OBSERVATION_STEP_CONDITIONS = {
  verification_requested: ['site_supervisor', 'project_manager', 'consultant'],
  closed: ['consultant', 'project_manager', 'owner', 'admin'],
};

async function ensureTables(query) {
  for (const ddl of DDL) {
    await query(ddl);
  }
}

async function widenObservationTemplate(query) {
  for (const [stepKey, allowRoles] of Object.entries(OBSERVATION_STEP_CONDITIONS)) {
    await query(
      `UPDATE workflow_steps SET conditions = $1
       WHERE step_key = $2 AND template_id = (SELECT id FROM workflow_templates WHERE key = 'consultant_observation')`,
      [JSON.stringify({ allow_roles: [...allowRoles, 'owner', 'admin'] }), stepKey]
    );
  }
}

module.exports = { DDL, ensureTables, widenObservationTemplate, OBSERVATION_STEP_CONDITIONS };
