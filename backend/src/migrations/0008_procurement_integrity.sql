-- Phase 2.3: procurement integrity.
--
-- purchase_order_lines: delivered and accepted quantities are bounded by the database, whoever writes them.
--   * CHECK delivered >= 0, accepted >= 0, accepted <= delivered. Added NOT VALID (always safe), validated
--     when the table is clean; if existing rows break it the constraint stays NOT VALID (new writes are still
--     checked) and the migration prints a NOTICE.
--   * Trigger: a delivered_quantity that goes UP may not exceed ordered quantity + the PO's tolerance_pct
--     (SQLSTATE 23514, like a CHECK; a CHECK cannot read the PO row). Legacy over-delivered rows are not
--     blocked from unrelated updates because only increases are checked.
-- grn_lines.returned_quantity: how much of a GRN line has been sent back to the supplier (returns are validated
-- against quantity - returned_quantity).
ALTER TABLE grn_lines ADD COLUMN IF NOT EXISTS returned_quantity NUMERIC NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION purchase_order_lines_delivery_bound() RETURNS trigger AS $fn$
DECLARE
  tol NUMERIC;
BEGIN
  IF TG_OP = 'UPDATE' AND NOT (COALESCE(NEW.delivered_quantity, 0) > COALESCE(OLD.delivered_quantity, 0)) THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.delivered_quantity, 0) = 0 THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(tolerance_pct, 5) INTO tol FROM purchase_orders WHERE id = NEW.purchase_order_id;
  tol := COALESCE(tol, 5);
  IF NEW.delivered_quantity > ROUND(NEW.quantity * (1 + tol / 100), 3) THEN
    RAISE EXCEPTION 'delivered quantity % exceeds ordered % + tolerance % %% on purchase order line %',
      NEW.delivered_quantity, NEW.quantity, tol, NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_purchase_order_lines_delivery_bound ON purchase_order_lines;
CREATE TRIGGER trg_purchase_order_lines_delivery_bound
  BEFORE INSERT OR UPDATE OF delivered_quantity ON purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION purchase_order_lines_delivery_bound();

DO $$
DECLARE
  bad BIGINT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_lines_quantities_ok' AND conrelid = 'purchase_order_lines'::regclass) THEN
    ALTER TABLE purchase_order_lines
      ADD CONSTRAINT purchase_order_lines_quantities_ok
      CHECK (COALESCE(delivered_quantity, 0) >= 0 AND COALESCE(accepted_quantity, 0) >= 0
             AND COALESCE(accepted_quantity, 0) <= COALESCE(delivered_quantity, 0))
      NOT VALID;
  END IF;
  SELECT count(*) INTO bad FROM purchase_order_lines
   WHERE COALESCE(delivered_quantity, 0) < 0 OR COALESCE(accepted_quantity, 0) < 0
      OR COALESCE(accepted_quantity, 0) > COALESCE(delivered_quantity, 0);
  IF bad = 0 THEN
    ALTER TABLE purchase_order_lines VALIDATE CONSTRAINT purchase_order_lines_quantities_ok;
  ELSE
    RAISE NOTICE 'purchase_order_lines_quantities_ok left NOT VALID: % existing row(s) break it (new writes are still checked). Correct them, then run: ALTER TABLE purchase_order_lines VALIDATE CONSTRAINT purchase_order_lines_quantities_ok', bad;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grn_lines_returned_ok' AND conrelid = 'grn_lines'::regclass) THEN
    ALTER TABLE grn_lines
      ADD CONSTRAINT grn_lines_returned_ok CHECK (returned_quantity >= 0 AND returned_quantity <= quantity);
  END IF;
END $$;
