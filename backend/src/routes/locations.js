const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity, fireEvent } = require('../utils/activity');

// Full CRUD over the project location tree: site/building/zone/floor/area/
// room — the allowed type set comes from location_types (seeded per the
// catalog) and project templates shape which nodes a project gets (Phase 5
// template_locations); this CRUD covers manual day-1 and later edits.

const ALLOWED_TYPE_CODES = ['site', 'zone', 'building', 'floor', 'area', 'room', 'block', 'wing'];

async function typeIdForCode(code) {
  const r = await query('SELECT id FROM location_types WHERE code = $1', [code]);
  return r.rows[0] ? r.rows[0].id : null;
}

// GET /api/locations/project/:projectId — flat tree with resolved type codes.
router.get('/project/:projectId', authenticate, authorize(), async (req, res) => {
  try {
    const r = await query(
      `SELECT pl.*, lt.code AS location_type_code, lt.name AS location_type_name
       FROM project_locations pl
       LEFT JOIN location_types lt ON lt.id = pl.location_type_id
       WHERE pl.project_id = $1
       ORDER BY pl.sort_order, pl.id`,
      [req.params.projectId]
    );
    res.json({ success: true, data: r.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/locations/:id — one node with its direct children.
router.get('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const r = await query(
      `SELECT pl.*, lt.code AS location_type_code, lt.name AS location_type_name
       FROM project_locations pl
       LEFT JOIN location_types lt ON lt.id = pl.location_type_id
       WHERE pl.id = $1`,
      [req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Location not found' });
    const children = await query(
      `SELECT pl.*, lt.code AS location_type_code, lt.name AS location_type_name
       FROM project_locations pl
       LEFT JOIN location_types lt ON lt.id = pl.location_type_id
       WHERE pl.parent_id = $1 ORDER BY pl.sort_order, pl.id`,
      [req.params.id]
    );
    res.json({ success: true, data: { ...r.rows[0], children: children.rows } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/locations — create a node (parent resolved from parent_id or
// parent_code for template-driven callers).
router.post('/', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      parent_id: Joi.number().integer().optional().allow(null),
      parent_code: Joi.string().optional(),
      location_type_code: Joi.string().valid(...ALLOWED_TYPE_CODES).required(),
      code: Joi.string().required(),
      name: Joi.string().required(),
      name_en: Joi.string().allow(''),
      name_ar: Joi.string().allow(''),
      sort_order: Joi.number().integer().default(0),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    let parentId = value.parent_id ?? null;
    if (value.parent_code && parentId == null) {
      const parent = await query(
        'SELECT id FROM project_locations WHERE project_id = $1 AND code = $2 LIMIT 1',
        [value.project_id, value.parent_code]
      );
      if (parent.rows[0]) parentId = parent.rows[0].id;
    }
    const typeId = await typeIdForCode(value.location_type_code);
    if (typeId == null) return res.status(400).json({ success: false, error: `Unknown location type: ${value.location_type_code}` });

    const r = await query(
      `INSERT INTO project_locations (project_id, parent_id, location_type_id, code, name, name_en, name_ar, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [value.project_id, parentId, typeId, value.code, value.name, value.name_en || value.name, value.name_ar || value.name_en || value.name, value.sort_order]
    );

    fireEvent({
      eventType: 'location.created', entityType: 'project_location', entityId: r.rows[0].id,
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      payload: { project_id: value.project_id, location_type_code: value.location_type_code },
    }).catch(() => {});

    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) {
    if (e.message && e.message.includes('unique')) return res.status(409).json({ success: false, error: 'A location with this code already exists at that level' });
    res.status(500).json({ success: false, error: e.message });
  }
});

// PUT /api/locations/:id
router.put('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      code: Joi.string(), name: Joi.string(), name_en: Joi.string().allow(''),
      name_ar: Joi.string().allow(''), sort_order: Joi.number().integer(),
      parent_id: Joi.number().integer().optional().allow(null),
      location_type_code: Joi.string().valid(...ALLOWED_TYPE_CODES),
      is_active: Joi.boolean(),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    if (value.location_type_code) {
      const typeId = await typeIdForCode(value.location_type_code);
      delete value.location_type_code;
      if (typeId != null) value.location_type_id = typeId;
    }

    const sets = []; const p = []; let i = 1;
    for (const [k, v] of Object.entries(value)) { if (v !== undefined) { sets.push(`${k} = $${i++}`); p.push(v); } }
    p.push(req.params.id);
    const r = await query(`UPDATE project_locations SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, p);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Location not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// DELETE /api/locations/:id — refuses when children exist (real rows, not counts).
router.delete('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const children = await query('SELECT COUNT(*) AS c FROM project_locations WHERE parent_id = $1', [req.params.id]);
    if (Number(children.rows[0]?.c) > 0) {
      return res.status(409).json({ success: false, error: 'Location has child locations — delete or move them first' });
    }
    const r = await query('DELETE FROM project_locations WHERE id = $1 RETURNING id', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Location not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
