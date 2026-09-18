const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

const CATEGORIES = ['raw_material', 'finished_material', 'equipment_rental', 'consumable', 'tool', 'safety', 'other'];
const SUB_CATEGORIES = {
  raw_material: ['aggregate', 'cement', 'steel', 'concrete_premix', 'brick_block', 'wood', 'piping', 'electrical', 'plumbing', 'insulation', 'paint_coating', 'glass', 'other'],
  finished_material: ['door', 'window', 'sanitary_fixture', 'lighting', 'tile_flooring', 'cabinetry', 'precast', 'other'],
  equipment_rental: ['earthmoving', 'lifting', 'concrete', 'compaction', 'generator', 'scaffolding', 'other'],
  consumable: ['fuel', 'lubricant', 'fastener', 'adhesive_sealant', 'protective_gear', 'cleaning', 'other'],
  tool: ['hand_tool', 'power_tool', 'measuring', 'welding', 'cutting', 'other'],
  safety: ['ppe', 'signage', 'barricade', 'fire_safety', 'first_aid', 'other'],
  other: ['other'],
};
const VALID_UNITS = ['ton', 'm3', 'm2', 'piece', 'linear_m', 'bag', 'liter', 'set', 'lot'];
const REORDER_POLICIES = ['none', 'reorder_point', 'min_max', 'periodic'];

// Phase 9 — planning fields shared by create/update (all optional).
const PLANNING_FIELDS = {
  base_unit: Joi.string().allow('', null),
  purchase_unit: Joi.string().allow('', null),
  issue_unit: Joi.string().allow('', null),
  unit_conversions: Joi.array().items(Joi.object({
    from_unit: Joi.string().required(),
    to_unit: Joi.string().required(),
    factor: Joi.number().positive().required(),
  })).default([]),
  preferred_supplier_ids: Joi.array().items(Joi.number().integer()).default([]),
  min_stock: Joi.number().min(0),
  max_stock: Joi.number().min(0),
  safety_stock: Joi.number().min(0),
  supplier_lead_time_days: Joi.number().integer().min(0),
  reorder_policy: Joi.string().valid(...REORDER_POLICIES),
  reorder_point: Joi.number().min(0),
  order_multiple: Joi.number().min(0),
  moq: Joi.number().min(0),
  shelf_life_days: Joi.number().integer().min(0).allow(null),
  batch_lot_tracking: Joi.boolean(),
  inspection_required: Joi.boolean(),
};

router.get('/categories', authenticate, authorize(), (req, res) => {
  res.json({ success: true, data: { categories: CATEGORIES, sub_categories: SUB_CATEGORIES, units: VALID_UNITS } });
});

router.get('/', authenticate, authorize(), async (req, res) => {
  try {
    const { category, sub_category, search, is_active, limit = 100, offset = 0 } = req.query;
    let conditions = [];
    let params = [];
    let idx = 1;

    if (category && CATEGORIES.includes(category)) {
      conditions.push(`category = $${idx++}`);
      params.push(category);
    }
    if (sub_category) {
      conditions.push(`sub_category = $${idx++}`);
      params.push(sub_category);
    }
    if (is_active !== undefined) {
      conditions.push(`is_active = $${idx++}`);
      params.push(is_active === 'true');
    }
    if (search) {
      conditions.push(`(code ILIKE $${idx} OR name_en ILIKE $${idx} OR name_ar ILIKE $${idx} OR description ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(parseInt(limit), parseInt(offset));

    const [dataResult, countResult] = await Promise.all([
      query(`SELECT * FROM item_master ${where} ORDER BY category, sub_category, code LIMIT $${idx++} OFFSET $${idx}`, params),
      query(`SELECT COUNT(*) as total FROM item_master ${where.replace(/\$\d+/g, (m) => `$${parseInt(m.slice(1)) - 2}`)}`, params.slice(0, -2))
    ]);

    res.json({ success: true, data: dataResult.rows, meta: { total: parseInt(countResult.rows[0].total), limit: parseInt(limit), offset: parseInt(offset) } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const result = await query('SELECT * FROM item_master WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Item not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id/suppliers', authenticate, authorize(), async (req, res) => {
  try {
    const data = await query(
      `SELECT sm.*, s.code as supplier_code, s.name_ar as supplier_name_ar, s.name_en as supplier_name_en
       FROM supplier_materials sm
       JOIN suppliers s ON sm.supplier_id = s.id
       WHERE sm.material_id = $1
       ORDER BY s.name_en`,
      [req.params.id]
    );
    res.json({ success: true, data: data.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      code: Joi.string().optional(),
      category: Joi.string().valid(...CATEGORIES).required(),
      sub_category: Joi.string().optional(),
      unit: Joi.string().valid(...VALID_UNITS).default('piece'),
      name_en: Joi.string().required(),
      name_ar: Joi.string().required(),
      description: Joi.string().allow(''),
      is_active: Joi.boolean().default(true),
      ...PLANNING_FIELDS,
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    if (!value.code) {
      const count = await query("SELECT COUNT(*) as cnt FROM item_master WHERE code LIKE 'MAT-%'");
      value.code = `MAT-${String(parseInt(count.rows[0].cnt) + 1).padStart(4, '0')}`;
    }

    const existing = await query('SELECT id FROM item_master WHERE code = $1', [value.code]);
    if (existing.rows.length > 0) return res.status(400).json({ success: false, error: 'Code already exists' });

    const result = await query(
      `INSERT INTO item_master (code, category, sub_category, unit, name_en, name_ar, description, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [value.code, value.category, value.sub_category, value.unit, value.name_en, value.name_ar, value.description, value.is_active]
    );

    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'create', module: 'items',
      description: `Created item ${value.code} - ${value.name_en}`,
      entityId: result.rows[0].id, entityType: 'item'
    });

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const existing = await query('SELECT * FROM item_master WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Item not found' });

    const schema = Joi.object({
      code: Joi.string(),
      category: Joi.string().valid(...CATEGORIES),
      sub_category: Joi.string().allow(''),
      unit: Joi.string().valid(...VALID_UNITS),
      name_en: Joi.string(),
      name_ar: Joi.string(),
      description: Joi.string().allow(''),
      is_active: Joi.boolean(),
      ...PLANNING_FIELDS,
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    if (value.code && value.code !== existing.rows[0].code) {
      const dup = await query('SELECT id FROM item_master WHERE code = $1 AND id != $2', [value.code, req.params.id]);
      if (dup.rows.length > 0) return res.status(400).json({ success: false, error: 'Code already exists' });
    }

    const sets = [];
    const params = [];
    let idx = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) { sets.push(`${k} = $${idx++}`); params.push(v); }
    }
    if (sets.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

    params.push(req.params.id);
    const result = await query(
      `UPDATE item_master SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'update', module: 'items',
      description: `Updated item ${result.rows[0].code}`,
      entityId: req.params.id, entityType: 'item'
    });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const result = await query('DELETE FROM item_master WHERE id = $1 RETURNING code, name_en', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Item not found' });

    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'delete', module: 'items',
      description: `Deleted item ${result.rows[0].code}`,
      entityId: req.params.id, entityType: 'item'
    });

    res.json({ success: true, message: 'Item deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
