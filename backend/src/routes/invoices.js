const express = require('express');
const { createInvoiceRecord, writeAuditEvent } = require('../services/financeEngine');
const { reasonFrom } = require('../utils/reason');
const glPosting = require('../services/glPosting');
const journal = require('../utils/journal');
const router = express.Router();
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity, fireEvent } = require('../utils/activity');

const INVOICE_STATUSES = ['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'void'];

function computeInvoiceStatus(invoice, totalPaid) {
  if (['void', 'cancelled', 'credited'].includes(invoice.status)) return invoice.status;
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
              COALESCE((SELECT SUM(pm.amount) FROM payments pm WHERE pm.invoice_id = i.id AND pm.voided_at IS NULL), 0) as total_paid
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
              COALESCE((SELECT SUM(pm.amount) FROM payments pm WHERE pm.invoice_id = i.id AND pm.voided_at IS NULL), 0) as total_paid
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

    // The invoice and its ledger entry commit together.
    const invoice = await transaction((client) => createInvoiceRecord(client.query.bind(client), {
      project_id: value.project_id, client_id: value.client_id, amount: value.amount,
      issue_date: value.issue_date, due_date: value.due_date || null, status: 'sent',
      description: value.description, created_by: req.user.id,
    }, { actor_id: req.user.id, actor_name: req.user.name }));
    value.invoice_number = invoice.invoice_number;
    const result = { rows: [invoice] };

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
    // Locked, edited and posted in one transaction; a posted invoice's amount is fixed (void it and issue a new one).
    const outcome = await transaction(async (client) => {
      const q = client.query.bind(client);
      const existing = (await q('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      if (!existing) return { notFound: true };
      if (value.amount !== undefined && Number(value.amount) !== Number(existing.amount)
          && (await journal.findEntries(q, 'client_invoice', existing.id)).length) return { posted: true };
      const updated = (await q(
        `UPDATE invoices SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
        params
      )).rows[0];
      await glPosting.syncInvoicePosting(q, existing, updated, { userId: req.user.id });
      return { invoice: updated, number: existing.invoice_number };
    });
    if (outcome.notFound) return res.status(404).json({ success: false, error: 'Invoice not found' });
    if (outcome.posted) return res.status(409).json({ success: false, error: 'This invoice is already posted to the ledger; void it and issue a new one instead of changing its amount' });

    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'update', module: 'invoices',
      description: `Updated invoice ${outcome.number}`,
      entityId: req.params.id, entityType: 'invoice'
    });
    res.json({ success: true, data: outcome.invoice });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Void, never delete. An invoice with live payments has to have those payments voided first.
router.delete('/:id', authenticate, authorize(), async (req, res) => {
  const reason = reasonFrom(req);
  if (!reason) return res.status(400).json({ success: false, error: 'A reason is required to void an invoice' });
  try {
    const outcome = await transaction(async (client) => {
      const q = client.query.bind(client);
      const existing = (await q('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      if (!existing) return { notFound: true };
      if (['void', 'cancelled', 'credited'].includes(existing.status)) return { conflict: existing.status };
      const live = parseInt((await q('SELECT COUNT(*) AS cnt FROM payments WHERE invoice_id = $1 AND voided_at IS NULL', [existing.id])).rows[0].cnt, 10);
      if (live > 0) return { paymentCount: live };
      const updated = (await q(
        "UPDATE invoices SET status = 'void', voided_at = NOW(), voided_by = $2, void_reason = $3, updated_at = NOW() WHERE id = $1 RETURNING *",
        [existing.id, req.user.id, reason])).rows[0];
      await writeAuditEvent(q, {
        entity_type: 'invoice', entity_id: existing.id, event_type: 'void', actor_id: req.user.id, actor_name: req.user.name,
        before_state: { status: existing.status }, after_state: { status: 'void', reason },
      });
      await glPosting.syncInvoicePosting(q, existing, updated, { userId: req.user.id });
      return { invoice: updated };
    });
    if (outcome.notFound) return res.status(404).json({ success: false, error: 'Invoice not found' });
    if (outcome.conflict) return res.status(409).json({ success: false, error: `Invoice is already ${outcome.conflict}` });
    if (outcome.paymentCount) {
      return res.status(400).json({
        success: false,
        error: 'Cannot void an invoice with live payments. Void the payments first.',
        paymentCount: outcome.paymentCount,
      });
    }

    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'void', module: 'invoices',
      description: `Voided invoice ${outcome.invoice.invoice_number}: ${reason}`,
      entityId: req.params.id, entityType: 'invoice'
    });
    res.json({ success: true, message: 'Invoice voided' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

module.exports = router;
