// Phase 11 migration runner — replenishment / auto-purchasing foundation.
//
// Run:  node backend/src/scripts/migrate-24-replenishment.js
//
// Order of operations:
//   1. ensureTables      — purchase_requests / purchase_orders /
//                          replenishment_alerts / storage capacity
//   2. seedDefaultPolicy — business_rules 'replenishment_policy:default'
//                          (alert only — the fail-safe default)

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');
const migration = require('./replenishment-migration');

async function run() {
  console.log('Running Phase 11 migration — replenishment...\n');

  await migration.ensureTables(query);
  console.log('[OK] purchase_requests / purchase_orders / replenishment_alerts ensured');

  const seeded = await migration.seedDefaultPolicy(query);
  console.log(seeded ? '[OK] default replenishment policy seeded (alert_only)' : '[OK] default replenishment policy already present');

  console.log('\nMigration complete!');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
