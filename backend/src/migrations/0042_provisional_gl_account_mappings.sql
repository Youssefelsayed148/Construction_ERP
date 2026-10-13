-- Finance enablement: expose the existing chart mapping as configurable, audited, and explicitly provisional.
-- This is additive. Existing account mappings and journal entries are preserved; no posting is backfilled.

ALTER TABLE gl_account_map
  ADD COLUMN IF NOT EXISTS is_provisional BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS confirmed_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

UPDATE gl_account_map
   SET is_provisional = TRUE, confirmed_by = NULL, confirmed_at = NULL
 WHERE confirmed_at IS NULL OR confirmed_by IS NULL;

-- These keys allow certificate retention, advance recovery, and deductions to be separated in the ledger.
-- The initial codes are placeholders pending finance-owner confirmation. ON CONFLICT never overwrites an
-- existing mapping selected by an administrator.
INSERT INTO gl_account_map (key, account_id, is_provisional)
SELECT m.key, a.id, TRUE
  FROM (VALUES
    ('client_retention_receivable', '1100'),
    ('subcontractor_retention_payable', '2000'),
    ('client_advance_liability', '2000'),
    ('subcontractor_advance_receivable', '1100'),
    ('client_other_deductions', '5200'),
    ('subcontractor_other_deductions', '4000'),
    ('subcontractor_certificate_cost', '5150')
  ) AS m(key, code)
  JOIN accounts a ON a.code = m.code
ON CONFLICT (key) DO NOTHING;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_certificate_id INTEGER REFERENCES payment_certificates(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_payment_certificate
  ON invoices (payment_certificate_id) WHERE payment_certificate_id IS NOT NULL;
