const { authorizedProjectId, authorizeProjectPayload } = require('../services/authorizedProject');
const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { queryPaginated } = require('../utils/pagination');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity, fireEvent } = require('../utils/activity');
const { auditedTransaction } = require('../utils/auditedTransaction');
const { auditedMutation } = require('../utils/auditedMutation');
const inventoryEngine = require('../services/inventoryEngine');
const { reasonFrom } = require('../utils/reason');
const { svcError } = require('../utils/serviceErrors');

const WO_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'];

router.get('/project/:projectId', authenticate, authorize(), async (req, res) => {
  try {
    const { status, phase_id } = req.query;
    let conds = ['wo.project_id = $1']; let p = [req.params.projectId]; let i = 2;
    if (status && WO_STATUSES.includes(status)) { conds.push(`wo.status = $${i++}`); p.push(status); }
    if (phase_id) { conds.push(`wo.phase_id = $${i++}`); p.push(parseInt(phase_id)); }

    const data = await queryPaginated(req, res, query, { sql: `SELECT wo.*, u.name as assigned_to_name,
              pp.name as phase_name, pp.name_ar as phase_name_ar, pp.name_en as phase_name_en, pp.code as phase_code,
              bs.name_ar as boq_section_name_ar, bs.name_en as boq_section_name_en, bs.code as boq_section_code
       FROM work_orders wo
       LEFT JOIN users u ON wo.assigned_to = u.id
       LEFT JOIN project_phases pp ON wo.phase_id = pp.id
       LEFT JOIN boq_sections bs ON wo.boq_section_id = bs.id
       WHERE ${conds.join(' AND ')} ORDER BY wo.created_at DESC`, params: p, orderBy: [{"column":"created_at","direction":"DESC"}] });
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
    authorizeProjectPayload(req, value);

    const r = await auditedTransaction((q) => q(
      `INSERT INTO work_orders (project_id, phase_id, boq_section_id, title, title_ar, title_en, description, planned_start_date, planned_end_date, assigned_to, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [authorizedProjectId(req, value), value.phase_id, value.boq_section_id, value.title_ar, value.title_ar, value.title_en || value.title_ar, value.description, value.planned_start_date, value.planned_end_date, value.assigned_to, value.notes]
    ), (result) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'work_orders', description: `Created WO: ${value.title_ar}`, entityId: result.rows[0].id, entityType: 'work_order' }));
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
    const out = await auditedMutation(req, { action: 'update', module: 'work_orders', entityType: 'work_order' }, async (q) => {
      const before = (await q('SELECT * FROM work_orders WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      if (!before) return { skipAudit: true };
      const r = await q(`UPDATE work_orders SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`, p);
      return { data: r.rows[0], entityId: before.id, projectId: before.project_id, before, after: r.rows[0], oldStatus: before.status, newStatus: r.rows[0].status, description: `Updated WO: ${before.title_ar || before.title}` };
    });
    if (!out.data) return res.status(404).json({ success: false, error: 'Work order not found' });
    res.json({ success: true, data: out.data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// A work order carries cost records (materials issued from stock, labor, equipment, completions), so it is
// cancelled, never deleted. The route keeps its verb for existing clients; the row and its children stay.
router.delete('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const reason = reasonFrom(req) || null;
    const r = await transaction(async (client) => {
      const q = client.query.bind(client);
      const updated = await q(
      `UPDATE work_orders SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $2, cancel_reason = $3, updated_at = NOW()
        WHERE id = $1 AND status <> 'cancelled' RETURNING title, title_ar`,
      [req.params.id, req.user.id, reason]);
      if (updated.rows[0]) await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'cancel', module: 'work_orders', description: `Cancelled WO: ${updated.rows[0].title_ar || updated.rows[0].title}${reason ? `: ${reason}` : ''}`, entityId: req.params.id, entityType: 'work_order' }, { query: q });
      return updated;
    });
    if (r.rows.length === 0) {
      const exists = await query('SELECT status FROM work_orders WHERE id = $1', [req.params.id]);
      if (exists.rows.length === 0) return res.status(404).json({ success: false, error: 'Work order not found' });
      return res.status(409).json({ success: false, error: 'Work order is already cancelled' });
    }

    res.json({ success: true, message: 'Work order cancelled' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Materials
router.get('/:id/materials', authenticate, authorize(), async (req, res) => {
  try {
    const wo = await query('SELECT id FROM work_orders WHERE id = $1', [req.params.id]);
    if (wo.rows.length === 0) return res.status(404).json({ success: false, error: 'Work order not found' });
    const r = await queryPaginated(req, res, query, { sql: 'SELECT wom.*, im.code as item_code, im.name_en, im.name_ar FROM work_order_materials wom LEFT JOIN item_master im ON wom.item_id = im.id WHERE wom.work_order_id = $1 ORDER BY wom.id', params: [req.params.id], orderBy: [{"column":"id","direction":"ASC"}] });
    res.json({ success: true, data: r.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/:id/materials', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      item_id: Joi.number().integer().required(), boq_item_id: Joi.number().integer().optional(),
      planned_quantity: Joi.number().min(0).default(0), actual_quantity: Joi.number().min(0).default(0),
      // Cost is derived from the stock ledger (weighted average) when material is issued; a client-supplied
      // unit_cost is ignored.
      unit_cost: Joi.any().strip(), warehouse_id: Joi.number().integer().optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    await auditedMutation(req, { action: 'issue_material', module: 'work_orders', entityType: 'work_order_material' }, async (txQuery) => {
      // Phase 10 — issuance is ledgered: the movement API deducts stock
      // (gated on available stock) instead of direct warehouse_stock mutation.
      if (value.warehouse_id && value.actual_quantity > 0) {
        const balances = await inventoryEngine.getBalances(txQuery, value.warehouse_id, value.item_id);
        if (balances.available < value.actual_quantity) {
          throw svcError(400, 'insufficient_stock', `Insufficient stock: ${balances.available} available, ${value.actual_quantity} requested`);
        }
      }

      const wom = await txQuery(
        `INSERT INTO work_order_materials (work_order_id, item_id, boq_item_id, planned_quantity, actual_quantity, unit_cost, total_cost, warehouse_id, issued_by)
         VALUES ($1,$2,$3,$4,$5,0,0,$6,$7) RETURNING id`,
        [req.params.id, value.item_id, value.boq_item_id, value.planned_quantity, value.actual_quantity, value.warehouse_id, req.user.id]
      );

      if (value.warehouse_id && value.actual_quantity > 0) {
        const issued = await inventoryEngine.createMovement(txQuery, {
          warehouse_id: value.warehouse_id,
          material_id: value.item_id,
          movement_type: 'issue',
          quantity: value.actual_quantity,
          reference_type: 'work_order_material',
          reference_id: wom.rows[0].id,
          created_by: req.user.id,
        });
        // The cost of what was issued is the ledger's weighted average, exactly as the database computed it.
        await txQuery(
          'UPDATE work_order_materials SET unit_cost = $1, total_cost = $2 WHERE id = $3',
          [issued.unit_cost == null ? 0 : issued.unit_cost, issued.total_cost == null ? 0 : issued.total_cost, wom.rows[0].id]
        );
      }
      const row = (await txQuery('SELECT * FROM work_order_materials WHERE id = $1', [wom.rows[0].id])).rows[0];
      return { data: row, entityId: row.id, after: row, amount: Number(row.total_cost), description: `Recorded material for WO #${req.params.id}: item ${value.item_id} qty ${value.actual_quantity}` };
    });

    res.status(201).json({ success: true, message: 'Material issued' });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Labor (planning only, no cost)
router.get('/:id/labor', authenticate, authorize(), async (req, res) => {
  try {
    const wo = await query('SELECT id FROM work_orders WHERE id = $1', [req.params.id]);
    if (wo.rows.length === 0) return res.status(404).json({ success: false, error: 'Work order not found' });
    const r = await queryPaginated(req, res, query, { sql: 'SELECT * FROM work_order_labor WHERE work_order_id = $1 ORDER BY work_date, id', params: [req.params.id], orderBy: [{"column":"work_date","direction":"ASC"},{"column":"id","direction":"ASC"}] });
    res.json({ success: true, data: r.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/:id/labor', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      skill_category: Joi.string().required(), worker_count: Joi.number().integer().min(1).default(1),
      hours: Joi.number().min(0).default(0), work_date: Joi.date().iso().required(),
      notes: Joi.string().allow(''),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const out = await auditedMutation(req, { action: 'create', module: 'work_orders', entityType: 'work_order_labor' }, async (q) => {
      const r = await q(
        `INSERT INTO work_order_labor (work_order_id, skill_category, worker_count, hours, work_date, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.params.id, value.skill_category, value.worker_count, value.hours, value.work_date, value.notes]
      );
      return { data: r.rows[0], entityId: r.rows[0].id, after: r.rows[0], description: `Recorded labor for WO #${req.params.id}: ${value.skill_category} x${value.worker_count}` };
    });
    res.status(201).json({ success: true, data: out.data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Equipment
router.get('/:id/equipment', authenticate, authorize(), async (req, res) => {
  try {
    const wo = await query('SELECT id FROM work_orders WHERE id = $1', [req.params.id]);
    if (wo.rows.length === 0) return res.status(404).json({ success: false, error: 'Work order not found' });
    const r = await queryPaginated(req, res, query, { sql: 'SELECT woe.*, a.code as equipment_code FROM work_order_equipment woe LEFT JOIN assets a ON woe.equipment_id = a.id WHERE woe.work_order_id = $1 ORDER BY woe.work_date, woe.id', params: [req.params.id], orderBy: [{"column":"work_date","direction":"ASC"},{"column":"id","direction":"ASC"}] });
    res.json({ success: true, data: r.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/:id/equipment', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      equipment_id: Joi.number().integer().required(), hours: Joi.number().min(0).default(0),
      hourly_cost: Joi.number().min(0).default(0), work_date: Joi.date().iso().required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const total_cost = value.hours * value.hourly_cost;
    const out = await auditedMutation(req, { action: 'create', module: 'work_orders', entityType: 'work_order_equipment' }, async (q) => {
      const r = await q(
        `INSERT INTO work_order_equipment (work_order_id, equipment_id, hours, hourly_cost, total_cost, work_date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.params.id, value.equipment_id, value.hours, value.hourly_cost, total_cost, value.work_date]
      );
      return { data: r.rows[0], entityId: r.rows[0].id, after: r.rows[0], amount: total_cost, description: `Recorded equipment for WO #${req.params.id}: asset ${value.equipment_id} ${value.hours}h` };
    });
    res.status(201).json({ success: true, data: out.data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Work Completions
router.get('/:id/completions', authenticate, authorize(), async (req, res) => {
  try {
    const wo = await query('SELECT id FROM work_orders WHERE id = $1', [req.params.id]);
    if (wo.rows.length === 0) return res.status(404).json({ success: false, error: 'Work order not found' });
    const r = await queryPaginated(req, res, query, { sql: 'SELECT wc.*, u.name as verified_name FROM work_completions wc LEFT JOIN users u ON wc.verified_by = u.id WHERE wc.work_order_id = $1 ORDER BY wc.completion_date, wc.id', params: [req.params.id], orderBy: [{"column":"completion_date","direction":"ASC"},{"column":"id","direction":"ASC"}] });
    res.json({ success: true, data: r.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/:id/completions', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      boq_item_id: Joi.number().integer().required(), quantity_completed: Joi.number().positive().required(),
      completion_date: Joi.date().iso().required(), notes: Joi.string().allow(''),
      project_location_id: Joi.number().integer().optional().allow(null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const wo = await query('SELECT project_id FROM work_orders WHERE id = $1', [req.params.id]);
    if (wo.rows.length === 0) return res.status(404).json({ success: false, error: 'Work order not found' });
    const projectId = wo.rows[0].project_id;

    const locationService = require('../services/locationService');

    // Both inserts below must land together — a completion row with no
    // matching measurement (or vice versa) would silently break the
    // quantity engine's "executed quantity enters the system ONLY as a
    // measurement" invariant (ground rule 2: transactional multi-record writes).
    const completionAudit = await auditedMutation(req, { action: 'create', module: 'work_orders', entityType: 'work_completion' }, async (txQuery) => {

      // work_completions.project_location_id is NOT NULL once the Phase 8
      // migration's backfill is verified (migrate-21), so a completion
      // posted without a location falls back to the project's "Unassigned"
      // location rather than failing at the DB with a NOT NULL violation.
      const locationId = value.project_location_id
        || await locationService.getOrCreateUnassignedLocation(txQuery, projectId);
      const alloc = await locationService.getOrCreateAllocation(txQuery, value.boq_item_id, locationId);
      const allocId = alloc.id;

      const r = await txQuery(
        `INSERT INTO work_completions (work_order_id, boq_item_id, quantity_completed, completion_date, notes, project_location_id, boq_location_allocation_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [req.params.id, value.boq_item_id, value.quantity_completed, value.completion_date, value.notes, locationId, allocId]
      );

      // Phase 8: executed quantity enters the system ONLY as a measurement.
      // The completion itself stays unverified until the WO verify step.
      const boqItem = await txQuery('SELECT unit FROM boq_items WHERE id = $1', [value.boq_item_id]);
      const unit = boqItem.rows[0] ? boqItem.rows[0].unit : null;
      await txQuery(
        `INSERT INTO quantity_measurements
           (project_id, project_location_id, boq_item_id, boq_location_allocation_id,
            measured_date, quantity, unit, source_type, source_id, measured_by, approval_state, photos)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'work_completion',$8,$9,'pending','[]')`,
        [projectId, locationId, value.boq_item_id, allocId, value.completion_date,
         value.quantity_completed, unit, r.rows[0].id, req.user.id]
      );

      return { data: r.rows[0], entityId: r.rows[0].id, projectId, after: r.rows[0], description: `Recorded completion for WO #${req.params.id}: BOQ item ${value.boq_item_id} qty ${value.quantity_completed}` };
    });

    res.status(201).json({ success: true, data: completionAudit.data });
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
        // Phase 8: executed quantity comes from quantity_measurements only.
        // Approve the completion's measurement, then recompute the derived
        // summaries FROM the measurements — the stored completed_quantity
        // column mirrors the derived value during the transition.
        const engine = require('../services/quantityEngine');
        await client.query(
          `UPDATE quantity_measurements SET approval_state = 'approved', reviewed_by = $1, updated_at = NOW()
           WHERE source_type = 'work_completion' AND source_id = $2`,
          [req.user.id, req.params.compId]
        );
        // Allocations, quantity-driven activities and the project's derived progress follow the approval.
        const woProject = (await client.query('SELECT project_id FROM work_orders WHERE id = $1', [comp.rows[0].work_order_id])).rows[0];
        await require('../services/progressEngine').onMeasurementsChanged(
          (q, p) => client.query(q, p), { boqItemId: comp.rows[0].boq_item_id, projectId: woProject.project_id }
        );

        // Job costing consumes this event: it is enqueued in THIS transaction, so it is delivered only after the
        // verification commits and is lost never (a failed enqueue rolls the verification back).
        await fireEvent({
          eventType: 'work_completion.verified',
          entityType: 'work_completion',
          entityId: req.params.compId,
          userId: req.user.id, userName: req.user.name, userRole: req.user.role,
          payload: { work_order_id: comp.rows[0].work_order_id, boq_item_id: comp.rows[0].boq_item_id, quantity: comp.rows[0].quantity_completed }
        }, { query: (text, params) => client.query(text, params) });
      }
      await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: status, module: 'work_orders', description: `${status === 'verified' ? 'Verified' : 'Rejected'} work completion #${req.params.compId}`, entityId: req.params.compId, entityType: 'work_completion' }, { query: (text, params) => client.query(text, params) });
    });
    res.json({ success: true, message: status === 'verified' ? 'Verified' : 'Rejected' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
