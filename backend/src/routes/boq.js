const express = require('express');
const { nextNumber } = require('../services/numbering');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { isReferenceViolation, recordInUse } = require('../utils/references');

const BOQ_ITEM_TYPES = ['material', 'labor', 'equipment', 'subcontract'];

router.get('/sections/:projectId', authenticate, authorize(), async (req, res) => {
  try {
    const sections = await query('SELECT * FROM boq_sections WHERE project_id = $1 ORDER BY parent_id NULLS FIRST, sort_order', [req.params.projectId]);
    res.json({ success: true, data: sections.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/sections', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(), code: Joi.string().optional(),
      name_ar: Joi.string().required(), name_en: Joi.string().allow(''),
      parent_id: Joi.number().integer().optional().allow(null), sort_order: Joi.number().integer().default(0),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    if (!value.code) value.code = await nextNumber(query, { table: 'boq_sections', column: 'code', prefix: 'SEC', pad: 3, where: { project_id: value.project_id } });

    const r = await query(
      `INSERT INTO boq_sections (project_id, code, name, name_ar, name_en, parent_id, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [value.project_id, value.code, value.name_ar, value.name_ar, value.name_en || value.name_ar, value.parent_id, value.sort_order]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/sections/:id', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ name_ar: Joi.string(), name_en: Joi.string().allow(''), sort_order: Joi.number(), parent_id: Joi.number().integer().optional().allow(null) }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const sets = []; const p = []; let i = 1;
    for (const [k, v] of Object.entries(value)) { if (v !== undefined) { sets.push(`${k} = $${i++}`); p.push(v); } }
    p.push(req.params.id);
    const r = await query(`UPDATE boq_sections SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, p);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Section not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Contractual rows: a section or item that anything references (items, measurements, allocations, recipes)
// cannot be removed; the foreign keys are RESTRICT. Only an unreferenced entry made by mistake can go.
router.delete('/sections/:id', authenticate, authorize(), async (req, res) => {
  try {
    const r = await query('DELETE FROM boq_sections WHERE id = $1 RETURNING id', [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ success: false, error: 'Section not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (e) {
    if (isReferenceViolation(e)) return recordInUse(res, 'BOQ section');
    res.status(500).json({ success: false, error: e.message });
  }
});

// BOQ Items
router.get('/items/:projectId', authenticate, authorize(), async (req, res) => {
  try {
    const { section_id, type } = req.query;
    let conds = ['bi.project_id = $1']; let p = [req.params.projectId]; let i = 2;
    if (section_id) { conds.push(`bi.section_id = $${i++}`); p.push(parseInt(section_id)); }
    if (type && BOQ_ITEM_TYPES.includes(type)) { conds.push(`bi.type = $${i++}`); p.push(type); }

    // Phase 8: completed_quantity is derived — summed from approved/certified
    // quantity_measurements (via the item's location allocations). The stored
    // column stays readable during the transition, sourced from this same
    // calculation; the read exposes both so the frontend can switch cleanly.
    const data = await query(
      `SELECT bi.*, bs.name as section_name, im.name_en as material_name_en, im.name_ar as material_name_ar,
              COALESCE(qm.executed, 0) as completed_quantity_derived,
              CASE WHEN bi.quantity > 0 THEN LEAST(COALESCE(qm.executed, 0) / bi.quantity * 100, 100) ELSE 0 END as completion_percentage_derived
       FROM boq_items bi
       LEFT JOIN boq_sections bs ON bi.section_id = bs.id
       LEFT JOIN item_master im ON bi.item_master_id = im.id
       LEFT JOIN (
         SELECT boq_item_id, SUM(quantity) AS executed
         FROM quantity_measurements WHERE approval_state IN ('approved','certified')
         GROUP BY boq_item_id
       ) qm ON qm.boq_item_id = bi.id
       WHERE ${conds.join(' AND ')} ORDER BY bs.sort_order, bi.code`,
      p
    );
    res.json({ success: true, data: data.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/items', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(), section_id: Joi.number().integer().required(),
      code: Joi.string().optional(), description_ar: Joi.string().required(), description_en: Joi.string().allow(''),
      unit: Joi.string().default('m2'), quantity: Joi.number().min(0).default(0),
      unit_rate: Joi.number().min(0).default(0),
      item_master_id: Joi.number().integer().optional().allow(null),
      type: Joi.string().valid(...BOQ_ITEM_TYPES).default('material'),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    if (!value.code) value.code = await nextNumber(query, { table: 'boq_items', column: 'code', prefix: 'BOQ', pad: 4, where: { project_id: value.project_id } });

    const r = await query(
      `INSERT INTO boq_items (project_id, section_id, code, description, description_ar, description_en, unit, quantity, unit_rate, item_master_id, type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [value.project_id, value.section_id, value.code, value.description_ar, value.description_ar, value.description_en || value.description_ar, value.unit, value.quantity, value.unit_rate, value.item_master_id, value.type]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/items/:id', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ description_ar: Joi.string(), description_en: Joi.string().allow(''), unit: Joi.string(), quantity: Joi.number().min(0), unit_rate: Joi.number().min(0), item_master_id: Joi.number().integer().optional().allow(null), type: Joi.string().valid(...BOQ_ITEM_TYPES) }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const sets = []; const p = []; let i = 1;
    for (const [k, v] of Object.entries(value)) { if (v !== undefined) { sets.push(`${k} = $${i++}`); p.push(v); } }
    p.push(req.params.id);
    const r = await query(`UPDATE boq_items SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`, p);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'BOQ item not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/items/:id', authenticate, authorize(), async (req, res) => {
  try {
    const r = await query('DELETE FROM boq_items WHERE id = $1 RETURNING id', [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ success: false, error: 'Item not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (e) {
    if (isReferenceViolation(e)) return recordInUse(res, 'BOQ item');
    res.status(500).json({ success: false, error: e.message });
  }
});

// BOQ Summary
router.get('/summary/:projectId', authenticate, authorize(), async (req, res) => {
  try {
    const summary = await query(
      `SELECT type, COUNT(*) as item_count, SUM(total_price) as total_value, SUM(quantity) as total_qty FROM boq_items WHERE project_id = $1 GROUP BY type`,
      [req.params.projectId]
    );
    const grandTotal = summary.rows.reduce((s, r) => s + parseFloat(r.total_value || 0), 0);
    res.json({ success: true, data: { by_type: summary.rows, grand_total: grandTotal } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
