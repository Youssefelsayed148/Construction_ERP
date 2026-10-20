const { authorizeProjectPayload } = require('../services/authorizedProject');
const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { queryPaginated, paginateRows } = require('../utils/pagination');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity, fireEvent } = require('../utils/activity');
const svc = require('../services/procurementService');
const pdf = require('../utils/procurementPdf');
const { auditedTransaction } = require('../utils/auditedTransaction');
const { auditedChange } = require('../utils/auditedMutation');
const { typedFail: commonTypedFail, routeFail } = require('../utils/typedRoute');
const atomic = (fn) => transaction((client) => fn(client.query.bind(client)));

// Phase 12 — the PR → RFQ → PO → GRN procurement surface. All state lives in
// the tables + the Phase 6 workflow engine; these routes are thin adapters.

const prLineSchema = Joi.object({
  material_id: Joi.number().integer().optional().allow(null),
  description: Joi.string().optional().allow('', null),
  quantity: Joi.number().positive().required(),
  unit: Joi.string().optional().allow('', null),
  estimated_unit_price: Joi.number().min(0).default(0),
  needed_by: Joi.date().iso().optional().allow(null),
  notes: Joi.string().optional().allow('', null),
});

// Project procurement workspace read model for the complete PR → RFQ → PO →
// delivery → MIR → GRN chain.
router.get('/project/:projectId', authenticate, authorize(), async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    // This workspace is a six-collection read model. Apply the same requested
    // page to each list, and report the combined number of matching rows.
    const paged = (sql, orderBy) => queryPaginated(req, { setHeader() {} }, query, {
      sql, params: [projectId], orderBy,
    });
    const [purchaseRequests, rfqs, purchaseOrders, deliveries, mirs, grns] = await Promise.all([
      paged('SELECT * FROM purchase_requests WHERE project_id = $1', [{ column: 'created_at', direction: 'DESC' }, { column: 'id', direction: 'DESC' }]),
      paged('SELECT * FROM rfqs WHERE project_id = $1', [{ column: 'created_at', direction: 'DESC' }, { column: 'id', direction: 'DESC' }]),
      paged('SELECT * FROM purchase_orders WHERE project_id = $1', [{ column: 'created_at', direction: 'DESC' }, { column: 'id', direction: 'DESC' }]),
      paged(`SELECT d.* FROM deliveries d JOIN purchase_orders po ON po.id = d.purchase_order_id
        WHERE po.project_id = $1`, [{ column: 'd.created_at', direction: 'DESC' }, { column: 'd.id', direction: 'DESC' }]),
      paged('SELECT * FROM material_inspection_requests WHERE project_id = $1', [{ column: 'created_at', direction: 'DESC' }, { column: 'id', direction: 'DESC' }]),
      paged(`SELECT g.* FROM goods_receipt_notes g JOIN purchase_orders po ON po.id = g.purchase_order_id
        WHERE po.project_id = $1`, [{ column: 'g.created_at', direction: 'DESC' }, { column: 'g.id', direction: 'DESC' }]),
    ]);
    res.setHeader('X-Total-Count', String(
      purchaseRequests.total + rfqs.total + purchaseOrders.total + deliveries.total + mirs.total + grns.total
    ));
    res.json({ success: true, data: {
      purchase_requests: purchaseRequests.rows,
      rfqs: rfqs.rows,
      purchase_orders: purchaseOrders.rows,
      deliveries: deliveries.rows,
      material_inspection_requests: mirs.rows,
      goods_receipt_notes: grns.rows,
    } });
  } catch (e) { return routeFail(res, e, 'PROCUREMENT', req); }
});

// ---------------------------------------------------------------------------
// Purchase requisitions (PR: Draft → Submit → Budget Check → Authority →
// Procurement via the Phase 6 workflow engine)
// ---------------------------------------------------------------------------

router.post('/pr', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      title: Joi.string().required(),
      project_id: Joi.number().integer().optional().allow(null),
      location_id: Joi.number().integer().optional().allow(null),
      cost_code_id: Joi.number().integer().optional().allow(null),
      work_package_id: Joi.number().integer().optional().allow(null),
      priority: Joi.string().valid('low', 'normal', 'high', 'urgent').default('normal'),
      needed_by: Joi.date().iso().optional().allow(null),
      lines: Joi.array().items(prLineSchema).min(1).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error', error_params: { field: error.details[0].path.join('.') } });
    authorizeProjectPayload(req, value);

    const pr = await auditedTransaction(
      (q) => svc.createPurchaseRequest(q, { ...value, created_by: req.user.id }),
      (row) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'procurement',
        description: `Created purchase requisition ${row.request_number}`, entityId: row.id, entityType: 'purchase_request' })
    );
    res.status(201).json({ success: true, data: pr });
  } catch (e) { return routeFail(res, e, 'PROCUREMENT', req); }
});

router.post('/pr/:id/submit', authenticate, authorize(), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await auditedChange(req, { action: 'submit', module: 'procurement', entityType: 'purchase_request' }, {
      table: 'purchase_requests', id, run: (q) => svc.submitPurchaseRequest(q, id, req.user),
      describe: (row) => `Submitted purchase requisition ${row?.request_number || id}`,
    });
    res.json({ success: true, data: result });
  } catch (e) { return routeFail(res, e, 'PROCUREMENT', req); }
});

