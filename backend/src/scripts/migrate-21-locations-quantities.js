// Phase 8 migration runner — real locations, BOQ allocations, quantity
// measurements and roll-ups.
//
// Run:  node backend/src/scripts/migrate-21-locations-quantities.js
//
// Order of operations:
//   1. ensureTables   — quantity_measurements + additive columns
//   2. migrateBuildings — buildings → project_locations (building) + one REAL
//                         floor row per integer of buildings.floors
//   3. Unassigned locations, allocation backfill, measurement backfill from
//      verified work_completions, completed_quantity recompute
//   4. verify backfill → enforce NOT NULL on work_completions.project_location_id
//   5. create the derived-progress views
//
// Idempotent: re-runs backfill nothing and re-verify cleanly.

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');
const migration = require('./location-quantity-migration');

async function run() {
  console.log('Running Phase 8 migration — locations + quantity engine...\n');

  await migration.ensureTables(query);
  console.log('[OK] quantity/location tables ensured');

  const b = await migration.migrateBuildings(query);
  console.log(`[OK] migrated ${b.migrated} building(s) into project_locations, created ${b.floorsCreated} real floor row(s)`);

  const unassigned = await migration.createUnassignedLocations(query);
  console.log(`[OK] ensured 'Unassigned' locations for ${unassigned} project(s)`);

  const allocs = await migration.backfillAllocations(query);
  console.log(`[OK] backfilled ${allocs} boq_location_allocations row(s)`);

  const meas = await migration.backfillMeasurementsFromCompletions(query);
  console.log(`[OK] backfilled ${meas} quantity_measurements row(s) from verified completions`);

  const stamped = await migration.backfillCompletions(query);
  console.log(`[OK] stamped ${stamped} work_completion(s) with a location`);

  const recomputed = await migration.recomputeCompletedQuantities(query);
  console.log(`[OK] recomputed completed_quantity on ${recomputed} boq_items row(s)`);

  const verify = await migration.verifyBackfill(query);
  if (!verify.ok) {
    console.error(`[FAIL] backfill verification: ${verify.nullRows} work_completion(s) still without a location`);
    process.exit(1);
  }
  console.log('[OK] backfill verified — 0 completions without a location');
  await migration.enforceNotNull(query);
  console.log('[OK] work_completions.project_location_id is now NOT NULL');

  await migration.createViews(query);
  console.log('[OK] derived progress views created');

  // Phase 8 step 7 (buildings.floors / units_per_floor drop) is deliberately
  // NOT run here. Ground rule 1 requires "nothing existing is dropped until
  // every caller has migrated and a parity test has passed" — dropping in
  // the same run as the backfill above gives zero window to verify that in
  // a real deployment. Run it separately, after confirming in staging/prod
  // that every reader (routes/units.js floor counts, the frontend floor
  // display, any report) is reading project_locations rows, not the
  // buildings columns:
  //   node backend/src/scripts/migrate-21-locations-quantities.js --drop-legacy-buildings-columns
  if (process.argv.includes('--drop-legacy-buildings-columns')) {
    const dropped = await migration.dropLegacyBuildingColumns(query);
    console.log(`[OK] dropped legacy building columns: ${dropped.join(', ') || '(none — already dropped)'}`);
  } else {
    console.log('[SKIP] buildings.floors / units_per_floor kept — re-run with --drop-legacy-buildings-columns once every reader is confirmed migrated');
  }

  console.log('\nMigration complete!');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
