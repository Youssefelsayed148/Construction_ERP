// Phase 6 migration core — universal workflow engine.
//
// Tables:
//   workflow_templates       — catalog (key, name, entity scope)
//   workflow_steps           — ordered steps: sequential or parallel, with
//                              role / organization-type / amount-threshold
//                              conditions
//   workflow_instances       — one per entity under approval
//   workflow_step_instances  — per-step state machine rows
//   workflow_actions         — the decision log (approve/reject/return/
//                              reassign + comment + timestamp)
//   escalation_rules         — after-hours escalation to a role per step
//
// Seeds the standard construction workflows from
// construction_erp_agent_pack/24_WORKFLOW_CATALOG.md (exact state names),
// plus the "legacy_module_approval" template that reproduces the old
// approval_requests two-stage behavior (manager_review -> owner_review)
// driven by the existing MODULE_MANAGER_ROLES / DIRECT_TO_OWNER_MODULES maps.
//
// Everything idempotent: CREATE TABLE IF NOT EXISTS, ON CONFLICT DO NOTHING.

'use strict';

// The Phase 2-4 legacy map, reproduced verbatim so the legacy template drives
// the exact same authorization the hardcoded stage logic did.
const MODULE_MANAGER_ROLES = {
  expenses: ['finance_manager'],
  payroll: ['finance_manager'],
  legal: ['legal_mgr'],
  assets: ['maintenance_mgr'],
  maintenance: ['maintenance_mgr'],
  project_budgets: ['project_manager'],
  sub_contracts: ['project_manager'],
};

const DIRECT_TO_OWNER_MODULES = ['purchase_orders', 'grn'];

const TABLE_DDL = [
  `CREATE TABLE IF NOT EXISTS workflow_templates (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    entity_type_scope VARCHAR(100) DEFAULT '*',
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS workflow_steps (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
    step_key VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    sort_order INTEGER DEFAULT 1,
    mode VARCHAR(20) DEFAULT 'sequential',
    resolver_type VARCHAR(50) DEFAULT 'role',
    resolver_value VARCHAR(100),
    amount_threshold DECIMAL(15,2),
    conditions JSONB,
    sla_hours INTEGER,
    is_terminal BOOLEAN DEFAULT false,
    UNIQUE(template_id, step_key)
  )`,
  `CREATE TABLE IF NOT EXISTS workflow_instances (
    id SERIAL PRIMARY KEY,
    template_id INTEGER REFERENCES workflow_templates(id),
    template_key VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id INTEGER NOT NULL,
    project_id INTEGER REFERENCES projects(id),
    context JSONB,
    current_step_key VARCHAR(100),
    status VARCHAR(50) DEFAULT 'active',
    requester_id INTEGER REFERENCES users(id),
    legacy_approval_id INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_instances_entity ON workflow_instances(entity_type, entity_id)`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_instances_status ON workflow_instances(status)`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_instances_legacy ON workflow_instances(legacy_approval_id)`,
  `CREATE TABLE IF NOT EXISTS workflow_step_instances (
    id SERIAL PRIMARY KEY,
    instance_id INTEGER NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
    step_id INTEGER REFERENCES workflow_steps(id),
    step_key VARCHAR(100) NOT NULL,
    name VARCHAR(255),
    mode VARCHAR(20) DEFAULT 'sequential',
    status VARCHAR(50) DEFAULT 'waiting',
    assigned_role VARCHAR(100),
    assigned_user_id INTEGER REFERENCES users(id),
    opened_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    UNIQUE(instance_id, step_key)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_step_instances_instance ON workflow_step_instances(instance_id)`,
  `CREATE TABLE IF NOT EXISTS workflow_actions (
    id SERIAL PRIMARY KEY,
    instance_id INTEGER NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
    step_instance_id INTEGER REFERENCES workflow_step_instances(id),
    step_key VARCHAR(100),
    user_id INTEGER REFERENCES users(id),
    user_name VARCHAR(255),
    user_role VARCHAR(100),
    decision VARCHAR(50) NOT NULL,
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_actions_instance ON workflow_actions(instance_id)`,
  `CREATE TABLE IF NOT EXISTS escalation_rules (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
    step_key VARCHAR(100) NOT NULL,
    after_hours INTEGER NOT NULL,
    escalate_to_role VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(template_id, step_key)
  )`,
];

