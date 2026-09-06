const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

const SPECIALTIES = ['concrete', 'steel', 'electrical', 'plumbing', 'wood', 'paint_coating', 'aggregate', 'equipment', 'safety', 'general', 'other'];

router.get('/', authenticate, async (req, res) => {
  try {
    const { search, specialty, is_active, limit = 100, offset = 0 } = req.query;
    let conditions = [];
    let params = [];
    let idx = 1;

    if (specialty && SPECIALTIES.includes(specialty)) {
      conditions.push(`specialty = $${idx++}`);
      params.push(specialty);
    }
    if (is_active !== undefined) {
      conditions.push(`is_active = $${idx++}`);
      params.push(is_active === 'true');
    }
    if (search) {
      conditions.push(`(code ILIKE $${idx} OR name_en ILIKE $${idx} OR name_ar ILIKE $${idx} OR contact_person ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const dataResult = await query(
      `SELECT * FROM suppliers ${where} ORDER BY name_en LIMIT $${idx++} OFFSET $${idx}`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    res.json({ success: true, data: dataResult.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/specialties', authenticate, (req, res) => {
  res.json({ success: true, data: SPECIALTIES });
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query('SELECT * FROM suppliers WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Supplier not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const schema = Joi.object({
      code: Joi.string().optional(),
      name_ar: Joi.string().required(),
      name_en: Joi.string().allow(''),
      contact_person: Joi.string().allow(''),
      phone: Joi.string().allow(''),
      email: Joi.string().email().allow(''),
      address: Joi.string().allow(''),
      city: Joi.string().allow(''),
      specialty: Joi.string().valid(...SPECIALTIES).optional(),
      tax_id: Joi.string().allow(''),
      payment_terms: Joi.string().allow(''),
      is_active: Joi.boolean().optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    if (!value.code) {
      const count = await query("SELECT COUNT(*) as cnt FROM suppliers WHERE code LIKE 'SUP-%'");
      value.code = `SUP-${String(parseInt(count.rows[0].cnt) + 1).padStart(4, '0')}`;
    }

    const existing = await query('SELECT id FROM suppliers WHERE code = $1', [value.code]);
    if (existing.rows.length > 0) return res.status(400).json({ success: false, error: 'Code already exists' });

    const result = await query(
      `INSERT INTO suppliers (code, name_ar, name_en, contact_person, phone, email, address, city, specialty, tax_id, payment_terms, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [value.code, value.name_ar, value.name_en, value.contact_person, value.phone, value.email, value.address, value.city, value.specialty, value.tax_id, value.payment_terms, value.is_active !== undefined ? value.is_active : true]
    );

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'suppliers', description: `Created supplier ${value.code}`, entityId: result.rows[0].id, entityType: 'supplier' });

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const existing = await query('SELECT * FROM suppliers WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Supplier not found' });

    const schema = Joi.object({
      name_ar: Joi.string(), name_en: Joi.string().allow(''),
      contact_person: Joi.string().allow(''), phone: Joi.string().allow(''),
      email: Joi.string().email().allow(''), address: Joi.string().allow(''),
      city: Joi.string().allow(''),
      specialty: Joi.string().valid(...SPECIALTIES),
      tax_id: Joi.string().allow(''), payment_terms: Joi.string().allow(''),
      is_active: Joi.boolean(),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const sets = []; const params = []; let idx = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) { sets.push(`${k} = $${idx++}`); params.push(v); }
    }
    params.push(req.params.id);
    const result = await query(`UPDATE suppliers SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`, params);

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'suppliers', description: `Updated supplier ${existing.rows[0].code}`, entityId: req.params.id, entityType: 'supplier' });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await query('DELETE FROM suppliers WHERE id = $1 RETURNING code', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Supplier not found' });
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'delete', module: 'suppliers', description: `Deleted supplier ${result.rows[0].code}`, entityId: req.params.id, entityType: 'supplier' });
    res.json({ success: true, message: 'Supplier deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// -- Supplied Materials (supplier <-> item_master link) --
router.get('/:id/materials', authenticate, async (req, res) => {
  try {
    const data = await query(
      `SELECT sm.*, im.code as material_code, im.name_ar as material_name_ar, im.name_en as material_name_en, im.unit
       FROM supplier_materials sm
       JOIN item_master im ON sm.material_id = im.id
       WHERE sm.supplier_id = $1
       ORDER BY im.name_en`,
      [req.params.id]
    );
    res.json({ success: true, data: data.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/materials', authenticate, async (req, res) => {
  try {
    const supplier = await query('SELECT id FROM suppliers WHERE id = $1', [req.params.id]);
    if (supplier.rows.length === 0) return res.status(404).json({ success: false, error: 'Supplier not found' });

    const schema = Joi.object({
      material_id: Joi.number().integer().required(),
      unit_price: Joi.number().min(0).optional().allow(null),
      lead_time_days: Joi.number().integer().min(0).optional().allow(null),
      notes: Joi.string().allow('').optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const material = await query('SELECT id FROM item_master WHERE id = $1', [value.material_id]);
    if (material.rows.length === 0) return res.status(400).json({ success: false, error: 'Material not found' });

    const existing = await query('SELECT id FROM supplier_materials WHERE supplier_id = $1 AND material_id = $2', [req.params.id, value.material_id]);
    if (existing.rows.length > 0) return res.status(409).json({ success: false, error: 'This material is already linked to this supplier' });

    const result = await query(
      `INSERT INTO supplier_materials (supplier_id, material_id, unit_price, lead_time_days, notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, value.material_id, value.unit_price ?? null, value.lead_time_days ?? null, value.notes || null]
    );

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'suppliers', description: `Linked material #${value.material_id} to supplier #${req.params.id}`, entityId: result.rows[0].id, entityType: 'supplier_material' });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, error: 'This material is already linked to this supplier' });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:id/materials/:material_id', authenticate, async (req, res) => {
  try {
    const result = await query('DELETE FROM supplier_materials WHERE supplier_id = $1 AND material_id = $2 RETURNING id', [req.params.id, req.params.material_id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Link not found' });
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'delete', module: 'suppliers', description: `Unlinked material #${req.params.material_id} from supplier #${req.params.id}`, entityId: req.params.id, entityType: 'supplier_material' });
    res.json({ success: true, message: 'Material unlinked' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
