const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

// Maintenance Reminders (linked to assets)
router.get('/', authenticate, authorize(), async (req, res) => {
  try {
    const { asset_id, status, limit = 100 } = req.query;
    let conds = []; let p = []; let i = 1;
    if (asset_id) { conds.push(`asset_id = $${i++}`); p.push(parseInt(asset_id)); }
    if (status) { conds.push(`status = $${i++}`); p.push(status); }
    const w = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const data = await query(`SELECT mr.*, a.code as asset_code, a.name_en as asset_name FROM maintenance_reminders mr LEFT JOIN assets a ON mr.asset_id = a.id ${w} ORDER BY scheduled_date DESC LIMIT $${i++}`, [...p, parseInt(limit)]);
    res.json({ success: true, data: data.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const r = await query('SELECT mr.*, a.code as asset_code FROM maintenance_reminders mr LEFT JOIN assets a ON mr.asset_id = a.id WHERE mr.id = $1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Reminder not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      asset_id: Joi.number().integer().required(), title: Joi.string().required(),
      description: Joi.string().allow(''), maintenance_type: Joi.string(),
      priority: Joi.string(), scheduled_date: Joi.date().iso().required(),
      next_due_date: Joi.date().iso(), interval_value: Joi.number(),
      interval_unit: Joi.string(), estimated_hours: Joi.number(),
      estimated_cost: Joi.number(), assigned_tech: Joi.string().allow(''),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const r = await query(
      `INSERT INTO maintenance_reminders (asset_id, title, description, maintenance_type, priority, scheduled_date, next_due_date, interval_value, interval_unit, estimated_hours, estimated_cost, assigned_tech) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [value.asset_id, value.title, value.description, value.maintenance_type, value.priority, value.scheduled_date, value.next_due_date, value.interval_value, value.interval_unit, value.estimated_hours, value.estimated_cost, value.assigned_tech]
    );

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'maintenance', description: `Scheduled maintenance for equipment #${value.asset_id}`, entityId: r.rows[0].id, entityType: 'maintenance_reminder' });
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const existing = await query('SELECT * FROM maintenance_reminders WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Reminder not found' });

    const schema = Joi.object({
      title: Joi.string(), description: Joi.string().allow(''), priority: Joi.string(),
      scheduled_date: Joi.date().iso(), next_due_date: Joi.date().iso(),
      estimated_hours: Joi.number(), estimated_cost: Joi.number(),
      assigned_tech: Joi.string().allow(''), status: Joi.string(),
      actual_hours: Joi.number(), actual_cost: Joi.number(),
      completion_date: Joi.date().iso().allow(null), completion_notes: Joi.string().allow(''),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const sets = []; const p = []; let i = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) { sets.push(`${k} = $${i++}`); p.push(v); }
    }
    p.push(req.params.id);
    const r = await query(`UPDATE maintenance_reminders SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`, p);

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'maintenance', description: `Updated maintenance reminder #${req.params.id}`, entityId: req.params.id, entityType: 'maintenance_reminder' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const r = await query('DELETE FROM maintenance_reminders WHERE id = $1 RETURNING id', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Reminder not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
