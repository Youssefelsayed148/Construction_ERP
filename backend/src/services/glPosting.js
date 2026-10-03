// Ledger postings for client invoices and client payments (Phase 2.7b).
//
// Every function runs on the caller's query function (the transaction client): the posting commits or rolls back
// with the document, and any failure (an unmapped ledger key, an unbalanced entry) propagates to the caller.
// The accounts are configuration keys (gl_account_map); this one map says which keys each event uses, so a different
// policy is a change in one place:
//
//   client_invoice  Dr receivable (amount owed)  |  Cr revenue (amount - tax)  |  Cr tax account (tax, only if tax > 0)
//   client_payment  Dr cash (amount)             |  Cr receivable (amount)
//   supplier_payment Dr payable (amount)         |  Cr cash (amount)          (Phase 3.1; direction 'ap' payments)
//   reversal        the original entry's lines with debit and credit swapped, posted once, kind '<kind>_void'
//
// Retention held, advance recovery and other deductions are already inside the invoice amount (it is the net the
// client owes), so no separate retention or advance accounts are posted yet; that needs chart accounts and is part of
// the Phase 8 finance engine. Supplier INVOICES are posted by services/costAccrual.js at the accrual point
// (GRN for stocked materials, approval for services) — not here, so the same cost is never counted twice.
const journal = require('../utils/journal');
const money = require('../utils/money');

const POSTING_RULES = {
  client_invoice: { receivable: 'receivable', revenue: 'revenue', tax: 'vat_output' },
  client_payment: { cash: 'cash', receivable: 'receivable' },
  supplier_payment: { payable: 'payable', cash: 'cash' },
};

// Statuses in which an invoice has been issued to the client (legacy 'sent' counts as issued).
const ISSUED_STATUSES = new Set(['issued', 'sent', 'partially_paid', 'paid', 'overdue', 'credited']);
const REVERSING_STATUSES = new Set(['void', 'cancelled']);

const todayIso = () => new Date().toISOString().split('T')[0];

async function postClientInvoice(q, invoice, { userId = null, date = null } = {}) {
  if ((await journal.findEntries(q, 'client_invoice', invoice.id)).length) return null;
  const rule = POSTING_RULES.client_invoice;
  const total = money.toMinor(invoice.amount);
  const tax = money.toMinor(invoice.tax_amount == null ? 0 : invoice.tax_amount);
  if (tax < 0n || tax > total) throw new journal.JournalError(`Invoice ${invoice.invoice_number}: tax ${money.format(tax)} is outside the invoice amount ${money.format(total)}`);
  const lines = [
    { account: rule.receivable, debit: money.format(total), description: `Receivable ${invoice.invoice_number}` },
    { account: rule.revenue, credit: money.format(total - tax), description: `Revenue ${invoice.invoice_number}` },
  ];
  if (tax > 0n) lines.push({ account: rule.tax, credit: money.format(tax), description: `Output tax ${invoice.invoice_number}` });
  return journal.postJournalEntry(q, {
    date: date || invoice.issue_date || todayIso(), description: `Invoice ${invoice.invoice_number} issued`,
    reference_type: 'client_invoice', reference_id: invoice.id, created_by: userId, lines,
  });
}

// Reverses a posted entry exactly once: same accounts, debit and credit swapped. Nothing to reverse (a document
// issued before postings existed) is not an error.
async function reverseEntry(q, kind, referenceId, { userId = null, description }) {
  const originals = await journal.findEntries(q, kind, referenceId);
  if (!originals.length) return null;
  if ((await journal.findEntries(q, `${kind}_void`, referenceId)).length) return null;
  const lines = (await q('SELECT account_id, debit, credit, description FROM journal_entry_lines WHERE journal_entry_id = $1 ORDER BY line_order', [originals[0].id])).rows;
  return journal.postJournalEntry(q, {
    date: todayIso(), description, reference_type: `${kind}_void`, reference_id: referenceId, created_by: userId,
    lines: lines.map((l) => ({ accountId: l.account_id, debit: l.credit, credit: l.debit, description: `Reversal: ${l.description || ''}`.trim() })),
  });
}

const reverseClientInvoice = (q, invoice, { userId = null } = {}) =>
  reverseEntry(q, 'client_invoice', invoice.id, { userId, description: `Invoice ${invoice.invoice_number} voided` });

// Called after every invoice insert or status change with the row before (null on insert) and after. Posts when the
// invoice ENTERS an issued state, reverses when it enters void or cancelled; a status that merely moves between issued
// states (partially_paid, paid, overdue) posts nothing, so old invoices are not back-filled by later payments.
async function syncInvoicePosting(q, before, after, { userId = null, date = null } = {}) {
  const wasIssued = before ? ISSUED_STATUSES.has(before.status) : false;
  if (!wasIssued && ISSUED_STATUSES.has(after.status)) return postClientInvoice(q, after, { userId, date });
  if ((!before || !REVERSING_STATUSES.has(before.status)) && REVERSING_STATUSES.has(after.status)) return reverseClientInvoice(q, after, { userId });
  return null;
}

async function postClientPayment(q, payment, { userId = null } = {}) {
  if (payment.direction && payment.direction !== 'ar') return null;
  if ((await journal.findEntries(q, 'client_payment', payment.id)).length) return null;
  const rule = POSTING_RULES.client_payment;
  const amount = money.format(money.toMinor(payment.amount));
  return journal.postJournalEntry(q, {
    date: payment.payment_date, description: `Payment received${payment.reference_number ? ` ${payment.reference_number}` : ''}`,
    reference_type: 'client_payment', reference_id: payment.id, created_by: userId,
    lines: [
      { account: rule.cash, debit: amount, description: 'Cash received' },
      { account: rule.receivable, credit: amount, description: 'Receivable settled' },
    ],
  });
}

const reverseClientPayment = (q, payment, { userId = null } = {}) =>
  reverseEntry(q, 'client_payment', payment.id, { userId, description: `Payment #${payment.id} voided` });

// Supplier payment (direction 'ap'): the money leaves and the payable shrinks. Posted by the payment route
// inside its transaction; the void route reverses it exactly once.
async function postSupplierPayment(q, payment, { userId = null } = {}) {
  if ((await journal.findEntries(q, 'supplier_payment', payment.id)).length) return null;
  const rule = POSTING_RULES.supplier_payment;
  const amount = money.format(money.toMinor(payment.amount));
  return journal.postJournalEntry(q, {
    date: payment.payment_date, description: `Supplier payment${payment.reference_number ? ` ${payment.reference_number}` : ''}`,
    reference_type: 'supplier_payment', reference_id: payment.id, created_by: userId,
    lines: [
      { account: rule.payable, debit: amount, description: 'Payable settled' },
      { account: rule.cash, credit: amount, description: 'Cash paid to supplier' },
    ],
  });
}

const reverseSupplierPayment = (q, payment, { userId = null } = {}) =>
  reverseEntry(q, 'supplier_payment', payment.id, { userId, description: `Supplier payment #${payment.id} voided` });

module.exports = {
  POSTING_RULES, ISSUED_STATUSES, postClientInvoice, reverseClientInvoice, syncInvoicePosting,
  postClientPayment, reverseClientPayment, postSupplierPayment, reverseSupplierPayment,
};
