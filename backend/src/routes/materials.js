const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity, fireEvent } = require('../utils/activity');

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
    const recipes = (await query(`SELECT * FROM material_recipes${where} ORDER BY id`, p)).rows;

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
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
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
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
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

    if (value.project_id == null && !['owner', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Standard recipes (no project) can only be created by owner/admin' });
    }

    const recipe = await query(
      `INSERT INTO material_recipes (project_id, boq_item_id, activity_type, code, name, name_en, name_ar, output_description, output_unit, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [value.project_id ?? null, value.boq_item_id ?? null, value.activity_type ?? null, value.code || null,
       value.name, value.name_en || null, value.name_ar || null, value.output_description || null,
       value.output_unit || null, value.notes || null]
    );

    for (const line of value.lines) {
      await query(
        `INSERT INTO recipe_lines (recipe_id, material_id, factor_per_unit, wastage_pct, unit, notes)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (recipe_id, material_id)
         DO UPDATE SET factor_per_unit = EXCLUDED.factor_per_unit, wastage_pct = EXCLUDED.wastage_pct, unit = EXCLUDED.unit`,
        [recipe.rows[0].id, line.material_id, line.factor_per_unit, line.wastage_pct, line.unit || null, line.notes || null]
      );
    }

    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'create', module: 'materials',
      description: `Created recipe ${value.name}`,
      entityId: recipe.rows[0].id, entityType: 'material_recipe',
    });

    // Factors changed → re-derive demand (durable event; catch-up safe).
    await fireEvent({
      eventType: 'recipe.changed', entityType: 'material_recipe', entityId: recipe.rows[0].id,
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      payload: { recipe_id: recipe.rows[0].id, project_id: value.project_id ?? null, boq_item_id: value.boq_item_id ?? null },
    }).catch(() => {});

    res.status(201).json({ success: true, data: recipe.rows[0] });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// PUT /api/materials/recipes/:id — header fields only; lines have their own routes.
router.put('/recipes/:id', authenticate, authorize(), async (req, res) => {
  try {
    const existing = (await query('SELECT * FROM material_recipes WHERE id = $1', [req.params.id])).rows[0];
    if (!existing) return res.status(404).json({ success: false, error: 'Recipe not found' });

    const schema = Joi.object({
      name: Joi.string(),
      name_en: Joi.string().allow('', null),
      name_ar: Joi.string().allow('', null),
      output_description: Joi.string().allow('', null),
      output_unit: Joi.string().allow('', null),
      activity_type: Joi.string().valid(...ACTIVITY_TYPES).allow(null),
      boq_item_id: Joi.number().integer().allow(null),
      is_active: Joi.boolean(),
      notes: Joi.string().allow('', null),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const sets = []; const p = []; let i = 1;
    for (const [k, v] of Object.entries(value)) { if (v !== undefined) { sets.push(`${k} = $${i++}`); p.push(v); } }
    sets.push(`updated_at = NOW()`);
    p.push(req.params.id);
    const r = await query(`UPDATE material_recipes SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, p);

    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'update', module: 'materials',
      description: `Updated recipe ${existing.name}`,
      entityId: existing.id, entityType: 'material_recipe',
    });
    await fireEvent({
      eventType: 'recipe.changed', entityType: 'material_recipe', entityId: existing.id,
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      payload: { recipe_id: existing.id, project_id: existing.project_id, boq_item_id: value.boq_item_id ?? existing.boq_item_id },
    }).catch(() => {});

    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// POST /api/materials/recipes/:id/lines — upsert one factor line.
router.post('/recipes/:id/lines', authenticate, authorize(), async (req, res) => {
  try {
    const recipe = (await query('SELECT * FROM material_recipes WHERE id = $1', [req.params.id])).rows[0];
    if (!recipe) return res.status(404).json({ success: false, error: 'Recipe not found' });
    const { error, value } = lineSchema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const r = await query(
      `INSERT INTO recipe_lines (recipe_id, material_id, factor_per_unit, wastage_pct, unit, notes)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (recipe_id, material_id)
       DO UPDATE SET factor_per_unit = EXCLUDED.factor_per_unit, wastage_pct = EXCLUDED.wastage_pct,
                     unit = EXCLUDED.unit, notes = EXCLUDED.notes
       RETURNING *`,
      [recipe.id, value.material_id, value.factor_per_unit, value.wastage_pct, value.unit || null, value.notes || null]
    );

    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'update', module: 'materials',
      description: `Set recipe line: material ${value.material_id} factor ${value.factor_per_unit}/${recipe.output_unit || 'unit'}`,
      entityId: recipe.id, entityType: 'material_recipe',
    });
    await fireEvent({
      eventType: 'recipe.changed', entityType: 'material_recipe', entityId: recipe.id,
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      payload: { recipe_id: recipe.id, project_id: recipe.project_id, boq_item_id: recipe.boq_item_id },
    }).catch(() => {});

    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// DELETE /api/materials/recipes/:id/lines/:lineId
router.delete('/recipes/:id/lines/:lineId', authenticate, authorize(), async (req, res) => {
  try {
    const r = await query('DELETE FROM recipe_lines WHERE id = $1 AND recipe_id = $2 RETURNING id', [req.params.lineId, req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Recipe line not found' });
    await fireEvent({
      eventType: 'recipe.changed', entityType: 'material_recipe', entityId: parseInt(req.params.id, 10),
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      payload: { recipe_id: parseInt(req.params.id, 10) },
    }).catch(() => {});
    res.json({ success: true, message: 'Line deleted' });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
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
    const rows = (await query(
      `SELECT mr.*, im.code AS material_code, im.name_en AS material_name_en, im.name_ar AS material_name_ar,
              pl.name AS location_name, bi.code AS boq_item_code, bi.description AS boq_item_description,
              rec.name AS recipe_name
       FROM material_requirements mr
       JOIN item_master im ON im.id = mr.material_id
       LEFT JOIN project_locations pl ON pl.id = mr.project_location_id
       LEFT JOIN boq_items bi ON bi.id = mr.boq_item_id
       LEFT JOIN material_recipes rec ON rec.id = mr.recipe_id
       ${where} ORDER BY mr.source_activity_date NULLS LAST, mr.id LIMIT 500`,
      p
    )).rows;
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
