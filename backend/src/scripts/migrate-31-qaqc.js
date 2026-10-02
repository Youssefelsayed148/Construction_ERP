// Phase 19 migration runner — QA/QC (ITP, WIR, checklists, CAPA, mock-ups,
// calibration, punch items) + NCR/quality-test/MIR widening.
//
// Run:  node backend/src/scripts/migrate-31-qaqc.js

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');
const migration = require('./qaqc-migration');

async function run() {
  console.log('Running Phase 19 migration — QA/QC...\n');

  await migration.ensureTables(query);
  console.log('[OK] QA/QC tables ensured (itps, itp_points, wirs, checklists, CAPA, mock_ups, calibration_records, punch_items)');
  console.log('[OK] ncrs / quality_tests / material_inspection_requests widened');

  console.log('\nMigration complete!');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
