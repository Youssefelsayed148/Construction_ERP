-- Phase 2.7b: a document is posted to the ledger once per kind.
--
-- Client invoices, client payments and their reversals are posted by services/glPosting.js with reference_type
-- client_invoice, client_invoice_void, client_payment, client_payment_void. This partial unique index is the backstop
-- behind the application check, so two concurrent requests cannot post the same document twice. It covers only those
-- four kinds, which did not exist before this migration; expense and payroll entries are not covered.
-- Existing rows: untouched (no existing entry has these kinds, so the index always builds).
CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entries_one_posting_per_document
  ON journal_entries (reference_type, reference_id)
  WHERE reference_type IN ('client_invoice', 'client_invoice_void', 'client_payment', 'client_payment_void');

-- Output tax account. Issuing a taxed invoice needs somewhere to credit the tax, and the seeded chart has no tax
-- account, so one is ADDED (code 2100, liability) when no account with that code exists, and mapped as vat_output.
-- An owner can map vat_output to another account at any time; nothing else in the chart is touched.
INSERT INTO accounts (code, name, name_en, name_ar, type)
SELECT '2100', 'Output VAT Payable', 'Output VAT Payable', 'ضريبة القيمة المضافة المستحقة', 'liability'
 WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE code = '2100');

INSERT INTO gl_account_map (key, account_id)
SELECT 'vat_output', id FROM accounts WHERE code = '2100'
ON CONFLICT (key) DO NOTHING;
