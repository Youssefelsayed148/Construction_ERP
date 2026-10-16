const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const commercialEngine = require('../services/commercialEngine');
const clientCollections = require('../services/clientCollections');

router.get('/project/:id', authenticate, authorize(), async (req, res) => {
  try {
    const projectId = req.params.id;
    const proj = await query('SELECT * FROM projects WHERE id = $1', [projectId]);
    if (proj.rows.length === 0) return res.status(404).json({ success: false, error: 'Project not found' });

    const totalInvoiced = await query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM invoices WHERE project_id = $1 AND status NOT IN ('void', 'cancelled', 'credited')",
      [projectId]
    );
    const totalPaid = await query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE project_id = $1 AND ${clientCollections.CLIENT_RECEIPT}`,
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
    const result = await clientCollections.summary(query);
    const figures = clientCollections.figures(result.rows[0]);

    res.json({
      success: true,
      data: {
        total_revenue_collected: figures.collected,
        total_invoiced: figures.invoiced,
        total_expenses: figures.expenses,
        total_outstanding: figures.outstanding,
        net_profit: figures.netProfit,
        overdue_count: result.rows[0].overdue,
      }
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

module.exports = router;
