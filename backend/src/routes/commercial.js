const express = require('express');
const { nextNumber } = require('../services/numbering');
const router = express.Router();
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity, fireEvent } = require('../utils/activity');
const engine = require('../services/commercialEngine');
const { atomic, typedFail, typedBody } = require('../utils/typedRoute');

// Phase 13 — the commercial surface: client contracts (SOV), the variation
// lifecycle (through the Phase 6 'variation' workflow with the catalog's
// exact states), commitments, retention/advance ledgers.

// ---------------------------------------------------------------------------
// Client contracts + SOV
// ---------------------------------------------------------------------------

router.get('/contracts/:projectId', authenticate, authorize(), async (req, res) => {
  try {
    const contracts = (await query('SELECT * FROM client_contracts WHERE project_id = $1 ORDER BY id', [req.params.projectId])).rows;
    for (const c of contracts) {
      c.lines = (await query('SELECT * FROM contract_lines WHERE client_contract_id = $1 ORDER BY sort_order, id', [c.id])).rows;
    }
    res.json({ success: true, data: contracts });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/contracts', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      client_id: Joi.number().integer().optional().allow(null),
      title: Joi.string().optional().allow('', null),
      original_value: Joi.number().min(0).required(),
      retention_percent: Joi.number().min(0).max(100).default(10),
      advance_percent: Joi.number().min(0).max(100).default(0),
      contract_date: Joi.date().iso().optional().allow(null),
      start_date: Joi.date().iso().optional().allow(null),
      end_date: Joi.date().iso().optional().allow(null),
      notes: Joi.string().optional().allow('', null),
      lines: Joi.array().items(Joi.object({
        boq_item_id: Joi.number().integer().optional().allow(null),
        description: Joi.string().optional().allow('', null),
        quantity: Joi.number().min(0).default(0),
        unit: Joi.string().optional().allow('', null),
        unit_rate: Joi.number().min(0).default(0),
      })).default([]),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const contractNumber = await nextNumber(query, { table: 'client_contracts', column: 'contract_number', prefix: 'CC', pad: 5 });

    const created = await transaction(async (client) => {
      const r = await client.query(
        `INSERT INTO client_contracts
           (contract_number, project_id, client_id, title, original_value, revised_value,
            retention_percent, advance_percent, contract_date, start_date, end_date, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [contractNumber, value.project_id, value.client_id || null, value.title || null, value.original_value,
         value.retention_percent, value.advance_percent, value.contract_date || null,
         value.start_date || null, value.end_date || null, value.notes || null, req.user.id]
      );
      const contract = r.rows[0];
      let sort = 0;
      for (const line of value.lines) {
        await client.query(
          `INSERT INTO contract_lines (client_contract_id, boq_item_id, description, quantity, unit, unit_rate, amount, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [contract.id, line.boq_item_id || null, line.description || null, line.quantity,
           line.unit || null, line.unit_rate || 0, Math.round((line.quantity * line.unit_rate + Number.EPSILON) * 100) / 100, ++sort]
        );
      }
      return contract;
    });

    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'create', module: 'commercial',
      description: `Created client contract ${contractNumber}`,
      entityId: created.id, entityType: 'client_contract',
    });
    res.status(201).json({ success: true, data: created });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// ---------------------------------------------------------------------------
// Variations — lifecycle through the Phase 6 'variation' template
// ---------------------------------------------------------------------------

router.get('/variations/:projectId', authenticate, authorize(), async (req, res) => {
  try {
    const data = (await query('SELECT * FROM variations WHERE project_id = $1 ORDER BY id', [req.params.projectId])).rows;
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/variations', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      client_contract_id: Joi.number().integer().optional().allow(null),
      sub_contract_id: Joi.number().integer().optional().allow(null),
      title: Joi.string().required(),
      description: Joi.string().optional().allow('', null),
      variation_type: Joi.string().valid('client', 'internal', 'subcontract').default('client'),
      cause: Joi.string().valid('client_instruction', 'design_change', 'site_condition', 'regulatory', 'omission', 'contractor_request', 'force_majeure', 'other').allow(null),
      responsibility: Joi.string().valid('client', 'contractor', 'third_party', 'shared').allow(null),
      linked_rfi_id: Joi.number().integer().allow(null), linked_instruction_id: Joi.number().integer().allow(null),
      time_impact_days: Joi.number().integer().allow(null),
      lines: Joi.array().items(Joi.object({
        boq_item_id: Joi.number().integer().optional().allow(null),
        description: Joi.string().optional().allow('', null),
        quantity: Joi.number().min(0).default(0),
        unit: Joi.string().optional().allow('', null),
        unit_rate: Joi.number().default(0),
      })).default([]),
      cost_buildup: Joi.array().items(Joi.object({
        component: Joi.string().required(),
        cost_code_id: Joi.number().integer().optional().allow(null),
        quantity: Joi.number().default(0),
        unit_rate: Joi.number().default(0),
        amount: Joi.number().default(0),
        notes: Joi.string().optional().allow('', null),
      })).default([]),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const variation = await engine.createVariation(query, { ...value, created_by: req.user.id });
    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'create', module: 'commercial',
      description: `Created variation ${variation.variation_number}`,
      entityId: variation.id, entityType: 'variation',
    });
    res.status(201).json({ success: true, data: variation });
  } catch (e) { return typedFail(res, e, 'COMMERCIAL'); }
});

