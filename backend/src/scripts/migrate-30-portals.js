// Phase 18 migration runner — subcontractor & supplier portals.
//
// Run:  node backend/src/scripts/migrate-30-portals.js

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');
const migration = require('./portal-migration');

async function run() {
  console.log('Running Phase 18 migration — subcontractor & supplier portals...\n');

  await migration.ensureTables(query);
  console.log('[OK] organization_documents widened with expiry_date (compliance expiry tracking)');

  console.log('\nMigration complete!');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