router.post('/pr/:id/decide', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      decision: Joi.string().valid('approve', 'reject').required(), comment: Joi.string().allow('', null),
      override_over_budget: Joi.boolean().default(false), override_reason: Joi.string().allow('', null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error', error_params: { field: error.details[0].path.join('.') } });
    const id = parseInt(req.params.id, 10);
    // Every decision is audited; an over-budget override keeps its distinct action and reason.
    const result = await auditedChange(req, { action: 'decide', module: 'procurement', entityType: 'purchase_request' }, {
      table: 'purchase_requests', id,
      run: (q) => svc.decideOnDocument(q, 'purchase_request', id, req.user, value.decision, value.comment,
        { overrideOverBudget: value.override_over_budget, overrideReason: value.override_reason }),
      actionOf: (data) => (data.budget_override ? 'budget_override' : value.decision),
      describe: (row, data) => (data.budget_override
        ? `Over-budget override on requisition #${id}: ${data.budget_override.reason}`
        : `Requisition ${row?.request_number || id}: ${value.decision}`),
    });
    res.json({ success: true, data: result });
  } catch (e) { return routeFail(res, e, 'PROCUREMENT', req); }
});

// ---------------------------------------------------------------------------
// RFQs, quotations, comparison (vendors' own quotes only — never a
// competitor's), award
// ---------------------------------------------------------------------------

router.post('/rfq', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      purchase_request_id: Joi.number().integer().optional().allow(null),
      project_id: Joi.number().integer().optional().allow(null),
      title: Joi.string().required(),
      due_date: Joi.date().iso().optional().allow(null),
      lines: Joi.array().items(Joi.object({
        material_id: Joi.number().integer().optional().allow(null),
        description: Joi.string().optional().allow('', null),
        quantity: Joi.number().positive().required(),
        unit: Joi.string().optional().allow('', null),
      })).min(1).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error', error_params: { field: error.details[0].path.join('.') } });
    authorizeProjectPayload(req, value);
    const rfq = await auditedChange(req, { action: 'create', module: 'procurement', entityType: 'rfq' }, {
      table: 'rfqs', run: (q) => svc.createRfq(q, { ...value, created_by: req.user.id }),
      describe: (row) => `Created RFQ ${row?.rfq_number || row?.id}`,
    });
    res.status(201).json({ success: true, data: rfq });
  } catch (e) { return routeFail(res, e, 'PROCUREMENT', req); }
});

router.post('/rfq/:id/vendors', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ supplier_ids: Joi.array().items(Joi.number().integer()).min(1).required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error', error_params: { field: error.details[0].path.join('.') } });
    const rfqId = parseInt(req.params.id, 10);
    const vendors = await auditedChange(req, { action: 'invite_vendors', module: 'procurement', entityType: 'rfq' }, {
      table: 'rfqs', id: rfqId, run: (q) => svc.inviteVendors(q, rfqId, value.supplier_ids),
      describe: (row) => `Invited ${value.supplier_ids.length} vendor(s) to RFQ ${row?.rfq_number || rfqId}`,
    });
    res.status(201).json({ success: true, data: vendors });
  } catch (e) { return routeFail(res, e, 'PROCUREMENT', req); }
});

router.post('/rfq/:id/quotations', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      supplier_id: Joi.number().integer().required(),
      lines: Joi.array().items(Joi.object({
        rfq_line_id: Joi.number().integer().optional().allow(null),
        material_id: Joi.number().integer().optional().allow(null),
        quantity: Joi.number().positive().required(),
        unit_price: Joi.number().min(0).default(0),
        delivery_days: Joi.number().integer().optional().allow(null),
      })).min(1).required(),
      tax_pct: Joi.number().min(0).default(0),
      payment_terms: Joi.string().optional().allow('', null),
      delivery_terms: Joi.string().optional().allow('', null),
      lead_time_days: Joi.number().integer().optional().allow(null),
      warranty_months: Joi.number().integer().optional().allow(null),
      valid_until: Joi.date().iso().optional().allow(null),
      compliant: Joi.boolean().default(true),
      deviations: Joi.array().items(Joi.string()).default([]),
      technical_score: Joi.number().optional().allow(null),
      commercial_score: Joi.number().optional().allow(null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error', error_params: { field: error.details[0].path.join('.') } });
    const quotation = await auditedChange(req, { action: 'create', module: 'procurement', entityType: 'supplier_quotation' }, {
      table: 'supplier_quotations', run: (q) => svc.submitQuotation(q, { ...value, rfq_id: parseInt(req.params.id, 10), created_by: req.user.id }),
      describe: (row) => `Recorded quotation ${row?.id} on RFQ #${req.params.id}`,
      amountOf: (row) => (row?.total_price == null ? undefined : Number(row.total_price)),
    });
    res.status(201).json({ success: true, data: quotation });
  } catch (e) { return routeFail(res, e, 'PROCUREMENT', req); }
});

// Full commercial comparison — internal eyes only.
router.get('/rfq/:id/comparison', authenticate, authorize(), async (req, res) => {
  try {
    const comparison = await svc.buildBidComparison(query, parseInt(req.params.id, 10), { persist: false });
    res.json({ success: true, data: comparison });
  } catch (e) { return routeFail(res, e, 'PROCUREMENT', req); }
});

