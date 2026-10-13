-- Certificate postings are idempotent and void reversals are one-to-one. These reference kinds did not
-- previously have ledger behavior; no existing journal rows are rewritten.
ALTER TABLE payment_certificates
  ADD COLUMN IF NOT EXISTS voided_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

ALTER TABLE invoice_lines
  ADD COLUMN IF NOT EXISTS description_en VARCHAR(500),
  ADD COLUMN IF NOT EXISTS description_ar VARCHAR(500);

CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_one_posting_per_subcontractor_certificate
  ON journal_entries (reference_type, reference_id)
  WHERE reference_type IN ('subcontractor_certificate', 'subcontractor_certificate_void');