router.post('/variations/:id/start', authenticate, authorize(), async (req, res) => {
  try {
    const instance = await transaction((client) => engine.startVariationWorkflow(
      client.query.bind(client), parseInt(req.params.id, 10), req.user
    ));
    res.json({ success: true, data: instance });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/variations/:id/decide', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ decision: Joi.string().valid('approve', 'reject').required(), comment: Joi.string().allow('', null), approved_amount: Joi.number().min(0).precision(2) });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const result = await transaction(async (client) => {
      const q = client.query.bind(client);
      const decided = await engine.decideVariation(q, parseInt(req.params.id, 10), req.user, value.decision, value.comment, { approved_amount: value.approved_amount ?? null });
      if (value.decision === 'approve') {
        await fireEvent({
          eventType: 'variation.approved', entityType: 'variation', entityId: parseInt(req.params.id, 10),
          userId: req.user.id, userName: req.user.name, userRole: req.user.role,
          payload: { variation_id: parseInt(req.params.id, 10), status: decided.status },
        }, { query: q });
      }
      return decided;
    });
    res.json({ success: true, data: result });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// ---------------------------------------------------------------------------
// Commercial snapshot of a project (the canonical figures)
// ---------------------------------------------------------------------------

router.get('/project/:projectId/commercial', authenticate, authorize(), async (req, res) => {
  try {
    const data = await engine.projectCommercial(query, parseInt(req.params.projectId, 10));
    if (!data) return res.status(404).json({ success: false, error: 'Project not found' });
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Legacy snapshots (audit trail of the three retired formulas).
router.get('/project/:projectId/legacy-snapshots', authenticate, authorize(), async (req, res) => {
  try {
    const data = (await query(
      'SELECT * FROM commercial_snapshots WHERE project_id = $1 ORDER BY snapshot_type',
      [req.params.projectId]
    )).rows;
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ---------------------------------------------------------------------------
// Phase 5.5 (spec 09): contract parties, guarantees, insurances, currency rates, payment applications, payment
// certificates (workflow), versioned budgets and forecasts, commitment adjustments, variation fields.
// Typed errors carry error_code and error_params.
// ---------------------------------------------------------------------------
const records = require('../services/commercialRecords');
const budgeting = require('../services/budgeting');

const audit = (req, action, description, entityType, entityId) => logActivity({
  userId: req.user.id, userName: req.user.name, userRole: req.user.role, action, module: 'commercial', description, entityId, entityType,
});
const fail = (res, e) => typedFail(res, e, 'COMMERCIAL');
const intId = (req) => parseInt(req.params.id, 10);
const money = Joi.number().min(0).precision(2);
const optDate = Joi.date().iso().allow(null);
const isoDay = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

// --- variation fields ---
router.put('/variations/:id', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(Joi.object({
      title: Joi.string(), description: Joi.string().allow('', null),
      cause: Joi.string().valid('client_instruction', 'design_change', 'site_condition', 'regulatory', 'omission', 'contractor_request', 'force_majeure', 'other').allow(null),
      responsibility: Joi.string().valid('client', 'contractor', 'third_party', 'shared').allow(null),
      linked_rfi_id: Joi.number().integer().allow(null), linked_instruction_id: Joi.number().integer().allow(null),
      time_impact_days: Joi.number().integer().allow(null), recommended_amount: money.allow(null),
    }), req, res);
    if (!value) return;
    const row = await atomic((q) => engine.updateVariation(q, intId(req), value));
    await audit(req, 'update', `Updated variation ${row.variation_number}`, 'variation', row.id);
    res.json({ success: true, data: row });
  } catch (e) { return fail(res, e); }
});

// --- contract parties ---
const partySchema = Joi.object({
  organization_id: Joi.number().integer().allow(null), party_role: Joi.string().required(), name_ar: Joi.string().allow('', null), name_en: Joi.string().allow('', null),
  contact_name: Joi.string().allow('', null), contact_email: Joi.string().email().allow('', null), share_pct: Joi.number().min(0).max(100).allow(null),
  is_signatory: Joi.boolean(), notes: Joi.string().allow('', null),
});
for (const [segment, column] of [['contracts', 'client_contract_id'], ['subcontracts', 'sub_contract_id']]) {
  router.get(`/${segment}/:contractId/parties`, authenticate, authorize(), async (req, res) => {
    try { res.json({ success: true, data: await records.listParties(query, { [column]: req.params.contractId }) }); } catch (e) { return fail(res, e); }
  });
  router.post(`/${segment}/:contractId/parties`, authenticate, authorize(), async (req, res) => {
    try {
      const value = typedBody(partySchema, req, res);
      if (!value) return;
      const row = await atomic((q) => records.addParty(q, { ...value, [column]: parseInt(req.params.contractId, 10) }, req.user.id));
      await audit(req, 'create', `Added ${row.party_role} to contract #${req.params.contractId}`, 'contract_party', row.id);
      res.status(201).json({ success: true, data: row });
    } catch (e) { return fail(res, e); }
  });
}
router.put('/parties/:id', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(partySchema.fork(['party_role'], (s) => s.optional()).keys({ organization_id: Joi.forbidden() }), req, res);
    if (!value) return;
    res.json({ success: true, data: await atomic((q) => records.updateParty(q, intId(req), value)) });
  } catch (e) { return fail(res, e); }
});

// --- guarantees ---
const guaranteeSchema = Joi.object({
  guarantee_type: Joi.string().valid('advance_payment', 'performance', 'retention', 'bid', 'maintenance').required(),
  project_id: Joi.number().integer(), client_contract_id: Joi.number().integer().allow(null), sub_contract_id: Joi.number().integer().allow(null),
  issuer_organization_id: Joi.number().integer().allow(null), reference: Joi.string().allow('', null), amount: Joi.number().positive().precision(2).required(),
  currency: Joi.string().length(3).uppercase(), issued_on: optDate, expires_on: Joi.date().iso().required(), notes: Joi.string().allow('', null),
});
router.get('/guarantees', authenticate, authorize(), async (req, res) => {
  try { res.json({ success: true, data: await records.listGuarantees(query, req.query) }); } catch (e) { return fail(res, e); }
});
router.post('/guarantees', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(guaranteeSchema, req, res);
    if (!value) return;
    const row = await atomic((q) => records.createGuarantee(q, { ...value, issued_on: isoDay(value.issued_on), expires_on: isoDay(value.expires_on) }, req.user.id));
    await audit(req, 'create', `Guarantee ${row.guarantee_number}`, 'guarantee', row.id);
    res.status(201).json({ success: true, data: row });
  } catch (e) { return fail(res, e); }
});
router.get('/guarantees/:id', authenticate, authorize(), async (req, res) => {
  try { res.json({ success: true, data: await records.getGuarantee(query, intId(req)) }); } catch (e) { return fail(res, e); }
});
router.put('/guarantees/:id', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(guaranteeSchema.fork(['guarantee_type', 'amount', 'expires_on'], (s) => s.optional()).keys({ project_id: Joi.forbidden(), client_contract_id: Joi.forbidden(), sub_contract_id: Joi.forbidden(), guarantee_type: Joi.forbidden() }), req, res);
    if (!value) return;
    if (value.issued_on) value.issued_on = isoDay(value.issued_on);
    if (value.expires_on) value.expires_on = isoDay(value.expires_on);
    res.json({ success: true, data: await atomic((q) => records.updateGuarantee(q, intId(req), value)) });
  } catch (e) { return fail(res, e); }
});
router.post('/guarantees/:id/close', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(Joi.object({ status: Joi.string().valid('released', 'called').required(), reason: Joi.string().required(), released_on: optDate }), req, res);
    if (!value) return;
    const row = await atomic((q) => records.closeGuarantee(q, intId(req), value.status, { reason: value.reason, released_on: isoDay(value.released_on) }));
    await audit(req, 'void', `Guarantee ${row.guarantee_number} ${row.status}`, 'guarantee', row.id);
    res.json({ success: true, data: row });
  } catch (e) { return fail(res, e); }
});

