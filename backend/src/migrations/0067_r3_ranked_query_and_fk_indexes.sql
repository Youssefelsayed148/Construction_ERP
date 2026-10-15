-- R3.5: measured list/aggregate plans plus high-volume foreign-key columns.
-- This is a selected first slice of the wider FK backlog, not a blanket index of every FK.
CREATE INDEX IF NOT EXISTS idx_invoices_created_at_desc_r3
  ON invoices (created_at DESC) INCLUDE (id, invoice_number, amount);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_project_created_at_r3
  ON purchase_orders (project_id, created_at DESC, id DESC) INCLUDE (status, total_amount);

CREATE INDEX IF NOT EXISTS idx_project_costs_project_transaction_r3
  ON project_costs (project_id, transaction_date DESC, id DESC) INCLUDE (amount, cost_code_id);

CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account_id_r3
  ON journal_entry_lines (account_id);

CREATE INDEX IF NOT EXISTS idx_payments_supplier_id_r3
  ON payments (supplier_id);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_supplier_invoice_r3
  ON payment_allocations (supplier_invoice_id) INCLUDE (amount);
