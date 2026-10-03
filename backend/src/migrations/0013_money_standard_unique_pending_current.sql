-- Phase 2.6b: one money standard, one pending approval per record, one current revision per document.
--
-- Money: every money amount is NUMERIC(15,2) (valuation unit costs stay NUMERIC(18,4), stock_movements.total_cost
-- NUMERIC(18,2)). Four columns were narrower: invoices.amount and payments.amount (14,2), supplier_materials.unit_price
-- and units.price_per_m2 (12,2). Widening cannot lose or change a value. Each table is rewritten once.
--
-- Unique indexes cannot be added NOT VALID, so they refuse to build while duplicates exist. The migration then stops
-- with the offending counts instead of picking a winner; nothing is changed, `scripts/preflight-upgrade.sql` reports the
-- same counts before the upgrade, and the offending rows are for a person to resolve.
--   uq_approval_requests_one_pending  (module_name, request_type, request_id) WHERE status = 'pending'
--   uq_document_versions_one_current  (document_id) WHERE is_current
-- Existing rows: untouched.
ALTER TABLE invoices            ALTER COLUMN amount      TYPE NUMERIC(15,2);
ALTER TABLE payments            ALTER COLUMN amount      TYPE NUMERIC(15,2);
ALTER TABLE supplier_materials  ALTER COLUMN unit_price  TYPE NUMERIC(15,2);
ALTER TABLE units               ALTER COLUMN price_per_m2 TYPE NUMERIC(15,2);

DO $$
DECLARE
  dup_approvals BIGINT;
  dup_current BIGINT;
BEGIN
  SELECT count(*) INTO dup_approvals FROM (
    SELECT 1 FROM approval_requests WHERE status = 'pending'
    GROUP BY module_name, request_type, request_id HAVING count(*) > 1) d;
  SELECT count(*) INTO dup_current FROM (
    SELECT 1 FROM document_versions WHERE is_current
    GROUP BY document_id HAVING count(*) > 1) d;
  IF dup_approvals > 0 OR dup_current > 0 THEN
    RAISE EXCEPTION '0013 stopped, nothing changed: % record(s) have more than one pending approval request, % document(s) have more than one current version. Resolve them (see scripts/preflight-upgrade.sql) and run the migration again.',
      dup_approvals, dup_current;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_approval_requests_one_pending
  ON approval_requests (module_name, request_type, request_id) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_versions_one_current
  ON document_versions (document_id) WHERE is_current;
