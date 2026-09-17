// Phase 4 migration core — scoped policy engine tables.
//
// The data logic lives here (not in the migrate-17 wrapper) so it can be
// exercised against the in-memory mock-db (src/scripts/test-helpers/mock-db.js)
// in unit tests without a live PostgreSQL instance, exactly like
// organizations-migration.js in Phase 3.
//
// Tables created:
//   roles               — seeded role catalog (key, name, is_system)
//   permissions         — (module, action) pairs, '*' wildcard allowed
//   role_permissions    — join table
//   user_project_roles  — per-user, per-project role assignments
//                         (project_id NULL = company-wide assignment;
//                          organization_id NULL for internal roles,
//                          set for external roles)
//   audit_events        — append-only audit trail. UPDATE/DELETE are blocked
//                         at the DB level by triggers + REVOKE (see
//                         AUDIT_IMMUTABILITY_SQL — real-DB only, because the
//                         statements are plpgsql which the mock-db does not
//                         model).
//
// Seeding model (parity with the legacy flat checks):
//   * every internal role gets ('*', '*') — full access, matching today's
//     "no guards anywhere except explicit authorize(...) call sites" reality.
//     Explicit call sites keep their coarse role filter on top (see
//     middleware/auth.js), so owner|admin-only endpoints stay owner|admin-only.
//   * external roles (client, subcontractor, supplier, consultant) get a
//     narrow per-module VIEW grant list + visibility-flag permissions.
//
// User migration:
//   * for every user on a project today (via project_participant_users from
//     Phase 3), insert a user_project_roles row.
//   * internal users additionally get a company-wide (project_id NULL) row so
//     their legacy behavior (access any project) is preserved; external users
//     only get project-bound rows, which makes project ID-guessing fail.
//
// users.role / users.module_permissions are kept untouched as the fallback
// until parity tests pass across every role.

'use strict';

// ---------------------------------------------------------------------------
// Catalog definitions
// ---------------------------------------------------------------------------

const ACTIONS = [
  'view',
  'create',
  'edit',
  'delete',
  'submit',
  'approve',
  'reject',
  'see_internal_cost',
  'see_client_value',
  'see_subcontract_value',
  'issue_financial_document',
  'record_payment',
];

const ROLES = [
  { key: 'owner', name: 'Owner' },
  { key: 'admin', name: 'Administrator' },
  { key: 'finance_manager', name: 'Finance Manager' },
  { key: 'purchasing_mgr', name: 'Purchasing Manager' },
  { key: 'project_manager', name: 'Project Manager' },
  { key: 'legal_mgr', name: 'Legal Manager' },
  { key: 'maintenance_mgr', name: 'Maintenance Manager' },
  { key: 'manager', name: 'Manager' },
  { key: 'staff', name: 'Staff' },
  { key: 'accountant', name: 'Accountant' },
  { key: 'engineer', name: 'Engineer' },
  { key: 'site_supervisor', name: 'Site Supervisor' },
  { key: 'consultant', name: 'Consultant' },
  { key: 'client', name: 'Client' },
  { key: 'subcontractor', name: 'Subcontractor' },
  { key: 'supplier', name: 'Supplier' },
];

// Legacy-internal roles: full ('*','*') parity grants + company-wide rows.
const INTERNAL_ROLES = [
  'owner',
  'admin',
  'finance_manager',
  'purchasing_mgr',
  'project_manager',
  'legal_mgr',
  'maintenance_mgr',
  'manager',
  'staff',
  'accountant',
  'engineer',
  'site_supervisor',
];

// External roles: project-scoped, narrow module grants, no company-wide row.
const EXTERNAL_ROLES = ['consultant', 'client', 'subcontractor', 'supplier'];

// Module keys match the Express mount segment under /api (see server.js).
const EXTERNAL_ROLE_MODULE_GRANTS = {
  consultant: ['projects', 'boq', 'qhse', 'docs', 'work-orders', 'documents'],
  client: ['projects', 'docs', 'qhse', 'boq'],
  subcontractor: ['subcontractors'],
  supplier: ['items', 'warehouses'],
};

// Visibility flags (services/policy.js) resolved from these permissions.
// Internal roles see every figure today (parity with the flat checks), so
// they all hold the three visibility permissions; external roles get only
// their own lens.
const ROLE_VISIBILITY_GRANTS = Object.fromEntries([
  ...INTERNAL_ROLES.map((r) => [r, ['see_internal_cost', 'see_client_value', 'see_subcontract_value']]),
  ['client', ['see_client_value']],
  ['subcontractor', ['see_subcontract_value']],
]);