// --- insurances ---
const insuranceSchema = Joi.object({
  insurance_type: Joi.string().valid('contractors_all_risk', 'third_party_liability', 'workmen_compensation', 'professional_indemnity', 'plant_equipment', 'other').required(),
  project_id: Joi.number().integer(), client_contract_id: Joi.number().integer().allow(null), sub_contract_id: Joi.number().integer().allow(null),
  insurer_organization_id: Joi.number().integer().allow(null), policy_number: Joi.string().required(), coverage_amount: Joi.number().positive().precision(2).required(),
  premium_amount: money.allow(null), currency: Joi.string().length(3).uppercase(), start_date: optDate, expiry_date: Joi.date().iso().required(), notes: Joi.string().allow('', null),
});
router.get('/insurances', authenticate, authorize(), async (req, res) => {
  try { res.json({ success: true, data: await records.listInsurances(query, req.query) }); } catch (e) { return fail(res, e); }
});
router.post('/insurances', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(insuranceSchema, req, res);
    if (!value) return;
    const row = await atomic((q) => records.createInsurance(q, { ...value, start_date: isoDay(value.start_date), expiry_date: isoDay(value.expiry_date) }, req.user.id));
    await audit(req, 'create', `Insurance ${row.insurance_number}`, 'insurance', row.id);
    res.status(201).json({ success: true, data: row });
  } catch (e) { return fail(res, e); }
});
router.get('/insurances/:id', authenticate, authorize(), async (req, res) => {
  try { res.json({ success: true, data: await records.getInsurance(query, intId(req)) }); } catch (e) { return fail(res, e); }
});
router.put('/insurances/:id', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(insuranceSchema.fork(['insurance_type', 'policy_number', 'coverage_amount', 'expiry_date'], (s) => s.optional()).keys({ project_id: Joi.forbidden(), client_contract_id: Joi.forbidden(), sub_contract_id: Joi.forbidden(), insurance_type: Joi.forbidden() }), req, res);
    if (!value) return;
    if (value.start_date) value.start_date = isoDay(value.start_date);
    if (value.expiry_date) value.expiry_date = isoDay(value.expiry_date);
    res.json({ success: true, data: await atomic((q) => records.updateInsurance(q, intId(req), value)) });
  } catch (e) { return fail(res, e); }
});
router.post('/insurances/:id/cancel', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(Joi.object({ reason: Joi.string().required() }), req, res);
    if (!value) return;
    const row = await atomic((q) => records.cancelInsurance(q, intId(req), value.reason));
    await audit(req, 'void', `Insurance ${row.insurance_number} cancelled`, 'insurance', row.id);
    res.json({ success: true, data: row });
  } catch (e) { return fail(res, e); }
});