// Vendor-scoped view — a vendor sees only its own quotation.
router.get('/rfq/:id/quotations/vendor/:supplierId', authenticate, authorize(), async (req, res) => {
  try {
    const rfqId = parseInt(req.params.id, 10);
    const supplierId = parseInt(req.params.supplierId, 10);
    if (req.user.role === 'supplier') {
      const scope = await require('../services/portalEngine').supplierScope(query, req.user.id);
      if (!scope.supplierIds.includes(supplierId)) {
        return res.status(404).json({ success: false, error: 'Quotation not found', error_code: 'quotation_not_found', error_params: {} });
      }
      const rfq = (await query('SELECT project_id FROM rfqs WHERE id = $1', [rfqId])).rows[0];
      if (!rfq || !scope.assignments.some((a) => a.supplier_id === supplierId && a.project_id === Number(rfq.project_id))) {
        return res.status(404).json({ success: false, error: 'Quotation not found', error_code: 'quotation_not_found', error_params: {} });
      }
    }
    const allMine = await svc.quotationsForVendor(query, rfqId, supplierId);
    const page = paginateRows(req, res, allMine, { orderBy: [{ column: 'id' }] });
    const mine = page.rows;
    const lines = [];
    for (const quotation of mine) {
      lines.push(...(await query('SELECT * FROM supplier_quotation_lines WHERE quotation_id = $1', [quotation.id])).rows);
    }
    res.json({ success: true, data: { quotations: mine, lines } });
  } catch (e) { return routeFail(res, e, 'PROCUREMENT', req); }
});

// Direct award: the owner/admin shortcut. It is ON THE RECORD: an approved 'direct_award' recommendation with a
// mandatory justification is written with it. Everyone else recommends (POST /rfq/:id/award-recommendations).
router.post('/rfq/:id/award', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const schema = Joi.object({ quotation_id: Joi.number().integer().required(), justification: Joi.string().allow('', null) });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error', error_params: { field: error.details[0].path.join('.') } });
    const rfqId = parseInt(req.params.id, 10);
    const quotation = await auditedChange(req, { action: 'direct_award', module: 'procurement', entityType: 'rfq' }, {
      table: 'rfqs', id: rfqId, run: (q) => awards.directAward(q, rfqId, value.quotation_id, req.user, value.justification),
      describe: (row) => `Direct award on RFQ ${row?.rfq_number || rfqId} to quotation #${value.quotation_id}`,
    });
    res.json({ success: true, data: quotation });
  } catch (e) { return typedFail(res, e); }
});

// ---------------------------------------------------------------------------
// Purchase orders
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Phase 5.4: RFQ reads, award recommendations (a real entity with an approval), PR/PO update and cancel,
// vendor performance and spend. Typed errors carry error_code and error_params.
// ---------------------------------------------------------------------------
const awards = require('../services/awardService');
const docsSvc = require('../services/procurementDocuments');
const analytics = require('../services/procurementAnalytics');
const commitmentLedger = require('../services/commitmentLedger');

function typedFail(res, e) {
  return commonTypedFail(res, e, 'PROCUREMENT');
}
const typedBody = (schema, req, res) => {
  const { error, value } = schema.validate(req.body || {});
  if (error) {
    res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error', error_params: { field: error.details[0].path.join('.') } });
    return null;
  }
  return value;
};
const auditedProc = (req, work, describe) => auditedTransaction(work, (row) => ({
  userId: req.user.id, userName: req.user.name, userRole: req.user.role,
  module: 'procurement', ...describe(row),
}));

router.get('/rfq', authenticate, authorize(), async (req, res) => {
  try {
    const page = await queryPaginated(req, res, query, {
      ...docsSvc.rfqListQuery(req.query), orderBy: [{ column: 'r.id', direction: 'DESC' }], tieBreaker: 'r.id',
    });
    res.json({ success: true, data: page.rows });
  } catch (e) { return typedFail(res, e); }
});

router.get('/rfq/:id', authenticate, authorize(), async (req, res) => {
  try { res.json({ success: true, data: await docsSvc.getRfq(query, req.params.id) }); } catch (e) { return typedFail(res, e); }
});

router.get('/award-recommendations', authenticate, authorize(), async (req, res) => {
  try { res.json({ success: true, data: await awards.list(query, req.query) }); } catch (e) { return typedFail(res, e); }
});

router.get('/award-recommendations/:id', authenticate, authorize(), async (req, res) => {
  try { res.json({ success: true, data: await awards.get(query, req.params.id) }); } catch (e) { return typedFail(res, e); }
});

router.post('/rfq/:id/award-recommendations', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(Joi.object({
      quotation_id: Joi.number().integer().required(), basis: Joi.string().required(), justification: Joi.string().required(),
    }), req, res);
    if (!value) return;
    const rec = await auditedProc(req, (q) => awards.create(q, { ...value, rfq_id: parseInt(req.params.id, 10), created_by: req.user.id }),
      (row) => ({ action: 'create', description: `Award recommendation ${row.recommendation_number}`, entityType: 'rfq_award_recommendation', entityId: row.id }));
    res.status(201).json({ success: true, data: rec });
  } catch (e) { return typedFail(res, e); }
});

router.post('/award-recommendations/:id/submit', authenticate, authorize(), async (req, res) => {
  try {
    const rec = await auditedProc(req, (q) => awards.submit(q, parseInt(req.params.id, 10), req.user),
      (row) => ({ action: 'submit', description: `Award recommendation ${row.recommendation_number} submitted`, entityType: 'rfq_award_recommendation', entityId: row.id }));
    res.json({ success: true, data: rec });
  } catch (e) { return typedFail(res, e); }
});

