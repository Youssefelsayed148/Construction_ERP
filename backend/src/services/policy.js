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
//   * users with NO user_project_roles rows have no access at all —
//     are DENIED (Phase 1.2: no fail-open fallback). Migration 0004 and user creation
//     give every internal user a role row.
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
// Expiry (5.1): a team assignment whose expires_at has passed grants nothing; NULL = no expiry,
// so every existing row behaves exactly as before.
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
  WHERE upr.user_id = $1
    AND (upr.expires_at IS NULL OR upr.expires_at >= CURRENT_DATE)`;

// Phase 5.1: modules that are ORGANIZATION-scope only — they carry no project scoping at all
// (their record routes must not inherit a project id from a request body and their decisions are
// made on module/action grants alone, i.e. company-wide = project_id NULL rows; a project-bound
// role can still hold these grants because team seats can name an organization inside a project).
// team deliberately stays PROJECT-scoped: a project-bound seat granted team rights must not be
// able to assign seats on projects it does not belong to.
const ORGANIZATION_MODULES = new Set([
  'organizations',  // the organizations router (mounted at /api/organizations)
  'delegations',    // delegations of authority (mounted at /api/delegations)
  'notifications',  // user notification feeds are user-owned, never project-owned
  'actions',        // action items/user feed (same rationale)
  'admin',          // reserved for a future /api/admin mount; documented here so the set is complete
]);

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
  if (req.body && req.body.project_id != null) return Number(req.body.project_id);
  if (req.body && req.body.projectId != null) return Number(req.body.projectId);
  if (module === 'projects' && req.params && req.params.id != null) {
    return Number(req.params.id);
  }
  if (req.route && /^\/project\/:id(?:\/|$)/.test(String(req.route.path)) && req.params?.id != null) {
    return Number(req.params.id);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Resource-derived module and action (Phase 5.1)
//
// The policy module normally comes from the mount prefix and the action from the HTTP verb. Two things do not
// fit that: some routers share a mount (the site router lives under /api/projects, delivery/MIR/GRN routes
// under /api/procurement), and approve/decide/issue/verify routes are POSTs that would count as plain `create`.
// Both are decided here from (mount module, method, internal route path), the same key the record scope rules
// use, so internal requests, the /api/v1 remount and MCP synthetic requests all get the same answer.
// ---------------------------------------------------------------------------
const MODULE_OVERRIDES = Object.freeze({
  projects: [
    [/^\/:projectId\/(?:site-reports|instructions|site-visits|workspace|photos|sticky-notes)(?:\/|$)/, 'site'],
  ],
  procurement: [
    [/^\/deliveries(?:\/|$)/, 'inventory'],
    [/^\/mir\//, 'inventory'],
    [/^\/grn\//, 'inventory'],
    [/^\/documents\/grn\//, 'inventory'],
  ],
  // Phase 5.1: the organization mounts are pinned explicitly (identity mappings) so that a future
  // reorganization (e.g. delegations nested under organizations) cannot silently re-key the grants
  // an organization mount is judged under. They resolve the same module the mount name already gives.
  organizations: [
    [/.*/, 'organizations'],
  ],
  delegations: [
    [/.*/, 'delegations'],
  ],
  team: [
    [/.*/, 'team'],
  ],
});

// [mount module, METHOD, route path pattern, action | (req) => action]
const ACTION_OVERRIDES = Object.freeze([
  ['approvals', 'PUT', /^\/:id\/approve$/, 'approve'],
  // Phase 3.5: progress columns are derived; setting one by hand is a distinct permission, not 'edit'.
  ['projects', 'PUT', /^\/:id$/, (req) => (req.body && req.body.completion_percentage != null ? 'override_progress' : 'edit')],
  ['projects', 'PUT', /^\/:projectId\/phases\/:phaseId$/, (req) => (req.body && req.body.completion_percentage != null ? 'override_progress' : 'edit')],
  ['invoices', 'DELETE', /^\/:id$/, 'void'],
  ['items', 'POST', /^\/:id\/restore$/, 'delete'],
  ['payments', 'DELETE', /^\/:id$/, 'void'],
  ['suppliers', 'POST', /^\/:id\/restore$/, 'delete'],
  ['approvals', 'PUT', /^\/:id\/reject$/, 'reject'],
  ['commercial', 'POST', /^\/variations\/:id\/start$/, 'submit'],
  ['commercial', 'POST', /^\/variations\/:id\/decide$/, 'approve'],
  ['docs', 'POST', /^\/documents\/:id\/submit$/, 'submit'],
  ['docs', 'POST', /^\/documents\/:id\/:action/, (req) => (req.params && req.params.action === 'reject' ? 'reject' : 'approve')],
  ['finance-ledger', 'POST', /^\/invoices\/:id\/transition$/, 'issue_financial_document'],
  ['finance-ledger', 'POST', /^\/payments\/:id\/allocate$/, 'record_payment'],
  ['handover', 'POST', /^\/process\/:id\/transition$/, 'approve'],
  ['handover', 'POST', /^\/package\/items\/:id\/verify$/, 'approve'],
  ['procurement', 'POST', /^\/pr\/:id\/submit$/, 'submit'],
  ['procurement', 'POST', /^\/pr\/:id\/decide$/, 'approve'],
  ['procurement', 'POST', /^\/rfq\/:id\/award$/, 'approve'],
  ['procurement', 'POST', /^\/po\/:id\/issue$/, 'issue_financial_document'],
  ['procurement', 'POST', /^\/po\/:id\/decide$/, 'approve'],
  ['procurement', 'POST', /^\/mir\/:id\/decide$/, 'approve'],
  ['procurement', 'POST', /^\/invoices\/:id\/approve$/, 'approve'],
  ['qhse', 'POST', /^\/ncrs\/:id\/verify$/, 'approve'],
  ['qhse', 'POST', /^\/wirs\/:id\/submit$/, 'submit'],
  ['subcontractors', 'PUT', /^\/certificates\/:id$/, 'approve'],
  ['work-orders', 'PUT', /^\/:woId\/completions\/:compId\/verify$/, 'approve'],
  ['reports', 'GET', /^\/export\//, 'export'],
]);

function routePathOf(req) {
  return String(req.policyRoute || (req.route && req.route.path) || '');
}

function effectiveModule(req, mountModule) {
  const routePath = routePathOf(req);
  const hit = (MODULE_OVERRIDES[mountModule] || []).find(([pattern]) => pattern.test(routePath));
  return hit ? hit[1] : mountModule;
}

function effectiveAction(req, mountModule) {
  const routePath = routePathOf(req);
  const method = String(req.method || '').toUpperCase();
  const hit = ACTION_OVERRIDES.find(([mod, m, pattern]) => mod === mountModule && m === method && pattern.test(routePath));
  if (!hit) return actionFromRequest(req);
  return typeof hit[3] === 'function' ? hit[3](req) : hit[3];
}

// Routes such as /invoices/:id carry a record id, not a project id. Resolve
// those records before policy evaluation so a project-scoped grant cannot be
// bypassed by guessing another project's record id. Every table name below is
// a constant owned by the server; request input is used only as a parameter.
const RECORD_SCOPE_RULES = Object.freeze({
  actions: [[/^\/:id(?:\/|$)/, 'action_items']],
  agent: [[/^\/requests\/:id(?:\/|$)/, 'agent_action_requests']],
  boq: [[/^\/sections\/:id(?:\/|$)/, 'boq_sections'], [/^\/items\/:id(?:\/|$)/, 'boq_items']],
  commercial: [[/^\/variations\/:id(?:\/|$)/, 'variations']],
  consultant: [
    [/^\/observations\/:id(?:\/|$)/, 'observations'],
    [/^\/rfis\/:id(?:\/|$)/, 'project_rfis'],
    [/^\/submittals\/:id(?:\/|$)/, 'project_submittals'],
  ],
  docs: [
    [/^\/documents\/:id(?:\/|$)/, 'project_documents'],
    [/^\/rfis\/:id(?:\/|$)/, 'project_rfis'],
    [/^\/submittals\/:id(?:\/|$)/, 'project_submittals'],
    [/^\/transmittals\/:id(?:\/|$)/, 'transmittals'],
    [/^\/correspondence\/:id(?:\/|$)/, 'correspondence'],
  ],
  expenses: [[/^\/:id(?:\/|$)/, 'expenses']],
  payments: [[/^\/:id(?:\/|$)/, 'payments']],
  invoices: [[/^\/:id(?:\/|$)/, 'invoices']],
  locations: [[/^\/:id(?:\/|$)/, 'project_locations']],
  materials: [[/^\/recipes\/:id(?:\/|$)/, 'material_recipes']],
  procurement: [
    [/^\/(?:documents\/)?pr\/:id(?:\/|$)/, 'purchase_requests'],
    [/^\/rfq\/:id(?:\/|$)/, 'rfqs'],
    [/^\/(?:documents\/)?po\/:id(?:\/|$)/, 'purchase_orders'],
    [/^\/deliveries\/:id(?:\/|$)/, 'SELECT po.project_id FROM deliveries d JOIN purchase_orders po ON po.id = d.purchase_order_id WHERE d.id = $1'],
    [/^\/mir\/:id(?:\/|$)/, 'material_inspection_requests'],
    [/^\/(?:documents\/)?grn\/:id(?:\/|$)/, 'SELECT po.project_id FROM goods_receipt_notes g JOIN purchase_orders po ON po.id = g.purchase_order_id WHERE g.id = $1'],
    // Phase 3.1: supplier invoices resolve their project through the PO when one exists.
    [/^\/invoices\/:id(?:\/|$)/, 'SELECT po.project_id FROM supplier_invoices si LEFT JOIN purchase_orders po ON po.id = si.purchase_order_id WHERE si.id = $1'],
  ],
  qhse: [
    [/^\/quality-tests\/:id(?:\/|$)/, 'quality_tests'],
    [/^\/ncrs\/:id(?:\/|$)/, 'ncrs'],
    [/^\/itps\/:id(?:\/|$)/, 'itps'],
    [/^\/wirs\/:id(?:\/|$)/, 'wirs'],
    [/^\/mirs\/:id(?:\/|$)/, 'material_inspection_requests'],
    [/^\/punch-items\/:id(?:\/|$)/, 'punch_items'],
    [/^\/inspections\/:id(?:\/|$)/, 'safety_inspections'],
    [/^\/incidents\/:id(?:\/|$)/, 'safety_incidents'],
    [/^\/checklists\/instances\/:id(?:\/|$)/, 'checklist_instances'],
    [/^\/mock-ups\/:id(?:\/|$)/, 'mock_ups'],
  ],
  hse: [
    [/^\/incidents\/:id(?:\/|$)/, 'incidents'],
    [/^\/inspections\/:id(?:\/|$)/, 'hse_inspections'],
    [/^\/permits\/:id(?:\/|$)/, 'permits'],
    [/^\/jsas\/:id(?:\/|$)/, 'jsas'],
    [/^\/risk-assessments\/:id(?:\/|$)/, 'risk_assessments'],
    [/^\/near-misses\/:id(?:\/|$)/, 'near_misses'],
  ],
  legal: [[/^\/:id(?:\/|$)/, 'legal_documents']],
  maintenance: [[/^\/:id(?:\/|$)/, 'maintenance_reminders']],
  warehouses: [
    [/^\/:id(?:\/|$)/, 'warehouses'],
    [/^\/movements\/:id(?:\/|$)/, 'SELECT w.project_id FROM stock_movements sm JOIN warehouses w ON w.id = sm.warehouse_id WHERE sm.id = $1'],
    [/^\/transfers\/:id(?:\/|$)/, 'SELECT COALESCE(source.project_id, destination.project_id) AS project_id FROM inventory_transfers t LEFT JOIN warehouses source ON source.id = t.from_warehouse_id LEFT JOIN warehouses destination ON destination.id = t.to_warehouse_id WHERE t.id = $1'],
    [/^\/reservations\/:id(?:\/|$)/, 'stock_reservations'],
  ],
  'finance-ledger': [
    [/^\/invoices\/:id(?:\/|$)/, 'invoices'],
    [/^\/payments\/:id(?:\/|$)/, 'payments'],
    [/^\/ap-review\/:id(?:\/|$)/, 'SELECT po.project_id FROM ap_review_queue q JOIN supplier_invoices si ON si.id = q.supplier_invoice_id JOIN purchase_orders po ON po.id = si.purchase_order_id WHERE q.id = $1'],
  ],
  handover: [
    [/^\/process\/:id(?:\/|$)/, 'handover_processes'],
    [/^\/package\/items\/:id(?:\/|$)/, 'handover_package_items'],
    [/^\/claims\/:id(?:\/|$)/, 'warranty_claims'],
  ],
  quantities: [
    [/^\/allocations\/:id(?:\/|$)/, 'SELECT bi.project_id FROM boq_location_allocations a JOIN boq_items bi ON bi.id = a.boq_item_id WHERE a.id = $1'],
    [/^\/measurements\/:id(?:\/|$)/, 'quantity_measurements'],
    [/^\/allocations\/:boqItemId(?:\/|$)/, 'boq_items', 'boqItemId'],
    [/^\/progress\/location\/:locationId(?:\/|$)/, 'project_locations', 'locationId'],
    [/^\/locations\/:locationId(?:\/|$)/, 'project_locations', 'locationId'],
  ],
  schedule: [
    [/^\/activities\/:id(?:\/|$)/, 'schedule_activities'],
    [/^\/relationships\/:id(?:\/|$)/, 'activity_relationships'],
    [/^\/schedule\/milestones\/:id(?:\/|$)/, 'project_milestones'],
  ],
  // /api/projects also serves the site router, so its record routes live here. The :projectId in these
  // paths is checked against the record's real project (ownershipMatches), not just trusted.
  projects: [
    [/^\/:projectId\/phases\/:phaseId(?:\/|$)/, 'project_phases', 'phaseId'],
    [/^\/:projectId\/milestones\/:milestoneId(?:\/|$)/, 'project_milestones', 'milestoneId'],
    [/^\/:projectId\/team\/:teamId(?:\/|$)/, 'project_team', 'teamId'],
    [/^\/:projectId\/site-reports\/:id(?:\/|$)/, 'site_daily_reports'],
    [/^\/:projectId\/instructions\/:id(?:\/|$)/, 'engineer_instructions'],
    [/^\/:projectId\/site-visits\/:id(?:\/|$)/, 'site_visits'],
    [/^\/:projectId\/sticky-notes\/:id(?:\/|$)/, 'sticky_notes'],
  ],
  sales: [
    [/^\/buildings\/:id(?:\/|$)/, 'buildings'],
    [/^\/buildings\/:buildingId(?:\/|$)/, 'buildings', 'buildingId'],
    [/^\/units\/:id(?:\/|$)/, 'SELECT b.project_id FROM units u JOIN buildings b ON b.id = u.building_id WHERE u.id = $1'],
  ],
  subcontractors: [
    [/^\/verifications\/:contractId(?:\/|$)/, 'sub_contracts', 'contractId'],
    [/^\/certificates\/:contractId(?:\/|$)/, 'sub_contracts', 'contractId'],
    [/^\/verifications\/:id(?:\/|$)/, 'SELECT sc.project_id FROM sub_work_verifications v JOIN sub_contracts sc ON sc.id = v.sub_contract_id WHERE v.id = $1'],
    [/^\/certificates\/:id(?:\/|$)/, 'SELECT sc.project_id FROM sub_payment_certificates c JOIN sub_contracts sc ON sc.id = c.sub_contract_id WHERE c.id = $1'],
    [/^\/verifications$/, 'sub_contracts', 'sub_contract_id', 'body'],
    [/^\/certificates$/, 'sub_contracts', 'sub_contract_id', 'body'],
  ],
  'work-orders': [
    [/^\/:woId\/completions\/:compId(?:\/|$)/, 'SELECT wo.project_id FROM work_completions c JOIN work_orders wo ON wo.id = c.work_order_id WHERE c.id = $1', 'compId'],
    [/^\/:id(?:\/|$)/, 'work_orders'],
  ],
});

// The internal route path the request is being served by. Express sets req.route for a normal mount; the
// v1 remount and MCP synthetic requests run the handler chain directly, so remountFrom sets policyRoute.
function recordScopeRule(req, module) {
  const routePath = String(req.policyRoute || req.route?.path || '');
  return (RECORD_SCOPE_RULES[module] || []).find(([pattern]) => pattern.test(routePath)) || null;
}

async function resolveProjectContext(req, module, q = query) {
  const explicit = extractProjectId(req, module);
  const rule = recordScopeRule(req, module);
  if (!rule) {
    if (explicit != null) return { projectId: explicit, recordScoped: false, recordFound: true };
    return { projectId: null, recordScoped: false, recordFound: true };
  }
  const [, source, paramName = 'id', from = 'params'] = rule;
  const recordId = from === 'body' ? req.body?.[paramName] : req.params?.[paramName];
  if (recordId == null) return { projectId: null, recordScoped: true, recordFound: false };
  const sql = /^SELECT\s/i.test(source)
    ? source
    : `SELECT project_id FROM ${source} WHERE id = $1`;
  const result = await q(sql, [recordId]);
  const row = result.rows && result.rows[0];
  const resolvedProjectId = row && row.project_id != null ? Number(row.project_id) : null;
  // A caller cannot override a record's real owner by supplying an allowed
  // project_id in the request body or query string.
  const ownershipMatches = explicit == null || resolvedProjectId == null
    || Number(explicit) === resolvedProjectId;
  return {
    projectId: resolvedProjectId,
    recordScoped: true,
    recordFound: Boolean(row) && ownershipMatches,
  };
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
    // No role assignment: deny. (This used to return source 'legacy' and the middleware let the user through.)
    return { allowed: false, flags, role_keys: [], source: 'policy', company_wide: false, scoped_project_ids: [], no_assignment: true };
  }

  const roleKeys = new Set();
  const scopedProjectIds = new Set();
  let companyWide = false;
  let allowed = false;
  for (const row of rows) {
    roleKeys.add(row.role_key);
    const flag = VISIBILITY_ACTION_TO_FLAG[row.perm_action];
    if (flag) flags[flag] = true;
    if (grantMatches(row.perm_module, row.perm_action, module, action)) {
      if (row.project_id == null) companyWide = true;
      else scopedProjectIds.add(Number(row.project_id));
    }
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
    company_wide: companyWide,
    scoped_project_ids: [...scopedProjectIds].filter(Number.isFinite),
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
//   { allowed: true|false, flags, role_keys, source: 'policy' }   — decided (no role rows => denied)
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
    return { allowed: false, flags: emptyFlags(), role_keys: [], source: 'policy', no_assignment: true };
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
  const mountModule = moduleFromRequest(req);
  const module = effectiveModule(req, mountModule);
  const action = effectiveAction(req, mountModule);
  const q = opts.query || query;
  // Record scope rules are keyed on the mount; the grant decision uses the resource-derived module.
  const context = await resolveProjectContext(req, mountModule, q);
  // Organization-scope modules (5.1): their grants are module/action only — an organization is not
  // project data, so a ?project_id=/body id on such a request can never scope the decision. No record
  // scope rule exists for these modules either by design. team stays project-scoped (see the set).
  const orgScopeOnly = ORGANIZATION_MODULES.has(module) && !context.recordScoped;
  const projectId = orgScopeOnly ? null : context.projectId;
  if (context.recordScoped && !context.recordFound) {
    return { allowed: false, flags: emptyFlags(), role_keys: [], source: 'policy', project_id: null };
  }
  const constrainRecordDecision = (decision) => {
    if (context.recordScoped && projectId == null && decision.source === 'policy' && !decision.company_wide) {
      return { ...decision, allowed: false, project_id: null };
    }
    return { ...decision, project_id: projectId };
  };
  if (req.preview && req.user) {
    const decision = await evaluateForRole(req.user.role, {
      module,
      action,
      projectId,
      actorScopedProjects: (req.preview.scoped_project_ids || []).map(Number),
    }, opts);
    return constrainRecordDecision(decision);
  }
  const decision = await evaluate({ user: req.user, module, action, projectId }, opts);
  const constrained = constrainRecordDecision(decision);
  if (constrained.allowed) return constrained;
  // Phase 5.1 delegation of authority: an active delegation lets the DELEGATE act as the DELEGATOR
  // on approvals (and only the approvals module), within the row's window and amount. It AMPLIFIES
  // an existing role identity: a caller with no role rows at all is never amplified (fail-closed).
  const amplified = await evaluateViaDelegation(req, module, action, opts);
  return amplified || constrained;
}

// --- the delegation hook ----------------------------------------------------
// Amounts of approval records: the decision amount the delegation cap is measured against. Returned
// NULL when no amount exists on the source record (e.g. an asset) — an unknown amount is never
// an unknown amount is never capped on the hook side; the delegation cap still applies to every
// amount-carrying approval record named in DELEGATION_AMOUNTS.
const DELEGATION_AMOUNTS = Object.freeze({
  expenses: 'SELECT amount FROM expenses',
  payroll: 'SELECT total_net_salary FROM payroll_periods',
  project_budgets: 'SELECT budget_amount FROM project_budgets',
  sub_contracts: 'SELECT contract_value FROM sub_contracts',
  purchase_orders: 'SELECT total_amount FROM purchase_orders',
});

async function evaluateViaDelegation(req, module, action, opts = {}) {
  // (approvals only, and only approve/reject — the decisions the delegated authority covers)
  if (module !== 'approvals' || !['approve', 'reject'].includes(action)) return null;
  if (!req.user || !Number.isFinite(Number(req.user.id))) return null;
  const routePath = String(req.policyRoute || req.route?.path || '');
  const approvalId = routePath === '/:id/approve' || routePath === '/:id/reject' ? Number(req.params?.id) : NaN;
  const q = opts.query || query;
  const delegatorFilters = { module: 'approvals', amount: null, approvalId: Number.isFinite(approvalId) ? approvalId : null };
  if (Number.isFinite(approvalId)) {
    const row = (await q('SELECT module_name, request_id FROM approval_requests WHERE id = $1', [approvalId])).rows[0];
    if (row && row.module_name && DELEGATION_AMOUNTS[row.module_name]) {
      const amountRow = (await q(`${DELEGATION_AMOUNTS[row.module_name]} WHERE id = $1`, [row.request_id])).rows[0];
      if (amountRow) delegatorFilters.amount = amountRow.amount != null ? Number(amountRow.amount) : null;
    }
  }
  const delegationService = require('./delegationService');
  const hits = await delegationService.findActiveForDelegate(q, req.user.id, {
    module: 'approvals', amount: delegatorFilters.amount, now: Date.now(),
  });
  const userRows = await loadUserPolicy(req.user.id, q);
  if (userRows.length === 0) return null; // fail-closed: no identity, no amplification (fail-closed contract)
  for (const delegation of hits) {
    const delegatorRows = await loadUserPolicy(delegation.delegate_from_user_id, q);
    if (delegatorRows.length === 0) continue;
    const outcome = decide({
      rows: delegatorRows.map((r) => ({ ...r, project_id: null })), // delegated authority is company-wide on approvals
      module, action, projectId: null,
    });
    if (outcome.allowed) {
      return {
        ...outcome,
        via_delegation: {
          delegation_id: delegation.id,
          delegator_user_id: delegation.delegate_from_user_id,
          amount: delegatorFilters.amount,           // resolved amount the cap was measured against
          max_amount: delegation.max_amount,
        },
      };
    }
  }
  return null;
}

// Raw grants + decision source for a user. Used by routes that need to
// enumerate *which* modules the caller can act on (e.g. approvals /pending),
// for both the policy path and the legacy fallback.
async function listGrants(user, opts = {}) {
  const q = opts.query || query;
  if (!user) return { source: 'policy', grants: [] };
  const rows = await loadUserPolicy(user.id, q);
  const grants = rows
    .filter((r) => r.perm_module != null)
    .map((r) => ({ perm_module: r.perm_module, perm_action: r.perm_action, project_id: r.project_id }));
  return { source: 'policy', grants };
}

// Point check used to replace hardcoded `role === 'owner' || role === 'admin'`
// bypasses (e.g. approvals.js "sees all pending requests").
//   * explicit grant on (module, action), wildcards honored; no role rows => false.
async function hasPermission(user, module, action, opts = {}) {
  const q = opts.query || query;
  if (!user) return false;
  const rows = await loadUserPolicy(user.id, q);
  return rows.some((row) => grantMatches(row.perm_module, row.perm_action, module, action));
}

// Visibility flags for a user, independent of any specific module/action —
// used by routes that must strip internal-cost / client-value /
// subcontractor-value fields from responses.
async function visibilityFlags(user, opts = {}) {
  const q = opts.query || query;
  if (!user) return emptyFlags();
  const rows = await loadUserPolicy(user.id, q);
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
  ORGANIZATION_MODULES,
  USER_POLICY_SQL,
  ROLE_POLICY_SQL,
  emptyFlags,
  grantMatches,
  moduleFromRequest,
  actionFromRequest,
  extractProjectId,
  RECORD_SCOPE_RULES,
  MODULE_OVERRIDES,
  ACTION_OVERRIDES,
  effectiveModule,
  effectiveAction,
  recordScopeRule,
  resolveProjectContext,
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
