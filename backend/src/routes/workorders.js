const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity, fireEvent } = require('../utils/activity');

const WO_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'];

router.get('/project/:projectId', authenticate, authorize(), async (req, res) => {
  try {
    const { status, phase_id } = req.query;
    let conds = ['wo.project_id = $1']; let p = [req.params.projectId]; let i = 2;
    if (status && WO_STATUSES.includes(status)) { conds.push(`wo.status = $${i++}`); p.push(status); }
    if (phase_id) { conds.push(`wo.phase_id = $${i++}`); p.push(parseInt(phase_id)); }

    const data = await query(
      `SELECT wo.*, u.name as assigned_to_name,
              pp.name as phase_name, pp.name_ar as phase_name_ar, pp.name_en as phase_name_en, pp.code as phase_code,
              bs.name_ar as boq_section_name_ar, bs.name_en as boq_section_name_en, bs.code as boq_section_code
       FROM work_orders wo
       LEFT JOIN users u ON wo.assigned_to = u.id
       LEFT JOIN project_phases pp ON wo.phase_id = pp.id
       LEFT JOIN boq_sections bs ON wo.boq_section_id = bs.id
       WHERE ${conds.join(' AND ')} ORDER BY wo.created_at DESC`,
      p
    );
    res.json({ success: true, data: data.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const wo = await query('SELECT wo.*, u.name as assigned_to_name FROM work_orders wo LEFT JOIN users u ON wo.assigned_to = u.id WHERE wo.id = $1', [req.params.id]);
    if (wo.rows.length === 0) return res.status(404).json({ success: false, error: 'Work order not found' });

    const [materials, labor, equipment, completions] = await Promise.all([
      query('SELECT wom.*, im.code as item_code, im.name_en, im.name_ar FROM work_order_materials wom LEFT JOIN item_master im ON wom.item_id = im.id WHERE wom.work_order_id = $1', [req.params.id]),
      query('SELECT * FROM work_order_labor WHERE work_order_id = $1', [req.params.id]),
      query('SELECT woe.*, a.code as equipment_code FROM work_order_equipment woe LEFT JOIN assets a ON woe.equipment_id = a.id WHERE woe.work_order_id = $1', [req.params.id]),
      query('SELECT wc.*, u.name as verified_name FROM work_completions wc LEFT JOIN users u ON wc.verified_by = u.id WHERE wc.work_order_id = $1', [req.params.id]),
    ]);

    res.json({ success: true, data: { ...wo.rows[0], materials: materials.rows, labor: labor.rows, equipment: equipment.rows, completions: completions.rows } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(), phase_id: Joi.number().integer().optional().allow(null),
      boq_section_id: Joi.number().integer().optional().allow(null),
      title_ar: Joi.string().required(), title_en: Joi.string().allow(''),
      description: Joi.string().allow(''), planned_start_date: Joi.date().iso().allow(null),
      planned_end_date: Joi.date().iso().allow(null), assigned_to: Joi.number().integer().allow(null),
      notes: Joi.string().allow(''),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const r = await query(
      `INSERT INTO work_orders (project_id, phase_id, boq_section_id, title, title_ar, title_en, description, planned_start_date, planned_end_date, assigned_to, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [value.project_id, value.phase_id, value.boq_section_id, value.title_ar, value.title_ar, value.title_en || value.title_ar, value.description, value.planned_start_date, value.planned_end_date, value.assigned_to, value.notes]
    );

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'work_orders', description: `Created WO: ${value.title_ar}`, entityId: r.rows[0].id, entityType: 'work_order' });
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      title_ar: Joi.string(), title_en: Joi.string().allow(''), description: Joi.string().allow(''),
      phase_id: Joi.number().integer().allow(null), boq_section_id: Joi.number().integer().allow(null),
      status: Joi.string().valid(...WO_STATUSES), planned_start_date: Joi.date().iso().allow(null),
      planned_end_date: Joi.date().iso().allow(null), actual_start_date: Joi.date().iso().allow(null),
      actual_end_date: Joi.date().iso().allow(null), assigned_to: Joi.number().integer().allow(null),
      completion_percentage: Joi.number().min(0).max(100), notes: Joi.string().allow(''),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const sets = []; const p = []; let i = 1;
    for (const [k, v] of Object.entries(value)) { if (v !== undefined) { sets.push(`${k} = $${i++}`); p.push(v); } }
    p.push(req.params.id);
    const r = await query(`UPDATE work_orders SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`, p);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Work order not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const existing = await query('SELECT * FROM work_orders WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Work order not found' });

    await query('DELETE FROM work_orders WHERE id = $1', [req.params.id]);

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'delete', module: 'work_orders', description: `Deleted WO: ${existing.rows[0].title_ar}`, entityId: req.params.id, entityType: 'work_order' });
    res.json({ success: true, message: 'Work order deleted' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Materials
router.post('/:id/materials', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      item_id: Joi.number().integer().required(), boq_item_id: Joi.number().integer().optional(),
      planned_quantity: Joi.number().min(0).default(0), actual_quantity: Joi.number().min(0).default(0),
      unit_cost: Joi.number().min(0).default(0), warehouse_id: Joi.number().integer().optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const total_cost = value.actual_quantity * value.unit_cost;

    await transaction(async (client) => {
      // Deduct from warehouse stock
      if (value.warehouse_id && value.actual_quantity > 0) {
        const stock = await client.query('SELECT quantity FROM warehouse_stock WHERE warehouse_id = $1 AND item_id = $2', [value.warehouse_id, value.item_id]);
        const current = parseFloat(stock.rows[0]?.quantity || 0);
        if (current < value.actual_quantity) throw new Error(`Insufficient stock: ${current} available, ${value.actual_quantity} requested`);
        await client.query('UPDATE warehouse_stock SET quantity = quantity - $1 WHERE warehouse_id = $2 AND item_id = $3', [value.actual_quantity, value.warehouse_id, value.item_id]);
      }

      await client.query(
        `INSERT INTO work_order_materials (work_order_id, item_id, boq_item_id, planned_quantity, actual_quantity, unit_cost, total_cost, warehouse_id, issued_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [req.params.id, value.item_id, value.boq_item_id, value.planned_quantity, value.actual_quantity, value.unit_cost, total_cost, value.warehouse_id, req.user.id]
      );
    });

    res.status(201).json({ success: true, message: 'Material issued' });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Labor (planning only, no cost)
router.post('/:id/labor', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      skill_category: Joi.string().required(), worker_count: Joi.number().integer().min(1).default(1),
      hours: Joi.number().min(0).default(0), work_date: Joi.date().iso().required(),
      notes: Joi.string().allow(''),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const r = await query(
      `INSERT INTO work_order_labor (work_order_id, skill_category, worker_count, hours, work_date, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, value.skill_category, value.worker_count, value.hours, value.work_date, value.notes]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Equipment
router.post('/:id/equipment', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      equipment_id: Joi.number().integer().required(), hours: Joi.number().min(0).default(0),
      hourly_cost: Joi.number().min(0).default(0), work_date: Joi.date().iso().required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const total_cost = value.hours * value.hourly_cost;
    const r = await query(
      `INSERT INTO work_order_equipment (work_order_id, equipment_id, hours, hourly_cost, total_cost, work_date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, value.equipment_id, value.hours, value.hourly_cost, total_cost, value.work_date]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Work Completions
router.post('/:id/completions', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      boq_item_id: Joi.number().integer().required(), quantity_completed: Joi.number().positive().required(),
      completion_date: Joi.date().iso().required(), notes: Joi.string().allow(''),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const r = await query(
      `INSERT INTO work_completions (work_order_id, boq_item_id, quantity_completed, completion_date, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, value.boq_item_id, value.quantity_completed, value.completion_date, value.notes]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:woId/completions/:compId/verify', authenticate, authorize(), async (req, res) => {
  try {
    const comp = await query('SELECT * FROM work_completions WHERE id = $1', [req.params.compId]);
    if (comp.rows.length === 0) return res.status(404).json({ success: false, error: 'Completion not found' });

    const { status } = req.body;
    if (!['verified', 'rejected'].includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });

    await transaction(async (client) => {
      const updated = await client.query(
        `UPDATE work_completions SET status = $1, verified_by = $2, verified_at = NOW(), updated_at = NOW() WHERE id = $3 RETURNING *`,
        [status, req.user.id, req.params.compId]
      );

      if (status === 'verified') {
        await client.query(
          `UPDATE boq_items SET completed_quantity = completed_quantity + $1, updated_at = NOW() WHERE id = $2`,
          [parseFloat(comp.rows[0].quantity_completed), comp.rows[0].boq_item_id]
        );

        // Fire event for job costing
        fireEvent({
          eventType: 'work_completion.verified',
          entityType: 'work_completion',
          entityId: req.params.compId,
          userId: req.user.id, userName: req.user.name, userRole: req.user.role,
          payload: { work_order_id: comp.rows[0].work_order_id, boq_item_id: comp.rows[0].boq_item_id, quantity: comp.rows[0].quantity_completed }
        }).catch(() => {});
      }
    });

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: status, module: 'work_orders', description: `${status === 'verified' ? 'Verified' : 'Rejected'} work completion #${req.params.compId}`, entityId: req.params.compId, entityType: 'work_completion' });
    res.json({ success: true, message: status === 'verified' ? 'Verified' : 'Rejected' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
