const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const commercialEngine = require('../services/commercialEngine');

router.get('/', authenticate, authorize(), async (req, res) => {
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
router.get('/portfolio', authenticate, authorize(), async (req, res) => {
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
router.get('/project/:id', authenticate, authorize(), async (req, res) => {
  try {
    const project = await query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    if (project.rows.length === 0) return res.status(404).json({ success: false, error: 'Project not found' });

    const [phases, costs, milestones] = await Promise.all([
      query('SELECT * FROM project_phases WHERE project_id = $1 ORDER BY sort_order', [req.params.id]),
      query('SELECT COALESCE(SUM(amount), 0) as total_spent FROM project_costs WHERE project_id = $1', [req.params.id]),
      query("SELECT * FROM project_milestones WHERE project_id = $1 AND target_date <= CURRENT_DATE + INTERVAL '30 days' ORDER BY target_date", [req.params.id]),
    ]);

    const p = project.rows[0];

    // Phase 13 — burn is measured against Current Budget (original + approved
    // changes) from the canonical commercial engine, not the static
    // projects.budget; the dashboard also carries the forecast margin.
    let commercial = null;
    try {
      commercial = await commercialEngine.projectCommercial(query, parseInt(req.params.id, 10));
    } catch (e) { commercial = null; }
    const currentBudget = commercial ? commercial.current_budget : parseFloat(p.budget);
    const totalSpent = commercial ? commercial.actual_cost : parseFloat(costs.rows[0].total_spent);
    const budget_burn = totalSpent > 0 && currentBudget > 0 ? (totalSpent / currentBudget * 100) : 0;

    res.json({
      success: true,
      data: {
        ...p,
        phases: phases.rows,
        total_spent: totalSpent,
        budget_burn_percent: parseFloat(budget_burn.toFixed(1)),
        forecast_margin_percent: commercial ? commercial.forecast_margin_percent : null,
        forecast_profit: commercial ? commercial.forecast_profit : null,
        upcoming_milestones: milestones.rows,
      }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Alerts
router.get('/alerts', authenticate, authorize(), async (req, res) => {
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

// Owner overview - one compact summary row per module.
// Every sub-query is wrapped so a single failing module never blanks the page.
router.get('/overview', authenticate, authorize(), async (req, res) => {
  const zero = (rows) => ({ rows });
  const [
    projAgg, projRisk, portfolio, finance, invoiceAgg, expenseAgg,
    inventory, hrAgg, assetAgg, maintDue, approvalAgg, miscAgg,
  ] = await Promise.all([
    query(`SELECT
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = 'active')::int   AS active,
             COUNT(*) FILTER (WHERE status = 'planning')::int AS planning,
             COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
             COALESCE(ROUND(AVG(completion_percentage) FILTER (WHERE status = 'active'), 0), 0)::int AS avg_completion
           FROM projects`).catch(() => zero([{ total: 0, active: 0, planning: 0, completed: 0, avg_completion: 0 }])),

    query(`SELECT COUNT(*)::int AS at_risk
           FROM projects p
           WHERE p.status = 'active'
             AND (
               (p.completion_percentage < 50
                 AND p.expected_completion IS NOT NULL
                 AND p.expected_completion < CURRENT_DATE + INTERVAL '30 days')
               OR (
                 (SELECT COALESCE(SUM(amount), 0) FROM project_costs WHERE project_id = p.id) > p.budget
                 AND p.budget > 0
               )
             )`).catch(() => zero([{ at_risk: 0 }])),

    query(`SELECT
             COALESCE((SELECT SUM(budget) FROM projects), 0) AS budget_total,
             COALESCE((SELECT SUM(amount) FROM project_costs), 0) AS actual_total`).catch(() => zero([{ budget_total: 0, actual_total: 0 }])),

    // Mirrors GET /api/finance/summary exactly so the two views never disagree.
    query(`SELECT
             COALESCE((SELECT SUM(amount) FROM payments), 0) AS collected,
             COALESCE((SELECT SUM(amount) FROM invoices), 0) AS invoiced,
             COALESCE((SELECT SUM(amount) FROM expenses), 0) AS expenses,
             (SELECT COUNT(*) FROM invoices
               WHERE status = 'overdue'
                  OR (due_date IS NOT NULL AND due_date < CURRENT_DATE AND status != 'paid'))::int AS overdue`).catch(
      () => zero([{ collected: 0, invoiced: 0, expenses: 0, overdue: 0 }])),

    query(`SELECT
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
             COUNT(*) FILTER (WHERE status = 'paid')::int AS paid,
             COUNT(*) FILTER (WHERE status = 'overdue'
                OR (due_date IS NOT NULL AND due_date < CURRENT_DATE AND status != 'paid'))::int AS overdue
           FROM invoices`).catch(() => zero([{ total: 0, sent: 0, paid: 0, overdue: 0 }])),

    query(`SELECT
             COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
             COALESCE(SUM(amount) FILTER (WHERE date >= date_trunc('month', CURRENT_DATE)), 0) AS month_total
           FROM expenses`).catch(() => zero([{ pending: 0, month_total: 0 }])),

    query(`SELECT
             (SELECT COUNT(*) FROM item_master WHERE is_active = true)::int AS items,
             (SELECT COUNT(*) FROM warehouses)::int AS warehouses,
             (SELECT COUNT(*) FROM warehouse_stock
               WHERE quantity <= reorder_level AND reorder_level > 0)::int AS low_stock`).catch(
      () => zero([{ items: 0, warehouses: 0, low_stock: 0 }])),

    query(`SELECT
             COUNT(*) FILTER (WHERE status = 'active')::int AS active_employees,
             (SELECT COUNT(*) FROM attendance
               WHERE date = CURRENT_DATE AND status IN ('present', 'late'))::int AS present_today,
             (SELECT COUNT(*) FROM leave_requests WHERE status = 'pending')::int AS pending_leaves
           FROM employees`).catch(() => zero([{ active_employees: 0, present_today: 0, pending_leaves: 0 }])),

    query(`SELECT
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = 'active')::int AS active,
             COUNT(*) FILTER (WHERE status IN ('maintenance', 'repair', 'out_of_service'))::int AS down
           FROM assets`).catch(() => zero([{ total: 0, active: 0, down: 0 }])),

    query(`SELECT COUNT(*)::int AS due
           FROM maintenance_reminders
           WHERE status NOT IN ('completed', 'cancelled')
             AND next_due_date IS NOT NULL AND next_due_date <= CURRENT_DATE`).catch(() => zero([{ due: 0 }])),

    query(`SELECT
             COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
             COUNT(*) FILTER (WHERE status = 'pending' AND stage = 'owner_review')::int AS awaiting_owner,
             MIN(created_at) FILTER (WHERE status = 'pending') AS oldest_pending_at
           FROM approval_requests`).catch(() => zero([{ pending: 0, awaiting_owner: 0, oldest_pending_at: null }])),

    query(`SELECT
             (SELECT COUNT(*) FROM clients WHERE is_active = true)::int AS clients,
             (SELECT COUNT(*) FROM suppliers WHERE is_active = true)::int AS suppliers,
             (SELECT COUNT(*) FROM subcontractors WHERE is_active = true)::int AS subcontractors,
             (SELECT COUNT(*) FROM legal_documents)::int AS legal_total,
             (SELECT COUNT(*) FROM legal_documents WHERE status = 'pending')::int AS legal_pending`).catch(
      () => zero([{ clients: 0, suppliers: 0, subcontractors: 0, legal_total: 0, legal_pending: 0 }])),
  ]);

  const num = (v) => parseFloat(v) || 0;
  const p = projAgg.rows[0], f = finance.rows[0], pf = portfolio.rows[0], ap = approvalAgg.rows[0];
  const collected = num(f.collected), invoiced = num(f.invoiced), expenses = num(f.expenses);
  const budgetTotal = num(pf.budget_total), actualTotal = num(pf.actual_total);
  const oldestDays = ap.oldest_pending_at
    ? Math.max(0, Math.floor((Date.now() - new Date(ap.oldest_pending_at).getTime()) / 86400000))
    : 0;

  res.json({
    success: true,
    data: {
      health: {
        projects_active: p.active,
        projects_total: p.total,
        projects_at_risk: projRisk.rows[0].at_risk,
        portfolio_budget: budgetTotal,
        portfolio_actual: actualTotal,
        portfolio_variance: budgetTotal - actualTotal,
        revenue_collected: collected,
        net_profit: collected - expenses,
        total_outstanding: invoiced - collected,
        pending_approvals: ap.pending,
      },
      modules: {
        projects: {
          active: p.active, planning: p.planning, completed: p.completed,
          at_risk: projRisk.rows[0].at_risk, avg_completion: p.avg_completion,
        },
        finance: {
          revenue_collected: collected, total_invoiced: invoiced, total_expenses: expenses,
          outstanding: invoiced - collected, net_profit: collected - expenses,
          overdue_invoices: f.overdue,
        },
        invoices: invoiceAgg.rows[0],
        expenses: {
          pending: expenseAgg.rows[0].pending,
          month_total: num(expenseAgg.rows[0].month_total),
        },
        inventory: inventory.rows[0],
        hr: hrAgg.rows[0],
        assets: {
          total: assetAgg.rows[0].total, active: assetAgg.rows[0].active,
          down: assetAgg.rows[0].down, maintenance_due: maintDue.rows[0].due,
        },
        approvals: {
          pending: ap.pending, awaiting_owner: ap.awaiting_owner, oldest_days: oldestDays,
        },
        suppliers: {
          suppliers: miscAgg.rows[0].suppliers, subcontractors: miscAgg.rows[0].subcontractors,
        },
        clients: { total: miscAgg.rows[0].clients },
        legal: { total: miscAgg.rows[0].legal_total, pending: miscAgg.rows[0].legal_pending },
      },
    },
  });
});

module.exports = router;