// ---------------------------------------------------------------------------
// Standard workflow catalog — exact state names from 24_WORKFLOW_CATALOG.md.
// resolver: role | organization_type | requester | module_manager
// mode: sequential | parallel
// ---------------------------------------------------------------------------

const WORKFLOW_CATALOG = [
  {
    key: 'rfi',
    name: 'RFI',
    steps: [
      { step_key: 'draft', name: 'Draft', resolver: 'requester' },
      { step_key: 'submitted', name: 'Submitted', resolver: 'requester' },
      { step_key: 'coordinator', name: 'Coordinator', resolver: 'role', resolver_value: 'project_manager' },
      { step_key: 'discipline_review', name: 'Discipline Reviewer(s)', mode: 'parallel', resolver: 'organization_type', resolver_value: 'consultant' },
      { step_key: 'official_response', name: 'Official Response', resolver: 'organization_type', resolver_value: 'consultant' },
      { step_key: 'acknowledged', name: 'Acknowledged', resolver: 'requester' },
      { step_key: 'closed', name: 'Closed', resolver: 'requester', is_terminal: true },
    ],
  },
  {
    key: 'submittal',
    name: 'Submittal',
    steps: [
      { step_key: 'draft', name: 'Draft', resolver: 'requester' },
      { step_key: 'internal_technical_review', name: 'Internal Technical Review', resolver: 'role', resolver_value: 'engineer' },
      { step_key: 'pm', name: 'PM', resolver: 'role', resolver_value: 'project_manager' },
      { step_key: 'consultant_coordinator', name: 'Consultant Coordinator', resolver: 'organization_type', resolver_value: 'consultant' },
      { step_key: 'reviewers', name: 'Reviewer(s)', mode: 'parallel', resolver: 'organization_type', resolver_value: 'consultant' },
      { step_key: 'response', name: 'Response', resolver: 'organization_type', resolver_value: 'consultant' },
      { step_key: 'resubmit_close', name: 'Resubmit/Close', resolver: 'requester', is_terminal: true },
    ],
  },
  {
    key: 'consultant_observation',
    name: 'Consultant Observation',
    steps: [
      { step_key: 'raised', name: 'Raised', resolver: 'requester' },
      { step_key: 'acknowledged', name: 'Acknowledged', resolver: 'organization_type', resolver_value: 'consultant' },
      { step_key: 'assigned', name: 'Assigned', resolver: 'role', resolver_value: 'project_manager' },
      { step_key: 'rectification', name: 'Rectification', resolver: 'role', resolver_value: 'site_supervisor' },
      { step_key: 'verification_requested', name: 'Verification Requested', resolver: 'requester' },
      { step_key: 'accepted_rejected', name: 'Accepted/Rejected', resolver: 'organization_type', resolver_value: 'consultant' },
      { step_key: 'closed', name: 'Closed', resolver: 'requester', is_terminal: true },
    ],
  },
  {
    key: 'wir',
    name: 'WIR',
    steps: [
      { step_key: 'draft', name: 'Draft', resolver: 'requester' },
      { step_key: 'qa_qc', name: 'QA/QC', resolver: 'role', resolver_value: 'engineer' },
      { step_key: 'pm_optional', name: 'PM optional', resolver: 'role', resolver_value: 'project_manager', conditions: { optional: true } },
      { step_key: 'consultant', name: 'Consultant', resolver: 'organization_type', resolver_value: 'consultant' },
      { step_key: 'approved_comments_rejected_reinspect', name: 'Approved/Comments/Rejected/Reinspect', resolver: 'organization_type', resolver_value: 'consultant', is_terminal: true },
    ],
  },
  {
    key: 'mir',
    name: 'MIR',
    steps: [
      { step_key: 'delivery', name: 'Delivery', resolver: 'requester' },
      { step_key: 'internal_qa_qc', name: 'Internal QA/QC', resolver: 'role', resolver_value: 'engineer' },
      { step_key: 'consultant_if_required', name: 'Consultant if required', resolver: 'organization_type', resolver_value: 'consultant', conditions: { optional: true } },
      { step_key: 'accepted_rejected_quarantine', name: 'Accepted/Rejected/Quarantine', resolver: 'organization_type', resolver_value: 'consultant', is_terminal: true },
      { step_key: 'grn_eligibility', name: 'GRN eligibility', resolver: 'role', resolver_value: 'purchasing_mgr', is_terminal: true },
    ],
  },
  {
    key: 'ncr',
    name: 'NCR',
    steps: [
      { step_key: 'open', name: 'Open', resolver: 'requester' },
      { step_key: 'assigned', name: 'Assigned', resolver: 'role', resolver_value: 'project_manager' },
      { step_key: 'root_cause_corrective_action', name: 'Root Cause/Corrective Action', resolver: 'role', resolver_value: 'site_supervisor' },
      { step_key: 'verification', name: 'Verification', resolver: 'role', resolver_value: 'engineer' },
      { step_key: 'resolved', name: 'Resolved', resolver: 'role', resolver_value: 'project_manager' },
      { step_key: 'closed', name: 'Closed', resolver: 'role', resolver_value: 'owner', is_terminal: true },
    ],
  },
  {
    key: 'purchase_requisition',
    name: 'Purchase Requisition',
    steps: [
      { step_key: 'draft', name: 'Draft', resolver: 'requester' },
      { step_key: 'submit', name: 'Submit', resolver: 'requester' },
      { step_key: 'budget_check', name: 'Budget Check', resolver: 'role', resolver_value: 'accountant' },
      { step_key: 'authority_approval', name: 'Authority Approval', resolver: 'role', resolver_value: 'purchasing_mgr' },
      { step_key: 'procurement', name: 'Procurement', resolver: 'role', resolver_value: 'purchasing_mgr', is_terminal: true },
    ],
  },
  {
    key: 'po',
    name: 'PO',
    steps: [
      { step_key: 'draft', name: 'Draft', resolver: 'requester' },
      { step_key: 'commercial_procurement_approval', name: 'Commercial/Procurement Approval', resolver: 'role', resolver_value: 'purchasing_mgr' },
      { step_key: 'financial_authority', name: 'Financial Authority', resolver: 'role', resolver_value: 'finance_manager' },
      { step_key: 'issued', name: 'Issued', resolver: 'role', resolver_value: 'purchasing_mgr' },
      { step_key: 'acknowledged', name: 'Acknowledged', resolver: 'organization_type', resolver_value: 'supplier' },
      { step_key: 'partially_fully_delivered', name: 'Partially/Fully Delivered', resolver: 'requester' },
      { step_key: 'closed', name: 'Closed', resolver: 'requester', is_terminal: true },
    ],
  },
  {
    key: 'variation',
    name: 'Variation',
    steps: [
      { step_key: 'change_event', name: 'Change Event', resolver: 'requester' },
      { step_key: 'estimate', name: 'Estimate', resolver: 'role', resolver_value: 'qs' },
      { step_key: 'internal_commercial_review', name: 'Internal Commercial Review', resolver: 'role', resolver_value: 'project_manager' },
      { step_key: 'authority_approval', name: 'Authority Approval', resolver: 'role', resolver_value: 'owner' },
      { step_key: 'consultant_recommendation', name: 'Consultant Recommendation', resolver: 'organization_type', resolver_value: 'consultant' },
      { step_key: 'client_approval_reject', name: 'Client Approval/Reject', resolver: 'organization_type', resolver_value: 'client' },
      { step_key: 'incorporated', name: 'Incorporated', resolver: 'requester', is_terminal: true },
    ],
  },
  {
    key: 'payment_certificate',
    name: 'Payment Certificate',
    steps: [
      { step_key: 'draft_measurement', name: 'Draft Measurement', resolver: 'requester' },
      { step_key: 'qs_review', name: 'QS Review', resolver: 'role', resolver_value: 'qs' },
      { step_key: 'pm_commercial', name: 'PM/Commercial', resolver: 'role', resolver_value: 'project_manager' },
      { step_key: 'consultant_client', name: 'Consultant/Client', mode: 'parallel', resolver: 'organization_type', resolver_value: 'consultant' },
      { step_key: 'certified', name: 'Certified', resolver: 'role', resolver_value: 'finance_manager' },
      { step_key: 'invoice_eligible', name: 'Invoice Eligible', resolver: 'role', resolver_value: 'finance_manager', is_terminal: true },
    ],
  },
  {
    key: 'supplier_subcontract_invoice',
    name: 'Supplier/Subcontract Invoice',
    steps: [
      { step_key: 'received', name: 'Received', resolver: 'requester' },
      { step_key: 'match_certificate', name: 'Match/Certificate', resolver: 'role', resolver_value: 'qs' },
      { step_key: 'ap_review', name: 'AP Review', resolver: 'role', resolver_value: 'accountant' },
      { step_key: 'approval', name: 'Approval', resolver: 'role', resolver_value: 'finance_manager' },
      { step_key: 'due', name: 'Due', resolver: 'role', resolver_value: 'finance_manager' },
      { step_key: 'paid', name: 'Paid', resolver: 'role', resolver_value: 'finance_manager', is_terminal: true },
    ],
  },
  {
    key: 'handover_punch',
    name: 'Handover Punch',
    steps: [
      { step_key: 'raised', name: 'Raised', resolver: 'requester' },
      { step_key: 'assigned', name: 'Assigned', resolver: 'role', resolver_value: 'site_supervisor' },
      { step_key: 'rectified', name: 'Rectified', resolver: 'role', resolver_value: 'site_supervisor' },
      { step_key: 'verified', name: 'Verified', resolver: 'organization_type', resolver_value: 'consultant' },
      { step_key: 'closed', name: 'Closed', resolver: 'role', resolver_value: 'project_manager', is_terminal: true },
    ],
  },
];

