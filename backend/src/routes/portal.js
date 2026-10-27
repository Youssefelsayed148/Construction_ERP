const { authorizedProjectId, authorizeProjectPayload } = require('../services/authorizedProject');
const express = require('express');
const { nextNumber } = require('../services/numbering');
const router = express.Router();
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { auditedTransaction } = require('../utils/auditedTransaction');
const { auditedMutation } = require('../utils/auditedMutation');
const { typedFail, typedBody } = require('../utils/typedRoute');
const engine = require('../services/portalEngine');
const procurement = require('../services/procurementService');
const { svcError } = require('../utils/serviceErrors');

const SUBMISSION_KINDS = Object.freeze({
  wir_request: { entityType: null, schema: Joi.object({ sub_contract_id: Joi.number().integer().positive().required(), requested_date: Joi.date().iso().allow(null), note: Joi.string().max(4000).required() }).required() },
  mir_request: { entityType: null, schema: Joi.object({ sub_contract_id: Joi.number().integer().positive().required(), requested_date: Joi.date().iso().allow(null), note: Joi.string().max(4000).required() }).required() },
  manpower: { entityType: null, schema: Joi.object({ sub_contract_id: Joi.number().integer().positive().required(), report_date: Joi.date().iso().required(), worker_count: Joi.number().integer().min(0).required(), worker_type: Joi.string().max(120).allow('', null), note: Joi.string().max(4000).allow('', null) }).required() },
  equipment: { entityType: null, schema: Joi.object({ sub_contract_id: Joi.number().integer().positive().required(), report_date: Joi.date().iso().required(), equipment_name: Joi.string().max(255).required(), hours: Joi.number().min(0).max(24).required(), note: Joi.string().max(4000).allow('', null) }).required() },
  ncr_response: { entityType: 'ncr', schema: Joi.object({ sub_contract_id: Joi.number().integer().positive().required(), related_entity_id: Joi.number().integer().positive().required(), response: Joi.string().max(4000).required() }).required() },
  observation_response: { entityType: 'observation', schema: Joi.object({ sub_contract_id: Joi.number().integer().positive().required(), related_entity_id: Joi.number().integer().positive().required(), response: Joi.string().max(4000).required() }).required() },
  variation_quote: { entityType: 'variation', schema: Joi.object({ sub_contract_id: Joi.number().integer().positive().required(), related_entity_id: Joi.number().integer().positive().required(), quoted_amount: Joi.number().min(0).precision(2).required(), schedule_impact_days: Joi.number().integer().min(0).max(3650).default(0), note: Joi.string().max(4000).required() }).required() },
});

function supplierAssignment(scope, supplierId, projectId) {
  return scope.assignments?.find((a) => Number(a.supplier_id) === Number(supplierId)
    && Number(a.project_id) === Number(projectId));
}

