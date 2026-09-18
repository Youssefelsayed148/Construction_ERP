const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const svc = require('../services/procurementService');
const pdf = require('../utils/procurementPdf');

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

    const pr = await svc.createPurchaseRequest(query, { ...value, created_by: req.user.id });
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
    const result = await svc.submitPurchaseRequest(query, parseInt(req.params.id, 10), req.user);
    res.json({ success: true, data: result });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/pr/:id/decide', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ decision: Joi.string().valid('approve', 'reject').required(), comment: Joi.string().allow('', null) });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const result = await svc.decideOnPurchaseRequest(query, 'purchase_request', parseInt(req.params.id, 10), req.user, value.decision, value.comment);
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
    const rfq = await svc.createRfq(query, { ...value, created_by: req.user.id });
    res.status(201).json({ success: true, data: rfq });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/rfq/:id/vendors', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ supplier_ids: Joi.array().items(Joi.number().integer()).min(1).required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const vendors = await svc.inviteVendors(query, parseInt(req.params.id, 10), value.supplier_ids);
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
    const quotation = await svc.submitQuotation(query, { ...value, rfq_id: parseInt(req.params.id, 10), created_by: req.user.id });
    res.status(201).json({ success: true, data: quotation });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Full commercial comparison — internal eyes only.
router.get('/rfq/:id/comparison', authenticate, authorize(), async (req, res) => {
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
    const quotation = await svc.awardRfq(query, parseInt(req.params.id, 10), value.quotation_id, req.user);
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
    const po = await svc.createPurchaseOrder(query, { ...value, created_by: req.user.id });
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
    const result = await svc.issuePurchaseOrder(query, parseInt(req.params.id, 10), req.user);
    res.json({ success: true, data: result });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/po/:id/decide', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ decision: Joi.string().valid('approve', 'reject').required(), comment: Joi.string().allow('', null) });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const result = await svc.decideOnPurchaseRequest(query, 'purchase_order', parseInt(req.params.id, 10), req.user, value.decision, value.comment);
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
    const delivery = await svc.createDelivery(query, { ...value, received_by: req.user.id });
    res.status(201).json({ success: true, data: delivery });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/deliveries/:id/mir', authenticate, authorize(), async (req, res) => {
  try {
    const mir = await svc.createMir(query, { delivery_id: parseInt(req.params.id, 10), created_by: req.user.id });
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
    const mir = await svc.decideMir(query, parseInt(req.params.id, 10), req.user, value.decision, {
      accepted: value.accepted, notes: value.notes,
    });
    res.json({ success: true, data: mir });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/mir/:id/grn', authenticate, authorize(), async (req, res) => {
  try {
    const grn = await svc.createGrn(query, { mir_id: parseInt(req.params.id, 10), created_by: req.user.id, received_by: req.user.id });
    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'create', module: 'procurement',
      description: `Created GRN ${grn.grn_number} from MIR #${req.params.id}`,
      entityId: grn.id, entityType: 'goods_receipt_note',
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
    const supplierReturn = await svc.createSupplierReturn(query, {
      grn_id: parseInt(req.params.id, 10), ...value, created_by: req.user.id,
    });
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
    const result = await svc.recordSupplierInvoice(query, { ...value, created_by: req.user.id });
    res.status(201).json({ success: true, data: result });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
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

module.exports = router;