router.post('/award-recommendations/:id/decide', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(Joi.object({ decision: Joi.string().valid('approve', 'reject').required(), comment: Joi.string().allow('', null) }), req, res);
    if (!value) return;
    const rec = await auditedProc(req, (q) => awards.decide(q, parseInt(req.params.id, 10), req.user, value.decision, value.comment),
      (row) => ({ action: value.decision === 'approve' ? 'approve' : 'reject', description: `Award recommendation ${row.recommendation_number}: ${row.status}`, entityType: 'rfq_award_recommendation', entityId: row.id }));
    res.json({ success: true, data: rec });
  } catch (e) { return typedFail(res, e); }
});

router.post('/award-recommendations/:id/withdraw', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(Joi.object({ reason: Joi.string().required() }), req, res);
    if (!value) return;
    const rec = await auditedProc(req, (q) => awards.withdraw(q, parseInt(req.params.id, 10), req.user, value.reason),
      (row) => ({ action: 'update', description: `Award recommendation ${row.recommendation_number} withdrawn`, entityType: 'rfq_award_recommendation', entityId: row.id }));
    res.json({ success: true, data: rec });
  } catch (e) { return typedFail(res, e); }
});

// ---------------------------------------------------------------------------
// Phase 5.5: the seeded supplier_subcontract_invoice workflow for a supplier invoice. The 'approval' step runs the
// invoice approval (the cost accrual point) in the same transaction; POST /invoices/:id/approve stays as the shortcut.
// ---------------------------------------------------------------------------
const invoiceFlow = require('../services/financeDocuments');

router.get('/invoices/:id/workflow', authenticate, authorize(), async (req, res) => {
  try { res.json({ success: true, data: await invoiceFlow.workflowState(query, req.params.id) }); } catch (e) { return typedFail(res, e); }
});
// Supplier invoice register is project-scoped at query time. The AP review queue is company-wide,
// so it must not be reused as a project invoice list.
router.get('/invoices', authenticate, authorize(), async (req, res) => {
  try {
    const projectId = Number(req.query.project_id);
    if (!Number.isInteger(projectId) || projectId < 1) {
      return res.status(400).json({ success: false, error: 'A valid project_id is required', error_code: 'validation_error', error_params: { field: 'project_id' } });
    }
    if (req.accessScope && !req.accessScope.companyWide && !req.accessScope.projectIds.includes(projectId)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions', error_code: 'forbidden', error_params: {} });
    }
    const page = await queryPaginated(req, res, query, {
      sql: `SELECT si.*, s.name_en AS supplier_name, po.project_id, po.order_number
         FROM supplier_invoices si
         JOIN purchase_orders po ON po.id = si.purchase_order_id
         LEFT JOIN suppliers s ON s.id = si.supplier_id
        WHERE po.project_id = $1`, params: [projectId],
      orderBy: [{ column: 'si.created_at', direction: 'DESC' }, { column: 'si.id', direction: 'DESC' }],
    });
    res.json({ success: true, data: page.rows });
  } catch (e) { return typedFail(res, e); }
});
router.post('/invoices/:id/workflow/start', authenticate, authorize(), async (req, res) => {
  try {
    const out = await auditedProc(req, (q) => invoiceFlow.startSupplierInvoiceWorkflow(q, parseInt(req.params.id, 10), req.user),
      (row) => ({ action: 'submit', description: `Supplier invoice ${row.invoice.invoice_number} workflow started`, entityType: 'supplier_invoice', entityId: row.invoice.id }));
    res.json({ success: true, data: out });
  } catch (e) { return typedFail(res, e); }
});
router.post('/invoices/:id/workflow/decide', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(Joi.object({ decision: Joi.string().valid('approve', 'reject').required(), comment: Joi.string().allow('', null) }), req, res);
    if (!value) return;
    const out = await auditedProc(req, (q) => invoiceFlow.decideSupplierInvoice(q, parseInt(req.params.id, 10), req.user, value.decision, value.comment),
      (row) => ({ action: value.decision === 'approve' ? 'approve' : 'reject', description: `Supplier invoice ${row.invoice.invoice_number} workflow decision: ${value.decision}`, entityType: 'supplier_invoice', entityId: row.invoice.id }));
    res.json({ success: true, data: out });
  } catch (e) { return typedFail(res, e); }
});

const prEditSchema = Joi.object({
  title: Joi.string(), project_id: Joi.number().integer().allow(null), location_id: Joi.number().integer().allow(null),
  cost_code_id: Joi.number().integer().allow(null), work_package_id: Joi.number().integer().allow(null),
  priority: Joi.string().valid('low', 'normal', 'high', 'urgent'), needed_by: Joi.date().iso().allow(null), notes: Joi.string().allow('', null),
  lines: Joi.array().items(prLineSchema).min(1),
}).min(1);

router.get('/pr/:id', authenticate, authorize(), async (req, res) => {
  try { res.json({ success: true, data: await docsSvc.getPurchaseRequest(query, req.params.id) }); } catch (e) { return typedFail(res, e); }
});

router.put('/pr/:id', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(prEditSchema, req, res);
    if (!value) return;
    authorizeProjectPayload(req, value);
    const pr = await auditedProc(req, (q) => docsSvc.updatePurchaseRequest(q, req.params.id, value),
      (row) => ({ action: 'update', description: `Edited purchase requisition ${row.request_number}`, entityType: 'purchase_request', entityId: row.id }));
    res.json({ success: true, data: pr });
  } catch (e) { return typedFail(res, e); }
});

router.post('/pr/:id/cancel', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(Joi.object({ reason: Joi.string().required() }), req, res);
    if (!value) return;
    const pr = await auditedProc(req, (q) => docsSvc.cancelPurchaseRequest(q, req.params.id, req.user, value.reason),
      (row) => ({ action: 'cancel', description: `Cancelled purchase requisition ${row.request_number}: ${value.reason}`, entityType: 'purchase_request', entityId: row.id }));
    res.json({ success: true, data: pr });
  } catch (e) { return typedFail(res, e); }
});

