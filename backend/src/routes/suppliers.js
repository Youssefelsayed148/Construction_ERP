const express = require('express');
const { nextNumber } = require('../services/numbering');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { queryPaginated } = require('../utils/pagination');
const { authenticate, authorize } = require('../middleware/auth');
const { auditedTransaction } = require('../utils/auditedTransaction');
const { reasonFrom } = require('../utils/reason');
const { routeFail } = require('../utils/typedRoute');

const SPECIALTIES = ['concrete', 'steel', 'electrical', 'plumbing', 'wood', 'paint_coating', 'aggregate', 'equipment', 'safety', 'general', 'other'];

router.get('/', authenticate, authorize(), async (req, res) => {
  try {
    const { search, specialty, is_active } = req.query;
    let conditions = [];
    let params = [];
    let idx = 1;
    if (req.query.include_deleted !== 'true') conditions.push('deleted_at IS NULL');

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
    const dataResult = await queryPaginated(req, res, query, { sql: `SELECT * FROM suppliers ${where}`, params, orderBy: [{ column: 'name_en' }] });
    res.json({ success: true, data: dataResult.rows });
  } catch (error) {
    routeFail(res, error, 'suppliers.GET /', req);
  }
});

router.get('/specialties', authenticate, authorize(), (req, res) => {
  res.json({ success: true, data: SPECIALTIES });
});

router.get('/:id', authenticate, authorize(), async (req, res) => {
  try {
    // Phase 12 — suppliers resolve through their organization (Phase 3).
    const result = await query(
      `SELECT s.*, o.code AS organization_code, o.name_en AS organization_name_en, o.name_ar AS organization_name_ar, o.org_type AS organization_type
       FROM suppliers s LEFT JOIN organizations o ON o.id = s.organization_id WHERE s.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Supplier not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    routeFail(res, error, 'suppliers.GET /:id', req);
  }
});

router.post('/', authenticate, authorize(), async (req, res) => {
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
      organization_id: Joi.number().integer().optional().allow(null),
      is_active: Joi.boolean().optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const result = await auditedTransaction(async (q) => {
      if (!value.code) value.code = await nextNumber(q, { table: 'suppliers', column: 'code', prefix: 'SUP', pad: 4 });
      const existing = await q('SELECT id FROM suppliers WHERE code = $1', [value.code]);
      if (existing.rows.length > 0) return { rows: [], duplicate: true };
      return q(
      `INSERT INTO suppliers (code, name_ar, name_en, contact_person, phone, email, address, city, specialty, tax_id, payment_terms, organization_id, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [value.code, value.name_ar, value.name_en, value.contact_person, value.phone, value.email, value.address, value.city, value.specialty, value.tax_id, value.payment_terms, value.organization_id || null, value.is_active !== undefined ? value.is_active : true]
      );
    }, (r) => r.rows[0] && ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'suppliers', description: `Created supplier ${value.code}`, entityId: r.rows[0].id, entityType: 'supplier' }));
    if (result.duplicate) return res.status(400).json({ success: false, error: 'Code already exists' });

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    routeFail(res, error, 'suppliers.POST /', req);
  }
});

router.put('/:id', authenticate, authorize(), async (req, res) => {
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
      organization_id: Joi.number().integer().allow(null),
      is_active: Joi.boolean(),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const sets = []; const params = []; let idx = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) { sets.push(`${k} = $${idx++}`); params.push(v); }
    }
    params.push(req.params.id);
    const result = await auditedTransaction((q) => q(`UPDATE suppliers SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`, params), (r) => r.rows[0] && ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'suppliers', description: `Updated supplier ${existing.rows[0].code}`, entityId: req.params.id, entityType: 'supplier' }));
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Supplier not found' });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    routeFail(res, error, 'suppliers.PUT /:id', req);
  }
});

// Soft delete: POs, GRNs and invoices keep resolving the supplier; lists and pickers hide it.
router.delete('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const reason = reasonFrom(req) || null;
    const result = await auditedTransaction((q) => q(
      `UPDATE suppliers SET deleted_at = NOW(), deleted_by = $2, delete_reason = $3, is_active = false, updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL RETURNING code`,
      [req.params.id, req.user.id, reason]), (r) => r.rows[0] && ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'delete', module: 'suppliers', description: `Deleted supplier ${r.rows[0].code}${reason ? `: ${reason}` : ''}`, entityId: req.params.id, entityType: 'supplier' }));
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Supplier not found' });
    res.json({ success: true, message: 'Supplier deleted' });
  } catch (error) {
    routeFail(res, error, 'suppliers.DELETE /:id', req);
  }
});

router.post('/:id/restore', authenticate, authorize(), async (req, res) => {
  try {
    const result = await auditedTransaction((q) => q(
      `UPDATE suppliers SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, is_active = true, updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NOT NULL RETURNING *`, [req.params.id]), (r) => r.rows[0] && ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'restore', module: 'suppliers', description: `Restored supplier ${r.rows[0].code}`, entityId: req.params.id, entityType: 'supplier' }));
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Deleted supplier not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    routeFail(res, error, 'suppliers.POST /:id/restore', req);
  }
});

// -- Supplied Materials (supplier <-> item_master link) --
router.get('/:id/materials', authenticate, authorize(), async (req, res) => {
  try {
    const data = await queryPaginated(req, res, query, {
      sql: `SELECT sm.*, im.code as material_code, im.name_ar as material_name_ar, im.name_en as material_name_en, im.unit
       FROM supplier_materials sm JOIN item_master im ON sm.material_id = im.id WHERE sm.supplier_id = $1`,
      params: [req.params.id], orderBy: [{ column: 'im.name_en' }],
    });
    res.json({ success: true, data: data.rows });
  } catch (error) {
    routeFail(res, error, 'suppliers.GET /:id/materials', req);
  }
});

router.post('/:id/materials', authenticate, authorize(), async (req, res) => {
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

    const result = await auditedTransaction((q) => q(
      `INSERT INTO supplier_materials (supplier_id, material_id, unit_price, lead_time_days, notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, value.material_id, value.unit_price ?? null, value.lead_time_days ?? null, value.notes || null]
    ), (r) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'suppliers', description: `Linked material #${value.material_id} to supplier #${req.params.id}`, entityId: r.rows[0].id, entityType: 'supplier_material' }));
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, error: 'This material is already linked to this supplier' });
    routeFail(res, error, 'suppliers.POST /:id/materials', req);
  }
});

router.delete('/:id/materials/:material_id', authenticate, authorize(), async (req, res) => {
  try {
    const result = await auditedTransaction((q) => q('DELETE FROM supplier_materials WHERE supplier_id = $1 AND material_id = $2 RETURNING id', [req.params.id, req.params.material_id]), (r) => r.rows[0] && ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'delete', module: 'suppliers', description: `Unlinked material #${req.params.material_id} from supplier #${req.params.id}`, entityId: req.params.id, entityType: 'supplier_material' }));
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Link not found' });
    res.json({ success: true, message: 'Material unlinked' });
  } catch (error) {
    routeFail(res, error, 'suppliers.DELETE /:id/materials/:material_id', req);
  }
});

module.exports = router;
