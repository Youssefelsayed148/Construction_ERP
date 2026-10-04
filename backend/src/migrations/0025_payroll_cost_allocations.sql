-- Closeout A2.3 (plan 3.1): payroll is allocated to projects by attendance days.
--
-- payroll_cost_allocations records, per payroll period and project, the share of the period's net salaries
-- that the employees' attendance (attendance.project_id, status present or late, within the payroll month)
-- assigns to that project. services/costAccrual.js allocatePayrollCost writes it, once, when the period is
-- first posted to finance, together with the project_costs rows (source_type 'payroll_allocation',
-- source_id this table's id). UNIQUE (payroll_id, project_id) is the backstop against a second run.
--
-- The ledger entry for the payroll (2.7a) is NOT changed: the whole net salary is already in
-- salary_expense. An employee's share with no project attendance stays overhead.
--
-- Existing rows: untouched (a new, empty table). Payrolls posted before this migration are not
-- allocated retroactively. On a restored copy, how many posted periods that is:
--
--   SELECT count(*) AS posted_periods_without_allocation
--     FROM payroll_periods p
--    WHERE p.posted_to_finance = true
--      AND NOT EXISTS (SELECT 1 FROM payroll_cost_allocations a WHERE a.payroll_id = p.id);
CREATE TABLE IF NOT EXISTS payroll_cost_allocations (
  id SERIAL PRIMARY KEY,
  payroll_id INTEGER NOT NULL REFERENCES payroll_periods(id) ON DELETE RESTRICT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  basis JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payroll_id, project_id)
);
