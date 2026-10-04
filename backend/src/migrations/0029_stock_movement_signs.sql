-- Closeout B4 (plan Phase 4, constraint tests): the stock ledger itself refuses a movement
-- that would corrupt the sign convention.
--
-- The ledger's contract (inventoryEngine.createMovement): quantity is POSITIVE for every
-- movement type except 'adjustment' and 'reversal', which carry a signed quantity; the
-- direction of every other movement is encoded by movement_type. The engine enforces this on
-- its own path, but nothing stopped a raw INSERT / third-party writer from storing, say, an
-- issue of -3: every consumer treats a negative issue row as a POSITIVE receipt of 3, so the
-- projection and the ledger disagree and valuation drifts. This migration makes the database
-- refuse it.
--
-- Existing rows: untouched when they already satisfy the rule. The migration STOPS with counts
-- and changes nothing otherwise. Report query for a restored copy:
--
--   SELECT movement_type, count(*) AS offending, min(quantity) AS most_negative
--     FROM stock_movements
--    WHERE quantity <= 0 AND movement_type NOT IN ('adjustment', 'reversal')
--    GROUP BY movement_type;
DO $$
DECLARE
  bad BIGINT;
BEGIN
  SELECT count(*) INTO bad FROM stock_movements
   WHERE quantity <= 0 AND movement_type NOT IN ('adjustment', 'reversal');
  IF bad > 0 THEN
    RAISE EXCEPTION '0029 stopped, nothing changed: % stock movement row(s) have quantity <= 0 in a type that must be positive. See the report query in the migration header; correct or reverse them by hand and run the migration again.', bad;
  END IF;
END $$;

ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_sign_check;
ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_sign_check
  CHECK (movement_type IN ('adjustment', 'reversal') OR quantity > 0);
