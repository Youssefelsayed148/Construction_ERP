// Phase 14 — AR/AP ledgers, client valuations, allocations, reminders.
//
// Built on the existing invoices/payments tables (widened, nothing parallel)
// and on Phase 13's commercialEngine (the certificate math) and Phase 12's
// supplier invoices + three-way match exceptions (→ AP review queue).
//
// Certificate calculation (implemented exactly, nothing invented):
//   Gross Current Work + Approved Variations This Period = Gross Certified
//   Gross Certified − Retention − Advance Recovery − Other Deductions + Tax
//     = Net Certificate / Invoice Basis
// with previous cumulative tracked so nothing gets double-certified.
//
// Allocation rules (enforced, never bypassed):
//   Σ allocations on an invoice ≤ the invoice's outstanding (net − paid)
//   Σ allocations on a payment ≤ the payment amount
//
// Every financial create/status change writes an audit_events row.

'use strict';

const { query: defaultQuery } = require('../config/database');
const { nextNumber } = require('./numbering');
const commercialEngine = require('./commercialEngine');
const glPosting = require('./glPosting');
const sweepLeader = require('./sweepLeader');

const INVOICE_LIFECYCLE = ['draft', 'approved', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled', 'void', 'credited'];
const REMINDER_STAGES = [
  { key: 'due_soon', daysBefore: 7 },
  { key: 'due_today', days: 0 },
  { key: 'overdue_7', daysOverdue: 7 },
  { key: 'overdue_14', daysOverdue: 14 },
  { key: 'overdue_30', daysOverdue: 30 },
];
const DEFAULT_REMINDER_ROLES = {
  due_soon: ['project_manager'],
  due_today: ['project_manager', 'finance_manager'],
  overdue_7: ['finance_manager'],
  overdue_14: ['finance_manager', 'owner'],
  overdue_30: ['owner', 'admin'], // CFO-equivalent escalation
};

function toNum(v) {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round((toNum(n) + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Audit events — immutable mirror on every create/status change
// ---------------------------------------------------------------------------

async function writeAuditEvent(q, {
  entity_type, entity_id, event_type, actor_id = null, actor_name = null,
  before_state = {}, after_state = {},
}) {
  // Dual-write: audit_events is ONE physical table shared with the Phase 4
  // policy engine, whose columns are entity / action / "before" / "after" /
  // user_id (entity+action NOT NULL there). Populate both column families so
  // either reader sees every event and neither schema's constraints bite.
  const beforeJson = JSON.stringify(before_state || {});
  const afterJson = JSON.stringify(after_state || {});
  const r = await q(
    `INSERT INTO audit_events
       (entity_type, entity_id, event_type, actor_id, actor_name, before_state, after_state,
        entity, action, "before", "after", user_id)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10::jsonb, $11::jsonb, $12)
     RETURNING *`,
    [entity_type, entity_id, event_type, actor_id, actor_name, beforeJson, afterJson,
     entity_type, event_type, beforeJson, afterJson, actor_id]
  );
  return r.rows[0];
}

// ---------------------------------------------------------------------------
// Tax module
// ---------------------------------------------------------------------------

async function ensureTaxCodes(q) {
  const existing = (await q('SELECT id FROM tax_codes')).rows;
  if (existing.length > 0) return 0;
  const seeds = [
    ['VAT14', 'Value Added Tax', 14],
    ['VAT5', 'Reduced Rate VAT', 5],
    ['ZERO', 'Zero-rated', 0],
    ['WHT1', 'Withholding 1%', 1],
  ];
  for (const [code, name, rate] of seeds) {
    await q(
      'INSERT INTO tax_codes (code, name, rate_pct, is_active) VALUES ($1, $2, $3, true)',
      [code, name, rate]
    );
  }
  return seeds.length;
}

async function taxAmountFor(q, netBase, taxPct) {
  void q;
  return round2(Math.max(toNum(netBase), 0) * toNum(taxPct) / 100);
}

// ---------------------------------------------------------------------------
// Client valuations (the certificate calculation, cumulative-safe)
// ---------------------------------------------------------------------------

async function createClientValuation(q, {
  project_id, client_id, client_contract_id = null, gross_current_work,
  approved_variations_period = 0, retention = 0, advance_recovery = 0,
  other_deductions = 0, tax_pct = 0, issue_date = null, due_date = null,
  description = null, company_id = null, cost_code_id = null, department = null,
  created_by = null, actor_name = null,
}) {
  // Nothing double-certified: previous cumulative = Σ prior certified of the
  // contract (or the project when no contract is linked).
  const priorRows = (await q(
    'SELECT id, cumulative_certified, client_contract_id, status FROM invoices WHERE project_id = $1',
    [project_id]
  )).rows;
  const prior = priorRows.filter((r) => !['cancelled', 'void'].includes(r.status))
    .filter((r) => client_contract_id == null || r.client_contract_id === client_contract_id);
  // cumulative_certified already includes every earlier period, so summing
  // cumulative rows double-counts history (100, 200 -> 300 before period 3).
  const previousCumulative = round2(prior.reduce(
    (max, r) => Math.max(max, toNum(r.cumulative_certified)), 0
  ));

  const certifiedGross = round2(toNum(gross_current_work) + toNum(approved_variations_period));
  const netBeforeTax = certifiedGross - toNum(retention) - toNum(advance_recovery) - toNum(other_deductions);
  const tax = round2(netBeforeTax * toNum(tax_pct) / 100);
  const netAmount = round2(netBeforeTax + tax);
  const cumulative = round2(previousCumulative + certifiedGross);

  return createInvoiceRecord(q, {
    project_id, client_id, amount: netAmount,
    issue_date: issue_date || new Date().toISOString().slice(0, 10),
    due_date: due_date || null, status: 'draft', description,
    client_contract_id, gross_current_work, approved_variations_period,
    certified_gross: certifiedGross, retention_amount: retention, advance_recovery, other_deductions,
    tax_pct, tax_amount: tax, net_amount: netAmount,
    previous_cumulative: previousCumulative, cumulative_certified: cumulative,
    company_id, cost_code_id, department, created_by,
  }, { actor_id: created_by, actor_name, line_items: valuationLineItems({
    gross_current_work, approved_variations_period, retention, advance_recovery, other_deductions, tax_amount: tax,
  }) });
}

function valuationLineItems({ gross_current_work, approved_variations_period, retention, advance_recovery, other_deductions, tax_amount }) {
  return [
    { line_type: 'work', description_en: 'Certified work', description_ar: 'أعمال معتمدة', amount: round2(toNum(gross_current_work)) },
    { line_type: 'variation', description_en: 'Approved variations', description_ar: 'تغييرات معتمدة', amount: round2(toNum(approved_variations_period)) },
    { line_type: 'retention', description_en: 'Retention withheld', description_ar: 'استقطاع ضمان', amount: -round2(toNum(retention)) },
    { line_type: 'advance_recovery', description_en: 'Advance recovery', description_ar: 'استرداد دفعة مقدمة', amount: -round2(toNum(advance_recovery)) },
    { line_type: 'deduction', description_en: 'Other deductions', description_ar: 'استقطاعات أخرى', amount: -round2(toNum(other_deductions)) },
    { line_type: 'other', description_en: 'Output tax', description_ar: 'ضريبة المخرجات', amount: round2(toNum(tax_amount)) },
  ].filter((line) => line.amount !== 0);
}

// The ONE place an invoice row is created (manual invoices, unit-sale invoices and client
// valuations all come through here): number from the numbering service, whitelisted columns,
// audit event. Pass the transaction client as `q` to make it part of the caller's transaction.
const INVOICE_COLUMNS = new Set([
  'project_id', 'client_id', 'amount', 'issue_date', 'due_date', 'status', 'description',
  'client_contract_id', 'gross_current_work', 'approved_variations_period', 'certified_gross',
  'retention_amount', 'advance_recovery', 'other_deductions', 'tax_pct', 'tax_amount', 'net_amount',
  'previous_cumulative', 'cumulative_certified', 'company_id', 'cost_code_id', 'department', 'created_by', 'payment_certificate_id',
]);

async function writeInvoiceLines(q, invoiceId, lineItems, invoiceAmount) {
  const normalized = (lineItems && lineItems.length ? lineItems : [{
    line_type: 'other', description: 'Invoice amount', amount: round2(toNum(invoiceAmount)),
  }]).map((line) => ({
    line_type: line.line_type || 'other',
    description_en: String(line.description_en || line.description || 'Invoice line').slice(0, 500),
    description_ar: String(line.description_ar || line.description || line.description_en || 'بند فاتورة').slice(0, 500),
    boq_item_id: line.boq_item_id ?? null, cost_code_id: line.cost_code_id ?? null,
    quantity: toNum(line.quantity) || 1, unit: line.unit ?? null,
    unit_rate: round2(toNum(line.unit_rate ?? line.amount)), amount: round2(toNum(line.amount)),
  })).filter((line) => line.amount !== 0);
  const total = round2(normalized.reduce((sum, line) => sum + line.amount, 0));
  if (Math.abs(total - round2(toNum(invoiceAmount))) > 0.01) {
    const error = new Error('Invoice line total does not equal the invoice amount');
    error.status = 400; error.error_code = 'invoice_lines_total_mismatch'; throw error;
  }
  for (let i = 0; i < normalized.length; i += 1) {
    const line = normalized[i];
    await q(`INSERT INTO invoice_lines (invoice_id, line_no, line_type, description, description_en, description_ar, boq_item_id, cost_code_id, quantity, unit, unit_rate, amount)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [invoiceId, i + 1, line.line_type, line.description_en, line.description_en, line.description_ar, line.boq_item_id, line.cost_code_id,
      line.quantity, line.unit, line.unit_rate, line.amount]);
  }
  return normalized;
}

async function createInvoiceRecord(q, fields, { actor_id = null, actor_name = null, line_items = null } = {}) {
  const unknown = Object.keys(fields).filter((k) => !INVOICE_COLUMNS.has(k));
  if (unknown.length) throw new Error(`createInvoiceRecord: unknown column(s) ${unknown.join(', ')}`);
  const invoiceNumber = await nextNumber(q, { table: 'invoices', column: 'invoice_number', prefix: 'INV', pad: 4 });
  const cols = Object.keys(fields);
  const r = await q(
    `INSERT INTO invoices (invoice_number, ${cols.join(', ')})
     VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')}) RETURNING *`,
    [invoiceNumber, ...cols.map((c) => fields[c])]
  );
  const invoice = r.rows[0];
  invoice.lines = await writeInvoiceLines(q, invoice.id, line_items, invoice.amount);
  await writeAuditEvent(q, {
    entity_type: 'invoice', entity_id: invoice.id, event_type: 'create',
    actor_id, actor_name, after_state: invoice,
  });
  // An invoice created already issued (manual, unit sale) is posted with its creation; a failure fails the caller.
  await glPosting.syncInvoicePosting(q, null, invoice, { userId: actor_id });
  return invoice;
}

async function createInvoiceFromCertificate(q, certificate, clientId, user) {
  if (certificate.party_type !== 'client' || certificate.status !== 'certified') {
    const error = new Error('Only a certified client certificate can create a client invoice');
    error.status = 409; error.error_code = 'certificate_not_invoice_eligible'; throw error;
  }
  const existing = (await q('SELECT * FROM invoices WHERE payment_certificate_id = $1 FOR UPDATE', [certificate.id])).rows[0];
  if (existing) return existing;
  return createInvoiceRecord(q, {
    payment_certificate_id: certificate.id, project_id: certificate.project_id, client_id: clientId,
    client_contract_id: certificate.client_contract_id, amount: certificate.net_certificate,
    issue_date: new Date().toISOString().slice(0, 10), status: 'draft',
    description: `From payment certificate ${certificate.certificate_number}`,
    gross_current_work: certificate.gross_current_work,
    approved_variations_period: certificate.approved_variations_period,
    certified_gross: certificate.gross_certified, retention_amount: certificate.retention_held,
    advance_recovery: certificate.advance_recovery, other_deductions: certificate.other_deductions,
    tax_pct: certificate.tax_pct, tax_amount: certificate.tax_amount, net_amount: certificate.net_certificate,
    previous_cumulative: certificate.previous_cumulative, cumulative_certified: certificate.cumulative_certified,
    created_by: user.id,
  }, { actor_id: user.id, actor_name: user.name, line_items: valuationLineItems({
    gross_current_work: certificate.gross_current_work, approved_variations_period: certificate.approved_variations_period,
    retention: certificate.retention_held, advance_recovery: certificate.advance_recovery,
    other_deductions: certificate.other_deductions, tax_amount: certificate.tax_amount,
  }) });
}

// Lifecycle transitions with audit.
async function transitionInvoice(q, invoiceId, newStatus, user, extra = {}) {
  const existing = (await q('SELECT * FROM invoices WHERE id = $1', [invoiceId])).rows[0];
  if (!existing) throw new Error(`Invoice #${invoiceId} not found`);
  const allowed = {
    draft: ['approved', 'cancelled'],
    approved: ['issued', 'cancelled'],
    issued: ['partially_paid', 'paid', 'overdue', 'cancelled', 'void', 'credited'],
    partially_paid: ['paid', 'overdue'],
    paid: ['credited'],
    overdue: ['partially_paid', 'paid', 'void'],
  };
  const from = existing.status === 'sent' ? 'issued' : existing.status; // legacy 'sent' ≡ issued
  if (!['credited', 'void', 'cancelled'].includes(newStatus)
      && allowed[from] && !allowed[from].includes(newStatus)) {
    throw new Error(`Invalid lifecycle transition: ${from} → ${newStatus}`);
  }
  if ((from === 'paid' || from === 'partially_paid') && newStatus === 'void' && toNum(existing.paid_total || 0) > 0) {
    throw new Error('Cannot void an invoice that has payments allocated');
  }

  const sets = ['status = $1', 'updated_at = $2'];
  const params = [newStatus, new Date()];
  if (newStatus === 'approved') { sets.push('approved_by = $' + (params.length + 1)); params.push(user ? user.id : null); }
  if (newStatus === 'void') { sets.push('voided_at = $' + (params.length + 1)); params.push(new Date()); }
  for (const [k, v] of Object.entries(extra)) { sets.push(`${k} = $${params.length + 1}`); params.push(v); }
  params.push(invoiceId);
  const r = await q(`UPDATE invoices SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  const updated = r.rows[0];
  await writeAuditEvent(q, {
    entity_type: 'invoice', entity_id: invoiceId, event_type: 'status_change',
    actor_id: user ? user.id : null, actor_name: user ? user.name : null,
    before_state: existing, after_state: updated,
  });
  await glPosting.syncInvoicePosting(q, existing, updated, { userId: user ? user.id : null, date: new Date().toISOString().split('T')[0] });
  return updated;
}

// Overdue detection (used by the reminder sweep and reads).
// B1 (C-FIN-AR-001): the ONE lifecycle derivation, shared by routes and services. Only the
// issued family (issued, sent, partially_paid, overdue) can derive paid / partially_paid /
// overdue; draft and approved invoices keep their lifecycle status no matter how past their
// due date is, so a read never promotes an unissued invoice into the money lifecycle.
const ISSUED_FAMILY_STATUSES = new Set(['issued', 'sent', 'partially_paid', 'overdue']);

function computeLifecycleStatus(invoice, totalPaid, now = new Date()) {
  // Phase 5.5: issued credit notes reduce what the client owes (invoices.credited_amount).
  const net = (invoice.net_amount != null ? toNum(invoice.net_amount) : toNum(invoice.amount)) - toNum(invoice.credited_amount);
  const paid = toNum(totalPaid);
  if (invoice.status === 'credited' || invoice.status === 'void' || invoice.status === 'cancelled') return invoice.status;
  if (!ISSUED_FAMILY_STATUSES.has(invoice.status)) return invoice.status;
  if (paid >= net && net > 0) return 'paid';
  if (invoice.due_date != null && new Date(invoice.due_date) < new Date(now) && paid < net) return 'overdue';
  if (paid > 0) return 'partially_paid';
  return invoice.status;
}

// ---------------------------------------------------------------------------
// Allocations — the hard invariant layer
// ---------------------------------------------------------------------------

async function invoiceOutstanding(q, invoiceId) {
  const inv = (await q('SELECT * FROM invoices WHERE id = $1', [invoiceId])).rows[0];
  if (!inv) throw new Error(`Invoice #${invoiceId} not found`);
  const net = inv.net_amount != null && toNum(inv.net_amount) > 0 ? toNum(inv.net_amount) : toNum(inv.amount);
  const allocs = (await q(
    "SELECT * FROM payment_allocations WHERE invoice_id = $1 AND target_type = 'client_invoice' AND voided_at IS NULL",
    [invoiceId]
  )).rows;
  const allocatedSum = round2(allocs.reduce((s, a) => s + toNum(a.amount), 0));
  const credited = round2(toNum(inv.credited_amount)); // issued credit notes (Phase 5.5)
  return { net, credited, allocated: allocatedSum, outstanding: round2(net - credited - allocatedSum) };
}

async function supplierInvoiceOutstanding(q, supplierInvoiceId) {
  const inv = (await q('SELECT * FROM supplier_invoices WHERE id = $1', [supplierInvoiceId])).rows[0];
  if (!inv) throw new Error(`Supplier invoice #${supplierInvoiceId} not found`);
  const allocs = (await q(
    "SELECT * FROM payment_allocations WHERE supplier_invoice_id = $1 AND target_type = 'supplier_invoice' AND voided_at IS NULL",
    [supplierInvoiceId]
  )).rows;
  const allocated = round2(allocs.reduce((s, a) => s + toNum(a.amount), 0));
  const credited = round2(toNum(inv.credited_amount)); // issued supplier credit notes (Phase 5.5)
  return { net: toNum(inv.total_amount), credited, allocated, outstanding: round2(toNum(inv.total_amount) - credited - allocated) };
}

// Allocate one payment across one or more documents. Enforced in one pass:
// per-document outstanding is never exceeded; the payment total is never
// exceeded. Returns the allocations and the fresh per-document balances.
async function allocatePayment(q, {
  payment_id, allocations = [], allocated_by = null, actor_name = null,
}) {
  const payment = (await q('SELECT * FROM payments WHERE id = $1', [payment_id])).rows[0];
  if (!payment) throw new Error(`Payment #${payment_id} not found`);
  if (payment.voided_at) throw new Error(`Payment #${payment_id} is void and cannot be allocated`);

  const existing = (await q(
    'SELECT * FROM payment_allocations WHERE payment_id = $1 AND voided_at IS NULL',
    [payment_id]
  )).rows;
  const alreadyAllocated = round2(existing.reduce((s, a) => s + toNum(a.amount), 0));
  const requested = round2(allocations.reduce((s, a) => s + toNum(a.amount), 0));
  if (round2(alreadyAllocated + requested) > toNum(payment.amount) + 1e-9) {
    throw new Error(`Allocation exceeds the payment amount: ${payment.amount} available, ${round2(alreadyAllocated + requested)} requested`);
  }

  // Validate every target before the first write. Routes also wrap this in a
  // transaction for rollback and row-lock protection on real PostgreSQL.
  const validated = [];
  const plannedByTarget = new Map();
  for (const a of allocations) {
    const amount = round2(toNum(a.amount));
    if (!(amount > 0)) throw new Error('Allocation amounts must be positive');
    if (a.target_type === 'supplier_invoice') {
      if (!a.supplier_invoice_id) throw new Error('Supplier invoice ID is required');
      const bal = await supplierInvoiceOutstanding(q, a.supplier_invoice_id);
      const key = `supplier:${a.supplier_invoice_id}`;
      const planned = round2((plannedByTarget.get(key) || 0) + amount);
      if (planned > bal.outstanding + 1e-9) {
        throw new Error(`Allocation exceeds the supplier invoice's outstanding balance: ${bal.outstanding} outstanding, ${amount} requested`);
      }
      plannedByTarget.set(key, planned);
      validated.push({ ...a, amount, target_type: 'supplier_invoice' });
    } else {
      if (!a.invoice_id) throw new Error('Invoice ID is required');
      const inv = (await q('SELECT * FROM invoices WHERE id = $1', [a.invoice_id])).rows[0];
      if (!inv) throw new Error(`Invoice #${a.invoice_id} not found`);
      const bal = await invoiceOutstanding(q, a.invoice_id);
      const key = `client:${a.invoice_id}`;
      const planned = round2((plannedByTarget.get(key) || 0) + amount);
      if (planned > bal.outstanding + 1e-9) {
        throw new Error(`Allocation exceeds the invoice's outstanding balance: ${bal.outstanding} outstanding, ${amount} requested`);
      }
      plannedByTarget.set(key, planned);
      validated.push({ ...a, amount, target_type: 'client_invoice' });
    }
  }

  const results = [];
  for (const a of validated) {
    const amount = a.amount;
    if (a.target_type === 'supplier_invoice') {
      const r = await q(
        `INSERT INTO payment_allocations (payment_id, target_type, supplier_invoice_id, amount, allocated_by)
         VALUES ($1, 'supplier_invoice', $2, $3, $4) RETURNING *`,
        [payment_id, a.supplier_invoice_id, amount, allocated_by]
      );
      results.push(r.rows[0]);
      const fresh = await supplierInvoiceOutstanding(q, a.supplier_invoice_id);
      if (fresh.outstanding <= 1e-9) {
        await q("UPDATE supplier_invoices SET status = 'paid' WHERE id = $1", [a.supplier_invoice_id]);
      }
    } else {
      const r = await q(
        `INSERT INTO payment_allocations (payment_id, target_type, invoice_id, amount, allocated_by)
         VALUES ($1, 'client_invoice', $2, $3, $4) RETURNING *`,
        [payment_id, a.invoice_id, amount, allocated_by]
      );
      results.push(r.rows[0]);
      // Status follows the money.
      const fresh = await invoiceOutstanding(q, a.invoice_id);
      const status = fresh.outstanding <= 1e-9 ? 'paid' : 'partially_paid';
      const invRow = (await q('SELECT * FROM invoices WHERE id = $1', [a.invoice_id])).rows[0];
      if (invRow.status !== status && !['void', 'credited', 'cancelled'].includes(invRow.status)) {
        await q('UPDATE invoices SET status = $1, updated_at = $2 WHERE id = $3', [status, new Date(), a.invoice_id]);
        await writeAuditEvent(q, {
          entity_type: 'invoice', entity_id: a.invoice_id, event_type: 'status_change',
          actor_id: allocated_by, actor_name,
          before_state: { status: invRow.status }, after_state: { status },
        });
      }
    }
  }

  await writeAuditEvent(q, {
    entity_type: 'payment_allocation', entity_id: payment_id, event_type: 'create',
    actor_id: allocated_by, actor_name, after_state: { allocations },
  });
  return { allocations: results };
}

// ---------------------------------------------------------------------------
// Retention ledger — released must reconcile with held
// ---------------------------------------------------------------------------

async function retentionTotals(q, { project_id = null, party_type = null } = {}) {
  let rows;
  if (project_id != null) {
    rows = (await q('SELECT * FROM retention_ledger WHERE project_id = $1', [project_id])).rows;
  } else {
    rows = (await q('SELECT * FROM retention_ledger')).rows;
  }
  if (party_type != null) rows = rows.filter((r) => r.party_type === party_type);
  let held = 0;
  let released = 0;
  for (const r of rows) {
    if (r.direction === 'held') held += toNum(r.amount);
    if (r.direction === 'released') released += toNum(r.amount);
  }
  return { held: round2(held), released: round2(released), balance: round2(held - released) };
}

// Record retention movement (certificates hold, final settlements release).
async function recordRetention(q, { project_id, party_type, direction, amount, source_type = null, source_id = null }) {
  const amt = round2(toNum(amount));
  // A release can never exceed what was actually held for that party.
  const totals = await retentionTotals(q, { project_id, party_type });
  if (direction === 'released' && totals.balance < amt) {
    throw new Error(`Retention release exceeds the held balance: ${totals.balance} held, ${amt} requested`);
  }
  const r = await q(
    'INSERT INTO retention_ledger (project_id, party_type, source_type, source_id, direction, amount) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [project_id, party_type, source_type, source_id, direction, amt]
  );
  return r.rows[0];
}

// ---------------------------------------------------------------------------
// AP review queue — three-way-match exceptions land here
// ---------------------------------------------------------------------------

async function syncApReviewQueue(q) {
  const invoices = (await q('SELECT * FROM supplier_invoices')).rows;
  let queued = 0;
  for (const inv of invoices) {
    const exceptions = typeof inv.exceptions === 'string' ? JSON.parse(inv.exceptions || '[]') : (inv.exceptions || []);
    for (const ex of exceptions) {
      const existing = (await q(
        'SELECT id FROM ap_review_queue WHERE supplier_invoice_id = $1 AND exception_type = $2',
        [inv.id, ex.type]
      )).rows[0];
      if (existing) continue;
      await q(
        "INSERT INTO ap_review_queue (supplier_invoice_id, exception_type, detail, status) VALUES ($1, $2, $3, 'open')",
        [inv.id, ex.type, ex.detail || null]
      );
      queued++;
    }
  }
  return queued;
}

// ---------------------------------------------------------------------------
// AR aging + cash-flow view + company dashboard
// ---------------------------------------------------------------------------

function allocatedSum(allocs) {
  return round2((allocs || []).reduce((s, a) => s + toNum(a.amount), 0));
}

function agingBucket(daysOverdue) {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return '1_30';
  if (daysOverdue <= 60) return '31_60';
  if (daysOverdue <= 90) return '61_90';
  return '90_plus';
}

async function arAging(q, { now = new Date() } = {}) {
  const buckets = { current: 0, '1_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 };
  const rows = (await q(`
    /* finance aging aggregate: ar */
    WITH allocation_totals AS (
      SELECT invoice_id, ROUND(SUM(amount), 2) AS allocated
        FROM payment_allocations
       WHERE target_type = 'client_invoice' AND voided_at IS NULL AND invoice_id IS NOT NULL
       GROUP BY invoice_id
    ), balances AS (
      SELECT ROUND(
               (CASE WHEN COALESCE(i.net_amount, 0) > 0 THEN i.net_amount ELSE i.amount END)
               - COALESCE(i.credited_amount, 0) - COALESCE(a.allocated, 0), 2
             ) AS outstanding,
             FLOOR(EXTRACT(EPOCH FROM ($1::timestamptz - COALESCE(
               i.due_date::timestamp AT TIME ZONE 'UTC', $1::timestamptz
             ))) / 86400)::integer AS overdue_days
        FROM invoices i
        LEFT JOIN allocation_totals a ON a.invoice_id = i.id
       WHERE (i.status IS NULL OR i.status NOT IN ('cancelled', 'void'))
         AND (CASE WHEN COALESCE(i.net_amount, 0) > 0 THEN i.net_amount ELSE i.amount END) > 0
    )
    SELECT CASE
             WHEN overdue_days <= 0 THEN 'current'
             WHEN overdue_days <= 30 THEN '1_30'
             WHEN overdue_days <= 60 THEN '31_60'
             WHEN overdue_days <= 90 THEN '61_90'
             ELSE '90_plus'
           END AS bucket,
           ROUND(SUM(outstanding), 2) AS amount
      FROM balances
     WHERE outstanding > 0
     GROUP BY 1`, [now])).rows;
  for (const row of rows) buckets[row.bucket] = round2(row.amount);
  return buckets;
}

async function apAging(q, { now = new Date() } = {}) {
  const buckets = { current: 0, '1_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 };
  const rows = (await q(`
    /* finance aging aggregate: ap */
    WITH allocation_totals AS (
      SELECT supplier_invoice_id, ROUND(SUM(amount), 2) AS allocated
        FROM payment_allocations
       WHERE target_type = 'supplier_invoice' AND voided_at IS NULL AND supplier_invoice_id IS NOT NULL
       GROUP BY supplier_invoice_id
    ), balances AS (
      SELECT ROUND(i.total_amount - COALESCE(i.credited_amount, 0) - COALESCE(a.allocated, 0), 2) AS outstanding,
             FLOOR(EXTRACT(EPOCH FROM ($1::timestamptz - COALESCE(
               i.invoice_date::timestamp AT TIME ZONE 'UTC', i.created_at, $1::timestamptz
             ))) / 86400)::integer AS overdue_days
        FROM supplier_invoices i
        LEFT JOIN allocation_totals a ON a.supplier_invoice_id = i.id
       WHERE i.status IS DISTINCT FROM 'paid'
    )
    SELECT CASE
             WHEN overdue_days <= 0 THEN 'current'
             WHEN overdue_days <= 30 THEN '1_30'
             WHEN overdue_days <= 60 THEN '31_60'
             WHEN overdue_days <= 90 THEN '61_90'
             ELSE '90_plus'
           END AS bucket,
           ROUND(SUM(outstanding), 2) AS amount
      FROM balances
     WHERE outstanding > 0
     GROUP BY 1`, [now])).rows;
  for (const row of rows) buckets[row.bucket] = round2(row.amount);
  return buckets;
}

async function companyFinanceDashboard(q, { now = new Date() } = {}) {
  const ar = await arAging(q, { now });
  const ap = await apAging(q, { now });

  // Retention receivable/payable from the ledgers.
  const retentionRows = (await q('SELECT * FROM retention_ledger')).rows;
  let retentionReceivable = 0;
  let retentionPayable = 0;
  for (const r of retentionRows) {
    const amt = toNum(r.amount);
    if (r.party_type === 'client') {
      retentionReceivable += r.direction === 'held' ? amt : -amt;
    } else {
      retentionPayable += r.direction === 'held' ? amt : -amt;
    }
  }

  // Cash collected (AR) and payments due (open AP).
  const arPayments = (await q("SELECT * FROM payments WHERE direction = 'ar' AND voided_at IS NULL")).rows;
  const cashCollected = round2(arPayments.reduce((s, p) => s + toNum(p.amount), 0));
  const openPos = (await q("SELECT * FROM purchase_orders WHERE status IN ('issued','approved','confirmed')")).rows;
  const paymentsDue = round2(openPos.reduce((s, p) => s + toNum(p.total_amount), 0));

  // Project forecast margins (Phase 13 canonical figures).
  const projects = (await q('SELECT id, name FROM projects')).rows;
  const projectMargins = [];
  for (const project of projects) {
    try {
      const c = await commercialEngine.projectCommercial(q, project.id);
      if (c) projectMargins.push({ project_id: project.id, name: project.name, forecast_margin_percent: c.forecast_margin_percent, forecast_profit: c.forecast_profit });
    } catch (e) { /* best-effort */ }
  }

  return {
    ar_aging: ar,
    ap_aging: ap,
    cash_collected: cashCollected,
    payments_due: paymentsDue,
    retention_receivable: round2(retentionReceivable),
    retention_payable: round2(retentionPayable),
    project_margins: projectMargins,
    total_ar_outstanding: round2(Object.values(ar).reduce((s, v) => s + toNum(v), 0)),
    total_ap_outstanding: round2(Object.values(ap).reduce((s, v) => s + toNum(v), 0)),
  };
}

// ---------------------------------------------------------------------------
// Receivable reminder engine (Phase 7 notifications)
// ---------------------------------------------------------------------------

async function reminderConfig(q, { project_id = null, client_id = null } = {}) {
  const keys = [];
  if (client_id != null) keys.push(`receivable_reminder_config:client:${client_id}`);
  if (project_id != null) keys.push(`receivable_reminder_config:project:${project_id}`);
  keys.push('receivable_reminder_config:company');
  for (const key of keys) {
    const row = (await q('SELECT rule_value FROM business_rules WHERE rule_key = $1 AND is_active = true', [key])).rows[0];
    if (!row) continue;
    const v = typeof row.rule_value === 'string' ? JSON.parse(row.rule_value) : row.rule_value;
    if (v && v.enabled === false) return { ...v, config_key: key };
    if (v) return { ...v, config_key: key };
  }
  return { enabled: true, config_key: 'receivable_reminder_config:company' };
}

// One reminder's row and event in one transaction. The real database gets a transaction; a caller-supplied query
// function (a test double or an enclosing transaction) is used as given.
async function runInTransaction(q, fn) {
  if (q === defaultQuery) return require('../config/database').transaction((client) => fn(client.query.bind(client)));
  return fn(q);
}

async function runReceivableReminderSweep(q = defaultQuery, opts = {}) {
  const now = opts.now || new Date();
  const nowMs = new Date(now).getTime();
  const invoices = (await q('SELECT * FROM invoices')).rows.filter(
    (i) => !['draft', 'cancelled', 'void', 'credited', 'paid'].includes(i.status === 'sent' ? 'issued' : i.status)
  );
  let sent = 0;
  const failures = [];
  const configs = new Map();
  for (const inv of invoices) {
    const configKey = `${inv.project_id ?? ''}:${inv.client_id ?? ''}`;
    if (!configs.has(configKey)) configs.set(configKey, await reminderConfig(q, { project_id: inv.project_id, client_id: inv.client_id }));
    const config = configs.get(configKey);
    if (config.enabled === false) continue;
    const net = inv.net_amount != null && toNum(inv.net_amount) > 0 ? toNum(inv.net_amount) : toNum(inv.amount);
    const allocs = (await q(
      "SELECT * FROM payment_allocations WHERE invoice_id = $1 AND target_type = 'client_invoice' AND voided_at IS NULL",
      [inv.id]
    )).rows;
    const outstanding = round2(net - allocatedSum(allocs));
    if (outstanding <= 0) continue;
    if (inv.due_date == null) continue;
    const daysUntilDue = Math.ceil((new Date(inv.due_date).getTime() - nowMs) / 86400000);

    let stage = null;
    if (daysOverdueOf(inv, now) >= 30) stage = 'overdue_30';
    else if (daysOverdueOf(inv, now) >= 14) stage = 'overdue_14';
    else if (daysOverdueOf(inv, now) >= 7) stage = 'overdue_7';
    else if (daysOverdueOf(inv, now) > 0) stage = null; // between thresholds — the overdue status covers it
    else if (daysUntilDue > 0 && daysUntilDue <= 7) stage = 'due_soon';
    else if (new Date(inv.due_date).toDateString() === new Date(now).toDateString()) stage = 'due_today';
    if (!stage) continue;

    const existing = (await q(
      'SELECT id FROM receivable_reminders WHERE invoice_id = $1 AND reminder_type = $2',
      [inv.id, stage]
    )).rows[0];
    if (existing) continue;

    const roles = (config.escalation_roles && config.escalation_roles[stage]) || DEFAULT_REMINDER_ROLES[stage];
    // Closeout A2.5: the reminder row and the event commit together, so a reminder is never recorded as sent for an
    // event that was lost (the old code logged a failed notification, swallowed it and wrote the row anyway).
    // invoice.overdue (stages overdue_7/14/30) and invoice.due (due_soon, due_today) go through the outbox; the
    // dispatcher's route notifies the stage's roles. One failing invoice does not stop the others; the run fails at
    // the end so the sweep leader records it.
    try {
      await runInTransaction(q, async (tq) => {
        const reminder = (await tq(
          'INSERT INTO receivable_reminders (invoice_id, reminder_type, escalated_to) VALUES ($1, $2, $3) RETURNING id',
          [inv.id, stage, roles.join(',')]
        )).rows[0];
        await require('../utils/activity').fireEvent({
          eventType: stage.startsWith('overdue') ? 'invoice.overdue' : 'invoice.due',
          entityType: 'invoice', entityId: inv.id, userId: null, userName: null, userRole: 'system',
          payload: {
            stage, reminder_id: reminder.id, roles, invoice_number: inv.invoice_number, outstanding, due_date: inv.due_date,
            days_overdue: daysOverdueOf(inv, now), days_until_due: daysUntilDue,
            title: `[${stage}] invoice ${inv.invoice_number} — ${outstanding} outstanding`,
            body: `Due ${inv.due_date}. Outstanding balance ${outstanding}.`,
          },
        }, { query: tq });
      });
      sent++;
    } catch (e) {
      console.error(`[RECEIVABLE] reminder ${stage} for invoice ${inv.id} failed:`, e.message);
      failures.push(e);
    }
  }
  if (failures.length) throw new Error(`${failures.length} receivable reminder(s) failed: ${failures[0].message}`);
  return { reminders_sent: sent };
}
function daysOverdueOf(invoice, now) {
  if (invoice.due_date == null) return 0;
  return Math.max(Math.floor((new Date(now).getTime() - new Date(invoice.due_date).getTime()) / 86400000), 0);
}

function initReceivableReminderScheduler(opts = {}) {
  const intervalHours = toNum(opts.intervalHours) || 12;
  // Phase 3.4: one leader across backend instances (sweepLeader).
  const { timer } = sweepLeader.leaderInterval('receivable_reminders', intervalHours * 3600 * 1000, () => runReceivableReminderSweep(defaultQuery));
  console.log(`[RECEIVABLE] reminder scheduler initialized — sweep every ${intervalHours}h (leader-locked)`);
  return timer;
}

module.exports = {
  createInvoiceRecord,
  createInvoiceFromCertificate,
  writeInvoiceLines,
  valuationLineItems,
  INVOICE_LIFECYCLE,
  ISSUED_FAMILY_STATUSES,
  REMINDER_STAGES,
  DEFAULT_REMINDER_ROLES,
  toNum,
  round2,
  writeAuditEvent,
  ensureTaxCodes,
  taxAmountFor,
  createClientValuation,
  transitionInvoice,
  computeLifecycleStatus,
  invoiceOutstanding,
  supplierInvoiceOutstanding,
  allocatePayment,
  recordRetention,
  retentionTotals,
  syncApReviewQueue,
  arAging,
  apAging,
  companyFinanceDashboard,
  reminderConfig,
  runReceivableReminderSweep,
  initReceivableReminderScheduler,
  defaultQuery,
};
