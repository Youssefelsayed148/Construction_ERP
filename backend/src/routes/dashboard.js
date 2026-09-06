const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, async (req, res) => {
  try {
    const [projectsRes, clientsRes, itemsRes, assetsRes, employeesRes, subRes] = await Promise.all([
      query('SELECT COUNT(*) as cnt FROM projects').catch(() => ({ rows: [{ cnt: 0 }] })),
      query('SELECT COUNT(*) as cnt FROM clients WHERE is_active = true').catch(() => ({ rows: [{ cnt: 0 }] })),
      query('SELECT COUNT(*) as cnt FROM item_master WHERE is_active = true').catch(() => ({ rows: [{ cnt: 0 }] })),
      query('SELECT COUNT(*) as cnt FROM assets WHERE status = $1', ['active']).catch(() => ({ rows: [{ cnt: 0 }] })),
      query('SELECT COUNT(*) as cnt FROM employees WHERE status = $1', ['active']).catch(() => ({ rows: [{ cnt: 0 }] })),
      query('SELECT COUNT(*) as cnt FROM subcontractors WHERE is_active = true').catch(() => ({ rows: [{ cnt: 0 }] })),
    ]);

    res.json({
      success: true,
      data: {
        projects: parseInt(projectsRes.rows[0].cnt),
        clients: parseInt(clientsRes.rows[0].cnt),
        items: parseInt(itemsRes.rows[0].cnt),
        assets: parseInt(assetsRes.rows[0].cnt),
        employees: parseInt(employeesRes.rows[0].cnt),
        subcontractors: parseInt(subRes.rows[0].cnt),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Portfolio - all projects summary
router.get('/portfolio', authenticate, async (req, res) => {
  try {
    const projects = await query(`
      SELECT p.*, c.name_ar as client_name,
             (SELECT COALESCE(SUM(amount), 0) FROM project_costs WHERE project_id = p.id) as total_actual_cost
      FROM projects p LEFT JOIN clients c ON p.client_id = c.id
      ORDER BY p.status, p.created_at DESC
    `);

    const enriched = projects.rows.map(p => ({
      ...p,
      budget_variance: parseFloat(p.budget || 0) - parseFloat(p.total_actual_cost || 0),
      at_risk: (parseFloat(p.completion_percentage) < 50 && new Date(p.expected_completion) < new Date(Date.now() + 30 * 86400000)) || (parseFloat(p.total_actual_cost) > parseFloat(p.budget || 0)),
    }));

    res.json({ success: true, data: enriched });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Single project dashboard
router.get('/project/:id', authenticate, async (req, res) => {
  try {
    const project = await query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    if (project.rows.length === 0) return res.status(404).json({ success: false, error: 'Project not found' });

    const [phases, costs, milestones] = await Promise.all([
      query('SELECT * FROM project_phases WHERE project_id = $1 ORDER BY sort_order', [req.params.id]),
      query('SELECT COALESCE(SUM(amount), 0) as total_spent FROM project_costs WHERE project_id = $1', [req.params.id]),
      query("SELECT * FROM project_milestones WHERE project_id = $1 AND target_date <= CURRENT_DATE + INTERVAL '30 days' ORDER BY target_date", [req.params.id]),
    ]);

    const p = project.rows[0];
    const budget_burn = parseFloat(p.budget) > 0 ? (parseFloat(costs.rows[0].total_spent) / parseFloat(p.budget) * 100) : 0;

    res.json({
      success: true,
      data: {
        ...p,
        phases: phases.rows,
        total_spent: parseFloat(costs.rows[0].total_spent),
        budget_burn_percent: parseFloat(budget_burn.toFixed(1)),
        upcoming_milestones: milestones.rows,
      }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Alerts
router.get('/alerts', authenticate, async (req, res) => {
  try {
    const [lowStock, overdueMilestones, budgetOverruns, staleSiteReports, overdueRfis] = await Promise.all([
      query(`SELECT ws.*, w.name as warehouse_name, im.name_en, im.name_ar, im.code as item_code FROM warehouse_stock ws JOIN warehouses w ON ws.warehouse_id = w.id JOIN item_master im ON ws.item_id = im.id WHERE ws.quantity <= ws.reorder_level AND ws.reorder_level > 0 LIMIT 20`).catch(() => ({ rows: [] })),
      query("SELECT pm.*, p.name as project_name FROM project_milestones pm JOIN projects p ON pm.project_id = p.id WHERE pm.status = 'pending' AND pm.target_date < CURRENT_DATE ORDER BY pm.target_date LIMIT 20").catch(() => ({ rows: [] })),
      query('SELECT p.id, p.name, p.budget, p.completion_percentage, (SELECT COALESCE(SUM(amount), 0) FROM project_costs WHERE project_id = p.id) as spent FROM projects p WHERE p.status = $1 AND (SELECT COALESCE(SUM(amount), 0) FROM project_costs WHERE project_id = p.id) > p.budget AND p.budget > 0', ['active']).catch(() => ({ rows: [] })),
      // Active projects with no daily site report filed in the last 2 days (Phase 7)
      query(`SELECT p.id, p.name, p.code,
               (SELECT MAX(report_date) FROM site_daily_reports WHERE project_id = p.id) as last_report_date
             FROM projects p
             WHERE p.status = 'active'
               AND NOT EXISTS (
                 SELECT 1 FROM site_daily_reports sdr
                 WHERE sdr.project_id = p.id AND sdr.report_date >= CURRENT_DATE - INTERVAL '2 days'
               )
             LIMIT 20`).catch(() => ({ rows: [] })),
      // Open RFIs past their due date (Phase 9)
      query(`SELECT r.id, r.rfi_number, r.subject, r.due_date, p.name as project_name
             FROM project_rfis r JOIN projects p ON r.project_id = p.id
             WHERE r.status = 'open' AND r.due_date IS NOT NULL AND r.due_date < CURRENT_DATE
             ORDER BY r.due_date LIMIT 20`).catch(() => ({ rows: [] })),
    ]);

    res.json({
      success: true,
      data: {
        low_stock: lowStock.rows,
        overdue_milestones: overdueMilestones.rows,
        budget_overruns: budgetOverruns.rows,
        stale_site_reports: staleSiteReports.rows,
        overdue_rfis: overdueRfis.rows,
      }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