// --- currency rates ---
router.get('/currency-rates/convert', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(Joi.object({ amount: Joi.number().precision(2).required(), from: Joi.string().length(3).required(), to: Joi.string().length(3).required(), as_of: optDate }), { body: req.query }, res);
    if (!value) return;
    res.json({ success: true, data: await records.convert(query, { amount: value.amount, from_currency: value.from, to_currency: value.to, as_of: isoDay(value.as_of) }) });
  } catch (e) { return fail(res, e); }
});
router.get('/currency-rates', authenticate, authorize(), async (req, res) => {
  try { res.json({ success: true, data: await records.listRates(query, req.query) }); } catch (e) { return fail(res, e); }
});
router.post('/currency-rates', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(Joi.object({
      from_currency: Joi.string().length(3).uppercase().required(), to_currency: Joi.string().length(3).uppercase().required(),
      rate: Joi.number().positive().required(), effective_date: Joi.date().iso().required(), source: Joi.string().allow('', null),
    }), req, res);
    if (!value) return;
    const row = await atomic((q) => records.setRate(q, { ...value, effective_date: isoDay(value.effective_date) }, req.user.id));
    await audit(req, 'create', `Rate ${row.from_currency}/${row.to_currency} ${row.rate}`, 'currency_rate', row.id);
    res.status(201).json({ success: true, data: row });
  } catch (e) { return fail(res, e); }
});

