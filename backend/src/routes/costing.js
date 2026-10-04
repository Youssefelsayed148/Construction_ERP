const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { fireEvent } = require('../utils/activity');
const commercialEngine = require('../services/commercialEngine');
const costView = require('../services/costView');

router.get('/codes', authenticate, authorize(), async (req, res) => {
  try {
    const data = await query('SELECT * FROM cost_codes ORDER BY code');
    res.json({ success: true, data: data.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
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
