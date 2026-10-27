const { authorizeProjectPayload } = require('../services/authorizedProject');
const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { queryPaginated } = require('../utils/pagination');
const { authenticate, authorize } = require('../middleware/auth');
const { fireEvent } = require('../utils/activity');
const finance = require('../services/financeEngine');
const releases = require('../services/financeReleases');
const { auditedTransaction } = require('../utils/auditedTransaction');

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
    authorizeProjectPayload(req, value);
    const invoice = await transaction(client => finance.createClientValuation(client.query.bind(client), {
      ...value, created_by: req.user.id, actor_name: req.user.name,
    }));
    res.status(201).json({ success: true, data: invoice });
  } catch (e) { routeFail(res, e, 'financeLedger.POST /valuations', req); }
});

router.post('/invoices/:id/transition', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ status: Joi.string().valid(...finance.INVOICE_LIFECYCLE).required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const invoice = await transaction(async (client) => {
      const q = client.query.bind(client);
      const transitioned = await finance.transitionInvoice(q, parseInt(req.params.id, 10), value.status, req.user);
      await fireEvent({
        eventType: `invoice.${value.status}`, entityType: 'invoice', entityId: transitioned.id,
        userId: req.user.id, userName: req.user.name, userRole: req.user.role,
        payload: { invoice_id: transitioned.id, status: value.status },
      }, { query: q });
      return transitioned;
    });
    res.json({ success: true, data: invoice });
  } catch (e) { routeFail(res, e, 'financeLedger.POST /invoices/:id/transition', req); }
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
  } catch (e) { routeFail(res, e, 'financeLedger.POST /payments/:id/allocate', req); }
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
    authorizeProjectPayload(req, value);
    if (value.direction === 'released') {
      return res.status(409).json({ success: false, error: 'Use the balanced retention release endpoint', error_code: 'retention_release_route_required', error_params: {} });
    }
    const row = await auditedFin(req, (q) => finance.recordRetention(q, value), 'create',
      (created) => ({ description: `Retention held for ${created.party_type}: ${created.amount}`, entityType: 'retention_ledger', entityId: created.id }));
    res.status(201).json({ success: true, data: row });
  } catch (e) { return failFin(res, e); }
});

router.get('/retention/releases', authenticate, authorize(), async (req, res) => {
  try {
    const projectId = parseInt(req.query.project_id, 10);
    if (!Number.isInteger(projectId) || projectId <= 0) return res.status(400).json({ success: false, error: 'project_id is required', error_code: 'validation_error', error_params: { field: 'project_id' } });
    res.json({ success: true, data: await releases.listRetentionReleases(query, projectId) });
  } catch (e) { return failFin(res, e); }
});

router.post('/retention/releases', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(Joi.object({
      project_id: Joi.number().integer().positive().required(),
      party_type: Joi.string().valid('client', 'subcontractor').required(),
      amount: amountSchema.required(),
      idempotency_key: Joi.string().guid({ version: 'uuidv4' }).required(),
    }), req, res);
    if (!value) return;
    authorizeProjectPayload(req, value);
    const row = await auditedFin(req, (q) => releases.createRetentionRelease(q, value, req.user), 'release',
      (created) => ({ description: `Retention ${created.direction} for ${created.party_type}: ${created.amount}`, entityType: 'retention_release', entityId: created.id }));
    res.status(row.reused ? 200 : 201).json({ success: true, data: row });
  } catch (e) { return failFin(res, e); }
});

router.post('/retention/releases/:id/void', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(Joi.object({ reason: Joi.string().trim().min(3).max(500).required() }), req, res);
    if (!value) return;
    const row = await auditedFin(req, (q) => releases.voidRetentionRelease(q, fid(req), req.user, value.reason), 'void',
      (voided) => ({ description: `Retention release #${voided.id} voided`, entityType: 'retention_release', entityId: voided.id }));
    res.json({ success: true, data: row });
  } catch (e) { return failFin(res, e); }
});

router.get('/retention', authenticate, authorize(), async (req, res) => {
  try {
    const totals = await finance.retentionTotals(query, {
      project_id: req.query.project_id ? parseInt(req.query.project_id, 10) : null,
      party_type: req.query.party_type || null,
    });
    res.json({ success: true, data: totals });
  } catch (e) { routeFail(res, e, 'financeLedger.GET /retention', req); }
});

// ---------------------------------------------------------------------------
// AP review queue
// ---------------------------------------------------------------------------

