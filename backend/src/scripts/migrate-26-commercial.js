// Phase 13 migration runner — commercial / contracts foundation.
//
// Run:  node backend/src/scripts/migrate-26-commercial.js
//
// Order of operations:
//   1. ensureTables       — contracts/variations/commitments/ledgers/certificates
//   2. legacySnapshots    — the three legacy formulas' figures frozen per project
//   3. createTransitionView — legacy sub_payment_certificates name keeps working

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');
const migration = require('./commercial-migration');

async function run() {
  console.log('Running Phase 13 migration — commercial / contracts...\n');

  await migration.ensureTables(query);
  console.log('[OK] client_contracts / variations / commitments / ledgers / payment_certificates ensured');

  const snapped = await migration.legacySnapshots(query);
  console.log(`[OK] legacy-formula snapshots written for ${snapped} project(s) (costing / finance / dashboard figures frozen)`);

  await migration.createTransitionView(query);
  console.log('[OK] transition view v_sub_payment_certificates created');

  console.log('\nMigration complete!');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