// ---------------------------------------------------------------------------
// DDL
// ---------------------------------------------------------------------------

const TABLE_DDL = [
  `CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    is_system BOOLEAN DEFAULT true,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS permissions (
    id SERIAL PRIMARY KEY,
    module VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    description TEXT,
    UNIQUE (module, action)
  )`,
  `CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
  )`,
  `CREATE TABLE IF NOT EXISTS user_project_roles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    organization_id INTEGER REFERENCES organizations(id),
    granted_by INTEGER REFERENCES users(id),
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, project_id, role_id)
  )`,
  `CREATE TABLE IF NOT EXISTS audit_events (
    id SERIAL PRIMARY KEY,
    entity VARCHAR(100) NOT NULL,
    entity_id INTEGER,
    action VARCHAR(100) NOT NULL,
    "before" JSONB,
    "after" JSONB,
    user_id INTEGER REFERENCES users(id),
    project_id INTEGER REFERENCES projects(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_user_project_roles_user ON user_project_roles(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_project_roles_project ON user_project_roles(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity, entity_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_events_user ON audit_events(user_id)`,
];

// Real-PostgreSQL-only statements: audit_events is append-only at the DB
// level. No UPDATE/DELETE grant exists on this table (triggers raise on any
// attempt and the privileges are revoked from PUBLIC).
const AUDIT_IMMUTABILITY_SQL = [
  `CREATE OR REPLACE FUNCTION prevent_audit_event_mutation() RETURNS trigger AS $$
   BEGIN
     RAISE EXCEPTION 'audit_events is append-only: % not allowed', TG_OP;
   END;
   $$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events`,
  `CREATE TRIGGER audit_events_no_update
     BEFORE UPDATE ON audit_events
     FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation()`,
  `DROP TRIGGER IF EXISTS audit_events_no_delete ON audit_events`,
  `CREATE TRIGGER audit_events_no_delete
     BEFORE DELETE ON audit_events
     FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation()`,
  `REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM PUBLIC`,
];

async function ensureTables(query) {
  for (const ddl of TABLE_DDL) {
    await query(ddl);
  }
}

