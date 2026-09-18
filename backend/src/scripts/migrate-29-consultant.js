// Phase 16 migration runner — consultant portal & observation workflow.
//
// Run:  node backend/src/scripts/migrate-29-consultant.js

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');
const migration = require('./consultant-migration');

async function run() {
  console.log('Running Phase 16 migration — consultant portal...\n');

  await migration.ensureTables(query);
  console.log('[OK] observations / observation_comments / observation_status_history ensured; rfi_responses + submittal_revisions ensured');

  await migration.widenObservationTemplate(query);
  console.log('[OK] consultant_observation workflow steps widened (allow_roles backfilled)');

  console.log('\nMigration complete!');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