router.get('/ap-review', authenticate, authorize(), async (req, res) => {
  try {
    const page = await queryPaginated(req, res, query, {
      sql: `SELECT q.*, si.invoice_number, si.supplier_id, si.total_amount
       FROM ap_review_queue q JOIN supplier_invoices si ON si.id = q.supplier_invoice_id
      `,
      orderBy: [{ column: 'q.status', direction: 'ASC' }, { column: 'q.id' }],
    });
    res.json({ success: true, data: page.rows });
  } catch (e) { routeFail(res, e, 'financeLedger.GET /ap-review', req); }
});

router.post('/ap-review/:id/resolve', authenticate, authorize(), async (req, res) => {
  try {
    const row = await auditedTransaction(async (q) => {
      const result = await q(
        "UPDATE ap_review_queue SET status = 'cleared', resolved_by = $1, resolved_at = NOW() WHERE id = $2 RETURNING *",
        [req.user.id, req.params.id]
      );
      if (result.rows.length === 0) {
        const error = new Error('Queue item not found'); error.status = 404; error.error_code = 'ap_review_not_found'; throw error;
      }
      return result.rows[0];
    }, (result) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'update', module: 'finance', description: `Cleared AP review item #${req.params.id}`,
      entityId: result.id, entityType: 'ap_review_queue' }));
    res.json({ success: true, data: row });
  } catch (e) { routeFail(res, e, 'financeLedger.POST /ap-review/:id/resolve', req); }
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
  } catch (e) { routeFail(res, e, 'financeLedger.GET /cash-flow', req); }
});

router.get('/company-dashboard', authenticate, authorize(), async (req, res) => {
  try {
    const data = await finance.companyFinanceDashboard(query);
    res.json({ success: true, data });
  } catch (e) { routeFail(res, e, 'financeLedger.GET /company-dashboard', req); }
});

router.get('/tax-codes', authenticate, authorize(), async (req, res) => {
  try {
    const rows = (await queryPaginated(req, res, query, {
      sql: 'SELECT * FROM tax_codes WHERE is_active = true',
      orderBy: [{ column: 'rate_pct' }],
    })).rows;
    res.json({ success: true, data: rows });
  } catch (e) { routeFail(res, e, 'financeLedger.GET /tax-codes', req); }
});

// Audit trail (immutable mirror).
router.get('/audit/:entityType/:entityId', authenticate, authorize(), async (req, res) => {
  try {
    const rows = (await queryPaginated(req, res, query, {
      sql: 'SELECT * FROM audit_events WHERE entity_type = $1 AND entity_id = $2',
      params: [req.params.entityType, req.params.entityId],
      orderBy: [{ column: 'id' }],
    })).rows;
    res.json({ success: true, data: rows });
  } catch (e) { routeFail(res, e, 'financeLedger.GET /audit/:entityType/:entityId', req); }
});

// ---------------------------------------------------------------------------
// Phase 5.5 (spec 10): credit notes and payment batches (maker/checker). Money moves through the ledger mapping
// table in the request's transaction; typed errors carry error_code and error_params.
// ---------------------------------------------------------------------------
const docs = require('../services/financeDocuments');
const { typedFail, typedBody, routeFail } = require('../utils/typedRoute');

const auditedFin = (req, work, action, describe) => auditedTransaction(work, (row) => {
  const details = describe(row);
  return { userId: req.user.id, userName: req.user.name, userRole: req.user.role, action, module: 'finance-ledger', ...details };
});
const failFin = (res, e) => typedFail(res, e, 'FINANCE');
const fid = (req) => parseInt(req.params.id, 10);
const amountSchema = Joi.number().positive().precision(2);
// A payment batch groups payments of several projects: it is a company-level finance object, so a seat bound to some
// projects (project-scoped grants only) cannot see, approve or release one.
const companyOnly = (req, res, next) => (req.accessScope && req.accessScope.companyWide ? next()
  : res.status(403).json({ success: false, error: 'Payment batches need a company-wide finance grant', error_code: 'company_scope_required', error_params: {} }));

