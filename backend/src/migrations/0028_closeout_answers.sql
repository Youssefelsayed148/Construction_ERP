-- Closeout answers (2026-10-04), one additive migration:
--   1. supplier_invoices.vat_recoverable (default true): input VAT posts to vat_input unless the invoice says the
--      VAT is non-recoverable, in which case it joins the cost (services/costAccrual.js).
--   2. purchase_requests.budget_override (JSONB): the owner/admin override of an over-budget requisition
--      { by, role, reason, at, check }. The route requires a written reason and audits it.
--   3. payroll_cost_allocations.project_id becomes nullable: a NULL project is the explicit "unallocated" bucket
--      (attendance days with no project), never dropped. One row per (payroll, project) stays unique, and one
--      unallocated row per payroll.
-- Existing rows: untouched (defaults fill the new column, constraints only relax). Nothing to preflight.
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS vat_recoverable BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS budget_override JSONB;
ALTER TABLE payroll_cost_allocations ALTER COLUMN project_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_cost_allocations_unallocated
  ON payroll_cost_allocations (payroll_id) WHERE project_id IS NULL;
