// Phase 3.1 — the cost accrual rule and its idempotent posting.
//
// THE RULE (confirmed by the owner, 2026-10):
//   a cost accrues at GRN for stocked materials, and at approved supplier invoice for services.
// It lives in the single map below; nothing else in the codebase decides when a cost accrues.
//
//   stocked_material  accrual_event grn_accepted               -> Dr material_cost | Cr payable (kind grn_cost)
//   service           accrual_event supplier_invoice_approved  -> Dr service_cost (+ Dr vat_input for the invoice
//                                                                  tax) | Cr payable (kind supplier_invoice_cost)
//   stocked_material_return  supplier_return                   -> Dr payable | Cr material_cost, a negative
//                                                                  cost row (kind supplier_return_cost)
//
// Postings are idempotent by construction:
//   * project_costs carries UNIQUE (source_type, source_id) (migration 0018). accrueCost inserts with
//     ON CONFLICT DO NOTHING: the caller whose INSERT returns the row posts the ledger entry; every
//     replay (sequential or concurrent) sees no row and posts nothing.
//   * journal_entries carries the one-posting-per-kind index (0018, widened in 0023), so the ledger
//     side is refused at the database too.
// Everything runs on the CALLER's query function: the accrual commits or rolls back with the document
// that caused it, and an unmapped account fails the caller with a JournalError naming the key.
//
// Supplier returns (decision 2): a return reverses its share of the GRN cost row, valued at the original GRN
// unit cost, as a NEGATIVE project_costs row under UNIQUE (source_type 'supplier_return', source_id) and an
// entry Dr payable / Cr material_cost. Partial returns reverse proportionally to what the GRN actually
// accrued and never more than that. A GRN whose cost was not accrued at the GRN (legacy, or covered by an
// invoice) has nothing to reverse here.
//
// A GRN and a supplier invoice for the same PO line (decisions 5 and 6) pair off quantity for quantity
// through cost_accrual_claims (migration 0023), so the goods accrue once whichever comes first: a GRN-less
// stocked invoice accrues at approval, and a GRN received later accrues only what the invoice did not
// cover. A mixed invoice accrues its service net (plus any stocked quantity no GRN covered), books the FULL
// invoice tax on vat_input, and credits payable for what it accrued: with the GRN's credit, the AP the
// chain carries equals the invoice total.
//
// Open (owner question): the tax of a stocked-only invoice whose goods the GRN already accrued posts
// nowhere, because no cost remains to accrue and so no invoice entry is written.
//
// Deliberately out of scope (Phase 8): retention, advance recovery and other deductions. The ledger
// mapping admin screen is Phase 6.
'use strict';

const journal = require('../utils/journal');
const money = require('../utils/money');

const COST_ACCRUAL_RULES = {
  stocked_material: { accrual_event: 'grn_accepted', project_costs_source: 'grn', cost_account: 'material_cost', ledger_kind: 'grn_cost' },
  service: { accrual_event: 'supplier_invoice_approved', project_costs_source: 'supplier_invoice', cost_account: 'service_cost', ledger_kind: 'supplier_invoice_cost' },
  // Reversal of a GRN's stocked cost when goods go back to the supplier.
  stocked_material_return: { accrual_event: 'supplier_return', project_costs_source: 'supplier_return', cost_account: 'material_cost', ledger_kind: 'supplier_return_cost' },
  // Closeout A2.3. These write project_costs only: the ledger already holds the amount (see the notes further down).
  material_issue: { accrual_event: 'stock_issue', project_costs_source: 'material_issue', offset_source: 'material_issue_offset', cost_code: null },
  // Phase 5.3: stock that comes back (a return document, or the void of an issue) gives its share of an
  // issue's project cost back, at the ORIGINAL issue cost, and moves the offset back to the warehouse's project.
  material_return: { accrual_event: 'stock_return', project_costs_source: 'material_return', offset_source: 'material_return_offset' },
  material_issue_void: { accrual_event: 'stock_issue_void', project_costs_source: 'material_issue_void', offset_source: 'material_issue_void_offset' },
  expense: { accrual_event: 'expense_recorded', project_costs_source: 'expense', ledger_kind: 'expense', cost_code_by_category: { labor: '11', equipment: '10' } },
  payroll: { accrual_event: 'payroll_posted', project_costs_source: 'payroll_allocation', ledger_kind: 'payroll', cost_code: '11' },
  labor_payment: { accrual_event: 'labor_payment_created', project_costs_source: 'labor_payment', cost_code: '11' },
  work_order_equipment: { accrual_event: 'work_completion_verified', project_costs_source: 'wo_equipment', legacy_source: 'work_completion', cost_code: '10' },
  subcontractor_payment: { accrual_event: 'sub_payment_paid', project_costs_source: 'sub_payment', cost_code: '12' },
};