// --- payment applications (the claim) and payment certificates (the workflow) ---
router.get('/payment-applications', authenticate, authorize(), async (req, res) => {
  try { res.json({ success: true, data: await records.listApplications(query, req.query) }); } catch (e) { return fail(res, e); }
});
router.post('/payment-applications', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(Joi.object({
      party_type: Joi.string().valid('client', 'subcontractor').required(), project_id: Joi.number().integer().required(),
      client_contract_id: Joi.number().integer().allow(null), sub_contract_id: Joi.number().integer().allow(null),
      period_from: optDate, period_to: optDate, claimed_work: money, claimed_variations: money, claimed_materials: money, notes: Joi.string().allow('', null),
    }), req, res);
    if (!value) return;
    const row = await atomic((q) => records.createApplication(q, { ...value, period_from: isoDay(value.period_from), period_to: isoDay(value.period_to) }, req.user.id));
    await audit(req, 'create', `Payment application ${row.application_number}`, 'payment_application', row.id);
    res.status(201).json({ success: true, data: row });
  } catch (e) { return fail(res, e); }
});
router.get('/payment-applications/:id', authenticate, authorize(), async (req, res) => {
  try { res.json({ success: true, data: await records.getApplication(query, intId(req)) }); } catch (e) { return fail(res, e); }
});
router.post('/payment-applications/:id/submit', authenticate, authorize(), async (req, res) => {
  try {
    const row = await atomic((q) => records.submitApplication(q, intId(req), req.user));
    await audit(req, 'submit', `Payment application ${row.application_number} submitted`, 'payment_application', row.id);
    res.json({ success: true, data: row });
  } catch (e) { return fail(res, e); }
});
router.post('/payment-applications/:id/certify', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(Joi.object({
      certified_work: money.required(), certified_variations: money, certified_materials: money, advance_recovery: money, other_deductions: money,
      tax_pct: Joi.number().min(0).max(100), review_notes: Joi.string().allow('', null),
    }), req, res);
    if (!value) return;
    const out = await atomic((q) => records.certifyApplication(q, intId(req), req.user, value));
    await audit(req, 'approve', `Payment application ${out.application.application_number} certified as ${out.certificate.certificate_number}`, 'payment_application', out.application.id);
    res.json({ success: true, data: out });
  } catch (e) { return fail(res, e); }
});
router.post('/payment-applications/:id/reject', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(Joi.object({ reason: Joi.string().required() }), req, res);
    if (!value) return;
    res.json({ success: true, data: await atomic((q) => records.rejectApplication(q, intId(req), req.user, value.reason)) });
  } catch (e) { return fail(res, e); }
});
router.post('/payment-applications/:id/withdraw', authenticate, authorize(), async (req, res) => {
  try { res.json({ success: true, data: await atomic((q) => records.withdrawApplication(q, intId(req), req.user)) }); } catch (e) { return fail(res, e); }
});
router.get('/payment-certificates', authenticate, authorize(), async (req, res) => {
  try {
    const params = []; const conds = [];
    if (req.query.project_id) conds.push(`project_id = $${params.push(parseInt(req.query.project_id, 10))}`);
    if (req.query.status) conds.push(`status = $${params.push(req.query.status)}`);
    res.json({ success: true, data: (await query(`SELECT * FROM payment_certificates ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''} ORDER BY id DESC LIMIT 200`, params)).rows });
  } catch (e) { return fail(res, e); }
});
router.post('/payment-certificates/:id/start', authenticate, authorize(), async (req, res) => {
  try {
    const row = await atomic((q) => records.startCertificateWorkflow(q, intId(req), req.user));
    await audit(req, 'submit', `Certificate ${row.certificate_number} workflow started`, 'payment_certificate', row.id);
    res.json({ success: true, data: row });
  } catch (e) { return fail(res, e); }
});
router.post('/payment-certificates/:id/decide', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(Joi.object({ decision: Joi.string().valid('approve', 'reject').required(), comment: Joi.string().allow('', null) }), req, res);
    if (!value) return;
    const row = await atomic((q) => records.decideCertificate(q, intId(req), req.user, value.decision, value.comment));
    await audit(req, value.decision === 'approve' ? 'approve' : 'reject', `Certificate ${row.certificate_number}: ${row.status}`, 'payment_certificate', row.id);
    res.json({ success: true, data: row });
  } catch (e) { return fail(res, e); }
});

