// Phase 14 migration runner — AR/AP ledgers, valuations, allocations, audit.
//
// Run:  node backend/src/scripts/migrate-27-finance.js

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');
const migration = require('./finance-migration');
const financeEngine = require('../services/financeEngine');

async function run() {
  console.log('Running Phase 14 migration — finance & invoicing...\n');

  await migration.ensureTables(query);
  console.log('[OK] valuations/allocations/AP queue/reminders/tax/audit tables ensured');

  const seeded = await financeEngine.ensureTaxCodes(query);
  console.log(`[OK] tax codes seeded (${seeded} row(s))`);

  const queued = await financeEngine.syncApReviewQueue(query);
  console.log(`[OK] AP review queue synced — ${queued} exception(s) queued from three-way matches`);

  console.log('\nMigration complete!');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
