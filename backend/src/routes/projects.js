const express = require('express');
const { nextNumber } = require('../services/numbering');
const router = express.Router();
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity, fireEvent } = require('../utils/activity');
const { auditedMutation } = require('../utils/auditedMutation');
const { queryPaginated } = require('../utils/pagination');
const provisioning = require('../services/projectProvisioning');

const PROJECT_TYPES = ['residential', 'commercial', 'industrial', 'infrastructure', 'mixed'];
const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'closed'];
const PHASE_STATUSES = ['planning', 'active', 'completed', 'on_hold'];
const TEAM_ROLES = ['project_manager', 'site_engineer', 'qs', 'safety_officer', 'supervisor', 'foreman'];

// Feature flag: while PROJECT_CREATION_WIZARD is off (default) POST /api/projects
// keeps the legacy single-INSERT path. When the wizard is verified in staging,
// flip the flag on; after that the legacy path can be deleted outright.
function wizardEnabled() {
  return ['1', 'true', 'on'].includes(String(process.env.PROJECT_CREATION_WIZARD || '').toLowerCase());
}

// Project-bound users only see the projects they are assigned to (budget and contract value included).
// req.accessScope is set by authorize(); null means company-wide.
function projectScope(req, params, column = 'p.id') {
  const ids = req.accessScope && !req.accessScope.companyWide ? req.accessScope.projectIds : null;
  if (ids == null) return '';
  params.push(ids);
  return `${column} = ANY($${params.length}::int[])`;
}

