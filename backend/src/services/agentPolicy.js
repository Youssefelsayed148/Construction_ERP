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
  void_financial_record:         { risk: 'gated', method: 'DELETE', router: 'invoices', path: '/:id', argMap: { record_id: 'id' }, approver: 'finance' },
  change_authority_rules:        { risk: 'gated', method: 'PUT',  router: 'users',       path: '/:id', argMap: { user_id: 'id' }, approver: 'owner' },
  close_project:                 { risk: 'gated', method: 'PUT',  router: 'projects',    path: '/:id', argMap: { project_id: 'id' }, approver: 'owner' },
  // These notify a person or declare work finished, so an agent cannot do them alone: a human approves,
  // and completing needs written evidence (see TOOL_BODY).
  assign_action:                 { risk: 'gated', method: 'POST', router: 'actions',    path: '/', approver: 'project' },
  complete_action_with_evidence: { risk: 'gated', method: 'POST', router: 'actions',    path: '/:id/complete', argMap: { action_id: 'id' }, approver: 'project' },
};

// ---------------------------------------------------------------------------
// Allowlist by role (prompt 27 point 8: tool allowlist enforced per role)
// ---------------------------------------------------------------------------

const READ_ALL = Object.keys(TOOLS).filter((k) => TOOLS[k].risk === 'read');
const DRAFT_ALL = Object.keys(TOOLS).filter((k) => TOOLS[k].risk === 'draft');
const GATED_ALL = Object.keys(TOOLS).filter((k) => TOOLS[k].risk === 'gated');
// Gated tools every internal role may PROPOSE (a human still approves them).
const PROPOSE_ALL = ['assign_action', 'complete_action_with_evidence'];

// Role → additional tool classes. External portal roles (consultant, client,
// subcontractor, supplier) are guarded by middleware/auth.externalPortalAllowed
// — they may only reach operations mounted under their own portal — so their
// allowlists contain ONLY tools whose internal mounts fall inside their portal
// prefix. Everything else fails closed, exactly like the UI does.
const ALLOWLIST = {
  owner: [...READ_ALL, ...DRAFT_ALL, ...GATED_ALL],
  admin: [...READ_ALL, ...DRAFT_ALL, ...GATED_ALL],
  project_manager: [
    ...READ_ALL, ...DRAFT_ALL, ...PROPOSE_ALL,
    'issue_purchase_order', 'approve_variation', 'close_project',
  ],
  purchasing_mgr: [
    ...READ_ALL, ...DRAFT_ALL, ...PROPOSE_ALL,
    'issue_purchase_order', 'record_payment',
  ],
  finance_manager: [
    ...READ_ALL, ...DRAFT_ALL, ...PROPOSE_ALL,
    'issue_purchase_order', 'approve_variation', 'issue_client_invoice',
    'record_payment', 'approve_payment_certificate', 'release_retention',
    'void_financial_record',
  ],
  consultant: [
    // consultant router mounts → /api/consultant (portal-scoped)
    'list_observations', 'create_site_observation', 'add_observation_comment',
  ],
  // Internal roles without special tools: read + draft, no gated actions.
  manager: [...READ_ALL, ...DRAFT_ALL, ...PROPOSE_ALL],
  staff: [...READ_ALL, ...DRAFT_ALL, ...PROPOSE_ALL],
  accountant: [...READ_ALL, ...DRAFT_ALL, ...PROPOSE_ALL],
  engineer: [...READ_ALL, ...DRAFT_ALL, ...PROPOSE_ALL],
  site_supervisor: [...READ_ALL, ...DRAFT_ALL, ...PROPOSE_ALL],
  legal_mgr: [...READ_ALL, ...DRAFT_ALL, ...PROPOSE_ALL],
  maintenance_mgr: [...READ_ALL, ...DRAFT_ALL, ...PROPOSE_ALL],
  client: [],
  subcontractor: [],
  supplier: [],
};

function toolsForRole(role) {
  // Fail closed: a role that is not listed gets no tools (it used to get every read and draft tool).
  return new Set(Object.prototype.hasOwnProperty.call(ALLOWLIST, role) ? ALLOWLIST[role] : []);
}

function toolAllowed(role, toolName) {
  return toolsForRole(role).has(toolName);
}

// ---------------------------------------------------------------------------
// Redaction (prompt 27 point 8 — redact forbidden fields BEFORE the model)
// ---------------------------------------------------------------------------

