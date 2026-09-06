const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { logActivity, fireEvent } = require('../utils/activity');

// -- Subcontractors --
router.get('/', authenticate, async (req, res) => {
  try {
    const { search, is_active, limit = 100 } = req.query;
    let conds = []; let p = []; let i = 1;
    if (is_active !== undefined) { conds.push(`is_active = $${i++}`); p.push(is_active === 'true'); }
    if (search) { conds.push(`(code ILIKE $${i} OR name ILIKE $${i} OR name_en ILIKE $${i} OR name_ar ILIKE $${i})`); p.push(`%${search}%`); i++; }
    const w = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const data = await query(`SELECT * FROM subcontractors ${w} ORDER BY name LIMIT $${i++}`, [...p, parseInt(limit)]);
    res.json({ success: true, data: data.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const r = await query('SELECT * FROM subcontractors WHERE id = $1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Subcontractor not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const schema = Joi.object({
      code: Joi.string().optional(), name_ar: Joi.string().required(), name_en: Joi.string().allow(''),
      license_no: Joi.string().allow(''), classification: Joi.string().allow(''),
      specialties: Joi.array().items(Joi.string()).default([]),
      insurance_amount: Joi.number().min(0).default(0), insurance_expiry: Joi.date().iso().allow(null),
      contact_person: Joi.string().allow(''), phone: Joi.string().allow(''),
      email: Joi.string().email().allow(''), address: Joi.string().allow(''),
      bank_name: Joi.string().allow(''), bank_account: Joi.string().allow(''),
      is_active: Joi.boolean().optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    if (!value.code) { const cnt = await query("SELECT COUNT(*) as c FROM subcontractors WHERE code LIKE 'SUB-%'"); value.code = `SUB-${String(parseInt(cnt.rows[0].c) + 1).padStart(4, '0')}`; }

    const r = await query(
      `INSERT INTO subcontractors (code, name, name_ar, name_en, license_no, classification, specialties, insurance_amount, insurance_expiry, contact_person, phone, email, address, bank_name, bank_account, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [value.code, value.name_ar, value.name_ar, value.name_en || value.name_ar, value.license_no, value.classification, value.specialties, value.insurance_amount, value.insurance_expiry, value.contact_person, value.phone, value.email, value.address, value.bank_name, value.bank_account, value.is_active !== undefined ? value.is_active : true]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const schema = Joi.object({
      name_ar: Joi.string(), name_en: Joi.string().allow(''), license_no: Joi.string().allow(''),
      classification: Joi.string().allow(''), specialties: Joi.array().items(Joi.string()),
      insurance_amount: Joi.number(), insurance_expiry: Joi.date().iso().allow(null),
      contact_person: Joi.string().allow(''), phone: Joi.string().allow(''),
      email: Joi.string().email().allow(''), bank_name: Joi.string().allow(''),
      bank_account: Joi.string().allow(''), is_active: Joi.boolean(),
      rating: Joi.number().min(0).max(5),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const sets = []; const p = []; let i = 1;
    for (const [k, v] of Object.entries(value)) { if (v !== undefined) { sets.push(`${k} = $${i++}`); p.push(v); } }
    p.push(req.params.id);
    const r = await query(`UPDATE subcontractors SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`, p);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Subcontractor not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// -- Sub Contracts --
router.get('/contracts/:projectId', authenticate, async (req, res) => {
  try {
    const data = await query(
      `SELECT sc.*, s.name as sub_name, s.name_en as sub_name_en, bi.description as boq_item_name
       FROM sub_contracts sc LEFT JOIN subcontractors s ON sc.subcontractor_id = s.id LEFT JOIN boq_items bi ON sc.boq_item_id = bi.id WHERE sc.project_id = $1 ORDER BY sc.created_at DESC`,
      [req.params.projectId]
    );
    res.json({ success: true, data: data.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/contracts', authenticate, async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(), subcontractor_id: Joi.number().integer().required(),
      boq_item_id: Joi.number().integer().optional().allow(null), scope: Joi.string().allow(''),
      contract_value: Joi.number().min(0).default(0), start_date: Joi.date().iso().allow(null),
      end_date: Joi.date().iso().allow(null), retention_percent: Joi.number().min(0).max(100),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const cnt = await query('SELECT COUNT(*) as c FROM sub_contracts');
    const contract_number = `SC-${String(parseInt(cnt.rows[0].c) + 1).padStart(4, '0')}`;

    const businessRules = await query("SELECT rule_value FROM business_rules WHERE rule_key = 'retention_percent' AND is_active = true");
    const defaultRetention = businessRules.rows[0]?.rule_value?.value || 10;
    const retentionPercent = value.retention_percent ?? defaultRetention;

    const r = await query(
      `INSERT INTO sub_contracts (contract_number, project_id, subcontractor_id, boq_item_id, scope, contract_value, start_date, end_date, retention_percent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [contract_number, value.project_id, value.subcontractor_id, value.boq_item_id, value.scope, value.contract_value, value.start_date, value.end_date, retentionPercent]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// -- Work Verifications --
router.get('/verifications/:contractId', authenticate, async (req, res) => {
  try {
    const data = await query(
      `SELECT swv.*, bi.description as boq_item_name FROM sub_work_verifications swv LEFT JOIN boq_items bi ON swv.boq_item_id = bi.id WHERE swv.sub_contract_id = $1 ORDER BY period_from DESC`,
      [req.params.contractId]
    );
    res.json({ success: true, data: data.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/verifications', authenticate, async (req, res) => {
  try {
    const schema = Joi.object({
      sub_contract_id: Joi.number().integer().required(), boq_item_id: Joi.number().integer().required(),
      period_from: Joi.date().iso().required(), period_to: Joi.date().iso().required(),
      quantity_claimed: Joi.number().min(0).default(0), quantity_verified: Joi.number().min(0).default(0),
      notes: Joi.string().allow(''),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const r = await query(
      `INSERT INTO sub_work_verifications (sub_contract_id, boq_item_id, period_from, period_to, quantity_claimed, quantity_verified, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [value.sub_contract_id, value.boq_item_id, value.period_from, value.period_to, value.quantity_claimed, value.quantity_verified, value.notes]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/verifications/:id', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });

    const r = await query(
      `UPDATE sub_work_verifications SET status = $1, verified_by = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [status, req.user.id, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Verification not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// -- Payment Certificates --
router.get('/certificates/:contractId', authenticate, async (req, res) => {
  try {
    const data = await query(
      `SELECT spc.*, u.name as certifier_name FROM sub_payment_certificates spc LEFT JOIN users u ON spc.certified_by = u.id WHERE spc.sub_contract_id = $1 ORDER BY period_from DESC`,
      [req.params.contractId]
    );
    res.json({ success: true, data: data.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/certificates', authenticate, async (req, res) => {
  try {
    const schema = Joi.object({
      sub_contract_id: Joi.number().integer().required(), period_from: Joi.date().iso().required(),
      period_to: Joi.date().iso().required(), work_value: Joi.number().min(0).default(0),
      retention_deduction: Joi.number().min(0).default(0), previous_paid: Joi.number().min(0).default(0),
      penalties: Joi.number().min(0).default(0), materials_deducted: Joi.number().min(0).default(0),
      notes: Joi.string().allow(''),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const net_payable = value.work_value - value.retention_deduction - value.previous_paid - value.penalties - value.materials_deducted;

    const cnt = await query('SELECT COUNT(*) as c FROM sub_payment_certificates');
    const cert_number = `PC-${String(parseInt(cnt.rows[0].c) + 1).padStart(4, '0')}`;

    const r = await query(
      `INSERT INTO sub_payment_certificates (certificate_number, sub_contract_id, period_from, period_to, work_value, retention_deduction, previous_paid, penalties, materials_deducted, net_payable, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [cert_number, value.sub_contract_id, value.period_from, value.period_to, value.work_value, value.retention_deduction, value.previous_paid, value.penalties, value.materials_deducted, net_payable, value.notes]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/certificates/:id', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['certified', 'paid'].includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });

    const r = await query(
      `UPDATE sub_payment_certificates SET status = $1, certified_by = COALESCE(certified_by, $2), paid_at = CASE WHEN $1 = 'paid' THEN NOW() ELSE paid_at END, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [status, req.user.id, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Certificate not found' });

    if (status === 'paid') {
      fireEvent({
        eventType: 'sub_payment.paid',
        entityType: 'sub_payment_certificate',
        entityId: req.params.id,
        userId: req.user.id, userName: req.user.name, userRole: req.user.role,
        payload: { sub_contract_id: r.rows[0].sub_contract_id, amount: r.rows[0].net_payable, project_id: r.rows[0].project_id }
      }).catch(() => {});
    }

    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
