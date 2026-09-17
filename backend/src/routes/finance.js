const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

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

    res.json({
      success: true,
      data: {
        contract_value: contractValue,
        total_invoiced: invoiced,
        total_paid: paid,
        outstanding_balance: invoiced - paid,
        total_expenses: expenses,
        profit: paid - expenses,
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
