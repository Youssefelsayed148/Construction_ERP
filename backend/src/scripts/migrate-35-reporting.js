// Phase 24 migration runner — reporting engine.
//
// Run:  node backend/src/scripts/migrate-35-reporting.js

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');
const migration = require('./reporting-migration');

async function run() {
  console.log('Running Phase 24 migration — reporting engine...\n');
  await migration.ensureTables(query);
  console.log('[OK] reporting tables ensured (saved_views, scheduled_reports, scheduled_report_runs)');
  console.log('\nMigration complete!');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
