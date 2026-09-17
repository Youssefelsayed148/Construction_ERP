const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const engine = require('../services/quantityEngine');

// Phase 8 — quantity surface. Executed quantity is NEVER edited on a summary
// row: it only enters the system as a quantity_measurements row. Allocation
// summaries and boq_items.completed_quantity are recomputed from measurements
// by the engine after every mutation.

const MEASUREMENT_SOURCES = ['work_completion', 'daily_report', 'manual', 'import'];
const APPROVAL_STATES = ['pending', 'approved', 'rejected', 'certified'];

function parseJson(v) {
  if (v == null) return [];
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return []; }
}

async function getOrCreateAllocation(q, boqItemId, locationId) {
  const existing = (await q(
    'SELECT * FROM boq_location_allocations WHERE boq_item_id = $1 AND project_location_id = $2',
    [boqItemId, locationId]
  )).rows;
  if (existing[0]) return existing[0];
  const item = (await q('SELECT quantity, unit_rate FROM boq_items WHERE id = $1', [boqItemId])).rows[0] || {};
  const r = await q(
    `INSERT INTO boq_location_allocations (boq_item_id, project_location_id, planned_quantity, unit_cost)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [boqItemId, locationId, item.quantity ?? 0, item.unit_rate ?? 0]
  );
  return r.rows[0];
}

// ---------------------------------------------------------------------------
// Allocations — planned/approved_design quantities are PLANNED data (editable);
// executed/consultant_approved/certified are derived (read-only here).
// ---------------------------------------------------------------------------

// GET /api/quantities/allocations/:boqItemId — allocations with derived values.
router.get('/allocations/:boqItemId', authenticate, authorize(), async (req, res) => {
  try {
    const allocs = (await query(
      `SELECT a.*, pl.name AS location_name, pl.code AS location_code
       FROM boq_location_allocations a
       LEFT JOIN project_locations pl ON pl.id = a.project_location_id
       WHERE a.boq_item_id = $1 ORDER BY pl.sort_order, pl.id`,
      [req.params.boqItemId]
    )).rows;
    const measurements = (await query(
      'SELECT * FROM quantity_measurements WHERE boq_item_id = $1',
      [req.params.boqItemId]
    )).rows;
    const data = allocs.map((a) => {
      const mine = measurements.filter((m) => m.project_location_id === a.project_location_id);
      const sums = engine.sumMeasurements(mine);
      return {
        ...a,
        executed_derived: sums.executed,
        consultant_approved_derived: sums.consultant_approved,
        certified_derived: sums.certified,
        remaining_derived: engine.remainingQuantity(a.planned_quantity, sums.executed),
        physical_progress: engine.physicalProgress(sums.executed, a.planned_quantity),
        approved_progress: engine.approvedProgress(sums.consultant_approved, a.planned_quantity),
        certified_progress: engine.certifiedProgress(sums.certified, a.planned_quantity),
      };
    });
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/quantities/allocations — upsert an allocation's planned fields.
router.post('/allocations', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      boq_item_id: Joi.number().integer().required(),
      project_location_id: Joi.number().integer().required(),
      planned_quantity: Joi.number().min(0).default(0),
      approved_design_quantity: Joi.number().min(0).default(0),
      unit_cost: Joi.number().min(0).default(0),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const alloc = await getOrCreateAllocation(query, value.boq_item_id, value.project_location_id);
    const r = await query(
      `UPDATE boq_location_allocations
       SET planned_quantity = $1, approved_design_quantity = $2, unit_cost = $3, updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [value.planned_quantity, value.approved_design_quantity, value.unit_cost, alloc.id]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// PUT /api/quantities/allocations/:id — planned/design only; derived columns
// are explicitly rejected so a summary row can never be hand-edited.
router.put('/allocations/:id', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      planned_quantity: Joi.number().min(0),
      approved_design_quantity: Joi.number().min(0),
      unit_cost: Joi.number().min(0),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    for (const forbidden of ['executed_quantity', 'certified_quantity', 'consultant_approved_quantity']) {
      if (req.body[forbidden] !== undefined) {
        return res.status(400).json({ success: false, error: `${forbidden} is derived from quantity_measurements and cannot be edited directly` });
      }
    }
    const sets = []; const p = []; let i = 1;
    for (const [k, v] of Object.entries(value)) { if (v !== undefined) { sets.push(`${k} = $${i++}`); p.push(v); } }
    p.push(req.params.id);
    const r = await query(`UPDATE boq_location_allocations SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`, p);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Allocation not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ---------------------------------------------------------------------------
// Measurements — the single source of truth for executed quantity.
// ---------------------------------------------------------------------------

// GET /api/quantities/measurements?project_id=&location_id=&boq_item_id=
router.get('/measurements', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, location_id, boq_item_id, state } = req.query;
    let conds = []; const p = []; let i = 1;
    if (project_id) { conds.push(`project_id = $${i++}`); p.push(parseInt(project_id)); }
    if (location_id) { conds.push(`project_location_id = $${i++}`); p.push(parseInt(location_id)); }
    if (boq_item_id) { conds.push(`boq_item_id = $${i++}`); p.push(parseInt(boq_item_id)); }
    if (state && APPROVAL_STATES.includes(state)) { conds.push(`approval_state = $${i++}`); p.push(state); }
    const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
    const r = await query(
      `SELECT qm.*, pl.name AS location_name, pl.code AS location_code,
              bi.code AS boq_item_code, bi.description AS boq_item_description
       FROM quantity_measurements qm
       LEFT JOIN project_locations pl ON pl.id = qm.project_location_id
       LEFT JOIN boq_items bi ON bi.id = qm.boq_item_id
       ${where} ORDER BY qm.measured_date DESC, qm.id DESC LIMIT 500`,
      p
    );
    res.json({ success: true, data: r.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/quantities/measurements — insert ONLY. Executed roll-ups move.
router.post('/measurements', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      project_location_id: Joi.number().integer().required(),
      boq_item_id: Joi.number().integer().required(),
      work_package_id: Joi.number().integer().optional().allow(null),
      measured_date: Joi.date().iso().required(),
      quantity: Joi.number().min(0).required(),
      unit: Joi.string().optional(),
      source_type: Joi.string().valid(...MEASUREMENT_SOURCES).default('manual'),
      source_id: Joi.number().integer().optional().allow(null),
      photos: Joi.array().items(Joi.string()).default([]),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const alloc = await getOrCreateAllocation(query, value.boq_item_id, value.project_location_id);
    const r = await query(
      `INSERT INTO quantity_measurements
         (project_id, project_location_id, boq_item_id, boq_location_allocation_id, work_package_id,
          measured_date, quantity, unit, source_type, source_id, measured_by, approval_state, photos)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending',$12) RETURNING *`,
      [value.project_id, value.project_location_id, value.boq_item_id, alloc.id, value.work_package_id,
       value.measured_date, value.quantity, value.unit || null, value.source_type, value.source_id,
       req.user.id, JSON.stringify(value.photos || [])]
    );

    // Derive — never store a hand-edited executed quantity.
    await engine.syncAllocations(query, { boqItemId: value.boq_item_id });
    await engine.syncBoqItemCompletedQuantity(query, value.boq_item_id);

    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'create', module: 'quantities',
      description: `Measured ${value.quantity} on BOQ #${value.boq_item_id}`,
      entityId: r.rows[0].id, entityType: 'quantity_measurement',
    });
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/quantities/measurements/:id/review — approve/reject/certify.
router.post('/measurements/:id/review', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ state: Joi.string().valid(...APPROVAL_STATES).required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const existing = (await query('SELECT * FROM quantity_measurements WHERE id = $1', [req.params.id])).rows[0];
    if (!existing) return res.status(404).json({ success: false, error: 'Measurement not found' });

    const r = await query(
      `UPDATE quantity_measurements SET approval_state = $1, reviewed_by = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [value.state, req.user.id, req.params.id]
    );
    await engine.syncAllocations(query, { boqItemId: existing.boq_item_id });
    await engine.syncBoqItemCompletedQuantity(query, existing.boq_item_id);
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ---------------------------------------------------------------------------
// Progress roll-ups (floor / building / project reconcile via one code path)
// ---------------------------------------------------------------------------

// GET /api/quantities/progress/project/:projectId?weight_policy=
router.get('/progress/project/:projectId', authenticate, authorize(), async (req, res) => {
  try {
    const policy = req.query.weight_policy || 'boq_value';
    const data = await engine.projectProgress(query, parseInt(req.params.projectId, 10), policy);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/quantities/progress/location/:locationId
router.get('/progress/location/:locationId', authenticate, authorize(), async (req, res) => {
  try {
    const data = await engine.locationProgress(query, parseInt(req.params.locationId, 10));
    if (!data) return res.status(404).json({ success: false, error: 'Location not found' });
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ---------------------------------------------------------------------------
// Location dashboard — planned/executed/approved/remaining, activities,
// material readiness, documents, QHSE counters, photos, cost/budget. Sections
// appear only when the viewer's permission flags allow it.
// ---------------------------------------------------------------------------

const PRIVILEGED_ROLES = ['owner', 'admin'];

function canSee(user, flag) {
  if (!user) return false;
  if (PRIVILEGED_ROLES.includes(user.role)) return true;
  const perms = Array.isArray(user.module_permissions) ? user.module_permissions : [];
  return perms.includes(flag);
}

router.get('/locations/:locationId/dashboard', authenticate, authorize(), async (req, res) => {
  try {
    const locationId = parseInt(req.params.locationId, 10);
    const progress = await engine.locationProgress(query, locationId);
    if (!progress) return res.status(404).json({ success: false, error: 'Location not found' });
    const projectId = progress.location.project_id;
    const user = req.user;

    const safe = (promise) => promise.catch(() => ({ rows: [] }));

    // Active activities: work orders + completions touching this subtree is
    // future work (work orders are not location-scoped yet); surface the
    // project's active work orders plus completions measured here.
    const completions = await safe(query(
      `SELECT wc.*, bi.code AS boq_item_code, bi.description AS boq_item_description
       FROM quantity_measurements qm
       JOIN work_completions wc ON wc.id = qm.source_id AND qm.source_type = 'work_completion'
       LEFT JOIN boq_items bi ON bi.id = qm.boq_item_id
       WHERE qm.project_id = $1`,
      [projectId]
    ));

    const measurements = await safe(query(
      `SELECT * FROM quantity_measurements WHERE project_id = $1 AND project_location_id = $2 ORDER BY measured_date DESC LIMIT 20`,
      [projectId, locationId]
    ));

    const sections = {
      rollup: {
        planned_quantity: progress.planned_quantity,
        executed_quantity: progress.executed_quantity,
        consultant_approved_quantity: progress.consultant_approved_quantity,
        certified_quantity: progress.certified_quantity,
        remaining_quantity: progress.remaining_quantity,
        physical_progress: progress.physical_progress,
        approved_progress: progress.approved_progress,
        certified_progress: progress.certified_progress,
      },
      measurements: measurements.rows,
      completions: completions.rows.slice(0, 10),
    };

    // Permission-flagged sections. Everything below is best-effort: modules
    // that later phases build simply appear when their tables exist.
    if (canSee(user, 'documents')) {
      const docs = await safe(query(
        "SELECT COUNT(*) AS c FROM documents WHERE project_id = $1",
        [projectId]
      ));
      sections.documents = { count: Number(docs.rows[0]?.c || 0) };
    }
    if (canSee(user, 'qhse')) {
      const ncr = await safe(query(
        "SELECT COUNT(*) AS c FROM qhse_records WHERE project_id = $1 AND record_type = 'ncr'",
        [projectId]
      ));
      const obs = await safe(query(
        "SELECT COUNT(*) AS c FROM qhse_records WHERE project_id = $1 AND record_type = 'observation'",
        [projectId]
      ));
      sections.qhse = { ncr: Number(ncr.rows[0]?.c || 0), observations: Number(obs.rows[0]?.c || 0) };
    }
    if (canSee(user, 'costing')) {
      const costs = await safe(query(
        "SELECT COALESCE(SUM(amount), 0) AS spent FROM project_costs WHERE project_id = $1",
        [projectId]
      ));
      const proj = await safe(query(
        'SELECT budget, contract_value FROM projects WHERE id = $1',
        [projectId]
      ));
      sections.cost = {
        spent: Number(costs.rows[0]?.spent || 0),
        budget: Number(proj.rows[0]?.budget || 0),
        contract_value: Number(proj.rows[0]?.contract_value || 0),
      };
    }
    if (canSee(user, 'hr')) {
      const labor = await safe(query(
        `SELECT COALESCE(SUM(lp.total_amount), 0) AS total, COALESCE(SUM(lp.days_worked), 0) AS days
         FROM labor_payments lp JOIN work_orders wo ON lp.work_order_id = wo.id
         WHERE wo.project_id = $1`,
        [projectId]
      ));
      sections.labour = {
        total_paid: Number(labor.rows[0]?.total || 0),
        man_days: Number(labor.rows[0]?.days || 0),
      };
    }

    res.json({ success: true, data: sections });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
