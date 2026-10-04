// Mock-db stand-in for services/costView.js. The real module reads the v_project_cost_* views (migration 0026),
// which MockDb cannot create; fast unit tests use this shim over plain project_costs rows instead. The views
// themselves are exercised on real PostgreSQL (cost-view.pg.test.js).
'use strict';

const toNum = (v) => (v == null ? 0 : Number(v));

async function projectTotal(q, projectId) {
  const rows = (await q('SELECT amount FROM project_costs WHERE project_id = $1', [projectId])).rows;
  return rows.reduce((s, r) => s + toNum(r.amount), 0);
}

module.exports = { projectTotal };
