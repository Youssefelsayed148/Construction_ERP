-- Phase 2.2: inventory integrity.
--
-- 1. warehouse_stock can no longer hold negative quantities (CHECK). Added NOT VALID so existing rows cannot
--    block the deploy, then validated when the table is clean; if it is not clean the constraint stays
--    NOT VALID (still enforced for every new write) and the migration says so.
-- 2. Valuation: stock_movements.unit_cost / total_cost and warehouse_stock.avg_unit_cost (weighted average).
--    A BEFORE INSERT trigger derives the cost in NUMERIC arithmetic: outbound movements are valued at the
--    current average whatever the caller sent; inbound movements keep the receipt cost and update the average.
--    Movements recorded before this migration stay unvalued (NULL); the ledger is append-only.
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS unit_cost  NUMERIC(18,4);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS total_cost NUMERIC(18,2);
ALTER TABLE warehouse_stock ADD COLUMN IF NOT EXISTS avg_unit_cost NUMERIC(18,4) NOT NULL DEFAULT 0;
-- Work-order issue cost is copied from the ledger, which carries 4 decimals.
ALTER TABLE work_order_materials ALTER COLUMN unit_cost TYPE NUMERIC(18,4);

CREATE OR REPLACE FUNCTION stock_movements_value() RETURNS trigger AS $fn$
DECLARE
  delta    NUMERIC;
  cur_qty  NUMERIC;
  cur_avg  NUMERIC;
  new_avg  NUMERIC;
BEGIN
  -- Signed physical effect (mirrors PHYSICAL_SIGNS in services/inventoryEngine.js).
  delta := CASE NEW.movement_type
    WHEN 'opening' THEN NEW.quantity
    WHEN 'grn' THEN NEW.quantity
    WHEN 'quarantine' THEN NEW.quantity
    WHEN 'return' THEN NEW.quantity
    WHEN 'transfer_in' THEN NEW.quantity
    WHEN 'adjustment' THEN NEW.quantity
    WHEN 'reversal' THEN NEW.quantity
    WHEN 'issue' THEN -NEW.quantity
    WHEN 'transfer_out' THEN -NEW.quantity
    WHEN 'waste' THEN -NEW.quantity
    WHEN 'damage' THEN -NEW.quantity
    WHEN 'supplier_return' THEN -NEW.quantity
    WHEN 'quarantine_reject' THEN -NEW.quantity
    ELSE 0
  END;
  IF delta = 0 THEN
    RETURN NEW;   -- quarantine_release / quarantine_restore move stock between buckets, not in or out
  END IF;

  SELECT quantity, avg_unit_cost INTO cur_qty, cur_avg
    FROM warehouse_stock WHERE warehouse_id = NEW.warehouse_id AND item_id = NEW.material_id;
  cur_qty := GREATEST(COALESCE(cur_qty, 0), 0);
  cur_avg := COALESCE(cur_avg, 0);

  IF delta < 0 THEN
    NEW.unit_cost := cur_avg;                        -- never trust a caller-supplied cost on the way out
  ELSE
    NEW.unit_cost := COALESCE(NEW.unit_cost, cur_avg);
    IF cur_qty + delta > 0 THEN
      new_avg := ROUND((cur_qty * cur_avg + delta * NEW.unit_cost) / (cur_qty + delta), 4);
    ELSE
      new_avg := NEW.unit_cost;
    END IF;
    UPDATE warehouse_stock SET avg_unit_cost = new_avg
     WHERE warehouse_id = NEW.warehouse_id AND item_id = NEW.material_id;
    IF NOT FOUND THEN
      INSERT INTO warehouse_stock (warehouse_id, item_id, quantity, reserved_quantity, quarantined_quantity, available_quantity, reorder_level, avg_unit_cost)
      VALUES (NEW.warehouse_id, NEW.material_id, 0, 0, 0, 0, 0, new_avg);
    END IF;
  END IF;
  NEW.total_cost := ROUND(ABS(NEW.quantity) * NEW.unit_cost, 2);
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stock_movements_value ON stock_movements;
CREATE TRIGGER trg_stock_movements_value
  BEFORE INSERT ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION stock_movements_value();

DO $$
DECLARE
  bad BIGINT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_stock_nonnegative' AND conrelid = 'warehouse_stock'::regclass) THEN
    ALTER TABLE warehouse_stock
      ADD CONSTRAINT warehouse_stock_nonnegative
      CHECK (COALESCE(quantity, 0) >= 0 AND COALESCE(reserved_quantity, 0) >= 0 AND COALESCE(quarantined_quantity, 0) >= 0)
      NOT VALID;
  END IF;
  SELECT count(*) INTO bad FROM warehouse_stock
   WHERE COALESCE(quantity, 0) < 0 OR COALESCE(reserved_quantity, 0) < 0 OR COALESCE(quarantined_quantity, 0) < 0;
  IF bad = 0 THEN
    ALTER TABLE warehouse_stock VALIDATE CONSTRAINT warehouse_stock_nonnegative;
  ELSE
    RAISE NOTICE 'warehouse_stock_nonnegative left NOT VALID: % existing row(s) are negative (new writes are still checked). Rebuild the projection or correct the ledger, then run: ALTER TABLE warehouse_stock VALIDATE CONSTRAINT warehouse_stock_nonnegative', bad;
  END IF;
END $$;