const poEditSchema = Joi.object({
  supplier_id: Joi.number().integer(), needed_by: Joi.date().iso().allow(null), tolerance_pct: Joi.number().min(0).max(50),
  taxes: Joi.number().min(0), freight: Joi.number().min(0), approved_charges: Joi.number().min(0),
  payment_terms: Joi.string().allow('', null), delivery_terms: Joi.string().allow('', null),
  lines: Joi.array().items(Joi.object({
    material_id: Joi.number().integer().optional().allow(null), description: Joi.string().optional().allow('', null),
    quantity: Joi.number().positive().required(), unit: Joi.string().optional().allow('', null),
    unit_rate: Joi.number().min(0).default(0), discount: Joi.number().min(0).default(0),
    needed_by: Joi.date().iso().optional().allow(null), notes: Joi.string().optional().allow('', null),
  })).min(1),
}).min(1);

router.get('/po/:id', authenticate, authorize(), async (req, res) => {
  try { res.json({ success: true, data: await docsSvc.getPurchaseOrder(query, req.params.id) }); } catch (e) { return typedFail(res, e); }
});

router.put('/po/:id', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(poEditSchema, req, res);
    if (!value) return;
    const po = await auditedProc(req, (q) => docsSvc.updatePurchaseOrder(q, req.params.id, value),
      (row) => ({ action: 'update', description: `Edited purchase order ${row.order_number}`, entityType: 'purchase_order', entityId: row.id }));
    res.json({ success: true, data: po });
  } catch (e) { return typedFail(res, e); }
});

router.post('/po/:id/cancel', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(Joi.object({ reason: Joi.string().required() }), req, res);
    if (!value) return;
    const po = await auditedProc(req, async (q) => {
      const cancelled = await docsSvc.cancelPurchaseOrder(q, req.params.id, req.user, value.reason);
      await commitmentLedger.syncPurchaseOrder(q, cancelled.id);
      await fireEvent({
        eventType: 'purchase_order.cancelled', entityType: 'purchase_order', entityId: cancelled.id,
        userId: req.user.id, userName: req.user.name, userRole: req.user.role,
        payload: { purchase_order_id: cancelled.id, status: cancelled.status },
      }, { query: q });
      return cancelled;
    },
      (row) => ({ action: 'cancel', description: `Cancelled purchase order ${row.order_number}: ${value.reason}`, entityType: 'purchase_order', entityId: row.id }));
    res.json({ success: true, data: po });
  } catch (e) { return typedFail(res, e); }
});

// Analytics: derived from the documents (see services/procurementAnalytics for every definition). The action is
// see_supplier_value (policy.ACTION_OVERRIDES): this is supplier commercial data.
const scopeIds = (req) => (req.accessScope && !req.accessScope.companyWide ? req.accessScope.projectIds : null);

router.get('/analytics/spend', authenticate, authorize(), async (req, res) => {
  try {
    const data = await analytics.spend(query, { ...req.query, projectIds: scopeIds(req) });
    res.json({ success: true, data });
  } catch (e) { return typedFail(res, e); }
});

router.get('/analytics/vendor-performance', authenticate, authorize(), async (req, res) => {
  try {
    const data = await analytics.vendorPerformance(query, { ...req.query, projectIds: scopeIds(req) });
    res.json({ success: true, data });
  } catch (e) { return typedFail(res, e); }
});

router.post('/po', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      supplier_id: Joi.number().integer().required(),
      purchase_request_id: Joi.number().integer().optional().allow(null),
      project_id: Joi.number().integer().optional().allow(null),
      needed_by: Joi.date().iso().optional().allow(null),
      tolerance_pct: Joi.number().min(0).max(50).default(5),
      taxes: Joi.number().min(0).default(0),
      freight: Joi.number().min(0).default(0),
      approved_charges: Joi.number().min(0).default(0),
      payment_terms: Joi.string().optional().allow('', null),
      delivery_terms: Joi.string().optional().allow('', null),
      lines: Joi.array().items(Joi.object({
        material_id: Joi.number().integer().optional().allow(null),
        description: Joi.string().optional().allow('', null),
        quantity: Joi.number().positive().required(),
        unit: Joi.string().optional().allow('', null),
        unit_rate: Joi.number().min(0).default(0),
        discount: Joi.number().min(0).default(0),
        needed_by: Joi.date().iso().optional().allow(null),
        notes: Joi.string().optional().allow('', null),
      })).min(1).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error', error_params: { field: error.details[0].path.join('.') } });
    authorizeProjectPayload(req, value);
    const po = await auditedTransaction(
      (q) => svc.createPurchaseOrder(q, { ...value, created_by: req.user.id }),
      (row) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'procurement',
        description: `Created purchase order ${row.order_number}`, entityId: row.id, entityType: 'purchase_order' })
    );
    res.status(201).json({ success: true, data: po });
  } catch (e) { return routeFail(res, e, 'PROCUREMENT', req); }
});

router.post('/po/:id/issue', authenticate, authorize(), async (req, res) => {
  try {
    const result = await auditedProc(req, (q) => svc.issuePurchaseOrder(q, parseInt(req.params.id, 10), req.user),
      (row) => ({ action: 'submit', description: `Started approval for purchase order #${req.params.id}`, entityType: 'purchase_order', entityId: parseInt(req.params.id, 10) }));
    res.json({ success: true, data: result });
  } catch (e) { return routeFail(res, e, 'PROCUREMENT', req); }
});

