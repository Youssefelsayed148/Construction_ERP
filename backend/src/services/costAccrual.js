// Phase 3.1 — the cost accrual rule and its idempotent posting.
//
// THE RULE (confirmed by the owner, 2026-10):
//   a cost accrues at GRN for stocked materials, and at approved supplier invoice for services.
// It lives in the single map below; nothing else in the codebase decides when a cost accrues.
//
//   stocked_material  accrual_event grn_accepted               -> Dr material_cost | Cr payable (kind grn_cost)
//   service           accrual_event supplier_invoice_approved  -> Dr service_cost (+ Dr vat_input when the whole
//                                                                  invoice is taxed) | Cr payable
//                                                                  (kind supplier_invoice_cost)
//
// Postings are idempotent by construction:
//   * project_costs carries UNIQUE (source_type, source_id) (migration 0018). accrueCost inserts with
//     ON CONFLICT DO NOTHING: the caller whose INSERT returns the row posts the ledger entry; every
//     replay (sequential or concurrent) sees no row and posts nothing.
//   * journal_entries carries the widened one-posting-per-kind index (migration 0018), so the ledger
//     side is refused at the database too.
// Everything runs on the CALLER's query function: the accrual commits or rolls back with the document
// that caused it, and an unmapped account fails the caller with a JournalError naming the key.
//
// Mixed invoices (stocked and service lines on one invoice): the stocked portion belongs to the GRN and
// is never accrued here; the service portion accrues at approval, net, without tax (the invoice's single
// tax amount cannot be split honestly across the two portions; a whole-service invoice accrues its tax
// on vat_input). A stocked invoice whose GRN predates the accrual rule (no grn_cost row, pre-3.1 data)
// accrues at approval instead, so old chains do not silently lose their cost.
//
// Deliberately out of scope (Phase 8): retention, advance recovery and other deductions. The ledger
// mapping admin screen is Phase 6.
//
// Open, not implemented here: supplier returns reduce accepted quantities and stock but do not yet
// reverse the GRN accrual (owner question, see the Phase 3 report).
'use strict';

const journal = require('../utils/journal');
const money = require('../utils/money');

const COST_ACCRUAL_RULES = {
  stocked_material: { accrual_event: 'grn_accepted', project_costs_source: 'grn', cost_account: 'material_cost', ledger_kind: 'grn_cost' },
  service: { accrual_event: 'supplier_invoice_approved', project_costs_source: 'supplier_invoice', cost_account: 'service_cost', ledger_kind: 'supplier_invoice_cost' },
};

const todayIso = () => new Date().toISOString().split('T')[0];

// quantity (up to 3 decimals) x unit rate (scale 2), exactly, rounded half away from zero to minor units.
function multiplyQtyRate(quantity, unitRate) {
  const qtyMinor3 = money.toMinor(quantity, 3);
  const rateMinor = money.toMinor(unitRate == null ? 0 : unitRate);
  const product = qtyMinor3 * rateMinor;
  return product >= 0n ? (product + 500n) / 1000n : -((-product + 500n) / 1000n);
}

// The one idempotent write. Inserts the cost row and, only when THIS call won the insert, posts the
// balanced ledger entry in the same transaction. Returns null when the source was already accrued
// (or has nothing to accrue).
async function accrueCost(q, { rule, projectId = null, costCodeId = null, sourceType, sourceId, amountMinor, description, ledgerLines, userId = null, date = null }) {
  if (amountMinor <= 0n) return null;
  const inserted = (await q(
    `INSERT INTO project_costs (project_id, cost_code_id, source_type, source_id, amount, description)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (source_type, source_id) DO NOTHING
     RETURNING *`,
    [projectId, costCodeId, sourceType, sourceId, money.format(amountMinor), description || null]
  )).rows[0];
  if (!inserted) return null;
  const entry = await journal.postJournalEntry(q, {
    date: date || todayIso(), description, reference_type: rule.ledger_kind, reference_id: sourceId, created_by: userId, lines: ledgerLines,
  });
  return { cost: inserted, entry };
}

// GRN acceptance: accrue the stocked accepted quantity at the PO line's unit rate (the committed price;
// the PO line rate is server-derived from the PO totals, never client-supplied). Service lines on the
// same delivery are not accrued here — they accrue when their invoice is approved.
async function accrueGrnCost(q, grn, { userId = null } = {}) {
  const rule = COST_ACCRUAL_RULES.stocked_material;
  const lines = (await q(
    `SELECT gl.quantity, gl.material_id, pol.unit_rate
       FROM grn_lines gl
       JOIN purchase_order_lines pol ON pol.id = gl.purchase_order_line_id
      WHERE gl.grn_id = $1 AND gl.material_id IS NOT NULL`,
    [grn.id]
  )).rows;
  let amountMinor = 0n;
  for (const l of lines) amountMinor += multiplyQtyRate(l.quantity, l.unit_rate);
  if (amountMinor <= 0n) return null;
  // A GRN names no project; the PO does.
  const po = (await q('SELECT project_id FROM purchase_orders WHERE id = $1', [grn.purchase_order_id])).rows[0];
  return accrueCost(q, {
    rule, projectId: po ? po.project_id : null, sourceType: rule.project_costs_source, sourceId: grn.id,
    amountMinor, description: `Materials received on GRN ${grn.grn_number}`,
    ledgerLines: [
      { account: rule.cost_account, debit: money.format(amountMinor), description: `Materials received ${grn.grn_number}` },
      { account: 'payable', credit: money.format(amountMinor), description: `Payable accrued on ${grn.grn_number}` },
    ],
    userId, date: grn.created_at ? new Date(grn.created_at).toISOString().split('T')[0] : null,
  });
}

