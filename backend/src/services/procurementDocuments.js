// Phase 5.4 (spec 08) - RFQ reads, and update / cancel of purchase requisitions and purchase orders.
//
//   * A requisition or order is EDITED only while it is a draft (once it is submitted the workflow owns it).
//   * It is CANCELLED, never deleted: a status, who, when and why; its workflow instance is cancelled with it
//     (non-destructively, the way approvals are) so nobody is asked to act on it.
//       requisition   cancellable until an order exists for it; refused with the count of orders otherwise.
//       order         cancellable until anything was received or invoiced against it; refused with the counts.
'use strict';

const procurement = require('./procurementService');
const workflowEngine = require('./workflowEngine');
const projectSetup = require('./projectSetupService');

class DocumentError extends Error {
  constructor(status, code, message, params = {}) {
    super(message);
    this.status = status; this.error_code = code; this.error_params = params;
  }
}
const bad = (code, message, params) => new DocumentError(400, code, message, params);
const conflict = (code, message, params) => new DocumentError(409, code, message, params);
const missing = (code, message, params) => new DocumentError(404, code, message, params);

const toInt = (v) => (v == null || v === '' ? null : Number(v));
const toNum = (v) => (v == null ? 0 : Number(v));
const round2 = (n) => Math.round((toNum(n) + Number.EPSILON) * 100) / 100;
const reasonOf = (r) => {
  const text = String(r || '').trim();
  if (text.length < 3) throw bad('cancel_reason_required', 'A reason is required to cancel');
  return text;
};

// --- RFQ reads --------------------------------------------------------------------------------------

