const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

const PROJECT_TYPES = ['residential', 'commercial', 'industrial', 'infrastructure', 'mixed'];
const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'closed'];
const PHASE_STATUSES = ['planning', 'active', 'completed', 'on_hold'];
const TEAM_ROLES = ['project_manager', 'site_engineer', 'qs', 'safety_officer', 'supervisor', 'foreman'];

router.get('/portfolio', authenticate, async (req, res) => {
  try {
    const data = await query(`
      SELECT p.*, c.name_ar as client_name, c.name_en as client_name_en,
             e.name_ar as project_manager_name, e.name_en as project_manager_name_en
      FROM projects p
      LEFT JOIN clients c ON p.client_id = c.id
      LEFT JOIN employees e ON p.project_manager_id = e.id
      ORDER BY p.status, p.created_at DESC
    `);
    res.json({ success: true, data: data.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/', authenticate, async (req, res) => {
  try {
    const { status, project_type, search, limit = 100, offset = 0 } = req.query;
    let conds = []; let p = []; let i = 1;
    if (status && PROJECT_STATUSES.includes(status)) { conds.push(`p.status = $${i++}`); p.push(status); }
    if (project_type && PROJECT_TYPES.includes(project_type)) { conds.push(`p.project_type = $${i++}`); p.push(project_type); }
    if (search) { conds.push(`(p.code ILIKE $${i} OR p.name_en ILIKE $${i} OR p.name_ar ILIKE $${i})`); p.push(`%${search}%`); i++; }
    const w = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const data = await query(
      `SELECT p.*, c.name_ar as client_name, c.name_en as client_name_en, e.name_ar as project_manager_name, e.name_en as project_manager_name_en FROM projects p LEFT JOIN clients c ON p.client_id = c.id LEFT JOIN employees e ON p.project_manager_id = e.id ${w} ORDER BY p.created_at DESC LIMIT $${i++} OFFSET $${i}`,
      [...p, parseInt(limit), parseInt(offset)]
    );
    res.json({ success: true, data: data.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const project = await query(`SELECT p.*, c.name_ar as client_name, c.name_en as client_name_en, e.name_ar as project_manager_name, e.name_en as project_manager_name_en FROM projects p LEFT JOIN clients c ON p.client_id = c.id LEFT JOIN employees e ON p.project_manager_id = e.id WHERE p.id = $1`, [req.params.id]);
    if (project.rows.length === 0) return res.status(404).json({ success: false, error: 'Project not found' });

    const [phases, team, milestones] = await Promise.all([
      query('SELECT * FROM project_phases WHERE project_id = $1 ORDER BY sort_order', [req.params.id]),
      query(`SELECT pt.*, e.name AS employee_name, e.name_ar AS employee_name_ar, e.name_en AS employee_name_en,
                    e.designation, e.department
             FROM project_team pt LEFT JOIN employees e ON pt.employee_id = e.id
             WHERE pt.project_id = $1 ORDER BY pt.assigned_at`, [req.params.id]),
      query('SELECT * FROM project_milestones WHERE project_id = $1 ORDER BY target_date', [req.params.id]),
    ]);

    res.json({
      success: true,
      data: { ...project.rows[0], phases: phases.rows, team: team.rows, milestones: milestones.rows }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const schema = Joi.object({
      code: Joi.string().optional(), name_ar: Joi.string().required(), name_en: Joi.string().allow(''),
      address: Joi.string().allow(''), city: Joi.string().allow(''),
      project_type: Joi.string().valid(...PROJECT_TYPES).default('commercial'),
      client_id: Joi.number().integer().optional().allow(null),
      project_manager_id: Joi.number().integer().optional().allow(null),
      contract_value: Joi.number().min(0).default(0), budget: Joi.number().min(0).default(0),
      start_date: Joi.date().iso().allow(null), expected_completion: Joi.date().iso().allow(null),
      status: Joi.string().valid(...PROJECT_STATUSES).default('planning'),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    if (!value.code) {
      const cnt = await query("SELECT COUNT(*) as c FROM projects WHERE code LIKE 'PRJ-%'");
      value.code = `PRJ-${String(parseInt(cnt.rows[0].c) + 1).padStart(4, '0')}`;
    }

    const result = await transaction(async (client) => {
      const project = await client.query(
        `INSERT INTO projects (code, name, name_ar, name_en, address, city, project_type, client_id, project_manager_id, contract_value, budget, start_date, expected_completion, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [value.code, value.name_ar, value.name_ar, value.name_en || value.name_ar, value.address, value.city, value.project_type, value.client_id, value.project_manager_id, value.contract_value, value.budget, value.start_date, value.expected_completion, value.status]
      );
      return project.rows[0];
    });

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'projects', description: `Created project ${value.code}`, entityId: result.id, entityType: 'project' });
    res.status(201).json({ success: true, data: result });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const existing = await query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Project not found' });

    const schema = Joi.object({
      name_ar: Joi.string(), name_en: Joi.string().allow(''),
      address: Joi.string().allow(''), city: Joi.string().allow(''),
      project_type: Joi.string().valid(...PROJECT_TYPES), client_id: Joi.number().integer().optional().allow(null),
      project_manager_id: Joi.number().integer().optional().allow(null),
      contract_value: Joi.number().min(0), budget: Joi.number().min(0),
      start_date: Joi.date().iso().allow(null), expected_completion: Joi.date().iso().allow(null),
      actual_completion: Joi.date().iso().allow(null), status: Joi.string().valid(...PROJECT_STATUSES),
      completion_percentage: Joi.number().min(0).max(100),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const sets = []; const p = []; let i = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) { sets.push(`${k} = $${i++}`); p.push(v); }
    }
    p.push(req.params.id);
    const r = await query(`UPDATE projects SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`, p);

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'projects', description: `Updated project ${existing.rows[0].code}`, entityId: req.params.id, entityType: 'project' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// -- Phases --
router.post('/:id/phases', authenticate, async (req, res) => {
  try {
    const schema = Joi.object({
      code: Joi.string().optional(), name_ar: Joi.string().required(), name_en: Joi.string().allow(''),
      sort_order: Joi.number().integer().default(0), start_date: Joi.date().iso().allow(null),
      end_date: Joi.date().iso().allow(null), budget: Joi.number().min(0).default(0),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const r = await query(
      `INSERT INTO project_phases (project_id, code, name, name_ar, name_en, sort_order, start_date, end_date, budget)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.params.id, value.code || `PH-${value.sort_order}`, value.name_ar, value.name_ar, value.name_en || value.name_ar, value.sort_order, value.start_date, value.end_date, value.budget]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:projectId/phases/:phaseId', authenticate, async (req, res) => {
  try {
    const schema = Joi.object({
      name_ar: Joi.string(), name_en: Joi.string().allow(''), sort_order: Joi.number(),
      start_date: Joi.date().iso().allow(null), end_date: Joi.date().iso().allow(null),
      budget: Joi.number().min(0), status: Joi.string().valid(...PHASE_STATUSES),
      completion_percentage: Joi.number().min(0).max(100),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const sets = []; const p = []; let i = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) { sets.push(`${k} = $${i++}`); p.push(v); }
    }
    p.push(req.params.phaseId);
    const r = await query(`UPDATE project_phases SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, p);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Phase not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:projectId/phases/:phaseId', authenticate, async (req, res) => {
  const r = await query('DELETE FROM project_phases WHERE id = $1 AND project_id = $2', [req.params.phaseId, req.params.projectId]);
  if (r.rowCount === 0) return res.status(404).json({ success: false, error: 'Phase not found' });
  res.json({ success: true, message: 'Deleted' });
});

// -- Team --
router.post('/:id/team', authenticate, async (req, res) => {
  try {
    const schema = Joi.object({
      employee_id: Joi.number().integer().required(), role: Joi.string().valid(...TEAM_ROLES).default('site_engineer'),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const existing = await query('SELECT id FROM project_team WHERE project_id = $1 AND employee_id = $2', [req.params.id, value.employee_id]);
    if (existing.rows.length > 0) return res.status(400).json({ success: false, error: 'Employee already in team' });

    const r = await query('INSERT INTO project_team (project_id, employee_id, role) VALUES ($1,$2,$3) RETURNING *', [req.params.id, value.employee_id, value.role]);
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:projectId/team/:teamId', authenticate, async (req, res) => {
  const r = await query('DELETE FROM project_team WHERE id = $1 AND project_id = $2', [req.params.teamId, req.params.projectId]);
  if (r.rowCount === 0) return res.status(404).json({ success: false, error: 'Team member not found' });
  res.json({ success: true, message: 'Removed' });
});

// -- Milestones --
router.post('/:id/milestones', authenticate, async (req, res) => {
  try {
    const schema = Joi.object({
      title_ar: Joi.string().required(), title_en: Joi.string().allow(''),
      target_date: Joi.date().iso().required(), achieved_date: Joi.date().iso().allow(null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const r = await query(
      `INSERT INTO project_milestones (project_id, title, title_ar, title_en, target_date, achieved_date)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, value.title_ar, value.title_ar, value.title_en || value.title_ar, value.target_date, value.achieved_date]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:projectId/milestones/:milestoneId', authenticate, async (req, res) => {
  try {
    const schema = Joi.object({
      title_ar: Joi.string(), title_en: Joi.string().allow(''),
      target_date: Joi.date().iso(), achieved_date: Joi.date().iso().allow(null),
      status: Joi.string().valid('pending', 'achieved', 'delayed'),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const sets = []; const p = []; let i = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) { sets.push(`${k} = $${i++}`); p.push(v); }
    }
    p.push(req.params.milestoneId);
    const r = await query(`UPDATE project_milestones SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, p);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Milestone not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:projectId/milestones/:milestoneId', authenticate, async (req, res) => {
  const r = await query('DELETE FROM project_milestones WHERE id = $1', [req.params.milestoneId]);
  if (r.rowCount === 0) return res.status(404).json({ success: false, error: 'Milestone not found' });
  res.json({ success: true, message: 'Deleted' });
});

module.exports = router;