router.post('/po/:id/decide', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ decision: Joi.string().valid('approve', 'reject').required(), comment: Joi.string().allow('', null) });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error', error_params: { field: error.details[0].path.join('.') } });
    const poId = parseInt(req.params.id, 10);
    const result = await auditedChange(req, { action: 'decide', module: 'procurement', entityType: 'purchase_order' }, { table: 'purchase_orders', id: poId,
      describe: (row) => `Purchase order ${row?.order_number || poId}: ${value.decision}`,
      run: async (q) => {
      const decided = await svc.decideOnDocument(q, 'purchase_order', parseInt(req.params.id, 10), req.user, value.decision, value.comment);
      if (decided.status === 'issued') {
        await commitmentLedger.syncPurchaseOrder(q, poId);
        await fireEvent({
          eventType: 'purchase_order.issued', entityType: 'purchase_order', entityId: parseInt(req.params.id, 10),
          userId: req.user.id, userName: req.user.name, userRole: req.user.role,
          payload: { purchase_order_id: parseInt(req.params.id, 10), status: decided.status },
        }, { query: q });
      }
      return decided;
    } });
    res.json({ success: true, data: result });
  } catch (e) { return routeFail(res, e, 'PROCUREMENT', req); }
});

// ---------------------------------------------------------------------------
// Deliveries → MIR → GRN → returns
// ---------------------------------------------------------------------------

router.post('/deliveries', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      purchase_order_id: Joi.number().integer().required(),
      warehouse_id: Joi.number().integer().required(),
      delivery_date: Joi.date().iso().optional().allow(null),
      lines: Joi.array().items(Joi.object({
        purchase_order_line_id: Joi.number().integer().required(),
        quantity: Joi.number().positive().required(),
        notes: Joi.string().optional().allow('', null),
        // Lot data (5.3): a lot-tracked material always gets a lot (an automatic one when none is named).
        lot_number: Joi.string().max(100).optional().allow('', null),
        batch_number: Joi.string().max(100).optional().allow('', null),
        manufactured_date: Joi.date().iso().optional().allow(null),
        expiry_date: Joi.date().iso().optional().allow(null),
      })).min(1).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error', error_params: { field: error.details[0].path.join('.') } });
    const delivery = await auditedChange(req, { action: 'create', module: 'procurement', entityType: 'delivery' }, {
      table: 'deliveries', run: (q) => svc.createDelivery(q, { ...value, received_by: req.user.id }),
      describe: (row) => `Recorded delivery ${row?.delivery_number || row?.id} against PO #${value.purchase_order_id}`,
    });
    res.status(201).json({ success: true, data: delivery });
  } catch (e) { return routeFail(res, e, 'PROCUREMENT', req); }
});

router.post('/deliveries/:id/mir', authenticate, authorize(), async (req, res) => {
  try {
    const mir = await auditedChange(req, { action: 'create', module: 'procurement', entityType: 'material_inspection_request' }, {
      table: 'material_inspection_requests', run: (q) => svc.createMir(q, { delivery_id: parseInt(req.params.id, 10), created_by: req.user.id }),
      describe: (row) => `Created MIR ${row?.mir_number || row?.id} for delivery #${req.params.id}`,
    });
    res.status(201).json({ success: true, data: mir });
  } catch (e) { return routeFail(res, e, 'PROCUREMENT', req); }
});

router.post('/mir/:id/decide', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      decision: Joi.string().valid('accept', 'reject').required(),
      accepted: Joi.object().pattern(/^\d+$/, Joi.number().min(0)).optional(),
      notes: Joi.string().allow('', null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error', error_params: { field: error.details[0].path.join('.') } });
    const mirId = parseInt(req.params.id, 10);
    const mir = await auditedChange(req, { action: 'decide', module: 'procurement', entityType: 'material_inspection_request' }, { table: 'material_inspection_requests', id: mirId,
      describe: (row) => `MIR ${row?.mir_number || mirId}: ${value.decision}`,
      run: async (q) => {
      const decided = await svc.decideMir(q, parseInt(req.params.id, 10), req.user, value.decision, { accepted: value.accepted, notes: value.notes });
      await fireEvent({
        eventType: value.decision === 'accept' ? 'mir.accepted' : 'mir.rejected',
        entityType: 'material_inspection_request', entityId: parseInt(req.params.id, 10),
        userId: req.user.id, userName: req.user.name, userRole: req.user.role,
        payload: { mir_id: parseInt(req.params.id, 10), status: decided.status },
      }, { query: q });
      return decided;
    } });
    res.json({ success: true, data: mir });
  } catch (e) { return routeFail(res, e, 'PROCUREMENT', req); }
});

router.post('/mir/:id/grn', authenticate, authorize(), async (req, res) => {
  try {
    const grn = await auditedTransaction(async (q) => {
      const created = await svc.createGrn(q, { mir_id: parseInt(req.params.id, 10), created_by: req.user.id, received_by: req.user.id });
      await fireEvent({
        eventType: 'delivery.received', entityType: 'goods_receipt_note', entityId: created.id,
        userId: req.user.id, userName: req.user.name, userRole: req.user.role,
        payload: { grn_id: created.id, grn_number: created.grn_number, mir_id: created.mir_id, purchase_order_id: created.purchase_order_id, warehouse_id: created.warehouse_id },
      }, { query: q });
      return created;
    }, (row) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'procurement',
      description: `Created GRN ${row.grn_number} from MIR #${req.params.id}`, entityId: row.id, entityType: 'goods_receipt_note' }));
    res.status(201).json({ success: true, data: grn });
  } catch (e) { return routeFail(res, e, 'PROCUREMENT', req); }
});