// Money fields, grouped by the visibility flag that unlocks them (the flags come from the policy engine:
// see_internal_cost, see_client_value -> see_client_price, see_subcontract_value -> see_subcontractor_price).
// Matching is by exact name or by suffix so new columns such as `labor_cost` or `net_amount` are covered.
const MONEY_GROUPS = {
  see_internal_cost: {
    exact: ['unit_cost', 'total_cost', 'internal_cost', 'cost_to_date', 'margin', 'profit', 'budget', 'overhead'],
    suffix: ['_cost', '_margin', '_profit', '_budget'],
  },
  see_client_price: {
    exact: ['unit_price', 'estimated_unit_price', 'total_amount', 'price', 'amount', 'contract_value', 'revised_amount',
      'certified_gross', 'net_amount', 'gross_current_work', 'retention_amount', 'tax_amount', 'cumulative_certified',
      'previous_cumulative', 'advance_recovery', 'other_deductions', 'approved_variations_period', 'credited_amount'],
    suffix: ['_price', '_amount'],
  },
  see_subcontractor_price: {
    exact: ['net_payable', 'work_value', 'retention_deduction', 'previous_paid', 'penalties', 'materials_deducted'],
    suffix: ['_payable'],
  },
};
// Kept for callers that import the old list: every key any group can hide.
const SENSITIVE_KEYS = Object.values(MONEY_GROUPS).flatMap((g) => g.exact);

function hiddenBy(key, flags) {
  for (const [flag, group] of Object.entries(MONEY_GROUPS)) {
    if (flags[flag]) continue;
    if (group.exact.includes(key) || group.suffix.some((suffix) => key.endsWith(suffix))) return true;
  }
  return false;
}

// External roles get an ALLOW-LIST of fields (a portal-safe shape): anything not listed is dropped, so a
// new column never leaks to an outside party by default. Internal roles are filtered by the money groups above.
const EXTERNAL_FIELD_ALLOWLIST = {
  consultant: new Set([
    'success', 'data', 'error', 'id', 'observation_number', 'project_id', 'discipline', 'location_id', 'title', 'description',
    'severity', 'status', 'raised_at', 'acknowledged_at', 'closed_at', 'created_at', 'updated_at',
    'observation_id', 'comment_type', 'body', 'type', 'name', 'code', 'due_date',
  ]),
  client: new Set(['success', 'data', 'error', 'id', 'project_id', 'title', 'description', 'status', 'created_at', 'updated_at']),
  subcontractor: new Set(['success', 'data', 'error', 'id', 'project_id', 'title', 'description', 'status', 'created_at', 'updated_at']),
  supplier: new Set(['success', 'data', 'error', 'id', 'project_id', 'title', 'description', 'status', 'created_at', 'updated_at']),
};

// resolveFlags mirrors what the API layer resolves on every call.
async function resolveVisibilityFlags(user, q) {
  const decision = await policy.evaluate({ user, module: 'costing', action: 'view' }, q ? { query: q } : {});
  return decision.flags || policy.emptyFlags();
}

function redactValue(value, flags, key = '', allowlist = null) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((v) => redactValue(v, flags, key, allowlist));
  if (typeof value === 'object') {
    if (value instanceof Date) return value;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (allowlist && !allowlist.has(k)) continue;
      if (hiddenBy(k, flags)) continue;
      out[k] = redactValue(v, flags, k, allowlist);
    }
    return out;
  }
  return value;
}

// role (optional): external roles are reduced to their allow-list.
function redactForUser(payload, flags, role) {
  const allowlist = role && Object.prototype.hasOwnProperty.call(EXTERNAL_FIELD_ALLOWLIST, role)
    ? EXTERNAL_FIELD_ALLOWLIST[role] : null;
  return redactValue(payload, flags || policy.emptyFlags(), '', allowlist);
}

// ---------------------------------------------------------------------------
// Tool input schemas (validated before anything executes)
// ---------------------------------------------------------------------------

const Joi = require('joi');

const id = Joi.number().integer().positive();
const text = (max = 2000) => Joi.string().max(max);
const optText = (max = 2000) => Joi.string().allow('', null).max(max);
const reasonKey = { reason: Joi.string().allow('').max(1000) };

// Read tools: the target ids named in argMap are required; the rest are the common list filters.
const READ_FILTERS = {
  project_id: id, status: text(60), q: text(200), limit: Joi.number().integer().min(1).max(500),
  offset: Joi.number().integer().min(0), from: text(40), to: text(40), date: text(40),
};