router.get('/portfolio', authenticate, authorize(), async (req, res) => {
  try {
    const params = [];
    const scope = projectScope(req, params);
    const data = await queryPaginated(req, res, query, { sql: `
      SELECT p.*, c.name_ar as client_name, c.name_en as client_name_en,
             e.name_ar as project_manager_name, e.name_en as project_manager_name_en
      FROM projects p
      LEFT JOIN clients c ON p.client_id = c.id
      LEFT JOIN employees e ON p.project_manager_id = e.id
      ${scope ? `WHERE ${scope}` : ''}
    `, params, orderBy: [{ column: 'status' }, { column: 'created_at', direction: 'DESC' }] });
    res.json({ success: true, data: data.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/', authenticate, authorize(), async (req, res) => {
  try {
    const { status, project_type, search } = req.query;
    let conds = []; let p = []; let i = 1;
    if (status && PROJECT_STATUSES.includes(status)) { conds.push(`p.status = $${i++}`); p.push(status); }
    if (project_type && PROJECT_TYPES.includes(project_type)) { conds.push(`p.project_type = $${i++}`); p.push(project_type); }
    if (search) { conds.push(`(p.code ILIKE $${i} OR p.name_en ILIKE $${i} OR p.name_ar ILIKE $${i})`); p.push(`%${search}%`); i++; }
    const scope = projectScope(req, p);
    if (scope) { conds.push(scope); i++; }
    const w = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const data = await queryPaginated(req, res, query, {
      sql: `SELECT p.*, c.name_ar as client_name, c.name_en as client_name_en, e.name_ar as project_manager_name, e.name_en as project_manager_name_en FROM projects p LEFT JOIN clients c ON p.client_id = c.id LEFT JOIN employees e ON p.project_manager_id = e.id ${w}`,
      params: p,
      orderBy: [{ column: 'created_at', direction: 'DESC' }],
    });
    res.json({ success: true, data: data.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// -- Wizard templates (registered before /:id so "templates" is not read as an id) --
router.get('/templates', authenticate, authorize(), async (req, res) => {
  try {
    const data = await query('SELECT id, key, name, project_type, description, is_active FROM project_templates WHERE is_active = true ORDER BY name');
    res.json({ success: true, data: data.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/templates/:key', authenticate, authorize(), async (req, res) => {
  try {
    const t = await query('SELECT * FROM project_templates WHERE key = $1 AND is_active = true', [req.params.key]);
    if (t.rows.length === 0) return res.status(404).json({ success: false, error: 'Template not found' });
    const template = t.rows[0];
    // default_values may come back as a JSON string depending on the driver.
    if (typeof template.default_values === 'string') {
      try { template.default_values = JSON.parse(template.default_values); } catch (e) { /* leave as-is */ }
    }
    const [locations, wbs, folders, workflows, rules] = await Promise.all([
      query('SELECT parent_code, code, location_type_code, name, name_en, name_ar, sort_order FROM template_locations WHERE template_id = $1 ORDER BY sort_order, id', [template.id]),
      query('SELECT parent_code, code, name, name_en, name_ar, wbs_level, sort_order FROM template_wbs WHERE template_id = $1 ORDER BY sort_order, id', [template.id]),
      query('SELECT code, name, folder_type FROM template_folders WHERE template_id = $1 ORDER BY sort_order, id', [template.id]),
      query('SELECT code, name, description, steps FROM template_workflows WHERE template_id = $1 ORDER BY sort_order, id', [template.id]),
      query('SELECT module, threshold_amount, approver_role, stage FROM template_approval_rules WHERE template_id = $1 ORDER BY sort_order, id', [template.id]),
    ]);
    res.json({ success: true, data: { ...template, locations: locations.rows, wbs: wbs.rows, folders: folders.rows, workflows: workflows.rows, approval_rules: rules.rows } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Explicit wizard route (works regardless of the flag) — the 11-step UI posts
// here; the same transactional provisioning backs both endpoints.
router.post('/wizard', authenticate, authorize(), async (req, res) => {
  return wizardCreate(req, res);
});

router.get('/:id', authenticate, authorize(), async (req, res) => {
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

// POST /api/projects — dispatcher. Legacy single-INSERT stays available while
// the wizard flag is off; once PROJECT_CREATION_WIZARD is enabled the wizard
// provisioning transaction takes over the same route.
router.post('/', authenticate, authorize(), async (req, res) => {
  if (wizardEnabled()) return wizardCreate(req, res);
  return legacyCreate(req, res);
});

// Wizard path: one transaction provisions everything (project row, root
// location, root WBS, team + user_project_roles, participants, workflows,
// folders/registers, numbering, dashboard prefs). Any failure rolls back the
// whole thing — no half-created project.
const wizardCreate = async (req, res) => {
  try {
    const schema = Joi.object({
      name_ar: Joi.string().required(),
      name_en: Joi.string().allow(''),
      code: Joi.string().optional(),
      project_number: Joi.string().allow('', null),
      project_type: Joi.string().valid(...PROJECT_TYPES).default('commercial'),
      template_key: Joi.string().allow(null, ''),
      client_id: Joi.number().integer().allow(null),
      consultant_organization_id: Joi.number().integer().allow(null),
      project_manager_id: Joi.number().integer().allow(null),
      address: Joi.string().allow('', null), city: Joi.string().allow('', null),
      country: Joi.string().allow('', null),
      gps_latitude: Joi.number().allow(null), gps_longitude: Joi.number().allow(null),
      timezone: Joi.string().allow('', null), currency: Joi.string().allow('', null),
      tax_profile: Joi.string().allow('', null),
      contract_value: Joi.number().min(0).default(0),
      budget: Joi.number().min(0).default(0),
      original_contract_value: Joi.number().min(0).allow(null),
      original_budget: Joi.number().min(0).allow(null),
      dlp_period_months: Joi.number().integer().allow(null),
      warranty_period_months: Joi.number().integer().allow(null),
      retention_percentage: Joi.number().min(0).max(100).allow(null),
      retention_cap_amount: Joi.number().min(0).allow(null),
      advance_payment_amount: Joi.number().min(0).allow(null),
      advance_payment_percentage: Joi.number().min(0).max(100).allow(null),
      liquidated_damages_rate: Joi.number().min(0).allow(null),
      liquidated_damages_cap: Joi.number().min(0).allow(null),
      start_date: Joi.date().iso().allow(null),
      expected_completion: Joi.date().iso().allow(null),
      status: Joi.string().valid(...PROJECT_STATUSES).default('planning'),
      visibility_policy: Joi.string().valid('standard', 'restricted', 'client_visible').default('standard'),
      team: Joi.array().items(Joi.object({
        employee_id: Joi.number().integer().required(),
        user_id: Joi.number().integer().allow(null),
        email: Joi.string().email().allow(null, ''),
        role: Joi.string().valid(...TEAM_ROLES).default('site_engineer'),
      })).default([]),
      participants: Joi.array().items(Joi.object({
        organization_id: Joi.number().integer().allow(null),
        client_id: Joi.number().integer().allow(null),
        participant_type: Joi.string().valid('consultant', 'client', 'supplier', 'subcontractor').required(),
        portal_access_enabled: Joi.boolean().default(false),
      })).default([]),
      boq: Joi.alternatives().try(Joi.string(), Joi.object()).allow(null),
      schedule: Joi.alternatives().try(Joi.string(), Joi.object()).allow(null),
      notifications: Joi.object({
        sla_hours: Joi.number().integer().min(1).default(48),
        channels: Joi.array().items(Joi.string()).default([]),
      }).allow(null),
    }).unknown(true);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const result = await transaction(async (client) => {
      const out = await provisioning.provisionProject(value, { client, templateKey: value.template_key, createdBy: req.user.id });
      await fireEvent({ eventType: 'project.created', entityType: 'project', entityId: out.project.id, userId: req.user.id, userName: req.user.name, userRole: req.user.role, payload: { project_id: out.project.id, code: out.project.code, name: out.project.name, via: 'wizard' } }, { query: client.query.bind(client) });
      await logActivity({
        userId: req.user.id, userName: req.user.name, userRole: req.user.role,
        action: 'create', module: 'projects',
        description: `Provisioned project ${out.project.code} via wizard (${out.steps.length} steps)`,
        entityId: out.project.id, entityType: 'project',
      }, { query: client.query.bind(client) });
      return out;
    });
    res.status(201).json({ success: true, data: result.project, counts: result.counts, steps: result.steps });
  } catch (e) {
    console.error('Wizard provisioning failed:', e);
    res.status(500).json({ success: false, error: `Provisioning failed, rolled back: ${e.message}` });
  }
};

// Legacy single-INSERT path (kept behind the feature flag until the wizard is
// verified in staging, then removable).
const legacyCreate = async (req, res) => {
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

    const result = await transaction(async (client) => {
      // The number is drawn on the transaction client so a rolled-back create does not burn a counter.
      if (!value.code) {
        value.code = await nextNumber(client.query.bind(client), { table: 'projects', column: 'code', prefix: 'PRJ', pad: 4 });
      }
      const project = await client.query(
        `INSERT INTO projects (code, name, name_ar, name_en, address, city, project_type, client_id, project_manager_id, contract_value, budget, start_date, expected_completion, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [value.code, value.name_ar, value.name_ar, value.name_en || value.name_ar, value.address, value.city, value.project_type, value.client_id, value.project_manager_id, value.contract_value, value.budget, value.start_date, value.expected_completion, value.status]
      );
      const createdProject = project.rows[0];
      await fireEvent({ eventType: 'project.created', entityType: 'project', entityId: createdProject.id, userId: req.user.id, userName: req.user.name, userRole: req.user.role, payload: { project_id: createdProject.id, code: createdProject.code, name: createdProject.name } }, { query: client.query.bind(client) });
      await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'projects', description: `Created project ${value.code}`, entityId: createdProject.id, entityType: 'project' }, { query: client.query.bind(client) });
      return createdProject;
    });
    res.status(201).json({ success: true, data: result });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
};

router.put('/:id', authenticate, authorize(), async (req, res) => {
  try {
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
    const outcome = await transaction(async (client) => {
      const q = client.query.bind(client);
      const existing = await q('SELECT * FROM projects WHERE id = $1 FOR UPDATE', [req.params.id]);
      if (existing.rows.length === 0) return { notFound: true };
      const updated = await q(`UPDATE projects SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`, p);

      // Progress overrides require a separate policy action and a separate audit entry.
      if (value.completion_percentage !== undefined) {
        await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'override_progress', module: 'projects', description: `Manual progress override on project ${existing.rows[0].code}: ${existing.rows[0].completion_percentage}% -> ${value.completion_percentage}%`, entityId: req.params.id, entityType: 'project' }, { query: q });
      }
      await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'projects', description: `Updated project ${existing.rows[0].code}`, entityId: req.params.id, entityType: 'project' }, { query: q });
      return { row: updated.rows[0] };
    });
    if (outcome.notFound) return res.status(404).json({ success: false, error: 'Project not found' });
    res.json({ success: true, data: outcome.row });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// -- Phases --
router.post('/:id/phases', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      code: Joi.string().optional(), name_ar: Joi.string().required(), name_en: Joi.string().allow(''),
      sort_order: Joi.number().integer().default(0), start_date: Joi.date().iso().allow(null),
      end_date: Joi.date().iso().allow(null), budget: Joi.number().min(0).default(0),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const out = await auditedMutation(req, { action: 'create', module: 'projects', entityType: 'project_phase' }, async (q) => {
      const r = await q(
        `INSERT INTO project_phases (project_id, code, name, name_ar, name_en, sort_order, start_date, end_date, budget)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [req.params.id, value.code || `PH-${value.sort_order}`, value.name_ar, value.name_ar, value.name_en || value.name_ar, value.sort_order, value.start_date, value.end_date, value.budget]
      );
      return { data: r.rows[0], entityId: r.rows[0].id, projectId: r.rows[0].project_id, after: r.rows[0], amount: Number(r.rows[0].budget), description: `Created phase ${r.rows[0].code}` };
    });
    res.status(201).json({ success: true, data: out.data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:projectId/phases/:phaseId', authenticate, authorize(), async (req, res) => {
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
    p.push(req.params.phaseId, req.params.projectId);
    const outcome = await auditedMutation(req, { action: 'update', module: 'projects', entityType: 'project_phase' }, async (q) => {
      const before = (await q('SELECT * FROM project_phases WHERE id = $1 AND project_id = $2 FOR UPDATE', [req.params.phaseId, req.params.projectId])).rows[0];
      if (!before) return { skipAudit: true, notFound: true };
      const updated = await q(`UPDATE project_phases SET ${sets.join(', ')} WHERE id = $${i} AND project_id = $${i + 1} RETURNING *`, p);
      // Every phase change is audited; a manual completion override keeps its distinct action.
      const override = value.completion_percentage !== undefined;
      return {
        row: updated.rows[0], entityId: before.id, projectId: before.project_id, before, after: updated.rows[0],
        oldStatus: before.status, newStatus: updated.rows[0].status, action: override ? 'override_progress' : 'update',
        description: override
          ? `Manual progress override on phase ${updated.rows[0].code || updated.rows[0].id} of project #${req.params.projectId}`
          : `Updated phase ${updated.rows[0].code || updated.rows[0].id} of project #${req.params.projectId}`,
      };
    });
    if (outcome.notFound) return res.status(404).json({ success: false, error: 'Phase not found' });
    res.json({ success: true, data: outcome.row });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:projectId/phases/:phaseId', authenticate, authorize(), async (req, res) => {
  try {
    const out = await auditedMutation(req, { action: 'delete', module: 'projects', entityType: 'project_phase' }, async (q) => {
      const r = await q('DELETE FROM project_phases WHERE id = $1 AND project_id = $2 RETURNING *', [req.params.phaseId, req.params.projectId]);
      if (r.rowCount === 0) return { skipAudit: true };
      return { data: r.rows[0], entityId: r.rows[0].id, projectId: r.rows[0].project_id, before: r.rows[0], description: `Deleted phase ${r.rows[0].code}` };
    });
    if (!out.data) return res.status(404).json({ success: false, error: 'Phase not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// -- Team --
router.post('/:id/team', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      employee_id: Joi.number().integer().required(), role: Joi.string().valid(...TEAM_ROLES).default('site_engineer'),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const out = await auditedMutation(req, { action: 'assign', module: 'projects', entityType: 'project_team' }, async (q) => {
      const existing = await q('SELECT id FROM project_team WHERE project_id = $1 AND employee_id = $2', [req.params.id, value.employee_id]);
      if (existing.rows.length > 0) return { skipAudit: true, duplicate: true };
      const r = await q('INSERT INTO project_team (project_id, employee_id, role) VALUES ($1,$2,$3) RETURNING *', [req.params.id, value.employee_id, value.role]);
      return { data: r.rows[0], entityId: r.rows[0].id, projectId: r.rows[0].project_id, after: r.rows[0], description: `Added employee ${value.employee_id} to project #${req.params.id} as ${value.role}` };
    });
    if (out.duplicate) return res.status(400).json({ success: false, error: 'Employee already in team' });
    res.status(201).json({ success: true, data: out.data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:projectId/team/:teamId', authenticate, authorize(), async (req, res) => {
  try {
    const out = await auditedMutation(req, { action: 'unassign', module: 'projects', entityType: 'project_team' }, async (q) => {
      const r = await q('DELETE FROM project_team WHERE id = $1 AND project_id = $2 RETURNING *', [req.params.teamId, req.params.projectId]);
      if (r.rowCount === 0) return { skipAudit: true };
      return { data: r.rows[0], entityId: r.rows[0].id, projectId: r.rows[0].project_id, before: r.rows[0], description: `Removed employee ${r.rows[0].employee_id} from project #${req.params.projectId}` };
    });
    if (!out.data) return res.status(404).json({ success: false, error: 'Team member not found' });
    res.json({ success: true, message: 'Removed' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// -- Milestones --
router.post('/:id/milestones', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      title_ar: Joi.string().required(), title_en: Joi.string().allow(''),
      target_date: Joi.date().iso().required(), achieved_date: Joi.date().iso().allow(null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const out = await auditedMutation(req, { action: 'create', module: 'projects', entityType: 'project_milestone' }, async (q) => {
      const r = await q(
        `INSERT INTO project_milestones (project_id, title, title_ar, title_en, target_date, achieved_date)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.params.id, value.title_ar, value.title_ar, value.title_en || value.title_ar, value.target_date, value.achieved_date]
      );
      return { data: r.rows[0], entityId: r.rows[0].id, projectId: r.rows[0].project_id, after: r.rows[0], description: `Created milestone ${value.title_ar}` };
    });
    res.status(201).json({ success: true, data: out.data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:projectId/milestones/:milestoneId', authenticate, authorize(), async (req, res) => {
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
    p.push(req.params.milestoneId, req.params.projectId);
    const out = await auditedMutation(req, { action: 'update', module: 'projects', entityType: 'project_milestone' }, async (q) => {
      const before = (await q('SELECT * FROM project_milestones WHERE id = $1 AND project_id = $2 FOR UPDATE', [req.params.milestoneId, req.params.projectId])).rows[0];
      if (!before) return { skipAudit: true };
      const r = await q(`UPDATE project_milestones SET ${sets.join(', ')} WHERE id = $${i} AND project_id = $${i + 1} RETURNING *`, p);
      return { data: r.rows[0], entityId: before.id, projectId: before.project_id, before, after: r.rows[0], oldStatus: before.status, newStatus: r.rows[0].status, description: `Updated milestone ${before.title}` };
    });
    if (!out.data) return res.status(404).json({ success: false, error: 'Milestone not found' });
    res.json({ success: true, data: out.data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:projectId/milestones/:milestoneId', authenticate, authorize(), async (req, res) => {
  try {
    const out = await auditedMutation(req, { action: 'delete', module: 'projects', entityType: 'project_milestone' }, async (q) => {
      const r = await q('DELETE FROM project_milestones WHERE id = $1 AND project_id = $2 RETURNING *', [req.params.milestoneId, req.params.projectId]);
      if (r.rowCount === 0) return { skipAudit: true };
      return { data: r.rows[0], entityId: r.rows[0].id, projectId: r.rows[0].project_id, before: r.rows[0], description: `Deleted milestone ${r.rows[0].title}` };
    });
    if (!out.data) return res.status(404).json({ success: false, error: 'Milestone not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
