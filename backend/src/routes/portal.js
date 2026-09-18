const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const engine = require('../services/portalEngine');

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
    const certificate = await engine.submitPaymentApplication(query, req.user.id, value);
    if (!certificate) return res.status(404).json({ success: false, error: 'Package not found' });
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'portal', description: `Payment application ${certificate.certificate_number} submitted`, entityId: certificate.id, entityType: 'payment_certificate' });
    res.status(201).json({ success: true, data: certificate });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

// ============ SUPPLIER ============

router.get('/supplier/dashboard', authenticate, authorize(), async (req, res) => {
  try {
    const data = await engine.supplierDashboard(query, req.user.id);
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

module.exports = router;
