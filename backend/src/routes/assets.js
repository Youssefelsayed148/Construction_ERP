const { authorizedProjectId, authorizeProjectPayload } = require('../services/authorizedProject');
const express = require('express');
const { nextNumber } = require('../services/numbering');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { queryPaginated } = require('../utils/pagination');
const { authenticate, authorize } = require('../middleware/auth');
const { auditedTransaction } = require('../utils/auditedTransaction');
const { routeFail } = require('../utils/typedRoute');

const EQUIPMENT_TYPES = ['owned', 'rented'];
const EQUIPMENT_CATEGORIES = ['earthmoving', 'lifting', 'concrete', 'compaction', 'transport', 'generator', 'tool', 'pump', 'scaffolding', 'other'];

router.get('/categories', authenticate, authorize(), (req, res) => {
  res.json({ success: true, data: { types: EQUIPMENT_TYPES, categories: EQUIPMENT_CATEGORIES } });
});

router.get('/', authenticate, authorize(), async (req, res) => {
  try {
    const { category, equipment_type, status, search } = req.query;
    let conds = []; let params = []; let idx = 1;
    if (category && EQUIPMENT_CATEGORIES.includes(category)) { conds.push(`a.category = $${idx++}`); params.push(category); }
    if (equipment_type && EQUIPMENT_TYPES.includes(equipment_type)) { conds.push(`a.equipment_type = $${idx++}`); params.push(equipment_type); }
    if (status) { conds.push(`a.status = $${idx++}`); params.push(status); }
    if (search) { conds.push(`(a.code ILIKE $${idx} OR a.name_en ILIKE $${idx} OR a.name_ar ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const data = await queryPaginated(req, res, query, {
      sql: `SELECT a.*, p.name_ar as current_project_name_ar, p.name_en as current_project_name_en
       FROM assets a LEFT JOIN projects p ON a.current_project_id = p.id
       ${where}`,
      params,
      orderBy: [{ column: 'a.category' }, { column: 'a.code' }],
    });
    res.json({ success: true, data: data.rows });
  } catch (e) { routeFail(res, e, 'assets.GET /', req); }
});

router.get('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const result = await query(
      `SELECT a.*, p.name_ar as current_project_name_ar, p.name_en as current_project_name_en
       FROM assets a LEFT JOIN projects p ON a.current_project_id = p.id WHERE a.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Equipment not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (e) { routeFail(res, e, 'assets.GET /:id', req); }
});

router.post('/', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      code: Joi.string().optional(), name_ar: Joi.string().required(), name_en: Joi.string().allow(''),
      asset_type: Joi.string().optional(), category: Joi.string().valid(...EQUIPMENT_CATEGORIES).required(),
      equipment_type: Joi.string().valid(...EQUIPMENT_TYPES).required(),
      manufacturer: Joi.string().allow(''), model: Joi.string().allow(''),
      serial_number: Joi.string().allow(''), purchase_date: Joi.date().iso().allow(null),
      purchase_cost: Joi.number().min(0).default(0), hourly_rate: Joi.number().min(0).default(0),
      daily_rate: Joi.number().min(0).default(0), operator_required: Joi.boolean().default(false),
      current_project_id: Joi.number().integer().optional().allow(null), status: Joi.string().default('active'),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    authorizeProjectPayload(req, value);

    const result = await auditedTransaction(async (q) => {
      if (!value.code) value.code = await nextNumber(q, { table: 'assets', column: 'code', prefix: 'EQ', pad: 4 });
      return q(
        `INSERT INTO assets (code, name_ar, name_en, name, asset_type, category, equipment_type, manufacturer, model, serial_number, purchase_date, purchase_cost, hourly_rate, daily_rate, operator_required, current_project_id, status)
         VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
        [value.code, value.name_ar, value.name_en || value.name_ar, value.asset_type, value.category, value.equipment_type, value.manufacturer, value.model, value.serial_number, value.purchase_date, value.purchase_cost, value.hourly_rate, value.daily_rate, value.operator_required, value.current_project_id || null, value.status]
      );
    }, (r) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'assets', description: `Created equipment ${value.code}`, entityId: r.rows[0].id, entityType: 'asset' }));
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (e) { routeFail(res, e, 'assets.POST /', req); }
});

router.put('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const existing = await query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Equipment not found' });

    const schema = Joi.object({
      name_ar: Joi.string(), name_en: Joi.string().allow(''), category: Joi.string().valid(...EQUIPMENT_CATEGORIES),
      equipment_type: Joi.string().valid(...EQUIPMENT_TYPES), manufacturer: Joi.string().allow(''),
      model: Joi.string().allow(''), serial_number: Joi.string().allow(''),
      purchase_date: Joi.date().iso().allow(null), purchase_cost: Joi.number().min(0),
      hourly_rate: Joi.number().min(0), daily_rate: Joi.number().min(0),
      operator_required: Joi.boolean(), current_project_id: Joi.number().integer().allow(null),
      status: Joi.string(),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    authorizeProjectPayload(req, value);

    const sets = []; const params = []; let idx = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) { sets.push(`${k} = $${idx++}`); params.push(v); }
    }
    params.push(req.params.id);
    const result = await auditedTransaction((q) => q(`UPDATE assets SET ${sets.join(', ')}, name = COALESCE(name_en, name_ar), updated_at = NOW() WHERE id = $${idx} RETURNING *`, params), (r) => r.rows[0] && ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'assets', description: `Updated equipment ${existing.rows[0].code}`, entityId: req.params.id, entityType: 'asset' }));
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Equipment not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (e) { routeFail(res, e, 'assets.PUT /:id', req); }
});

router.delete('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const r = await auditedTransaction((q) => q('DELETE FROM assets WHERE id = $1 RETURNING code', [req.params.id]), (result) => result.rows[0] && ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'delete', module: 'assets', description: `Deleted equipment ${result.rows[0].code}`, entityId: req.params.id, entityType: 'asset' }));
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Equipment not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (e) { routeFail(res, e, 'assets.DELETE /:id', req); }
});

// -- Assignments --
router.get('/:id/assignments', authenticate, authorize(), async (req, res) => {
  try {
    const data = await queryPaginated(req, res, query, {
      sql: 'SELECT * FROM equipment_assignments WHERE equipment_id = $1', params: [req.params.id],
      orderBy: [{ column: 'assigned_from', direction: 'DESC' }],
    });
    res.json({ success: true, data: data.rows });
  } catch (e) { routeFail(res, e, 'assets.GET /:id/assignments', req); }
});

router.post('/:id/assignments', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(), assigned_from: Joi.date().iso().required(),
      assigned_to: Joi.date().iso().optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    authorizeProjectPayload(req, value);

    const r = await auditedTransaction((q) => q(
      `INSERT INTO equipment_assignments (equipment_id, project_id, assigned_from, assigned_to) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, authorizedProjectId(req, value), value.assigned_from, value.assigned_to || null]
    ), (result) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'assign', module: 'assets', description: `Assigned equipment #${req.params.id} to project #${authorizedProjectId(req, value)}`, entityId: result.rows[0].id, entityType: 'equipment_assignment' }));
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { routeFail(res, e, 'assets.POST /:id/assignments', req); }
});

