// Phase 22 migration runner — planning / scheduling.
//
// Run:  node backend/src/scripts/migrate-34-planning.js

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');
const migration = require('./planning-migration');

async function run() {
  console.log('Running Phase 22 migration — planning / scheduling...\n');

  await migration.ensureTables(query);
  console.log('[OK] schedule tables ensured (calendars, schedule_activities, activity_relationships, baselines) + milestone/EV integration');

  console.log('\nMigration complete!');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
