'use strict';

// Read-only. Prints the legacy role -> canonical role dry run (per seat, with the permissions that would
// change) and optionally writes it:  node src/scripts/legacy-role-dry-run.js [--json out.json] [--csv out.csv]
// Run it against a restored COPY of the real database: it only SELECTs, but the data is yours to protect.
require('dotenv').config();
const fs = require('fs');
const { query, pool } = require('../config/database');
const { buildReport, toCsv } = require('../services/legacyRoleDryRun');

async function main() {
  const args = process.argv.slice(2);
  const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  const report = await buildReport(query);
  console.log(`Permission catalog: ${report.catalog_pairs} (module, action) pairs`);
  if (report.unmapped_legacy_roles.length) console.log(`UNMAPPED legacy roles (alias points at a role that does not exist): ${report.unmapped_legacy_roles.join(', ')}`);
  console.table(report.mappings.map((m) => ({ mapping: `${m.old_role} -> ${m.new_role}`, blanket: m.had_blanket_grant, before: m.permissions_before, after: m.permissions_after, lost: m.lost_count, gained: m.gained_count })));
  console.table(report.summary);
  console.log(`${report.seats.length} legacy seats across ${new Set(report.seats.map((s) => s.user_id)).size} users. Nothing was changed.`);
  if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify(report, null, 2));
  if (arg('--csv')) fs.writeFileSync(arg('--csv'), toCsv(report));
}

if (require.main === module) {
  main()
    .catch((error) => { console.error('[FAIL]', error.message); process.exitCode = 1; })
    .finally(() => pool.end());
}
