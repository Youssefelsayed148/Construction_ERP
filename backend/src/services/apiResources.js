// Phase 26 — v1-only read models.
//
// The prompt's v1 resource list includes list/read endpoints some modules
// never exposed as REST lists internally (e.g. purchase-requisitions,
// purchase-orders, deliveries, grns, organizations, payment-certificates are
// surfaced internally through dashboards/reports only). These v1 lists are
// thin, read-only queries that:
//   * run through the SAME policy engine module the equivalent internal
//     endpoints use (e.g. 'procurement', 'commercial'),
//   * filter project-scoped rows to the caller's project-bound grants so
//     cross-project data cannot be enumerated, mirroring the policy engine's
//     row-driven scoping for project-bound roles.
//
// WRITE and lifecycle operations are NOT re-implemented here — they are
// remounted from the internal route handlers (routes/v1.js remount table), so
// v1 calls the exact same functions the UI calls.

'use strict';

const policy = require('./policy');
const { query } = require('../config/database');

// The user's grants for a module, resolved the same way the policy engine
// decides. No role rows => no access.
//   projectFilter = null  → company-wide visibility (same as internal)
//   projectFilter = []    → project-bound role with no assignments → nothing
//   projectFilter = [ids] → visible only on those projects
async function listAccess(req, permModule) {
  const { grants } = await policy.listGrants(req.user);
  const relevant = grants.filter((g) =>
    (g.perm_module === '*' || g.perm_module === permModule) &&
    (g.perm_action === '*' || g.perm_action === 'view' || g.perm_action === 'manage'));
  if (relevant.length === 0) return { allowed: false, projectFilter: null };
  if (relevant.some((g) => g.project_id == null)) return { allowed: true, projectFilter: null };
  const ids = [...new Set(relevant.map((g) => Number(g.project_id)).filter(Number.isFinite))];
  return { allowed: true, projectFilter: ids };
}

// Inject a parameterized project_id filter when the caller is project-scoped.
function applyProjectFilter(sql, params, projectFilter, column = 'project_id') {
  if (projectFilter == null) return { sql, params };
  if (projectFilter.length === 0) {
    return { sql: `${sql} WHERE 1 = 0`, params };
  }
  const idx = params.length;
  const placeholders = projectFilter.map((_, i) => `$${idx + 1 + i}`);
  const sep = / WHERE /i.test(sql) ? ' AND ' : ' WHERE ';
  return {
    sql: `${sql}${sep}${column} IN (${placeholders.join(',')})`,
    params: [...params, ...projectFilter],
  };
}

const READ_MODELS = {
  'purchase-requisitions': {
    module: 'procurement', table: 'purchase_requests',
    select: 'SELECT * FROM purchase_requests', idColumn: 'id', projectColumn: 'project_id',
  },
  'purchase-orders': {
    module: 'procurement', table: 'purchase_orders',
    select: 'SELECT * FROM purchase_orders', idColumn: 'id', projectColumn: 'project_id',
  },
  deliveries: {
    module: 'inventory', table: 'deliveries',
    select: 'SELECT * FROM deliveries', idColumn: 'id', projectColumn: 'project_id',
  },
  mirs: {
    module: 'inventory', table: 'material_inspection_requests',
    select: 'SELECT * FROM material_inspection_requests', idColumn: 'id', projectColumn: 'project_id',
  },
  grns: {
    module: 'inventory', table: 'goods_receipt_notes',
    select: 'SELECT * FROM goods_receipt_notes', idColumn: 'id', projectColumn: 'project_id',
  },
  organizations: {
    module: 'organizations', table: 'organizations',
    select: 'SELECT * FROM organizations', idColumn: 'id', projectColumn: null,
  },
  'payment-certificates': {
    module: 'commercial', table: 'payment_certificates',
    select: 'SELECT * FROM payment_certificates', idColumn: 'id', projectColumn: 'project_id',
  },
  observations: {
    module: 'consultant', table: 'observations',
    select: 'SELECT * FROM observations', idColumn: 'id', projectColumn: 'project_id',
  },
};

// v1-only list endpoint. Pagination/filter/sort is applied afterwards by the
// normalizeResponses middleware (rows arrive unpaginated here).
async function listFamily(family, req, res) {
  const model = READ_MODELS[family];
  const access = await listAccess(req, model.module);
  if (!access.allowed) return res.status(403).json({ success: false, error: 'Insufficient permissions' });
  const filtered = applyProjectFilter(model.select, [], access.projectFilter, model.projectColumn);
  const rows = (await query(`${filtered.sql} ORDER BY ${model.idColumn} DESC`, filtered.params)).rows;
  return res.json({ success: true, data: rows });
}

// v1-only single-record endpoint with the ID-guessing guard: project-scoped
// roles cannot read another project's record by id.
async function getFamilyRecord(family, req, res) {
  const model = READ_MODELS[family];
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
  // Module-level check first, so a caller with no access cannot tell a missing record (404) from a forbidden one.
  const moduleAccess = await listAccess(req, model.module);
  if (!moduleAccess.allowed) return res.status(403).json({ success: false, error: 'Insufficient permissions' });
  const row = (await query(`SELECT * FROM ${model.table} WHERE ${model.idColumn} = $1`, [id])).rows[0];
  if (!row) return res.status(404).json({ success: false, error: `${family} #${id} not found` });
  if (model.projectColumn && row[model.projectColumn] != null) {
    const decision = await policy.evaluate({
      user: req.user, module: model.module, action: 'view', projectId: row[model.projectColumn],
    });
    if (!decision.allowed) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }
  }
  return res.json({ success: true, data: row });
}

module.exports = {
  READ_MODELS,
  listAccess,
  applyProjectFilter,
  listFamily,
  getFamilyRecord,
};
