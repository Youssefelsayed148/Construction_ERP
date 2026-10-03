-- Phase 2.5b: financial, procurement, contractual, inventory and handover rows are never removed by a cascade.
--
-- Every ON DELETE CASCADE and ON DELETE SET NULL foreign key whose CHILD table is in the list below becomes
-- ON DELETE RESTRICT (the constraint keeps its name, columns, parent, ON UPDATE and deferrability; only the delete
-- action changes). A parent that still has such children can no longer be deleted: the database answers 23503
-- instead of deleting the children or silently detaching them (a PO losing its supplier, a BOQ item its section).
-- Foreign keys to users are left alone here (SET NULL on created_by-style columns): the user policy is 2.5c.
-- Cascades on configuration, workflow-engine, quality/HSE, template, schedule and document tables are unchanged.
--
-- Existing rows: untouched. Re-adding a foreign key re-checks the child table once (it already satisfies the old
-- constraint, so it passes); on a very large table run this in a maintenance window, the child is locked while
-- it is checked. Preflight: nothing to clean (the check cannot fail on data that already satisfies the same key).
--
-- work_orders: DELETE is replaced by cancel (the route sets status 'cancelled'), so the cancellation is recorded.
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS cancelled_at   TIMESTAMPTZ;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS cancelled_by   INTEGER REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS cancel_reason  TEXT;

DO $$
DECLARE
  protected TEXT[] := ARRAY[
    'bid_comparisons', 'deliveries', 'delivery_lines', 'grn_lines', 'mir_lines', 'purchase_order_lines', 'purchase_orders',
    'purchase_request_lines', 'purchase_requests', 'rfq_lines', 'rfq_vendors', 'supplier_invoice_lines', 'supplier_invoices',
    'supplier_quotation_lines', 'supplier_quotations', 'supplier_return_lines',
    'stock_movements', 'stock_reservations', 'warehouse_stock', 'inventory_transfer_items',
    'advance_ledger', 'ap_review_queue', 'budget_changes', 'commitments', 'commercial_snapshots', 'journal_entry_lines',
    'payment_allocations', 'payment_certificates', 'payroll_details', 'project_budgets', 'receivable_reminders', 'retention_ledger',
    'variation_cost_buildup', 'variation_lines', 'variations',
    'boq_items', 'boq_sections', 'boq_location_allocations', 'client_contracts', 'contract_lines', 'engineer_instructions',
    'sub_contract_changes', 'sub_contract_lines', 'warranty_claims', 'quantity_measurements',
    'handover_package_items', 'handover_processes',
    'work_order_materials', 'work_order_labor', 'work_order_equipment', 'work_completions',
    'payments', 'invoices', 'work_orders'
  ];
  fk RECORD;
  def TEXT;
BEGIN
  FOR fk IN
    SELECT c.oid, c.conname, c.conrelid::regclass AS child
      FROM pg_constraint c
     WHERE c.contype = 'f' AND c.confdeltype IN ('c', 'n')
       AND c.conrelid::regclass::text = ANY (protected)
       AND c.confrelid::regclass::text <> 'users'
     ORDER BY c.conrelid::regclass::text, c.conname
  LOOP
    def := pg_get_constraintdef(fk.oid);
    IF def NOT LIKE '%ON DELETE CASCADE%' AND def NOT LIKE '%ON DELETE SET NULL%' THEN
      RAISE EXCEPTION 'unexpected definition for %: %', fk.conname, def;
    END IF;
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.child, fk.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', fk.child, fk.conname, replace(replace(def, 'ON DELETE CASCADE', 'ON DELETE RESTRICT'), 'ON DELETE SET NULL', 'ON DELETE RESTRICT'));
  END LOOP;
END $$;
