// Phase 6 migration runner — universal workflow engine.
//
// Run:  node backend/src/scripts/migrate-19-workflow-engine.js
//
// Order of operations:
//   1. ensureTables   — workflow_templates / workflow_steps / workflow_instances
//                       / workflow_step_instances / workflow_actions /
//                       escalation_rules
//   2. seedTemplates  — the standard construction catalog (exact state names
//                       from 24_WORKFLOW_CATALOG.md) plus the
//                       'legacy_module_approval' template reproducing the old
//                       manager_review -> owner_review behavior
//   3. migrateLegacy  — every approval_requests row gets a workflow_instances
//                       row mirroring its current stage/status/approver
//                       (idempotent: keyed on legacy_approval_id)

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');
const migration = require('./workflow-engine-migration');
const engine = require('../services/workflowEngine');

async function run() {
  console.log('Running Phase 6 migration — universal workflow engine...\n');

  await migration.ensureTables(query);
  console.log('[OK] workflow tables ensured');

  await migration.seedTemplates(query);
  console.log('[OK] workflow templates seeded (catalog + legacy_module_approval)');

  const migrated = await engine.migrateLegacyApprovals({ query });
  console.log(`[OK] migrated ${migrated} approval_requests row(s) into workflow_instances`);

  console.log('\nMigration complete!');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