router.post('/grn/:id/returns', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      reason: Joi.string().optional().allow('', null),
      lines: Joi.array().items(Joi.object({
        material_id: Joi.number().integer().required(),
        grn_line_id: Joi.number().integer().optional(),
        lot_id: Joi.number().integer().optional(),
        quantity: Joi.number().positive().required(),
        notes: Joi.string().optional().allow('', null),
      })).min(1).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error', error_params: { field: error.details[0].path.join('.') } });
    const supplierReturn = await auditedProc(req, (q) => svc.createSupplierReturn(q, {
      grn_id: parseInt(req.params.id, 10), ...value, created_by: req.user.id,
    }), (row) => ({ action: 'create', description: `Recorded supplier return ${row.return_number}`, entityId: row.id, entityType: 'supplier_return' }));
    res.status(201).json({ success: true, data: supplierReturn });
  } catch (e) { return typedFail(res, e); }
});

// ---------------------------------------------------------------------------
// Supplier invoices + three-way match
// ---------------------------------------------------------------------------

router.post('/invoices', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      supplier_id: Joi.number().integer().required(),
      purchase_order_id: Joi.number().integer().optional().allow(null),
      invoice_number: Joi.string().required(),
      invoice_date: Joi.date().iso().optional().allow(null),
      total_amount: Joi.number().min(0).required(),
      tax_amount: Joi.number().min(0).default(0),
      vat_recoverable: Joi.boolean().default(true),
      lines: Joi.array().items(Joi.object({
        purchase_order_line_id: Joi.number().integer().optional().allow(null),
        material_id: Joi.number().integer().optional().allow(null),
        quantity: Joi.number().positive().required(),
        unit_price: Joi.number().min(0).default(0),
      })).min(1).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error', error_params: { field: error.details[0].path.join('.') } });
    const result = await auditedChange(req, { action: 'create', module: 'procurement', entityType: 'supplier_invoice' }, {
      table: 'supplier_invoices', run: (q) => svc.recordSupplierInvoice(q, { ...value, created_by: req.user.id }),
      idOf: (d) => d?.invoice?.id,
      describe: (row) => `Recorded supplier invoice ${row?.invoice_number || value.invoice_number}`,
      amountOf: (row) => (row?.total_amount == null ? undefined : Number(row.total_amount)),
    });
    res.status(201).json({ success: true, data: result });
  } catch (e) {
    // Phase 3.2: the unique constraint (supplier_id, invoice_number) is the database backstop; whether the
    // service check or the constraint wins the race, the client sees the same 409 with a stable code.
    if (e.status === 409 || e.code === '23505') {
      return res.status(409).json({
        success: false, error: e.code === '23505' ? 'Duplicate invoice: this supplier already submitted this invoice number' : e.message,
        error_code: 'supplier_invoice_duplicate', error_params: { supplier_id: req.body.supplier_id, invoice_number: req.body.invoice_number },
      });
    }
    return routeFail(res, e, 'PROCUREMENT', req);
  }
});

// Phase 3.1 — approval is the accrual point for services. An unmapped ledger account fails the whole
// approval (nothing saved) with the key named in the error and in error_params (L7 error contract).
router.post('/invoices/:id/approve', authenticate, authorize(), async (req, res) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    const result = await auditedChange(req, { action: 'approve', module: 'procurement', entityType: 'supplier_invoice' }, {
      table: 'supplier_invoices', id: invoiceId, run: (q) => svc.approveSupplierInvoice(q, invoiceId, req.user),
      describe: (row) => `Approved supplier invoice ${row?.invoice_number || invoiceId}`,
      amountOf: (row) => (row?.total_amount == null ? undefined : Number(row.total_amount)),
    });
    res.json({ success: true, data: result });
  } catch (e) {
    if (e.status === 404) return routeFail(res, e, 'PROCUREMENT', req);
    if (e.status === 409) return res.status(409).json({ success: false, error: e.message, error_code: 'supplier_invoice_not_approvable', error_params: {} });
    if (e.key) return res.status(500).json({ success: false, error: e.message, error_code: 'ledger_account_not_mapped', error_params: { key: e.key } });
    return routeFail(res, e, 'PROCUREMENT', req);
  }
});

// ---------------------------------------------------------------------------
// Branded, numbered PDF documents
// ---------------------------------------------------------------------------

router.get('/documents/pr/:id', authenticate, authorize(), async (req, res) => {
  try {
    const pr = (await query('SELECT * FROM purchase_requests WHERE id = $1', [req.params.id])).rows[0];
    if (!pr) return res.status(404).json({ success: false, error: 'Purchase requisition not found', error_code: 'purchase_request_not_found', error_params: {} });
    const lines = (await query('SELECT * FROM purchase_request_lines WHERE purchase_request_id = $1', [pr.id])).rows;
    const buffer = await pdf.renderPurchaseRequestDocument(pr, lines);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${pr.request_number}.pdf"`);
    res.send(buffer);
  } catch (e) { return routeFail(res, e, 'PROCUREMENT', req); }
});

