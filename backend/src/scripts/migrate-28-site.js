// Phase 15 migration runner — site operations.
//
// Run:  node backend/src/scripts/migrate-28-site.js

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');
const migration = require('./site-migration');

async function run() {
  console.log('Running Phase 15 migration — site operations...\n');

  await migration.ensureTables(query);
  console.log('[OK] photos / sticky_notes ensured; site_visits, site_daily_reports, engineer_instructions widened');

  console.log('\nMigration complete!');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
