-- Phase 3: purchase_orders gains the terms columns its creation service already writes.
--
-- Bug found while writing the 3.1 failing tests: services/procurementService.createPurchaseOrder INSERTs
-- payment_terms and delivery_terms, but the migrated table never had them, so every PO created through
-- the service failed with 23503/42703 ('column "payment_terms" of relation "purchase_orders" does not
-- exist'). The mock-db suite cannot see this (it does not enforce columns) and the real-PG suite built
-- its POs by hand. The PO spec carries payment/delivery terms (supplier_quotations already has them),
-- so the columns are the fix, not the service.
--
-- Existing rows: both columns are NULL-valued for them; no row changes. Preflight on a restored copy is
-- a plain column check (nothing to dedupe):
--
--   SELECT count(*) AS pos_with_terms FROM purchase_orders WHERE payment_terms IS NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'purchase_orders' AND column_name = 'payment_terms') THEN
    ALTER TABLE purchase_orders ADD COLUMN payment_terms VARCHAR(200);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'purchase_orders' AND column_name = 'delivery_terms') THEN
    ALTER TABLE purchase_orders ADD COLUMN delivery_terms VARCHAR(200);
  END IF;
END $$;
