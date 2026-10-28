const { authorizedProjectId, authorizeProjectPayload } = require('../services/authorizedProject');
const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { queryPaginated, paginateRows } = require('../utils/pagination');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity, fireEvent } = require('../utils/activity');
const { auditedTransaction } = require('../utils/auditedTransaction');
const { auditedMutation } = require('../utils/auditedMutation');
const { routeFail } = require('../utils/typedRoute');

// Phase 9 — material planning surface: recipes (with editable factors) and
// the derived material_requirements read path. Demand rows are NEVER edited
// here — they are recomputed by materialDemand.js from the recipe + the
// allocation's planned quantity + issued consumption.

const ACTIVITY_TYPES = ['concrete_pour', 'blockwork', 'plastering', 'steel_fixing', 'formwork', 'finishing', 'earthworks', 'other'];
const REORDER_POLICIES = ['none', 'reorder_point', 'min_max', 'periodic'];

const lineSchema = Joi.object({
  material_id: Joi.number().integer().required(),
  factor_per_unit: Joi.number().min(0).required(),
  wastage_pct: Joi.number().min(0).max(100).default(0),
  unit: Joi.string().allow('', null),
  notes: Joi.string().allow('', null),
});

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

// GET /api/materials/recipes?project_id=&boq_item_id=&activity_type=&include_lines=
router.get('/recipes', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, boq_item_id, activity_type, include_standard = 'true' } = req.query;
    let conds = []; const p = []; let i = 1;
    if (project_id) { conds.push(`(project_id = $${i} OR project_id IS NULL)`); p.push(parseInt(project_id, 10)); i++; }
    if (boq_item_id) { conds.push(`boq_item_id = $${i++}`); p.push(parseInt(boq_item_id, 10)); }
    if (activity_type) { conds.push(`activity_type = $${i++}`); p.push(activity_type); }
    if (include_standard === 'false') conds.push('project_id IS NOT NULL');
    const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
    const recipes = (await queryPaginated(req, res, query, {
      sql: `SELECT * FROM material_recipes${where}`,
      params: p,
      orderBy: [{ column: 'id' }],
    })).rows;

    if (req.query.include_lines !== 'false') {
      for (const recipe of recipes) {
        recipe.lines = (await query(
          `SELECT rl.*, im.code AS material_code, im.name_en AS material_name_en, im.name_ar AS material_name_ar
           FROM recipe_lines rl JOIN item_master im ON im.id = rl.material_id
           WHERE rl.recipe_id = $1 ORDER BY rl.id`,
          [recipe.id]
        )).rows;
      }
    }
    res.json({ success: true, data: recipes });
  } catch (e) { routeFail(res, e, 'materials.GET /recipes', req); }
});

// GET /api/materials/recipes/:id
router.get('/recipes/:id', authenticate, authorize(), async (req, res) => {
  try {
    const recipe = (await query('SELECT * FROM material_recipes WHERE id = $1', [req.params.id])).rows[0];
    if (!recipe) return res.status(404).json({ success: false, error: 'Recipe not found' });
    recipe.lines = (await query(
      `SELECT rl.*, im.code AS material_code, im.name_en AS material_name_en, im.name_ar AS material_name_ar
       FROM recipe_lines rl JOIN item_master im ON im.id = rl.material_id
       WHERE rl.recipe_id = $1 ORDER BY rl.id`,
      [recipe.id]
    )).rows;
    res.json({ success: true, data: recipe });
  } catch (e) { routeFail(res, e, 'materials.GET /recipes/:id', req); }
});

