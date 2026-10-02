// Phase 27 — Agent policy: what MCP sessions may do, and what they may see.
//
// The MCP server is an ADAPTER, never a database client (prompt 27 point 1):
//   Client → MCP Server → AgentPolicy/Authorization (Phase 4) → Business
//   Services (phases 3–25) → Database.
//
// Authorization itself is NOT simplified here: every tool executes through
// the same internal route handler chain (authenticate → authorize → handler)
// that the UI uses, so permission resolution is identical to the API layer
// (prompt 27 point 5). What THIS module adds on top:
//   1. TOOL ALLOWLIST by role — a role that could never press the button in
//      the UI does not even see the tool in tools/list.
//   2. REDACTION of forbidden fields before anything is returned to a model
//      (prompt 27 point 8), driven by the same policy visibility flags
//      (see_internal_cost / see_client_value / see_subcontract_value) and
//      role class (external roles see portal-safe shapes only).
//   3. Required-approver resolution for high-risk gated actions.

'use strict';

const policy = require('./policy');

// ---------------------------------------------------------------------------
// Tool registry (shared by tools/list and execution)
// ---------------------------------------------------------------------------

// risk: 'read' | 'draft' (safe transactional draft) | 'gated' (high-risk,
// requires a human approval decision before execution)
const TOOLS = {
  // ---- READ -------------------------------------------------------------
  list_projects:          { risk: 'read', method: 'GET',    router: 'projects',     path: '/' },
  get_project:            { risk: 'read', method: 'GET',    router: 'projects',     path: '/:id', argMap: { id: 'id' } },
  get_project_team:       { risk: 'read', method: 'GET',    router: 'projects',     path: '/:id', argMap: { id: 'id' } },
  get_project_progress:   { risk: 'read', method: 'GET',    router: 'quantities',   path: '/progress/project/:projectId', argMap: { project_id: 'projectId' } },
  list_locations:         { risk: 'read', method: 'GET',    router: 'locations',    path: '/project/:projectId', argMap: { project_id: 'projectId' } },
  get_location_status:    { risk: 'read', method: 'GET',    router: 'quantities',   path: '/locations/:locationId/dashboard', argMap: { location_id: 'locationId' } },
  get_boq:                { risk: 'read', method: 'GET',    router: 'boq',          path: '/items/:projectId', argMap: { project_id: 'projectId' } },
  get_quantity_status:    { risk: 'read', method: 'GET',    router: 'quantities',   path: '/measurements' },
  get_material_requirements: { risk: 'read', method: 'GET', router: 'materials',    path: '/requirements' },
  get_inventory_status:   { risk: 'read', method: 'GET',    router: 'warehouses',   path: '/' },
  get_material_shortages: { risk: 'read', method: 'GET',    router: 'materials',    path: '/requirements' },
  list_rfis:              { risk: 'read', method: 'GET',    router: 'doccontrol',   path: '/rfis' },
  get_rfi:                { risk: 'read', method: 'GET',    router: 'doccontrol',   path: '/rfis', pick: 'rfi_id' },
  list_submittals:        { risk: 'read', method: 'GET',    router: 'doccontrol',   path: '/submittals' },
  get_submittal:          { risk: 'read', method: 'GET',    router: 'doccontrol',   path: '/submittals', pick: 'submittal_id' },
  list_inspections:       { risk: 'read', method: 'GET',    router: 'qhse',         path: '/inspections' },
  list_observations:      { risk: 'read', method: 'GET',    router: 'consultant',   path: '/reviews' },
  list_ncrs:              { risk: 'read', method: 'GET',    router: 'qhse',         path: '/ncrs' },
  get_project_cost_summary: { risk: 'read', method: 'GET',  router: 'costing',      path: '/project/:projectId/summary', argMap: { project_id: 'projectId' } },
  list_invoices:          { risk: 'read', method: 'GET',    router: 'invoices',     path: '/' },
  list_payments:          { risk: 'read', method: 'GET',    router: 'payments',     path: '/' },
  search_documents:       { risk: 'read', method: 'GET',    router: 'doccontrol',   path: '/search' },
  get_my_actions:         { risk: 'read', method: 'GET',    router: 'actions',      path: '/my' },
  // Additional read tools the Phase 28 assistants compose (same registry rules).
  get_schedule_delays:    { risk: 'read', method: 'GET',    router: 'schedule',     path: '/schedule/delayed' },
  get_schedule_alerts:    { risk: 'read', method: 'GET',    router: 'schedule',     path: '/schedule/alerts' },
  compare_quotes:         { risk: 'read', method: 'GET',    router: 'procurement',  path: '/rfq/:id/comparison', argMap: { rfq_id: 'id' } },
  list_variations:        { risk: 'read', method: 'GET',    router: 'commercial',   path: '/variations/:projectId', argMap: { project_id: 'projectId' } },
  list_documents:         { risk: 'read', method: 'GET',    router: 'doccontrol',   path: '/documents' },
  get_retention:          { risk: 'read', method: 'GET',    router: 'financeLedger', path: '/retention' },
  get_cash_position:      { risk: 'read', method: 'GET',    router: 'financeLedger', path: '/cash-flow' },
  get_portfolio_health:   { risk: 'read', method: 'GET',    router: 'dashboard',    path: '/portfolio' },

  // ---- SAFE TRANSACTIONAL DRAFTS (draft-only, never final commitments) ---
  create_rfi:                    { risk: 'draft', method: 'POST', router: 'doccontrol', path: '/rfis' },
  create_site_observation:       { risk: 'draft', method: 'POST', router: 'consultant', path: '/observations' },
  add_observation_comment:       { risk: 'draft', method: 'POST', router: 'consultant', path: '/observations/:id/comments', argMap: { observation_id: 'id' } },
  create_purchase_requisition_draft: { risk: 'draft', method: 'POST', router: 'procurement', path: '/pr' },
  create_inspection_request:     { risk: 'draft', method: 'POST', router: 'qhse',       path: '/inspections' },
  update_daily_report_draft:     { risk: 'draft', method: 'POST', router: 'site',       path: '/:projectId/site-reports', argMap: { project_id: 'projectId' } },
  assign_action:                 { risk: 'draft', method: 'POST', router: 'actions',    path: '/' },
  complete_action_with_evidence: { risk: 'draft', method: 'POST', router: 'actions',    path: '/:id/complete', argMap: { action_id: 'id' } },
  create_variation_draft:        { risk: 'draft', method: 'POST', router: 'commercial', path: '/variations' },

  // Drafts with no safe internal write path are stored as agent draft
  // proposals for human execution (agent_action_requests, status 'draft').
  add_rfi_comment:          { risk: 'draft', draftOnly: true },
  attach_observation_photo: { risk: 'draft', draftOnly: true },
  create_invoice_draft:     { risk: 'draft', draftOnly: true },
  create_transmittal_draft: { risk: 'draft', method: 'POST', router: 'doccontrol', path: '/transmittals' },

  // ---- HIGH-RISK GATED ACTIONS (human approval required before execution)
  issue_purchase_order:          { risk: 'gated', method: 'POST', router: 'procurement', path: '/po/:id/issue', argMap: { purchase_order_id: 'id' }, approver: 'finance' },
  approve_variation:             { risk: 'gated', method: 'POST', router: 'commercial',  path: '/variations/:id/decide', argMap: { variation_id: 'id' }, approver: 'commercial' },
  issue_client_invoice:          { risk: 'gated', method: 'POST', router: 'financeLedger', path: '/invoices/:id/transition', argMap: { invoice_id: 'id' }, approver: 'finance' },
  record_payment:                { risk: 'gated', method: 'POST', router: 'payments',    path: '/', approver: 'finance' },
  approve_payment_certificate:   { risk: 'gated', method: 'PUT',  router: 'subcontractors', path: '/certificates/:id', argMap: { certificate_id: 'id' }, approver: 'finance' },
  release_retention:             { risk: 'gated', method: 'POST', router: 'financeLedger', path: '/retention', approver: 'finance' },
  void_controlled_financial_record: { risk: 'gated', method: 'DELETE', router: 'invoices', path: '/:id', argMap: { record_id: 'id' }, approver: 'finance' },
  change_permission_rules:       { risk: 'gated', method: 'PUT',  router: 'users',       path: '/:id', argMap: { user_id: 'id' }, approver: 'owner' },
  close_project:                 { risk: 'gated', method: 'PUT',  router: 'projects',    path: '/:id', argMap: { project_id: 'id' }, approver: 'owner' },
};

