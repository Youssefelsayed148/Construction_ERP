const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity, fireEvent } = require('../utils/activity');

const INVOICE_STATUSES = ['draft', 'sent', 'partially_paid', 'paid', 'overdue'];

function computeInvoiceStatus(invoice, totalPaid) {
  const paid = parseFloat(totalPaid) || 0;
  const amount = parseFloat(invoice.amount) || 0;
  if (paid >= amount) return 'paid';
  if (invoice.due_date && new Date(invoice.due_date) < new Date() && paid < amount) return 'overdue';
  if (paid > 0) return 'partially_paid';
  return invoice.status;
}

router.get('/', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, client_id, status, search, limit = 100, offset = 0 } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`i.project_id = $${idx++}`); params.push(parseInt(project_id)); }
    if (client_id) { conditions.push(`i.client_id = $${idx++}`); params.push(parseInt(client_id)); }
    if (status && INVOICE_STATUSES.includes(status)) { conditions.push(`i.status = $${idx++}`); params.push(status); }
    if (search) { conditions.push(`(i.invoice_number ILIKE $${idx} OR i.description ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataResult = await query(
      `SELECT i.*, p.name_ar as project_name_ar, p.name_en as project_name_en, p.code as project_code,
              c.name_ar as client_name_ar, c.name_en as client_name_en, c.code as client_code,
              COALESCE((SELECT SUM(pm.amount) FROM payments pm WHERE pm.invoice_id = i.id), 0) as total_paid
       FROM invoices i
       LEFT JOIN projects p ON i.project_id = p.id
       LEFT JOIN clients c ON i.client_id = c.id
       ${where}
       ORDER BY i.created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    const invoices = dataResult.rows;
    for (const inv of invoices) {
      const newStatus = computeInvoiceStatus(inv, inv.total_paid);
      if (newStatus !== inv.status) {
        await query('UPDATE invoices SET status = $1, updated_at = NOW() WHERE id = $2', [newStatus, inv.id]);
        inv.status = newStatus;
      }
    }

    res.json({ success: true, data: invoices });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const result = await query(
      `SELECT i.*, p.name_ar as project_name_ar, p.name_en as project_name_en, p.code as project_code,
              c.name_ar as client_name_ar, c.name_en as client_name_en, c.code as client_code,
              COALESCE((SELECT SUM(pm.amount) FROM payments pm WHERE pm.invoice_id = i.id), 0) as total_paid
       FROM invoices i
       LEFT JOIN projects p ON i.project_id = p.id
       LEFT JOIN clients c ON i.client_id = c.id
       WHERE i.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Invoice not found' });

    const invoice = result.rows[0];
    const newStatus = computeInvoiceStatus(invoice, invoice.total_paid);
    if (newStatus !== invoice.status) {
      await query('UPDATE invoices SET status = $1, updated_at = NOW() WHERE id = $2', [newStatus, invoice.id]);
      invoice.status = newStatus;
    }

    const payments = await query(
      'SELECT * FROM payments WHERE invoice_id = $1 ORDER BY payment_date DESC, created_at DESC',
      [req.params.id]
    );

    res.json({ success: true, data: { ...invoice, payments: payments.rows } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      client_id: Joi.number().integer().required(),
      amount: Joi.number().positive().required(),
      issue_date: Joi.date().iso().required(),
      due_date: Joi.date().iso().allow(null),
      description: Joi.string().allow(''),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const count = await query("SELECT COUNT(*) as cnt FROM invoices WHERE invoice_number LIKE 'INV-%'");
    value.invoice_number = `INV-${String(parseInt(count.rows[0].cnt) + 1).padStart(4, '0')}`;

    const result = await query(
      `INSERT INTO invoices (invoice_number, project_id, client_id, amount, issue_date, due_date, status, description)
       VALUES ($1,$2,$3,$4,$5,$6,'sent',$7) RETURNING *`,
      [value.invoice_number, value.project_id, value.client_id, value.amount, value.issue_date, value.due_date || null, value.description]
    );

    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'create', module: 'invoices',
      description: `Created invoice ${value.invoice_number} — ${value.amount} EGP`,
      entityId: result.rows[0].id, entityType: 'invoice', amount: value.amount
    });
    await fireEvent({
      eventType: 'invoice.created', entityType: 'invoice', entityId: result.rows[0].id,
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      payload: { invoice_id: result.rows[0].id, invoice_number: value.invoice_number, amount: value.amount, project_id: value.project_id, status: 'sent' },
    });

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const existing = await query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Invoice not found' });

    const schema = Joi.object({
      client_id: Joi.number().integer(), amount: Joi.number().positive(),
      issue_date: Joi.date().iso(), due_date: Joi.date().iso().allow(null),
      description: Joi.string().allow(''),
      status: Joi.string().valid(...INVOICE_STATUSES),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const sets = []; const params = []; let idx = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) { sets.push(`${k} = $${idx++}`); params.push(v); }
    }
    params.push(req.params.id);
    const result = await query(
      `UPDATE invoices SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      params
    );

    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'update', module: 'invoices',
      description: `Updated invoice ${existing.rows[0].invoice_number}`,
      entityId: req.params.id, entityType: 'invoice'
    });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const payments = await query('SELECT COUNT(*) as cnt FROM payments WHERE invoice_id = $1', [req.params.id]);
    if (parseInt(payments.rows[0].cnt) > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete invoice with linked payments. Remove all payments first.',
        paymentCount: parseInt(payments.rows[0].cnt)
      });
    }
    const result = await query('DELETE FROM invoices WHERE id = $1 RETURNING id, invoice_number', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Invoice not found' });

    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'delete', module: 'invoices',
      description: `Deleted invoice ${result.rows[0].invoice_number}`,
      entityId: req.params.id, entityType: 'invoice'
    });
    res.json({ success: true, message: 'Invoice deleted' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

module.exports = router;
