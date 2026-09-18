// Phase 9 migration runner — material planning.
//
// Run:  node backend/src/scripts/migrate-22-material-planning.js
//
// Order of operations:
//   1. ensurePlanningColumns — item_master planning fields (additive)
//   2. ensureTables          — material_recipes + recipe_lines + material_requirements
//   3. seedStandardRecipes   — the standard reinforced-concrete example recipe
//   4. purgeOrphanRequirements — drop demand rows whose recipe line is gone

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');
const migration = require('./material-planning-migration');

async function run() {
  console.log('Running Phase 9 migration — material planning...\n');

  await migration.ensurePlanningColumns(query);
  console.log('[OK] item_master planning columns ensured');

  await migration.ensureTables(query);
  console.log('[OK] material_recipes / recipe_lines / material_requirements ensured');

  const seed = await migration.seedStandardRecipes(query);
  console.log(`[OK] standard recipe #${seed.recipe_id} ensured (${seed.lines} line(s) seeded)`);

  const purged = await migration.purgeOrphanRequirements(query);
  console.log(`[OK] purged ${purged} orphan material_requirements row(s)`);

  console.log('\nMigration complete!');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
