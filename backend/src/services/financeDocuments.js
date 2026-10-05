// Phase 5.5 (spec 10) - credit notes, payment batches (maker/checker) and the supplier-invoice workflow.
//
//   Credit notes   client (against an issued invoice) and supplier (against an approved supplier invoice). Draft ->
//                  issued -> void. Issuing posts through the ledger mapping table (glPosting for the client side,
//                  costAccrual for the supplier side because it also reverses cost) in the same transaction, and
//                  moves the invoice's credited_amount, which every outstanding/aging figure subtracts. A credit
//                  can never exceed what is still outstanding on the invoice (an overpayment is a refund, not a
//                  credit note). Maker/checker: the person who drew it up does not issue it.
//   Payment batch  groups supplier-invoice payments: draft -> submitted -> approved (a different person) ->
//                  released (one supplier payment per item, ledgered and allocated) | cancelled. No amount is
//                  ever allocated beyond an invoice's outstanding, counting what other open batches already hold.
//   Supplier invoice workflow  the seeded supplier_subcontract_invoice template; approving its 'approval' step
//                  runs the existing approval (the cost accrual point), so the accrual rules do not move.
// Everything runs on the caller's query function and throws CommercialError.
'use strict';

const numbering = require('./numbering');
const workflowEngine = require('./workflowEngine');
const finance = require('./financeEngine');
const glPosting = require('./glPosting');
const costAccrual = require('./costAccrual');
const procurement = require('./procurementService');
const money = require('../utils/money');
const { CommercialError, bad, conflict, missing, assertNotMaker } = require('./commercialErrors');

const toInt = (v) => (v == null || v === '' ? null : Number(v));
const toNum = (v) => (v == null ? 0 : Number(v));
const round2 = (n) => Math.round((toNum(n) + Number.EPSILON) * 100) / 100;

// A JournalError (unmapped account) or a typed cost error keeps its own code so the route can answer with it.
function asTyped(e) {
  if (e instanceof CommercialError) return e;
  if (e && e.error_code) return new CommercialError(e.status || 409, e.error_code, e.message, e.error_params || {});
  return e;
}

// --------------------------------------------------------------------------------------------------------
// Credit notes
// --------------------------------------------------------------------------------------------------------
async function getCreditNote(q, id) {
  const row = (await q(
    `SELECT cn.*, i.invoice_number, si.invoice_number AS supplier_invoice_number FROM credit_notes cn
       LEFT JOIN invoices i ON i.id = cn.invoice_id LEFT JOIN supplier_invoices si ON si.id = cn.supplier_invoice_id WHERE cn.id = $1`, [toInt(id)])).rows[0];
  if (!row) throw missing('credit_note_not_found', `Credit note #${id} not found`, { id });
  return row;
}

async function listCreditNotes(q, { project_id = null, party_type = null, status = null, invoice_id = null, supplier_invoice_id = null } = {}) {
  const conds = []; const params = [];
  if (project_id != null) conds.push(`cn.project_id = $${params.push(toInt(project_id))}`);
  if (party_type) conds.push(`cn.party_type = $${params.push(party_type)}`);
  if (status) conds.push(`cn.status = $${params.push(status)}`);
  if (invoice_id != null) conds.push(`cn.invoice_id = $${params.push(toInt(invoice_id))}`);
  if (supplier_invoice_id != null) conds.push(`cn.supplier_invoice_id = $${params.push(toInt(supplier_invoice_id))}`);
  return (await q(`SELECT cn.* FROM credit_notes cn ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''} ORDER BY cn.id DESC LIMIT 200`, params)).rows;
}

const draftCreditTotal = async (q, column, id) => toNum((await q(
  `SELECT COALESCE(SUM(amount), 0) AS s FROM credit_notes WHERE ${column} = $1 AND status = 'draft'`, [id])).rows[0].s);