// --- budget versions (internal cost: see_internal_cost) ---
const lineSchema = (field) => Joi.array().items(Joi.object({ cost_code_id: Joi.number().integer().allow(null), [field]: money.required(), notes: Joi.string().allow('', null) }));
router.get('/project/:projectId/budget-versions', authenticate, authorize(), async (req, res) => {
  try { res.json({ success: true, data: await budgeting.listBudgetVersions(query, req.params.projectId) }); } catch (e) { return fail(res, e); }
});
router.post('/budget-versions', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(Joi.object({ project_id: Joi.number().integer().required(), name: Joi.string().required(), notes: Joi.string().allow('', null), lines: lineSchema('amount'), copy_from_version_id: Joi.number().integer() }), req, res);
    if (!value) return;
    const row = await atomic((q) => budgeting.createBudgetVersion(q, value, req.user.id));
    await audit(req, 'create', `Budget version ${row.version_no}`, 'budget_version', row.id);
    res.status(201).json({ success: true, data: row });
  } catch (e) { return fail(res, e); }
});
router.get('/budget-versions/:id', authenticate, authorize(), async (req, res) => {
  try { res.json({ success: true, data: await budgeting.getBudgetVersion(query, intId(req)) }); } catch (e) { return fail(res, e); }
});
router.put('/budget-versions/:id', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(Joi.object({ name: Joi.string(), notes: Joi.string().allow('', null), lines: lineSchema('amount') }), req, res);
    if (!value) return;
    res.json({ success: true, data: await atomic((q) => budgeting.updateBudgetVersion(q, intId(req), value)) });
  } catch (e) { return fail(res, e); }
});
router.post('/budget-versions/:id/submit', authenticate, authorize(), async (req, res) => {
  try {
    const row = await atomic((q) => budgeting.submitBudgetVersion(q, intId(req), req.user));
    await audit(req, 'submit', `Budget version ${row.version_no} submitted`, 'budget_version', row.id);
    res.json({ success: true, data: row });
  } catch (e) { return fail(res, e); }
});
router.post('/budget-versions/:id/decide', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(Joi.object({ decision: Joi.string().valid('approve', 'reject').required(), comment: Joi.string().allow('', null) }), req, res);
    if (!value) return;
    const row = await atomic((q) => budgeting.decideBudgetVersion(q, intId(req), req.user, value.decision, value.comment));
    await audit(req, value.decision === 'approve' ? 'approve' : 'reject', `Budget version ${row.version_no}: ${row.status}`, 'budget_version', row.id);
    res.json({ success: true, data: row });
  } catch (e) { return fail(res, e); }
});