function rfqSupplier(access, requestedId) {
  const ids = access.supplierIds;
  const id = requestedId == null ? (ids.length === 1 ? ids[0] : null) : Number(requestedId);
  if (!id || !ids.includes(id)) throw svcError(400, 'invalid_input', 'Select an invited supplier organization for this RFQ');
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
    const out = await auditedMutation(req, { action: 'acknowledge', module: 'portal', entityType: 'sub_contract' }, async (q) => {
      const row = (await q('UPDATE sub_contracts SET acknowledged_at = NOW() WHERE id = $1 RETURNING *', [contract.id])).rows[0];
      return { data: row, entityId: row.id, projectId: row.project_id, before: contract, after: row, description: `Acknowledged subcontract package ${row.contract_number || row.id}` };
    });
    res.json({ success: true, data: out.data });
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
    const instruction = await transaction(async (client) => {
      const q = client.query.bind(client);
      const result = await engine.acknowledgeInstruction(q, req.user.id, {
        project_id: authorizedProjectId(req, value), instruction_id: parseInt(req.params.id, 10), response: value.response,
      });
      if (result) await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'portal', description: `Acknowledged instruction #${req.params.id} (portal)`, entityId: result.id, entityType: 'engineer_instruction' }, { query: q });
      return result;
    });
    if (!instruction) return res.status(404).json({ success: false, error: 'Instruction not found' });
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
    const out = await auditedMutation(req, { action: 'submit', module: 'portal', entityType: 'sub_work_verification' }, async (q) => {
      const r = await q(
        `INSERT INTO sub_work_verifications (sub_contract_id, boq_item_id, period_from, period_to, quantity_claimed, notes)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [value.sub_contract_id, value.boq_item_id, value.period_from, value.period_to, value.quantity_claimed, value.notes]
      );
      return { data: r.rows[0], entityId: r.rows[0].id, projectId: contract.project_id, after: r.rows[0], description: `Submitted quantity claim for package ${value.sub_contract_id}` };
    });
    res.status(201).json({ success: true, data: out.data });
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
    authorizeProjectPayload(req, value);
    const certificate = await transaction(async (client) => {
      await client.query('SELECT id FROM sub_contracts WHERE id = $1 FOR UPDATE', [value.sub_contract_id]);
      const q = client.query.bind(client);
      const created = await engine.submitPaymentApplication(q, req.user.id, value);
      if (created) await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'portal', description: `Payment application ${created.certificate_number} submitted`, entityId: created.id, entityType: 'payment_certificate' }, { query: q });
      return created;
    });
    if (!certificate) return res.status(404).json({ success: false, error: 'Package not found' });
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
    authorizeProjectPayload(req, value);
    const contract = await engine.subContractForOrg(query, value.sub_contract_id, req.user.id);
    if (!contract || Number(contract.project_id) !== authorizedProjectId(req, value)) return res.status(404).json({ success: false, error: 'Package not found' });
    const out = await auditedMutation(req, { action: 'submit', module: 'portal', entityType: 'project_rfi' }, async (q) => {
      const number = await nextNumber(q, { table: 'project_rfis', column: 'rfi_number', prefix: `RFI-${authorizedProjectId(req, value)}`, pad: 3 });
      const row = (await q(
        `INSERT INTO project_rfis (rfi_number, project_id, sub_contract_id, subject, question, category, priority, due_date, raised_by, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'submitted') RETURNING *`,
        [number, authorizedProjectId(req, value), value.sub_contract_id, value.subject, value.question, value.category, value.priority, value.due_date, req.user.id]
      )).rows[0];
      return { data: row, entityId: row.id, projectId: row.project_id, after: row, description: `Raised RFI ${row.rfi_number}` };
    });
    res.status(201).json({ success: true, data: out.data });
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
    authorizeProjectPayload(req, value);
    const contract = await engine.subContractForOrg(query, value.sub_contract_id, req.user.id);
    if (!contract || Number(contract.project_id) !== authorizedProjectId(req, value)) return res.status(404).json({ success: false, error: 'Package not found' });
    const out = await auditedMutation(req, { action: 'submit', module: 'portal', entityType: 'project_submittal' }, async (q) => {
      const number = await nextNumber(q, { table: 'project_submittals', column: 'submittal_number', prefix: `SUB-${authorizedProjectId(req, value)}`, pad: 3 });
      const row = (await q(
        `INSERT INTO project_submittals (submittal_number, project_id, sub_contract_id, title, submittal_type, submitted_to, submitted_by, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'submitted') RETURNING *`,
        [number, authorizedProjectId(req, value), value.sub_contract_id, value.title, value.submittal_type, value.submitted_to, req.user.id]
      )).rows[0];
      return { data: row, entityId: row.id, projectId: row.project_id, after: row, description: `Submitted submittal ${row.submittal_number}` };
    });
    res.status(201).json({ success: true, data: out.data });
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
    const out = await auditedMutation(req, { action: 'acknowledge', module: 'portal', entityType: 'project_rfi' }, async (q) => {
      await q('SELECT id FROM project_rfis WHERE id = $1 FOR UPDATE', [rfiId]);
      const row = await require('../services/consultantEngine').recordRfiResponse(q, {
        rfi_id: rfiId, stage: 'acknowledgement', revision: Number(rfi.revision || 1),
        user: req.user, body: value.body || 'Acknowledged',
      });
      return { data: row, entityId: rfiId, projectId: rfi.project_id, before: rfi, after: row, description: `Acknowledged RFI ${rfi.rfi_number || rfiId}` };
    });
    res.status(201).json({ success: true, data: out.data });
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
    const out = await auditedMutation(req, { action: 'resubmit', module: 'portal', entityType: 'project_submittal' }, async (q) => {
      await q('SELECT id FROM project_submittals WHERE id = $1 FOR UPDATE', [id]);
      const row = await require('../services/consultantEngine').resubmitSubmittal(q, id, req.user, value);
      return { data: row, entityId: id, projectId: submittal.project_id, before: submittal, after: row, description: `Resubmitted submittal ${submittal.submittal_number || id}` };
    });
    res.status(201).json({ success: true, data: out.data });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

// The intake stays separate from the formal WIR/MIR, QHSE, labour, equipment,
// and commercial records until an internal reviewer accepts it.
router.get('/subcontractor/submissions', authenticate, authorize(), async (req, res) => {
  const filters = typedBody(Joi.object({ project_id: Joi.number().integer().positive().optional() }), { body: req.query }, res);
  if (!filters) return;
  try {
    res.json({ success: true, data: await engine.subcontractorSubmissions(query, req.user.id, { projectId: filters.project_id }) });
  } catch (error) { return typedFail(res, error, 'SUBCONTRACTOR_SUBMISSIONS_LIST', req); }
});

router.post('/subcontractor/submissions/:kind', authenticate, authorize(), async (req, res) => {
  const kind = SUBMISSION_KINDS[req.params.kind];
  if (!kind) return typedFail(res, Object.assign(new Error('Unsupported submission type'), { status: 400, error_code: 'unsupported_submission_type' }), 'SUBCONTRACTOR_SUBMISSION', req);
  const value = typedBody(Joi.object({ project_id: Joi.number().integer().positive().required(), payload: kind.schema }).required(), req, res);
  if (!value) return;
    authorizeProjectPayload(req, value);
  try {
    const created = await auditedTransaction(async (q) => {
      const scope = await engine.assertSubcontractorProject(q, req.user.id, authorizedProjectId(req, value));
      const contract = scope.packages.find((p) => Number(p.id) === value.payload.sub_contract_id && Number(p.project_id) === authorizedProjectId(req, value));
      if (!contract) throw Object.assign(new Error('Package not found'), { status: 404, error_code: 'record_not_found' });
      let relatedId = value.payload.related_entity_id || null;
      if (kind.entityType) {
        const tables = { ncr: 'ncrs', observation: 'observations', variation: 'variations' };
        const target = (await q(`SELECT id FROM ${tables[kind.entityType]} WHERE id = $1 AND project_id = $2 AND sub_contract_id = $3 FOR SHARE`, [relatedId, authorizedProjectId(req, value), contract.id])).rows[0];
        if (!target) throw Object.assign(new Error('Related record not found'), { status: 404, error_code: 'record_not_found' });
      }
      const payload = { ...value.payload };
      delete payload.related_entity_id;
      const row = await engine.createPortalSubmission(q, req.user.id, {
        organization_id: contract.organization_id, project_id: authorizedProjectId(req, value), submission_type: req.params.kind,
        related_entity_type: kind.entityType, related_entity_id: relatedId, payload,
      });
      return { ...row, payload: engine.safePortalSubmissionPayload(req.params.kind, row.payload) };
    }, (row) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'submit', module: 'portal', description: `Submitted ${req.params.kind} for project ${authorizedProjectId(req, value)}`, entityId: row.id, entityType: 'portal_submission' }));
    res.status(201).json({ success: true, data: created });
  } catch (error) { return typedFail(res, error, 'SUBCONTRACTOR_SUBMISSION', req); }
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
    const out = await auditedMutation(req, { action: 'submit_quotation', module: 'portal', entityType: 'supplier_quotation' }, async (q) => {
      const result = await procurement.submitQuotation(q, {
        ...value, rfq_id: access.rfq.id, supplier_id: assignment.supplier_id, created_by: req.user.id,
      });
      return { data: result, entityId: result.id, projectId: access.rfq.project_id, after: result, amount: result.total_price == null ? undefined : Number(result.total_price), description: `Supplier quotation on RFQ ${access.rfq.rfq_number || access.rfq.id}` };
    });
    res.status(201).json({ success: true, data: out.data });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/supplier/rfqs/:id/clarifications', authenticate, authorize(), async (req, res) => {
  try {
    const { error, value } = Joi.object({ message: Joi.string().required(), supplier_id: Joi.number().integer().optional() }).validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const access = await engine.supplierRfq(query, req.user.id, parseInt(req.params.id, 10));
    if (!access) return res.status(404).json({ success: false, error: 'RFQ not found' });
    const assignment = rfqSupplier(access, value.supplier_id);
    const out = await auditedMutation(req, { action: 'submit', module: 'portal', entityType: 'portal_submission' }, async (q) => {
      const row = await engine.createPortalSubmission(q, req.user.id, {
        organization_id: assignment.organization_id, project_id: access.rfq.project_id,
        submission_type: 'rfq_clarification', related_entity_type: 'rfq', related_entity_id: access.rfq.id,
        payload: value,
      });
      return { data: row, entityId: row.id, projectId: access.rfq.project_id, after: row, description: `RFQ clarification submitted for RFQ #${access.rfq.id}` };
    });
    res.status(201).json({ success: true, data: out.data });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/supplier/purchase-orders/:id/acknowledge', authenticate, authorize(), async (req, res) => {
  try {
    const po = await engine.supplierPurchaseOrder(query, req.user.id, parseInt(req.params.id, 10));
    if (!po) return res.status(404).json({ success: false, error: 'Purchase order not found' });
    const out = await auditedMutation(req, { action: 'acknowledge', module: 'portal', entityType: 'purchase_order' }, async (q) => {
      const row = (await q('UPDATE purchase_orders SET acknowledged_at = NOW() WHERE id = $1 RETURNING *', [po.id])).rows[0];
      return { data: row, entityId: row.id, projectId: row.project_id, before: po, after: row, description: `Supplier acknowledged PO ${row.order_number || row.id}` };
    });
    res.json({ success: true, data: out.data });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/supplier/purchase-orders/:id/propose-delivery', authenticate, authorize(), async (req, res) => {
  try {
    const { error, value } = Joi.object({ proposed_date: Joi.date().iso().required(), note: Joi.string().allow('', null) }).validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const po = await engine.supplierPurchaseOrder(query, req.user.id, parseInt(req.params.id, 10));
    if (!po) return res.status(404).json({ success: false, error: 'Purchase order not found' });
    const scope = await engine.supplierScope(query, req.user.id);
    const out = await auditedMutation(req, { action: 'submit', module: 'portal', entityType: 'portal_submission' }, async (q) => {
      const row = await engine.createPortalSubmission(q, req.user.id, {
        organization_id: supplierAssignment(scope, po.supplier_id, po.project_id).organization_id, project_id: po.project_id,
        submission_type: 'delivery_date_proposal', related_entity_type: 'purchase_order', related_entity_id: po.id,
        payload: value,
      });
      return { data: row, entityId: row.id, projectId: po.project_id, after: row, description: `Delivery date proposed for PO #${po.id}` };
    });
    res.status(201).json({ success: true, data: out.data });
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
    const out = await auditedMutation(req, { action: 'submit', module: 'portal', entityType: 'portal_submission' }, async (q) => {
      const row = await engine.createPortalSubmission(q, req.user.id, {
        organization_id: supplierAssignment(scope, po.supplier_id, po.project_id).organization_id, project_id: po.project_id,
        submission_type: 'delivery_certificate', related_entity_type: 'delivery', related_entity_id: delivery.id,
        payload: value,
      });
      return { data: row, entityId: row.id, projectId: po.project_id, after: row, description: `Delivery certificate submitted for delivery #${delivery.id}` };
    });
    res.status(201).json({ success: true, data: out.data });
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
    const out = await auditedMutation(req, { action: 'submit_invoice', module: 'portal', entityType: 'supplier_invoice' }, async (q) => {
      const result = await procurement.recordSupplierInvoice(q, {
        ...value, supplier_id: po.supplier_id, created_by: req.user.id,
      });
      return { data: result, entityId: result.invoice && result.invoice.id, projectId: po.project_id, after: result.invoice, amount: Number(value.total_amount), description: `Supplier invoice ${value.invoice_number} submitted via portal` };
    });
    res.status(201).json({ success: true, data: out.data });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

module.exports = router;
