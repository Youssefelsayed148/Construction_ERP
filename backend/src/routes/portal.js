const express = require('express');
const { nextNumber } = require('../services/numbering');
const router = express.Router();
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const engine = require('../services/portalEngine');
const procurement = require('../services/procurementService');

function supplierAssignment(scope, supplierId, projectId) {
  return scope.assignments?.find((a) => Number(a.supplier_id) === Number(supplierId)
    && Number(a.project_id) === Number(projectId));
}

function rfqSupplier(access, requestedId) {
  const ids = access.supplierIds;
  const id = requestedId == null ? (ids.length === 1 ? ids[0] : null) : Number(requestedId);
  if (!id || !ids.includes(id)) throw new Error('Select an invited supplier organization for this RFQ');
  return supplierAssignment(access.scope, id, access.rfq.project_id);
}

// Mounted at /api/portal — subcontractor and supplier portal surface.
// Both scopes resolve their organization through organizations (Phase 3);
// isolation is enforced in the engine and cross-tenant reads → 404.

// ============ SUBCONTRACTOR ============

router.get('/subcontractor/dashboard', authenticate, authorize(), async (req, res) => {
  try {
    const data = await engine.subcontractorDashboard(query, req.user.id);
    if (data.note && data.packages === undefined && data.project_ids.length === 0) {
      return res.status(200).json({ success: true, data }); // zero-scope → setup actions, not an error
    }
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Package detail — isolation: another subcontractor's package → 404.
router.get('/subcontractor/contracts/:id', authenticate, authorize(), async (req, res) => {
  try {
    const contract = await engine.subContractForOrg(query, parseInt(req.params.id, 10), req.user.id);
    if (!contract) return res.status(404).json({ success: false, error: 'Package not found' });
    res.json({ success: true, data: contract });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/subcontractor/contracts/:id/acknowledge', authenticate, authorize(), async (req, res) => {
  try {
    const contract = await engine.subContractForOrg(query, parseInt(req.params.id, 10), req.user.id);
    if (!contract) return res.status(404).json({ success: false, error: 'Package not found' });
    const row = (await query('UPDATE sub_contracts SET acknowledged_at = NOW() WHERE id = $1 RETURNING *', [contract.id])).rows[0];
    res.json({ success: true, data: row });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/subcontractor/instructions/:id/acknowledge', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      response: Joi.string().allow('', null),
    });
    const { error, value } = schema.validate(req.body || {});
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const instruction = await engine.acknowledgeInstruction(query, req.user.id, {
      project_id: value.project_id, instruction_id: parseInt(req.params.id, 10), response: value.response,
    });
    if (!instruction) return res.status(404).json({ success: false, error: 'Instruction not found' });
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'portal', description: `Acknowledged instruction #${req.params.id} (portal)`, entityId: instruction.id, entityType: 'engineer_instruction' });
    res.json({ success: true, data: instruction });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

// Submit progress quantities (work verification claim).
router.post('/subcontractor/quantities', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      sub_contract_id: Joi.number().integer().required(),
      boq_item_id: Joi.number().integer().required(),
      period_from: Joi.date().iso().required(),
      period_to: Joi.date().iso().required(),
      quantity_claimed: Joi.number().min(0).required(),
      notes: Joi.string().allow(''),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    // Isolation: the claimed contract must be one of the caller's packages.
    const contract = await engine.subContractForOrg(query, value.sub_contract_id, req.user.id);
    if (!contract) return res.status(404).json({ success: false, error: 'Package not found' });
    const boq = (await query('SELECT project_id FROM boq_items WHERE id = $1', [value.boq_item_id])).rows[0];
    if (!boq || Number(boq.project_id) !== Number(contract.project_id)) {
      return res.status(400).json({ success: false, error: 'BOQ item is outside this package project' });
    }
    const r = await query(
      `INSERT INTO sub_work_verifications (sub_contract_id, boq_item_id, period_from, period_to, quantity_claimed, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [value.sub_contract_id, value.boq_item_id, value.period_from, value.period_to, value.quantity_claimed, value.notes]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

// Submit a payment application through the shared Phase 13 certificate table.
router.post('/subcontractor/payment-applications', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      sub_contract_id: Joi.number().integer().required(),
      period_from: Joi.date().iso().required(),
      period_to: Joi.date().iso().required(),
      work_value: Joi.number().min(0).required(),
      retention: Joi.number().min(0).default(0),
      materials_deducted: Joi.number().min(0).default(0),
      other_deductions: Joi.number().min(0).default(0),
      notes: Joi.string().allow('', null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const certificate = await transaction(async (client) => {
      await client.query('SELECT id FROM sub_contracts WHERE id = $1 FOR UPDATE', [value.sub_contract_id]);
      return engine.submitPaymentApplication(client.query.bind(client), req.user.id, value);
    });
    if (!certificate) return res.status(404).json({ success: false, error: 'Package not found' });
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'portal', description: `Payment application ${certificate.certificate_number} submitted`, entityId: certificate.id, entityType: 'payment_certificate' });
    res.status(201).json({ success: true, data: certificate });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/subcontractor/rfis', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(), sub_contract_id: Joi.number().integer().required(), subject: Joi.string().required(),
      question: Joi.string().allow('').required(), category: Joi.string().allow('', null),
      priority: Joi.string().valid('low', 'normal', 'high', 'urgent').default('normal'),
      due_date: Joi.date().iso().allow(null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const contract = await engine.subContractForOrg(query, value.sub_contract_id, req.user.id);
    if (!contract || Number(contract.project_id) !== value.project_id) return res.status(404).json({ success: false, error: 'Package not found' });
    const row = await transaction(async (client) => {
      const number = await nextNumber((t, p) => client.query(t, p), { table: 'project_rfis', column: 'rfi_number', prefix: `RFI-${value.project_id}`, pad: 3 });
      return (await client.query(
        `INSERT INTO project_rfis (rfi_number, project_id, sub_contract_id, subject, question, category, priority, due_date, raised_by, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'submitted') RETURNING *`,
        [number, value.project_id, value.sub_contract_id, value.subject, value.question, value.category, value.priority, value.due_date, req.user.id]
      )).rows[0];
    });
    res.status(201).json({ success: true, data: row });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/subcontractor/submittals', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(), sub_contract_id: Joi.number().integer().required(), title: Joi.string().required(),
      submittal_type: Joi.string().valid('material', 'shop_drawing', 'sample', 'method').default('material'),
      submitted_to: Joi.string().allow('', null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const contract = await engine.subContractForOrg(query, value.sub_contract_id, req.user.id);
    if (!contract || Number(contract.project_id) !== value.project_id) return res.status(404).json({ success: false, error: 'Package not found' });
    const row = await transaction(async (client) => {
      const number = await nextNumber((t, p) => client.query(t, p), { table: 'project_submittals', column: 'submittal_number', prefix: `SUB-${value.project_id}`, pad: 3 });
      return (await client.query(
        `INSERT INTO project_submittals (submittal_number, project_id, sub_contract_id, title, submittal_type, submitted_to, submitted_by, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'submitted') RETURNING *`,
        [number, value.project_id, value.sub_contract_id, value.title, value.submittal_type, value.submitted_to, req.user.id]
      )).rows[0];
    });
    res.status(201).json({ success: true, data: row });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/subcontractor/rfis/:id/acknowledge', authenticate, authorize(), async (req, res) => {
  try {
    const rfiId = parseInt(req.params.id, 10);
    const rfi = (await query('SELECT * FROM project_rfis WHERE id = $1', [rfiId])).rows[0];
    if (!rfi || !rfi.sub_contract_id || !await engine.subContractForOrg(query, rfi.sub_contract_id, req.user.id)) {
      return res.status(404).json({ success: false, error: 'RFI not found' });
    }
    const { error, value } = Joi.object({ body: Joi.string().allow('', null).default('Acknowledged') }).validate(req.body || {});
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const row = await transaction(async (client) => {
      await client.query('SELECT id FROM project_rfis WHERE id = $1 FOR UPDATE', [rfiId]);
      return require('../services/consultantEngine').recordRfiResponse(client.query.bind(client), {
        rfi_id: rfiId, stage: 'acknowledgement', revision: Number(rfi.revision || 1),
        user: req.user, body: value.body || 'Acknowledged',
      });
    });
    res.status(201).json({ success: true, data: row });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/subcontractor/submittals/:id/resubmit', authenticate, authorize(), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const submittal = (await query('SELECT * FROM project_submittals WHERE id = $1', [id])).rows[0];
    if (!submittal || !submittal.sub_contract_id || !await engine.subContractForOrg(query, submittal.sub_contract_id, req.user.id)) {
      return res.status(404).json({ success: false, error: 'Submittal not found' });
    }
    const { error, value } = Joi.object({ comments: Joi.string().allow('', null), attachments: Joi.array().default([]) }).validate(req.body || {});
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const row = await transaction(async (client) => {
      await client.query('SELECT id FROM project_submittals WHERE id = $1 FOR UPDATE', [id]);
      return require('../services/consultantEngine').resubmitSubmittal(client.query.bind(client), id, req.user, value);
    });
    res.status(201).json({ success: true, data: row });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

// Scoped submissions that require internal review before they affect the formal
// WIR/MIR, QHSE, labour, equipment or commercial registers.
router.post('/subcontractor/submissions/:kind', authenticate, authorize(), async (req, res) => {
  try {
    const kinds = ['wir_request', 'mir_request', 'manpower', 'equipment', 'ncr_response', 'observation_response', 'variation_quote'];
    if (!kinds.includes(req.params.kind)) return res.status(400).json({ success: false, error: 'Unsupported submission type' });
    const schema = Joi.object({
      project_id: Joi.number().integer().required(), related_entity_type: Joi.string().allow(null, ''),
      related_entity_id: Joi.number().integer().allow(null), payload: Joi.object().required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const scope = await engine.assertSubcontractorProject(query, req.user.id, value.project_id);
    const row = await engine.createPortalSubmission(query, req.user.id, {
      ...value, submission_type: req.params.kind,
      organization_id: scope.packages.find((p) => Number(p.project_id) === value.project_id).organization_id,
    });
    res.status(201).json({ success: true, data: row });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

// ============ SUPPLIER ============

router.get('/supplier/dashboard', authenticate, authorize(), async (req, res) => {
  try {
    const data = await engine.supplierDashboard(query, req.user.id);
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/supplier/rfqs/:id', authenticate, authorize(), async (req, res) => {
  try {
    const access = await engine.supplierRfq(query, req.user.id, parseInt(req.params.id, 10));
    if (!access) return res.status(404).json({ success: false, error: 'RFQ not found' });
    const lines = (await query('SELECT * FROM rfq_lines WHERE rfq_id = $1', [access.rfq.id])).rows;
    res.json({ success: true, data: {
      id: access.rfq.id, rfq_number: access.rfq.rfq_number, project_id: access.rfq.project_id,
      title: access.rfq.title, due_date: access.rfq.due_date, status: access.rfq.status,
      supplier_ids: access.supplierIds,
      lines: lines.map((l) => ({ id: l.id, material_id: l.material_id, description: l.description, quantity: l.quantity, unit: l.unit })),
    } });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.get('/supplier/purchase-orders/:id', authenticate, authorize(), async (req, res) => {
  try {
    const po = await engine.supplierPurchaseOrder(query, req.user.id, parseInt(req.params.id, 10));
    if (!po) return res.status(404).json({ success: false, error: 'Purchase order not found' });
    const lines = (await query('SELECT * FROM purchase_order_lines WHERE purchase_order_id = $1', [po.id])).rows;
    res.json({ success: true, data: {
      id: po.id, order_number: po.order_number, project_id: po.project_id, status: po.status,
      total_amount: po.total_amount,
      lines: lines.map((l) => ({ id: l.id, material_id: l.material_id, description: l.description, quantity: l.quantity, unit: l.unit, unit_rate: l.unit_rate })),
    } });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/supplier/rfqs/:id/quotations', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      lines: Joi.array().items(Joi.object({
        rfq_line_id: Joi.number().integer().allow(null), material_id: Joi.number().integer().allow(null),
        quantity: Joi.number().positive().required(), unit_price: Joi.number().min(0).required(),
        delivery_days: Joi.number().integer().min(0).allow(null),
      })).min(1).required(),
      tax_pct: Joi.number().min(0).default(0), payment_terms: Joi.string().allow('', null),
      delivery_terms: Joi.string().allow('', null), lead_time_days: Joi.number().integer().min(0).allow(null),
      warranty_months: Joi.number().integer().min(0).allow(null), valid_until: Joi.date().iso().allow(null),
      compliant: Joi.boolean().default(true), deviations: Joi.array().items(Joi.string()).default([]),
      supplier_id: Joi.number().integer().optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const access = await engine.supplierRfq(query, req.user.id, parseInt(req.params.id, 10));
    if (!access) return res.status(404).json({ success: false, error: 'RFQ not found' });
    const assignment = rfqSupplier(access, value.supplier_id);
    const result = await transaction((client) => procurement.submitQuotation(client.query.bind(client), {
      ...value, rfq_id: access.rfq.id, supplier_id: assignment.supplier_id, created_by: req.user.id,
    }));
    res.status(201).json({ success: true, data: result });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/supplier/rfqs/:id/clarifications', authenticate, authorize(), async (req, res) => {
  try {
    const { error, value } = Joi.object({ message: Joi.string().required(), supplier_id: Joi.number().integer().optional() }).validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const access = await engine.supplierRfq(query, req.user.id, parseInt(req.params.id, 10));
    if (!access) return res.status(404).json({ success: false, error: 'RFQ not found' });
    const assignment = rfqSupplier(access, value.supplier_id);
    const row = await engine.createPortalSubmission(query, req.user.id, {
      organization_id: assignment.organization_id, project_id: access.rfq.project_id,
      submission_type: 'rfq_clarification', related_entity_type: 'rfq', related_entity_id: access.rfq.id,
      payload: value,
    });
    res.status(201).json({ success: true, data: row });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/supplier/purchase-orders/:id/acknowledge', authenticate, authorize(), async (req, res) => {
  try {
    const po = await engine.supplierPurchaseOrder(query, req.user.id, parseInt(req.params.id, 10));
    if (!po) return res.status(404).json({ success: false, error: 'Purchase order not found' });
    const row = (await query('UPDATE purchase_orders SET acknowledged_at = NOW() WHERE id = $1 RETURNING *', [po.id])).rows[0];
    res.json({ success: true, data: row });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/supplier/purchase-orders/:id/propose-delivery', authenticate, authorize(), async (req, res) => {
  try {
    const { error, value } = Joi.object({ proposed_date: Joi.date().iso().required(), note: Joi.string().allow('', null) }).validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const po = await engine.supplierPurchaseOrder(query, req.user.id, parseInt(req.params.id, 10));
    if (!po) return res.status(404).json({ success: false, error: 'Purchase order not found' });
    const scope = await engine.supplierScope(query, req.user.id);
    const row = await engine.createPortalSubmission(query, req.user.id, {
      organization_id: supplierAssignment(scope, po.supplier_id, po.project_id).organization_id, project_id: po.project_id,
      submission_type: 'delivery_date_proposal', related_entity_type: 'purchase_order', related_entity_id: po.id,
      payload: value,
    });
    res.status(201).json({ success: true, data: row });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/supplier/deliveries/:id/certificates', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ files: Joi.array().items(Joi.object({ file_name: Joi.string().required(), file_url: Joi.string().required() })).min(1).required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const delivery = (await query('SELECT * FROM deliveries WHERE id = $1', [req.params.id])).rows[0];
    if (!delivery) return res.status(404).json({ success: false, error: 'Delivery not found' });
    const po = await engine.supplierPurchaseOrder(query, req.user.id, delivery.purchase_order_id);
    if (!po) return res.status(404).json({ success: false, error: 'Delivery not found' });
    const scope = await engine.supplierScope(query, req.user.id);
    const row = await engine.createPortalSubmission(query, req.user.id, {
      organization_id: supplierAssignment(scope, po.supplier_id, po.project_id).organization_id, project_id: po.project_id,
      submission_type: 'delivery_certificate', related_entity_type: 'delivery', related_entity_id: delivery.id,
      payload: value,
    });
    res.status(201).json({ success: true, data: row });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/supplier/invoices', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      purchase_order_id: Joi.number().integer().required(), invoice_number: Joi.string().required(),
      invoice_date: Joi.date().iso().allow(null), total_amount: Joi.number().min(0).required(),
      tax_amount: Joi.number().min(0).default(0), lines: Joi.array().items(Joi.object({
        purchase_order_line_id: Joi.number().integer().allow(null), material_id: Joi.number().integer().allow(null),
        quantity: Joi.number().positive().required(), unit_price: Joi.number().min(0).required(),
      })).min(1).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const po = await engine.supplierPurchaseOrder(query, req.user.id, value.purchase_order_id);
    if (!po) return res.status(404).json({ success: false, error: 'Purchase order not found' });
    const result = await transaction((client) => procurement.recordSupplierInvoice(client.query.bind(client), {
      ...value, supplier_id: po.supplier_id, created_by: req.user.id,
    }));
    res.status(201).json({ success: true, data: result });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

module.exports = router;
