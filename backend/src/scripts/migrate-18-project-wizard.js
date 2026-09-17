// Phase 5 migration runner — project creation wizard.
//
// Run:  node backend/src/scripts/migrate-18-project-wizard.js
//
// Thin wrapper around backend/src/scripts/project-wizard-migration.js,
// following the existing numbered-script convention (migrate-N.js).
//
// Order of operations:
//   1. runAlters               — ~15 wizard columns added to projects
//                                (project number, country/GPS, timezone,
//                                currency, tax profile, original contract
//                                value/budget, DLP/warranty, retention,
//                                advance payment, liquidated damages)
//   2. ensureTables            — template tables + runtime provisioning
//                                tables (folders, registers, numbering
//                                sequences, workflows, dashboard prefs)
//   3. ensureLocationTypeSeed  — 'unit' and 'chainage' location types
//   4. seedTemplates           — the "Residential Tower" template
//                                (2 towers × 12 floors × 4 units/floor)

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');
const migration = require('./project-wizard-migration');

async function run() {
  console.log('Running Phase 5 migration — project creation wizard (projects columns, templates, provisioning tables)...\n');

  await migration.runAlters(query);
  console.log('[OK] projects wizard columns added');

  await migration.ensureTables(query);
  console.log('[OK] template + provisioning tables ensured');

  await migration.ensureLocationTypeSeed(query);
  console.log('[OK] unit + chainage location types seeded');

  await migration.seedTemplates(query);
  console.log('[OK] project templates seeded (residential_tower)');

  console.log('\nMigration complete!');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