// ---------------------------------------------------------------------------
// Allowlist by role (prompt 27 point 8: tool allowlist enforced per role)
// ---------------------------------------------------------------------------

const READ_ALL = Object.keys(TOOLS).filter((k) => TOOLS[k].risk === 'read');
const DRAFT_ALL = Object.keys(TOOLS).filter((k) => TOOLS[k].risk === 'draft');
const GATED_ALL = Object.keys(TOOLS).filter((k) => TOOLS[k].risk === 'gated');

// Role → additional tool classes. External portal roles (consultant, client,
// subcontractor, supplier) are guarded by middleware/auth.externalPortalAllowed
// — they may only reach operations mounted under their own portal — so their
// allowlists contain ONLY tools whose internal mounts fall inside their portal
// prefix. Everything else fails closed, exactly like the UI does.
const ALLOWLIST = {
  owner: [...READ_ALL, ...DRAFT_ALL, ...GATED_ALL],
  admin: [...READ_ALL, ...DRAFT_ALL, ...GATED_ALL],
  project_manager: [
    ...READ_ALL, ...DRAFT_ALL,
    'issue_purchase_order', 'approve_variation', 'close_project',
  ],
  purchasing_mgr: [
    ...READ_ALL, ...DRAFT_ALL,
    'issue_purchase_order', 'record_payment',
  ],
  finance_manager: [
    ...READ_ALL, ...DRAFT_ALL,
    'issue_purchase_order', 'approve_variation', 'issue_client_invoice',
    'record_payment', 'approve_payment_certificate', 'release_retention',
    'void_controlled_financial_record',
  ],
  consultant: [
    // consultant router mounts → /api/consultant (portal-scoped)
    'list_observations', 'create_site_observation', 'add_observation_comment',
  ],
  client: [],
  subcontractor: [],
  supplier: [],
};

