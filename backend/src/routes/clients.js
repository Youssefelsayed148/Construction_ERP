const express = require('express');
const { nextNumber } = require('../services/numbering');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

router.get('/', authenticate, authorize(), async (req, res) => {
  try {
    const { search, client_type, is_active, limit = 100, offset = 0 } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (client_type) { conditions.push(`client_type = $${idx++}`); params.push(client_type); }
    if (is_active !== undefined) { conditions.push(`is_active = $${idx++}`); params.push(is_active === 'true'); }
    if (search) { conditions.push(`(code ILIKE $${idx} OR name_en ILIKE $${idx} OR name_ar ILIKE $${idx} OR contact_person ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const dataResult = await query(`SELECT * FROM clients ${where} ORDER BY name_en LIMIT $${idx++} OFFSET $${idx}`, [...params, parseInt(limit), parseInt(offset)]);
    res.json({ success: true, data: dataResult.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const result = await query('SELECT * FROM clients WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Client not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      code: Joi.string().optional(), name_ar: Joi.string().required(), name_en: Joi.string().allow(''),
      client_type: Joi.string().optional(), contact_person: Joi.string().allow(''),
      phone: Joi.string().allow(''), email: Joi.string().email().allow(''),
      address: Joi.string().allow(''), city: Joi.string().allow(''),
      credit_limit: Joi.number().min(0).default(0), payment_terms: Joi.string().allow(''),
      tax_id: Joi.string().allow(''), is_active: Joi.boolean().optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    if (!value.code) {
      value.code = await nextNumber(query, { table: 'clients', column: 'code', prefix: 'CLI', pad: 4 });
    }

    const existing = await query('SELECT id FROM clients WHERE code = $1', [value.code]);
    if (existing.rows.length > 0) return res.status(400).json({ success: false, error: 'Code already exists' });

    const result = await query(
      `INSERT INTO clients (code, name_ar, name_en, client_type, contact_person, phone, email, address, city, credit_limit, payment_terms, tax_id, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [value.code, value.name_ar, value.name_en, value.client_type, value.contact_person, value.phone, value.email, value.address, value.city, value.credit_limit, value.payment_terms, value.tax_id, value.is_active !== undefined ? value.is_active : true]
    );

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'clients', description: `Created client ${value.code}`, entityId: result.rows[0].id, entityType: 'client' });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const existing = await query('SELECT * FROM clients WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Client not found' });

    const schema = Joi.object({
      name_ar: Joi.string(), name_en: Joi.string().allow(''), client_type: Joi.string(),
      contact_person: Joi.string().allow(''), phone: Joi.string().allow(''),
      email: Joi.string().email().allow(''), address: Joi.string().allow(''),
      city: Joi.string().allow(''), credit_limit: Joi.number().min(0),
      payment_terms: Joi.string().allow(''), tax_id: Joi.string().allow(''),
      is_active: Joi.boolean(),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const sets = []; const params = []; let idx = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) { sets.push(`${k} = $${idx++}`); params.push(v); }
    }
    params.push(req.params.id);
    const result = await query(`UPDATE clients SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`, params);

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'clients', description: `Updated client ${existing.rows[0].code}`, entityId: req.params.id, entityType: 'client' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const result = await query('DELETE FROM clients WHERE id = $1 RETURNING code', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Client not found' });
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'delete', module: 'clients', description: `Deleted client ${result.rows[0].code}`, entityId: req.params.id, entityType: 'client' });
    res.json({ success: true, message: 'Client deleted' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

module.exports = router;
