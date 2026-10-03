// Lists the rows that block NOT VALID constraints from being validated. Read only; never fixes anything.
//   node src/scripts/data-cleaning-report.js [--json] [--limit=20]
// Exit code: 0 = nothing to clean, 2 = at least one constraint has offending rows.
const { pool } = require('../config/database');
const { findInvalidConstraints } = require('../services/dataCleaning');

(async () => {
  const json = process.argv.includes('--json');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 20;
  const found = await findInvalidConstraints((t, p) => pool.query(t, p), { limit });
  if (json) console.log(JSON.stringify(found, null, 2));
  else if (!found.length) console.log('All constraints are validated. Nothing to clean.');
  else {
    for (const c of found) {
      console.log(`\n${c.table}.${c.constraint} (${c.type}): ${c.offenders} offending row(s)`);
      console.log(`  ${c.definition}`);
      for (const row of c.sample) console.log(`  ${JSON.stringify(row)}`);
      if (c.offenders === 0) console.log(`  clean: ALTER TABLE ${c.table} VALIDATE CONSTRAINT ${c.constraint};`);
    }
  }
  await pool.end();
  process.exit(found.some((c) => c.offenders > 0) ? 2 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
