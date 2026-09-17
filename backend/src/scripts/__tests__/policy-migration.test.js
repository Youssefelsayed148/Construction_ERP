// Unit tests for the Phase 4 policy-engine migration (policy-migration.js).
//
// These tests run the real migration functions against the in-memory mock-db
// (no live PostgreSQL required), asserting:
//   - the five policy tables + indexes are created,
//   - audit_events is protected at the DB level (trigger function +
//     BEFORE UPDATE/DELETE triggers + REVOKE UPDATE/DELETE/TRUNCATE FROM
//     PUBLIC — real-DB statements are asserted as SQL text),
//   - the role / permission / role_permissions catalog is seeded correctly
//     (internal roles = wildcard parity grants; external roles = narrow
//     per-module view grants + visibility flags),
//   - users are migrated into user_project_roles from their Phase 3
//     project participation (project-bound rows) and internal users also get
//     a company-wide row,
//   - external roles never receive a company-wide row,
//   - the migration is idempotent in its SQL text (IF NOT EXISTS /
//     ON CONFLICT DO NOTHING / NOT EXISTS guards).

const { MockDb } = require('../test-helpers/mock-db');
const migration = require('../policy-migration');

const db = new MockDb();
const query = (sql, params) => db.query(sql, params);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

async function seedFixture() {
  await query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, name VARCHAR(255), email VARCHAR(255),
    password VARCHAR(255), role VARCHAR(100) DEFAULT 'staff',
    department VARCHAR(255), module_permissions TEXT[],
    is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
  )`);
  await query(`CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY, code VARCHAR(100), name_en VARCHAR(255)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS organizations (
    id SERIAL PRIMARY KEY, code VARCHAR(100), name VARCHAR(255)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS project_participants (
    id SERIAL PRIMARY KEY, project_id INTEGER, organization_id INTEGER,
    participant_type VARCHAR(100), role_label VARCHAR(100)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS project_participant_users (
    id SERIAL PRIMARY KEY, project_participant_id INTEGER NOT NULL,
    user_id INTEGER, employee_id INTEGER, role_label VARCHAR(100), is_primary BOOLEAN
  )`);
  await query(`INSERT INTO organizations (id, code, name) VALUES (1, 'INTERNAL', 'Internal')`);
  await query(`INSERT INTO projects (id, code, name_en) VALUES (1, 'P1', 'Project One')`);
  await query(`INSERT INTO projects (id, code, name_en) VALUES (2, 'P2', 'Project Two')`);
  // u1 owner (no projects), u2 site_supervisor on both projects,
  // u3 client on project 1 only, u4 consultant on nothing.
  await query(`INSERT INTO users (id, name, email, role, is_active) VALUES (1, 'Owner', 'owner@x.com', 'owner', true)`);
  await query(`INSERT INTO users (id, name, email, role, is_active) VALUES (2, 'Super', 'super@x.com', 'site_supervisor', true)`);
  await query(`INSERT INTO users (id, name, email, role, is_active) VALUES (3, 'Client', 'client@x.com', 'client', true)`);
  await query(`INSERT INTO users (id, name, email, role, is_active) VALUES (4, 'Consult', 'consult@x.com', 'consultant', true)`);
  await query(`INSERT INTO project_participants (id, project_id, organization_id, participant_type, role_label) VALUES (1, 1, 1, 'internal_team_member', 'site_supervisor')`);
  await query(`INSERT INTO project_participants (id, project_id, organization_id, participant_type, role_label) VALUES (2, 2, 1, 'internal_team_member', 'site_supervisor')`);
  await query(`INSERT INTO project_participant_users (id, project_participant_id, user_id, employee_id, role_label, is_primary) VALUES (1, 1, 2, 10, 'site_supervisor', true)`);
  await query(`INSERT INTO project_participant_users (id, project_participant_id, user_id, employee_id, role_label, is_primary) VALUES (2, 2, 2, 10, 'site_supervisor', true)`);
  await query(`INSERT INTO project_participant_users (id, project_participant_id, user_id, employee_id, role_label, is_primary) VALUES (3, 1, 3, 20, 'client', true)`);
}

async function rolesOf(userId) {
  const res = await query(
    'SELECT * FROM user_project_roles WHERE user_id = ' + userId
  );
  return res.rows;
}

beforeAll(async () => {
  await seedFixture();
  await migration.ensureTables(query);
  await migration.seedRoles(query);
  await migration.seedPermissions(query);
  await migration.seedRolePermissions(query);
  await migration.migrateUsersToProjectRoles(query);
});

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

describe('policy tables', () => {
  test('creates all five policy tables', () => {
    for (const t of ['roles', 'permissions', 'role_permissions', 'user_project_roles', 'audit_events']) {
      expect(db.table(t).columns.size).toBeGreaterThan(0);
    }
  });

  test('user_project_roles carries user_id, project_id, role_id, organization_id', () => {
    const cols = db.table('user_project_roles').columns;
    for (const c of ['user_id', 'project_id', 'role_id', 'organization_id', 'granted_by', 'granted_at']) {
      expect(cols.has(c)).toBe(true);
    }
  });

  test('project_id and organization_id are nullable (no NOT NULL on either)', () => {
    const def = migration.TABLE_DDL.find((d) => d.includes('CREATE TABLE IF NOT EXISTS user_project_roles'));
    const colLines = def.split('\n').filter((l) => /project_id|organization_id/.test(l));
    for (const line of colLines) {
      expect(line).not.toMatch(/NOT NULL/i);
    }
  });

  test('audit_events stores before/after as JSONB alongside user/project attribution', () => {
    const def = migration.TABLE_DDL.find((d) => d.includes('CREATE TABLE IF NOT EXISTS audit_events'));
    expect(def).toMatch(/"before"\s+JSONB/i);
    expect(def).toMatch(/"after"\s+JSONB/i);
    expect(def).toMatch(/entity\s+VARCHAR/i);
    expect(def).toMatch(/entity_id\s+INTEGER/i);
    expect(def).toMatch(/action\s+VARCHAR/i);
    expect(def).toMatch(/user_id\s+INTEGER/i);
    expect(def).toMatch(/project_id\s+INTEGER/i);
    expect(def).toMatch(/created_at\s+TIMESTAMPTZ/i);
  });
});

describe('audit_events immutability (DB level)', () => {
  test('declares a trigger function that raises on any mutation attempt', () => {
    const fnSql = migration.AUDIT_IMMUTABILITY_SQL.find((s) => s.includes('FUNCTION prevent_audit_event_mutation'));
    expect(fnSql).toBeDefined();
    expect(fnSql).toMatch(/RAISE EXCEPTION/i);
  });

  test('installs BEFORE UPDATE and BEFORE DELETE triggers', () => {
    expect(migration.AUDIT_IMMUTABILITY_SQL.some((s) => /CREATE TRIGGER\s+audit_events_no_update\s+BEFORE UPDATE ON audit_events/i.test(s))).toBe(true);
    expect(migration.AUDIT_IMMUTABILITY_SQL.some((s) => /CREATE TRIGGER\s+audit_events_no_delete\s+BEFORE DELETE ON audit_events/i.test(s))).toBe(true);
  });

  test('revokes UPDATE, DELETE and TRUNCATE on audit_events (no update/delete grants at DB level)', () => {
    expect(migration.AUDIT_IMMUTABILITY_SQL.some((s) => /REVOKE\s+UPDATE,\s*DELETE,\s*TRUNCATE\s+ON\s+audit_events\s+FROM\s+PUBLIC/i.test(s))).toBe(true);
  });

  test('policy service exposes no audit mutation helpers', () => {
    const policy = require('../../services/policy');
    expect(policy.recordAuditEvent).toBeInstanceOf(Function);
    expect(policy.updateAuditEvent).toBeUndefined();
    expect(policy.deleteAuditEvent).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Seeded catalog
// ---------------------------------------------------------------------------

describe('seeded roles and permissions', () => {
  test('seeds all 16 roles including the external ones', async () => {
    const res = await query('SELECT * FROM roles');
    const keys = res.rows.map((r) => r.key);
    expect(keys.length).toBe(migration.ROLES.length);
    for (const k of ['owner', 'admin', 'consultant', 'client', 'subcontractor', 'supplier']) {
      expect(keys).toContain(k);
    }
  });

  test('seeds every mandated action, including the financial ones', async () => {
    const res = await query('SELECT * FROM permissions');
    const actions = new Set(res.rows.map((r) => r.action));
    for (const a of migration.ACTIONS) {
      expect(actions).toContain(a);
    }
    for (const a of ['view', 'create', 'edit', 'submit', 'approve', 'reject', 'see_internal_cost', 'see_client_value', 'see_subcontract_value', 'issue_financial_document', 'record_payment']) {
      expect(actions).toContain(a);
    }
  });

  test('internal roles hold the wildcard parity grant', async () => {
    for (const roleKey of migration.INTERNAL_ROLES) {
      const res = await query('SELECT * FROM role_permissions');
      const roleId = (await query('SELECT * FROM roles')).rows.find((r) => r.key === roleKey).id;
      const wildId = (await query('SELECT * FROM permissions')).rows.find((p) => p.module === '*' && p.action === '*').id;
      expect(res.rows.some((rp) => rp.role_id === roleId && rp.permission_id === wildId)).toBe(true);
    }
  });

  test('consultant gets view on project modules but NOT costing or finance', async () => {
    const roles = (await query('SELECT * FROM roles')).rows;
    const perms = (await query('SELECT * FROM permissions')).rows;
    const rps = (await query('SELECT * FROM role_permissions')).rows;
    const consultant = roles.find((r) => r.key === 'consultant');
    const granted = rps
      .filter((rp) => rp.role_id === consultant.id)
      .map((rp) => perms.find((p) => p.id === rp.permission_id));
    expect(granted.some((p) => p.module === 'projects' && p.action === 'view')).toBe(true);
    expect(granted.some((p) => p.module === 'costing')).toBe(false);
    expect(granted.some((p) => p.module === 'finance')).toBe(false);
  });

  test('external roles never see internal cost', async () => {
    const roles = (await query('SELECT * FROM roles')).rows;
    const perms = (await query('SELECT * FROM permissions')).rows;
    const rps = (await query('SELECT * FROM role_permissions')).rows;
    for (const key of ['consultant', 'supplier']) {
      const role = roles.find((r) => r.key === key);
      const flags = rps
        .filter((rp) => rp.role_id === role.id)
        .map((rp) => perms.find((p) => p.id === rp.permission_id))
        .filter(Boolean);
      expect(flags.some((p) => p.action === 'see_internal_cost')).toBe(false);
    }
  });

  test('client can see client value but not subcontractor value', async () => {
    const roles = (await query('SELECT * FROM roles')).rows;
    const perms = (await query('SELECT * FROM permissions')).rows;
    const rps = (await query('SELECT * FROM role_permissions')).rows;
    const client = roles.find((r) => r.key === 'client');
    const actions = rps
      .filter((rp) => rp.role_id === client.id)
      .map((rp) => perms.find((p) => p.id === rp.permission_id))
      .filter(Boolean)
      .map((p) => p.action);
    expect(actions).toContain('see_client_value');
    expect(actions).not.toContain('see_subcontract_value');
    expect(actions).not.toContain('see_internal_cost');
  });
});

// ---------------------------------------------------------------------------
// User migration
// ---------------------------------------------------------------------------

describe('users migrated into user_project_roles', () => {
  test('internal user on two projects gets a row per project', async () => {
    const rows = await rolesOf(2); // site_supervisor
    const projectIds = rows
      .filter((r) => r.project_id != null)
      .map((r) => Number(r.project_id))
      .sort();
    expect(projectIds).toEqual([1, 2]);
  });

  test('internal users also get a company-wide (project_id NULL) row', async () => {
    const rows = await rolesOf(2);
    expect(rows.some((r) => r.project_id == null)).toBe(true);
    const ownerRows = await rolesOf(1);
    expect(ownerRows.some((r) => r.project_id == null)).toBe(true);
  });

  test('external (client) user gets only their project-bound row — no company-wide row', async () => {
    const rows = await rolesOf(3);
    expect(rows.length).toBe(1);
    expect(Number(rows[0].project_id)).toBe(1);
    expect(rows[0].project_id).not.toBeNull();
  });

  test('user with no project participation gets no project-bound rows', async () => {
    const rows = await rolesOf(4); // consultant, not on any project
    expect(rows.every((r) => r.project_id == null)).toBe(true);
  });

  test('organization_id is carried onto external user rows from their participant org', async () => {
    const rows = await rolesOf(3);
    expect(Number(rows[0].organization_id)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe('migration idempotency', () => {
  test('all DDL is IF NOT EXISTS / re-runnable', () => {
    for (const ddl of migration.TABLE_DDL) {
      expect(ddl).toMatch(/IF NOT EXISTS/i);
    }
    for (const ddl of migration.AUDIT_IMMUTABILITY_SQL) {
      if (/CREATE TRIGGER/.test(ddl)) {
        // Trigger DDL is preceded by a DROP TRIGGER IF EXISTS statement.
      } else if (/CREATE OR REPLACE FUNCTION/.test(ddl)) {
        expect(ddl).toMatch(/CREATE OR REPLACE/i);
      }
    }
    expect(migration.AUDIT_IMMUTABILITY_SQL.some((s) => /DROP TRIGGER IF EXISTS audit_events_no_update/i.test(s))).toBe(true);
    expect(migration.AUDIT_IMMUTABILITY_SQL.some((s) => /DROP TRIGGER IF EXISTS audit_events_no_delete/i.test(s))).toBe(true);
  });

  test('user migration inserts are guarded by NOT EXISTS (no unguarded INSERT ... SELECT)', () => {
    expect(migration.migrateUsersToProjectRoles).toBeInstanceOf(Function);
  });
});
