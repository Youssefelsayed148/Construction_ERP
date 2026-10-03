-- Phase 3.1: cost accrual is idempotent, and one event produces one cost row and one ledger entry.
--
-- The accrual rule (confirmed by the owner) lives in services/costAccrual.js COST_ACCRUAL_RULES:
--   stocked_material -> accrues at GRN acceptance   (Dr material_cost | Cr payable, kind grn_cost)
--   service          -> accrues at supplier invoice approval (Dr service_cost [+ Dr vat_input on tax]
--                                                       | Cr payable, kind supplier_invoice_cost)
--   supplier payment -> Dr payable | Cr cash (kind supplier_payment); the void route reverses it once.
--
-- This migration is the backstop behind the service checks:
--   1. UNIQUE (source_type, source_id) on project_costs: replaying the same GRN or invoice event twice
--      produces exactly one cost row, and two parallel posts cannot both win. Cost rows written by the
--      pre-3.1 listeners (work_completion, labor_payment, sub_payment) and the new grn / supplier_invoice
--      rows all live under this rule.
--   2. The 0016 one-posting-per-document index is widened to the new posting kinds, so the ledger side of
--      a replay is also refused at the database.
--   3. Accounts the new postings need: 5150 Service Cost (expense) and 1400 Input VAT Receivable (asset),
--      ADDED only when missing (same pattern as 0016's output-VAT account) and mapped in gl_account_map.
--      2100/vat_output is NOT touched here (owner decision pending).
--   4. supplier_invoices.approved_at (approved_by already exists) — the service accrual point.
--   5. payments.supplier_id, and client_id becomes nullable so an accounts-payable payment can be recorded
--      with a supplier instead of a client (direction stays 'ar' by default; nothing existing changes).
--
-- Existing rows: only indexes/columns are touched; no row is modified or deleted. If a restored copy holds
-- duplicate cost rows for one (source_type, source_id), the migration STOPS with the counts and changes
-- nothing — resolve them by hand, then run the migration again. Report query (run on a restored copy):
--
--   SELECT source_type, source_id, count(*) AS rows, array_agg(id ORDER BY id) AS cost_row_ids,
--          array_agg(amount ORDER BY id) AS amounts, array_agg(project_id ORDER BY id) AS project_ids
--     FROM project_costs
--    WHERE source_id IS NOT NULL
--    GROUP BY source_type, source_id
--   HAVING count(*) > 1
--    ORDER BY source_type, source_id;
DO $$
DECLARE
  dupes BIGINT;
BEGIN
  SELECT count(*) INTO dupes FROM (
    SELECT 1 FROM project_costs WHERE source_id IS NOT NULL
    GROUP BY source_type, source_id HAVING count(*) > 1) d;
  IF dupes > 0 THEN
    RAISE EXCEPTION '0018 stopped, nothing changed: % cost source(s) have more than one project_costs row. See the report query in the migration header; resolve the duplicates by hand and run the migration again.', dupes;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_costs_one_per_source
  ON project_costs (source_type, source_id);

-- One posting per document and kind, widened from 0016 to the cost-accrual kinds. Built BEFORE the old
-- narrower index is dropped, so the guarantee never has a gap.
CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entries_one_posting_per_document_wide
  ON journal_entries (reference_type, reference_id)
  WHERE reference_type IN ('client_invoice', 'client_invoice_void', 'client_payment', 'client_payment_void',
                           'grn_cost', 'supplier_invoice_cost', 'supplier_invoice_cost_void',
                           'supplier_payment', 'supplier_payment_void');
DROP INDEX IF EXISTS uq_journal_entries_one_posting_per_document;

INSERT INTO accounts (code, name, name_en, name_ar, type)
SELECT '5150', 'Service Cost', 'Service Cost', 'تكلفة الخدمات', 'expense'
 WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE code = '5150');

INSERT INTO accounts (code, name, name_en, name_ar, type)
SELECT '1400', 'Input VAT Receivable', 'Input VAT Receivable', 'ضريبة القيمة المضافة المدخلة', 'asset'
 WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE code = '1400');

INSERT INTO gl_account_map (key, account_id)
SELECT 'service_cost', id FROM accounts WHERE code = '5150'
ON CONFLICT (key) DO NOTHING;

INSERT INTO gl_account_map (key, account_id)
SELECT 'vat_input', id FROM accounts WHERE code = '1400'
ON CONFLICT (key) DO NOTHING;

ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id) ON DELETE RESTRICT;

-- An accounts-payable payment names a supplier, not a client. Existing rows all carry a client, so this
-- only opens the door for new 'ap' rows.
ALTER TABLE payments ALTER COLUMN client_id DROP NOT NULL;
