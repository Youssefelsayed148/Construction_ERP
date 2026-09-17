// Phase 4 — scoped policy-evaluation service.
//
// Resolves Company + Organization + Project + Role + Module + Record + Action
// into an allow/deny decision plus a set of visibility flags:
//   see_internal_cost, see_client_price, see_subcontractor_price
//
// The decision is fully table-driven (roles / permissions / role_permissions /
// user_project_roles seeded by src/scripts/policy-migration.js):
//   * a user's effective grants come from their user_project_roles rows,
//     joined to roles and role_permissions;
//   * a row whose project_id is NULL is a company-wide assignment (internal
//     roles get one, so their legacy behavior is preserved);
//   * a row bound to a project only grants access to that project — an
//     external user cannot ID-guess another project's endpoints;
//   * users with NO user_project_roles rows are "migration incomplete" —
//     middleware/auth.js falls back to the legacy role-list check for them.
//
// Everything accepts an injectable query function so unit tests can run
// without a live database.

'use strict';

const { query } = require('../config/database');

// Legacy role lists preserved for the fallback path (see middleware/auth.js).
const INTERNAL_ROLES = new Set([
  'owner',
  'admin',
  'finance_manager',
  'purchasing_mgr',
  'project_manager',
  'legal_mgr',
  'maintenance_mgr',
  'manager',
  'staff',
  'accountant',
  'engineer',
  'site_supervisor',
]);

const EXTERNAL_ROLES = new Set(['consultant', 'client', 'subcontractor', 'supplier']);

const METHOD_ACTIONS = {
  GET: 'view',
  HEAD: 'view',
  POST: 'create',
  PUT: 'edit',
  PATCH: 'edit',
  DELETE: 'delete',
};

const VISIBILITY_FLAGS = ['see_internal_cost', 'see_client_price', 'see_subcontractor_price'];

// permission.action → visibility flag name
const VISIBILITY_ACTION_TO_FLAG = {
  see_internal_cost: 'see_internal_cost',
  see_client_value: 'see_client_price',
  see_subcontract_value: 'see_subcontractor_price',
};

// One row per (user role row × permission). Rows with no permissions yield
// one row with NULL perm columns (LEFT JOIN keeps role/project bindings).
const USER_POLICY_SQL = `
  SELECT r.key AS role_key,
         upr.project_id,
         upr.organization_id,
         p.module AS perm_module,
         p.action AS perm_action
  FROM user_project_roles upr
  JOIN roles r ON r.id = upr.role_id
  LEFT JOIN role_permissions rp ON rp.role_id = r.id
  LEFT JOIN permissions p ON p.id = rp.permission_id
  WHERE upr.user_id = $1`;

// Same shape for a bare role (used by preview-as-role demo mode, where the
// acting user is an admin but the decision must be made as the previewed role).
const ROLE_POLICY_SQL = `
  SELECT p.module AS perm_module,
         p.action AS perm_action
  FROM roles r
  LEFT JOIN role_permissions rp ON rp.role_id = r.id
  LEFT JOIN permissions p ON p.id = rp.permission_id
  WHERE r.key = $1`;

function emptyFlags() {
  return {
    see_internal_cost: false,
    see_client_price: false,
    see_subcontractor_price: false,
  };
}

function grantMatches(permModule, permAction, module, action) {
  if (permModule == null || permAction == null) return false;
  if (permModule === '*' && permAction === '*') return true;
  if (permModule === '*' && permAction === action) return true;
  if (permModule === module && permAction === '*') return true;
  return permModule === module && permAction === action;
}

function moduleFromRequest(req) {
  const segments = String(req.baseUrl || '')
    .split('/')
    .filter(Boolean);
  if (segments[0] === 'api') segments.shift();
  return segments[0] || 'root';
}

function actionFromRequest(req) {
  return METHOD_ACTIONS[req.method] || 'view';
}

// Project id from the request, when the route is project-scoped. `req.params.id`
// is only trusted on the /api/projects mount, where it always denotes a project;
// elsewhere it may be an invoice/payment/document id and is ignored.
function extractProjectId(req, module) {
  if (req.params) {
    if (req.params.projectId != null) return Number(req.params.projectId);
    if (req.params.project_id != null) return Number(req.params.project_id);
  }
  if (req.query && req.query.project_id != null) return Number(req.query.project_id);
  if (module === 'projects' && req.params && req.params.id != null) {
    return Number(req.params.id);
  }
  return null;
}

// Build the full decision for a set of policy rows.
// rows: [{ role_key, project_id, organization_id, perm_module, perm_action }]
//
// Project scoping is row-driven: a project-bound row (project_id NOT NULL)
// only grants its permission on that exact project; a NULL project_id row is
// company-wide. External users therefore hold only project-bound rows, which
// makes ID-guessing another project's endpoints fail closed.
// A request without a project id ("enumerate") is decided by the grants
// alone; server-side list filtering lands in the next phase.
function decide({ rows, module, action, projectId }) {
  const flags = emptyFlags();
  if (rows.length === 0) {
    return { allowed: null, flags, role_keys: [], source: 'legacy' };
  }

  const roleKeys = new Set();
  let allowed = false;
  for (const row of rows) {
    roleKeys.add(row.role_key);
    const flag = VISIBILITY_ACTION_TO_FLAG[row.perm_action];
    if (flag) flags[flag] = true;
    if (allowed) continue;
    if (projectId != null && row.project_id != null && Number(row.project_id) !== Number(projectId)) {
      continue;
    }
    if (grantMatches(row.perm_module, row.perm_action, module, action)) {
      allowed = true;
    }
  }

  return {
    allowed,
    flags,
    role_keys: [...roleKeys],
    source: 'policy',
  };
}

