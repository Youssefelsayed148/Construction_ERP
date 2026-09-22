// Phase 20 migration runner — HSE (typed incidents/inspections, permits,
// JSA/risk assessments, inductions, toolbox talks, near misses, PPE,
// equipment inspections, emergency drills) + the 'permit' workflow template.
//
// Run:  node backend/src/scripts/migrate-32-hse.js

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');
const migration = require('./hse-migration');

async function run() {
  console.log('Running Phase 20 migration — HSE...\n');

  await migration.ensureTables(query);
  console.log('[OK] HSE tables ensured (incidents, hse_inspections, permits, jsas, risk_assessments, inductions, toolbox_talks, near_misses, ppe_records, equipment_inspections, emergency_drills)');

  await migration.convertLegacy(query);
  console.log('[OK] safety_incidents → incidents, safety_inspections → hse_inspections (legacy names kept as compatibility views)');

  const seeded = await migration.seedPermitTemplate(query);
  console.log(seeded ? '[OK] permit workflow template seeded' : '[OK] permit workflow template already present');

  console.log('\nMigration complete!');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
