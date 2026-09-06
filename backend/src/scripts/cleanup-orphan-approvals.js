require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');

// Deletes PENDING approval_requests that point at a source record which no longer
// exists (e.g. the underlying expense was deleted after the request was raised).
// Only 'pending' rows are touched — approved/rejected rows are kept as audit history.
//
// Run:  node backend/src/scripts/cleanup-orphan-approvals.js          (dry run)
//       node backend/src/scripts/cleanup-orphan-approvals.js --apply  (delete)

const MODULE_SOURCE_TABLE = {
  expenses: 'expenses',
  payroll: 'payroll_periods',
  legal: 'legal_documents',
  project_budgets: 'project_budgets',
  sub_contracts: 'sub_contracts',
  assets: 'assets',
  maintenance: 'maintenance_reminders',
};

async function main() {
  const apply = process.argv.includes('--apply');
  const pending = await query(
    `SELECT id, module_name, request_type, request_id FROM approval_requests WHERE status = 'pending' ORDER BY id`
  );

  const orphans = [];
  for (const ar of pending.rows) {
    const table = MODULE_SOURCE_TABLE[ar.module_name];
    if (!table) continue; // unknown module — leave it alone
    const hit = await query(`SELECT 1 FROM ${table} WHERE id = $1`, [ar.request_id]);
    if (hit.rows.length === 0) orphans.push(ar);
  }

  if (orphans.length === 0) {
    console.log('No orphaned pending approval requests found.');
    return;
  }

  console.log(`Found ${orphans.length} orphaned pending approval request(s):`);
  for (const o of orphans) {
    console.log(`  #${o.id}  ${o.module_name} / ${o.request_type} #${o.request_id}  (source row missing)`);
  }

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to delete these rows.');
    return;
  }

  const ids = orphans.map((o) => o.id);
  const del = await query(`DELETE FROM approval_requests WHERE id = ANY($1) RETURNING id`, [ids]);
  console.log(`\nDeleted ${del.rows.length} row(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