// POST /api/materials/recipes — create a recipe (project-scoped override, or a
// new standard when project_id is omitted and the caller is owner/admin).
router.post('/recipes', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().optional().allow(null),
      boq_item_id: Joi.number().integer().optional().allow(null),
      activity_type: Joi.string().valid(...ACTIVITY_TYPES).optional().allow(null),
      code: Joi.string().optional().allow('', null),
      name: Joi.string().required(),
      name_en: Joi.string().allow('', null),
      name_ar: Joi.string().allow('', null),
      output_description: Joi.string().allow('', null),
      output_unit: Joi.string().allow('', null),
      notes: Joi.string().allow('', null),
      lines: Joi.array().items(lineSchema).default([]),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    authorizeProjectPayload(req, value);

    if (authorizedProjectId(req, value) == null && !['owner', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Standard recipes (no project) can only be created by owner/admin' });
    }

    const recipe = await auditedTransaction(async (q) => {
      const created = await q(
      `INSERT INTO material_recipes (project_id, boq_item_id, activity_type, code, name, name_en, name_ar, output_description, output_unit, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [authorizedProjectId(req, value) ?? null, value.boq_item_id ?? null, value.activity_type ?? null, value.code || null,
       value.name, value.name_en || null, value.name_ar || null, value.output_description || null,
       value.output_unit || null, value.notes || null]
      );

      for (const line of value.lines) {
        await q(
        `INSERT INTO recipe_lines (recipe_id, material_id, factor_per_unit, wastage_pct, unit, notes)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (recipe_id, material_id)
         DO UPDATE SET factor_per_unit = EXCLUDED.factor_per_unit, wastage_pct = EXCLUDED.wastage_pct, unit = EXCLUDED.unit`,
        [created.rows[0].id, line.material_id, line.factor_per_unit, line.wastage_pct, line.unit || null, line.notes || null]
        );
      }
      await fireEvent({
        eventType: 'recipe.changed', entityType: 'material_recipe', entityId: created.rows[0].id,
        userId: req.user.id, userName: req.user.name, userRole: req.user.role,
        payload: { recipe_id: created.rows[0].id, project_id: authorizedProjectId(req, value) ?? null, boq_item_id: value.boq_item_id ?? null },
      }, { query: q });
      return created;
    }, (result) => ({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'create', module: 'materials',
      description: `Created recipe ${value.name}`,
      entityId: result.rows[0].id, entityType: 'material_recipe',
    }));

    // Factors changed → re-derive demand (durable event; catch-up safe).
    res.status(201).json({ success: true, data: recipe.rows[0] });
  } catch (e) { routeFail(res, e, 'materials.POST /recipes', req); }
});

// PUT /api/materials/recipes/:id — header fields only; lines have their own routes.
router.put('/recipes/:id', authenticate, authorize(), async (req, res) => {
  try {
    const existing = (await query('SELECT * FROM material_recipes WHERE id = $1', [req.params.id])).rows[0];
    if (!existing) return res.status(404).json({ success: false, error: 'Recipe not found' });

    const schema = Joi.object({
      code: Joi.string().allow('', null),
      name: Joi.string(),
      name_en: Joi.string().allow('', null),
      name_ar: Joi.string().allow('', null),
      output_description: Joi.string().allow('', null),
      output_unit: Joi.string().allow('', null),
      activity_type: Joi.string().valid(...ACTIVITY_TYPES).allow(null),
      boq_item_id: Joi.number().integer().allow(null),
      is_active: Joi.boolean(),
      notes: Joi.string().allow('', null),
      // Admin screen (G6) submits the lines alongside the header in one save;
      // upsert them the same way the create route does, in the same transaction.
      lines: Joi.array().items(lineSchema).optional(),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const { lines, ...headerValue } = value;

    const sets = []; const p = []; let i = 1;
    for (const [k, v] of Object.entries(headerValue)) { if (v !== undefined) { sets.push(`${k} = $${i++}`); p.push(v); } }
    if (sets.length === 0) sets.push('updated_at = updated_at'); // lines-only save still touches the row below
    sets.push(`updated_at = NOW()`);
    p.push(req.params.id);
    const r = await auditedTransaction(async (q) => {
      const updated = await q(`UPDATE material_recipes SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, p);
      if (Array.isArray(lines)) {
        for (const line of lines) {
          await q(
            `INSERT INTO recipe_lines (recipe_id, material_id, factor_per_unit, wastage_pct, unit, notes)
             VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (recipe_id, material_id)
             DO UPDATE SET factor_per_unit = EXCLUDED.factor_per_unit, wastage_pct = EXCLUDED.wastage_pct,
                           unit = EXCLUDED.unit, notes = EXCLUDED.notes`,
            [existing.id, line.material_id, line.factor_per_unit, line.wastage_pct, line.unit || null, line.notes || null]
          );
        }
      }
      await fireEvent({
        eventType: 'recipe.changed', entityType: 'material_recipe', entityId: existing.id,
        userId: req.user.id, userName: req.user.name, userRole: req.user.role,
        payload: { recipe_id: existing.id, project_id: existing.project_id, boq_item_id: headerValue.boq_item_id ?? existing.boq_item_id },
      }, { query: q });
      return updated;
    }, () => ({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'update', module: 'materials',
      description: `Updated recipe ${existing.name}`,
      entityId: existing.id, entityType: 'material_recipe',
    }));

    res.json({ success: true, data: r.rows[0] });
  } catch (e) { routeFail(res, e, 'materials.PUT /recipes/:id', req); }
});

