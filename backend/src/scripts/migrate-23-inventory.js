// Phase 10 migration runner — ledgered stock movements + derived stock.
//
// Run:  node backend/src/scripts/migrate-23-inventory.js
//
// Order of operations:
//   1. ensureTables             — stock_movements, stock_reservations,
//                                 warehouses.warehouse_type, derived columns
//   2. backfillOpeningMovements — legacy quantities → 'opening' movements
//   3. rebuildProjection        — warehouse_stock rewritten FROM the ledger
//   4. createImmutabilityGuard  — UPDATE/DELETE on the ledger raises

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');
const migration = require('./inventory-migration');

async function run() {
  console.log('Running Phase 10 migration — inventory ledger...\n');

  await migration.ensureTables(query);
  console.log('[OK] stock_movements / stock_reservations / warehouse_type ensured');

  const opened = await migration.backfillOpeningMovements(query);
  console.log(`[OK] backfilled ${opened} opening stock_movement(s) from legacy warehouse_stock`);

  const rebuilt = await migration.rebuildProjection(query);
  console.log(`[OK] warehouse_stock projection rebuilt — ${rebuilt} row(s) derived from the ledger`);

  await migration.createImmutabilityGuard(query);
  console.log('[OK] stock_movements immutability trigger created');

  console.log('\nMigration complete!');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
