'use strict';

require('dotenv').config();
const { query, pool } = require('../config/database');

// Read-only staging checks. Each query returns the number of violations, so
// the command is deterministic and safe to run after the canonical migration.
const CHECKS = Object.freeze([
  {
    name: 'payment allocations do not exceed payment amounts',
    sql: `SELECT COUNT(*)::int AS violations FROM (
      SELECT p.id FROM payments p
      JOIN payment_allocations a ON a.payment_id = p.id AND a.voided_at IS NULL
      GROUP BY p.id, p.amount HAVING SUM(a.amount) > p.amount
    ) violations`,
  },
  {
    name: 'client invoice allocations do not exceed invoice amounts',
    sql: `SELECT COUNT(*)::int AS violations FROM (
      SELECT i.id FROM invoices i
      JOIN payment_allocations a ON a.invoice_id = i.id AND a.target_type = 'client_invoice' AND a.voided_at IS NULL
      GROUP BY i.id, i.amount HAVING SUM(a.amount) > i.amount
    ) violations`,
  },
  {
    name: 'retention releases do not exceed held balances',
    sql: `SELECT COUNT(*)::int AS violations FROM (
      SELECT project_id, party_type FROM retention_ledger
      GROUP BY project_id, party_type
      HAVING SUM(CASE WHEN direction = 'released' THEN amount ELSE 0 END)
           > SUM(CASE WHEN direction = 'held' THEN amount ELSE 0 END)
    ) violations`,
  },
  {
    name: 'client payment allocations stay within one project',
    sql: `SELECT COUNT(*)::int AS violations
      FROM payment_allocations a
      JOIN payments p ON p.id = a.payment_id
      JOIN invoices i ON i.id = a.invoice_id
      WHERE a.target_type = 'client_invoice' AND p.project_id <> i.project_id`,
  },
  {
    name: 'supplier payment allocations stay within one project',
    sql: `SELECT COUNT(*)::int AS violations
      FROM payment_allocations a
      JOIN payments p ON p.id = a.payment_id
      JOIN supplier_invoices si ON si.id = a.supplier_invoice_id
      JOIN purchase_orders po ON po.id = si.purchase_order_id
      WHERE a.target_type = 'supplier_invoice' AND p.project_id <> po.project_id`,
  },
  {
    name: 'project warehouse transfers do not cross projects',
    sql: `SELECT COUNT(*)::int AS violations
      FROM inventory_transfers t
      JOIN warehouses source ON source.id = t.from_warehouse_id
      JOIN warehouses destination ON destination.id = t.to_warehouse_id
      WHERE source.project_id IS NOT NULL AND destination.project_id IS NOT NULL
        AND source.project_id <> destination.project_id`,
  },
  {
    name: 'active workflows have a current pending step',
    sql: `SELECT COUNT(*)::int AS violations
      FROM workflow_instances wi
      WHERE wi.status = 'active' AND NOT EXISTS (
        SELECT 1 FROM workflow_step_instances wsi
        WHERE wsi.instance_id = wi.id AND wsi.status = 'pending'
      )`,
  },
]);

async function runReconciliation(q = query) {
  const results = [];
  for (const check of CHECKS) {
    const result = await q(check.sql);
    const violations = Number(result.rows?.[0]?.violations || 0);
    results.push({ name: check.name, violations, ok: violations === 0 });
  }
  return { ok: results.every((result) => result.ok), results };
}

async function main() {
  if (process.env.RECONCILIATION_BACKUP_CONFIRMED !== 'true') {
    throw new Error('Set RECONCILIATION_BACKUP_CONFIRMED=true only after confirming a restorable database backup');
  }
  const report = await runReconciliation();
  for (const result of report.results) {
    console.log(`${result.ok ? '[OK]' : '[FAIL]'} ${result.name}: ${result.violations}`);
  }
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main()
    .catch((error) => { console.error('[FAIL]', error.message); process.exitCode = 1; })
    .finally(() => pool.end());
}

module.exports = { CHECKS, runReconciliation };
