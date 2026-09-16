// Phase 3 migration script — thin wrapper around
// backend/src/scripts/organizations-migration.js.
//
// Run:  node backend/src/scripts/migrate-16-organizations.js
//
// The script follows the existing numbered-script convention
// (migrate-N.js). The data logic lives in organizations-migration.js so it can
// be exercised in unit tests without a live PostgreSQL instance.
//
// Order of operations (independent of prior migrations — Phase 2 columns are
// not required by Phase 3, so this script is safe to run before or after
// migrate-16.js):
//   1. ensureSchema      — create organizations, organization_*,
//                          project_participants, project_participant_users,
//                          location_types, project_locations, wbs_nodes,
//                          work_packages, boq_location_allocations,
//                          _migration_*_org_map.
//   2. ensureInternalOrganization — single sentinel 'INTERNAL' row.
//   3. runLocationTypeSeed — seed location_types (site, zone, floor, ...).
//   4. runAlters         — add projects.organization_id,
//                          cost_codes.wbs_node_id.
//   5. backfillClients / Suppliers / Subcontractors — populate organizations.
//   6. buildMappingTables — _migration_client_org_map etc.
//   7. backfillProjectsOrganizationId — projects.organization_id ← client map.
//   8. backfillProjectParticipants — project_team → project_participants.
//   9. backfillProjectParticipantUsers — email match to populate user_id.
//
// The script is re-runnable: every CREATE uses IF NOT EXISTS, every INSERT
// uses ON CONFLICT (key) DO NOTHING, and project_team / project_participants
// inserts are guarded by NOT EXISTS.

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');
const migration = require('./organizations-migration');

async function run() {
  console.log('Running Phase 3 migration — Core data architecture (organizations, participants, locations, WBS)...\n');

  await migration.ensureSchema(query);
  console.log('[OK] schema ensured (organizations + participant + location + WBS tables)');

  await migration.ensureInternalOrganization(query);
  console.log('[OK] INTERNAL sentinel organization ensured');

  await migration.runLocationTypeSeed(query);
  console.log('[OK] location_types seeded');

  await migration.runAlters(query);
  console.log('[OK] projects.organization_id + cost_codes.wbs_node_id added');

  await migration.backfillClients(query);
  await migration.backfillSuppliers(query);
  await migration.backfillSubcontractors(query);
  console.log('[OK] organizations backfilled from clients / suppliers / subcontractors');

  await migration.buildMappingTables(query);
  console.log('[OK] _migration_client_org_map / _migration_supplier_org_map / _migration_subcontractor_org_map built');

  await migration.backfillProjectsOrganizationId(query);
  console.log('[OK] projects.organization_id backfilled from client map');

  await migration.backfillProjectParticipants(query);
  await migration.backfillProjectParticipantUsers(query);
  console.log('[OK] project_team migrated to project_participants / project_participant_users');

  console.log('\nMigration complete!');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
