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
//   client_credit_note Dr revenue (amount - tax) | Dr tax account (tax, only if tax > 0) | Cr receivable (amount)   (Phase 5.5)
//   reversal        the original entry's lines with debit and credit swapped, posted once, kind '<kind>_void'
//
// Certificate adjustments use separate configurable GL mappings. The mappings are provisional until finance-owner
// confirmation, and every posting stays balanced even while that review is pending.
const journal = require('../utils/journal');
const money = require('../utils/money');

const POSTING_RULES = {
  client_invoice: { receivable: 'receivable', revenue: 'revenue', tax: 'vat_output',
    retention: 'client_retention_receivable', advance: 'client_advance_liability', deduction: 'client_other_deductions' },
  client_payment: { cash: 'cash', receivable: 'receivable' },
  supplier_payment: { payable: 'payable', cash: 'cash' },
  // Phase 5.5: a client credit note is the mirror image of the invoice: Dr revenue (net) | Dr output tax | Cr receivable.
  client_credit_note: { receivable: 'receivable', revenue: 'revenue', tax: 'vat_output' },
};

// Statuses in which an invoice has been issued to the client (legacy 'sent' counts as issued).
const ISSUED_STATUSES = new Set(['issued', 'sent', 'partially_paid', 'paid', 'overdue', 'credited']);
const REVERSING_STATUSES = new Set(['void', 'cancelled']);

const todayIso = () => new Date().toISOString().split('T')[0];
const isCertificateInvoice = (invoice) => invoice.payment_certificate_id != null || money.toMinor(invoice.certified_gross || 0) > 0n;

async function postClientInvoice(q, invoice, { userId = null, date = null } = {}) {
  if ((await journal.findEntries(q, 'client_invoice', invoice.id)).length) return null;
  const rule = POSTING_RULES.client_invoice;
  const total = money.toMinor(invoice.amount);
  const tax = money.toMinor(invoice.tax_amount == null ? 0 : invoice.tax_amount);
  if (tax < 0n || tax > total) throw new journal.JournalError(`Invoice ${invoice.invoice_number}: tax ${money.format(tax)} is outside the invoice amount ${money.format(total)}`);
  const hasCertificateMath = isCertificateInvoice(invoice);
  const gross = hasCertificateMath ? money.toMinor(invoice.certified_gross) : total - tax;
  const retention = hasCertificateMath ? money.toMinor(invoice.retention_amount || 0) : 0n;
  const advance = hasCertificateMath ? money.toMinor(invoice.advance_recovery || 0) : 0n;
  const deductions = hasCertificateMath ? money.toMinor(invoice.other_deductions || 0) : 0n;
  if (hasCertificateMath && total + retention + advance + deductions !== gross + tax) {
    throw new journal.JournalError(`Invoice ${invoice.invoice_number}: certificate lines do not equal the invoice total`);
  }
  const lines = [
    { account: rule.receivable, debit: money.format(total), description: `Receivable ${invoice.invoice_number}` },
  ];
  if (retention > 0n) lines.push({ account: rule.retention, debit: money.format(retention), description: `Retention receivable ${invoice.invoice_number}` });
  if (advance > 0n) lines.push({ account: rule.advance, debit: money.format(advance), description: `Client advance recovered ${invoice.invoice_number}` });
  if (deductions > 0n) lines.push({ account: rule.deduction, debit: money.format(deductions), description: `Certificate deductions ${invoice.invoice_number}` });
  lines.push({ account: rule.revenue, credit: money.format(gross), description: `Revenue ${invoice.invoice_number}` });
  if (tax > 0n) lines.push({ account: rule.tax, credit: money.format(tax), description: `Output tax ${invoice.invoice_number}` });
  const entry = await journal.postJournalEntry(q, {
    date: date || invoice.issue_date || todayIso(), description: `Invoice ${invoice.invoice_number} issued`,
    reference_type: 'client_invoice', reference_id: invoice.id, created_by: userId, lines,
  });
  if (entry && hasCertificateMath) await recordCertificateMemos(q, invoice, 'client_invoice', 'held', 'recovered');
  return entry;
}

async function postSubcontractorCertificate(q, certificate, { userId = null } = {}) {
  if ((await journal.findEntries(q, 'subcontractor_certificate', certificate.id)).length) return null;
  const gross = money.toMinor(certificate.gross_certified || 0);
  const retention = money.toMinor(certificate.retention_held || 0);
  const advance = money.toMinor(certificate.advance_recovery || 0);
  const deductions = money.toMinor(certificate.other_deductions || 0);
  const tax = money.toMinor(certificate.tax_amount || 0);
  const payable = money.toMinor(certificate.net_certificate || 0);
  if (gross + tax !== payable + retention + advance + deductions) {
    throw new journal.JournalError(`Certificate ${certificate.certificate_number}: certificate lines do not balance`);
  }
  const lines = [{ account: 'subcontractor_certificate_cost', debit: money.format(gross), description: `Certified subcontract work ${certificate.certificate_number}` }];
  if (tax > 0n) lines.push({ account: 'vat_input', debit: money.format(tax), description: `Input tax ${certificate.certificate_number}` });
  lines.push({ account: 'payable', credit: money.format(payable), description: `Subcontractor payable ${certificate.certificate_number}` });
  if (retention > 0n) lines.push({ account: 'subcontractor_retention_payable', credit: money.format(retention), description: `Retention payable ${certificate.certificate_number}` });
  if (advance > 0n) lines.push({ account: 'subcontractor_advance_receivable', credit: money.format(advance), description: `Advance recovered ${certificate.certificate_number}` });
  if (deductions > 0n) lines.push({ account: 'subcontractor_other_deductions', credit: money.format(deductions), description: `Other deductions ${certificate.certificate_number}` });
  const entry = await journal.postJournalEntry(q, {
    date: todayIso(), description: `Subcontractor certificate ${certificate.certificate_number}`,
    reference_type: 'subcontractor_certificate', reference_id: certificate.id, created_by: userId, lines,
  });
  if (entry) await recordCertificateMemos(q, certificate, 'payment_certificate', 'held', 'recovered');
  return entry;
}

