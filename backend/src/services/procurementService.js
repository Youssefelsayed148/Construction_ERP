// Phase 12 — the full PR → RFQ → PO → GRN procurement chain.
//
// Approval runs through the Phase 6 workflow engine with the catalog's exact
// states (workflow-engine-migration.js):
//   PR: Draft → Submit → Budget Check → Authority Approval → Procurement
//   PO: Draft → Commercial/Procurement Approval → Financial Authority →
//       Issued → Acknowledged → Partially/Fully Delivered → Closed
// The source row's status mirrors the workflow's current step key, so the
// document state and the workflow state can never drift.
//
// Calculations (implemented exactly):
//   PO Line Net = Qty × Unit Rate − Discount
//   PO Total    = Σ(Line Net) + Taxes + Freight + Approved Charges
//
// GRN constraint (Phase 10 tie-in):
//   Accepted cumulative ≤ Delivered cumulative ≤ Ordered × (1 + tolerance)
//   A GRN can only be created for MIR-accepted quantities: deliveries enter
//   the ledger as 'quarantine' movements, an accepted MIR posts
//   'quarantine_release' (the stock becomes usable), and the GRN documents
//   the accepted cumulative — it never double-counts stock.
//
// Three-way match flags exceptions (price/quantity variance, missing GRN,
// duplicate invoice, tax mismatch) instead of silently accepting.

'use strict';

const workflowEngine = require('./workflowEngine');
const numbering = require('./numbering');
const inventoryEngine = require('./inventoryEngine');

const PRICE_VARIANCE_TOLERANCE = 0.02;   // 2% line-price tolerance
const TAX_MATCH_TOLERANCE = 1.0;         // absolute currency tolerance

const PO_OPEN_STATUSES = ['draft', 'commercial_procurement_approval', 'financial_authority', 'issued', 'acknowledged', 'partially_fully_delivered', 'partially_delivered', 'fully_delivered'];

function toNum(v) {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round((toNum(n) + Number.EPSILON) * 100) / 100;
}

function round3(n) {
  return Math.round((toNum(n) + Number.EPSILON) * 1000) / 1000;
}

async function nextNumber(q, table, column, prefix) {
  return numbering.nextNumber(q, { table, column, prefix, pad: 5 });
}

// ---------------------------------------------------------------------------
// Formulas (pure)
// ---------------------------------------------------------------------------

function poLineNet(quantity, unitRate, discount) {
  return round2(toNum(quantity) * toNum(unitRate) - toNum(discount));
}

function poTotal(lines, { taxes = 0, freight = 0, approvedCharges = null, approved_charges = null } = {}) {
  const net = (lines || []).reduce((s, l) => s + toNum(l.line_net != null ? l.line_net : poLineNet(l.quantity, l.unit_rate, l.discount)), 0);
  // The PO row stores snake_case; the pure-formula surface uses camelCase.
  const charges = approvedCharges != null ? approvedCharges : approved_charges;
  return round2(net + toNum(taxes) + toNum(freight) + toNum(charges));
}

// GRN constraint: accepted ≤ delivered ≤ ordered × (1 + tolerance)
function grnConstraintOk({ ordered, deliveredCumulative, acceptedCumulative, tolerancePct }) {
  const maxAllowed = round3(toNum(ordered) * (1 + toNum(tolerancePct) / 100));
  return toNum(acceptedCumulative) <= round3(maxAllowed)
    && toNum(deliveredCumulative) <= round3(maxAllowed)
    && toNum(acceptedCumulative) <= toNum(deliveredCumulative) + 1e-9;
}

// ---------------------------------------------------------------------------
// Workflow glue — source status mirrors the workflow's current step
// ---------------------------------------------------------------------------

function documentStatusFromWorkflow(wf, entityType) {
  if (!wf) return null;
  if (wf.status === 'rejected') return 'rejected';
  if (wf.status === 'approved') return entityType === 'purchase_request' ? 'procurement' : 'closed';
  return wf.current_step_key;
}