router.get('/credit-notes', authenticate, authorize(), async (req, res) => {
  try { res.json({ success: true, data: await docs.listCreditNotes(query, req.query) }); } catch (e) { return failFin(res, e); }
});
router.post('/credit-notes', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(Joi.object({
      party_type: Joi.string().valid('client', 'supplier').required(), invoice_id: Joi.number().integer(), supplier_invoice_id: Joi.number().integer(),
      amount: amountSchema.required(), tax_amount: Joi.number().min(0).precision(2), reason: Joi.string().required(),
    }), req, res);
    if (!value) return;
    const row = await auditedFin(req, (q) => docs.createCreditNote(q, value, req.user.id), 'create',
      (result) => ({ description: `Credit note ${result.credit_note_number}`, entityType: 'credit_note', entityId: result.id }));
    res.status(201).json({ success: true, data: row });
  } catch (e) { return failFin(res, e); }
});
router.get('/credit-notes/:id', authenticate, authorize(), async (req, res) => {
  try { res.json({ success: true, data: await docs.getCreditNote(query, fid(req)) }); } catch (e) { return failFin(res, e); }
});
router.post('/credit-notes/:id/issue', authenticate, authorize(), async (req, res) => {
  try {
    const row = await auditedFin(req, (q) => docs.issueCreditNote(q, fid(req), req.user), 'approve',
      (result) => ({ description: `Credit note ${result.credit_note_number} issued`, entityType: 'credit_note', entityId: result.id }));
    res.json({ success: true, data: row });
  } catch (e) { return failFin(res, e); }
});
router.post('/credit-notes/:id/void', authenticate, authorize(), async (req, res) => {
  try {
    const value = typedBody(Joi.object({ reason: Joi.string().required() }), req, res);
    if (!value) return;
    const row = await auditedFin(req, (q) => docs.voidCreditNote(q, fid(req), req.user, value.reason), 'void',
      (result) => ({ description: `Credit note ${result.credit_note_number} voided`, entityType: 'credit_note', entityId: result.id }));
    res.json({ success: true, data: row });
  } catch (e) { return failFin(res, e); }
});

router.get('/payment-batches', authenticate, authorize(), companyOnly, async (req, res) => {
  try { res.json({ success: true, data: await docs.listBatches(query, req.query) }); } catch (e) { return failFin(res, e); }
});
router.post('/payment-batches', authenticate, authorize(), companyOnly, async (req, res) => {
  try {
    const value = typedBody(Joi.object({
      bank_account_id: Joi.number().integer().allow(null), currency: Joi.string().length(3).uppercase(), payment_date: Joi.date().iso().allow(null), notes: Joi.string().allow('', null),
      items: Joi.array().items(Joi.object({ supplier_invoice_id: Joi.number().integer().required(), amount: amountSchema, project_id: Joi.number().integer() })).min(1).required(),
    }), req, res);
    if (!value) return;
    authorizeProjectPayload(req, value);
    const row = await auditedFin(req, (q) => docs.createBatch(q, { ...value, payment_date: value.payment_date ? new Date(value.payment_date).toISOString().slice(0, 10) : null }, req.user.id), 'create',
      (result) => ({ description: `Payment batch ${result.batch_number}`, entityType: 'payment_batch', entityId: result.id }));
    res.status(201).json({ success: true, data: row });
  } catch (e) { return failFin(res, e); }
});
router.get('/payment-batches/:id', authenticate, authorize(), companyOnly, async (req, res) => {
  try { res.json({ success: true, data: await docs.getBatch(query, fid(req)) }); } catch (e) { return failFin(res, e); }
});
router.post('/payment-batches/:id/submit', authenticate, authorize(), companyOnly, async (req, res) => {
  try {
    const row = await auditedFin(req, (q) => docs.submitBatch(q, fid(req), req.user), 'submit',
      (result) => ({ description: `Payment batch ${result.batch_number} submitted`, entityType: 'payment_batch', entityId: result.id }));
    res.json({ success: true, data: row });
  } catch (e) { return failFin(res, e); }
});
router.post('/payment-batches/:id/approve', authenticate, authorize(), companyOnly, async (req, res) => {
  try {
    const row = await auditedFin(req, (q) => docs.approveBatch(q, fid(req), req.user), 'approve',
      (result) => ({ description: `Payment batch ${result.batch_number} approved`, entityType: 'payment_batch', entityId: result.id }));
    res.json({ success: true, data: row });
  } catch (e) { return failFin(res, e); }
});
router.post('/payment-batches/:id/release', authenticate, authorize(), companyOnly, async (req, res) => {
  try {
    const out = await auditedFin(req, (q) => docs.releaseBatch(q, fid(req), req.user), 'create',
      (result) => ({ description: `Payment batch ${result.batch.batch_number} released (${result.payments.length} payments)`, entityType: 'payment_batch', entityId: result.batch.id }));
    res.json({ success: true, data: out });
  } catch (e) { return failFin(res, e); }
});
router.post('/payment-batches/:id/cancel', authenticate, authorize(), companyOnly, async (req, res) => {
  try {
    const value = typedBody(Joi.object({ reason: Joi.string().required() }), req, res);
    if (!value) return;
    const row = await auditedFin(req, (q) => docs.cancelBatch(q, fid(req), req.user, value.reason), 'void',
      (result) => ({ description: `Payment batch ${result.batch_number} cancelled`, entityType: 'payment_batch', entityId: result.id }));
    res.json({ success: true, data: row });
  } catch (e) { return failFin(res, e); }
});

router.use('/account-mappings', require('./glAccountMappings'));

module.exports = router;