async function reverseSubcontractorCertificate(q, certificate, { userId = null } = {}) {
  const entry = await reverseEntry(q, 'subcontractor_certificate', certificate.id, { userId, description: `Certificate ${certificate.certificate_number} voided` });
  if (entry) await recordCertificateMemos(q, certificate, 'payment_certificate_void', 'released', 'restored');
  return entry;
}

async function postRetentionRelease(q, release, { userId = null } = {}) {
  if ((await journal.findEntries(q, 'retention_release', release.id)).length) return null;
  const client = release.party_type === 'client';
  const amount = money.format(money.toMinor(release.amount));
  return journal.postJournalEntry(q, {
    date: todayIso(), description: `Retention release ${release.id}`,
    reference_type: 'retention_release', reference_id: release.id, created_by: userId,
    lines: client ? [
      { account: 'cash', debit: amount, description: `Client retention received for project ${release.project_id}` },
      { account: 'client_retention_receivable', credit: amount, description: `Client retention released ${release.id}` },
    ] : [
      { account: 'subcontractor_retention_payable', debit: amount, description: `Subcontractor retention paid ${release.id}` },
      { account: 'cash', credit: amount, description: `Subcontractor retention paid for project ${release.project_id}` },
    ],
  });
}

async function reverseRetentionRelease(q, release, { userId = null } = {}) {
  return reverseEntry(q, 'retention_release', release.id, { userId, description: `Retention release ${release.id} voided` });
}

async function recordCertificateMemos(q, source, sourceType, retentionDirection, advanceDirection) {
  const retention = money.toMinor(source.retention_amount ?? source.retention_held ?? 0);
  const advance = money.toMinor(source.advance_recovery || 0);
  const partyType = source.party_type || 'client';
  if (retention > 0n) await q(
    'INSERT INTO retention_ledger (project_id, party_type, source_type, source_id, direction, amount) VALUES ($1,$2,$3,$4,$5,$6)',
    [source.project_id, partyType, sourceType, source.id, retentionDirection, money.format(retention)]
  );
  if (advance > 0n) await q(
    'INSERT INTO advance_ledger (project_id, party_type, source_type, source_id, direction, amount) VALUES ($1,$2,$3,$4,$5,$6)',
    [source.project_id, partyType, sourceType, source.id, advanceDirection, money.format(advance)]
  );
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

// Client credit note issued: posted once per credit note. A supplier credit note is posted by services/costAccrual.js
// because it also reverses cost.
async function postClientCreditNote(q, creditNote, invoice, { userId = null } = {}) {
  if ((await journal.findEntries(q, 'client_credit_note', creditNote.id)).length) return null;
  const rule = POSTING_RULES.client_credit_note;
  const total = money.toMinor(creditNote.amount);
  const tax = money.toMinor(creditNote.tax_amount == null ? 0 : creditNote.tax_amount);
  if (tax < 0n || tax > total) throw new journal.JournalError(`Credit note ${creditNote.credit_note_number}: tax ${money.format(tax)} is outside the amount ${money.format(total)}`);
  const lines = [];
  if (total - tax > 0n) lines.push({ account: rule.revenue, debit: money.format(total - tax), description: `Revenue credited ${creditNote.credit_note_number}` });
  if (tax > 0n) lines.push({ account: rule.tax, debit: money.format(tax), description: `Output tax credited ${creditNote.credit_note_number}` });
  lines.push({ account: rule.receivable, credit: money.format(total), description: `Receivable credited ${creditNote.credit_note_number} (invoice ${invoice.invoice_number})` });
  return journal.postJournalEntry(q, {
    date: todayIso(), description: `Credit note ${creditNote.credit_note_number} against invoice ${invoice.invoice_number}`,
    reference_type: 'client_credit_note', reference_id: creditNote.id, created_by: userId, lines,
  });
}

const reverseClientCreditNote = (q, creditNote, { userId = null } = {}) =>
  reverseEntry(q, 'client_credit_note', creditNote.id, { userId, description: `Credit note ${creditNote.credit_note_number} voided` });

async function reverseClientInvoice(q, invoice, { userId = null } = {}) {
  const entry = await reverseEntry(q, 'client_invoice', invoice.id, { userId, description: `Invoice ${invoice.invoice_number} voided` });
  if (entry && isCertificateInvoice(invoice)) await recordCertificateMemos(q, invoice, 'client_invoice_void', 'released', 'restored');
  return entry;
}

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
  postClientCreditNote, reverseClientCreditNote, postSubcontractorCertificate, reverseSubcontractorCertificate,
  postRetentionRelease, reverseRetentionRelease,
};
