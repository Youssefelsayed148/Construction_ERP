// Phase 22 — planning / scheduling routes (mounted at /api/schedule).
//
// Activities, relationships, calendars, baselines, the CPM views (Gantt,
// lookahead, delayed, critical, location, subcontractor), SV%/SPI/CPI,
// quantity-driven progress with permission-gated manual override, CSV
// import/export, and the cross-module alert set.
//
// Every list endpoint filters by project and renders zero-record states.

const express = require('express');
const { nextNumber } = require('../services/numbering');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const engine = require('../services/schedulingEngine');

// ---------------------------------------------------------------------------
// Calendars
// ---------------------------------------------------------------------------

router.get('/calendars', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`c.project_id = $${idx++}`); params.push(project_id); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(`SELECT * FROM calendars c ${where} ORDER BY c.is_default DESC, c.name`, params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/calendars', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      name: Joi.string().required(),
      is_default: Joi.boolean().default(false),
      work_days: Joi.array().items(Joi.number().integer().min(0).max(6)).default([1, 2, 3, 4, 5]),
      exceptions: Joi.array().items(Joi.object({ date: Joi.string(), is_workday: Joi.boolean(), note: Joi.string().allow('', null) })).default([]),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const r = await query(
      `INSERT INTO calendars (project_id, name, is_default, work_days, exceptions, created_by)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6) RETURNING *`,
      [value.project_id, value.name, value.is_default, JSON.stringify(value.work_days), JSON.stringify(value.exceptions), req.user.id]);
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// Activities — CRUD
// ---------------------------------------------------------------------------

const ACTIVITY_SELECT = `
  SELECT a.*, c.name as calendar_name, pl.name as location_name,
         COALESCE(ro.name_en, ro.name_ar) as responsible_organization_name,
         COALESCE(so.name_en, so.name_ar) as subcontractor_name,
         ru.name as responsible_user_name, ph.name_en as phase_name
  FROM schedule_activities a
  LEFT JOIN calendars c ON a.calendar_id = c.id
  LEFT JOIN project_locations pl ON a.project_location_id = pl.id
  LEFT JOIN organizations ro ON a.responsible_organization_id = ro.id
  LEFT JOIN organizations so ON a.subcontractor_organization_id = so.id
  LEFT JOIN users ru ON a.responsible_user_id = ru.id
  LEFT JOIN project_phases ph ON a.phase_id = ph.id`;

router.get('/activities', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, status, location_id, phase_id, subcontractor_organization_id, critical } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`a.project_id = $${idx++}`); params.push(project_id); }
    if (status) { conditions.push(`a.status = $${idx++}`); params.push(status); }
    if (location_id) { conditions.push(`a.project_location_id = $${idx++}`); params.push(location_id); }
    if (phase_id) { conditions.push(`a.phase_id = $${idx++}`); params.push(phase_id); }
    if (subcontractor_organization_id) { conditions.push(`a.subcontractor_organization_id = $${idx++}`); params.push(subcontractor_organization_id); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    let r = await query(`${ACTIVITY_SELECT} ${where} ORDER BY a.planned_start NULLS LAST, a.id`, params);
    let rows = r.rows;
    if (critical === 'true') {
      const computed = engine.computeSchedule(rows, await relationshipsFor(query, project_id));
      const critIds = new Set(computed.activities.filter((x) => x.critical).map((x) => x.id));
      rows = rows.filter((a) => critIds.has(engine.toNum(a.id)));
    }
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

async function relationshipsFor(q, projectId) {
  if (!projectId) return [];
  try {
    return (await q('SELECT * FROM activity_relationships WHERE project_id = $1', [projectId])).rows;
  } catch (e) { return []; }
}

router.get('/activities/export', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ success: false, error: 'project_id is required' });
    const acts = (await query('SELECT * FROM schedule_activities WHERE project_id = $1 ORDER BY id', [project_id])).rows;
    const rels = (await query('SELECT * FROM activity_relationships WHERE project_id = $1', [project_id])).rows;
    const codeOf = new Map(acts.map((a) => [a.id, a.activity_code || String(a.id)]));
    const lines = [];
    lines.push('activity_code,name,wbs_path,work_package,planned_start,planned_finish,original_duration,planned_quantity,percent_complete,is_milestone');
    for (const a of acts) {
      lines.push([a.activity_code, a.name, a.wbs_path || '', a.work_package || '', a.planned_start || '',
        a.planned_finish || '', a.original_duration || 0, a.planned_quantity || '', a.percent_complete || 0,
        a.is_milestone ? 'Y' : 'N'].map(csvField).join(','));
    }
    lines.push('');
    lines.push('predecessor,successor,relationship_type,lag_days');
    for (const r of rels) {
      lines.push([codeOf.get(r.predecessor_id) || r.predecessor_id, codeOf.get(r.successor_id) || r.successor_id,
        r.relationship_type, r.lag_days || 0].map(csvField).join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="schedule-${project_id}.csv"`);
    res.send(lines.join('\n'));
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/activities/:id', authenticate, authorize(), async (req, res) => {
  try {
    const activity = (await query(`${ACTIVITY_SELECT} WHERE a.id = $1`, [req.params.id])).rows[0];
    if (!activity) return res.status(404).json({ success: false, error: 'Activity not found' });
    const rels = (await query(
      `SELECT r.*, p.name as predecessor_name, s.name as successor_name FROM activity_relationships r
       LEFT JOIN schedule_activities p ON r.predecessor_id = p.id
       LEFT JOIN schedule_activities s ON r.successor_id = s.id
       WHERE r.predecessor_id = $1 OR r.successor_id = $1`,
      [req.params.id]
    )).rows;
    res.json({ success: true, data: { ...activity, relationships: rels } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/activities', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      activity_code: Joi.string().allow('', null).optional(),
      name: Joi.string().required(),
      wbs_path: Joi.string().allow('', null).optional(),
      work_package: Joi.string().allow('', null).optional(),
      phase_id: Joi.number().integer().allow(null).optional(),
      project_location_id: Joi.number().integer().allow(null).optional(),
      boq_item_id: Joi.number().integer().allow(null).optional(),
      boq_location_allocation_id: Joi.number().integer().allow(null).optional(),
      calendar_id: Joi.number().integer().allow(null).optional(),
      responsible_organization_id: Joi.number().integer().allow(null).optional(),
      responsible_user_id: Joi.number().integer().allow(null).optional(),
      subcontractor_organization_id: Joi.number().integer().allow(null).optional(),
      planned_start: Joi.date().iso().allow(null).optional(),
      planned_finish: Joi.date().iso().allow(null).optional(),
      original_duration: Joi.number().integer().min(0).default(0),
      planned_quantity: Joi.number().allow(null).optional(),
      progress_source: Joi.string().valid('manual', 'quantity').default('manual'),
      is_milestone: Joi.boolean().default(false),
      notes: Joi.string().allow('', null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    // Auto code when absent.
    let code = value.activity_code || null;
    if (!code) {
      code = await nextNumber(query, { table: 'schedule_activities', column: 'activity_code', prefix: 'A', sep: '', pad: 4, where: { project_id: value.project_id } });
    }
    const r = await query(
      `INSERT INTO schedule_activities (project_id, activity_code, name, wbs_path, work_package, phase_id,
         project_location_id, boq_item_id, boq_location_allocation_id, calendar_id, responsible_organization_id,
         responsible_user_id, subcontractor_organization_id, planned_start, planned_finish, original_duration,
         planned_quantity, progress_source, is_milestone, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
      [value.project_id, code, value.name, value.wbs_path || null, value.work_package || null, value.phase_id || null,
       value.project_location_id || null, value.boq_item_id || null, value.boq_location_allocation_id || null,
       value.calendar_id || null, value.responsible_organization_id || null, value.responsible_user_id || null,
       value.subcontractor_organization_id || null, value.planned_start || null, value.planned_finish || null,
       value.is_milestone ? 0 : value.original_duration, value.planned_quantity || null,
       value.progress_source, value.is_milestone, value.notes || null, req.user.id]);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'schedule', description: `Created activity ${code}: ${value.name}`, entityId: r.rows[0].id, entityType: 'schedule_activity' });
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/activities/:id', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      name: Joi.string(), activity_code: Joi.string().allow('', null), wbs_path: Joi.string().allow('', null),
      work_package: Joi.string().allow('', null), phase_id: Joi.number().integer().allow(null),
      project_location_id: Joi.number().integer().allow(null), boq_item_id: Joi.number().integer().allow(null),
      boq_location_allocation_id: Joi.number().integer().allow(null), calendar_id: Joi.number().integer().allow(null),
      responsible_organization_id: Joi.number().integer().allow(null), responsible_user_id: Joi.number().integer().allow(null),
      subcontractor_organization_id: Joi.number().integer().allow(null),
      planned_start: Joi.date().iso().allow(null), planned_finish: Joi.date().iso().allow(null),
      actual_start: Joi.date().iso().allow(null), actual_finish: Joi.date().iso().allow(null),
      original_duration: Joi.number().integer().min(0), remaining_duration: Joi.number().integer().min(0).allow(null),
      planned_quantity: Joi.number().allow(null), status: Joi.string().valid('planned', 'in_progress', 'completed', 'suspended'),
      progress_source: Joi.string().valid('manual', 'quantity'), notes: Joi.string().allow('', null),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const sets = []; const params = []; let idx = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      sets.push(`${k} = $${idx++}`); params.push(v);
    }
    sets.push('updated_at = NOW()');
    params.push(req.params.id);
    const r = await query(`UPDATE schedule_activities SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Activity not found' });
    // Date/quantity changes recompute demand (Phase 9 event hook, already routed).
    try {
      const { fireEvent } = require('../utils/activity');
      await fireEvent({
        eventType: 'schedule.activity.changed', entityType: 'schedule_activity', entityId: parseInt(req.params.id, 10),
        userId: req.user.id, userName: req.user.name, userRole: req.user.role,
        payload: { project_id: r.rows[0].project_id, percent_complete: r.rows[0].percent_complete },
      });
    } catch (e) { /* event is best-effort */ }
    // Phase 3.5: a schedule change recomputes the project's derived (duration-weighted) progress.
    try {
      const progressEngine = require('../services/progressEngine');
      await progressEngine.syncProjectProgress(query, r.rows[0].project_id);
    } catch (e) { console.error('[SCHEDULE] project progress recompute failed:', e.message); }
    res.json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/activities/:id', authenticate, authorize(), async (req, res) => {
  try {
    const r = await query('DELETE FROM schedule_activities WHERE id = $1 RETURNING activity_code, project_id', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Activity not found' });
    res.json({ success: true, message: 'Activity deleted' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Progress update — quantity-derived when the activity is quantity-driven;
// manual override is role-gated (PM and above) on top of the policy engine.
router.post('/activities/:id/progress', authenticate, authorize('owner', 'admin', 'project_manager', 'planning'), async (req, res) => {
  try {
    const schema = Joi.object({
      percent_complete: Joi.number().min(0).max(100).optional(),
      progress_source: Joi.string().valid('manual', 'quantity').optional(),
      data_date: Joi.date().iso().optional(),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const updated = await engine.updateProgress(query, req.params.id, value, req.user);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'schedule', description: `Activity ${updated.activity_code} progress → ${updated.percent_complete}%`, entityId: updated.id, entityType: 'schedule_activity' });
    // Phase 3.5: the project's derived progress follows activity progress changes.
    try {
      const progressEngine = require('../services/progressEngine');
      await progressEngine.syncProjectProgress(query, updated.project_id);
    } catch (e) { console.error('[SCHEDULE] project progress recompute failed:', e.message); }
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

router.get('/relationships', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`r.project_id = $${idx++}`); params.push(project_id); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(
      `SELECT r.*, p.name as predecessor_name, s.name as successor_name FROM activity_relationships r
       LEFT JOIN schedule_activities p ON r.predecessor_id = p.id
       LEFT JOIN schedule_activities s ON r.successor_id = s.id ${where} ORDER BY r.id`,
      params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

const REL_TYPES = ['FS', 'SS', 'FF', 'SF'];
router.post('/relationships', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      predecessor_id: Joi.number().integer().required(),
      successor_id: Joi.number().integer().required(),
      relationship_type: Joi.string().valid(...REL_TYPES).default('FS'),
      lag_days: Joi.number().integer().default(0),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    if (value.predecessor_id === value.successor_id) {
      return res.status(400).json({ success: false, error: 'An activity cannot depend on itself' });
    }
    const r = await query(
      `INSERT INTO activity_relationships (project_id, predecessor_id, successor_id, relationship_type, lag_days, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [value.project_id, value.predecessor_id, value.successor_id, value.relationship_type, value.lag_days, req.user.id]);
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/relationships/:id', authenticate, authorize(), async (req, res) => {
  try {
    const r = await query('DELETE FROM activity_relationships WHERE id = $1 RETURNING id', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Relationship not found' });
    res.json({ success: true, message: 'Relationship deleted' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// CPM + views
// ---------------------------------------------------------------------------

router.get('/schedule/cpm', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ success: false, error: 'project_id is required' });
    const activities = (await query('SELECT * FROM schedule_activities WHERE project_id = $1', [project_id])).rows;
    const rels = await relationshipsFor(query, project_id);
    const computed = engine.computeSchedule(activities, rels);
    // Stamp critical flags back onto the rows for the Gantt view.
    const critMap = new Map(computed.activities.map((c) => [c.id, c]));
    res.json({
      success: true,
      data: {
        project_finish: computed.project_finish,
        activities: activities.map((a) => ({ ...a, cpm: critMap.get(engine.toNum(a.id)) || null })),
      },
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/schedule/lookahead', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, weeks = 2, data_date } = req.query;
    if (!project_id) return res.status(400).json({ success: false, error: 'project_id is required' });
    const acts = (await query('SELECT * FROM schedule_activities WHERE project_id = $1', [project_id])).rows;
    const dataDate = data_date ? new Date(data_date) : new Date();
    const rows = engine.lookahead(acts, [2, 4, 6].includes(parseInt(weeks, 10)) ? parseInt(weeks, 10) : 2, dataDate);
    res.json({ success: true, data: rows, window_weeks: parseInt(weeks, 10) });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/schedule/delayed', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, data_date } = req.query;
    if (!project_id) return res.status(400).json({ success: false, error: 'project_id is required' });
    const acts = (await query('SELECT * FROM schedule_activities WHERE project_id = $1', [project_id])).rows;
    const rows = engine.delayedActivities(acts, data_date ? new Date(data_date) : new Date());
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// SV% per activity + project aggregate; SPI/CPI only where EVM is enabled.
router.get('/schedule/kpis', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, data_date } = req.query;
    if (!project_id) return res.status(400).json({ success: false, error: 'project_id is required' });
    const project = (await query('SELECT id, earned_value_enabled FROM projects WHERE id = $1', [project_id])).rows[0];
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    const acts = (await query('SELECT * FROM schedule_activities WHERE project_id = $1', [project_id])).rows;
    const dataDate = data_date ? new Date(data_date) : new Date();
    const perActivity = acts.map((a) => ({
      id: a.id, activity_code: a.activity_code, name: a.name,
      planned_progress: engine.plannedProgress(a, dataDate),
      actual_progress: engine.toNum(a.percent_complete),
      sv_percent: engine.scheduleVariancePercent(a, dataDate),
    }));
    const overall = {
      planned_progress: acts.length ? Math.round((perActivity.reduce((s, x) => s + x.planned_progress, 0) / acts.length) * 10) / 10 : 0,
      actual_progress: acts.length ? Math.round((perActivity.reduce((s, x) => s + x.actual_progress, 0) / acts.length) * 10) / 10 : 0,
      schedule_variance_percent: acts.length ? Math.round((perActivity.reduce((s, x) => s + x.sv_percent, 0) / acts.length) * 10) / 10 : 0,
    };
    const spi = engine.spi(project, acts, dataDate);
    res.json({
      success: true,
      data: { per_activity: perActivity, project: overall, spi, spi_note: spi == null ? 'Earned-value management is not enabled for this project' : undefined },
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/schedule/s-curve', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, data_date } = req.query;
    if (!project_id) return res.status(400).json({ success: false, error: 'project_id is required' });
    const acts = (await query('SELECT * FROM schedule_activities WHERE project_id = $1', [project_id])).rows;
    res.json({ success: true, data: engine.sCurve(acts, data_date ? new Date(data_date) : new Date()) });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Alerts — cross-module (material readiness, blockers, critical delay, milestones).
router.get('/schedule/alerts', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, data_date } = req.query;
    if (!project_id) return res.status(400).json({ success: false, error: 'project_id is required' });
    const alerts = await engine.scheduleAlerts(query, project_id, data_date ? new Date(data_date) : new Date());
    res.json({ success: true, data: alerts });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Milestones integrated with the schedule (milestone can reference an activity).
router.get('/schedule/milestones', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`m.project_id = $${idx++}`); params.push(project_id); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(
      `SELECT m.*, a.name as activity_name, a.planned_start as activity_planned_start, a.percent_complete as activity_percent_complete
       FROM project_milestones m LEFT JOIN schedule_activities a ON m.schedule_activity_id = a.id
       ${where} ORDER BY m.target_date NULLS LAST`, params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/schedule/milestones/:id/link', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ schedule_activity_id: Joi.number().integer().required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const r = await query(
      `UPDATE project_milestones SET schedule_activity_id = $1 WHERE id = $2 RETURNING *`,
      [value.schedule_activity_id, req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Milestone not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// Baselines
// ---------------------------------------------------------------------------

router.get('/baselines', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`b.project_id = $${idx++}`); params.push(project_id); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(
      `SELECT b.*, u.name as created_by_name FROM baselines b LEFT JOIN users u ON b.created_by = u.id
       ${where} ORDER BY b.baseline_date DESC`, params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Snapshot the current plan as a baseline (only one is 'current').
router.post('/baselines', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ project_id: Joi.number().integer().required(), name: Joi.string().required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const acts = (await query('SELECT * FROM schedule_activities WHERE project_id = $1', [value.project_id])).rows;
    const snapshot = acts.map((a) => ({
      id: a.id, activity_code: a.activity_code, name: a.name, planned_start: a.planned_start,
      planned_finish: a.planned_finish, original_duration: a.original_duration, planned_quantity: a.planned_quantity,
    }));
    await query('UPDATE baselines SET is_current = false WHERE project_id = $1', [value.project_id]);
    const r = await query(
      `INSERT INTO baselines (project_id, name, data, is_current, created_by) VALUES ($1,$2,$3::jsonb,true,$4) RETURNING *`,
      [value.project_id, value.name, JSON.stringify(snapshot), req.user.id]);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'schedule', description: `Captured baseline "${value.name}" (${snapshot.length} activities)`, entityId: r.rows[0].id, entityType: 'baseline' });
    res.status(201).json({ success: true, data: { ...r.rows[0], activity_count: snapshot.length } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// Import (CSV) lives in the Import/Export section below; the export GET is
// declared early so '/activities/export' is never read as an activity id.
// ---------------------------------------------------------------------------

function csvField(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Import CSV text: rows after the header create/update activities; an
// optional second section creates relationships by activity code.
router.post('/activities/import', authenticate, authorize('owner', 'admin', 'project_manager', 'planning'), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      csv: Joi.string().required(),
      replace: Joi.boolean().default(false),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    if (value.replace) await query('DELETE FROM schedule_activities WHERE project_id = $1', [value.project_id]);

    const lines = value.csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let mode = null;
    let created = 0, relsCreated = 0, skipped = 0;
    const byCode = new Map();
    for (const line of lines) {
      if (/^predecessor,successor/i.test(line)) { mode = 'rels'; continue; }
      if (/^activity_code,/i.test(line)) { mode = 'acts'; continue; }
      const fields = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((f) => f.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')) || [];
      if (mode === 'acts') {
        const [activity_code, name, wbs_path, work_package, planned_start, planned_finish, original_duration, planned_quantity, percent_complete, is_milestone] = fields;
        if (!name) { skipped++; continue; }
        const existing = (await query(
          'SELECT id FROM schedule_activities WHERE project_id = $1 AND activity_code = $2',
          [value.project_id, activity_code]
        )).rows[0];
        if (existing) {
          await query(
            `UPDATE schedule_activities SET name = $1, wbs_path = $2, work_package = $3, planned_start = $4,
               planned_finish = $5, original_duration = $6, planned_quantity = $7, updated_at = NOW() WHERE id = $8`,
            [name, wbs_path || null, work_package || null, planned_start || null, planned_finish || null,
             parseInt(original_duration, 10) || 0, planned_quantity ? parseFloat(planned_quantity) : null, existing.id]
          );
          byCode.set(activity_code, existing.id);
          continue;
        }
        const r = await query(
          `INSERT INTO schedule_activities (project_id, activity_code, name, wbs_path, work_package, planned_start, planned_finish, original_duration, planned_quantity, percent_complete, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [value.project_id, activity_code || `IMP${Date.now()}${created}`, name, wbs_path || null, work_package || null,
           planned_start || null, planned_finish || null, parseInt(original_duration, 10) || 0,
           planned_quantity ? parseFloat(planned_quantity) : null, percent_complete ? Math.min(100, parseFloat(percent_complete)) : 0, req.user.id]
        );
        byCode.set(activity_code, r.rows[0].id);
        created++;
      } else if (mode === 'rels') {
        const [pred, succ, relType, lag] = fields;
        const predId = byCode.get(pred) || (await codeLookupId(pred, value.project_id));
        const succId = byCode.get(succ) || (await codeLookupId(succ, value.project_id));
        if (!predId || !succId) { skipped++; continue; }
        try {
          await query(
            `INSERT INTO activity_relationships (project_id, predecessor_id, successor_id, relationship_type, lag_days, created_by)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [value.project_id, predId, succId, ['FS', 'SS', 'FF', 'SF'].includes(relType) ? relType : 'FS',
             parseInt(lag, 10) || 0, req.user.id]);
        } catch (e) { skipped++; }
      }
    }
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'schedule', description: `Imported schedule (${created} activities)`, entityId: null, entityType: 'schedule' });
    res.json({ success: true, data: { created, skipped } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

async function codeLookupId(code, projectId) {
  try {
    const r = await query('SELECT id FROM schedule_activities WHERE project_id = $1 AND activity_code = $2', [projectId, code]);
    return r.rows[0] ? r.rows[0].id : null;
  } catch (e) { return null; }
}

module.exports = router;
