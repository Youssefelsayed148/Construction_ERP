const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const commercialEngine = require('../services/commercialEngine');

router.get('/project/:id', authenticate, authorize(), async (req, res) => {
  try {
    const projectId = req.params.id;
    const proj = await query('SELECT * FROM projects WHERE id = $1', [projectId]);
    if (proj.rows.length === 0) return res.status(404).json({ success: false, error: 'Project not found' });

    const totalInvoiced = await query(
      'SELECT COALESCE(SUM(amount), 0) as total FROM invoices WHERE project_id = $1',
      [projectId]
    );
    const totalPaid = await query(
      'SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE project_id = $1',
      [projectId]
    );
    const totalExpenses = await query(
      'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE project_id = $1',
      [projectId]
    );

    const contractValue = parseFloat(proj.rows[0].contract_value) || 0;
    const invoiced = parseFloat(totalInvoiced.rows[0].total) || 0;
    const paid = parseFloat(totalPaid.rows[0].total) || 0;
    const expenses = parseFloat(totalExpenses.rows[0].total) || 0;

    // Phase 13 — `profit` is the canonical EAC/forecast-margin figure from the
    // commercial engine; the cash-proxy formula (paid − expenses) is retired
    // to the frozen legacy snapshot.
    const commercial = await commercialEngine.projectCommercial(query, parseInt(projectId, 10));
    const legacySnapshot = await query(
      "SELECT figures FROM commercial_snapshots WHERE project_id = $1 AND snapshot_type = 'finance_cash_proxy'",
      [projectId]
    );

    res.json({
      success: true,
      data: {
        contract_value: commercial ? commercial.revised_contract_value : contractValue,
        total_invoiced: invoiced,
        total_paid: paid,               // cash figure (kept, explicitly labeled)
        outstanding_balance: invoiced - paid,
        total_expenses: expenses,       // cash figure
        profit: commercial ? commercial.forecast_profit : 0,
        forecast_revenue: commercial ? commercial.forecast_revenue : 0,
        forecast_margin_percent: commercial ? commercial.forecast_margin_percent : 0,
        eac: commercial ? commercial.eac : 0,
        legacy_profit_cash_proxy: legacySnapshot.rows[0] ? legacySnapshot.rows[0].figures : null,
      }
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/summary', authenticate, authorize(), async (req, res) => {
  try {
    const totalCollected = await query('SELECT COALESCE(SUM(amount), 0) as total FROM payments');
    const totalInvoiced = await query('SELECT COALESCE(SUM(amount), 0) as total FROM invoices');
    const totalExpenses = await query('SELECT COALESCE(SUM(amount), 0) as total FROM expenses');
    const overdueCount = await query(
      `SELECT COUNT(*) as cnt FROM invoices
       WHERE status = 'overdue' OR (due_date IS NOT NULL AND due_date < CURRENT_DATE AND status != 'paid')`
    );

    res.json({
      success: true,
      data: {
        total_revenue_collected: parseFloat(totalCollected.rows[0].total) || 0,
        total_invoiced: parseFloat(totalInvoiced.rows[0].total) || 0,
        total_expenses: parseFloat(totalExpenses.rows[0].total) || 0,
        total_outstanding: (parseFloat(totalInvoiced.rows[0].total) || 0) - (parseFloat(totalCollected.rows[0].total) || 0),
        net_profit: (parseFloat(totalCollected.rows[0].total) || 0) - (parseFloat(totalExpenses.rows[0].total) || 0),
        overdue_count: parseInt(overdueCount.rows[0].cnt) || 0,
      }
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

module.exports = router;