// Classify an invoice's lines: a line is stocked when it names a material directly or through a PO line
// that carries one; everything else is a service.
async function classifySupplierInvoiceLines(q, invoice) {
  const lines = (await q('SELECT * FROM supplier_invoice_lines WHERE supplier_invoice_id = $1 ORDER BY id', [invoice.id])).rows;
  const stocked = [];
  const service = [];
  for (const line of lines) {
    let materialId = line.material_id;
    if (materialId == null && line.purchase_order_line_id != null) {
      const poLine = (await q('SELECT material_id FROM purchase_order_lines WHERE id = $1', [line.purchase_order_line_id])).rows[0];
      materialId = poLine ? poLine.material_id : null;
    }
    (materialId != null ? stocked : service).push(line);
  }
  return { stocked, service };
}

// Whether this PO's goods already accrued through a GRN (the normal post-3.1 path). GRNs written before
// the accrual rule have no grn_cost row.
async function grnAccruedForPo(q, purchaseOrderId) {
  if (purchaseOrderId == null) return false;
  const r = await q(
    `SELECT 1 FROM project_costs pc
       JOIN goods_receipt_notes g ON g.id = pc.source_id
      WHERE pc.source_type = 'grn' AND g.purchase_order_id = $1 LIMIT 1`,
    [purchaseOrderId]
  );
  return r.rows.length > 0;
}

const lineTotalMinor = (line) => {
  if (line.line_total != null) return money.toMinor(line.line_total);
  return multiplyQtyRate(line.quantity, line.unit_price);
};

// Supplier invoice approval: the accrual point for services. Accrues the service portion of the invoice
// (source_type supplier_invoice, source_id the invoice) unless the GRN already owns the cost.
async function accrueSupplierInvoiceCost(q, invoice, { userId = null } = {}) {
  const rule = COST_ACCRUAL_RULES.service;
  const { stocked, service } = await classifySupplierInvoiceLines(q, invoice);
  const grnOwned = stocked.length > 0 || (await grnAccruedForPo(q, invoice.purchase_order_id));
  if (grnOwned && service.length === 0) return null; // the GRN owns this cost; never count it again

  // The invoice names no project; a PO-linked one takes the PO's.
  let projectId = invoice.project_id || null;
  if (projectId == null && invoice.purchase_order_id != null) {
    const po = (await q('SELECT project_id FROM purchase_orders WHERE id = $1', [invoice.purchase_order_id])).rows[0];
    projectId = po ? po.project_id : null;
  }

  const serviceTotalMinor = service.reduce((s, l) => s + lineTotalMinor(l), 0n);
  const wholeService = stocked.length === 0; // (line-less invoices included: nothing is stocked)
  const taxMinor = wholeService ? money.toMinor(invoice.tax_amount == null ? 0 : invoice.tax_amount) : 0n;
  // Whole-service invoices split the header total like 2.7b does for client invoices: cost = total - tax.
  // Mixed invoices accrue their service lines only (the single tax amount cannot be split honestly).
  const netMinor = wholeService
    ? money.toMinor(invoice.total_amount) - taxMinor
    : serviceTotalMinor;
  if (netMinor <= 0n && taxMinor <= 0n) return null;

  const lines = [{ account: rule.cost_account, debit: money.format(netMinor), description: `Services ${invoice.invoice_number}` }];
  if (taxMinor > 0n) lines.push({ account: 'vat_input', debit: money.format(taxMinor), description: `Input tax ${invoice.invoice_number}` });
  lines.push({ account: 'payable', credit: money.format(netMinor + taxMinor), description: `Payable ${invoice.invoice_number}` });
  // The cost row holds the net cost (what dashboards sum); the entry books the tax on its own line.
  return accrueCost(q, {
    rule, projectId, sourceType: rule.project_costs_source, sourceId: invoice.id,
    amountMinor: netMinor, description: `Services invoiced on supplier invoice ${invoice.invoice_number}`,
    ledgerLines: lines, userId,
    date: invoice.approved_at ? new Date(invoice.approved_at).toISOString().split('T')[0] : null,
  });
}

module.exports = {
  COST_ACCRUAL_RULES, multiplyQtyRate, accrueCost, accrueGrnCost,
  classifySupplierInvoiceLines, grnAccruedForPo, accrueSupplierInvoiceCost,
};
