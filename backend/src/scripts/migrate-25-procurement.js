// Phase 12 migration runner — the PR → RFQ → PO → GRN procurement chain.
//
// Run:  node backend/src/scripts/migrate-25-procurement.js
//
// Order of operations:
//   1. ensureTables — the chain tables + additive columns (Phase 11
//      purchase_requests/purchase_orders evolve in place; nothing parallel,
//      nothing dropped) + expenses.po_id + suppliers.organization_id

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');
const migration = require('./procurement-migration');

async function run() {
  console.log('Running Phase 12 migration — procurement chain...\n');

  await migration.ensureTables(query);
  console.log('[OK] procurement chain tables ensured (RFQ, quotations, PO lines, deliveries, MIR, GRN, returns, supplier invoices)');

  console.log('\nMigration complete!');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