// POST /api/materials/recipes/:id/lines — upsert one factor line.
router.post('/recipes/:id/lines', authenticate, authorize(), async (req, res) => {
  try {
    const recipe = (await query('SELECT * FROM material_recipes WHERE id = $1', [req.params.id])).rows[0];
    if (!recipe) return res.status(404).json({ success: false, error: 'Recipe not found' });
    const { error, value } = lineSchema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const r = await auditedTransaction(async (q) => {
      const upserted = await q(
      `INSERT INTO recipe_lines (recipe_id, material_id, factor_per_unit, wastage_pct, unit, notes)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (recipe_id, material_id)
       DO UPDATE SET factor_per_unit = EXCLUDED.factor_per_unit, wastage_pct = EXCLUDED.wastage_pct,
                     unit = EXCLUDED.unit, notes = EXCLUDED.notes
       RETURNING *`,
      [recipe.id, value.material_id, value.factor_per_unit, value.wastage_pct, value.unit || null, value.notes || null]
      );
      await fireEvent({
        eventType: 'recipe.changed', entityType: 'material_recipe', entityId: recipe.id,
        userId: req.user.id, userName: req.user.name, userRole: req.user.role,
        payload: { recipe_id: recipe.id, project_id: recipe.project_id, boq_item_id: recipe.boq_item_id },
      }, { query: q });
      return upserted;
    }, () => ({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'update', module: 'materials',
      description: `Set recipe line: material ${value.material_id} factor ${value.factor_per_unit}/${recipe.output_unit || 'unit'}`,
      entityId: recipe.id, entityType: 'material_recipe',
    }));

    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { routeFail(res, e, 'materials.POST /recipes/:id/lines', req); }
});

// DELETE /api/materials/recipes/:id/lines/:lineId
router.delete('/recipes/:id/lines/:lineId', authenticate, authorize(), async (req, res) => {
  try {
    const out = await auditedMutation(req, { action: 'delete', module: 'materials', entityType: 'recipe_line' }, async (q) => {
      const r = await q('DELETE FROM recipe_lines WHERE id = $1 AND recipe_id = $2 RETURNING *', [req.params.lineId, req.params.id]);
      if (r.rows.length === 0) return { skipAudit: true };
      await fireEvent({
        eventType: 'recipe.changed', entityType: 'material_recipe', entityId: parseInt(req.params.id, 10),
        userId: req.user.id, userName: req.user.name, userRole: req.user.role,
        payload: { recipe_id: parseInt(req.params.id, 10) },
      }, { query: q });
      return { data: r.rows[0], entityId: r.rows[0].id, before: r.rows[0], description: `Removed recipe line ${r.rows[0].id} from recipe #${req.params.id}` };
    });
    if (!out.data) return res.status(404).json({ success: false, error: 'Recipe line not found' });
    res.json({ success: true, message: 'Line deleted' });
  } catch (e) { routeFail(res, e, 'materials.DELETE /recipes/:id/lines/:lineId', req); }
});

// ---------------------------------------------------------------------------
// Requirements — derived read path (no writes here, ever)
// ---------------------------------------------------------------------------

// GET /api/materials/requirements?project_id=&location_id=&boq_item_id=&material_id=&date_from=&date_to=
router.get('/requirements', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, location_id, boq_item_id, material_id, date_from, date_to } = req.query;
    let conds = []; const p = []; let i = 1;
    if (project_id) { conds.push(`mr.project_id = $${i++}`); p.push(parseInt(project_id, 10)); }
    if (location_id) { conds.push(`mr.project_location_id = $${i++}`); p.push(parseInt(location_id, 10)); }
    if (boq_item_id) { conds.push(`mr.boq_item_id = $${i++}`); p.push(parseInt(boq_item_id, 10)); }
    if (material_id) { conds.push(`mr.material_id = $${i++}`); p.push(parseInt(material_id, 10)); }
    if (date_from) { conds.push(`mr.source_activity_date >= $${i++}`); p.push(date_from); }
    if (date_to) { conds.push(`mr.source_activity_date <= $${i++}`); p.push(date_to); }
    const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
    const page = await queryPaginated(req, res, query, {
      sql: `SELECT mr.*, im.code AS material_code, im.name_en AS material_name_en, im.name_ar AS material_name_ar,
              pl.name AS location_name, bi.code AS boq_item_code, bi.description AS boq_item_description,
              rec.name AS recipe_name
       FROM material_requirements mr
       JOIN item_master im ON im.id = mr.material_id
       LEFT JOIN project_locations pl ON pl.id = mr.project_location_id
       LEFT JOIN boq_items bi ON bi.id = mr.boq_item_id
       LEFT JOIN material_recipes rec ON rec.id = mr.recipe_id
       ${where}`,
      params: p,
      orderBy: [{ column: 'mr.source_activity_date', direction: 'ASC' }, { column: 'mr.id' }],
    });
    res.json({ success: true, data: page.rows });
  } catch (e) { routeFail(res, e, 'materials.GET /requirements', req); }
});