async function ensureAuditImmutability(query) {
  for (const ddl of AUDIT_IMMUTABILITY_SQL) {
    await query(ddl);
  }
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

async function seedRoles(query) {
  for (const role of ROLES) {
    await query(
      `INSERT INTO roles (key, name, is_system)
       VALUES ($1, $2, true)
       ON CONFLICT (key) DO NOTHING`,
      [role.key, role.name]
    );
  }
}

// Module keys that appear in external role grants — the per-module VIEW
// permission rows those grants point at. (Internal roles authorize through
// the ('*', '*') wildcard row.)
const MODULE_VIEW_CATALOG = [
  ...new Set(Object.values(EXTERNAL_ROLE_MODULE_GRANTS).flat()),
];

async function seedPermissions(query) {
  // Wildcard rows: the ('*','*') parity grant plus per-action wildcards.
  for (const action of ACTIONS) {
    await query(
      `INSERT INTO permissions (module, action, description)
       VALUES ('*', $1, $2)
       ON CONFLICT (module, action) DO NOTHING`,
      [action, `Wildcard action: ${action} on every module`]
    );
  }
  await query(
    `INSERT INTO permissions (module, action, description)
     VALUES ('*', '*', 'Wildcard — every module and every action')
     ON CONFLICT (module, action) DO NOTHING`
  );
  // Per-module VIEW rows for the externally granted modules.
  for (const module of MODULE_VIEW_CATALOG) {
    await query(
      `INSERT INTO permissions (module, action, description)
       VALUES ($1, 'view', $2)
       ON CONFLICT (module, action) DO NOTHING`,
      [module, `View access to ${module}`]
    );
  }
}

async function getRoleId(query, key) {
  const res = await query('SELECT id FROM roles WHERE key = $1', [key]);
  return res.rows.length ? res.rows[0].id : null;
}

async function getPermissionId(query, module, action) {
  const res = await query(
    'SELECT id FROM permissions WHERE module = $1 AND action = $2',
    [module, action]
  );
  return res.rows.length ? res.rows[0].id : null;
}

async function grant(query, roleKey, module, action) {
  const roleId = await getRoleId(query, roleKey);
  const permissionId = await getPermissionId(query, module, action);
  if (roleId == null || permissionId == null) return;
  const existing = await query(
    'SELECT 1 FROM role_permissions WHERE role_id = $1 AND permission_id = $2',
    [roleId, permissionId]
  );
  if (existing.rows.length > 0) return;
  await query(
    'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)',
    [roleId, permissionId]
  );
}

async function seedRolePermissions(query) {
  for (const roleKey of INTERNAL_ROLES) {
    await grant(query, roleKey, '*', '*');
  }
  for (const [roleKey, modules] of Object.entries(EXTERNAL_ROLE_MODULE_GRANTS)) {
    for (const moduleKey of modules) {
      await grant(query, roleKey, moduleKey, 'view');
    }
  }
  for (const [roleKey, flags] of Object.entries(ROLE_VISIBILITY_GRANTS)) {
    for (const flag of flags) {
      await grant(query, roleKey, '*', flag);
    }
  }
}

// ---------------------------------------------------------------------------
// User migration — users.role + project participation → user_project_roles
// ---------------------------------------------------------------------------

async function migrateUsersToProjectRoles(query) {
  // Read the simple inputs as flat row sets and perform the join in JS —
  // keeps the script runnable under the in-memory mock-db test executor
  // and re-runnable (every insert is guarded by an existence check).
  const participants = await query(
    'SELECT id, project_id, organization_id FROM project_participants'
  );
  const links = await query(
    'SELECT project_participant_id, user_id FROM project_participant_users'
  );
  const userRows = await query('SELECT id, role FROM users');
  const roleRows = await query('SELECT id, key FROM roles');
  const existing = await query(
    'SELECT user_id, project_id, role_id FROM user_project_roles'
  );

  const participantById = new Map(participants.rows.map((p) => [Number(p.id), p]));
  const roleByKey = new Map(roleRows.rows.map((r) => [r.key, Number(r.id)]));
  const userById = new Map(userRows.rows.map((u) => [Number(u.id), u]));
  const existingKey = (userId, projectId, roleId) =>
    `${Number(userId)}|${projectId == null ? 'NULL' : Number(projectId)}|${Number(roleId)}`;
  const seen = new Set(
    existing.rows.map((r) => existingKey(r.user_id, r.project_id, r.role_id))
  );

  // 1. Every user participating in a project today gets a role row for it.
  for (const link of links.rows) {
    const participant = participantById.get(Number(link.project_participant_id));
    const user = userById.get(Number(link.user_id));
    if (!participant || !user) continue;
    const roleId = roleByKey.get(user.role);
    if (roleId == null) continue;
    const key = existingKey(user.id, participant.project_id, roleId);
    if (seen.has(key)) continue;
    await query(
      `INSERT INTO user_project_roles (user_id, project_id, role_id, organization_id)
       VALUES ($1, $2, $3, $4)`,
      [Number(user.id), participant.project_id == null ? null : Number(participant.project_id), roleId,
       participant.organization_id == null ? null : Number(participant.organization_id)]
    );
    seen.add(key);
  }

  // 2. Internal users get a company-wide (project_id NULL) row so their
  //    legacy behavior is preserved; external users stay project-bound.
  for (const user of userRows.rows) {
    const roleId = roleByKey.get(user.role);
    if (roleId == null) continue;
    if (!INTERNAL_ROLES.includes(user.role)) continue;
    const key = existingKey(user.id, null, roleId);
    if (seen.has(key)) continue;
    await query(
      `INSERT INTO user_project_roles (user_id, role_id)
       VALUES ($1, $2)`,
      [Number(user.id), roleId]
    );
    seen.add(key);
  }
}

async function run(query) {
  await ensureTables(query);
  await seedRoles(query);
  await seedPermissions(query);
  await seedRolePermissions(query);
  await migrateUsersToProjectRoles(query);
}

module.exports = {
  ACTIONS,
  ROLES,
  INTERNAL_ROLES,
  EXTERNAL_ROLES,
  EXTERNAL_ROLE_MODULE_GRANTS,
  ROLE_VISIBILITY_GRANTS,
  TABLE_DDL,
  AUDIT_IMMUTABILITY_SQL,
  ensureTables,
  ensureAuditImmutability,
  seedRoles,
  seedPermissions,
  seedRolePermissions,
  migrateUsersToProjectRoles,
  run,
};