const todayIso = () => new Date().toISOString().split('T')[0];
const toNum = (v) => (v == null ? 0 : Number(v));
const round3 = (n) => Math.round(n * 1000) / 1000;

// quantity (up to 3 decimals) x unit rate (scale 2), exactly, rounded half away from zero to minor units.
function multiplyQtyRate(quantity, unitRate) {
  const qtyMinor3 = money.toMinor(quantity, 3);
  const rateMinor = money.toMinor(unitRate == null ? 0 : unitRate);
  const product = qtyMinor3 * rateMinor;
  return product >= 0n ? (product + 500n) / 1000n : -((-product + 500n) / 1000n);
}

// A GRN line or an invoice line claims its quantity for a PO line; GRN quantity and invoice quantity pair
// off, so the goods accrue once in total (the larger of the two), whichever event arrives first. Returns the
// quantity THIS event must accrue (0 for a replay). The PO line row lock serialises concurrent claims.
async function claimLine(q, { purchaseOrderLineId, sourceType, sourceId, quantity }) {
  await q('SELECT id FROM purchase_order_lines WHERE id = $1 FOR UPDATE', [purchaseOrderLineId]);
  const totals = (await q(
    `SELECT COALESCE(SUM(quantity) FILTER (WHERE source_type = 'grn'), 0) AS grn,
            COALESCE(SUM(quantity) FILTER (WHERE source_type = 'supplier_invoice'), 0) AS invoice
       FROM cost_accrual_claims WHERE purchase_order_line_id = $1`,
    [purchaseOrderLineId]
  )).rows[0] || {};
  const grnBefore = toNum(totals.grn);
  const invoiceBefore = toNum(totals.invoice);
  const qty = round3(toNum(quantity));
  const grnAfter = sourceType === 'grn' ? grnBefore + qty : grnBefore;
  const invoiceAfter = sourceType === 'supplier_invoice' ? invoiceBefore + qty : invoiceBefore;
  const newlyPaired = round3(Math.min(grnAfter, invoiceAfter) - Math.min(grnBefore, invoiceBefore));
  const accrued = round3(Math.max(0, qty - newlyPaired));
  const inserted = (await q(
    `INSERT INTO cost_accrual_claims (purchase_order_line_id, source_type, source_id, quantity, accrued_quantity)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (purchase_order_line_id, source_type, source_id) DO NOTHING RETURNING id`,
    [purchaseOrderLineId, sourceType, sourceId, qty, accrued]
  )).rows[0];
  return inserted ? accrued : 0;
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
// the PO line rate is server-derived from the PO totals, never client-supplied), less any quantity a supplier
// invoice already accrued. Service lines on the same delivery are not accrued here — they accrue when their
// invoice is approved.
async function accrueGrnCost(q, grn, { userId = null } = {}) {
  const rule = COST_ACCRUAL_RULES.stocked_material;
  const lines = (await q(
    `SELECT gl.purchase_order_line_id, SUM(gl.quantity) AS quantity, pol.unit_rate
       FROM grn_lines gl
       JOIN purchase_order_lines pol ON pol.id = gl.purchase_order_line_id
      WHERE gl.grn_id = $1 AND gl.material_id IS NOT NULL
      GROUP BY gl.purchase_order_line_id, pol.unit_rate
      ORDER BY gl.purchase_order_line_id`,
    [grn.id]
  )).rows;
  let amountMinor = 0n;
  for (const l of lines) {
    const accruedQty = await claimLine(q, { purchaseOrderLineId: l.purchase_order_line_id, sourceType: 'grn', sourceId: grn.id, quantity: l.quantity });
    amountMinor += multiplyQtyRate(accruedQty, l.unit_rate);
  }
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

const lineTotalMinor = (line) => {
  if (line.line_total != null) return money.toMinor(line.line_total);
  return multiplyQtyRate(line.quantity, line.unit_price);
};

// Supplier invoice approval: the accrual point for services, and for stocked goods no GRN has accrued.
// Accrues (source_type supplier_invoice, source_id the invoice): the service net, plus the stocked quantity
// not already claimed by a GRN; the full invoice tax goes to vat_input (see the header).
async function accrueSupplierInvoiceCost(q, invoice, { userId = null } = {}) {
  const rule = COST_ACCRUAL_RULES.service;
  const stockedRule = COST_ACCRUAL_RULES.stocked_material;
  const { stocked, service } = await classifySupplierInvoiceLines(q, invoice);

  // The invoice names no project; a PO-linked one takes the PO's.
  let projectId = invoice.project_id || null;
  if (projectId == null && invoice.purchase_order_id != null) {
    const po = (await q('SELECT project_id FROM purchase_orders WHERE id = $1', [invoice.purchase_order_id])).rows[0];
    projectId = po ? po.project_id : null;
  }

  // Stocked lines: claim per PO line (aggregated), accrue only what no GRN covers. Lines with no PO line
  // cannot be received against, so they accrue in full.
  let stockedMinor = 0n;
  const byPoLine = new Map();
  for (const line of stocked) {
    if (line.purchase_order_line_id == null) { stockedMinor += lineTotalMinor(line); continue; }
    const agg = byPoLine.get(line.purchase_order_line_id) || { quantity: 0, unitPrice: line.unit_price, lines: [] };
    agg.quantity += toNum(line.quantity);
    agg.lines.push(line);
    byPoLine.set(line.purchase_order_line_id, agg);
  }
  for (const [poLineId, agg] of [...byPoLine.entries()].sort((x, y) => x[0] - y[0])) {
    const accruedQty = await claimLine(q, { purchaseOrderLineId: poLineId, sourceType: 'supplier_invoice', sourceId: invoice.id, quantity: agg.quantity });
    stockedMinor += accruedQty >= round3(agg.quantity)
      ? agg.lines.reduce((s, l) => s + lineTotalMinor(l), 0n)
      : multiplyQtyRate(accruedQty, agg.unitPrice);
  }

  const serviceTotalMinor = service.reduce((s, l) => s + lineTotalMinor(l), 0n);
  const taxMinor = money.toMinor(invoice.tax_amount == null ? 0 : invoice.tax_amount);
  const wholeService = stocked.length === 0; // (line-less invoices included: nothing is stocked)
  // Whole-service invoices split the header total like 2.7b does for client invoices: cost = total - tax.
  // Others accrue their lines (service net + uncovered stocked), with the full invoice tax on its own line.
  const serviceNetMinor = wholeService ? money.toMinor(invoice.total_amount) - taxMinor : serviceTotalMinor;
  const netMinor = serviceNetMinor + stockedMinor;
  // Input VAT (closeout answer 5): the full invoice tax goes to vat_input in every case, including a stocked-only
  // invoice whose goods the GRN already accrued (nothing else is left to accrue there, but the VAT still is owed).
  // Non-recoverable VAT (supplier_invoices.vat_recoverable = false) is cost, not input VAT: it joins the cost.
  const recoverable = invoice.vat_recoverable !== false;
  const taxToCostMinor = recoverable ? 0n : taxMinor;
  const costMinor = netMinor + taxToCostMinor;
  const vatMinor = recoverable ? taxMinor : 0n;
  if (costMinor <= 0n && vatMinor <= 0n) return null; // the GRN owns all of this cost and there is no tax

  const costAccount = (stockedMinor > 0n || service.length === 0) ? stockedRule.cost_account : rule.cost_account;
  const lines = [];
  if (stockedMinor > 0n) lines.push({ account: stockedRule.cost_account, debit: money.format(stockedMinor), description: `Materials invoiced ${invoice.invoice_number}` });
  if (serviceNetMinor > 0n) lines.push({ account: rule.cost_account, debit: money.format(serviceNetMinor), description: `Services ${invoice.invoice_number}` });
  if (taxToCostMinor > 0n) lines.push({ account: costAccount, debit: money.format(taxToCostMinor), description: `Non-recoverable tax ${invoice.invoice_number}` });
  if (vatMinor > 0n) lines.push({ account: 'vat_input', debit: money.format(vatMinor), description: `Input tax ${invoice.invoice_number}` });
  lines.push({ account: 'payable', credit: money.format(costMinor + vatMinor), description: `Payable ${invoice.invoice_number}` });
  const date = invoice.approved_at ? new Date(invoice.approved_at).toISOString().split('T')[0] : null;
  if (costMinor <= 0n) {
    // VAT only: no cost row; the one-posting-per-kind journal index makes a replay fail instead of double posting.
    const entry = await journal.postJournalEntry(q, {
      date: date || todayIso(), description: `Input tax on supplier invoice ${invoice.invoice_number}`,
      reference_type: rule.ledger_kind, reference_id: invoice.id, created_by: userId, lines,
    });
    return { cost: null, entry };
  }
  // The cost row holds the cost (what dashboards sum); the entry books recoverable tax on its own line.
  return accrueCost(q, {
    rule, projectId, sourceType: rule.project_costs_source, sourceId: invoice.id,
    amountMinor: costMinor, description: `Invoiced on supplier invoice ${invoice.invoice_number}`,
    ledgerLines: lines, userId, date,
  });
}

// Supplier return: reverse the returned goods' share of the GRN's accrued cost. `allocations` are the
// { grnLine, quantity } pieces the return took from the GRN lines (after returned_quantity was updated).
// Idempotent through UNIQUE (source_type 'supplier_return', source_id) and the one-entry-per-kind index.
async function reverseGrnCostForReturn(q, supplierReturn, allocations, { userId = null } = {}) {
  const rule = COST_ACCRUAL_RULES.stocked_material_return;
  const grnId = supplierReturn.grn_id;
  const grnCost = (await q("SELECT * FROM project_costs WHERE source_type = 'grn' AND source_id = $1", [grnId])).rows[0];
  if (!grnCost) return null; // not accrued at the GRN (legacy, or an invoice covered it): nothing to reverse

  // What the GRN accrued (A) against the full value of the quantities it claimed (B); a return reverses the
  // same fraction of its own value at the GRN unit cost.
  const claims = (await q(
    `SELECT c.quantity, pol.unit_rate FROM cost_accrual_claims c
       JOIN purchase_order_lines pol ON pol.id = c.purchase_order_line_id
      WHERE c.source_type = 'grn' AND c.source_id = $1`, [grnId]
  )).rows;
  let fullValue = 0n;
  for (const c of claims) fullValue += multiplyQtyRate(c.quantity, c.unit_rate);
  const accruedMinor = money.toMinor(grnCost.amount);
  if (fullValue <= 0n || accruedMinor <= 0n) return null;

  let returnedValue = 0n;
  for (const a of allocations) {
    if (a.grnLine.purchase_order_line_id == null) continue;
    const pol = (await q('SELECT unit_rate FROM purchase_order_lines WHERE id = $1', [a.grnLine.purchase_order_line_id])).rows[0];
    if (pol) returnedValue += multiplyQtyRate(a.quantity, pol.unit_rate);
  }
  if (returnedValue <= 0n) return null;

  const already = (await q(
    `SELECT COALESCE(SUM(pc.amount), 0) AS s FROM project_costs pc
       JOIN supplier_returns sr ON sr.id = pc.source_id
      WHERE pc.source_type = 'supplier_return' AND sr.grn_id = $1 AND sr.id <> $2`, [grnId, supplierReturn.id]
  )).rows[0];
  const remainingMinor = accruedMinor + money.toMinor(already.s); // earlier reversals are negative
  if (remainingMinor <= 0n) return null;

  const left = (await q(
    'SELECT COALESCE(SUM(quantity - returned_quantity), 0) AS n FROM grn_lines WHERE grn_id = $1 AND material_id IS NOT NULL', [grnId]
  )).rows[0];
  let reverseMinor = toNum(left.n) <= 0
    ? remainingMinor // everything is back with the supplier: close the books exactly, no rounding crumbs
    : (accruedMinor * returnedValue * 2n + fullValue) / (fullValue * 2n); // half-up of A x R / B
  if (reverseMinor > remainingMinor) reverseMinor = remainingMinor; // never more than was accrued
  if (reverseMinor <= 0n) return null;

  const inserted = (await q(
    `INSERT INTO project_costs (project_id, cost_code_id, source_type, source_id, amount, description)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (source_type, source_id) DO NOTHING RETURNING *`,
    [grnCost.project_id, grnCost.cost_code_id, rule.project_costs_source, supplierReturn.id, money.format(-reverseMinor),
     `Supplier return ${supplierReturn.return_number} reverses GRN cost`]
  )).rows[0];
  if (!inserted) return null; // replay
  const entry = await journal.postJournalEntry(q, {
    date: todayIso(), description: `Supplier return ${supplierReturn.return_number}`,
    reference_type: rule.ledger_kind, reference_id: supplierReturn.id, created_by: userId,
    lines: [
      { account: 'payable', debit: money.format(reverseMinor), description: `Payable reduced by return ${supplierReturn.return_number}` },
      { account: rule.cost_account, credit: money.format(reverseMinor), description: `Materials returned ${supplierReturn.return_number}` },
    ],
  });
  return { cost: inserted, entry };
}

// ---------------------------------------------------------------------------
// Closeout A2.3: the other cost sources. Each is a row of COST_ACCRUAL_RULES above, written once on
// UNIQUE (source_type, source_id), in the caller's transaction. None posts a second ledger entry: the
// ledger already carries these amounts (expenses and payroll since 2.7a, stock cost at the GRN).
// ---------------------------------------------------------------------------

// One signed project_costs row, idempotent. Returns the row, or null when the source was already posted.
async function insertCostRow(q, { projectId, costCodeId = null, sourceType, sourceId, amountMinor, description }) {
  return (await q(
    `INSERT INTO project_costs (project_id, cost_code_id, source_type, source_id, amount, description)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (source_type, source_id) DO NOTHING RETURNING *`,
    [projectId, costCodeId, sourceType, sourceId, money.format(amountMinor), description || null]
  )).rows[0] || null;
}

async function costCodeIdFor(q, code) {
  if (!code) return null;
  const row = (await q('SELECT id FROM cost_codes WHERE code = $1 LIMIT 1', [code])).rows[0];
  return row ? row.id : null;
}

// The project a stock issue goes to: work order materials name a work order, which names the project.
async function issueTargetProject(q, movement) {
  // An issue document (5.3) names the project the stock is issued to.
  if (movement.reference_type === 'inventory_document' && movement.reference_id != null) {
    const d = (await q('SELECT project_id FROM inventory_documents WHERE id = $1', [movement.reference_id])).rows[0];
    return d ? d.project_id : null;
  }
  if (movement.reference_type !== 'work_order_material' || movement.reference_id == null) return null;
  const r = (await q(
    `SELECT wo.project_id FROM work_order_materials wom JOIN work_orders wo ON wo.id = wom.work_order_id WHERE wom.id = $1`,
    [movement.reference_id]
  )).rows[0];
  return r ? r.project_id : null;
}

// Material issue (pair: GRN). The GRN is the accrual point, to the PO's project. An issue accrues only when
// the stock was NOT already charged to the project it goes to: stock from a company-level warehouse (its GRN
// had no project) or from another project's warehouse. The cost then MOVES: +target project, and an offsetting
// row against the warehouse's own project (NULL = unassigned), valued at the movement's weighted-average cost.
// The company total never changes and the ledger is untouched. No resolvable target project: nothing is guessed.
async function accrueMaterialIssue(q, movement) {
  if (movement.movement_type !== 'issue') return null;
  const rule = COST_ACCRUAL_RULES.material_issue;
  const target = await issueTargetProject(q, movement);
  if (target == null) return null;
  const wh = (await q('SELECT project_id FROM warehouses WHERE id = $1', [movement.warehouse_id])).rows[0];
  const warehouseProject = wh ? wh.project_id : null;
  if (warehouseProject === target) return null; // the GRN already charged this project
  const amountMinor = money.toMinor(movement.total_cost == null ? 0 : movement.total_cost);
  if (amountMinor <= 0n) return null;
  const charge = await insertCostRow(q, {
    projectId: target, costCodeId: await costCodeIdFor(q, rule.cost_code), sourceType: rule.project_costs_source, sourceId: movement.id,
    amountMinor, description: `Material issued from stock (movement #${movement.id})`,
  });
  if (!charge) return null; // replay
  const offset = await insertCostRow(q, {
    projectId: warehouseProject, sourceType: rule.offset_source, sourceId: movement.id,
    amountMinor: -amountMinor, description: `Material issued to project #${target} (movement #${movement.id}): cost moved`,
  });
  return { charge, offset };
}

// Material return / void of an issue (5.3). If the issue accrued project cost (charge row + offset row), the
// returned quantity gives back its proportional share, valued at the issue's own cost: -share on the project
// that was charged, +share on the project the offset came out of. Idempotent on UNIQUE (source_type, source_id)
// of the returning movement. An issue that accrued nothing (the GRN had already charged the project) has
// nothing to give back.
async function reverseMaterialIssueCost(q, { returnMovement, issueMovement, quantity, voided = false }) {
  const rule = voided ? COST_ACCRUAL_RULES.material_issue_void : COST_ACCRUAL_RULES.material_return;
  const issueRule = COST_ACCRUAL_RULES.material_issue;
  const charge = (await q('SELECT * FROM project_costs WHERE source_type = $1 AND source_id = $2', [issueRule.project_costs_source, issueMovement.id])).rows[0];
  if (!charge) return null;
  const offset = (await q('SELECT * FROM project_costs WHERE source_type = $1 AND source_id = $2', [issueRule.offset_source, issueMovement.id])).rows[0];
  // share = charge x quantity / issued quantity, exactly, half-up in minor units
  const issued = BigInt(Math.round(toNum(issueMovement.quantity) * 1000));
  const back = BigInt(Math.round(toNum(quantity) * 1000));
  if (issued <= 0n || back <= 0n) return null;
  const chargeMinor = money.toMinor(charge.amount);
  const shareMinor = (chargeMinor * back * 2n + issued) / (issued * 2n);
  if (shareMinor <= 0n) return null;
  const row = await insertCostRow(q, {
    projectId: charge.project_id, costCodeId: charge.cost_code_id, sourceType: rule.project_costs_source, sourceId: returnMovement.id,
    amountMinor: -shareMinor, description: `Material ${voided ? 'issue voided' : 'returned'} to stock (movement #${returnMovement.id}): cost given back`,
  });
  if (!row) return null; // replay
  let offsetRow = null;
  if (offset) {
    offsetRow = await insertCostRow(q, {
      projectId: offset.project_id, sourceType: rule.offset_source, sourceId: returnMovement.id,
      amountMinor: shareMinor, description: `Material ${voided ? 'issue voided' : 'returned'} (movement #${returnMovement.id}): cost moved back`,
    });
  }
  return { charge: row, offset: offsetRow };
}

// Expense (pair: the PO chain). An expense with a project is a project cost when it is recorded, the moment
// the ledger entry is posted. One that names a purchase order is owned by that order's GRN/invoice.
async function accrueExpenseCost(q, expense) {
  const rule = COST_ACCRUAL_RULES.expense;
  if (expense.project_id == null || expense.po_id != null) return null;
  const amountMinor = money.toMinor(expense.amount);
  if (amountMinor <= 0n) return null;
  const row = await insertCostRow(q, {
    projectId: expense.project_id,
    costCodeId: await costCodeIdFor(q, rule.cost_code_by_category[String(expense.category || '').toLowerCase()]),
    sourceType: rule.project_costs_source, sourceId: expense.id,
    amountMinor, description: `Expense: ${expense.category}${expense.description ? ` - ${expense.description}` : ''}`,
  });
  return row ? { cost: row } : null;
}

// Payroll (pairs: labour payments and expenses are separate populations). On the first post to finance, each
// employee's net salary is split across projects by attendance days in the payroll month (present or late);
// days with no project count in the denominator and stay overhead. One allocation row and one cost row per
// (payroll, project). The ledger entry for the payroll is the route's and is unchanged.
async function allocatePayrollCost(q, payroll) {
  const rule = COST_ACCRUAL_RULES.payroll;
  const details = (await q('SELECT employee_id, net_salary FROM payroll_details WHERE payroll_id = $1', [payroll.id])).rows;
  if (details.length === 0 || !payroll.month || !payroll.year) return [];
  const start = `${payroll.year}-${String(payroll.month).padStart(2, '0')}-01`;
  const rows = (await q(
    `SELECT employee_id, date, project_id, check_in, check_out FROM attendance
      WHERE employee_id = ANY($1::int[]) AND status IN ('present', 'late')
        AND date >= $2::date AND date < ($2::date + INTERVAL '1 month')
      ORDER BY employee_id, date, id`,
    [details.map((d) => d.employee_id), start]
  )).rows;
  // Each attended day is one unit. A day with several attendance rows (a worker on two projects) is split between
  // them by hours when every row has check-in/out times, else equally. Rows with no project are the unallocated
  // bucket (key null); an employee with no attendance at all is entirely unallocated. Nothing is dropped: the
  // allocations of a payroll always add up to its net salaries.
  const hoursOf = (r) => {
    if (!r.check_in || !r.check_out) return null;
    const [h1, m1] = String(r.check_in).split(':').map(Number);
    const [h2, m2] = String(r.check_out).split(':').map(Number);
    const h = (h2 * 60 + m2 - (h1 * 60 + m1)) / 60;
    return h > 0 ? h : null;
  };
  const key = (v) => (v == null ? 'none' : String(v));
  const byProject = new Map();
  const add = (projectId, minor, employee, days) => {
    const k = key(projectId);
    const entry = byProject.get(k) || { projectId, minor: 0n, employees: new Set(), days: 0 };
    entry.minor += minor; entry.employees.add(employee); entry.days += days;
    byProject.set(k, entry);
  };
  for (const d of details) {
    const netMinor = money.toMinor(d.net_salary == null ? 0 : d.net_salary);
    const mine = rows.filter((r) => r.employee_id === d.employee_id);
    const perDay = new Map();
    for (const r of mine) { const k = String(r.date); perDay.set(k, [...(perDay.get(k) || []), r]); }
    if (perDay.size === 0) { add(null, netMinor, d.employee_id, 0); continue; }
    // weights in millionths of a day, so the arithmetic stays exact
    const weights = new Map();
    for (const dayRows of perDay.values()) {
      const hours = dayRows.map(hoursOf);
      const useHours = hours.every((h) => h != null) && dayRows.length > 1;
      const total = useHours ? hours.reduce((s, h) => s + h, 0) : dayRows.length;
      dayRows.forEach((r, i) => {
        const w = Math.round(((useHours ? hours[i] : 1) / total) * 1000000);
        weights.set(key(r.project_id), { projectId: r.project_id, w: ((weights.get(key(r.project_id)) || { w: 0 }).w) + w });
      });
    }
    const totalWeight = [...weights.values()].reduce((s, x) => s + x.w, 0);
    let assigned = 0n;
    const parts = [...weights.values()];
    parts.forEach((p, i) => {
      const share = i === parts.length - 1 ? netMinor - assigned
        : (netMinor * BigInt(p.w) * 2n + BigInt(totalWeight)) / (BigInt(totalWeight) * 2n); // half-up; the last part takes the remainder
      assigned += share;
      add(p.projectId, share, d.employee_id, p.w / 1000000);
    });
  }
  const posted = [];
  const ordered = [...byProject.values()].sort((x, y) => (x.projectId == null ? 1 : y.projectId == null ? -1 : x.projectId - y.projectId));
  for (const e of ordered) {
    if (e.minor <= 0n) continue;
    const projectId = e.projectId;
    const alloc = (await q(
      `INSERT INTO payroll_cost_allocations (payroll_id, project_id, amount, basis)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING *`,
      [payroll.id, projectId, money.format(e.minor), JSON.stringify({ basis: 'attendance_days_hours_split', employees: e.employees.size, days: e.days })]
    )).rows[0];
    if (!alloc) continue; // replay
    const cost = await insertCostRow(q, {
      projectId, costCodeId: await costCodeIdFor(q, rule.cost_code), sourceType: rule.project_costs_source, sourceId: alloc.id,
      amountMinor: e.minor, description: `Payroll ${payroll.period_name || payroll.id}: attendance allocation`,
    });
    posted.push({ allocation: alloc, cost });
  }
  return posted;
}

module.exports = {
  COST_ACCRUAL_RULES, multiplyQtyRate, accrueCost, accrueGrnCost, claimLine,
  classifySupplierInvoiceLines, accrueSupplierInvoiceCost, reverseGrnCostForReturn,
  insertCostRow, costCodeIdFor, accrueMaterialIssue, reverseMaterialIssueCost, accrueExpenseCost, allocatePayrollCost,
};
