const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { queryPaginated } = require('../utils/pagination');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity, fireEvent } = require('../utils/activity');
const commercialEngine = require('../services/commercialEngine');
const costView = require('../services/costView');

const COST_CODE_TYPES = ['material', 'labour', 'equipment', 'subcontract', 'overhead', 'other'];

router.get('/codes', authenticate, authorize(), async (req, res) => {
  try {
    const data = await queryPaginated(req, res, query, { sql: 'SELECT * FROM cost_codes', orderBy: [{ column: 'code' }] });
    res.json({ success: true, data: data.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/costing/codes — create a cost code (owner/admin only: a company-wide
// chart of accounts used across every project's costing/profitability views).
router.post('/codes', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const schema = Joi.object({
      code: Joi.string().required(),
      name: Joi.string().required(),
      name_en: Joi.string().allow('', null),
      name_ar: Joi.string().allow('', null),
      parent_id: Joi.number().integer().allow(null),
      level: Joi.number().integer().min(1).default(1),
      type: Joi.string().valid(...COST_CODE_TYPES).default('material'),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error', error_params: { field: error.details[0].path.join('.') } });

    const created = await transaction(async (client) => {
      const q = client.query.bind(client);
      const r = await q(
        `INSERT INTO cost_codes (code, name, name_en, name_ar, parent_id, level, type) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [value.code, value.name, value.name_en || null, value.name_ar || null, value.parent_id ?? null, value.level, value.type]
      );
      await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'costing', description: `Created cost code ${value.code}`, entityId: r.rows[0].id, entityType: 'cost_code' }, { query: q });
      await fireEvent({ eventType: 'cost_code.created', entityType: 'cost_code', entityId: r.rows[0].id, userId: req.user.id, userName: req.user.name, userRole: req.user.role, payload: { code: value.code } }, { query: q });
      return r.rows[0];
    });
    res.status(201).json({ success: true, data: created });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ success: false, error: 'A cost code with this code already exists', error_code: 'database_conflict' });
    res.status(500).json({ success: false, error: e.message });
  }
});

// PUT /api/costing/codes/:id — edit a cost code's name/classification.
router.put('/codes/:id', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const existing = (await query('SELECT * FROM cost_codes WHERE id = $1', [req.params.id])).rows[0];
    if (!existing) return res.status(404).json({ success: false, error: 'Cost code not found', error_code: 'not_found' });

    const schema = Joi.object({
      code: Joi.string(),
      name: Joi.string(),
      name_en: Joi.string().allow('', null),
      name_ar: Joi.string().allow('', null),
      parent_id: Joi.number().integer().allow(null),
      level: Joi.number().integer().min(1),
      type: Joi.string().valid(...COST_CODE_TYPES),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error', error_params: { field: error.details[0].path.join('.') } });

    const sets = []; const p = []; let i = 1;
    for (const [k, v] of Object.entries(value)) { if (v !== undefined) { sets.push(`${k} = $${i++}`); p.push(v); } }
    p.push(req.params.id);
    const updated = await transaction(async (client) => {
      const q = client.query.bind(client);
      const r = await q(`UPDATE cost_codes SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, p);
      await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'costing', description: `Updated cost code ${existing.code}`, entityId: existing.id, entityType: 'cost_code' }, { query: q });
      return r.rows[0];
    });
    res.json({ success: true, data: updated });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ success: false, error: 'A cost code with this code already exists', error_code: 'database_conflict' });
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/project/:projectId', authenticate, authorize(), async (req, res) => {
  try {
    // The rows, the by-type split and the grand total all come from the shared cost view (services/costView.js).
    const projectId = parseInt(req.params.projectId, 10);
    const [costs, byType, grandTotal] = await Promise.all([
      costView.rows(query, projectId), costView.byType(query, projectId), costView.projectTotal(query, projectId),
    ]);

    res.json({
      success: true,
      data: { costs, summary_by_type: byType, grand_total: grandTotal }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/project/:projectId/summary', authenticate, authorize(), async (req, res) => {
  try {
    const data = await query(
      `SELECT cc.code, cc.name, cc.type, COALESCE(pb.budget_amount, 0) as budget, COALESCE(pb.revised_amount, 0) as revised,
              COALESCE(vcc.amount, 0) as actual
       FROM cost_codes cc LEFT JOIN project_budgets pb ON pb.cost_code_id = cc.id AND pb.project_id = $1
       LEFT JOIN v_project_cost_by_code vcc ON vcc.cost_code_id = cc.id AND vcc.project_id = $1
       ORDER BY cc.code`,
      [req.params.projectId]
    );
    res.json({ success: true, data: data.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/project/:projectId/profitability', authenticate, authorize(), async (req, res) => {
  try {
    // Phase 13 — the canonical EAC/forecast-margin model (replaces the legacy
    // `contract_value − total_cost`; the frozen legacy figure is served under
    // `legacy` so past reports stay explainable).
    const data = await commercialEngine.projectCommercial(query, parseInt(req.params.projectId, 10));
    if (!data) return res.status(404).json({ success: false, error: 'Project not found' });

    const legacySnapshot = await query(
      "SELECT figures FROM commercial_snapshots WHERE project_id = $1 AND snapshot_type = 'costing_legacy'",
      [req.params.projectId]
    );
    const legacy = legacySnapshot.rows[0] ? legacySnapshot.rows[0].figures : null;
    res.json({
      success: true,
      data: {
        revenue: data.forecast_revenue,
        revised_contract_value: data.revised_contract_value,
        total_cost: data.eac,
        profit: data.forecast_profit,
        profit_margin_percent: data.forecast_margin_percent,
        budget: data.current_budget,
        committed_cost: data.committed_cost,
        actual_cost: data.actual_cost,
        accrued_cost: data.accrued_cost,
        etc: data.etc,
        legacy,
      }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