// The legacy two-stage approval — reproduces approvals.js exactly:
//   stage manager_review: MODULE_MANAGER_ROLES[module] (owner/admin override)
//   stage owner_review: owner/admin only
//   DIRECT_TO_OWNER_MODULES skip the manager stage
const LEGACY_TEMPLATE = {
  key: 'legacy_module_approval',
  name: 'Legacy Module Approval',
  steps: [
    {
      step_key: 'manager_review',
      name: 'Manager Review',
      resolver_type: 'module_manager',
      conditions: {
        module_roles: MODULE_MANAGER_ROLES,
        skip_if_module: DIRECT_TO_OWNER_MODULES,
      },
    },
    {
      step_key: 'owner_review',
      name: 'Owner Review',
      resolver_type: 'role',
      resolver_value: 'owner',
      conditions: { allow_roles: ['owner', 'admin'] },
      is_terminal: true,
    },
  ],
};

async function ensureTables(query) {
  for (const ddl of TABLE_DDL) {
    await query(ddl);
  }
}

async function seedTemplates(query) {
  const all = [...WORKFLOW_CATALOG.map((w) => ({ ...w, legacy: false })), { ...LEGACY_TEMPLATE, legacy: true }];
  for (const tpl of all) {
    await query(
      `INSERT INTO workflow_templates (key, name, entity_type_scope, description, is_active)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (key) DO NOTHING`,
      [tpl.key, tpl.name, '*', tpl.legacy ? 'Reproduces the pre-engine two-stage approval (manager_review -> owner_review)' : null, true]
    );
    const idRes = await query('SELECT id FROM workflow_templates WHERE key = $1', [tpl.key]);
    const templateId = idRes.rows[0] ? idRes.rows[0].id : null;
    if (templateId == null) continue;
    for (const [i, step] of tpl.steps.entries()) {
      await query(
        `INSERT INTO workflow_steps (template_id, step_key, name, sort_order, mode, resolver_type, resolver_value, amount_threshold, conditions, sla_hours, is_terminal)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (template_id, step_key) DO NOTHING`,
        [
          templateId, step.step_key, step.name, i + 1,
          step.mode || 'sequential',
          step.resolver || step.resolver_type || 'role',
          step.resolver_value || null,
          step.amount_threshold ?? null,
          step.conditions ? JSON.stringify(step.conditions) : null,
          step.sla_hours ?? null,
          step.is_terminal === true,
        ]
      );
    }
    // Default escalation: the manager review step escalates to the owner
    // after 48 hours SLA breach.
    await query(
      `INSERT INTO escalation_rules (template_id, step_key, after_hours, escalate_to_role, is_active)
       VALUES ($1, 'manager_review', 48, 'owner', true)
       ON CONFLICT (template_id, step_key) DO NOTHING`,
      [templateId]
    );
  }
}

async function run(query) {
  await ensureTables(query);
  await seedTemplates(query);
}

module.exports = {
  MODULE_MANAGER_ROLES,
  DIRECT_TO_OWNER_MODULES,
  WORKFLOW_CATALOG,
  LEGACY_TEMPLATE,
  TABLE_DDL,
  ensureTables,
  seedTemplates,
  run,
};