// Body fields of the write tools, mirroring the Joi schema of the route each one calls (the route still
// validates the values; this layer refuses unknown fields and missing required ones before anything runs).
const TOOL_BODY = {
  create_rfi: { project_id: id.required(), subject: text(300).required(), question: optText(), category: optText(100), priority: Joi.string().valid('low', 'normal', 'high', 'urgent'), due_date: optText(40) },
  create_site_observation: { project_id: id.required(), title: text(300).required(), description: optText(), discipline: optText(100), location_id: id.allow(null), severity: Joi.string().valid('low', 'normal', 'high', 'urgent') },
  add_observation_comment: { observation_id: id.required(), comment_type: Joi.string().valid('comment', 'rectification', 'rejection', 'verification', 'assignment'), body: text(4000).required() },
  create_purchase_requisition_draft: { title: text(300).required(), project_id: id.allow(null), priority: Joi.string().valid('low', 'normal', 'high', 'urgent'), needed_by: optText(40), lines: Joi.array().items(Joi.object().unknown(true)).min(1).max(200).required() },
  create_inspection_request: { project_id: id.required(), inspection_date: optText(40), checklist_items: Joi.array().items(Joi.object().unknown(true)).max(200), findings: optText(), status: Joi.string().valid('pending', 'passed', 'failed') },
  update_daily_report_draft: { project_id: id.required(), report_date: text(40).required(), weather: optText(200), temperature: optText(100), workers_count: Joi.number().integer().min(0), work_summary: text(4000).required(), material_received: optText(), equipment_on_site: optText(), issues_notes: optText(), photos: Joi.array().items(Joi.object().unknown(true)).max(50) },
  create_variation_draft: { project_id: id.required(), client_contract_id: id.allow(null), sub_contract_id: id.allow(null), title: text(300).required(), description: optText(), variation_type: Joi.string().valid('client', 'internal', 'subcontract'), lines: Joi.array().items(Joi.object().unknown(true)).max(200) },
  create_transmittal_draft: { project_id: id.required(), direction: Joi.string().valid('incoming', 'outgoing'), purpose: optText(), sender_organization_id: id.allow(null), recipient_organization_id: id.allow(null), recipient_user_id: id.allow(null), attention: optText(300), response_due: optText(40), items: Joi.array().items(Joi.object().unknown(true)).max(200) },
  add_rfi_comment: { rfi_id: id.required(), comment: text(4000).required() },
  attach_observation_photo: { observation_id: id.required(), photo_url: text(1000).required(), caption: optText(500) },
  create_invoice_draft: { project_id: id, client_id: id, invoice_id: id, amount: Joi.number().positive(), description: optText(), issue_date: optText(40), due_date: optText(40) },
  assign_action: { source_type: text(60), source_id: id.allow(null), project_id: id.allow(null), location_id: id.allow(null), title: text(300).required(), description: optText(), assigned_user_id: id.allow(null), assigned_role: optText(60), assigned_organization_id: id.allow(null), priority: Joi.string().valid('low', 'medium', 'high', 'normal', 'urgent'), due_date: optText(40) },
  // Completing work needs written evidence the approver can check.
  complete_action_with_evidence: { action_id: id.required(), evidence: text(4000).min(10).required(), attachment_ids: Joi.array().items(id).max(50) },
  issue_purchase_order: { purchase_order_id: id.required() },
  approve_variation: { variation_id: id.required(), decision: Joi.string().valid('approve', 'reject').required(), comment: optText() },
  issue_client_invoice: { invoice_id: id.required(), status: text(40).required() },
  record_payment: { invoice_id: id.allow(null), project_id: id.required(), client_id: id.required(), amount: Joi.number().positive().required(), payment_date: text(40).required(), payment_method: text(60), reference_number: optText(120), notes: optText() },
  approve_payment_certificate: { certificate_id: id.required(), status: Joi.string().valid('certified', 'paid').required() },
  release_retention: { project_id: id.required(), party_type: Joi.string().valid('client', 'subcontractor').required(), direction: Joi.string().valid('held', 'released').required(), amount: Joi.number().positive().required(), source_type: optText(60), source_id: id.allow(null) },
  void_financial_record: { record_id: id.required() },
  change_authority_rules: { user_id: id.required(), role: text(60), department: optText(120), module_permissions: Joi.array().items(text(100)).max(100), is_active: Joi.boolean() },
  close_project: { project_id: id.required(), status: text(40), end_date: optText(40), notes: optText() },
};

function schemaForTool(name) {
  const def = TOOLS[name];
  if (!def) return null;
  if (TOOL_BODY[name]) return Joi.object({ ...TOOL_BODY[name], ...reasonKey });
  const keys = { ...READ_FILTERS, ...reasonKey };
  if (def.argMap) for (const arg of Object.keys(def.argMap)) keys[arg] = id.required();
  if (def.pick) keys[def.pick] = id;
  return Joi.object(keys);
}

// Returns { value } or { error: 'Invalid arguments: ...' }.
function validateToolArgs(name, args) {
  const schema = schemaForTool(name);
  if (!schema) return { error: `Unknown tool '${name}'` };
  const { error, value } = schema.validate(args || {}, { abortEarly: false, convert: false, stripUnknown: false });
  if (error) return { error: `Invalid arguments: ${error.details.map((d) => d.message.replace(/"/g, "'")).join('; ')}` };
  return { value };
}

// ---------------------------------------------------------------------------
// Required approver for gated actions (prompt 27 points 4 + 6)
// ---------------------------------------------------------------------------

const APPROVER_ROLES = {
  project: 'project_manager',
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
  MONEY_GROUPS,
  EXTERNAL_FIELD_ALLOWLIST,
  schemaForTool,
  validateToolArgs,
  requiredApproverRole,
};