async function loadUserPolicy(userId, q = query) {
  const res = await q(USER_POLICY_SQL, [userId]);
  return res.rows || [];
}

async function loadRoleGrants(roleKey, q = query) {
  const res = await q(ROLE_POLICY_SQL, [roleKey]);
  return (res.rows || []).map((r) => ({ role_key: roleKey, project_id: null, organization_id: null, perm_module: r.perm_module, perm_action: r.perm_action }));
}

// Main entry point: evaluate a user against module + action (+ optional
// project). Returns:
//   { allowed: true|false, flags, role_keys, source: 'policy' }   — decided
//   { allowed: null, flags, role_keys: [], source: 'legacy' }     — fallback
async function evaluate({ user, module, action, projectId }, opts = {}) {
  const q = opts.query || query;
  if (!user || user.id == null) {
    return { allowed: false, flags: emptyFlags(), role_keys: [], source: 'policy' };
  }
  const rows = await loadUserPolicy(user.id, q);
  return decide({ rows, module, action, projectId });
}

// Evaluate as a bare role, ignoring the acting user's own rows. Used by
// preview-as-role mode: the acting admin sees the app exactly as the
// previewed role would (project scoping included, via the actor's own
// project assignments so a previewed external role still cannot roam).
async function evaluateForRole(roleKey, { module, action, projectId, actorScopedProjects = [] } = {}, opts = {}) {
  const q = opts.query || query;
  const rows = await loadRoleGrants(roleKey, q);
  if (rows.length === 0) {
    return { allowed: null, flags: emptyFlags(), role_keys: [], source: 'legacy' };
  }
  if (EXTERNAL_ROLES.has(roleKey) && projectId != null) {
    const scoped = actorScopedProjects.map(Number);
    if (!scoped.includes(Number(projectId))) {
      return {
        allowed: false,
        flags: emptyFlags(),
        role_keys: [roleKey],
        source: 'policy',
      };
    }
  }
  return decide({ rows, module, action, projectId });
}

// Request-shaped convenience wrapper used by middleware/auth.js.
async function evaluateRequest(req, opts = {}) {
  const module = moduleFromRequest(req);
  const action = actionFromRequest(req);
  const projectId = extractProjectId(req, module);
  if (req.preview && req.user) {
    return evaluateForRole(req.user.role, {
      module,
      action,
      projectId,
      actorScopedProjects: (req.preview.scoped_project_ids || []).map(Number),
    }, opts);
  }
  return evaluate({ user: req.user, module, action, projectId }, opts);
}

// Raw grants + decision source for a user. Used by routes that need to
// enumerate *which* modules the caller can act on (e.g. approvals /pending),
// for both the policy path and the legacy fallback.
async function listGrants(user, opts = {}) {
  const q = opts.query || query;
  if (!user) return { source: 'policy', grants: [] };
  const rows = await loadUserPolicy(user.id, q);
  if (rows.length === 0) {
    return { source: 'legacy', grants: [] };
  }
  const grants = rows
    .filter((r) => r.perm_module != null)
    .map((r) => ({ perm_module: r.perm_module, perm_action: r.perm_action, project_id: r.project_id }));
  return { source: 'policy', grants };
}

// Point check used to replace hardcoded `role === 'owner' || role === 'admin'`
// bypasses (e.g. approvals.js "sees all pending requests").
//   * legacy fallback (user not migrated): owner/admin only, as before;
//   * policy path: explicit grant on (module, action), wildcards honored.
async function hasPermission(user, module, action, opts = {}) {
  const q = opts.query || query;
  if (!user) return false;
  const rows = await loadUserPolicy(user.id, q);
  if (rows.length === 0) {
    return user.role === 'owner' || user.role === 'admin';
  }
  return rows.some((row) => grantMatches(row.perm_module, row.perm_action, module, action));
}

// Visibility flags for a user, independent of any specific module/action —
// used by routes that must strip internal-cost / client-value /
// subcontractor-value fields from responses.
async function visibilityFlags(user, opts = {}) {
  const q = opts.query || query;
  if (!user) return emptyFlags();
  const rows = await loadUserPolicy(user.id, q);
  if (rows.length === 0) {
    // Legacy fallback: internal roles see everything, external see nothing.
    const legacy = INTERNAL_ROLES.has(user.role);
    return {
      see_internal_cost: legacy,
      see_client_price: legacy,
      see_subcontractor_price: legacy,
    };
  }
  const flags = emptyFlags();
  for (const row of rows) {
    const flag = VISIBILITY_ACTION_TO_FLAG[row.perm_action];
    if (flag) flags[flag] = true;
  }
  return flags;
}

// Append-only audit trail. There is deliberately no update/delete helper.
async function recordAuditEvent({ entity, entityId, action, before, after, userId, projectId }, opts = {}) {
  const q = opts.query || query;
  const res = await q(
    `INSERT INTO audit_events (entity, entity_id, action, "before", "after", user_id, project_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entity,
      entityId == null ? null : entityId,
      action,
      before == null ? null : JSON.stringify(before),
      after == null ? null : JSON.stringify(after),
      userId == null ? null : userId,
      projectId == null ? null : projectId,
    ]
  );
  return res.rows && res.rows[0] ? res.rows[0] : null;
}

module.exports = {
  EXTERNAL_ROLES,
  INTERNAL_ROLES,
  METHOD_ACTIONS,
  VISIBILITY_ACTION_TO_FLAG,
  USER_POLICY_SQL,
  ROLE_POLICY_SQL,
  emptyFlags,
  grantMatches,
  moduleFromRequest,
  actionFromRequest,
  extractProjectId,
  loadUserPolicy,
  loadRoleGrants,
  decide,
  evaluate,
  evaluateForRole,
  evaluateRequest,
  listGrants,
  hasPermission,
  visibilityFlags,
  recordAuditEvent,
};
