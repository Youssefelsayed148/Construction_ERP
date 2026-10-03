const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity, fireEvent } = require('../utils/activity');
const svc = require('../services/procurementService');
const pdf = require('../utils/procurementPdf');
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
    const [purchaseRequests, rfqs, purchaseOrders, deliveries, mirs, grns] = await Promise.all([
      query('SELECT * FROM purchase_requests WHERE project_id = $1 ORDER BY created_at DESC, id DESC LIMIT 200', [projectId]),
      query('SELECT * FROM rfqs WHERE project_id = $1 ORDER BY created_at DESC, id DESC LIMIT 200', [projectId]),
      query('SELECT * FROM purchase_orders WHERE project_id = $1 ORDER BY created_at DESC, id DESC LIMIT 200', [projectId]),
      query('SELECT * FROM deliveries WHERE project_id = $1 ORDER BY created_at DESC, id DESC LIMIT 200', [projectId]),
      query('SELECT * FROM material_inspection_requests WHERE project_id = $1 ORDER BY created_at DESC, id DESC LIMIT 200', [projectId]),
      query('SELECT * FROM goods_receipt_notes WHERE project_id = $1 ORDER BY created_at DESC, id DESC LIMIT 200', [projectId]),
    ]);
    res.json({ success: true, data: {
      purchase_requests: purchaseRequests.rows,
      rfqs: rfqs.rows,
      purchase_orders: purchaseOrders.rows,
      deliveries: deliveries.rows,
      material_inspection_requests: mirs.rows,
      goods_receipt_notes: grns.rows,
    } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
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
      priority: Joi.string().valid('low', 'normal', 'high', 'urgent').default('normal'),
      needed_by: Joi.date().iso().optional().allow(null),
      lines: Joi.array().items(prLineSchema).min(1).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const pr = await atomic((q) => svc.createPurchaseRequest(q, { ...value, created_by: req.user.id }));
    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'create', module: 'procurement',
      description: `Created purchase requisition ${pr.request_number}`,
      entityId: pr.id, entityType: 'purchase_request',
    });
    res.status(201).json({ success: true, data: pr });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/pr/:id/submit', authenticate, authorize(), async (req, res) => {
  try {
    const result = await atomic((q) => svc.submitPurchaseRequest(q, parseInt(req.params.id, 10), req.user));
    res.json({ success: true, data: result });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/pr/:id/decide', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ decision: Joi.string().valid('approve', 'reject').required(), comment: Joi.string().allow('', null) });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const result = await atomic((q) => svc.decideOnDocument(q, 'purchase_request', parseInt(req.params.id, 10), req.user, value.decision, value.comment));
    res.json({ success: true, data: result });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
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
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const rfq = await atomic((q) => svc.createRfq(q, { ...value, created_by: req.user.id }));
    res.status(201).json({ success: true, data: rfq });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/rfq/:id/vendors', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ supplier_ids: Joi.array().items(Joi.number().integer()).min(1).required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const vendors = await atomic((q) => svc.inviteVendors(q, parseInt(req.params.id, 10), value.supplier_ids));
    res.status(201).json({ success: true, data: vendors });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
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
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const quotation = await atomic((q) => svc.submitQuotation(q, { ...value, rfq_id: parseInt(req.params.id, 10), created_by: req.user.id }));
    res.status(201).json({ success: true, data: quotation });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Full commercial comparison — internal eyes only.
router.get('/rfq/:id/comparison', authenticate, authorize('owner', 'admin', 'purchasing_mgr', 'project_manager'), async (req, res) => {
  try {
    const comparison = await svc.buildBidComparison(query, parseInt(req.params.id, 10), { persist: false });
    res.json({ success: true, data: comparison });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Vendor-scoped view — a vendor sees only its own quotation.
router.get('/rfq/:id/quotations/vendor/:supplierId', authenticate, authorize(), async (req, res) => {
  try {
    const rfqId = parseInt(req.params.id, 10);
    const supplierId = parseInt(req.params.supplierId, 10);
    if (req.user.role === 'supplier') {
      const scope = await require('../services/portalEngine').supplierScope(query, req.user.id);
      if (!scope.supplierIds.includes(supplierId)) {
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }
      const rfq = (await query('SELECT project_id FROM rfqs WHERE id = $1', [rfqId])).rows[0];
      if (!rfq || !scope.assignments.some((a) => a.supplier_id === supplierId && a.project_id === Number(rfq.project_id))) {
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }
    }
    const mine = await svc.quotationsForVendor(query, rfqId, supplierId);
    const lines = [];
    for (const quotation of mine) {
      lines.push(...(await query('SELECT * FROM supplier_quotation_lines WHERE quotation_id = $1', [quotation.id])).rows);
    }
    res.json({ success: true, data: { quotations: mine, lines } });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/rfq/:id/award', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ quotation_id: Joi.number().integer().required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const quotation = await atomic((q) => svc.awardRfq(q, parseInt(req.params.id, 10), value.quotation_id, req.user));
    res.json({ success: true, data: quotation });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// ---------------------------------------------------------------------------
// Purchase orders
// ---------------------------------------------------------------------------

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
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const po = await atomic((q) => svc.createPurchaseOrder(q, { ...value, created_by: req.user.id }));
    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'create', module: 'procurement',
      description: `Created purchase order ${po.order_number}`,
      entityId: po.id, entityType: 'purchase_order',
    });
    res.status(201).json({ success: true, data: po });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/po/:id/issue', authenticate, authorize(), async (req, res) => {
  try {
    const result = await atomic((q) => svc.issuePurchaseOrder(q, parseInt(req.params.id, 10), req.user));
    res.json({ success: true, data: result });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/po/:id/decide', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ decision: Joi.string().valid('approve', 'reject').required(), comment: Joi.string().allow('', null) });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const result = await atomic((q) => svc.decideOnDocument(q, 'purchase_order', parseInt(req.params.id, 10), req.user, value.decision, value.comment));
    if (result.status === 'issued') {
      await fireEvent({
        eventType: 'purchase_order.issued', entityType: 'purchase_order', entityId: parseInt(req.params.id, 10),
        userId: req.user.id, userName: req.user.name, userRole: req.user.role,
        payload: { purchase_order_id: parseInt(req.params.id, 10), status: result.status },
      });
    }
    res.json({ success: true, data: result });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
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
      })).min(1).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const delivery = await transaction((client) => svc.createDelivery(
      client.query.bind(client), { ...value, received_by: req.user.id }
    ));
    res.status(201).json({ success: true, data: delivery });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/deliveries/:id/mir', authenticate, authorize(), async (req, res) => {
  try {
    const mir = await atomic((q) => svc.createMir(q, { delivery_id: parseInt(req.params.id, 10), created_by: req.user.id }));
    res.status(201).json({ success: true, data: mir });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/mir/:id/decide', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      decision: Joi.string().valid('accept', 'reject').required(),
      accepted: Joi.object().pattern(/^\d+$/, Joi.number().min(0)).optional(),
      notes: Joi.string().allow('', null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const mir = await transaction((client) => svc.decideMir(
      client.query.bind(client), parseInt(req.params.id, 10), req.user, value.decision,
      { accepted: value.accepted, notes: value.notes }
    ));
    await fireEvent({
      eventType: value.decision === 'accept' ? 'mir.accepted' : 'mir.rejected',
      entityType: 'material_inspection_request', entityId: parseInt(req.params.id, 10),
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      payload: { mir_id: parseInt(req.params.id, 10), status: mir.status },
    });
    res.json({ success: true, data: mir });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/mir/:id/grn', authenticate, authorize(), async (req, res) => {
  try {
    const grn = await atomic((q) => svc.createGrn(q, { mir_id: parseInt(req.params.id, 10), created_by: req.user.id, received_by: req.user.id }));
    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'create', module: 'procurement',
      description: `Created GRN ${grn.grn_number} from MIR #${req.params.id}`,
      entityId: grn.id, entityType: 'goods_receipt_note',
    });
    await fireEvent({
      eventType: 'delivery.received', entityType: 'goods_receipt_note', entityId: grn.id,
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      payload: { grn_id: grn.id, grn_number: grn.grn_number, mir_id: grn.mir_id, purchase_order_id: grn.purchase_order_id, warehouse_id: grn.warehouse_id },
    });
    res.status(201).json({ success: true, data: grn });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/grn/:id/returns', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      reason: Joi.string().optional().allow('', null),
      lines: Joi.array().items(Joi.object({
        material_id: Joi.number().integer().required(),
        quantity: Joi.number().positive().required(),
        notes: Joi.string().optional().allow('', null),
      })).min(1).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const supplierReturn = await atomic((q) => svc.createSupplierReturn(q, {
      grn_id: parseInt(req.params.id, 10), ...value, created_by: req.user.id,
    }));
    res.status(201).json({ success: true, data: supplierReturn });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
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
      lines: Joi.array().items(Joi.object({
        purchase_order_line_id: Joi.number().integer().optional().allow(null),
        material_id: Joi.number().integer().optional().allow(null),
        quantity: Joi.number().positive().required(),
        unit_price: Joi.number().min(0).default(0),
      })).min(1).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const result = await atomic((q) => svc.recordSupplierInvoice(q, { ...value, created_by: req.user.id }));
    res.status(201).json({ success: true, data: result });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Phase 3.1 — approval is the accrual point for services. An unmapped ledger account fails the whole
// approval (nothing saved) with the key named in the error and in error_params (L7 error contract).
router.post('/invoices/:id/approve', authenticate, authorize(), async (req, res) => {
  try {
    const result = await atomic((q) => svc.approveSupplierInvoice(q, parseInt(req.params.id, 10), req.user));
    res.json({ success: true, data: result });
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ success: false, error: e.message });
    if (e.status === 409) return res.status(409).json({ success: false, error: e.message, error_code: 'supplier_invoice_not_approvable', error_params: {} });
    if (e.key) return res.status(500).json({ success: false, error: e.message, error_code: 'ledger_account_not_mapped', error_params: { key: e.key } });
    res.status(400).json({ success: false, error: e.message });
  }
});

// ---------------------------------------------------------------------------
// Branded, numbered PDF documents
// ---------------------------------------------------------------------------

router.get('/documents/pr/:id', authenticate, authorize(), async (req, res) => {
  try {
    const pr = (await query('SELECT * FROM purchase_requests WHERE id = $1', [req.params.id])).rows[0];
    if (!pr) return res.status(404).json({ success: false, error: 'Purchase requisition not found' });
    const lines = (await query('SELECT * FROM purchase_request_lines WHERE purchase_request_id = $1', [pr.id])).rows;
    const buffer = await pdf.renderPurchaseRequestDocument(pr, lines);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${pr.request_number}.pdf"`);
    res.send(buffer);
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/documents/po/:id', authenticate, authorize(), async (req, res) => {
  try {
    const po = (await query('SELECT * FROM purchase_orders WHERE id = $1', [req.params.id])).rows[0];
    if (!po) return res.status(404).json({ success: false, error: 'Purchase order not found' });
    const poLines = (await query('SELECT * FROM purchase_order_lines WHERE purchase_order_id = $1', [po.id])).rows;
    const buffer = await pdf.renderPurchaseOrderDocument(po, poLines);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${po.order_number}.pdf"`);
    res.send(buffer);
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/documents/grn/:id', authenticate, authorize(), async (req, res) => {
  try {
    const grn = (await query('SELECT * FROM goods_receipt_notes WHERE id = $1', [req.params.id])).rows[0];
    if (!grn) return res.status(404).json({ success: false, error: 'GRN not found' });
    const grnLines = (await query('SELECT * FROM grn_lines WHERE grn_id = $1', [grn.id])).rows;
    const buffer = await pdf.renderGrnDocument(grn, grnLines);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${grn.grn_number}.pdf"`);
    res.send(buffer);
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Remaining template-catalog documents use the same branded PDF renderer.
// Commercial/technical comparisons stay on the internal procurement surface.
router.get('/documents/:kind/:id', authenticate, authorize('owner', 'admin', 'purchasing_mgr', 'project_manager'), async (req, res) => {
  try {
    const kind = req.params.kind;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, error: 'Invalid document ID' });
    const one = async (table) => (await query(`SELECT * FROM ${table} WHERE id = $1`, [id])).rows[0];
    const lines = async (table, field) => (await query(`SELECT * FROM ${table} WHERE ${field} = $1`, [id])).rows;
    let buffer; let number;
    if (kind === 'rfq') {
      const rfq = await one('rfqs');
      if (!rfq) return res.status(404).json({ success: false, error: 'RFQ not found' });
      const vendors = await lines('rfq_vendors', 'rfq_id');
      buffer = await pdf.renderRfqDocument(rfq, await lines('rfq_lines', 'rfq_id'), vendors.length);
      number = rfq.rfq_number;
    } else if (kind === 'quotation-cover') {
      const quotation = await one('supplier_quotations');
      if (!quotation) return res.status(404).json({ success: false, error: 'Quotation not found' });
      const supplier = (await query('SELECT * FROM suppliers WHERE id = $1', [quotation.supplier_id])).rows[0];
      buffer = await pdf.renderQuotationCoverDocument(quotation, supplier?.name_en || supplier?.name_ar || supplier?.code, await lines('supplier_quotation_lines', 'quotation_id'));
      number = quotation.quotation_number;
    } else if (['technical-evaluation', 'commercial-comparison', 'award-recommendation'].includes(kind)) {
      const rfq = await one('rfqs');
      if (!rfq) return res.status(404).json({ success: false, error: 'RFQ not found' });
      const comparison = await svc.buildBidComparison(query, id, { persist: false });
      if (kind === 'technical-evaluation') buffer = await pdf.renderTechnicalEvaluationDocument(rfq, comparison.rows);
      if (kind === 'commercial-comparison') buffer = await pdf.renderCommercialComparisonDocument(comparison);
      if (kind === 'award-recommendation') {
        if (!comparison.recommendation) return res.status(400).json({ success: false, error: 'No compliant quotation to recommend' });
        buffer = await pdf.renderAwardRecommendationDocument(rfq, { ...comparison.recommendation, rows: comparison.rows });
      }
      number = rfq.rfq_number;
    } else if (kind === 'delivery') {
      const delivery = await one('deliveries');
      if (!delivery) return res.status(404).json({ success: false, error: 'Delivery not found' });
      const po = (await query('SELECT order_number FROM purchase_orders WHERE id = $1', [delivery.purchase_order_id])).rows[0];
      buffer = await pdf.renderDeliveryReceiptDocument(delivery, await lines('delivery_lines', 'delivery_id'), po?.order_number);
      number = delivery.delivery_number;
    } else if (kind === 'mir') {
      const mir = await one('material_inspection_requests');
      if (!mir) return res.status(404).json({ success: false, error: 'MIR not found' });
      const delivery = (await query('SELECT delivery_number FROM deliveries WHERE id = $1', [mir.delivery_id])).rows[0];
      buffer = await pdf.renderMirDocument(mir, await lines('mir_lines', 'mir_id'), delivery?.delivery_number);
      number = mir.mir_number;
    } else if (kind === 'return') {
      const supplierReturn = await one('supplier_returns');
      if (!supplierReturn) return res.status(404).json({ success: false, error: 'Supplier return not found' });
      buffer = await pdf.renderSupplierReturnDocument(supplierReturn, await lines('supplier_return_lines', 'supplier_return_id'));
      number = supplierReturn.return_number;
    } else return res.status(404).json({ success: false, error: 'Unknown document type' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${String(number || id).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf"`);
    res.send(buffer);
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