// --- forecast versions ---
router.get('/project/:projectId/forecast-versions', authenticate, authorize(), async (req, res) => {
  try { res.json({ success: true, data: await budgeting.listForecastVersions(query, req.params.projectId) }); } catch (e) { return fail(res, e); }
});
router.post('/forecast-versions', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(Joi.object({ project_id: Joi.number().integer().required(), name: Joi.string().required(), as_of_date: optDate, notes: Joi.string().allow('', null), lines: lineSchema('forecast_amount').required() }), req, res);
    if (!value) return;
    const row = await atomic((q) => budgeting.createForecastVersion(q, { ...value, as_of_date: isoDay(value.as_of_date) }, req.user.id));
    await audit(req, 'create', `Forecast version ${row.version_no}`, 'forecast_version', row.id);
    res.status(201).json({ success: true, data: row });
  } catch (e) { return fail(res, e); }
});
router.get('/forecast-versions/:id', authenticate, authorize(), async (req, res) => {
  try { res.json({ success: true, data: await budgeting.getForecastVersion(query, intId(req)) }); } catch (e) { return fail(res, e); }
});
router.post('/forecast-versions/:id/approve', authenticate, authorize(), async (req, res) => {
  try {
    const row = await atomic((q) => budgeting.approveForecastVersion(q, intId(req), req.user));
    await audit(req, 'approve', `Forecast version ${row.version_no} approved`, 'forecast_version', row.id);
    res.json({ success: true, data: row });
  } catch (e) { return fail(res, e); }
});

// --- commitments ---
router.get('/project/:projectId/commitments', authenticate, authorize(), async (req, res) => {
  try { res.json({ success: true, data: await atomic((q) => budgeting.listCommitments(q, req.params.projectId)) }); } catch (e) { return fail(res, e); }
});
router.get('/commitments/:id', authenticate, authorize(), async (req, res) => {
  try { res.json({ success: true, data: await budgeting.getCommitment(query, intId(req)) }); } catch (e) { return fail(res, e); }
});
router.post('/commitments/:id/adjust', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(Joi.object({ cancelled_amount: money.required(), reason: Joi.string().required() }), req, res);
    if (!value) return;
    const row = await atomic((q) => budgeting.adjustCommitment(q, intId(req), req.user, value));
    await audit(req, 'update', `Commitment ${row.commitment_number} adjusted to cancelled ${row.cancelled_amount}`, 'commitment', row.id);
    res.json({ success: true, data: row });
  } catch (e) { return fail(res, e); }
});

module.exports = router;
