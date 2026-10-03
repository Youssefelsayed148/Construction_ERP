-- Phase 2.5a: soft delete and void-with-reason; nothing financial or master is hard-deleted any more.
--
-- Existing rows: untouched. Every column added here is nullable and defaults to NULL, so every current
-- row stays live. Preflight: nothing to check (no data is read or rewritten).
--
-- item_master, suppliers   deleted_at / deleted_by / delete_reason. A deleted master stays referenced by
--                          its purchase orders, GRNs and invoices (history keeps resolving it); only
--                          pickers and lists hide it. is_active is set false at the same time.
-- payments                 voided_at / voided_by / void_reason. A voided payment stays in the table and
--                          stops counting everywhere (sums filter voided_at IS NULL).
-- payment_allocations      voided_at, set together with the payment's, so allocated totals drop.
-- invoices                 voided_by / void_reason next to the existing voided_at (status 'void').
ALTER TABLE item_master ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMPTZ;
ALTER TABLE item_master ADD COLUMN IF NOT EXISTS deleted_by    INTEGER REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE item_master ADD COLUMN IF NOT EXISTS delete_reason TEXT;
ALTER TABLE suppliers   ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMPTZ;
ALTER TABLE suppliers   ADD COLUMN IF NOT EXISTS deleted_by    INTEGER REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE suppliers   ADD COLUMN IF NOT EXISTS delete_reason TEXT;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS voided_at   TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS voided_by   INTEGER REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE payment_allocations ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS voided_by   INTEGER REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS void_reason TEXT;

-- A void always says why. The columns are new, so no existing row can break these.
ALTER TABLE payments ADD CONSTRAINT payments_void_has_reason
  CHECK (voided_at IS NULL OR (voided_by IS NOT NULL AND length(btrim(void_reason)) > 0));
ALTER TABLE invoices ADD CONSTRAINT invoices_void_reason_not_blank
  CHECK (void_reason IS NULL OR length(btrim(void_reason)) > 0);

CREATE INDEX IF NOT EXISTS idx_payments_live ON payments (invoice_id) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payment_allocations_live ON payment_allocations (invoice_id) WHERE voided_at IS NULL;