async function listRfqs(q, { project_id = null, status = null, limit = 100, offset = 0 } = {}) {
  const conds = []; const params = [];
  if (project_id != null) conds.push(`r.project_id = $${params.push(toInt(project_id))}`);
  if (status) conds.push(`r.status = $${params.push(status)}`);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  params.push(Math.min(toInt(limit) || 100, 500)); params.push(toInt(offset) || 0);
  return (await q(
    `SELECT r.*, (SELECT count(*)::int FROM rfq_lines l WHERE l.rfq_id = r.id) AS line_count,
            (SELECT count(*)::int FROM rfq_vendors v WHERE v.rfq_id = r.id) AS vendor_count,
            (SELECT count(*)::int FROM supplier_quotations sq WHERE sq.rfq_id = r.id) AS quotation_count
       FROM rfqs r ${where} ORDER BY r.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params)).rows;
}

async function getRfq(q, id) {
  const rfq = (await q('SELECT * FROM rfqs WHERE id = $1', [toInt(id)])).rows[0];
  if (!rfq) throw missing('rfq_not_found', `RFQ #${id} not found`, { rfq_id: id });
  const lines = (await q('SELECT * FROM rfq_lines WHERE rfq_id = $1 ORDER BY id', [rfq.id])).rows;
  const vendors = (await q(
    `SELECT v.*, s.code AS supplier_code, s.name_en AS supplier_name_en, s.name_ar AS supplier_name_ar
       FROM rfq_vendors v JOIN suppliers s ON s.id = v.supplier_id WHERE v.rfq_id = $1 ORDER BY v.id`, [rfq.id])).rows;
  const quotations = (await q('SELECT * FROM supplier_quotations WHERE rfq_id = $1 ORDER BY id', [rfq.id])).rows;
  for (const quotation of quotations) {
    quotation.lines = (await q('SELECT * FROM supplier_quotation_lines WHERE quotation_id = $1 ORDER BY id', [quotation.id])).rows;
  }
  const recommendation = (await q(
    `SELECT id, recommendation_number, quotation_id, supplier_id, total_price, basis, status, deviates_from_comparison
       FROM rfq_award_recommendations WHERE rfq_id = $1 AND status IN ('draft', 'submitted', 'approved') LIMIT 1`, [rfq.id])).rows[0] || null;
  return { ...rfq, lines, vendors, quotations, award_recommendation: recommendation };
}

// --- purchase requisitions ----------------------------------------------------------------------------

async function lockPr(q, id) {
  const pr = (await q('SELECT * FROM purchase_requests WHERE id = $1 FOR UPDATE', [toInt(id)])).rows[0];
  if (!pr) throw missing('pr_not_found', `Purchase requisition #${id} not found`, { id });
  return pr;
}

async function updatePurchaseRequest(q, id, patch) {
  const pr = await lockPr(q, id);
  if (pr.status !== 'draft') throw conflict('pr_not_draft', `Requisition ${pr.request_number} is ${pr.status}: only a draft can be edited`, { id: pr.id, status: pr.status });
  const projectId = patch.project_id !== undefined ? toInt(patch.project_id) : pr.project_id;
  if (patch.project_id !== undefined && projectId != null) {
    const p = (await q('SELECT id FROM projects WHERE id = $1', [projectId])).rows[0];
    if (!p) throw missing('project_not_found', `Project #${projectId} not found`, { project_id: projectId });
  }
  const locationId = patch.location_id !== undefined ? toInt(patch.location_id) : pr.location_id;
  if (locationId != null) {
    const loc = (await q('SELECT id FROM project_locations WHERE id = $1 AND project_id IS NOT DISTINCT FROM $2', [locationId, projectId])).rows[0];
    if (!loc) throw bad('location_not_in_project', `Location #${locationId} is not on this project`, { location_id: locationId, project_id: projectId });
  }
  const costCodeId = patch.cost_code_id !== undefined ? toInt(patch.cost_code_id) : pr.cost_code_id;
  if (costCodeId != null) {
    const cc = (await q('SELECT id FROM cost_codes WHERE id = $1', [costCodeId])).rows[0];
    if (!cc) throw missing('cost_code_not_found', `Cost code #${costCodeId} not found`, { cost_code_id: costCodeId });
  }
  let workPackageId = patch.work_package_id !== undefined ? toInt(patch.work_package_id) : pr.work_package_id;
  if (workPackageId != null && projectId != null) {
    workPackageId = (await projectSetup.resolveWorkPackage(q, projectId, { work_package_id: workPackageId })).id;
  }
  await q(
    `UPDATE purchase_requests SET title = COALESCE($2, title), priority = COALESCE($3, priority), needed_by = $4, notes = $5,
            project_id = $6, location_id = $7, cost_code_id = $8, work_package_id = $9, updated_at = NOW() WHERE id = $1`,
    [pr.id, patch.title || null, patch.priority || null, patch.needed_by !== undefined ? patch.needed_by : pr.needed_by,
      patch.notes !== undefined ? patch.notes : pr.notes, projectId, locationId, costCodeId, workPackageId]);
  if (Array.isArray(patch.lines)) {
    if (patch.lines.length === 0) throw bad('pr_lines_required', 'A requisition needs at least one line');
    await q('DELETE FROM purchase_request_lines WHERE purchase_request_id = $1', [pr.id]);
    for (const line of patch.lines) {
      await q(
        `INSERT INTO purchase_request_lines (purchase_request_id, material_id, description, quantity, unit, estimated_unit_price, needed_by, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [pr.id, line.material_id || null, line.description || null, line.quantity, line.unit || null, line.estimated_unit_price || 0, line.needed_by || null, line.notes || null]);
    }
    const lines = patch.lines;
    await q('UPDATE purchase_requests SET quantity = $2, amount = $3 WHERE id = $1',
      [pr.id, lines.reduce((s, l) => s + toNum(l.quantity), 0), round2(lines.reduce((s, l) => s + toNum(l.quantity) * toNum(l.estimated_unit_price), 0))]);
  }
  return getPurchaseRequest(q, pr.id);
}

async function getPurchaseRequest(q, id) {
  const pr = (await q('SELECT * FROM purchase_requests WHERE id = $1', [toInt(id)])).rows[0];
  if (!pr) throw missing('pr_not_found', `Purchase requisition #${id} not found`, { id });
  const lines = (await q('SELECT * FROM purchase_request_lines WHERE purchase_request_id = $1 ORDER BY id', [pr.id])).rows;
  return { ...pr, lines };
}

const PR_CANCELLABLE = ['draft', 'submitted', 'budget_check', 'authority_approval', 'procurement'];

async function cancelPurchaseRequest(q, id, user, reason) {
  const text = reasonOf(reason);
  const pr = await lockPr(q, id);
  if (!PR_CANCELLABLE.includes(pr.status)) {
    throw conflict('pr_cannot_cancel', `Requisition ${pr.request_number} is ${pr.status} and cannot be cancelled`, { id: pr.id, status: pr.status });
  }
  const orders = (await q("SELECT count(*)::int AS n FROM purchase_orders WHERE purchase_request_id = $1 AND status <> 'cancelled'", [pr.id])).rows[0].n;
  if (orders > 0) throw conflict('pr_has_orders', `Requisition ${pr.request_number} already has ${orders} purchase order(s): cancel them first`, { id: pr.id, orders });
  if (pr.workflow_instance_id != null) await workflowEngine.cancelWorkflowInstance(q, pr.workflow_instance_id, { userId: user.id, reason: text });
  await q("UPDATE purchase_requests SET status = 'cancelled', cancel_reason = $2, cancelled_by = $3, cancelled_at = NOW(), updated_at = NOW() WHERE id = $1",
    [pr.id, text, user.id]);
  return getPurchaseRequest(q, pr.id);
}

// --- purchase orders ------------------------------------------------------------------------------------

async function lockPo(q, id) {
  const po = (await q('SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE', [toInt(id)])).rows[0];
  if (!po) throw missing('po_not_found', `Purchase order #${id} not found`, { id });
  return po;
}

async function getPurchaseOrder(q, id) {
  const po = (await q('SELECT * FROM purchase_orders WHERE id = $1', [toInt(id)])).rows[0];
  if (!po) throw missing('po_not_found', `Purchase order #${id} not found`, { id });
  const lines = (await q('SELECT * FROM purchase_order_lines WHERE purchase_order_id = $1 ORDER BY id', [po.id])).rows;
  return { ...po, lines };
}

async function updatePurchaseOrder(q, id, patch) {
  const po = await lockPo(q, id);
  if (po.status !== 'draft' || po.workflow_instance_id != null) {
    throw conflict('po_not_draft', `Order ${po.order_number} is ${po.workflow_instance_id != null ? 'in approval' : po.status}: only a draft that has not entered approval can be edited`, { id: po.id, status: po.status, in_approval: po.workflow_instance_id != null });
  }
  if (patch.supplier_id !== undefined) {
    const s = (await q('SELECT id FROM suppliers WHERE id = $1', [toInt(patch.supplier_id)])).rows[0];
    if (!s) throw missing('supplier_not_found', `Supplier #${patch.supplier_id} not found`, { supplier_id: patch.supplier_id });
  }
  await q(
    `UPDATE purchase_orders SET supplier_id = COALESCE($2, supplier_id), needed_by = $3, tolerance_pct = COALESCE($4, tolerance_pct),
            taxes = COALESCE($5, taxes), freight = COALESCE($6, freight), approved_charges = COALESCE($7, approved_charges),
            payment_terms = $8, delivery_terms = $9, updated_at = NOW() WHERE id = $1`,
    [po.id, patch.supplier_id !== undefined ? toInt(patch.supplier_id) : null, patch.needed_by !== undefined ? patch.needed_by : po.needed_by,
      patch.tolerance_pct ?? null, patch.taxes ?? null, patch.freight ?? null, patch.approved_charges ?? null,
      patch.payment_terms !== undefined ? patch.payment_terms : po.payment_terms, patch.delivery_terms !== undefined ? patch.delivery_terms : po.delivery_terms]);
  if (Array.isArray(patch.lines)) {
    if (patch.lines.length === 0) throw bad('po_lines_required', 'A purchase order needs at least one line');
    await q('DELETE FROM purchase_order_lines WHERE purchase_order_id = $1', [po.id]);
    for (const line of patch.lines) {
      await q(
        `INSERT INTO purchase_order_lines (purchase_order_id, material_id, description, quantity, unit, unit_rate, discount, needed_by, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [po.id, line.material_id || null, line.description || null, line.quantity, line.unit || null, line.unit_rate || 0, line.discount || 0, line.needed_by || null, line.notes || null]);
    }
  }
  await procurement.recomputePoTotals(q, po.id);
  return getPurchaseOrder(q, po.id);
}

const PO_CANCELLABLE = ['draft', 'commercial_procurement_approval', 'financial_authority', 'issued', 'acknowledged', 'approved', 'confirmed'];

async function cancelPurchaseOrder(q, id, user, reason) {
  const text = reasonOf(reason);
  const po = await lockPo(q, id);
  if (!PO_CANCELLABLE.includes(po.status)) {
    throw conflict('po_cannot_cancel', `Order ${po.order_number} is ${po.status} and cannot be cancelled`, { id: po.id, status: po.status });
  }
  const deliveries = (await q('SELECT count(*)::int AS n FROM deliveries WHERE purchase_order_id = $1', [po.id])).rows[0].n;
  if (deliveries > 0) throw conflict('po_has_deliveries', `Order ${po.order_number} has ${deliveries} delivery(ies) against it and cannot be cancelled`, { id: po.id, deliveries });
  const invoices = (await q('SELECT count(*)::int AS n FROM supplier_invoices WHERE purchase_order_id = $1', [po.id])).rows[0].n;
  if (invoices > 0) throw conflict('po_has_invoices', `Order ${po.order_number} has ${invoices} supplier invoice(s) against it and cannot be cancelled`, { id: po.id, invoices });
  if (po.workflow_instance_id != null) await workflowEngine.cancelWorkflowInstance(q, po.workflow_instance_id, { userId: user.id, reason: text });
  await q("UPDATE purchase_orders SET status = 'cancelled', cancel_reason = $2, cancelled_by = $3, cancelled_at = NOW(), updated_at = NOW() WHERE id = $1",
    [po.id, text, user.id]);
  return getPurchaseOrder(q, po.id);
}

module.exports = {
  DocumentError, listRfqs, getRfq,
  getPurchaseRequest, updatePurchaseRequest, cancelPurchaseRequest,
  getPurchaseOrder, updatePurchaseOrder, cancelPurchaseOrder,
};
