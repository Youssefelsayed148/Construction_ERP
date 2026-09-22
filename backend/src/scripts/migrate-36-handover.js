// Phase 25 migration runner — handover, closeout & warranty.
//
// Run:  node backend/src/scripts/migrate-36-handover.js

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');
const migration = require('./handover-migration');

async function run() {
  console.log('Running Phase 25 migration — handover, closeout & warranty...\n');
  await migration.ensureTables(query);
  console.log('[OK] handover tables ensured (handover_processes, handover_package_items, asset_register, warranty_claims) — punch_items reused from Phase 19');
  const seeded = await migration.seedTemplates(query);
  console.log(seeded > 0 ? `[OK] handover/warranty workflow templates seeded (${seeded})` : '[OK] handover workflow templates already present');
  console.log('\nMigration complete!');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
