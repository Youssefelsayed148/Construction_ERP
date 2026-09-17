require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');

// Phase 6 backstop — deletes ACTIVE workflow_instances (and their legacy
// approval_requests twins) that point at a source record which no longer
// exists (e.g. the underlying expense was deleted after the request was
// raised). Only 'active' instances are touched — approved/rejected instances
// are kept as audit history, exactly like the pre-engine behavior kept
// approved/rejected approval_requests rows.
//
// Run:  node backend/src/scripts/cleanup-orphan-approvals.js          (dry run)
//       node backend/src/scripts/cleanup-orphan-approvals.js --apply  (delete)
//
// Exposed as cleanOrphanWorkflows(query, { apply }) for unit tests.

const MODULE_SOURCE_TABLE = {
  expenses: 'expenses',
  payroll: 'payroll_periods',
  legal: 'legal_documents',
  project_budgets: 'project_budgets',
  sub_contracts: 'sub_contracts',
  assets: 'assets',
  maintenance: 'maintenance_reminders',
  purchase_orders: 'purchase_orders',
  grn: 'goods_receipt_notes',
};

async function cleanOrphanWorkflows(query, { apply = false, log = console.log } = {}) {
  const pending = await query(
    `SELECT wi.id AS id, wi.entity_type AS entity_type, wi.entity_id AS entity_id,
            wi.legacy_approval_id AS legacy_approval_id, wi.context AS context
     FROM workflow_instances wi WHERE wi.status = 'active' ORDER BY wi.id`
  );

  const orphans = [];
  for (const wi of pending.rows) {
    // Prefer the module from context; fall back to entity_type.
    const context = typeof wi.context === 'string' ? safeParse(wi.context) : (wi.context || {});
    const moduleName = context.module_name || wi.entity_type;
    const table = MODULE_SOURCE_TABLE[moduleName];
    if (!table) continue; // unknown module — leave it alone
    const hit = await query(`SELECT 1 FROM ${table} WHERE id = $1`, [wi.entity_id]);
    if (hit.rows.length === 0) orphans.push(wi);
  }

  if (orphans.length === 0) {
    log('No orphaned active workflow instances found.');
    return { orphans: [], deleted: 0 };
  }

  log(`Found ${orphans.length} orphaned active workflow instance(s):`);
  for (const o of orphans) {
    log(`  #${o.id}  ${o.entity_type} #${o.entity_id}  (source row missing)`);
  }

  if (!apply) {
    log('\nDry run. Re-run with --apply to delete these rows.');
    return { orphans, deleted: 0 };
  }

  const ids = orphans.map((o) => o.id);
  const del = await query('DELETE FROM workflow_instances WHERE id = ANY($1) RETURNING id', [ids]);
  // Keep the legacy twin table in sync so parity is not broken by cleanup.
  // Fall back to the context when the column is unset.
  const legacyIds = orphans.map((o) => {
    if (o.legacy_approval_id != null) return o.legacy_approval_id;
    const ctx = typeof o.context === 'string' ? safeParse(o.context) : (o.context || {});
    return ctx.legacy_approval_id;
  }).filter((id) => id != null);
  let legacyDeleted = 0;
  if (legacyIds.length > 0) {
    const legacyDel = await query('DELETE FROM approval_requests WHERE id = ANY($1) RETURNING id', [legacyIds]);
    legacyDeleted = legacyDel.rows.length;
  }
  log(`\nDeleted ${del.rows.length} workflow instance(s) and ${legacyDeleted} matching approval_requests row(s).`);
  return { orphans, deleted: del.rows.length, legacyDeleted };
}

function safeParse(s) {
  try { return JSON.parse(s); } catch (e) { return {}; }
}

async function main() {
  const apply = process.argv.includes('--apply');
  await cleanOrphanWorkflows(query, { apply });
}

module.exports = { cleanOrphanWorkflows, MODULE_SOURCE_TABLE };

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