// ---------------------------------------------------------------------------
// Replenishment (5.3): alerts, policy/mode configuration, the manual sweep and the open requirement.
// The policy store is business_rules ('replenishment_policy:material:<id>' > ':category:<cat>' > ':default'),
// exactly what services/replenishment.getPolicy reads, so this surface and the sweep cannot disagree.
// ---------------------------------------------------------------------------
const replenishment = require('../services/replenishment');
const sweepLeader = require('../services/sweepLeader');

const replFail = (res, status, code, message, params = {}) =>
  res.status(status).json({ success: false, error: message, error_code: code, error_params: params });

// GET /api/materials/replenishment/alerts?status=open&alert_type=&material_id=
router.get('/replenishment/alerts', authenticate, authorize(), async (req, res) => {
  try {
    const conds = []; const p = [];
    const status = req.query.status || 'open';
    if (status !== 'all') conds.push(`a.status = $${p.push(status)}`);
    if (req.query.alert_type) conds.push(`a.alert_type = $${p.push(req.query.alert_type)}`);
    if (req.query.material_id) conds.push(`a.material_id = $${p.push(parseInt(req.query.material_id, 10))}`);
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const page = await queryPaginated(req, res, query, {
      sql: `SELECT a.*, im.code AS material_code, im.name_en AS material_name_en, im.name_ar AS material_name_ar
         FROM replenishment_alerts a LEFT JOIN item_master im ON im.id = a.material_id ${where}`,
      params: p,
      orderBy: [{ column: 'a.created_at', direction: 'DESC' }, { column: 'a.id', direction: 'DESC' }],
    });
    res.json({ success: true, data: page.rows });
  } catch (e) { console.error('[MATERIALS] alerts', e); return replFail(res, 500, 'replenishment_error', e.message); }
});

// GET /api/materials/replenishment/policies  (every stored policy row, plus the modes the sweep understands)
router.get('/replenishment/policies', authenticate, authorize(), async (req, res) => {
  try {
    const rows = (await queryPaginated(req, res, query, {
      sql: "SELECT rule_key, rule_value, is_active, updated_at FROM business_rules WHERE rule_key LIKE 'replenishment_policy:%'",
      orderBy: [{ column: 'rule_key' }],
      tieBreaker: 'rule_key',
    })).rows;
    res.json({ success: true, data: rows, modes: replenishment.MODES, default_mode: replenishment.DEFAULT_MODE });
  } catch (e) { console.error('[MATERIALS] policies', e); return replFail(res, 500, 'replenishment_error', e.message); }
});

const policyBody = Joi.object({
  scope: Joi.string().valid('default', 'category', 'material').required(),
  ref: Joi.alternatives().conditional('scope', { is: 'default', then: Joi.any().strip(), otherwise: Joi.string().required() }),
  mode: Joi.string().valid(...replenishment.MODES).required(),
  authority_ceiling: Joi.number().min(0).allow(null),
  target_max_stock: Joi.number().min(0).allow(null),
  enabled: Joi.boolean().default(true),
});

function policyKeyOf({ scope, ref }) {
  return scope === 'default' ? 'replenishment_policy:default' : `replenishment_policy:${scope}:${ref}`;
}

// PUT /api/materials/replenishment/policies  { scope, ref, mode, ... }
router.put('/replenishment/policies', authenticate, authorize(), async (req, res) => {
  try {
    const { error, value } = policyBody.validate(req.body);
    if (error) return replFail(res, 400, 'validation_error', error.details[0].message, { field: error.details[0].path.join('.') });
    if (value.scope === 'material') {
      const item = (await query('SELECT id FROM item_master WHERE id = $1', [parseInt(value.ref, 10)])).rows[0];
      if (!item) return replFail(res, 404, 'material_not_found', `Material #${value.ref} not found`, { material_id: value.ref });
    }
    const ruleValue = { mode: value.mode, enabled: value.enabled };
    if (value.authority_ceiling != null) ruleValue.authority_ceiling = value.authority_ceiling;
    if (value.target_max_stock != null) ruleValue.target_max_stock = value.target_max_stock;
    const key = policyKeyOf(value);
    const row = await auditedTransaction(async (q) => {
      const result = await q(
      `INSERT INTO business_rules (rule_key, rule_value, description) VALUES ($1, $2::jsonb, 'Replenishment policy')
       ON CONFLICT (rule_key) DO UPDATE SET rule_value = EXCLUDED.rule_value, is_active = true, updated_at = NOW() RETURNING rule_key, rule_value, updated_at`,
      [key, JSON.stringify(ruleValue)]);
      return result.rows[0];
    }, () => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'materials', description: `Replenishment policy ${key} set to ${value.mode}`, entityId: null, entityType: 'replenishment_policy' }));
    res.json({ success: true, data: row });
  } catch (e) { console.error('[MATERIALS] policy put', e); return replFail(res, 500, 'replenishment_error', e.message); }
});

