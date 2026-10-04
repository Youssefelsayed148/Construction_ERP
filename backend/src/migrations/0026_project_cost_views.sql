-- Closeout A2.4 (plan 3.1): one shared cost view.
--
-- project_costs is the single table every cost source accrues into (GRN, supplier invoice, material issue,
-- expense, payroll allocation, labour, equipment, subcontractor payment, supplier-return reversals).
-- These two views are the ONE definition of "what a project has cost" that dashboards, costing and the
-- commercial engine read through services/costView.js, so the three can never disagree. The unassigned
-- bucket (project_id NULL: company stock received without a project) stays one group, as the portfolio
-- total has always included it.
--
-- Existing rows: untouched (views only). Nothing to preflight.
CREATE OR REPLACE VIEW v_project_cost_totals AS
  SELECT project_id, SUM(amount)::numeric(15,2) AS total_cost, COUNT(*)::int AS cost_rows
    FROM project_costs
   GROUP BY project_id;

CREATE OR REPLACE VIEW v_project_cost_by_code AS
  SELECT project_id, cost_code_id, SUM(amount)::numeric(15,2) AS amount
    FROM project_costs
   GROUP BY project_id, cost_code_id;
