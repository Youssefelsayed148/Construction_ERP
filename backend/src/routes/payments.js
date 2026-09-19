const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const finance = require('../services/financeEngine');

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'check', 'other'];

function computeInvoiceStatus(invoice, totalPaid) {
  const paid = parseFloat(totalPaid) || 0;
  const amount = parseFloat(invoice.net_amount) > 0 ? parseFloat(invoice.net_amount) : (parseFloat(invoice.amount) || 0);
  if (paid >= amount) return 'paid';
  if (invoice.due_date && new Date(invoice.due_date) < new Date() && paid < amount) return 'overdue';
  if (paid > 0) return 'partially_paid';
  return ['paid', 'partially_paid'].includes(invoice.status)
    ? (invoice.gross_current_work ? 'issued' : 'sent') : invoice.status;
}

async function recalcInvoiceStatus(q, invoiceId) {
  const inv = await q('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
  if (inv.rows.length === 0) return;
  const invoice = inv.rows[0];
  const paid = await q("SELECT COALESCE(SUM(amount), 0) as total FROM payment_allocations WHERE invoice_id = $1 AND target_type = 'client_invoice'", [invoiceId]);
  const totalPaid = parseFloat(paid.rows[0].total) || 0;
  const newStatus = computeInvoiceStatus(invoice, totalPaid);
  if (newStatus !== invoice.status) {
    await q('UPDATE invoices SET status = $1, updated_at = NOW() WHERE id = $2', [newStatus, invoiceId]);
  }
}

router.get('/', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, client_id, invoice_id, limit = 100, offset = 0 } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`p.project_id = $${idx++}`); params.push(parseInt(project_id)); }
    if (client_id) { conditions.push(`p.client_id = $${idx++}`); params.push(parseInt(client_id)); }
    if (invoice_id) { conditions.push(`p.invoice_id = $${idx++}`); params.push(parseInt(invoice_id)); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataResult = await query(
      `SELECT p.*, c.name_ar as client_name_ar, c.name_en as client_name_en, c.code as client_code,
              pr.name_ar as project_name_ar, pr.name_en as project_name_en, pr.code as project_code,
              COALESCE(i.invoice_number, '') as invoice_number
       FROM payments p
       LEFT JOIN clients c ON p.client_id = c.id
       LEFT JOIN projects pr ON p.project_id = pr.id
       LEFT JOIN invoices i ON p.invoice_id = i.id
       ${where}
       ORDER BY p.payment_date DESC, p.created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    res.json({ success: true, data: dataResult.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      invoice_id: Joi.number().integer().optional().allow(null),
      project_id: Joi.number().integer().required(),
      client_id: Joi.number().integer().required(),
      amount: Joi.number().positive().required(),
      payment_date: Joi.date().iso().required(),
      payment_method: Joi.string().valid(...PAYMENT_METHODS).default('bank_transfer'),
      reference_number: Joi.string().allow(''),
      notes: Joi.string().allow(''),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const payment = await transaction(async (client) => {
      const q = client.query.bind(client);
      if (value.invoice_id) {
        const inv = (await q('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [value.invoice_id])).rows[0];
        if (!inv || Number(inv.project_id) !== value.project_id || Number(inv.client_id) !== value.client_id) {
          throw new Error('Invoice does not belong to the selected project and client');
        }
        if (['void', 'cancelled', 'credited'].includes(inv.status)) throw new Error('Invoice is not payable');
        const balance = await finance.invoiceOutstanding(q, value.invoice_id);
        if (value.amount > balance.outstanding + 1e-9) throw new Error('Payment exceeds invoice outstanding balance');
      }
      const row = (await q(
        `INSERT INTO payments (invoice_id, project_id, client_id, amount, payment_date, payment_method, reference_number, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [value.invoice_id || null, value.project_id, value.client_id, value.amount,
         value.payment_date, value.payment_method, value.reference_number, value.notes]
      )).rows[0];
      if (value.invoice_id) {
        await finance.allocatePayment(q, {
          payment_id: row.id,
          allocations: [{ target_type: 'client_invoice', invoice_id: value.invoice_id, amount: value.amount }],
          allocated_by: req.user.id, actor_name: req.user.name,
        });
      }
      return row;
    });

    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'create', module: 'payments',
      description: `Recorded payment of ${value.amount} EGP`,
      entityId: payment.id, entityType: 'payment', amount: value.amount
    });

    res.status(201).json({ success: true, data: payment });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.delete('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const payment = await transaction(async (client) => {
      const q = client.query.bind(client);
      const existing = (await q('SELECT * FROM payments WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      if (!existing) return null;
      if (existing.invoice_id) await q('SELECT id FROM invoices WHERE id = $1 FOR UPDATE', [existing.invoice_id]);
      await q('DELETE FROM payments WHERE id = $1', [req.params.id]);
      if (existing.invoice_id) await recalcInvoiceStatus(q, existing.invoice_id);
      return existing;
    });
    if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });

    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'delete', module: 'payments',
      description: `Deleted payment #${req.params.id}`,
      entityId: req.params.id, entityType: 'payment'
    });
    res.json({ success: true, message: 'Payment deleted' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

module.exports = router;