router.get('/documents/po/:id', authenticate, authorize(), async (req, res) => {
  try {
    const po = (await query('SELECT * FROM purchase_orders WHERE id = $1', [req.params.id])).rows[0];
    if (!po) return res.status(404).json({ success: false, error: 'Purchase order not found', error_code: 'purchase_order_not_found', error_params: {} });
    const poLines = (await query('SELECT * FROM purchase_order_lines WHERE purchase_order_id = $1', [po.id])).rows;
    const buffer = await pdf.renderPurchaseOrderDocument(po, poLines);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${po.order_number}.pdf"`);
    res.send(buffer);
  } catch (e) { return routeFail(res, e, 'PROCUREMENT', req); }
});

router.get('/documents/grn/:id', authenticate, authorize(), async (req, res) => {
  try {
    const grn = (await query('SELECT * FROM goods_receipt_notes WHERE id = $1', [req.params.id])).rows[0];
    if (!grn) return res.status(404).json({ success: false, error: 'GRN not found', error_code: 'grn_not_found', error_params: {} });
    const grnLines = (await query('SELECT * FROM grn_lines WHERE grn_id = $1', [grn.id])).rows;
    const buffer = await pdf.renderGrnDocument(grn, grnLines);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${grn.grn_number}.pdf"`);
    res.send(buffer);
  } catch (e) { return routeFail(res, e, 'PROCUREMENT', req); }
});

// Remaining template-catalog documents use the same branded PDF renderer.
// Commercial/technical comparisons stay on the internal procurement surface.
router.get('/documents/:kind/:id', authenticate, authorize('owner', 'admin', 'purchasing_mgr', 'project_manager'), async (req, res) => {
  try {
    const kind = req.params.kind;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, error: 'Invalid document ID', error_code: 'invalid_document_id', error_params: {} });
    const one = async (table) => (await query(`SELECT * FROM ${table} WHERE id = $1`, [id])).rows[0];
    const lines = async (table, field) => (await query(`SELECT * FROM ${table} WHERE ${field} = $1`, [id])).rows;
    let buffer; let number;
    if (kind === 'rfq') {
      const rfq = await one('rfqs');
      if (!rfq) return res.status(404).json({ success: false, error: 'RFQ not found', error_code: 'rfq_not_found', error_params: {} });
      const vendors = await lines('rfq_vendors', 'rfq_id');
      buffer = await pdf.renderRfqDocument(rfq, await lines('rfq_lines', 'rfq_id'), vendors.length);
      number = rfq.rfq_number;
    } else if (kind === 'quotation-cover') {
      const quotation = await one('supplier_quotations');
      if (!quotation) return res.status(404).json({ success: false, error: 'Quotation not found', error_code: 'quotation_not_found', error_params: {} });
      const supplier = (await query('SELECT * FROM suppliers WHERE id = $1', [quotation.supplier_id])).rows[0];
      buffer = await pdf.renderQuotationCoverDocument(quotation, supplier?.name_en || supplier?.name_ar || supplier?.code, await lines('supplier_quotation_lines', 'quotation_id'));
      number = quotation.quotation_number;
    } else if (['technical-evaluation', 'commercial-comparison', 'award-recommendation'].includes(kind)) {
      const rfq = await one('rfqs');
      if (!rfq) return res.status(404).json({ success: false, error: 'RFQ not found', error_code: 'rfq_not_found', error_params: {} });
      const comparison = await svc.buildBidComparison(query, id, { persist: false });
      if (kind === 'technical-evaluation') buffer = await pdf.renderTechnicalEvaluationDocument(rfq, comparison.rows);
      if (kind === 'commercial-comparison') buffer = await pdf.renderCommercialComparisonDocument(comparison);
      if (kind === 'award-recommendation') {
        if (!comparison.recommendation) return res.status(400).json({ success: false, error: 'No compliant quotation to recommend', error_code: 'no_compliant_quotation', error_params: {} });
        buffer = await pdf.renderAwardRecommendationDocument(rfq, { ...comparison.recommendation, rows: comparison.rows });
      }
      number = rfq.rfq_number;
    } else if (kind === 'delivery') {
      const delivery = await one('deliveries');
      if (!delivery) return res.status(404).json({ success: false, error: 'Delivery not found', error_code: 'delivery_not_found', error_params: {} });
      const po = (await query('SELECT order_number FROM purchase_orders WHERE id = $1', [delivery.purchase_order_id])).rows[0];
      buffer = await pdf.renderDeliveryReceiptDocument(delivery, await lines('delivery_lines', 'delivery_id'), po?.order_number);
      number = delivery.delivery_number;
    } else if (kind === 'mir') {
      const mir = await one('material_inspection_requests');
      if (!mir) return res.status(404).json({ success: false, error: 'MIR not found', error_code: 'mir_not_found', error_params: {} });
      const delivery = (await query('SELECT delivery_number FROM deliveries WHERE id = $1', [mir.delivery_id])).rows[0];
      buffer = await pdf.renderMirDocument(mir, await lines('mir_lines', 'mir_id'), delivery?.delivery_number);
      number = mir.mir_number;
    } else if (kind === 'return') {
      const supplierReturn = await one('supplier_returns');
      if (!supplierReturn) return res.status(404).json({ success: false, error: 'Supplier return not found', error_code: 'supplier_return_not_found', error_params: {} });
      buffer = await pdf.renderSupplierReturnDocument(supplierReturn, await lines('supplier_return_lines', 'supplier_return_id'));
      number = supplierReturn.return_number;
    } else return res.status(404).json({ success: false, error: 'Unknown document type', error_code: 'unknown_document_type', error_params: {} });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${String(number || id).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf"`);
    res.send(buffer);
  } catch (e) { return routeFail(res, e, 'PROCUREMENT', req); }
});

module.exports = router;
