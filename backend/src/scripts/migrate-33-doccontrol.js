// Phase 21 migration runner — enterprise document control.
//
// Run:  node backend/src/scripts/migrate-33-doccontrol.js

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');
const migration = require('./doccontrol-migration');

async function run() {
  console.log('Running Phase 21 migration — document control...\n');

  await migration.ensureTables(query);
  console.log('[OK] document control tables ensured (register widening, numbering, transmittals, correspondence)');

  console.log('\nMigration complete!');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