async function createCreditNote(q, { party_type, invoice_id = null, supplier_invoice_id = null, amount, tax_amount = 0, reason }, userId) {
  if (String(reason || '').trim().length < 3) throw bad('reason_required', 'A reason is required for a credit note', {});
  if (toNum(tax_amount) > toNum(amount)) throw bad('credit_note_tax_exceeds_amount', 'The tax cannot exceed the credit note amount', {});
  let projectId = null; let balance;
  if (party_type === 'client') {
    if (invoice_id == null) throw bad('invoice_required', 'A client credit note names an invoice', {});
    const invoice = (await q('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [toInt(invoice_id)])).rows[0];
    if (!invoice) throw missing('invoice_not_found', `Invoice #${invoice_id} not found`, { invoice_id });
    if (!glPosting.ISSUED_STATUSES.has(invoice.status)) throw conflict('invoice_not_issued', `Invoice ${invoice.invoice_number} is ${invoice.status}: only an issued invoice can be credited`, { invoice_id: invoice.id, status: invoice.status });
    projectId = invoice.project_id;
    balance = (await finance.invoiceOutstanding(q, invoice.id)).outstanding - await draftCreditTotal(q, 'invoice_id', invoice.id);
  } else {
    if (supplier_invoice_id == null) throw bad('supplier_invoice_required', 'A supplier credit note names a supplier invoice', {});
    const invoice = (await q('SELECT * FROM supplier_invoices WHERE id = $1 FOR UPDATE', [toInt(supplier_invoice_id)])).rows[0];
    if (!invoice) throw missing('supplier_invoice_not_found', `Supplier invoice #${supplier_invoice_id} not found`, { supplier_invoice_id });
    if (invoice.status !== 'approved') throw conflict('supplier_invoice_not_credit_eligible', `Supplier invoice ${invoice.invoice_number} is ${invoice.status}: only an approved invoice can be credited`, { supplier_invoice_id: invoice.id, status: invoice.status });
    const po = invoice.purchase_order_id == null ? null : (await q('SELECT project_id FROM purchase_orders WHERE id = $1', [invoice.purchase_order_id])).rows[0];
    projectId = po ? po.project_id : null;
    balance = (await finance.supplierInvoiceOutstanding(q, invoice.id)).outstanding - await draftCreditTotal(q, 'supplier_invoice_id', invoice.id);
  }
  if (round2(amount) > round2(balance) + 1e-9) {
    throw bad('credit_note_exceeds_outstanding', `The credit note (${round2(amount)}) exceeds what is still outstanding on the invoice (${round2(balance)})`, { outstanding: round2(balance) });
  }
  const number = await numbering.nextNumber(q, { table: 'credit_notes', column: 'credit_note_number', prefix: party_type === 'client' ? 'CN' : 'SCN', pad: 5 });
  const row = (await q(
    `INSERT INTO credit_notes (credit_note_number, party_type, project_id, invoice_id, supplier_invoice_id, amount, tax_amount, reason, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [number, party_type, projectId, party_type === 'client' ? toInt(invoice_id) : null, party_type === 'client' ? null : toInt(supplier_invoice_id), amount, tax_amount, String(reason).trim(), userId])).rows[0];
  return getCreditNote(q, row.id);
}

async function issueCreditNote(q, id, user) {
  const cn = (await q('SELECT * FROM credit_notes WHERE id = $1 FOR UPDATE', [toInt(id)])).rows[0];
  if (!cn) throw missing('credit_note_not_found', `Credit note #${id} not found`, { id });
  if (cn.status !== 'draft') throw conflict('credit_note_not_draft', `Credit note ${cn.credit_note_number} is ${cn.status}: only a draft can be issued`, { id: cn.id, status: cn.status });
  await assertNotMaker(q, cn.created_by, user.id, 'credit note');
  try {
    if (cn.party_type === 'client') {
      const invoice = (await q('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [cn.invoice_id])).rows[0];
      const bal = await finance.invoiceOutstanding(q, invoice.id);
      if (round2(cn.amount) > bal.outstanding + 1e-9) throw bad('credit_note_exceeds_outstanding', `The credit note exceeds what is still outstanding on invoice ${invoice.invoice_number}`, { outstanding: bal.outstanding });
      await glPosting.postClientCreditNote(q, cn, invoice, { userId: user.id });
      await q('UPDATE invoices SET credited_amount = COALESCE(credited_amount, 0) + $2, updated_at = NOW() WHERE id = $1', [invoice.id, cn.amount]);
      const after = await finance.invoiceOutstanding(q, invoice.id);
      if (after.outstanding <= 1e-9 && !['void', 'cancelled'].includes(invoice.status)) {
        await q('UPDATE invoices SET status = $2, updated_at = NOW() WHERE id = $1', [invoice.id, after.allocated > 0 ? 'paid' : 'credited']);
      }
    } else {
      const invoice = (await q('SELECT * FROM supplier_invoices WHERE id = $1 FOR UPDATE', [cn.supplier_invoice_id])).rows[0];
      const bal = await finance.supplierInvoiceOutstanding(q, invoice.id);
      if (round2(cn.amount) > bal.outstanding + 1e-9) throw bad('credit_note_exceeds_outstanding', `The credit note exceeds what is still outstanding on supplier invoice ${invoice.invoice_number}`, { outstanding: bal.outstanding });
      await costAccrual.reverseSupplierInvoiceCostForCreditNote(q, cn, invoice, { userId: user.id });
      await q('UPDATE supplier_invoices SET credited_amount = COALESCE(credited_amount, 0) + $2 WHERE id = $1', [invoice.id, cn.amount]);
      const after = await finance.supplierInvoiceOutstanding(q, invoice.id);
      if (after.outstanding <= 1e-9) await q("UPDATE supplier_invoices SET status = 'paid' WHERE id = $1", [invoice.id]);
    }
  } catch (e) { throw asTyped(e); }
  await q("UPDATE credit_notes SET status = 'issued', issued_by = $2, issued_at = NOW(), updated_at = NOW() WHERE id = $1", [cn.id, user.id]);
  return getCreditNote(q, cn.id);
}

async function voidCreditNote(q, id, user, reason) {
  if (String(reason || '').trim().length < 3) throw bad('reason_required', 'A reason is required to void a credit note', {});
  const cn = (await q('SELECT * FROM credit_notes WHERE id = $1 FOR UPDATE', [toInt(id)])).rows[0];
  if (!cn) throw missing('credit_note_not_found', `Credit note #${id} not found`, { id });
  if (cn.status === 'void') throw conflict('credit_note_already_void', `Credit note ${cn.credit_note_number} is already void`, { id: cn.id });
  try {
    if (cn.status === 'issued') {
      if (cn.party_type === 'client') {
        const invoice = (await q('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [cn.invoice_id])).rows[0];
        await glPosting.reverseClientCreditNote(q, cn, { userId: user.id });
        await q('UPDATE invoices SET credited_amount = GREATEST(COALESCE(credited_amount, 0) - $2, 0), updated_at = NOW() WHERE id = $1', [invoice.id, cn.amount]);
        if (invoice.status === 'credited') await q("UPDATE invoices SET status = 'issued', updated_at = NOW() WHERE id = $1", [invoice.id]);
      } else {
        const invoice = (await q('SELECT * FROM supplier_invoices WHERE id = $1 FOR UPDATE', [cn.supplier_invoice_id])).rows[0];
        await costAccrual.restoreSupplierInvoiceCostForVoidedCreditNote(q, cn, { userId: user.id });
        await q('UPDATE supplier_invoices SET credited_amount = GREATEST(COALESCE(credited_amount, 0) - $2, 0) WHERE id = $1', [invoice.id, cn.amount]);
        const bal = await finance.supplierInvoiceOutstanding(q, invoice.id);
        if (bal.outstanding > 1e-9 && invoice.status === 'paid') await q("UPDATE supplier_invoices SET status = 'approved' WHERE id = $1", [invoice.id]);
      }
    }
  } catch (e) { throw asTyped(e); }
  await q("UPDATE credit_notes SET status = 'void', voided_by = $2, voided_at = NOW(), void_reason = $3, updated_at = NOW() WHERE id = $1", [cn.id, user.id, String(reason).trim()]);
  return getCreditNote(q, cn.id);
}

// --------------------------------------------------------------------------------------------------------
// Payment batches
// --------------------------------------------------------------------------------------------------------
const OPEN_BATCH = ['draft', 'submitted', 'approved'];

async function getBatch(q, id) {
  const b = (await q('SELECT * FROM payment_batches WHERE id = $1', [toInt(id)])).rows[0];
  if (!b) throw missing('payment_batch_not_found', `Payment batch #${id} not found`, { id });
  b.items = (await q(
    `SELECT i.*, si.invoice_number AS supplier_invoice_number, s.name_en AS supplier_name_en, s.name_ar AS supplier_name_ar
       FROM payment_batch_items i JOIN supplier_invoices si ON si.id = i.supplier_invoice_id JOIN suppliers s ON s.id = i.supplier_id
      WHERE i.batch_id = $1 ORDER BY i.id`, [b.id])).rows;
  b.total = round2(b.items.reduce((s, i) => s + toNum(i.amount), 0));
  return b;
}

async function listBatches(q, { status = null } = {}) {
  const params = []; const where = status ? `WHERE b.status = $${params.push(status)}` : '';
  return (await q(
    `SELECT b.*, (SELECT COALESCE(SUM(amount), 0) FROM payment_batch_items i WHERE i.batch_id = b.id) AS total,
            (SELECT COUNT(*)::int FROM payment_batch_items i WHERE i.batch_id = b.id) AS item_count
       FROM payment_batches b ${where} ORDER BY b.id DESC LIMIT 200`, params)).rows;
}

// What one supplier invoice can still be paid: outstanding, less what other OPEN batches already hold for it.
async function payableLeft(q, invoiceId, exceptBatchId = null) {
  const bal = await finance.supplierInvoiceOutstanding(q, invoiceId);
  const held = toNum((await q(
    `SELECT COALESCE(SUM(i.amount), 0) AS s FROM payment_batch_items i JOIN payment_batches b ON b.id = i.batch_id
      WHERE i.supplier_invoice_id = $1 AND b.status = ANY($2::text[]) AND ($3::int IS NULL OR b.id <> $3)`, [invoiceId, OPEN_BATCH, exceptBatchId])).rows[0].s);
  return round2(bal.outstanding - held);
}

async function createBatch(q, { bank_account_id = null, currency = 'EGP', payment_date = null, notes = null, items }, userId) {
  if (!items || !items.length) throw bad('payment_batch_items_required', 'A payment batch needs at least one item', {});
  if (bank_account_id != null && !(await q('SELECT 1 FROM org_bank_accounts WHERE id = $1', [bank_account_id])).rows.length) throw missing('bank_account_not_found', `Bank account #${bank_account_id} not found`, { bank_account_id });
  const ids = items.map((i) => i.supplier_invoice_id);
  if (new Set(ids).size !== ids.length) throw bad('payment_batch_duplicate_invoice', 'An invoice can appear once in a batch', {});
  const number = await numbering.nextNumber(q, { table: 'payment_batches', column: 'batch_number', prefix: 'PB', pad: 5 });
  const batch = (await q('INSERT INTO payment_batches (batch_number, bank_account_id, currency, payment_date, notes, created_by) VALUES ($1,$2,$3,COALESCE($4::date, CURRENT_DATE),$5,$6) RETURNING id',
    [number, bank_account_id, currency, payment_date, notes, userId])).rows[0];
  await addItems(q, batch.id, items);
  return getBatch(q, batch.id);
}

async function addItems(q, batchId, items) {
  for (const item of [...items].sort((a, b) => a.supplier_invoice_id - b.supplier_invoice_id)) {
    const invoice = (await q('SELECT * FROM supplier_invoices WHERE id = $1 FOR UPDATE', [toInt(item.supplier_invoice_id)])).rows[0];
    if (!invoice) throw missing('supplier_invoice_not_found', `Supplier invoice #${item.supplier_invoice_id} not found`, { supplier_invoice_id: item.supplier_invoice_id });
    if (invoice.status !== 'approved') throw conflict('supplier_invoice_not_payable', `Supplier invoice ${invoice.invoice_number} is ${invoice.status}: only an approved invoice can be paid`, { supplier_invoice_id: invoice.id, status: invoice.status });
    const po = invoice.purchase_order_id == null ? null : (await q('SELECT project_id FROM purchase_orders WHERE id = $1', [invoice.purchase_order_id])).rows[0];
    const projectId = (po && po.project_id) || item.project_id || null;
    if (projectId == null) throw bad('payment_batch_project_required', `Supplier invoice ${invoice.invoice_number} names no project: say which project the payment belongs to`, { supplier_invoice_id: invoice.id });
    const left = await payableLeft(q, invoice.id, batchId);
    const amount = item.amount == null ? left : item.amount;
    if (!(toNum(amount) > 0)) throw bad('payment_amount_invalid', 'The payment amount must be positive', { supplier_invoice_id: invoice.id });
    if (round2(amount) > left + 1e-9) throw bad('payment_exceeds_payable', `Supplier invoice ${invoice.invoice_number}: ${round2(amount)} exceeds the ${left} still payable (other open batches count)`, { supplier_invoice_id: invoice.id, payable: left });
    await q('INSERT INTO payment_batch_items (batch_id, supplier_invoice_id, supplier_id, project_id, amount) VALUES ($1,$2,$3,$4,$5)', [batchId, invoice.id, invoice.supplier_id, projectId, amount]);
  }
}

async function lockBatch(q, id) {
  const b = (await q('SELECT * FROM payment_batches WHERE id = $1 FOR UPDATE', [toInt(id)])).rows[0];
  if (!b) throw missing('payment_batch_not_found', `Payment batch #${id} not found`, { id });
  return b;
}

async function submitBatch(q, id, user) {
  const b = await lockBatch(q, id);
  if (b.status !== 'draft') throw conflict('payment_batch_not_draft', `Batch ${b.batch_number} is ${b.status}: only a draft can be submitted`, { id: b.id, status: b.status });
  await q("UPDATE payment_batches SET status = 'submitted', submitted_at = NOW(), updated_at = NOW() WHERE id = $1", [b.id]);
  void user;
  return getBatch(q, b.id);
}

async function approveBatch(q, id, user) {
  const b = await lockBatch(q, id);
  if (b.status !== 'submitted') throw conflict('payment_batch_not_submitted', `Batch ${b.batch_number} is ${b.status}: only a submitted batch can be approved`, { id: b.id, status: b.status });
  await assertNotMaker(q, b.created_by, user.id, 'payment batch');
  await q("UPDATE payment_batches SET status = 'approved', approved_by = $2, approved_at = NOW(), updated_at = NOW() WHERE id = $1", [b.id, user.id]);
  return getBatch(q, b.id);
}

// Release: one supplier payment per item, ledgered (Dr payable | Cr cash) and allocated to its invoice, all in the
// caller's transaction. The amounts are re-checked under the invoice row locks.
async function releaseBatch(q, id, user) {
  const b = await lockBatch(q, id);
  if (b.status !== 'approved') throw conflict('payment_batch_not_approved', `Batch ${b.batch_number} is ${b.status}: only an approved batch can be released`, { id: b.id, status: b.status });
  const items = (await q('SELECT * FROM payment_batch_items WHERE batch_id = $1 ORDER BY supplier_invoice_id', [b.id])).rows;
  const payments = [];
  for (const item of items) {
    await q('SELECT id FROM supplier_invoices WHERE id = $1 FOR UPDATE', [item.supplier_invoice_id]);
    const bal = await finance.supplierInvoiceOutstanding(q, item.supplier_invoice_id);
    if (toNum(item.amount) > bal.outstanding + 1e-9) {
      throw bad('payment_exceeds_payable', `Supplier invoice #${item.supplier_invoice_id}: ${item.amount} exceeds the ${bal.outstanding} outstanding at release`, { supplier_invoice_id: item.supplier_invoice_id, payable: bal.outstanding });
    }
    const payment = (await q(
      `INSERT INTO payments (project_id, direction, supplier_id, amount, payment_date, payment_method, reference_number, notes, created_by)
       VALUES ($1,'ap',$2,$3,$4,'bank_transfer',$5,$6,$7) RETURNING *`,
      [item.project_id, item.supplier_id, item.amount, b.payment_date, b.batch_number, `Payment batch ${b.batch_number}`, user.id])).rows[0];
    try { await glPosting.postSupplierPayment(q, payment, { userId: user.id }); } catch (e) { throw asTyped(e); }
    await finance.allocatePayment(q, { payment_id: payment.id, allocations: [{ target_type: 'supplier_invoice', supplier_invoice_id: item.supplier_invoice_id, amount: item.amount }], allocated_by: user.id, actor_name: user.name });
    await q('UPDATE payment_batch_items SET payment_id = $2 WHERE id = $1', [item.id, payment.id]);
    payments.push(payment);
  }
  await q("UPDATE payment_batches SET status = 'released', released_by = $2, released_at = NOW(), updated_at = NOW() WHERE id = $1", [b.id, user.id]);
  return { batch: await getBatch(q, b.id), payments };
}

async function cancelBatch(q, id, user, reason) {
  if (String(reason || '').trim().length < 3) throw bad('reason_required', 'A reason is required to cancel a batch', {});
  const b = await lockBatch(q, id);
  if (!OPEN_BATCH.includes(b.status)) throw conflict('payment_batch_cannot_cancel', `Batch ${b.batch_number} is ${b.status} and cannot be cancelled`, { id: b.id, status: b.status });
  await q("UPDATE payment_batches SET status = 'cancelled', cancelled_by = $2, cancelled_at = NOW(), cancel_reason = $3, updated_at = NOW() WHERE id = $1", [b.id, user.id, String(reason).trim()]);
  return getBatch(q, b.id);
}

// --------------------------------------------------------------------------------------------------------
// Supplier invoice workflow (seeded template supplier_subcontract_invoice)
// --------------------------------------------------------------------------------------------------------
async function startSupplierInvoiceWorkflow(q, invoiceId, user) {
  const inv = (await q('SELECT * FROM supplier_invoices WHERE id = $1 FOR UPDATE', [toInt(invoiceId)])).rows[0];
  if (!inv) throw missing('supplier_invoice_not_found', `Supplier invoice #${invoiceId} not found`, { id: invoiceId });
  if (inv.workflow_instance_id != null) throw conflict('workflow_already_started', 'This supplier invoice already has a workflow', { id: inv.id });
  if (inv.status !== 'received') throw conflict('supplier_invoice_not_received', `Supplier invoice ${inv.invoice_number} is ${inv.status}: only a received invoice starts the workflow`, { id: inv.id, status: inv.status });
  const po = inv.purchase_order_id == null ? null : (await q('SELECT project_id FROM purchase_orders WHERE id = $1', [inv.purchase_order_id])).rows[0];
  const instance = await workflowEngine.startWorkflow('supplier_subcontract_invoice', 'supplier_invoice', inv.id, {
    module_name: 'supplier_subcontract_invoice', requester_id: user.id, project_id: po ? po.project_id : null, amount: toNum(inv.total_amount),
  }, { query: q });
  const step = (await q("SELECT id FROM workflow_step_instances WHERE instance_id = $1 AND step_key = 'received' AND status = 'pending'", [instance.instance.id])).rows[0];
  if (step) {
    const r = await workflowEngine.recordDecision(instance.instance.id, step.id, user.id, 'approve', 'Received', { query: q, role: user.role, userName: user.name });
    if (!r.ok) throw bad('workflow_step_refused', r.error, { id: inv.id });
  }
  await q('UPDATE supplier_invoices SET workflow_instance_id = $2 WHERE id = $1', [inv.id, instance.instance.id]);
  return workflowState(q, inv.id);
}

async function workflowState(q, invoiceId) {
  const inv = (await q('SELECT * FROM supplier_invoices WHERE id = $1', [toInt(invoiceId)])).rows[0];
  if (!inv) throw missing('supplier_invoice_not_found', `Supplier invoice #${invoiceId} not found`, { id: invoiceId });
  const wf = inv.workflow_instance_id == null ? null : (await q('SELECT id, status, current_step_key FROM workflow_instances WHERE id = $1', [inv.workflow_instance_id])).rows[0];
  return { invoice: inv, workflow: wf || null };
}

// A decision at the 'approval' step runs the invoice approval (the accrual point), in the same transaction: the
// approval of the invoice and the accrual of its cost stay one act. Steps before it only move the workflow.
async function decideSupplierInvoice(q, invoiceId, user, decision, comment = null) {
  if (!['approve', 'reject'].includes(decision)) throw bad('decision_invalid', 'decision must be approve or reject', { decision });
  const inv = (await q('SELECT * FROM supplier_invoices WHERE id = $1 FOR UPDATE', [toInt(invoiceId)])).rows[0];
  if (!inv) throw missing('supplier_invoice_not_found', `Supplier invoice #${invoiceId} not found`, { id: invoiceId });
  if (inv.workflow_instance_id == null) throw conflict('workflow_not_started', 'The supplier invoice workflow has not been started', { id: inv.id });
  const before = (await q('SELECT status, current_step_key FROM workflow_instances WHERE id = $1', [inv.workflow_instance_id])).rows[0];
  if (before.status !== 'active') throw conflict('workflow_closed', `The workflow is ${before.status}`, { id: inv.id, status: before.status });
  const result = await workflowEngine.recordDecision(inv.workflow_instance_id, null, user.id, decision, comment, { query: q, role: user.role, userName: user.name });
  if (!result.ok) throw new CommercialError(403, 'supplier_invoice_decision_refused', result.error, { id: inv.id });
  let approval = null;
  if (decision === 'approve' && before.current_step_key === 'approval') {
    try { approval = await procurement.approveSupplierInvoice(q, inv.id, user); } catch (e) { throw asTyped(e); }
  }
  return { ...(await workflowState(q, inv.id)), approval };
}

module.exports = {
  getCreditNote, listCreditNotes, createCreditNote, issueCreditNote, voidCreditNote,
  getBatch, listBatches, createBatch, submitBatch, approveBatch, releaseBatch, cancelBatch,
  startSupplierInvoiceWorkflow, decideSupplierInvoice, workflowState, money,
};