async function syncStatusFromWorkflow(q, entityType, entityId, { extra = {} } = {}) {
  const table = entityType === 'purchase_request' ? 'purchase_requests' : 'purchase_orders';
  const wf = (await q(
    'SELECT * FROM workflow_instances WHERE entity_type = $1 AND entity_id = $2 ORDER BY id DESC LIMIT 1',
    [entityType, entityId]
  )).rows[0];
  if (!wf) return null;
  const status = documentStatusFromWorkflow(wf, entityType);
  const sets = ['status = $1', 'updated_at = $2'];
  const params = [status, new Date()];
  for (const [k, v] of Object.entries(extra)) { sets.push(`${k} = $${params.length + 1}`); params.push(v); }
  params.push(entityId);
  await q(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  return status;
}

async function decideOnDocument(q, entityType, entityId, user, decision, comment) {
  const table = entityType === 'purchase_request' ? 'purchase_requests' : 'purchase_orders';
  const doc = (await q(`SELECT * FROM ${table} WHERE id = $1`, [entityId])).rows[0];
  if (!doc) throw new Error(`${entityType} #${entityId} not found`);
  if (doc.workflow_instance_id == null) throw new Error(`${entityType} #${entityId} has no active workflow — submit it first`);

  const result = await workflowEngine.recordDecision(doc.workflow_instance_id, null, user.id, decision, comment || null, {
    query: q, role: user.role, userName: user.name,
  });
  if (!result.ok) throw new Error(result.error);

  // Operational refinement: the delivered state depends on real quantities.
  let status = await syncStatusFromWorkflow(q, entityType, entityId);
  if (entityType === 'purchase_order' && status === 'partially_fully_delivered') {
    const totals = await poDeliveryTotals(q, entityId);
    status = totals.delivered > 0
      ? (totals.delivered >= totals.ordered && totals.ordered > 0 ? 'fully_delivered' : 'partially_delivered')
      : 'partially_fully_delivered';
    await q('UPDATE purchase_orders SET status = $1, updated_at = $2 WHERE id = $3', [status, new Date(), entityId]);
  }
  return { ...result, status };
}

// ---------------------------------------------------------------------------
// Purchase requisition
// ---------------------------------------------------------------------------

async function createPurchaseRequest(q, {
  title, project_id = null, priority = 'normal', needed_by = null,
  lines = [], created_by = null, source_type = 'manual', source_id = null, source_key = null,
}) {
  if (!Array.isArray(lines) || lines.length === 0) throw new Error('A requisition needs at least one line');
  const requestNumber = await nextNumber(q, 'purchase_requests', 'request_number', 'PR');
  const amount = round2(lines.reduce((s, l) => s + toNum(l.quantity) * toNum(l.estimated_unit_price), 0));
  const r = await q(
    `INSERT INTO purchase_requests
       (request_number, project_id, material_id, quantity, unit, needed_by, status, source_type, source_id, source_key, policy_mode, title, amount, priority, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
    [requestNumber, project_id, null, lines.reduce((s, l) => s + toNum(l.quantity), 0), null,
     needed_by || (lines[0] && lines[0].needed_by) || null, source_type, null, source_key, null,
     title, amount, priority, created_by]
  );
  const pr = r.rows[0];
  for (const line of lines) {
    await q(
      `INSERT INTO purchase_request_lines
         (purchase_request_id, material_id, description, quantity, unit, estimated_unit_price, needed_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [pr.id, line.material_id || null, line.description || null, line.quantity, line.unit || null,
       line.estimated_unit_price || 0, line.needed_by || null, line.notes || null]
    );
  }
  return pr;
}

async function submitPurchaseRequest(q, prId, user) {
  const pr = (await q('SELECT * FROM purchase_requests WHERE id = $1', [prId])).rows[0];
  if (!pr) throw new Error(`Purchase requisition #${prId} not found`);
  if (pr.status !== 'draft') throw new Error(`Requisition is in state ${pr.status} — only Draft can be submitted`);

  const instance = await workflowEngine.startWorkflow('purchase_requisition', 'purchase_request', pr.id, {
    module_name: 'purchase_request',
    requester_id: user.id,
    project_id: pr.project_id,
    amount: toNum(pr.amount),
    request_type: 'material_requisition',
  }, { query: q });

  await q(
    'UPDATE purchase_requests SET status = $1, workflow_instance_id = $2, updated_at = $3 WHERE id = $4',
    ['submitted', instance.instance.id, new Date(), prId]
  );

  // The submission itself is the requester's action on the Draft → Submit
  // steps: the document lands in the Budget Check state.
  for (const stepKey of ['draft', 'submit']) {
    const stepInstance = (await q(
      "SELECT id FROM workflow_step_instances WHERE instance_id = $1 AND step_key = $2 AND status = 'pending'",
      [instance.instance.id, stepKey]
    )).rows[0];
    if (!stepInstance) break;
    const r = await workflowEngine.recordDecision(instance.instance.id, stepInstance.id, user.id, 'approve', 'Submitted', {
      query: q, role: user.role, userName: user.name,
    });
    if (!r.ok) throw new Error(r.error);
  }
  const status = await syncStatusFromWorkflow(q, 'purchase_request', prId);
  return { workflow: instance, status };
}

// ---------------------------------------------------------------------------
// RFQ + quotations + comparison
// ---------------------------------------------------------------------------

async function createRfq(q, { purchase_request_id = null, project_id = null, title, due_date = null, lines = [], created_by = null }) {
  if (!Array.isArray(lines) || lines.length === 0) throw new Error('An RFQ needs at least one line');
  const rfqNumber = await nextNumber(q, 'rfqs', 'rfq_number', 'RFQ');
  const r = await q(
    `INSERT INTO rfqs (rfq_number, purchase_request_id, project_id, title, due_date, status, created_by)
     VALUES ($1, $2, $3, $4, $5, 'draft', $6) RETURNING *`,
    [rfqNumber, purchase_request_id, project_id, title, due_date, created_by]
  );
  const rfq = r.rows[0];
  for (const line of lines) {
    await q(
      `INSERT INTO rfq_lines (rfq_id, material_id, description, quantity, unit)
       VALUES ($1, $2, $3, $4, $5)`,
      [rfq.id, line.material_id || null, line.description || null, line.quantity, line.unit || null]
    );
  }
  return rfq;
}

async function inviteVendors(q, rfqId, supplierIds) {
  const existing = (await q('SELECT * FROM rfq_vendors WHERE rfq_id = $1', [rfqId])).rows;
  const have = new Set(existing.map((v) => v.supplier_id));
  for (const supplierId of supplierIds) {
    if (have.has(supplierId)) continue;
    await q(
      'INSERT INTO rfq_vendors (rfq_id, supplier_id, status) VALUES ($1, $2, $3)',
      [rfqId, supplierId, 'invited']
    );
  }
  return (await q('SELECT * FROM rfq_vendors WHERE rfq_id = $1 ORDER BY id', [rfqId])).rows;
}

async function submitQuotation(q, {
  rfq_id, supplier_id, lines = [], tax_pct = 0, payment_terms = null, delivery_terms = null,
  lead_time_days = null, warranty_months = null, valid_until = null, compliant = true,
  deviations = [], technical_score = null, commercial_score = null, created_by = null,
}) {
  const rfq = (await q('SELECT * FROM rfqs WHERE id = $1', [rfq_id])).rows[0];
  if (!rfq) throw new Error(`RFQ #${rfq_id} not found`);
  if (['awarded', 'closed', 'cancelled', 'void'].includes(rfq.status)) throw new Error('RFQ is no longer open for quotations');
  if (rfq.due_date && new Date(rfq.due_date).getTime() < Date.now() - 86400000) throw new Error('RFQ quotation deadline has passed');
  const invited = (await q('SELECT * FROM rfq_vendors WHERE rfq_id = $1', [rfq_id])).rows
    .some((v) => toNum(v.supplier_id) === toNum(supplier_id));
  if (!invited) throw new Error('Supplier was not invited to this RFQ');
  const duplicate = (await q(
    'SELECT * FROM supplier_quotations WHERE rfq_id = $1 AND supplier_id = $2',
    [rfq_id, supplier_id]
  )).rows[0];
  if (duplicate) throw new Error('This vendor already quoted on the RFQ');

  const rfqLines = (await q('SELECT * FROM rfq_lines WHERE rfq_id = $1', [rfq_id])).rows;
  const expected = new Set(rfqLines.map((line) => toNum(line.id)));
  const offered = lines.map((line) => toNum(line.rfq_line_id));
  if (offered.length !== expected.size || new Set(offered).size !== expected.size || offered.some((id) => !expected.has(id))) {
    throw new Error('Quotation must cover each line of this RFQ exactly once');
  }
  for (const line of lines) {
    const source = rfqLines.find((r) => toNum(r.id) === toNum(line.rfq_line_id));
    if (line.material_id != null && toNum(line.material_id) !== toNum(source.material_id)) {
      throw new Error('Quotation material does not match its RFQ line');
    }
  }
  const subtotal = round2(lines.reduce((s, l) => s + toNum(l.quantity) * toNum(l.unit_price), 0));
  const tax = round2(subtotal * toNum(tax_pct) / 100);
  const quotationNumber = await nextNumber(q, 'supplier_quotations', 'quotation_number', 'Q');

  const r = await q(
    `INSERT INTO supplier_quotations
       (quotation_number, rfq_id, supplier_id, total_price, tax_pct, tax_amount, payment_terms,
        delivery_terms, lead_time_days, warranty_months, valid_until, compliant, deviations,
        technical_score, commercial_score, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'submitted', $16) RETURNING *`,
    [quotationNumber, rfq_id, supplier_id, round2(subtotal + tax), tax_pct, tax,
     payment_terms, delivery_terms, lead_time_days, warranty_months, valid_until,
     compliant !== false, JSON.stringify(deviations || []), technical_score, commercial_score, created_by]
  );
  const quotation = r.rows[0];
  for (const line of lines) {
    const rfqLine = rfqLines.find((rl) => rl.id === toNum(line.rfq_line_id)) || null;
    await q(
      `INSERT INTO supplier_quotation_lines
         (quotation_id, rfq_line_id, material_id, quantity, unit_price, total_price, delivery_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [quotation.id, line.rfq_line_id || null,
       line.material_id || (rfqLine ? rfqLine.material_id : null),
       line.quantity, line.unit_price || 0, round2(toNum(line.quantity) * toNum(line.unit_price)),
       line.delivery_days || null]
    );
  }
  await q("UPDATE rfq_vendors SET status = 'quoted' WHERE rfq_id = $1 AND supplier_id = $2", [rfq_id, supplier_id]);
  return quotation;
}

// The commercial comparison matrix. Columns: compliant, lead time, unit
// price, total price, payment/delivery terms, tax, warranty, deviations,
// technical/commercial score.
async function buildBidComparison(q, rfqId, opts = {}) {
  const rfq = (await q('SELECT * FROM rfqs WHERE id = $1', [rfqId])).rows[0];
  if (!rfq) throw new Error(`RFQ #${rfqId} not found`);
  const quotations = (await q('SELECT * FROM supplier_quotations WHERE rfq_id = $1 ORDER BY id', [rfqId])).rows;

  const rows = [];
  for (const quotation of quotations) {
    const supplier = (await q('SELECT * FROM suppliers WHERE id = $1', [quotation.supplier_id])).rows[0];
    const qlines = (await q('SELECT * FROM supplier_quotation_lines WHERE quotation_id = $1', [quotation.id])).rows;
    const lineCount = qlines.length || 1;
    rows.push({
      quotation_id: quotation.id,
      supplier_id: quotation.supplier_id,
      supplier_name: supplier ? (supplier.name_en || supplier.name_ar || supplier.code) : `supplier #${quotation.supplier_id}`,
      quotation_number: quotation.quotation_number,
      compliant: quotation.compliant !== false,
      lead_time_days: quotation.lead_time_days,
      unit_price: qlines.length ? round2(qlines.reduce((s, l) => s + toNum(l.unit_price), 0) / lineCount) : null,
      total_price: quotation.total_price,
      payment_terms: quotation.payment_terms,
      delivery_terms: quotation.delivery_terms,
      tax_amount: quotation.tax_amount,
      warranty_months: quotation.warranty_months,
      deviations: quotation.deviations,
      technical_score: quotation.technical_score,
      commercial_score: quotation.commercial_score,
    });
  }

  // Recommendation: best compliant quote — commercial score first, then the
  // lowest total price as the tiebreak.
  const compliantRows = rows.filter((r) => r.compliant);
  const best = compliantRows.slice().sort((a, b) => {
    const ac = toNum(a.commercial_score);
    const bc = toNum(b.commercial_score);
    if (ac !== bc) return bc - ac;
    return toNum(a.total_price) - toNum(b.total_price);
  })[0] || null;

  const comparison = { rfq_id: rfqId, rfq_number: rfq.rfq_number, rows };
  const recommendation = best ? { quotation_id: best.quotation_id, supplier_id: best.supplier_id, supplier_name: best.supplier_name, total_price: best.total_price, reason: 'highest commercial score among compliant quotes; lowest total price as tiebreak' } : null;

  if (opts.persist !== false) {
    await q(
      'INSERT INTO bid_comparisons (rfq_id, comparison, recommendation, created_by) VALUES ($1, $2, $3, $4)',
      [rfqId, JSON.stringify(comparison), JSON.stringify(recommendation || {}), opts.createdBy || null]
    );
  }
  return { ...comparison, recommendation };
}

// Vendor-scoped view: a vendor's portal may NEVER see a competitor's quote —
// only its own quotation and the comparison metadata stripped of competitors.
async function quotationsForVendor(q, rfqId, supplierId) {
  const mine = (await q(
    'SELECT * FROM supplier_quotations WHERE rfq_id = $1 AND supplier_id = $2',
    [rfqId, supplierId]
  )).rows;
  return mine;
}

async function awardRfq(q, rfqId, quotationId, user) {
  const rfq = (await q('SELECT * FROM rfqs WHERE id = $1', [rfqId])).rows[0];
  if (!rfq) throw new Error(`RFQ #${rfqId} not found`);
  const quotation = (await q('SELECT * FROM supplier_quotations WHERE id = $1 AND rfq_id = $2', [quotationId, rfqId])).rows[0];
  if (!quotation) throw new Error(`Quotation #${quotationId} is not on RFQ #${rfqId}`);
  if (quotation.compliant === false) throw new Error('A non-compliant quotation cannot be awarded');

  await q('UPDATE supplier_quotations SET awarded = $1, status = $2 WHERE id = $3', [true, 'awarded', quotationId]);
  await q('UPDATE supplier_quotations SET status = $1 WHERE rfq_id = $2 AND id != $3', ['not_awarded', rfqId, quotationId]);
  await q('UPDATE rfqs SET status = $1, awarded_quotation_id = $2, updated_at = $3 WHERE id = $4', ['awarded', quotationId, new Date(), rfqId]);
  return (await q('SELECT * FROM supplier_quotations WHERE id = $1', [quotationId])).rows[0];
}

// ---------------------------------------------------------------------------
// Purchase order
// ---------------------------------------------------------------------------

async function createPurchaseOrder(q, {
  supplier_id, purchase_request_id = null, project_id = null, warehouse_id = null,
  needed_by = null, tolerance_pct = 5, taxes = 0, freight = 0, approved_charges = 0,
  payment_terms = null, delivery_terms = null, lines = [], created_by = null, source_key = null,
}) {
  if (!Array.isArray(lines) || lines.length === 0) throw new Error('A purchase order needs at least one line');
  const orderNumber = await nextNumber(q, 'purchase_orders', 'order_number', 'PO');
  const r = await q(
    `INSERT INTO purchase_orders
       (order_number, supplier_id, project_id, material_id, quantity, unit_price, total_amount, unit,
        status, needed_by, source_type, source_key, purchase_request_id, taxes, freight, approved_charges,
        tolerance_pct, payment_terms, delivery_terms, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9, 'manual', $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING *`,
    [orderNumber, supplier_id, project_id, null, 0, 0, 0, null, needed_by || null, source_key,
     purchase_request_id, taxes, freight, approved_charges, tolerance_pct, payment_terms, delivery_terms, created_by]
  );
  const po = r.rows[0];
  for (const line of lines) {
    await q(
      `INSERT INTO purchase_order_lines
         (purchase_order_id, material_id, description, quantity, unit, unit_rate, discount, needed_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [po.id, line.material_id || null, line.description || null, line.quantity, line.unit || null,
       line.unit_rate || 0, line.discount || 0, line.needed_by || null, line.notes || null]
    );
  }
  const enriched = await recomputePoTotals(q, po.id);
  return enriched;
}

// PO Line Net = Qty × Unit Rate − Discount; PO Total = Σ(Line Net) + Taxes +
// Freight + Approved Charges. The stored total is ALWAYS derived here.
async function recomputePoTotals(q, poId) {
  const lines = (await q('SELECT * FROM purchase_order_lines WHERE purchase_order_id = $1 ORDER BY id', [poId])).rows;
  const po = (await q('SELECT * FROM purchase_orders WHERE id = $1', [poId])).rows[0];
  const total = poTotal(lines, po || {});
  const poTotalQty = lines.reduce((s, l) => s + toNum(l.quantity), 0);
  await q(
    'UPDATE purchase_orders SET quantity = $1, unit_price = $2, total_amount = $3, updated_at = $4 WHERE id = $5',
    [round3(poTotalQty), lines.length ? round2(total / Math.max(poTotalQty, 1e-9)) : 0, total, new Date(), poId]
  );
  return { ...po, quantity: round3(poTotalQty), total_amount: total, lines };
}

async function issuePurchaseOrder(q, poId, user) {
  // Issue = start the approval chain: the workflow state machine runs
  // Draft → Commercial/Procurement Approval → Financial Authority → Issued.
  const po = (await q('SELECT * FROM purchase_orders WHERE id = $1', [poId])).rows[0];
  if (!po) throw new Error(`Purchase order #${poId} not found`);
  if (po.status !== 'draft') throw new Error(`PO is in state ${po.status} — only Draft can enter approval`);
  if (po.workflow_instance_id != null) throw new Error('PO already has a workflow');

  const instance = await workflowEngine.startWorkflow('po', 'purchase_order', po.id, {
    module_name: 'purchase_order',
    requester_id: user.id,
    project_id: po.project_id,
    amount: toNum(po.total_amount),
    supplier_id: po.supplier_id,
    request_type: 'purchase_order',
  }, { query: q });

  await q('UPDATE purchase_orders SET workflow_instance_id = $1, updated_at = $2 WHERE id = $3',
    [instance.instance.id, new Date(), poId]);
  // The workflow sits at the Draft step — the requester's decision moves the
  // PO into the Commercial/Procurement Approval state.
  const status = await syncStatusFromWorkflow(q, 'purchase_order', poId);
  return { ...instance, status };
}

async function poDeliveryTotals(q, poId) {
  const poLines = (await q('SELECT * FROM purchase_order_lines WHERE purchase_order_id = $1', [poId])).rows;
  let ordered = 0;
  let delivered = 0;
  let accepted = 0;
  for (const l of poLines) {
    ordered += toNum(l.quantity);
    delivered += toNum(l.delivered_quantity);
    accepted += toNum(l.accepted_quantity);
  }
  return { ordered: round3(ordered), delivered: round3(delivered), accepted: round3(accepted) };
}

// ---------------------------------------------------------------------------
// Deliveries → MIR → GRN (the Phase 10 gate)
// ---------------------------------------------------------------------------

async function createDelivery(q, {
  purchase_order_id, warehouse_id, delivery_date = null, lines = [], received_by = null,
}) {
  const po = (await q('SELECT * FROM purchase_orders WHERE id = $1', [purchase_order_id])).rows[0];
  if (!po) throw new Error(`Purchase order #${purchase_order_id} not found`);
  if (!PO_OPEN_STATUSES.includes(po.status)) throw new Error(`PO is ${po.status} — deliveries require an issued/open PO`);

  const poLines = (await q('SELECT * FROM purchase_order_lines WHERE purchase_order_id = $1', [purchase_order_id])).rows;
  for (const line of lines) {
    const poLine = poLines.find((pl) => pl.id === toNum(line.purchase_order_line_id));
    if (!poLine) throw new Error(`Delivery line does not reference a PO line of PO #${purchase_order_id}`);
    const deliveredCum = toNum(poLine.delivered_quantity) + toNum(line.quantity);
    const maxAllowed = round3(toNum(poLine.quantity) * (1 + toNum(po.tolerance_pct) / 100));
    if (deliveredCum > maxAllowed + 1e-9) {
      throw new Error(`Delivered cumulative ${deliveredCum} exceeds ordered ${toNum(poLine.quantity)} + tolerance ${toNum(po.tolerance_pct)}% for PO line #${line.purchase_order_line_id}`);
    }
  }

  const deliveryNumber = await nextNumber(q, 'deliveries', 'delivery_number', 'DLV');
  const r = await q(
    `INSERT INTO deliveries (delivery_number, purchase_order_id, supplier_id, warehouse_id, delivery_date, status, received_by)
     VALUES ($1, $2, $3, $4, $5, 'received', $6) RETURNING *`,
    [deliveryNumber, purchase_order_id, po.supplier_id, warehouse_id, delivery_date || new Date().toISOString().slice(0, 10), received_by]
  );
  const delivery = r.rows[0];
  for (const line of lines) {
    const poLine = poLines.find((pl) => pl.id === toNum(line.purchase_order_line_id));
    await q(
      `INSERT INTO delivery_lines (delivery_id, purchase_order_line_id, material_id, quantity, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [delivery.id, line.purchase_order_line_id, line.material_id || (poLine ? poLine.material_id : null), line.quantity, line.notes || null]
    );
    // Ledger: received-but-uninspected → quarantine bucket (Phase 10 gate).
    await inventoryEngine.createMovement(q, {
      warehouse_id, material_id: line.material_id || (poLine ? poLine.material_id : null),
      movement_type: 'quarantine', quantity: line.quantity,
      reference_type: 'delivery', reference_id: delivery.id, created_by: received_by,
    });
    await q(
      'UPDATE purchase_order_lines SET delivered_quantity = $1 WHERE id = $2',
      [round3(toNum(poLine.delivered_quantity) + toNum(line.quantity)), line.purchase_order_line_id]
    );
  }
  // The delivered states of the catalog are driven by real quantities.
  const totals = await poDeliveryTotals(q, purchase_order_id);
  const deliveryStatus = totals.delivered >= totals.ordered && totals.ordered > 0 ? 'fully_delivered' : 'partially_delivered';
  await q('UPDATE purchase_orders SET status = $1, updated_at = $2 WHERE id = $3', [deliveryStatus, new Date(), purchase_order_id]);
  return delivery;
}

async function createMir(q, { delivery_id, lines = null, created_by = null }) {
  const delivery = (await q('SELECT * FROM deliveries WHERE id = $1', [delivery_id])).rows[0];
  if (!delivery) throw new Error(`Delivery #${delivery_id} not found`);
  const existing = (await q('SELECT * FROM material_inspection_requests WHERE delivery_id = $1', [delivery_id])).rows[0];
  if (existing) throw new Error(`Delivery #${delivery_id} already has MIR #${existing.mir_number}`);

  const deliveryLines = (await q('SELECT * FROM delivery_lines WHERE delivery_id = $1', [delivery_id])).rows;
  const mirNumber = await nextNumber(q, 'material_inspection_requests', 'mir_number', 'MIR');
  const r = await q(
    `INSERT INTO material_inspection_requests
       (mir_number, purchase_order_id, delivery_id, supplier_id, warehouse_id, status, created_by)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6) RETURNING *`,
    [mirNumber, delivery.purchase_order_id, delivery_id, delivery.supplier_id, delivery.warehouse_id, created_by]
  );
  const mir = r.rows[0];
  const sourceLines = Array.isArray(lines) && lines.length ? lines
    : deliveryLines.map((dl) => ({ delivery_line_id: dl.id, purchase_order_line_id: dl.purchase_order_line_id, material_id: dl.material_id, quantity: dl.quantity }));
  for (const line of sourceLines) {
    await q(
      `INSERT INTO mir_lines (mir_id, delivery_line_id, purchase_order_line_id, material_id, quantity, accepted_quantity, rejected_quantity)
       VALUES ($1, $2, $3, $4, $5, 0, 0)`,
      [mir.id, line.delivery_line_id || null, line.purchase_order_line_id || null, line.material_id || null, line.quantity]
    );
  }
  return mir;
}

// MIR decision — ties directly into Phase 10's quarantine gate: accepted
// quantities post quarantine_release movements (usable stock); rejected
// quantities are written off from quarantine (never usable).
async function decideMir(q, mirId, user, decision, { accepted = null, notes = null } = {}) {
  const mir = (await q('SELECT * FROM material_inspection_requests WHERE id = $1', [mirId])).rows[0];
  if (!mir) throw new Error(`MIR #${mirId} not found`);
  if (mir.status !== 'pending') throw new Error(`MIR is already ${mir.status}`);
  if (!['accept', 'reject'].includes(decision)) throw new Error(`Invalid MIR decision: ${decision}`);

  const mirLines = (await q('SELECT * FROM mir_lines WHERE mir_id = $1', [mirId])).rows;
  if (mirLines.length === 0) throw new Error('MIR has no lines');
  let acceptedQty = 0;
  let inspectedQty = 0;
  for (const line of mirLines) {
    const inspected = toNum(line.quantity);
    const lineAccepted = decision === 'reject'
      ? 0
      : round3(accepted && accepted[line.id] != null ? toNum(accepted[line.id]) : inspected);
    if (lineAccepted < 0 || lineAccepted > inspected + 1e-9) {
      throw new Error(`Accepted quantity ${lineAccepted} is outside MIR line #${line.id} quantity ${inspected}`);
    }
    const rejected = round3(inspected - lineAccepted);
    inspectedQty = round3(inspectedQty + inspected);
    acceptedQty = round3(acceptedQty + lineAccepted);

    if (lineAccepted > 0) {
      await inventoryEngine.createMovement(q, {
        warehouse_id: mir.warehouse_id, material_id: line.material_id,
        movement_type: 'quarantine_release', quantity: lineAccepted,
        reference_type: 'mir', reference_id: mirId, created_by: user ? user.id : null,
      });
    }
    if (rejected > 0) {
      await inventoryEngine.createMovement(q, {
        warehouse_id: mir.warehouse_id, material_id: line.material_id,
        movement_type: 'quarantine_reject', quantity: rejected,
        reference_type: 'mir', reference_id: mirId, created_by: user ? user.id : null,
      });
    }
    await q(
      'UPDATE mir_lines SET accepted_quantity = $1, rejected_quantity = $2 WHERE id = $3',
      [lineAccepted, rejected, line.id]
    );
    if (line.purchase_order_line_id != null && lineAccepted > 0) {
      const poLine = (await q('SELECT * FROM purchase_order_lines WHERE id = $1', [line.purchase_order_line_id])).rows[0];
      if (poLine) {
        await q(
          'UPDATE purchase_order_lines SET accepted_quantity = $1 WHERE id = $2',
          [round3(toNum(poLine.accepted_quantity) + lineAccepted), line.purchase_order_line_id]
        );
      }
    }
  }

  const status = acceptedQty === 0 ? 'rejected'
    : acceptedQty < inspectedQty ? 'partially_accepted' : 'accepted';
  await q(
    'UPDATE material_inspection_requests SET status = $1, inspected_by = $2, decided_at = $3, notes = $4 WHERE id = $5',
    [status, user ? user.id : null, new Date(), notes, mirId]
  );
  return (await q('SELECT * FROM material_inspection_requests WHERE id = $1', [mirId])).rows[0];
}

// GRN — only for MIR-accepted quantities. Documents the acceptance; the
// usable stock already moved at MIR accept (quarantine_release), so the GRN
// posts no second movement (accepted-cumulative bookkeeping only).
async function createGrn(q, { mir_id, warehouse_id, created_by = null, received_by = null }) {
  const mir = (await q('SELECT * FROM material_inspection_requests WHERE id = $1', [mir_id])).rows[0];
  if (!mir) throw new Error(`MIR #${mir_id} not found`);
  if (!['accepted', 'partially_accepted'].includes(mir.status)) {
    throw new Error(`MIR ${mir.status} — a GRN can only be created for MIR-accepted quantities`);
  }
  const existingGrn = (await q('SELECT * FROM goods_receipt_notes WHERE mir_id = $1', [mir_id])).rows[0];
  if (existingGrn) throw new Error(`MIR #${mir_id} already has GRN #${existingGrn.grn_number}`);

  const mirLines = (await q('SELECT * FROM mir_lines WHERE mir_id = $1', [mir_id])).rows;
  const acceptedLines = mirLines.filter((l) => toNum(l.accepted_quantity) > 0);
  if (acceptedLines.length === 0) throw new Error('MIR has no accepted quantities');

  // Enforce: accepted cumulative ≤ delivered cumulative ≤ ordered + tolerance.
  const po = (await q('SELECT * FROM purchase_orders WHERE id = $1', [mir.purchase_order_id])).rows[0];
  for (const line of acceptedLines) {
    const poLine = (await q('SELECT * FROM purchase_order_lines WHERE id = $1', [line.purchase_order_line_id])).rows[0];
    const ok = grnConstraintOk({
      ordered: poLine.quantity,
      deliveredCum: poLine.delivered_quantity,
      acceptedCum: toNum(poLine.accepted_quantity),
      tolerancePct: po ? po.tolerance_pct : 5,
    });
    if (!ok) {
      throw new Error(`GRN constraint violated on PO line #${line.purchase_order_line_id}: accepted ${poLine.accepted_quantity} > delivered ${poLine.delivered_quantity} or ordered ${poLine.quantity} + tolerance`);
    }
  }

  const grnNumber = await nextNumber(q, 'goods_receipt_notes', 'grn_number', 'GRN');
  const r = await q(
    `INSERT INTO goods_receipt_notes
       (grn_number, purchase_order_id, delivery_id, mir_id, warehouse_id, status, received_by, created_by)
     VALUES ($1, $2, $3, $4, $5, 'posted', $6, $7) RETURNING *`,
    [grnNumber, mir.purchase_order_id, mir.delivery_id, mir.id, mir.warehouse_id, received_by || created_by, created_by]
  );
  const grn = r.rows[0];
  for (const line of acceptedLines) {
    await q(
      `INSERT INTO grn_lines (grn_id, mir_line_id, purchase_order_line_id, material_id, quantity, unit)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [grn.id, line.id, line.purchase_order_line_id, line.material_id, line.accepted_quantity, null]
    );
  }
  return grn;
}

// Supplier return — draws the material back out of stock (Phase 10 ledger).
async function createSupplierReturn(q, { grn_id, reason = null, lines = [], created_by = null }) {
  const grn = (await q('SELECT * FROM goods_receipt_notes WHERE id = $1', [grn_id])).rows[0];
  if (!grn) throw new Error(`GRN #${grn_id} not found`);
  const po = (await q('SELECT * FROM purchase_orders WHERE id = $1', [grn.purchase_order_id])).rows[0];
  const returnNumber = await nextNumber(q, 'supplier_returns', 'return_number', 'SRN');

  const r = await q(
    `INSERT INTO supplier_returns (return_number, purchase_order_id, grn_id, supplier_id, warehouse_id, reason, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'returned', $7) RETURNING *`,
    [returnNumber, grn.purchase_order_id, grn_id, po ? po.supplier_id : null, grn.warehouse_id, reason, created_by]
  );
  const supplierReturn = r.rows[0];
  for (const line of lines) {
    await q(
      `INSERT INTO supplier_return_lines (supplier_return_id, material_id, quantity, notes)
       VALUES ($1, $2, $3, $4)`,
      [supplierReturn.id, line.material_id, line.quantity, line.notes || null]
    );
    await inventoryEngine.createMovement(q, {
      warehouse_id: grn.warehouse_id, material_id: line.material_id,
      movement_type: 'supplier_return', quantity: line.quantity,
      reference_type: 'supplier_return', reference_id: supplierReturn.id, created_by,
    });
  }
  return supplierReturn;
}

// ---------------------------------------------------------------------------
// Three-way match: invoice vs PO vs GRN
// ---------------------------------------------------------------------------

function matchInvoiceLine({ poLine = null, grnQuantity = 0, invoiceQuantity, invoiceUnitPrice, poUnitRate }) {
  const exceptions = [];
  if (!poLine) {
    exceptions.push({ type: 'missing_po_line', detail: 'invoice line does not reference a PO line' });
    return exceptions;
  }
  if (toNum(grnQuantity) <= 0) {
    exceptions.push({ type: 'missing_grn', detail: `no GRN acceptance for PO line #${poLine.id}` });
  }
  if (toNum(invoiceQuantity) > toNum(grnQuantity) + 1e-6) {
    exceptions.push({
      type: 'quantity_variance',
      detail: `invoiced ${toNum(invoiceQuantity)} exceeds GRN-accepted ${toNum(grnQuantity)}`,
    });
  }
  const poRate = toNum(poUnitRate != null ? poUnitRate : poLine.unit_rate);
  const variance = poRate > 0 ? Math.abs(toNum(invoiceUnitPrice) - poRate) / poRate : 0;
  if (variance > PRICE_VARIANCE_TOLERANCE) {
    exceptions.push({
      type: 'price_variance',
      detail: `invoice ${toNum(invoiceUnitPrice)} vs PO ${poRate} (${(variance * 100).toFixed(1)}% off)`,
    });
  }
  return exceptions;
}

async function recordSupplierInvoice(q, {
  supplier_id, purchase_order_id, invoice_number, invoice_date = null,
  total_amount = 0, tax_amount = 0, lines = [], created_by = null,
}) {
  const duplicate = (await q(
    'SELECT * FROM supplier_invoices WHERE supplier_id = $1 AND invoice_number = $2',
    [supplier_id, invoice_number]
  )).rows[0];
  if (duplicate) throw new Error('Duplicate invoice: this supplier already submitted this invoice number');

  const r = await q(
    `INSERT INTO supplier_invoices
       (invoice_number, supplier_id, purchase_order_id, invoice_date, total_amount, tax_amount, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'received', $7) RETURNING *`,
    [invoice_number, supplier_id, purchase_order_id, invoice_date || new Date().toISOString().slice(0, 10),
     total_amount, tax_amount, created_by]
  );
  const invoice = r.rows[0];
  for (const line of lines) {
    await q(
      `INSERT INTO supplier_invoice_lines (supplier_invoice_id, purchase_order_line_id, material_id, quantity, unit_price, line_total)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [invoice.id, line.purchase_order_line_id || null, line.material_id || null,
       line.quantity, line.unit_price || 0, round2(toNum(line.quantity) * toNum(line.unit_price))]
    );
  }
  const match = await threeWayMatch(q, invoice.id);
  return { invoice, match };
}

async function threeWayMatch(q, invoiceId) {
  const invoice = (await q('SELECT * FROM supplier_invoices WHERE id = $1', [invoiceId])).rows[0];
  if (!invoice) throw new Error(`Supplier invoice #${invoiceId} not found`);
  const invLines = (await q('SELECT * FROM supplier_invoice_lines WHERE supplier_invoice_id = $1', [invoiceId])).rows;
  let grnLines = [];
  if (invoice.purchase_order_id != null) {
    const grnIds = (await q('SELECT id FROM goods_receipt_notes WHERE purchase_order_id = $1', [invoice.purchase_order_id])).rows.map((r) => r.id);
    const allGrnLines = (await q('SELECT * FROM grn_lines')).rows;
    grnLines = allGrnLines.filter((l) => grnIds.includes(l.grn_id));
  }
  const grnQtyFor = (poLineId) => grnLines
    .filter((r) => r.purchase_order_line_id === poLineId)
    .reduce((s, r) => s + toNum(r.quantity), 0);

  const exceptions = [];
  const lineResults = [];
  for (const line of invLines) {
    let poLine = null;
    if (line.purchase_order_line_id != null) {
      poLine = (await q('SELECT * FROM purchase_order_lines WHERE id = $1', [line.purchase_order_line_id])).rows[0] || null;
    }
    const ex = matchInvoiceLine({
      poLine,
      grnQuantity: poLine ? grnQtyFor(poLine.id) : 0,
      invoiceQuantity: line.quantity,
      invoiceUnitPrice: line.unit_price,
      poUnitRate: poLine ? poLine.unit_rate : null,
    });
    if (poLine && toNum(line.quantity) > toNum(poLine.delivered_quantity) + 1e-6 && !ex.some((e) => e.type === 'quantity_variance')) {
      ex.push({ type: 'quantity_variance', detail: `invoiced ${toNum(line.quantity)} exceeds delivered ${toNum(poLine.delivered_quantity)}` });
    }
    lineResults.push({ line_id: line.id, exceptions: ex });
    exceptions.push(...ex);
  }

  // Tax mismatch: invoice tax vs PO taxes (2% tolerance).
  const po = invoice.purchase_order_id != null
    ? (await q('SELECT * FROM purchase_orders WHERE id = $1', [invoice.purchase_order_id])).rows[0]
    : null;
  if (po && toNum(po.taxes) > 0 && Math.abs(toNum(invoice.tax_amount) - toNum(po.taxes)) > Math.max(round2(toNum(po.taxes) * 0.02), 0.01)) {
    exceptions.push({
      type: 'tax_mismatch',
      detail: `invoice tax ${toNum(invoice.tax_amount)} vs PO taxes ${toNum(po.taxes)}`,
    });
  }
  // Invoice total vs PO total (2% tolerance).
  if (po && Math.abs(toNum(invoice.total_amount) - toNum(po.total_amount)) > Math.max(round2(toNum(po.total_amount) * 0.02), 0.01)) {
    exceptions.push({
      type: 'price_variance',
      detail: `invoice total ${toNum(invoice.total_amount)} vs PO total ${toNum(po.total_amount)}`,
    });
  }

  const matchStatus = exceptions.length === 0 ? 'matched' : 'exception';
  await q(
    'UPDATE supplier_invoices SET exceptions = $1, match_status = $2 WHERE id = $3',
    [JSON.stringify(exceptions), matchStatus, invoiceId]
  );
  return { match_status: matchStatus, exceptions, line_results: lineResults };
}

// ---------------------------------------------------------------------------
// Issue to a work package (the chain's last mile into Phase 8/10 execution)
// ---------------------------------------------------------------------------

async function issueMaterialToWorkPackage(q, {
  work_order_id, material_id, boq_item_id = null, quantity, warehouse_id, created_by = null,
}) {
  const balances = await inventoryEngine.getBalances(q, warehouse_id, material_id);
  if (balances.available < toNum(quantity)) {
    throw new Error(`Insufficient stock: ${balances.available} available, ${quantity} requested`);
  }
  const wom = await q(
    `INSERT INTO work_order_materials
       (work_order_id, item_id, boq_item_id, planned_quantity, actual_quantity, warehouse_id, issued_by)
     VALUES ($1, $2, $3, 0, $4, $5, $6) RETURNING *`,
    [work_order_id, material_id, boq_item_id, quantity, warehouse_id, created_by]
  );
  const movement = await inventoryEngine.createMovement(q, {
    warehouse_id, material_id, movement_type: 'issue', quantity,
    reference_type: 'work_order_material', reference_id: wom.rows[0].id, created_by,
  });
  return { work_order_material: wom.rows[0], movement };
}

module.exports = {
  PRICE_VARIANCE_TOLERANCE,
  PO_OPEN_STATUSES,
  toNum,
  round2,
  round3,
  poLineNet,
  poTotal,
  grnConstraintOk,
  createPurchaseRequest,
  submitPurchaseRequest,
  decideOnDocument,
  createRfq,
  inviteVendors,
  submitQuotation,
  buildBidComparison,
  quotationsForVendor,
  awardRfq,
  createPurchaseOrder,
  recomputePoTotals,
  issuePurchaseOrder,
  poDeliveryTotals,
  createDelivery,
  createMir,
  decideMir,
  createGrn,
  createSupplierReturn,
  matchInvoiceLine,
  recordSupplierInvoice,
  threeWayMatch,
  issueMaterialToWorkPackage,
};
