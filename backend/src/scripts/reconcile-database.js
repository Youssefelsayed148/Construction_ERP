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

  // ---- Closeout B8: the four reconciliation assertions (read-only SQL, Phase 11) ----
  {
    name: 'stock ledger reconciles with the warehouse_stock projection',
    // Signs mirror inventoryEngine.PHYSICAL_SIGNS exactly.
    sql: `WITH signs AS (
        SELECT (SELECT count(*) FROM stock_movements) m
      ), ledger AS (
        SELECT warehouse_id, material_id,
               SUM(CASE movement_type
                 WHEN 'opening' THEN quantity WHEN 'grn' THEN quantity WHEN 'quarantine' THEN quantity
                 WHEN 'return' THEN quantity WHEN 'transfer_in' THEN quantity
                 WHEN 'adjustment' THEN quantity WHEN 'reversal' THEN quantity
                 WHEN 'quarantine_reject' THEN -quantity WHEN 'issue' THEN -quantity
                 WHEN 'transfer_out' THEN -quantity WHEN 'waste' THEN -quantity
                 WHEN 'damage' THEN -quantity WHEN 'supplier_return' THEN -quantity
                 ELSE 0 END) AS ledger_total
        FROM stock_movements GROUP BY warehouse_id, material_id
      )
      SELECT COUNT(*)::int AS violations FROM (
        SELECT l.warehouse_id, l.material_id,
               COALESCE(ws.quantity, 0) AS projection, l.ledger_total
        FROM ledger l
        LEFT JOIN warehouse_stock ws ON ws.warehouse_id = l.warehouse_id AND ws.item_id = l.material_id
        WHERE COALESCE(ws.quantity, 0) <> l.ledger_total
      ) violations`,
  },
  {
    name: 'project cost rows reconcile with their ledger entries',
    // Entries kinds: grn→grn_cost, supplier_invoice→supplier_invoice_cost, supplier_return→supplier_return_cost,
    // expense→expense, payroll→payroll (COST_ACCRUAL_RULES). The ledger-only sources (material_issue,
    // labour/equipment/sub payments) intentionally have no entry of their own.
    sql: `SELECT COUNT(*)::int AS violations FROM (
        SELECT pc.id FROM project_costs pc
        WHERE pc.source_type IN ('grn', 'supplier_invoice', 'supplier_return', 'expense', 'payroll_allocation')
          AND NOT EXISTS (
            SELECT 1 FROM journal_entries je
            WHERE je.reference_id = pc.source_id
              AND je.reference_type = CASE pc.source_type
                    WHEN 'grn' THEN 'grn_cost'
                    WHEN 'supplier_invoice' THEN 'supplier_invoice_cost'
                    WHEN 'supplier_return' THEN 'supplier_return_cost'
                    WHEN 'expense' THEN 'expense'
                    WHEN 'payroll_allocation' THEN 'payroll' END
          )
      ) violations`,
  },
  {
    name: 'AP and AR money moves stay tied to live documents',
    sql: `SELECT COUNT(*)::int AS violations FROM journal_entries je
      WHERE je.reference_type IN ('client_invoice', 'client_payment', 'supplier_payment', 'client_invoice_void')
        AND (
          (je.reference_type = 'client_invoice' AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = je.reference_id))
          OR (je.reference_type LIKE '%void' AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = je.reference_id))
          OR (je.reference_type IN ('client_payment', 'supplier_payment') AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.id = je.reference_id))
        )`,
  },
  {
    name: 'approvals mirror their workflow instances',
    sql: `SELECT (SELECT COUNT(*)::int FROM approval_requests ar
              WHERE NOT EXISTS (SELECT 1 FROM workflow_instances wi WHERE wi.legacy_approval_id = ar.id))
           + (SELECT COUNT(*)::int FROM (
              SELECT wi.legacy_approval_id FROM workflow_instances wi
              WHERE wi.legacy_approval_id IS NOT NULL GROUP BY wi.legacy_approval_id HAVING COUNT(*) > 1
            ) dupes) AS violations`,
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
