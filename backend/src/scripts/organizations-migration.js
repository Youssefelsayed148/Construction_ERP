// Phase 3 — Core data architecture: Organizations, participants, locations, WBS,
// cost codes.
//
// This module holds the testable migration logic for Phase 3. The script
// backend/src/scripts/migrate-16-organizations.js is a thin wrapper that
// imports this module and calls each step with the real `query` from
// config/database.
//
// Tests pass a mock query function so they can run the same logic without a
// live PostgreSQL instance.
//
// IMPORTANT CONTEXT FROM PRIOR PHASES:
//   * migrate-15.js already re-targeted project_team.user_id →
//     project_team.employee_id (and dropped user_id). The dump
//     (db_dump/init.sql) is one migration behind, but the live DB is post-15.
//   * migrate-14.js already re-targeted projects.project_manager_id →
//     employees(id).
//   * migrate-12.js already dropped projects.location; address + city remain.
//   * cost_codes already has parent_id (self-FK); Phase 3 adds wbs_node_id.
//   * Phase 2 (migrate-16.js) added project_id to attendance,
//     maintenance_reminders, legal_documents. Phase 3 is a free refactor on
//     top of those shapes; no overlap.

'use strict';

// ---------------------------------------------------------------------------
// SQL strings. Centralised so tests can inspect them and the script can
// execute them. Every CREATE statement uses IF NOT EXISTS / IF EXISTS so the
// migration is re-runnable.
// ---------------------------------------------------------------------------

const ORG_TYPE_ENUM = `'client', 'consultant', 'subcontractor', 'supplier', 'internal', 'authority', 'testing_lab', 'other'`;