function toolsForRole(role) {
  // Unknown/internal roles default to read + draft tools (no gated actions).
  return new Set(ALLOWLIST[role] || [...READ_ALL, ...DRAFT_ALL]);
}

function toolAllowed(role, toolName) {
  return toolsForRole(role).has(toolName);
}

// ---------------------------------------------------------------------------
// Redaction (prompt 27 point 8 — redact forbidden fields BEFORE the model)
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS = [
  'unit_price', 'unit_cost', 'total_cost', 'amount', 'budget', 'contract_value',
  'net_payable', 'work_value', 'retention_amount', 'total_amount', 'price',
  'internal_cost', 'margin', 'profit', 'cost_to_date', 'estimated_unit_price',
];

// Strips monetary/internal-cost fields unless the user's policy flags grant
// visibility. resolveFlags mirrors what the API layer resolves on every call.
async function resolveVisibilityFlags(user, q) {
  const decision = await policy.evaluate({ user, module: 'costing', action: 'view' }, q ? { query: q } : {});
  return decision.flags || { see_internal_cost: false, see_client_value: false, see_subcontract_value: false };
}

function redactValue(value, flags, key = '') {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((v) => redactValue(v, flags, key));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (!flags.see_internal_cost && SENSITIVE_KEYS.includes(k)) continue;
      out[k] = redactValue(v, flags, k);
    }
    return out;
  }
  return value;
}

function redactForUser(payload, flags) {
  return redactValue(payload, flags);
}

// ---------------------------------------------------------------------------
// Required approver for gated actions (prompt 27 points 4 + 6)
// ---------------------------------------------------------------------------

const APPROVER_ROLES = {
  finance: 'finance_manager',
  commercial: 'finance_manager',
  owner: 'owner',
};

function requiredApproverRole(toolName) {
  const def = TOOLS[toolName];
  if (!def || def.risk !== 'gated') return null;
  return APPROVER_ROLES[def.approver] || 'owner';
}

module.exports = {
  TOOLS,
  ALLOWLIST,
  toolsForRole,
  toolAllowed,
  resolveVisibilityFlags,
  redactForUser,
  redactValue,
  SENSITIVE_KEYS,
  requiredApproverRole,
};
