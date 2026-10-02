const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity, fireEvent } = require('../utils/activity');
const finance = require('../services/financeEngine');

// Phase 14 — AR/AP surface: valuations, allocations, AP review queue,
// retention ledger, tax, and the company finance dashboard.

// ---------------------------------------------------------------------------
// Client valuations (certificate math, cumulative-safe)
// ---------------------------------------------------------------------------

router.post('/valuations', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      client_id: Joi.number().integer().required(),
      client_contract_id: Joi.number().integer().optional().allow(null),
      gross_current_work: Joi.number().min(0).required(),
      approved_variations_period: Joi.number().default(0),
      retention: Joi.number().min(0).default(0),
      advance_recovery: Joi.number().min(0).default(0),
      other_deductions: Joi.number().min(0).default(0),
      tax_pct: Joi.number().min(0).default(0),
      issue_date: Joi.date().iso().optional().allow(null),
      due_date: Joi.date().iso().optional().allow(null),
      description: Joi.string().allow('', null),
      company_id: Joi.number().integer().optional().allow(null),
      cost_code_id: Joi.number().integer().optional().allow(null),
      department: Joi.string().allow('', null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const invoice = await finance.createClientValuation(query, { ...value, created_by: req.user.id, actor_name: req.user.name });
    res.status(201).json({ success: true, data: invoice });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/invoices/:id/transition', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ status: Joi.string().valid(...finance.INVOICE_LIFECYCLE).required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const invoice = await finance.transitionInvoice(query, parseInt(req.params.id, 10), value.status, req.user);
    await fireEvent({
      eventType: `invoice.${value.status}`, entityType: 'invoice', entityId: invoice.id,
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      payload: { invoice_id: invoice.id, status: value.status },
    });
    res.json({ success: true, data: invoice });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// ---------------------------------------------------------------------------
// Payments + allocations (AR/AP aware)
// ---------------------------------------------------------------------------

router.post('/payments/:id/allocate', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      allocations: Joi.array().items(Joi.object({
        target_type: Joi.string().valid('client_invoice', 'supplier_invoice').default('client_invoice'),
        invoice_id: Joi.number().integer().optional().allow(null),
        supplier_invoice_id: Joi.number().integer().optional().allow(null),
        amount: Joi.number().positive().required(),
      })).min(1).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const result = await transaction(async (client) => {
      const txQuery = client.query.bind(client);
      await txQuery('SELECT id FROM payments WHERE id = $1 FOR UPDATE', [parseInt(req.params.id, 10)]);
      const invoiceIds = [...new Set(value.allocations.filter((a) => a.target_type === 'client_invoice' && a.invoice_id).map((a) => a.invoice_id))].sort((a, b) => a - b);
      const supplierInvoiceIds = [...new Set(value.allocations.filter((a) => a.target_type === 'supplier_invoice' && a.supplier_invoice_id).map((a) => a.supplier_invoice_id))].sort((a, b) => a - b);
      if (invoiceIds.length) await txQuery('SELECT id FROM invoices WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE', [invoiceIds]);
      if (supplierInvoiceIds.length) await txQuery('SELECT id FROM supplier_invoices WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE', [supplierInvoiceIds]);
      return finance.allocatePayment(txQuery, {
        payment_id: parseInt(req.params.id, 10),
        allocations: value.allocations,
        allocated_by: req.user.id,
        actor_name: req.user.name,
      });
    });
    res.status(201).json({ success: true, data: result });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

router.post('/retention', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      party_type: Joi.string().valid('client', 'subcontractor').required(),
      direction: Joi.string().valid('held', 'released').required(),
      amount: Joi.number().positive().required(),
      source_type: Joi.string().allow('', null),
      source_id: Joi.number().integer().optional().allow(null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const row = await finance.recordRetention(query, value);
    res.status(201).json({ success: true, data: row });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/retention', authenticate, authorize(), async (req, res) => {
  try {
    const totals = await finance.retentionTotals(query, {
      project_id: req.query.project_id ? parseInt(req.query.project_id, 10) : null,
      party_type: req.query.party_type || null,
    });
    res.json({ success: true, data: totals });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ---------------------------------------------------------------------------
// AP review queue
// ---------------------------------------------------------------------------

router.get('/ap-review', authenticate, authorize(), async (req, res) => {
  try {
    const rows = (await query(
      `SELECT q.*, si.invoice_number, si.supplier_id, si.total_amount
       FROM ap_review_queue q JOIN supplier_invoices si ON si.id = q.supplier_invoice_id
       ORDER BY CASE q.status WHEN 'open' THEN 0 ELSE 1 END, q.id LIMIT 200`
    )).rows;
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/ap-review/:id/resolve', authenticate, authorize(), async (req, res) => {
  try {
    const r = await query(
      "UPDATE ap_review_queue SET status = 'cleared', resolved_by = $1, resolved_at = NOW() WHERE id = $2 RETURNING *",
      [req.user.id, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Queue item not found' });
    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'update', module: 'finance',
      description: `Cleared AP review item #${req.params.id}`,
      entityId: r.rows[0].id, entityType: 'ap_review_queue',
    });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// ---------------------------------------------------------------------------
// Cash flow + company dashboard
// ---------------------------------------------------------------------------

router.get('/cash-flow', authenticate, authorize(), async (req, res) => {
  try {
    const [ar, ap, retentionReceivable, retentionPayable] = await Promise.all([
      finance.arAging(query),
      finance.apAging(query),
      finance.retentionTotals(query, { party_type: 'client' }),
      finance.retentionTotals(query, { party_type: 'subcontractor' }),
    ]);
    res.json({
      success: true,
      data: {
        ar_aging: ar,
        ap_aging: ap,
        retention_receivable: retentionReceivable.balance,
        retention_payable: retentionPayable.balance,
      },
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/company-dashboard', authenticate, authorize(), async (req, res) => {
  try {
    const data = await finance.companyFinanceDashboard(query);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/tax-codes', authenticate, authorize(), async (req, res) => {
  try {
    const rows = (await query('SELECT * FROM tax_codes WHERE is_active = true ORDER BY rate_pct')).rows;
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Audit trail (immutable mirror).
router.get('/audit/:entityType/:entityId', authenticate, authorize(), async (req, res) => {
  try {
    const rows = (await query(
      'SELECT * FROM audit_events WHERE entity_type = $1 AND entity_id = $2 ORDER BY id',
      [req.params.entityType, req.params.entityId]
    )).rows;
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