const SCHEMA_STATEMENTS = [
  // 1. organizations — the unified party table.
  `CREATE TABLE IF NOT EXISTS organizations (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    org_type VARCHAR(50) NOT NULL,
    contact_person VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    city VARCHAR(100),
    tax_id VARCHAR(100),
    payment_terms VARCHAR(255),
    credit_limit DECIMAL(15,2) DEFAULT 0,
    classification VARCHAR(100),
    specialties TEXT[] DEFAULT '{}',
    license_no VARCHAR(100),
    insurance_amount DECIMAL(15,2) DEFAULT 0,
    insurance_expiry DATE,
    bank_name VARCHAR(255),
    bank_account VARCHAR(255),
    rating DECIMAL(3,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active',
    legacy_client_id INTEGER,
    legacy_supplier_id INTEGER,
    legacy_subcontractor_id INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_organizations_org_type ON organizations(org_type)`,
  `CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_legacy_client
     ON organizations(legacy_client_id) WHERE legacy_client_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_legacy_supplier
     ON organizations(legacy_supplier_id) WHERE legacy_supplier_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_legacy_subcontractor
     ON organizations(legacy_subcontractor_id) WHERE legacy_subcontractor_id IS NOT NULL`,

  // 2. organization_contacts — multiple contacts per organization.
  `CREATE TABLE IF NOT EXISTS organization_contacts (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(100),
    phone VARCHAR(50),
    email VARCHAR(255),
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_organization_contacts_org ON organization_contacts(organization_id)`,

  // 3. organization_documents — attachments per organization.
  `CREATE TABLE IF NOT EXISTS organization_documents (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    document_type VARCHAR(100),
    description TEXT,
    file_url TEXT,
    file_size_bytes BIGINT,
    uploaded_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_organization_documents_org ON organization_documents(organization_id)`,

  // 4. organization_users — login accounts associated with an organization
  //    (portal access). A user can belong to multiple orgs (e.g. an employee
  //    who is also a director of a supplier org).
  `CREATE TABLE IF NOT EXISTS organization_users (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_at_org VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_organization_users_user ON organization_users(user_id)`,

  // 5. project_participants — links projects to orgs with a role label.
  //    participant_type mirrors organizations.org_type; 'internal_team_member'
  //    is the special type for staff rows (project_team rows migrated into
  //    this table by the backfill below).
  `CREATE TABLE IF NOT EXISTS project_participants (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    organization_id INTEGER NOT NULL REFERENCES organizations(id),
    participant_type VARCHAR(50) NOT NULL,
    role_label VARCHAR(100),
    contract_reference VARCHAR(255),
    active_from TIMESTAMPTZ,
    active_to TIMESTAMPTZ,
    portal_access_enabled BOOLEAN DEFAULT false,
    visibility_policy VARCHAR(50) DEFAULT 'standard',
    legacy_client_id INTEGER,
    legacy_supplier_id INTEGER,
    legacy_subcontractor_id INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_project_participants_project ON project_participants(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_project_participants_org ON project_participants(organization_id)`,
  `CREATE INDEX IF NOT EXISTS idx_project_participants_type ON project_participants(participant_type)`,

  // 6. project_participant_users — one project_participant can be linked to
  //    multiple users (e.g. a subcontractor org has several login accounts).
  //    employee_id is the post-migrate-15 reference for internal staff.
  `CREATE TABLE IF NOT EXISTS project_participant_users (
    id SERIAL PRIMARY KEY,
    project_participant_id INTEGER NOT NULL REFERENCES project_participants(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    employee_id INTEGER REFERENCES employees(id),
    role_label VARCHAR(100),
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_project_participant_users_pp ON project_participant_users(project_participant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_project_participant_users_user ON project_participant_users(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_project_participant_users_employee ON project_participant_users(employee_id)`,

  // 7. location_types — typed, hierarchical. Seeded below.
  `CREATE TABLE IF NOT EXISTS location_types (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    name_ar VARCHAR(255),
    parent_id INTEGER REFERENCES location_types(id),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // 8. project_locations — typed location tree per project.
  `CREATE TABLE IF NOT EXISTS project_locations (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES project_locations(id) ON DELETE CASCADE,
    location_type_id INTEGER REFERENCES location_types(id),
    code VARCHAR(50),
    name VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    name_ar VARCHAR(255),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, parent_id, code)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_project_locations_project ON project_locations(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_project_locations_parent ON project_locations(parent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_project_locations_type ON project_locations(location_type_id)`,

  // 9. wbs_nodes — the WBS tree per project.
  `CREATE TABLE IF NOT EXISTS wbs_nodes (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES wbs_nodes(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    name_ar VARCHAR(255),
    wbs_level INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, parent_id, code)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_wbs_nodes_project ON wbs_nodes(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_wbs_nodes_parent ON wbs_nodes(parent_id)`,

  // 10. work_packages — leaves of the WBS, the unit of execution.
  `CREATE TABLE IF NOT EXISTS work_packages (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    wbs_node_id INTEGER REFERENCES wbs_nodes(id) ON DELETE SET NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'planned',
    planned_start_date DATE,
    planned_end_date DATE,
    actual_start_date DATE,
    actual_end_date DATE,
    assigned_employee_id INTEGER REFERENCES employees(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, code)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_work_packages_project ON work_packages(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_work_packages_wbs ON work_packages(wbs_node_id)`,

  // 11. boq_location_allocations — Phase 8 will populate the planned/executed/
  //     certified quantity fields. Phase 3 creates the table only.
  `CREATE TABLE IF NOT EXISTS boq_location_allocations (
    id SERIAL PRIMARY KEY,
    boq_item_id INTEGER NOT NULL REFERENCES boq_items(id) ON DELETE CASCADE,
    project_location_id INTEGER NOT NULL REFERENCES project_locations(id) ON DELETE CASCADE,
    planned_quantity DECIMAL(15,3) DEFAULT 0,
    executed_quantity DECIMAL(15,3) DEFAULT 0,
    certified_quantity DECIMAL(15,3) DEFAULT 0,
    remaining_quantity DECIMAL(15,3) GENERATED ALWAYS AS
      (CASE WHEN planned_quantity - executed_quantity > 0
            THEN planned_quantity - executed_quantity
            ELSE 0 END) STORED,
    unit_cost DECIMAL(15,2) DEFAULT 0,
    cost_amount DECIMAL(15,2) GENERATED ALWAYS AS (planned_quantity * unit_cost) STORED,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(boq_item_id, project_location_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_boq_location_allocations_item ON boq_location_allocations(boq_item_id)`,
  `CREATE INDEX IF NOT EXISTS idx_boq_location_allocations_loc ON boq_location_allocations(project_location_id)`,

  // 12. Mapping tables — preserve the old IDs so callers can keep joining.
  `CREATE TABLE IF NOT EXISTS _migration_client_org_map (
    old_client_id INTEGER PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS _migration_supplier_org_map (
    old_supplier_id INTEGER PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS _migration_subcontractor_org_map (
    old_subcontractor_id INTEGER PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
];

const LOCATION_TYPE_SEED = [
  ['site', 'Site', 'Site', 'الموقع', 0, null],
  ['zone', 'Zone', 'Zone', 'المنطقة', 1, null],
  ['building', 'Building', 'Building', 'المبنى', 2, null],
  ['floor', 'Floor', 'Floor', 'الطابق', 3, null],
  ['block', 'Block', 'Block', 'البلوك', 3, null],
  ['wing', 'Wing', 'Wing', 'الجناح', 3, null],
  ['area', 'Area', 'Area', 'المنطقة الفرعية', 4, null],
  ['room', 'Room', 'Room', 'الغرفة', 5, null],
];

// ---------------------------------------------------------------------------
// Backfill SQL.
//
// Each statement preserves the SOURCE row count when re-run (idempotent via
// legacy_*_id unique partial indexes + ON CONFLICT). The migrations are also
// safe to re-run in any order that respects the dependency graph below.
// ---------------------------------------------------------------------------

const INTERNAL_ORG_CODE = 'INTERNAL';

const BACKFILL_STATEMENTS = [
  // Internal-staff sentinel organization (one per company).
  // NOTE: organizations has no `name` column (only name_ar/name_en) —
  // this used to reference it and would fail on real Postgres
  // ("column name of relation organizations does not exist").
  `INSERT INTO organizations (code, name_en, name_ar, org_type, status)
   VALUES ($1, $2, $3, 'internal', 'active')
   ON CONFLICT (code) DO NOTHING`,
  [
    INTERNAL_ORG_CODE,
    'Internal Staff',
    'الموظفون الداخليون',
  ],

  // Backfill organizations from clients.
  // NOTE: is_active is boolean; organizations.status is a varchar meant to
  // hold 'active'/'inactive' (matching its own DEFAULT and the sentinel
  // org above). A bare `is_active` selects the correct type but the wrong
  // value ('true'/'false' text) — map it explicitly.
  `INSERT INTO organizations (
     code, name_ar, name_en, org_type, contact_person, phone, email,
     address, city, tax_id, payment_terms, credit_limit, status,
     legacy_client_id
   )
   SELECT
     code, name_ar, name_en, 'client',
     contact_person, phone, email,
     address, city, tax_id, payment_terms,
     credit_limit, CASE WHEN is_active THEN 'active' ELSE 'inactive' END,
     id
   FROM clients
   ON CONFLICT (code) DO NOTHING`,

  // Backfill organizations from suppliers. Same is_active -> status mapping.
  `INSERT INTO organizations (
     code, name_ar, name_en, org_type, contact_person, phone, email,
     address, city, tax_id, payment_terms, status, legacy_supplier_id
   )
   SELECT
     code, name_ar, name_en, 'supplier',
     contact_person, phone, email,
     address, city, tax_id, payment_terms,
     CASE WHEN is_active THEN 'active' ELSE 'inactive' END,
     id
   FROM suppliers
   ON CONFLICT (code) DO NOTHING`,

  // Backfill organizations from subcontractors. subcontractors.name is
  // NOT NULL but organizations has no `name` column, so it's folded into
  // name_en/name_ar (falling back to it when those are unset) instead of
  // being selected into a non-existent target column. Same is_active fix.
  `INSERT INTO organizations (
     code, name_en, name_ar, org_type, contact_person, phone, email,
     address, classification, license_no, bank_name, bank_account,
     insurance_amount, insurance_expiry, rating, status,
     legacy_subcontractor_id
   )
   SELECT
     code, COALESCE(name_en, name), COALESCE(name_ar, name), 'subcontractor',
     contact_person, phone, email,
     address, classification, license_no,
     bank_name, bank_account,
     insurance_amount, insurance_expiry,
     rating, CASE WHEN is_active THEN 'active' ELSE 'inactive' END,
     id
   FROM subcontractors
   ON CONFLICT (code) DO NOTHING`,

  // Mapping tables: old → new.
  `INSERT INTO _migration_client_org_map (old_client_id, organization_id)
   SELECT c.id, o.id
   FROM clients c
   JOIN organizations o ON o.legacy_client_id = c.id
   ON CONFLICT (old_client_id) DO NOTHING`,

  `INSERT INTO _migration_supplier_org_map (old_supplier_id, organization_id)
   SELECT s.id, o.id
   FROM suppliers s
   JOIN organizations o ON o.legacy_supplier_id = s.id
   ON CONFLICT (old_supplier_id) DO NOTHING`,

  `INSERT INTO _migration_subcontractor_org_map (old_subcontractor_id, organization_id)
   SELECT s.id, o.id
   FROM subcontractors s
   JOIN organizations o ON o.legacy_subcontractor_id = s.id
   ON CONFLICT (old_subcontractor_id) DO NOTHING`,
];

// ---------------------------------------------------------------------------
// ALTER statements (additive, IF NOT EXISTS).
// ---------------------------------------------------------------------------

const ALTER_STATEMENTS = [
  // projects.organization_id alongside the existing projects.client_id.
  // We keep client_id for now — the route layer reads both during the
  // cutover window; Phase 8 / 9 will retire client_id.
  `ALTER TABLE projects
     ADD COLUMN IF NOT EXISTS organization_id INTEGER
     REFERENCES organizations(id) ON DELETE SET NULL`,
  `CREATE INDEX IF NOT EXISTS idx_projects_organization ON projects(organization_id)`,

  // cost_codes.wbs_node_id — parent_id already exists (migrate-5.2.js).
  `ALTER TABLE cost_codes
     ADD COLUMN IF NOT EXISTS wbs_node_id INTEGER
     REFERENCES wbs_nodes(id) ON DELETE SET NULL`,
  `CREATE INDEX IF NOT EXISTS idx_cost_codes_wbs ON cost_codes(wbs_node_id)`,
];

// ---------------------------------------------------------------------------
// Project_team → project_participants backfill.
//
// Step 1: ensureSchema + ALTER (tables, columns).
// Step 2: backfillClients/Suppliers/Subcontractors → organizations.
// Step 3: build mapping tables.
// Step 4: for each project_team row, create a project_participant
//         (organization_id = internal sentinel org,
//          participant_type = 'internal_team_member', role_label = role).
// Step 5: for each project_participant + employee, attempt to link a user
//         via employees.email = users.email. Best-effort.
// Step 6: UPDATE projects.organization_id via _migration_client_org_map.
//
// The internal sentinel org's id is resolved at run time and passed in as
// $1; IS NOT DISTINCT FROM is rewritten as COALESCE(...)=COALESCE(...) so
// the mock executor and PostgreSQL agree.
// ---------------------------------------------------------------------------

const PROJECTS_BACKFILL_SQL =
  `UPDATE projects p
     SET organization_id = m.organization_id
   FROM _migration_client_org_map m
   WHERE p.client_id = m.old_client_id
     AND p.organization_id IS NULL`;

const PROJECT_PARTICIPANTS_SQL =
  `INSERT INTO project_participants (
     project_id, organization_id, participant_type, role_label,
     active_from, active_to, portal_access_enabled, visibility_policy
   )
   SELECT
     pt.project_id,
     $1::int,
     'internal_team_member',
     pt.role,
     pt.assigned_at,
     NULL,
     false,
     'standard'
   FROM project_team pt
   WHERE NOT EXISTS (
     SELECT 1 FROM project_participants pp
     WHERE pp.project_id = pt.project_id
       AND pp.organization_id = $1::int
       AND pp.participant_type = 'internal_team_member'
       AND pp.role_label = pt.role
   )`;

const PROJECT_PARTICIPANT_USERS_SQL =
  `INSERT INTO project_participant_users (
     project_participant_id, user_id, employee_id, role_label, is_primary
   )
   SELECT
     pp.id,
     u.id,
     pt.employee_id,
     pt.role,
     true
   FROM project_team pt
   JOIN project_participants pp
     ON pp.project_id = pt.project_id
    AND pp.organization_id = $1::int
    AND pp.participant_type = 'internal_team_member'
    AND pp.role_label = pt.role
   LEFT JOIN employees e ON e.id = pt.employee_id
   LEFT JOIN users u ON u.email = e.email AND u.is_active = true
   LEFT JOIN project_participant_users ppu
     ON ppu.project_participant_id = pp.id AND ppu.employee_id = pt.employee_id
   WHERE ppu.id IS NULL
     AND u.id IS NOT NULL`;

const LOCATION_TYPE_SEED_SQL = [
  `INSERT INTO location_types (code, name, name_en, name_ar, sort_order)
   VALUES ($1, $2, $3, $4, $5)
   ON CONFLICT (code) DO NOTHING`,
];

// ---------------------------------------------------------------------------
// Step functions. Each takes a query function as the first arg so tests can
// inject a mock. No side effects at import time.
// ---------------------------------------------------------------------------

async function ensureSchema(query) {
  for (const stmt of SCHEMA_STATEMENTS) {
    await query(stmt);
  }
}

async function runLocationTypeSeed(query) {
  for (const seed of LOCATION_TYPE_SEED) {
    await query(LOCATION_TYPE_SEED_SQL[0], seed);
  }
}

async function runAlters(query) {
  for (const stmt of ALTER_STATEMENTS) {
    await query(stmt);
  }
}

async function ensureInternalOrganization(query) {
  const stmt = BACKFILL_STATEMENTS[0];
  const params = BACKFILL_STATEMENTS[1];
  await query(stmt, params);
  // The sentinel row may already exist from a prior run; SELECT its id.
  return getInternalOrgId(query);
}

async function getInternalOrgId(query) {
  const r = await query(
    `SELECT id FROM organizations WHERE code = $1 LIMIT 1`,
    [INTERNAL_ORG_CODE]
  );
  return r.rows && r.rows[0] ? r.rows[0].id : null;
}

async function backfillClients(query) {
  await query(BACKFILL_STATEMENTS[2]);
}

async function backfillSuppliers(query) {
  await query(BACKFILL_STATEMENTS[3]);
}

async function backfillSubcontractors(query) {
  await query(BACKFILL_STATEMENTS[4]);
}

async function buildMappingTables(query) {
  await query(BACKFILL_STATEMENTS[5]);
  await query(BACKFILL_STATEMENTS[6]);
  await query(BACKFILL_STATEMENTS[7]);
}

async function backfillProjectsOrganizationId(query) {
  // Update via JS loop — the UPDATE...FROM form is harder to verify in the
  // parity test, and the data volume is small.
  const projects = (await query(
    `SELECT id, client_id FROM projects WHERE client_id IS NOT NULL`
  )).rows;
  for (const p of projects) {
    const map = (await query(
      `SELECT organization_id FROM _migration_client_org_map WHERE old_client_id = $1`,
      [p.client_id]
    )).rows[0];
    if (!map) continue;
    await query(
      `UPDATE projects SET organization_id = $1 WHERE id = $2`,
      [map.organization_id, p.id]
    );
  }
}

async function backfillProjectParticipants(query, internalOrgId) {
  if (internalOrgId === null || internalOrgId === undefined) {
    throw new Error('backfillProjectParticipants: internalOrgId is required');
  }
  // Idempotent via JS loop (instead of NOT EXISTS correlated subquery).
  const teams = (await query(
    `SELECT pt.id AS id, pt.project_id AS project_id, pt.role AS role, pt.assigned_at AS assigned_at FROM project_team pt`
  )).rows;
  for (const t of teams) {
    const existing = (await query(
      `SELECT id AS id FROM project_participants
        WHERE project_id = $1 AND organization_id = $2
          AND participant_type = 'internal_team_member'
          AND role_label = $3`,
      [t.project_id, internalOrgId, t.role]
    )).rows[0];
    if (existing) continue;
    await query(
      `INSERT INTO project_participants (
         project_id, organization_id, participant_type, role_label,
         active_from, active_to, portal_access_enabled, visibility_policy
       ) VALUES ($1, $2, 'internal_team_member', $3, $4, NULL, false, 'standard')`,
      [t.project_id, internalOrgId, t.role, t.assigned_at]
    );
  }
}

async function backfillProjectParticipantUsers(query, internalOrgId) {
  if (internalOrgId === null || internalOrgId === undefined) {
    throw new Error('backfillProjectParticipantUsers: internalOrgId is required');
  }
  // Insert via JS loop (instead of a multi-JOIN INSERT...SELECT) so the
  // mock-driven parity test can verify the link without needing the mock
  // to evaluate correlated subqueries or chained LEFT JOINs. We alias the
  // columns to un-qualified names so the JS object keys are predictable.
  const teams = (await query(
    `SELECT pt.id AS id, pt.project_id AS project_id, pt.employee_id AS employee_id, pt.role AS role FROM project_team pt`
  )).rows;
  for (const t of teams) {
    const part = (await query(
      `SELECT pp.id AS id FROM project_participants pp
       WHERE pp.project_id = $1 AND pp.organization_id = $2 AND pp.participant_type = 'internal_team_member' AND pp.role_label = $3`,
      [t.project_id, internalOrgId, t.role]
    )).rows[0];
    if (!part) continue;
    const user = t.employee_id
      ? (await query(
          `SELECT u.id AS id FROM users u JOIN employees e ON e.id = $1 WHERE u.email = e.email`,
          [t.employee_id]
        )).rows[0]
      : null;
    if (!user) continue;
    const existing = (await query(
      `SELECT id AS id FROM project_participant_users WHERE project_participant_id = $1 AND employee_id = $2`,
      [part.id, t.employee_id]
    )).rows[0];
    if (existing) continue;
    await query(
      `INSERT INTO project_participant_users (project_participant_id, user_id, employee_id, role_label, is_primary)
       VALUES ($1, $2, $3, $4, true)`,
      [part.id, user.id, t.employee_id, t.role]
    );
  }
}

async function migrate(query) {
  await ensureSchema(query);
  const internalOrgId = await ensureInternalOrganization(query);
  await runLocationTypeSeed(query);
  await runAlters(query);
  await backfillClients(query);
  await backfillSuppliers(query);
  await backfillSubcontractors(query);
  await buildMappingTables(query);
  await backfillProjectsOrganizationId(query);
  await backfillProjectParticipants(query, internalOrgId);
  await backfillProjectParticipantUsers(query, internalOrgId);
}

module.exports = {
  // Constants
  ORG_TYPE_ENUM,
  INTERNAL_ORG_CODE,
  SCHEMA_STATEMENTS,
  ALTER_STATEMENTS,
  BACKFILL_STATEMENTS,
  PROJECTS_BACKFILL_SQL,
  PROJECT_PARTICIPANTS_SQL,
  PROJECT_PARTICIPANT_USERS_SQL,
  LOCATION_TYPE_SEED,
  // Step functions
  ensureSchema,
  ensureInternalOrganization,
  getInternalOrgId,
  runLocationTypeSeed,
  runAlters,
  backfillClients,
  backfillSuppliers,
  backfillSubcontractors,
  buildMappingTables,
  backfillProjectsOrganizationId,
  backfillProjectParticipants,
  backfillProjectParticipantUsers,
  // Orchestrator
  migrate,
};