// -- Usage Logs --
router.get('/:id/usage-logs', authenticate, authorize(), async (req, res) => {
  try {
    const data = await queryPaginated(req, res, query, {
      sql: 'SELECT * FROM equipment_usage_logs WHERE equipment_id = $1', params: [req.params.id],
      orderBy: [{ column: 'log_date', direction: 'DESC' }],
    });
    res.json({ success: true, data: data.rows });
  } catch (e) { routeFail(res, e, 'assets.GET /:id/usage-logs', req); }
});

router.post('/:id/usage-logs', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(), log_date: Joi.date().iso().required(),
      hours_operated: Joi.number().min(0).default(0), operator_id: Joi.number().integer().optional(),
      fuel_liters: Joi.number().min(0).default(0), notes: Joi.string().allow(''),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    authorizeProjectPayload(req, value);

    const r = await auditedTransaction((q) => q(
      `INSERT INTO equipment_usage_logs (equipment_id, project_id, log_date, hours_operated, operator_id, fuel_liters, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, authorizedProjectId(req, value), value.log_date, value.hours_operated, value.operator_id || null, value.fuel_liters, value.notes]
    ), (result) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'log_usage', module: 'assets', description: `Recorded equipment usage for #${req.params.id}`, entityId: result.rows[0].id, entityType: 'equipment_usage_log' }));
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { routeFail(res, e, 'assets.POST /:id/usage-logs', req); }
});

module.exports = router;
