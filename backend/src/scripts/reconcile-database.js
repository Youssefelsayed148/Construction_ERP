'use strict';

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
      GROUP BY i.id, i.amount, i.credited_amount
      HAVING SUM(a.amount) + COALESCE(i.credited_amount, 0) > i.amount
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
    name: 'advance recovery ledger remains nonnegative after void restorations',
    sql: `SELECT COUNT(*)::int AS violations FROM (
      SELECT project_id, party_type FROM advance_ledger
       GROUP BY project_id, party_type
      HAVING SUM(CASE WHEN direction = 'recovered' THEN amount ELSE 0 END)
           < SUM(CASE WHEN direction = 'restored' THEN amount ELSE 0 END)
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
        WHERE pc.source_type IN ('grn', 'supplier_invoice', 'supplier_return', 'supplier_credit_note', 'supplier_credit_note_void', 'expense', 'payroll_allocation')
          AND NOT EXISTS (
            SELECT 1 FROM journal_entries je
            WHERE je.reference_id = pc.source_id
              AND je.reference_type = CASE pc.source_type
                    WHEN 'grn' THEN 'grn_cost'
                    WHEN 'supplier_invoice' THEN 'supplier_invoice_cost'
                    WHEN 'supplier_return' THEN 'supplier_return_cost'
                    WHEN 'supplier_credit_note' THEN 'supplier_credit_note_cost'
                    WHEN 'supplier_credit_note_void' THEN 'supplier_credit_note_cost_void'
                    WHEN 'expense' THEN 'expense'
                    WHEN 'payroll_allocation' THEN 'payroll' END
          )
      ) violations`,
  },
  {
    name: 'project cost rows retain their source documents',
    sql: `SELECT COUNT(*)::int AS violations FROM project_costs pc
      WHERE (pc.source_type = 'grn' AND NOT EXISTS (SELECT 1 FROM goods_receipt_notes d WHERE d.id = pc.source_id))
         OR (pc.source_type = 'supplier_invoice' AND NOT EXISTS (SELECT 1 FROM supplier_invoices d WHERE d.id = pc.source_id))
         OR (pc.source_type = 'supplier_return' AND NOT EXISTS (SELECT 1 FROM supplier_returns d WHERE d.id = pc.source_id))
         OR (pc.source_type = 'expense' AND NOT EXISTS (SELECT 1 FROM expenses d WHERE d.id = pc.source_id))
         OR (pc.source_type = 'payroll_allocation' AND NOT EXISTS (SELECT 1 FROM payroll_cost_allocations d WHERE d.id = pc.source_id))`,
  },
  {
    name: 'AP and AR money moves stay tied to live documents',
    sql: `SELECT COUNT(*)::int AS violations FROM journal_entries je
      WHERE je.reference_type IN ('client_invoice', 'client_payment', 'supplier_payment', 'client_invoice_void', 'client_credit_note', 'client_credit_note_void')
        AND (
          (je.reference_type = 'client_invoice' AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = je.reference_id))
          OR (je.reference_type = 'client_invoice_void' AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = je.reference_id))
          OR (je.reference_type IN ('client_credit_note', 'client_credit_note_void') AND NOT EXISTS (SELECT 1 FROM credit_notes c WHERE c.id = je.reference_id))
          OR (je.reference_type IN ('client_payment', 'supplier_payment') AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.id = je.reference_id))
        )`,
  },
  {
    name: 'journal entry lines balance and match the header total',
    sql: `SELECT COUNT(*)::int AS violations
      FROM journal_entries je
      LEFT JOIN (
        SELECT journal_entry_id, COUNT(*)::int AS line_count,
               SUM(debit) AS debit_total, SUM(credit) AS credit_total
          FROM journal_entry_lines GROUP BY journal_entry_id
      ) lines ON lines.journal_entry_id = je.id
      WHERE COALESCE(lines.line_count, 0) < 2
         OR COALESCE(lines.debit_total, 0) <> COALESCE(lines.credit_total, 0)
         OR COALESCE(lines.debit_total, 0) <> COALESCE(je.total_amount, 0)`,
  },
  {
    name: 'PO delivered and accepted quantities reconcile with delivery and GRN lines',
    sql: `SELECT COUNT(*)::int AS violations FROM (
      SELECT pol.id
        FROM purchase_order_lines pol
        LEFT JOIN (
          SELECT purchase_order_line_id, SUM(quantity) AS quantity
            FROM delivery_lines WHERE purchase_order_line_id IS NOT NULL
           GROUP BY purchase_order_line_id
        ) delivered ON delivered.purchase_order_line_id = pol.id
        LEFT JOIN (
          SELECT gl.purchase_order_line_id, SUM(gl.quantity) AS quantity
            FROM grn_lines gl JOIN goods_receipt_notes grn ON grn.id = gl.grn_id
           WHERE gl.purchase_order_line_id IS NOT NULL AND grn.status = 'posted'
           GROUP BY gl.purchase_order_line_id
        ) accepted ON accepted.purchase_order_line_id = pol.id
       WHERE COALESCE(pol.delivered_quantity, 0) <> COALESCE(delivered.quantity, 0)
          OR COALESCE(pol.accepted_quantity, 0) <> COALESCE(accepted.quantity, 0)
    ) violations`,
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
  {
    name: 'owned integer sequences are not behind their table ids',
    run: async (q) => {
      const columns = (await q(
        `SELECT c.table_schema, c.table_name, c.column_name
           FROM information_schema.columns c
           JOIN information_schema.tables t
             ON t.table_schema = c.table_schema AND t.table_name = c.table_name
          WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
            AND (c.column_default LIKE 'nextval(%' OR c.is_identity = 'YES')
          ORDER BY c.table_name, c.column_name`
      )).rows;
      let violations = 0;
      for (const { table_schema, table_name, column_name } of columns) {
        const relation = `${quoteIdentifier(table_schema)}.${quoteIdentifier(table_name)}`;
        const column = quoteIdentifier(column_name);
        const state = (await q(
          `SELECT MAX(${column}) AS max_id,
                  pg_sequence_last_value(pg_get_serial_sequence($1, $2)::regclass) AS last_value
             FROM ${relation}`,
          [`${table_schema}.${table_name}`, column_name]
        )).rows[0] || {};
        if (state.max_id != null && (state.last_value == null || Number(state.last_value) < Number(state.max_id))) violations += 1;
      }
      return { rows: [{ violations }] };
    },
  },
]);

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

async function runReconciliation(q = query) {
  const results = [];
  for (const check of CHECKS) {
    const result = check.run ? await check.run(q) : await q(check.sql);
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
