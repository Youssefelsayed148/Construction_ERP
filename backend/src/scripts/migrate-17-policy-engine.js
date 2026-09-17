// Phase 4 migration runner — scoped policy engine.
//
// Run:  node backend/src/scripts/migrate-17-policy-engine.js
//
// Thin wrapper around backend/src/scripts/policy-migration.js, following the
// existing numbered-script convention (migrate-N.js). The data logic lives in
// policy-migration.js so it can be exercised in unit tests against the
// in-memory mock-db without a live PostgreSQL instance.
//
// Order of operations:
//   1. ensureTables              — roles, permissions, role_permissions,
//                                  user_project_roles, audit_events (+ indexes)
//   2. ensureAuditImmutability   — DB-level block on UPDATE/DELETE/TRUNCATE of
//                                  audit_events (triggers + REVOKE FROM PUBLIC)
//   3. seedRoles / seedPermissions / seedRolePermissions — role catalog,
//                                  permission matrix, visibility flags
//   4. migrateUsersToProjectRoles — users.role + Phase 3 participation →
//                                  user_project_roles (users.role and
//                                  users.module_permissions stay in place as
//                                  the legacy fallback)
//
// The script is re-runnable: every CREATE uses IF NOT EXISTS, every seed uses
// ON CONFLICT ... DO NOTHING or a NOT EXISTS guard.

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');
const migration = require('./policy-migration');

async function run() {
  console.log('Running Phase 4 migration — scoped policy engine (roles, permissions, user_project_roles, audit_events)...\n');

  await migration.ensureTables(query);
  console.log('[OK] policy tables ensured (roles / permissions / role_permissions / user_project_roles / audit_events)');

  await migration.ensureAuditImmutability(query);
  console.log('[OK] audit_events immutability enforced (triggers + REVOKE UPDATE/DELETE/TRUNCATE)');

  await migration.seedRoles(query);
  console.log('[OK] roles seeded');

  await migration.seedPermissions(query);
  console.log('[OK] permissions seeded');

  await migration.seedRolePermissions(query);
  console.log('[OK] role_permissions seeded');

  await migration.migrateUsersToProjectRoles(query);
  console.log('[OK] users migrated to user_project_roles (per-project + company-wide for internal roles)');

  console.log('\nMigration complete!');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