// DELETE /api/materials/replenishment/policies?scope=material&ref=12 : drop an override (the default row stays)
router.delete('/replenishment/policies', authenticate, authorize(), async (req, res) => {
  try {
    const scope = req.query.scope;
    if (!['category', 'material'].includes(scope) || !req.query.ref) {
      return replFail(res, 400, 'policy_scope_invalid', 'Only a category or material override can be removed (scope and ref are required); the default policy stays', { scope });
    }
    const key = policyKeyOf({ scope, ref: req.query.ref });
    const r = await auditedTransaction((q) => q('DELETE FROM business_rules WHERE rule_key = $1 RETURNING rule_key', [key]), (result) => result.rows[0] && ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'delete', module: 'materials', description: `Replenishment policy ${key} removed`, entityId: null, entityType: 'replenishment_policy' }));
    if (r.rows.length === 0) return replFail(res, 404, 'policy_not_found', `No policy ${key}`, { rule_key: key });
    res.json({ success: true, data: { rule_key: key } });
  } catch (e) { console.error('[MATERIALS] policy delete', e); return replFail(res, 500, 'replenishment_error', e.message); }
});

// POST /api/materials/replenishment/sweep : the same sweep the scheduler runs, under the same leader lock, so a
// manual run and a scheduled one never overlap. Idempotent: it raises nothing the data does not call for.
router.post('/replenishment/sweep', authenticate, authorize(), async (req, res) => {
  try {
    let outcome = null;
    const run = await sweepLeader.runSweepAsLeader('replenishment', async () => { outcome = await replenishment.runReplenishmentSweep(); });
    if (!run.ran) return replFail(res, 409, 'sweep_already_running', 'A replenishment sweep is already running', {});
    if (run.record.status === 'failed') return replFail(res, 500, 'sweep_failed', run.record.error || 'Replenishment sweep failed', {});
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'materials', description: `Manual replenishment sweep: ${outcome.evaluated} evaluated`, entityId: null, entityType: 'replenishment_sweep' });
    res.json({
      success: true,
      data: {
        evaluated: outcome.evaluated, skipped: outcome.skipped, other_alerts: outcome.other_alerts,
        requisitions_raised: outcome.results.reduce((n, r) => n + ((r.actions && r.actions.purchase_requests) || []).filter((x) => x.created).length, 0),
      },
    });
  } catch (e) { console.error('[MATERIALS] sweep', e); return replFail(res, 500, 'replenishment_error', e.message); }
});

// GET /api/materials/replenishment/open-requirements?project_id=&material_id= : the one formula, per material
router.get('/replenishment/open-requirements', authenticate, authorize(), async (req, res) => {
  try {
    const projectId = req.query.project_id ? parseInt(req.query.project_id, 10) : null;
    if (req.query.project_id && !Number.isInteger(projectId)) return replFail(res, 400, 'project_id_invalid', 'project_id must be an integer', {});
    const materialIds = req.query.material_id
      ? [parseInt(req.query.material_id, 10)]
      : (await query("SELECT DISTINCT material_id FROM material_requirements WHERE status = 'planned' AND material_id IS NOT NULL")).rows.map((r) => r.material_id);
    const data = [];
    for (const materialId of materialIds) {
      const row = await replenishment.openProcurementRequirement(query, materialId, { projectId });
      const item = (await query('SELECT code, name_en, name_ar, unit FROM item_master WHERE id = $1', [materialId])).rows[0] || {};
      data.push({ ...row, material_code: item.code, material_name_en: item.name_en, material_name_ar: item.name_ar, unit: item.unit });
    }
    const rows = data.filter((d) => req.query.include_zero === 'true' || d.requirement > 0);
    res.json({ success: true, data: paginateRows(req, res, rows, { orderBy: [{ column: 'material_id' }], tieBreaker: 'material_id' }).rows });
  } catch (e) { console.error('[MATERIALS] open requirements', e); return replFail(res, 500, 'replenishment_error', e.message); }
});

module.exports = router;
