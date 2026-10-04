// Closeout A2.4: the one place that reads project cost totals (migration 0026 views over project_costs).
// Dashboards, costing, the commercial engine, the progress/budget widgets and the PR budget check all call
// these functions, so a project's "spent" is the same number everywhere. Errors propagate: a failed read is
// an error with context, never a zero. (A project with no cost rows has 0 cost: that is a fact, not a guess.)
'use strict';

const toNum = (v) => (v == null ? 0 : Number(v));

// Total cost of one project.
async function projectTotal(q, projectId) {
  const r = (await q('SELECT total_cost FROM v_project_cost_totals WHERE project_id = $1', [projectId])).rows[0];
  return r ? toNum(r.total_cost) : 0;
}

// Total of every cost row, projects and the unassigned bucket together (the portfolio actual).
async function portfolioTotal(q) {
  const r = (await q('SELECT COALESCE(SUM(total_cost), 0) AS total FROM v_project_cost_totals')).rows[0];
  return toNum(r.total);
}

// Cost per cost code of one project: [{ cost_code_id, amount }].
async function byCode(q, projectId) {
  return (await q('SELECT cost_code_id, amount FROM v_project_cost_by_code WHERE project_id = $1', [projectId])).rows
    .map((r) => ({ cost_code_id: r.cost_code_id, amount: toNum(r.amount) }));
}

// Cost per cost-code type of one project: [{ type, total }] (rows with no cost code have type null).
async function byType(q, projectId) {
  return (await q(
    `SELECT cc.type, COALESCE(SUM(v.amount), 0) AS total
       FROM v_project_cost_by_code v LEFT JOIN cost_codes cc ON cc.id = v.cost_code_id
      WHERE v.project_id = $1 GROUP BY cc.type`, [projectId]
  )).rows;
}

// The detail rows behind a project's total, newest first.
async function rows(q, projectId) {
  return (await q(
    `SELECT pc.*, cc.name AS cost_code_name, cc.type AS cost_code_type
       FROM project_costs pc LEFT JOIN cost_codes cc ON pc.cost_code_id = cc.id
      WHERE pc.project_id = $1 ORDER BY pc.transaction_date DESC, pc.id DESC`, [projectId]
  )).rows;
}

module.exports = { projectTotal, portfolioTotal, byCode, byType, rows };
