const { authorizedProjectId, authorizeProjectPayload } = require('../services/authorizedProject');
// Phase 22 — planning / scheduling routes (mounted at /api/schedule).
//
// Activities, relationships, calendars, baselines, the CPM views (Gantt,
// lookahead, delayed, critical, location, subcontractor), SV%/SPI/CPI,
// quantity-driven progress with permission-gated manual override, CSV
// import/export, and the cross-module alert set.
//
// Every list endpoint filters by project and renders zero-record states.

const express = require('express');
const projectSetup = require('../services/projectSetupService');
const { nextNumber } = require('../services/numbering');
const router = express.Router();
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const engine = require('../services/schedulingEngine');
const costView = require('../services/costView');
const { dateOnly } = require('../utils/validation');
const { normalizeDateFields } = require('../utils/dateOnly');

function scheduleProjectAllowed(req, projectId) {
  return req.accessScope?.companyWide || (req.accessScope?.projectIds || []).includes(Number(projectId));
}

function scheduleFailure(res, status, code) {
  return res.status(status).json({ success: false, error_code: code });
}

function currentLocalDate() {
  const now = new Date(); const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function isoDay(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

// Daily resource loading for planned/active schedule assignments.
router.get('/resource-load', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().positive().required(),
      from: Joi.date().iso().optional(),
      to: Joi.date().iso().optional(),
    });
    const { error, value } = schema.validate(req.query);
    if (error) return scheduleFailure(res, 400, 'invalid_resource_load_range');
    if (!scheduleProjectAllowed(req, authorizedProjectId(req, value))) return scheduleFailure(res, 403, 'schedule_project_scope_denied');
    const from = value.from ? isoDay(value.from) : currentLocalDate();
    const to = value.to ? isoDay(value.to) : isoDay(new Date(new Date(`${from}T12:00:00`).getTime() + 13 * 86400000));
    const dayCount = Math.floor((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000);
    if (dayCount < 0 || dayCount > 90) return scheduleFailure(res, 400, 'invalid_resource_load_range');
    const rows = (await query(
      `WITH days AS (
         SELECT generate_series($2::date, $3::date, interval '1 day')::date AS load_date
       )
       SELECT d.load_date, a.employee_id, a.asset_register_id,
              COALESCE(e.name_en, e.name_ar, ar.name) AS resource_name,
              CASE WHEN a.employee_id IS NOT NULL THEN 'employee' ELSE 'asset' END AS resource_type,
              SUM(a.allocation_percent)::numeric(7,2) AS allocation_percent,
              JSON_AGG(JSON_BUILD_OBJECT('activity_id', sa.id, 'activity_code', sa.activity_code, 'name', sa.name)
                ORDER BY sa.planned_start NULLS LAST, sa.id) AS activities
         FROM days d
         JOIN schedule_activity_assignments a ON d.load_date BETWEEN a.assigned_from AND a.assigned_to
         JOIN schedule_activities sa ON sa.id = a.schedule_activity_id AND sa.project_id = a.project_id
         LEFT JOIN employees e ON e.id = a.employee_id
         LEFT JOIN asset_register ar ON ar.id = a.asset_register_id
        WHERE a.project_id = $1 AND a.status IN ('planned', 'active')
        GROUP BY d.load_date, a.employee_id, a.asset_register_id, e.name_en, e.name_ar, ar.name
        ORDER BY d.load_date, resource_type, resource_name`, [authorizedProjectId(req, value), from, to]
    )).rows;
    res.json({ success: true, data: rows, from, to });
  } catch (error) {
    return scheduleFailure(res, 500, 'schedule_resource_load_failed');
  }
});

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
    authorizeProjectPayload(req, value);
    const r = await query(
      `INSERT INTO calendars (project_id, name, is_default, work_days, exceptions, created_by)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6) RETURNING *`,
      [authorizedProjectId(req, value), value.name, value.is_default, JSON.stringify(value.work_days), JSON.stringify(value.exceptions), req.user.id]);
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
      work_package_id: Joi.number().integer().allow(null).optional(),
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
      budgeted_cost: Joi.number().min(0).precision(2).allow(null).optional(),
      progress_source: Joi.string().valid('manual', 'quantity').default('manual'),
      is_milestone: Joi.boolean().default(false),
      notes: Joi.string().allow('', null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    authorizeProjectPayload(req, value);
    const wp = await projectSetup.resolveOrRespond(query, res, authorizedProjectId(req, value), value);
    if (!wp) return;
    // Auto code when absent.
    let code = value.activity_code || null;
    if (!code) {
      code = await nextNumber(query, { table: 'schedule_activities', column: 'activity_code', prefix: 'A', sep: '', pad: 4, where: { project_id: authorizedProjectId(req, value) } });
    }
    const r = await transaction(async (client) => {
      const q = client.query.bind(client);
      const inserted = await q(
        `INSERT INTO schedule_activities (project_id, activity_code, name, wbs_path, work_package, work_package_id, phase_id,
           project_location_id, boq_item_id, boq_location_allocation_id, calendar_id, responsible_organization_id,
           responsible_user_id, subcontractor_organization_id, planned_start, planned_finish, original_duration,
           planned_quantity, budgeted_cost, progress_source, is_milestone, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING *`,
        [authorizedProjectId(req, value), code, value.name, value.wbs_path || null, wp.text, wp.id, value.phase_id || null,
         value.project_location_id || null, value.boq_item_id || null, value.boq_location_allocation_id || null,
         value.calendar_id || null, value.responsible_organization_id || null, value.responsible_user_id || null,
         value.subcontractor_organization_id || null, value.planned_start || null, value.planned_finish || null,
         value.is_milestone ? 0 : value.original_duration, value.planned_quantity || null,
         value.budgeted_cost ?? null, value.progress_source, value.is_milestone, value.notes || null, req.user.id]);
      await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'schedule', description: `Created activity ${code}: ${value.name}`, entityId: inserted.rows[0].id, entityType: 'schedule_activity' }, { query: q });
      return inserted;
    });
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Set the activity BAC independently so the change has its own authorization,
// project-scope check, and transactional audit entry.
router.put('/activities/:id/budgeted-cost', authenticate, authorize('owner', 'admin', 'project_manager', 'planning'), async (req, res) => {
  try {
    const schema = Joi.object({ budgeted_cost: Joi.number().min(0).precision(2).allow(null).required() });
    const { error, value } = schema.validate(req.body);
    if (error) return scheduleFailure(res, 400, 'invalid_activity_budgeted_cost');
    const updated = await transaction(async (client) => {
      const q = client.query.bind(client);
      const activity = (await q('SELECT id, project_id, activity_code FROM schedule_activities WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      if (!activity) throw Object.assign(new Error('Activity not found'), { statusCode: 404, error_code: 'schedule_activity_not_found' });
      if (!scheduleProjectAllowed(req, activity.project_id)) throw Object.assign(new Error('Project access denied'), { statusCode: 403, error_code: 'schedule_project_scope_denied' });
      const row = (await q('UPDATE schedule_activities SET budgeted_cost = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [value.budgeted_cost, activity.id])).rows[0];
      await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'schedule', description: `Set budget at completion for activity ${activity.activity_code || activity.id}`, entityId: activity.id, entityType: 'schedule_activity' }, { query: q });
      return row;
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    return scheduleFailure(res, error.statusCode || 500, error.error_code || 'schedule_activity_budget_update_failed');
  }
});

router.put('/activities/:id', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      name: Joi.string(), activity_code: Joi.string().allow('', null), wbs_path: Joi.string().allow('', null),
      work_package: Joi.string().allow('', null), work_package_id: Joi.number().integer().allow(null),
      phase_id: Joi.number().integer().allow(null),
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
    if ('work_package' in value || 'work_package_id' in value) {
      const owner = await query('SELECT project_id FROM schedule_activities WHERE id = $1', [req.params.id]);
      if (owner.rows.length === 0) return res.status(404).json({ success: false, error: 'Activity not found' });
      const wp = await projectSetup.resolveOrRespond(query, res, owner.rows[0].project_id, value);
      if (!wp) return;
      value.work_package = wp.text;
      value.work_package_id = wp.id;
    }
    const sets = []; const params = []; let idx = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      sets.push(`${k} = $${idx++}`); params.push(v);
    }
    sets.push('updated_at = NOW()');
    params.push(req.params.id);
    const r = await query(`UPDATE schedule_activities SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Activity not found' });
    // Date/quantity changes recompute demand (Phase 9 event hook, already routed). A failed enqueue is an error.
    const { fireEvent } = require('../utils/activity');
    await fireEvent({
      eventType: 'schedule.activity.changed', entityType: 'schedule_activity', entityId: parseInt(req.params.id, 10),
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      payload: { project_id: r.rows[0].project_id, percent_complete: r.rows[0].percent_complete },
    });
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
      data_date: dateOnly().optional(),
      notes: Joi.string().allow('', null).max(2000).optional(),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const updated = await transaction(async (client) => {
      const q = client.query.bind(client);
      const before = (await q('SELECT * FROM schedule_activities WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      if (!before) throw Object.assign(new Error('Activity not found'), { statusCode: 404 });
      const dataDate = value.data_date ? new Date(`${value.data_date}T12:00:00`) : undefined;
      const row = await engine.updateProgress(q, req.params.id, { ...value, dataDate }, req.user);
      await q(
        `INSERT INTO schedule_progress_updates
           (project_id, schedule_activity_id, previous_percent_complete, percent_complete, progress_source, data_date, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [row.project_id, row.id, before.percent_complete || 0, row.percent_complete, row.progress_source,
          value.data_date || currentLocalDate(), value.notes || null, req.user.id]
      );
      await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'schedule', description: `Activity ${row.activity_code} progress → ${row.percent_complete}%`, entityId: row.id, entityType: 'schedule_activity' }, { query: q });
      const progressEngine = require('../services/progressEngine');
      await progressEngine.syncProjectProgress(q, row.project_id);
      return row;
    });
    res.json({ success: true, data: normalizeDateFields(updated, ['actual_start', 'actual_finish']) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.get('/activities/:id/progress-history', authenticate, authorize(), async (req, res) => {
  try {
    const activity = (await query('SELECT id, project_id FROM schedule_activities WHERE id = $1', [req.params.id])).rows[0];
    if (!activity || !scheduleProjectAllowed(req, activity.project_id)) return scheduleFailure(res, 404, 'schedule_activity_not_found');
    const result = await query(
      `SELECT h.*, u.name AS created_by_name FROM schedule_progress_updates h
       LEFT JOIN users u ON u.id = h.created_by
       WHERE h.schedule_activity_id = $1 ORDER BY h.created_at DESC, h.id DESC`, [req.params.id]);
    res.json({ success: true, data: result.rows.map((row) => normalizeDateFields(row, ['data_date'])) });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Project-owned resources available for dated schedule assignments.
router.get('/resources', authenticate, authorize(), async (req, res) => {
  const projectId = Number(req.query.project_id);
  if (!Number.isInteger(projectId) || projectId < 1) return scheduleFailure(res, 400, 'invalid_project_id');
  if (!scheduleProjectAllowed(req, projectId)) return scheduleFailure(res, 403, 'project_scope_denied');
  try {
    const result = await query(
      `SELECT 'employee'::text AS resource_type, e.id AS resource_id, COALESCE(e.name_en, e.name) AS name
       FROM project_participants pp JOIN project_participant_users pu ON pu.project_participant_id = pp.id
       JOIN employees e ON e.id = pu.employee_id
       WHERE pp.project_id = $1 AND pp.participant_type = 'internal_team_member'
         AND (pp.active_from IS NULL OR pp.active_from <= NOW()) AND (pp.active_to IS NULL OR pp.active_to >= CURRENT_DATE)
         AND e.status = 'active'
       UNION ALL
       SELECT 'asset'::text AS resource_type, a.id AS resource_id, a.name
       FROM asset_register a WHERE a.project_id = $1 ORDER BY resource_type, name, resource_id`, [projectId]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('schedule.resources.failed', error);
    return scheduleFailure(res, 500, 'schedule_resources_failed');
  }
});

router.get('/activities/:id/assignments', authenticate, authorize(), async (req, res) => {
  try {
    const activity = (await query('SELECT id, project_id FROM schedule_activities WHERE id = $1', [req.params.id])).rows[0];
    if (!activity || !scheduleProjectAllowed(req, activity.project_id)) return scheduleFailure(res, 404, 'schedule_activity_not_found');
    const result = await query(
      `SELECT a.*, COALESCE(e.name_en, e.name) AS employee_name, ar.name AS asset_name
       FROM schedule_activity_assignments a
       LEFT JOIN employees e ON e.id = a.employee_id
       LEFT JOIN asset_register ar ON ar.id = a.asset_register_id
       WHERE a.schedule_activity_id = $1 ORDER BY a.assigned_from, a.id`, [req.params.id]);
    res.json({ success: true, data: result.rows.map((row) => normalizeDateFields(row, ['assigned_from', 'assigned_to'])) });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/activities/:id/assignments', authenticate, authorize('owner', 'admin', 'project_manager', 'planning'), async (req, res) => {
  const schema = Joi.object({
    employee_id: Joi.number().integer().positive().allow(null),
    asset_register_id: Joi.number().integer().positive().allow(null),
    assigned_from: dateOnly().required(),
    assigned_to: dateOnly().required(),
    allocation_percent: Joi.number().positive().max(100).default(100),
    notes: Joi.string().allow('', null).max(2000),
  }).xor('employee_id', 'asset_register_id').custom((value, helpers) => (
    value.assigned_to < value.assigned_from ? helpers.error('date.range') : value
  ));
  const { error, value } = schema.validate(req.body);
  if (error) return scheduleFailure(res, 400, 'invalid_schedule_assignment');
  try {
    const inserted = await transaction(async (client) => {
      const q = client.query.bind(client);
      const activity = (await q('SELECT id, project_id FROM schedule_activities WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      if (!activity || !scheduleProjectAllowed(req, activity.project_id)) {
        throw Object.assign(new Error('schedule_activity_not_found'), { statusCode: activity ? 403 : 404, error_code: 'schedule_activity_not_found' });
      }
      const resourceType = value.employee_id != null ? 'employee' : 'asset';
      const resourceId = value.employee_id ?? value.asset_register_id;
      const lockKey = `schedule-resource-${resourceType}-${resourceId}`;
      await q('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey]);
      if (resourceType === 'employee') {
        const member = await q(
          `SELECT 1 FROM project_participants pp JOIN project_participant_users pu ON pu.project_participant_id = pp.id
           JOIN employees e ON e.id = pu.employee_id AND e.status = 'active'
           WHERE pp.project_id = $1 AND pu.employee_id = $2 AND pp.participant_type = 'internal_team_member'
             AND (pp.active_from IS NULL OR pp.active_from::date <= $3::date)
             AND (pp.active_to IS NULL OR pp.active_to::date >= $4::date) LIMIT 1`,
          [activity.project_id, resourceId, value.assigned_from, value.assigned_to]);
        if (!member.rows.length) throw Object.assign(new Error('schedule_assignment_resource_project_mismatch'), { statusCode: 400, error_code: 'schedule_assignment_resource_project_mismatch' });
      } else {
        const asset = await q('SELECT 1 FROM asset_register WHERE id = $1 AND project_id = $2', [resourceId, activity.project_id]);
        if (!asset.rows.length) throw Object.assign(new Error('schedule_assignment_resource_project_mismatch'), { statusCode: 400, error_code: 'schedule_assignment_resource_project_mismatch' });
      }
      const overlap = await q(
        `SELECT 1 FROM schedule_activity_assignments
         WHERE status IN ('planned', 'active') AND ${resourceType === 'employee' ? 'employee_id' : 'asset_register_id'} = $1
           AND daterange(assigned_from, assigned_to, '[]') && daterange($2::date, $3::date, '[]') LIMIT 1`,
        [resourceId, value.assigned_from, value.assigned_to]);
      if (overlap.rows.length) throw Object.assign(new Error('schedule_assignment_date_overlap'), { statusCode: 409, error_code: 'schedule_assignment_date_overlap' });
      const result = await q(
        `INSERT INTO schedule_activity_assignments
           (project_id, schedule_activity_id, employee_id, asset_register_id, assigned_from, assigned_to, allocation_percent, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [activity.project_id, activity.id, value.employee_id ?? null, value.asset_register_id ?? null,
          value.assigned_from, value.assigned_to, value.allocation_percent, value.notes || null, req.user.id]);
      await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'schedule', description: `Assigned a ${resourceType} to schedule activity #${activity.id}`, entityId: result.rows[0].id, entityType: 'schedule_activity_assignment' }, { query: q });
      return result.rows[0];
    });
    res.status(201).json({ success: true, data: normalizeDateFields(inserted, ['assigned_from', 'assigned_to']) });
  } catch (error) {
    if (error.error_code) return scheduleFailure(res, error.statusCode || 400, error.error_code);
    console.error('schedule.assignment.create.failed', error);
    scheduleFailure(res, 500, 'schedule_assignment_create_failed');
  }
});

router.put('/assignments/:id/status', authenticate, authorize('owner', 'admin', 'project_manager', 'planning'), async (req, res) => {
  const schema = Joi.object({ status: Joi.string().valid('active', 'completed', 'cancelled').required() });
  const { error, value } = schema.validate(req.body);
  if (error) return scheduleFailure(res, 400, 'invalid_schedule_assignment_status');
  try {
    const result = await transaction(async (client) => {
      const q = client.query.bind(client);
      const assignment = (await q('SELECT * FROM schedule_activity_assignments WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      if (!assignment || !scheduleProjectAllowed(req, assignment.project_id)) {
        throw Object.assign(new Error('schedule_assignment_not_found'), { statusCode: assignment ? 403 : 404, error_code: 'schedule_assignment_not_found' });
      }
      const allowed = { planned: ['active', 'cancelled'], active: ['completed', 'cancelled'], completed: [], cancelled: [] };
      if (!allowed[assignment.status]?.includes(value.status)) {
        throw Object.assign(new Error('schedule_assignment_transition_invalid'), { statusCode: 409, error_code: 'schedule_assignment_transition_invalid' });
      }
      const updated = await q('UPDATE schedule_activity_assignments SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [value.status, req.params.id]);
      await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'schedule', description: `Schedule assignment #${req.params.id} → ${value.status}`, entityId: req.params.id, entityType: 'schedule_activity_assignment' }, { query: q });
      return updated.rows[0];
    });
    res.json({ success: true, data: normalizeDateFields(result, ['assigned_from', 'assigned_to']) });
  } catch (error) {
    if (error.error_code) return scheduleFailure(res, error.statusCode || 400, error.error_code);
    console.error('schedule.assignment.status.failed', error);
    scheduleFailure(res, 500, 'schedule_assignment_status_failed');
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
    authorizeProjectPayload(req, value);
    if (value.predecessor_id === value.successor_id) {
      return res.status(400).json({ success: false, error: 'An activity cannot depend on itself' });
    }
    const r = await query(
      `INSERT INTO activity_relationships (project_id, predecessor_id, successor_id, relationship_type, lag_days, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [authorizedProjectId(req, value), value.predecessor_id, value.successor_id, value.relationship_type, value.lag_days, req.user.id]);
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

// SV% per activity + project aggregate; a current baseline turns SPI on by default.
router.get('/schedule/kpis', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, data_date } = req.query;
    if (!project_id) return res.status(400).json({ success: false, error: 'project_id is required' });
    const project = (await query('SELECT id, earned_value_enabled FROM projects WHERE id = $1', [project_id])).rows[0];
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    if (!scheduleProjectAllowed(req, project.id)) return scheduleFailure(res, 403, 'schedule_project_scope_denied');
    const acts = (await query('SELECT * FROM schedule_activities WHERE project_id = $1', [project_id])).rows;
    const dataDate = data_date ? new Date(data_date) : new Date();
    let perActivity = acts.map((a) => ({
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
    const baselineRow = (await query(
      'SELECT data FROM baselines WHERE project_id = $1 AND is_current = true ORDER BY baseline_date DESC, id DESC LIMIT 1',
      [project_id]
    )).rows[0];
    let baselineActivities = null;
    if (baselineRow) {
      try {
        const baseline = typeof baselineRow.data === 'string' ? JSON.parse(baselineRow.data) : baselineRow.data;
        if (Array.isArray(baseline)) {
          const actualById = new Map(acts.map((activity) => [String(activity.id), activity]));
          baselineActivities = baseline.map((activity) => ({
            ...activity,
            percent_complete: actualById.get(String(activity.id))?.percent_complete || 0,
          }));
        }
      } catch (error) {
        // A malformed legacy snapshot must not silently produce a misleading SPI.
        console.error('[SCHEDULE] current baseline is not valid JSON', error.message);
      }
    }
    const baselineAvailable = Array.isArray(baselineActivities);
    const spiProject = baselineAvailable ? { ...project, earned_value_enabled: true } : project;
    const baselineEvm = baselineAvailable ? engine.earnedValue(baselineActivities, dataDate) : null;
    const baselineSpi = baselineAvailable
      ? (baselineEvm && baselineEvm.pv > 0 ? Math.round((baselineEvm.ev / baselineEvm.pv) * 1000) / 1000 : null)
      : null;
    const spi = baselineAvailable && baselineEvm ? baselineSpi : engine.spi(spiProject, baselineAvailable ? baselineActivities : acts, dataDate);
    const actualCost = baselineEvm ? await costView.projectTotal(query, project_id) : null;
    const cpi = baselineEvm ? engine.cpi(spiProject, baselineActivities, actualCost, dataDate) : null;
    if (baselineEvm) {
      const byId = new Map(baselineActivities.map((activity) => [String(activity.id), activity]));
      perActivity = perActivity.map((row) => {
        const activity = byId.get(String(row.id));
        const budgetedCost = activity && !activity.is_milestone ? engine.toNum(activity.budgeted_cost) : 0;
        return {
          ...row,
          budgeted_cost: budgetedCost,
          planned_value: Math.round(budgetedCost * row.planned_progress) / 100,
          earned_value: Math.round(budgetedCost * row.actual_progress) / 100,
        };
      });
    }
    res.json({
      success: true,
      data: {
        per_activity: perActivity,
        project: {
          ...overall,
          bac: baselineEvm?.bac ?? null,
          planned_value: baselineEvm?.pv ?? null,
          earned_value: baselineEvm?.ev ?? null,
          actual_cost: actualCost,
          cpi,
        },
        spi,
        spi_basis: baselineEvm ? 'financial' : baselineAvailable ? 'quantity' : project.earned_value_enabled ? 'quantity' : null,
        spi_source: baselineAvailable ? 'current_baseline' : project.earned_value_enabled ? 'current_schedule' : null,
        cpi_source: baselineEvm ? 'project_cost_view' : null,
        cpi_status: cpi != null ? 'ready' : !baselineAvailable ? 'baseline_required' : !baselineEvm ? 'activity_budgets_required' : 'actual_cost_required',
        cpi_note: cpi != null ? undefined : baselineAvailable
          ? baselineEvm ? 'Actual cost must be greater than zero to calculate CPI' : 'Capture budgeted cost for every non-milestone activity in the baseline to calculate CPI'
          : 'A current baseline with activity budgets is required to calculate CPI',
        spi_note: spi == null ? 'Earned-value management is not enabled for this project' : undefined,
      },
    });
  } catch (error) { console.error('schedule.kpis.failed', error); scheduleFailure(res, 500, 'schedule_kpis_failed'); }
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
    if (!project_id) return scheduleFailure(res, 400, 'invalid_project_id');
    if (!scheduleProjectAllowed(req, project_id)) return scheduleFailure(res, 403, 'schedule_project_scope_denied');
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
    authorizeProjectPayload(req, value);
    if (!scheduleProjectAllowed(req, authorizedProjectId(req, value))) return scheduleFailure(res, 403, 'schedule_project_scope_denied');
    const acts = (await query('SELECT * FROM schedule_activities WHERE project_id = $1', [authorizedProjectId(req, value)])).rows;
    const snapshot = acts.map((a) => ({
      id: a.id, activity_code: a.activity_code, name: a.name, planned_start: a.planned_start,
      planned_finish: a.planned_finish, original_duration: a.original_duration, planned_quantity: a.planned_quantity,
      budgeted_cost: a.budgeted_cost, is_milestone: a.is_milestone,
    }));
    const r = await transaction(async (client) => {
      const q = client.query.bind(client);
      await q('UPDATE baselines SET is_current = false WHERE project_id = $1', [authorizedProjectId(req, value)]);
      const inserted = await q(
        `INSERT INTO baselines (project_id, name, data, is_current, created_by) VALUES ($1,$2,$3::jsonb,true,$4) RETURNING *`,
        [authorizedProjectId(req, value), value.name, JSON.stringify(snapshot), req.user.id]);
      await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'schedule', description: `Captured baseline "${value.name}" (${snapshot.length} activities)`, entityId: inserted.rows[0].id, entityType: 'baseline' }, { query: q });
      return inserted;
    });
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
    authorizeProjectPayload(req, value);

    const lines = value.csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    // Every work package the file names must exist BEFORE anything is deleted or written: a refused row
    // must not leave a half-imported (or replaced-then-empty) schedule behind.
    let preMode = null;
    for (const line of lines) {
      if (/^predecessor,successor/i.test(line)) { preMode = 'rels'; continue; }
      if (/^activity_code,/i.test(line)) { preMode = 'acts'; continue; }
      if (preMode !== 'acts') continue;
      const preFields = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((f) => f.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')) || [];
      if (!preFields[1]) continue;
      const checked = await projectSetup.resolveOrRespond(query, res, authorizedProjectId(req, value), { work_package: preFields[3] });
      if (!checked) return;
    }

    const outcome = await transaction(async (client) => {
    const q = client.query.bind(client);
    if (value.replace) await q('DELETE FROM schedule_activities WHERE project_id = $1', [authorizedProjectId(req, value)]);

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
        const wp = await projectSetup.resolveWorkPackage(q, authorizedProjectId(req, value), { work_package });
        const existing = (await q(
          'SELECT id FROM schedule_activities WHERE project_id = $1 AND activity_code = $2',
          [authorizedProjectId(req, value), activity_code]
        )).rows[0];
        if (existing) {
          await q(
            `UPDATE schedule_activities SET name = $1, wbs_path = $2, work_package = $3, planned_start = $4,
               planned_finish = $5, original_duration = $6, planned_quantity = $7, work_package_id = $9, updated_at = NOW() WHERE id = $8`,
            [name, wbs_path || null, wp.text, planned_start || null, planned_finish || null,
             parseInt(original_duration, 10) || 0, planned_quantity ? parseFloat(planned_quantity) : null, existing.id, wp.id]
          );
          byCode.set(activity_code, existing.id);
          continue;
        }
        const r = await q(
          `INSERT INTO schedule_activities (project_id, activity_code, name, wbs_path, work_package, work_package_id, planned_start, planned_finish, original_duration, planned_quantity, percent_complete, created_by)
           VALUES ($1,$2,$3,$4,$5,$12,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [authorizedProjectId(req, value), activity_code || `IMP${Date.now()}${created}`, name, wbs_path || null, wp.text,
           planned_start || null, planned_finish || null, parseInt(original_duration, 10) || 0,
           planned_quantity ? parseFloat(planned_quantity) : null, percent_complete ? Math.min(100, parseFloat(percent_complete)) : 0, req.user.id, wp.id]
        );
        byCode.set(activity_code, r.rows[0].id);
        created++;
      } else if (mode === 'rels') {
        const [pred, succ, relType, lag] = fields;
        const predId = byCode.get(pred) || (await codeLookupId(pred, authorizedProjectId(req, value), q));
        const succId = byCode.get(succ) || (await codeLookupId(succ, authorizedProjectId(req, value), q));
        if (!predId || !succId) { skipped++; continue; }
        try {
          await q(
            `INSERT INTO activity_relationships (project_id, predecessor_id, successor_id, relationship_type, lag_days, created_by)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [authorizedProjectId(req, value), predId, succId, ['FS', 'SS', 'FF', 'SF'].includes(relType) ? relType : 'FS',
             parseInt(lag, 10) || 0, req.user.id]);
        } catch (e) { skipped++; }
      }
    }
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'schedule', description: `Imported schedule (${created} activities)`, entityId: null, entityType: 'schedule' }, { query: q });
    return { created, skipped };
    });
    res.json({ success: true, data: outcome });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

async function codeLookupId(code, projectId, q = query) {
  try {
    const r = await q('SELECT id FROM schedule_activities WHERE project_id = $1 AND activity_code = $2', [projectId, code]);
    return r.rows[0] ? r.rows[0].id : null;
  } catch (e) { return null; }
}

module.exports = router;
