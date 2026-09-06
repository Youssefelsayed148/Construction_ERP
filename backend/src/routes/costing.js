const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { fireEvent } = require('../utils/activity');

router.get('/codes', authenticate, async (req, res) => {
  try {
    const data = await query('SELECT * FROM cost_codes ORDER BY code');
    res.json({ success: true, data: data.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/project/:projectId', authenticate, async (req, res) => {
  try {
    const costs = await query(
      `SELECT pc.*, cc.name as cost_code_name, cc.type as cost_code_type
       FROM project_costs pc LEFT JOIN cost_codes cc ON pc.cost_code_id = cc.id
       WHERE pc.project_id = $1 ORDER BY pc.transaction_date DESC`,
      [req.params.projectId]
    );

    const byType = await query(
      `SELECT cc.type, COALESCE(SUM(pc.amount), 0) as total
       FROM project_costs pc LEFT JOIN cost_codes cc ON pc.cost_code_id = cc.id
       WHERE pc.project_id = $1 GROUP BY cc.type`,
      [req.params.projectId]
    );

    const grandTotal = costs.rows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);

    res.json({
      success: true,
      data: { costs: costs.rows, summary_by_type: byType.rows, grand_total: grandTotal }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/project/:projectId/summary', authenticate, async (req, res) => {
  try {
    const data = await query(
      `SELECT cc.code, cc.name, cc.type, COALESCE(pb.budget_amount, 0) as budget, COALESCE(pb.revised_amount, 0) as revised,
              COALESCE((SELECT SUM(amount) FROM project_costs WHERE project_id = $1 AND cost_code_id = cc.id), 0) as actual
       FROM cost_codes cc LEFT JOIN project_budgets pb ON pb.cost_code_id = cc.id AND pb.project_id = $1
       ORDER BY cc.code`,
      [req.params.projectId]
    );
    res.json({ success: true, data: data.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/project/:projectId/profitability', authenticate, async (req, res) => {
  try {
    const project = await query('SELECT contract_value, budget FROM projects WHERE id = $1', [req.params.projectId]);
    if (project.rows.length === 0) return res.status(404).json({ success: false, error: 'Project not found' });

    const costs = await query('SELECT COALESCE(SUM(amount), 0) as total_cost FROM project_costs WHERE project_id = $1', [req.params.projectId]);
    const revenue = parseFloat(project.rows[0].contract_value || 0);
    const totalCost = parseFloat(costs.rows[0].total_cost);
    const profit = revenue - totalCost;
    const margin = revenue > 0 ? (profit / revenue * 100) : 0;

    res.json({
      success: true,
      data: { revenue, total_cost: totalCost, profit, profit_margin_percent: parseFloat(margin.toFixed(2)), budget: parseFloat(project.rows[0].budget || 0) }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
