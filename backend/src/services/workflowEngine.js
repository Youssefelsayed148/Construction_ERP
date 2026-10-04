// Phase 6 — universal workflow engine.
//
// Replaces every hardcoded approval path. The core state machine is fully
// table-driven: workflow_templates → workflow_steps (sequential/parallel,
// role / organization-type / amount-threshold conditions) → workflow_instances
// → workflow_step_instances, with workflow_actions as the append-only
// decision log and escalation_rules for SLA escalation.
//
// Public API:
//   startWorkflow(templateKey, entityType, entityId, context, opts)
//   recordDecision(instanceId, stepId, userId, decision, comment, opts)
//   getPendingFor(userId, opts)
//
// Legacy parity: the 'legacy_module_approval' template reproduces the old
// approval_requests manager_review -> owner_review behavior exactly, driven
// by the same MODULE_MANAGER_ROLES / DIRECT_TO_OWNER_MODULES maps. The
// approvals route adapter dual-writes approval_requests so the external API
// response shape is unchanged while parity holds.

'use strict';

const { query: defaultQuery } = require('../config/database');

const { query } = require('../config/database');
const actionService = require('./actionService');
const { fireEvent } = require('../utils/activity');

// Mirrors the legacy map (kept in one place: the migration seeds it into the
// legacy template's step conditions; the engine reads it from there).
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

// Source-record status sync after final approval / rejection (moved verbatim
// from approvals.js so the engine owns the whole transition).
const APPROVED_STATUS = {
  purchase_orders: ['purchase_orders', 'approved'],
  grn: ['goods_receipt_notes', 'approved'],
  payroll: ['payroll_periods', 'approved'],
  expenses: ['expenses', 'approved'],
  legal: ['legal_documents', 'verified'],
  project_budgets: ['project_budgets', 'approved'],
  sub_contracts: ['sub_contracts', 'active'],
};

const REJECTED_STATUS = {
  purchase_orders: ['purchase_orders', 'rejected'],
  grn: ['goods_receipt_notes', 'rejected'],
  payroll: ['payroll_periods', 'rejected'],
  expenses: ['expenses', 'rejected'],
  legal: ['legal_documents', 'rejected'],
  project_budgets: ['project_budgets', 'rejected'],
  sub_contracts: ['sub_contracts', 'terminated'],
};

const PRIVILEGED_ROLES = ['owner', 'admin'];

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function str(v) {
  return v == null || v === '' ? null : String(v);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseJson(v) {
  if (v == null) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return {}; }
}

async function loadTemplate(client, templateKey) {
  const r = await client.query('SELECT * FROM workflow_templates WHERE key = $1 AND is_active = true', [templateKey]);
  if (!r.rows[0]) throw new Error(`Workflow template not found: ${templateKey}`);
  return r.rows[0];
}

async function loadSteps(client, templateId) {
  const r = await client.query(
    'SELECT id, step_key, name, sort_order, mode, resolver_type, resolver_value, amount_threshold, conditions, sla_hours, is_terminal FROM workflow_steps WHERE template_id = $1 ORDER BY sort_order, id',
    [templateId]
  );
  return r.rows;
}

// A step is skipped at start when its conditions say so for this entity/module
// (e.g. DIRECT_TO_OWNER modules skip the manager_review stage).
function stepApplicable(step, context) {
  const conditions = parseJson(step.conditions);
  const moduleName = context && context.module_name;
  if (conditions.skip_if_module && moduleName && Array.isArray(conditions.skip_if_module)) {
    if (conditions.skip_if_module.includes(moduleName)) return false;
  }
  return true;
}

function resolveAssignedRole(step, context) {
  const conditions = parseJson(step.conditions);
  const moduleName = context && context.module_name;
  if (step.resolver_type === 'module_manager' && moduleName && conditions.module_roles) {
    const roles = conditions.module_roles[moduleName] || [];
    return roles[0] || null;
  }
  if (step.resolver_type === 'role') return step.resolver_value || null;
  if (step.resolver_type === 'organization_type') return step.resolver_value || null;
  return null;
}

function resolveAssignedUser(step, context) {
  // A system-raised request (the replenishment sweep) has no requester: the step is not assigned to anyone.
  if (step.resolver_type === 'requester') return context && context.requester_id != null ? num(context.requester_id) : null;
  if (step.resolver_type === 'user') return num(step.resolver_value);
  return null;
}

// Who may decide at this step: privileged roles bypass everything; otherwise
// the step's resolver decides (role list, module-manager map, org type).
function allowedRolesFor(step, context) {
  const conditions = parseJson(step.conditions);
  if (Array.isArray(conditions.allow_roles)) return conditions.allow_roles;
  if (step.resolver_type === 'module_manager' && context && context.module_name) {
    return (conditions.module_roles && conditions.module_roles[context.module_name]) || [];
  }
  if (step.resolver_type === 'role') return [step.resolver_value].filter(Boolean);
  if (step.resolver_type === 'organization_type') return [step.resolver_value].filter(Boolean);
  return [];
}

async function loadInstance(client, instanceId) {
  const r = await client.query('SELECT * FROM workflow_instances WHERE id = $1', [instanceId]);
  return r.rows[0] || null;
}

async function loadStepInstances(client, instanceId) {
  const r = await client.query(
    'SELECT * FROM workflow_step_instances WHERE instance_id = $1 ORDER BY id',
    [instanceId]
  );
  return r.rows;
}

async function recordAction(client, { instance, step, userId, userName, role, decision, comment }) {
  await client.query(
    `INSERT INTO workflow_actions (instance_id, step_instance_id, step_key, user_id, user_name, user_role, decision, comment)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      instance.id,
      step ? step.id : null,
      step ? step.step_key : null,
      userId == null ? null : userId,
      userName || null,
      role || null,
      decision,
      comment || null,
    ]
  );
}

// ---------------------------------------------------------------------------
// startWorkflow
// ---------------------------------------------------------------------------

async function startWorkflow(templateKey, entityType, entityId, context, opts = {}) {
  const client = opts.client || { query: opts.query || defaultQuery };
  const template = await loadTemplate(client, templateKey);
  const steps = await loadSteps(client, template.id);

  const ctx = context || {};
  const applicable = steps.filter((s) => stepApplicable(s, ctx));
  if (applicable.length === 0) throw new Error('Template has no applicable steps');

  const first = applicable[0];
  const inst = await client.query(
    `INSERT INTO workflow_instances (template_id, template_key, entity_type, entity_id, project_id, context, current_step_key, status, requester_id, legacy_approval_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9) RETURNING id`,
    [
      template.id, template.key, str(entityType), num(entityId),
      ctx.project_id == null ? null : num(ctx.project_id),
      JSON.stringify(ctx),
      first.step_key,
      ctx.requester_id == null ? null : num(ctx.requester_id),
      ctx.legacy_approval_id == null ? null : num(ctx.legacy_approval_id),
    ]
  );
  const instanceId = inst.rows[0].id;

  for (const step of steps) {
    const isFirstStep = step.step_key === first.step_key;
    const wasSkipped = !applicable.some((s) => s.step_key === step.step_key);
    await client.query(
      `INSERT INTO workflow_step_instances (instance_id, step_id, step_key, name, mode, status, assigned_role, assigned_user_id, opened_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        instanceId, step.id, step.step_key, step.name,
        step.mode || 'sequential',
        wasSkipped ? 'skipped' : (isFirstStep ? 'pending' : 'waiting'),
        resolveAssignedRole(step, ctx),
        resolveAssignedUser(step, ctx),
        isFirstStep ? new Date() : null,
      ]
    );
  }

  // Phase 7: the pending first step is actionable → matching action item.
  const firstStepInstance = (await loadStepInstances(client, instanceId)).find((s) => s.status === 'pending');
  const instanceRow = await loadInstance(client, instanceId);
  if (firstStepInstance && instanceRow) {
    const templateStep = steps.find((s) => s.step_key === firstStepInstance.step_key);
    await actionService.createForWorkflowStep(instanceRow, firstStepInstance, templateStep, { client });
  }

  return getInstance(client, instanceId);
}

// Final decision → durable module event. `purchase_orders` publishes under
// the catalog name; every other module emits `${module}.${outcome}`. Later
// phases add routes to the dispatcher for the ones they care about.
async function emitModuleEvent(client, instance, outcome, actor) {
  try {
    const context = parseJson(instance.context);
    const moduleName = context.module_name || instance.entity_type;
    if (!moduleName) return;
    const eventType = moduleName === 'purchase_orders' ? `purchase_requisition.${outcome}` : `${moduleName}.${outcome}`;
    await fireEvent({
      eventType,
      entityType: moduleName,
      entityId: instance.entity_id,
      userId: actor.userId, userName: actor.userName, userRole: actor.role,
      payload: { requester_id: instance.requester_id, module_name: moduleName, request_type: context.request_type },
    }, { query: client.query });
  } catch (e) {
    console.error('[WORKFLOW] event emission failed:', e.message);
  }
}

// The current step is the first applicable step that is not yet terminal-done.
// A step is "current" if it is the first applicable one — later steps wait.
function isCurrent(step, allSteps, applicable) {
  return applicable.length > 0 && applicable[0].step_key === step.step_key;
}

async function getInstance(client, instanceId) {
  const instance = await loadInstance(client, instanceId);
  if (!instance) return null;
  const steps = await loadStepInstances(client, instanceId);
  const actions = await client.query(
    'SELECT * FROM workflow_actions WHERE instance_id = $1 ORDER BY id',
    [instanceId]
  );
  return { instance, steps: steps, actions: actions.rows };
}

// Sync a domain state machine that has richer branch/reopen semantics than the
// generic approve/reject runner. Authorization and transition validation stay
// in the domain service; this function keeps the Phase 6 instance, step state,
// and append-only action log authoritative for audit and reporting.
async function syncExternalState(instanceId, stepKey, actor, opts = {}) {
  const client = opts.client || { query: opts.query || defaultQuery };
  const instance = await loadInstance(client, instanceId);
  if (!instance) throw new Error('Workflow instance not found');
  const definitions = await loadSteps(client, instance.template_id);
  const definition = definitions.find((s) => s.step_key === stepKey);
  if (!definition) throw new Error(`Workflow step not found: ${stepKey}`);
  const instances = await loadStepInstances(client, instanceId);
  const target = instances.find((s) => s.step_key === stepKey);
  if (!target) throw new Error(`Workflow step instance not found: ${stepKey}`);
  const now = new Date();
  const terminal = opts.terminal === true;
  await client.query(
    `UPDATE workflow_step_instances
     SET status = $1, assigned_user_id = $2, opened_at = $3, completed_at = $4
     WHERE id = $5`,
    [opts.rejected ? 'rejected' : 'done', actor.userId, target.opened_at || now, now, target.id]
  );
  await client.query(
    `UPDATE workflow_instances SET current_step_key = $1, status = $2, updated_at = $3 WHERE id = $4`,
    [terminal ? null : stepKey, terminal ? 'approved' : 'active', now, instanceId]
  );
  await recordAction(client, {
    instance, step: target, userId: actor.userId, userName: actor.userName,
    role: actor.role, decision: opts.decision || (opts.rejected ? 'reject' : 'advance'),
    comment: opts.comment || null,
  });
  await actionService.closeForWorkflowStep(instanceId, target.id, opts.rejected ? 'rejected' : 'completed', { client });
  return getInstance(client, instanceId);
}

// ---------------------------------------------------------------------------
// recordDecision
// ---------------------------------------------------------------------------

async function recordDecision(instanceId, stepId, userId, decision, comment, opts = {}) {
  const client = opts.client || { query: opts.query || defaultQuery };
  const role = opts.role || null;
  const userName = opts.userName || null;
  // A system actor (the replenishment sweep) may complete the requester's own steps and nothing else.
  const system = opts.system === true;

  const instance = await loadInstance(client, instanceId);
  if (!instance) return { ok: false, ...err(404, 'Workflow instance not found') };

  if (instance.status !== 'active') {
    return { ok: false, statusCode: 400, error: 'Request already processed' };
  }

  // Self-approval guard — ported verbatim from the legacy control
  // (approvals.js: requester_id === userId && role not owner/admin → 403).
  if (!system && instance.requester_id != null && num(instance.requester_id) === num(userId)
      && role !== 'owner' && role !== 'admin') {
    return { ok: false, statusCode: 403, error: 'You cannot approve or reject your own request' };
  }

  const stepInstances = await loadStepInstances(client, instanceId);
  let current = stepInstances.find((s) => s.step_key === instance.current_step_key && s.status === 'pending');
  if (!current) {
    return { ok: false, statusCode: 400, error: 'No pending step on this workflow instance' };
  }
  if (stepId != null && num(stepId) !== num(current.id)) {
    return { ok: false, statusCode: 400, error: 'Decision does not target the current step' };
  }

  const steps = await loadSteps(client, instance.template_id);
  const templateStep = steps.find((s) => s.step_key === current.step_key);
  const context = parseJson(instance.context);

  // Authorization — mirrors the legacy stage checks (module manager map at the
  // manager stage; owner/admin only at the owner stage; privileged bypass).
  const allowed = role === 'owner' || role === 'admin' ||
    (system && templateStep && templateStep.resolver_type === 'requester') ||
    allowedRolesFor(templateStep, context).includes(role);

  if (!allowed) {
    const message = templateStep && templateStep.step_key === 'manager_review'
      ? (decision === 'reject' ? 'Not authorized to reject this module at manager stage' : 'Not authorized to approve this module at manager stage')
      : `Only owner or admin can ${decision} at this stage`;
    return { ok: false, statusCode: 403, error: message };
  }

  const amount = context.amount != null ? num(context.amount) : null;
  if (templateStep && templateStep.amount_threshold != null && amount != null && amount > Number(templateStep.amount_threshold)) {
    return { ok: false, statusCode: 403, error: 'Amount exceeds the authority threshold for this step' };
  }

  const now = new Date();

  if (decision === 'approve') {
    await client.query(
      `UPDATE workflow_step_instances SET status = 'done', assigned_user_id = $1, completed_at = $2 WHERE id = $3`,
      [userId, now, current.id]
    );
    const applicable = steps.filter((s) => stepApplicable(s, context));
    const doneKeys = new Set([...stepInstances.filter((s) => s.status === 'done').map((s) => s.step_key), current.step_key]);
    const next = applicable.find((s) => !doneKeys.has(s.step_key));
    if (next) {
      await client.query(
        `UPDATE workflow_instances SET current_step_key = $1, updated_at = $2 WHERE id = $3`,
        [next.step_key, now, instanceId]
      );
      await client.query(
        `UPDATE workflow_step_instances SET status = 'pending', assigned_role = $1, assigned_user_id = $5, opened_at = $4 WHERE instance_id = $2 AND step_key = $3`,
        [resolveAssignedRole(next, context), instanceId, next.step_key, now, resolveAssignedUser(next, context)]
      );
    } else {
      await client.query(
        `UPDATE workflow_instances SET status = 'approved', current_step_key = $3, updated_at = $2 WHERE id = $1`,
        [instanceId, now, null]
      );
      await applySourceStatus(client, instance, 'approved');
    }
    await recordAction(client, { instance, step: current, userId, userName, role, decision: 'approve', comment });
    // Phase 7: action items — close the decided step's, open the next step's.
    await actionService.closeForWorkflowStep(instanceId, current.id, 'completed', { client });
    if (next) {
      const nextStepInstance = (await loadStepInstances(client, instanceId)).find((s) => s.step_key === next.step_key);
      const instanceRow = await loadInstance(client, instanceId);
      await actionService.createForWorkflowStep(instanceRow, nextStepInstance, next, { client });
    } else {
      await emitModuleEvent(client, instance, 'approved', { userId, userName, role });
    }
    const fresh = await getInstance(client, instanceId);
    return {
      ok: true,
      statusCode: 200,
      outcome: next ? 'forwarded' : 'approved',
      stage: next ? next.step_key : 'fully_approved',
      workflow: fresh,
    };
  }

  if (decision === 'reject') {
    await client.query(
      `UPDATE workflow_step_instances SET status = 'rejected', assigned_user_id = $1, completed_at = $2 WHERE id = $3`,
      [userId, now, current.id]
    );
    await client.query(
      `UPDATE workflow_instances SET status = 'rejected', current_step_key = $3, updated_at = $2 WHERE id = $1`,
      [instanceId, now, null]
    );
    await applySourceStatus(client, instance, 'rejected');
    await recordAction(client, { instance, step: current, userId, userName, role, decision: 'reject', comment });
    await actionService.closeForWorkflowStep(instanceId, current.id, 'rejected', { client });
    await emitModuleEvent(client, instance, 'rejected', { userId, userName, role });
    const fresh = await getInstance(client, instanceId);
    return { ok: true, statusCode: 200, outcome: 'rejected', stage: null, workflow: fresh };
  }

  if (decision === 'return') {
    // Rework loop: hand the instance back to the previous applicable step.
    const applicable = steps.filter((s) => stepApplicable(s, context));
    const idx = applicable.findIndex((s) => s.step_key === current.step_key);
    const previous = idx > 0 ? applicable[idx - 1] : null;
    if (!previous) return { ok: false, statusCode: 400, error: 'No previous step to return to' };
    await client.query(
      `UPDATE workflow_step_instances SET status = 'waiting', completed_at = $3 WHERE instance_id = $1 AND step_key = $2`,
      [instanceId, current.step_key, null]
    );
    await client.query(
      `UPDATE workflow_instances SET current_step_key = $1, updated_at = $2 WHERE id = $3`,
      [previous.step_key, now, instanceId]
    );
    await client.query(
      `UPDATE workflow_step_instances SET status = 'pending', assigned_role = $1, assigned_user_id = $6, opened_at = $4, completed_at = $5 WHERE instance_id = $2 AND step_key = $3`,
      [resolveAssignedRole(previous, context), instanceId, previous.step_key, now, null, resolveAssignedUser(previous, context)]
    );
    await recordAction(client, { instance, step: current, userId, userName, role, decision: 'return', comment });
    // Phase 7: rework loop — close the returned step's item, raise one for the
    // re-opened previous step.
    await actionService.closeForWorkflowStep(instanceId, current.id, 'completed', { client });
    const prevStepInstance = (await loadStepInstances(client, instanceId)).find((s) => s.step_key === previous.step_key);
    const instanceRow = await loadInstance(client, instanceId);
    if (prevStepInstance && instanceRow) {
      await actionService.createForWorkflowStep(instanceRow, prevStepInstance, previous, { client });
    }
    const fresh = await getInstance(client, instanceId);
    return { ok: true, statusCode: 200, outcome: 'returned', stage: previous.step_key, workflow: fresh };
  }

  if (decision === 'reassign') {
    const target = num(opts.reassignToUserId);
    if (target == null) {
      return { ok: false, statusCode: 400, error: 'reassign requires reassignToUserId' };
    }
    await client.query(
      'UPDATE workflow_step_instances SET assigned_user_id = $1 WHERE id = $2',
      [target, current.id]
    );
    // Phase 7: keep the step's action item pointing at the new assignee.
    await client.query(
      `UPDATE action_items SET assigned_user_id = $1, assigned_role = NULL, acknowledged_at = NULL, updated_at = $2
       WHERE workflow_step_instance_id = $3 AND status IN ('open','in_progress')`,
      [target, now, current.id]
    );
    await recordAction(client, { instance, step: current, userId, userName, role, decision: 'reassign', comment });
    const fresh = await getInstance(client, instanceId);
    return { ok: true, statusCode: 200, outcome: 'reassigned', stage: current.step_key, workflow: fresh };
  }

  return { ok: false, statusCode: 400, error: `Unknown decision: ${decision}` };
}

// ---------------------------------------------------------------------------
// getPendingFor
// ---------------------------------------------------------------------------

async function getPendingFor(userId, opts = {}) {
  const client = opts.client || { query: opts.query || defaultQuery };
  const role = opts.role || null;
  const userRes = await client.query('SELECT role FROM users WHERE id = $1', [userId]);
  const legacyRole = userRes.rows[0] ? userRes.rows[0].role : null;
  const upr = await client.query(
    'SELECT r.key AS role_key FROM user_project_roles upr LEFT JOIN roles r ON r.id = upr.role_id WHERE upr.user_id = $1',
    [userId]
  );
  const roleSet = new Set();
  if (legacyRole) roleSet.add(legacyRole);
  for (const r of upr.rows) if (r.role_key) roleSet.add(r.role_key);

  const active = await client.query(
    "SELECT * FROM workflow_instances WHERE status = 'active' ORDER BY updated_at DESC"
  );
  const pending = [];
  for (const instance of active.rows) {
    const stepInstances = await loadStepInstances(client, instance.id);
    const current = stepInstances.find((s) => s.step_key === instance.current_step_key && s.status === 'pending');
    if (!current) continue;
    const isPrivileged = role === 'owner' || role === 'admin';
    const roleMatch = current.assigned_role != null && roleSet.has(current.assigned_role);
    const userMatch = current.assigned_user_id != null && num(current.assigned_user_id) === num(userId);
    const isRequester = instance.requester_id != null && num(instance.requester_id) === num(userId);
    // Requester visibility: they see their own instances read-only.
    if (isPrivileged || roleMatch || userMatch || isRequester) {
      pending.push({ instance, step: current, can_decide: isPrivileged || roleMatch || userMatch });
    }
  }
  return pending;
}

async function applySourceStatus(client, instance, outcome) {
  const context = parseJson(instance.context);
  const moduleName = context.module_name;
  const map = outcome === 'approved' ? APPROVED_STATUS : REJECTED_STATUS;
  const entry = map[moduleName];
  if (!entry) return;
  const [table, status] = entry;
  await client.query(`UPDATE ${table} SET status = $1 WHERE id = $2`, [status, instance.entity_id]);
}

// ---------------------------------------------------------------------------
// Legacy migration — every approval_requests row gets a workflow_instances row
// whose state exactly mirrors the legacy stage/status.
// ---------------------------------------------------------------------------

async function migrateLegacyApprovals(client) {
  const rows = await client.query('SELECT * FROM approval_requests ORDER BY id');
  let migrated = 0;
  for (const ar of rows.rows) {
    const existing = await client.query(
      'SELECT id FROM workflow_instances WHERE legacy_approval_id = $1',
      [ar.id]
    );
    if (existing.rows.length > 0) continue;

    const context = {
      module_name: ar.module_name,
      request_type: ar.request_type,
      request_id: ar.request_id,
      notes: ar.notes || null,
      legacy: true,
    };
    const template = await loadTemplate(client, 'legacy_module_approval');
    const inst = await client.query(
      `INSERT INTO workflow_instances (template_id, template_key, entity_type, entity_id, context, current_step_key, status, requester_id, legacy_approval_id, created_at, updated_at)
       VALUES ($1, 'legacy_module_approval', $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        template.id,
        ar.module_name, ar.request_id, JSON.stringify(context),
        ar.status === 'pending' ? ar.stage : null,
        ar.status === 'pending' ? 'active' : ar.status,
        ar.requester_id,
        ar.id,
        ar.created_at,
        ar.updated_at,
      ]
    );
    const instanceId = inst.rows[0].id;

    // Step instances mirror the legacy stage state.
    const directToOwner = DIRECT_TO_OWNER_MODULES.includes(ar.module_name);
    const steps = await loadSteps(client, template.id);
    for (const step of steps) {
      const isManager = step.step_key === 'manager_review';
      let status;
      let assignedUser = null;
      let openedAt = null;
      let completedAt = null;
      if (isManager) {
        if (directToOwner) {
          status = 'skipped';
        } else if (ar.stage === 'owner_review' || (ar.status !== 'pending' && ar.manager_approved_at)) {
          status = 'done';
          assignedUser = ar.manager_id;
          completedAt = ar.manager_approved_at;
        } else if (ar.status === 'pending') {
          status = 'pending';
          openedAt = ar.created_at;
        } else if (ar.status === 'rejected' && !ar.manager_approved_at) {
          status = 'rejected';
          completedAt = ar.updated_at;
        } else {
          status = 'skipped';
        }
      } else {
        // owner_review
        if (ar.status === 'approved') {
          status = 'done';
          assignedUser = ar.approver_id;
          completedAt = ar.updated_at;
        } else if (ar.status === 'rejected' && (directToOwner || ar.manager_approved_at)) {
          status = 'rejected';
          assignedUser = ar.approver_id;
          completedAt = ar.updated_at;
        } else if (ar.status === 'pending' && ar.stage === 'owner_review') {
          status = 'pending';
          openedAt = ar.manager_approved_at || ar.created_at;
        } else {
          status = 'waiting';
        }
      }
      await client.query(
        `INSERT INTO workflow_step_instances (instance_id, step_id, step_key, name, mode, status, assigned_role, assigned_user_id, opened_at, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          instanceId, step.id, step.step_key, step.name, step.mode || 'sequential',
          status, isManager ? (MODULE_MANAGER_ROLES[ar.module_name] || [])[0] || null : 'owner',
          assignedUser == null ? null : num(assignedUser),
          openedAt, completedAt,
        ]
      );
    }

    // Decision-log entries for what already happened.
    if (ar.manager_id && ar.manager_approved_at) {
      await client.query(
        `INSERT INTO workflow_actions (instance_id, step_key, user_id, decision, comment, created_at)
         VALUES ($1, 'manager_review', $2, 'approve', $3, $4)`,
        [instanceId, num(ar.manager_id), ar.manager_notes || null, ar.manager_approved_at]
      );
    }
    if (ar.status === 'approved' && ar.approver_id) {
      await client.query(
        `INSERT INTO workflow_actions (instance_id, step_key, user_id, decision, comment, created_at)
         VALUES ($1, 'owner_review', $2, 'approve', $3, $4)`,
        [instanceId, num(ar.approver_id), ar.notes || null, ar.updated_at]
      );
    } else if (ar.status === 'rejected' && ar.approver_id && (directToOwner || ar.manager_approved_at)) {
      await client.query(
        `INSERT INTO workflow_actions (instance_id, step_key, user_id, decision, comment, created_at)
         VALUES ($1, 'owner_review', $2, 'reject', $3, $4)`,
        [instanceId, num(ar.approver_id), ar.notes || null, ar.updated_at]
      );
    }
    migrated++;

    // Phase 7: active legacy instances get an action item for the pending
    // step, so the My Actions screen covers pre-engine rows too.
    if (ar.status === 'pending') {
      try {
        const instanceRow = await loadInstance(client, instanceId);
        const pendingStep = (await loadStepInstances(client, instanceId)).find((s) => s.status === 'pending');
        if (instanceRow && pendingStep) {
          const templateStep = steps.find((s) => s.step_key === pendingStep.step_key);
          await actionService.createForWorkflowStep(instanceRow, pendingStep, templateStep, { client });
        }
      } catch (e) {
        console.error('[WORKFLOW] legacy action item creation failed:', e.message);
      }
    }
  }
  return migrated;
}

// Parity verifier — the definition of done, checked by script: every
// approval_requests row has a matching workflow_instances row whose current
// step/approver matches what the legacy stage logic would compute.
function expectedLegacyStep(ar) {
  if (ar.status === 'pending') {
    if (ar.stage === 'manager_review') {
      const roles = MODULE_MANAGER_ROLES[ar.module_name] || [];
      return { step_key: 'manager_review', assigned_role: roles[0] || null, status: 'active' };
    }
    return { step_key: 'owner_review', assigned_role: 'owner', status: 'active' };
  }
  return { step_key: null, assigned_role: null, status: ar.status };
}

async function verifyApprovalParity(query) {
  const legacy = await query('SELECT * FROM approval_requests ORDER BY id');
  const mismatches = [];
  let checked = 0;
  for (const ar of legacy.rows) {
    checked++;
    const instRes = await query('SELECT * FROM workflow_instances WHERE legacy_approval_id = $1', [ar.id]);
    if (instRes.rows.length === 0) {
      mismatches.push({ legacy_id: ar.id, problem: 'no workflow_instance' });
      continue;
    }
    const instance = instRes.rows[0];
    const expected = expectedLegacyStep(ar);
    if (instance.status !== expected.status) {
      mismatches.push({ legacy_id: ar.id, problem: `status ${instance.status} != ${expected.status}` });
      continue;
    }
    if (expected.status === 'active') {
      if (instance.current_step_key !== expected.step_key) {
        mismatches.push({ legacy_id: ar.id, problem: `current step ${instance.current_step_key} != ${expected.step_key}` });
        continue;
      }
      const stepRes = await query(
        "SELECT * FROM workflow_step_instances WHERE instance_id = $1 AND step_key = $2 AND status = 'pending'",
        [instance.id, expected.step_key]
      );
      const gotRole = stepRes.rows[0] ? stepRes.rows[0].assigned_role : null;
      if (gotRole !== expected.assigned_role) {
        mismatches.push({ legacy_id: ar.id, problem: `assigned_role ${gotRole} != ${expected.assigned_role}` });
      }
    }
  }
  return { checked, mismatches };
}

// ---------------------------------------------------------------------------
// Legacy route adapter — the approvals route delegates here. Reproduces the
// old advanceApproval contract exactly: same status codes, same body shapes,
// same log messages; the stage logic itself now runs through the engine and
// approval_requests is dual-written while the parity window is open.
// ---------------------------------------------------------------------------

async function recordLegacyDecision({ approvalId, userId, userName, role, notes, action }, opts = {}) {
  const client = opts.client || { query: opts.query || defaultQuery };
  const logFn = opts.logActivity || null;

  // Row lock: concurrent decisions on one request queue here (the caller runs this in a transaction), and the
  // loser sees the winner's status and is refused as already processed.
  const pending = await client.query('SELECT * FROM approval_requests WHERE id = $1 FOR UPDATE', [approvalId]);
  if (pending.rows.length === 0) {
    return { statusCode: 404, body: { success: false, error: 'Request not found' } };
  }
  const ar = pending.rows[0];

  if (ar.status !== 'pending') {
    return { statusCode: 400, body: { success: false, error: 'Request already processed' } };
  }

  if (ar.requester_id === userId && role !== 'owner' && role !== 'admin') {
    return { statusCode: 403, body: { success: false, error: 'You cannot approve or reject your own request' } };
  }

  // The engine owns the state transition. The instance exists for every
  // legacy row (migrateLegacyApprovals), but auto-heal if it is missing.
  let instRes = await client.query('SELECT * FROM workflow_instances WHERE legacy_approval_id = $1', [ar.id]);
  if (instRes.rows.length === 0) {
    await migrateLegacyApprovals(client);
    instRes = await client.query('SELECT * FROM workflow_instances WHERE legacy_approval_id = $1', [ar.id]);
  }
  const instance = instRes.rows[0];
  if (!instance) {
    return { statusCode: 500, body: { success: false, error: 'Workflow instance unavailable' } };
  }

  const result = await recordDecision(instance.id, null, userId, action, notes || null, {
    client,
    role,
    userName,
  });

  if (!result.ok) {
    return { statusCode: result.statusCode, body: { success: false, error: result.error } };
  }

  // Dual-write approval_requests to keep the legacy API response identical.
  // (Timestamps are bound params — portable across pg and the mock executor;
  // rows are read back explicitly since mock UPDATEs ignore RETURNING.)
  const now = new Date();
  let updated;
  if (action === 'approve') {
    if (result.outcome === 'forwarded') {
      await client.query(
        `UPDATE approval_requests
         SET stage = 'owner_review', manager_id = $1, manager_approved_at = $4, manager_notes = $2, updated_at = $4
         WHERE id = $3`,
        [userId, notes || null, approvalId, now]
      );
      const back = await client.query('SELECT * FROM approval_requests WHERE id = $1', [approvalId]);
      updated = back.rows[0];
      if (logFn) {
        await logFn({
          userId, userName, userRole: role, action: 'approve', module: ar.module_name,
          description: `Manager approved ${ar.request_type} #${ar.request_id} — forwarded to owner`,
          entityId: approvalId, entityType: 'approval_request'
        });
      }
      return { statusCode: 200, body: { success: true, stage: 'forwarded_to_owner', request: updated } };
    }
    // fully approved
    await client.query(
      `UPDATE approval_requests
       SET status = 'approved', approver_id = $1, notes = $2, updated_at = $4
       WHERE id = $3`,
      [userId, notes || ar.notes || null, approvalId, now]
    );
    const back = await client.query('SELECT * FROM approval_requests WHERE id = $1', [approvalId]);
    updated = back.rows[0];
    if (logFn) {
      await logFn({
        userId, userName, userRole: role, action: 'approve', module: ar.module_name,
        description: `Owner approved ${ar.request_type} #${ar.request_id}`,
        entityId: approvalId, entityType: 'approval_request'
      });
    }
    return { statusCode: 200, body: { success: true, stage: 'fully_approved', request: updated } };
  }

  // action === 'reject'
  await client.query(
    `UPDATE approval_requests
     SET status = 'rejected', approver_id = $1, notes = $2, updated_at = $4
     WHERE id = $3`,
    [userId, notes || ar.notes || null, approvalId, now]
  );
  const back = await client.query('SELECT * FROM approval_requests WHERE id = $1', [approvalId]);
  updated = back.rows[0];
  if (logFn) {
    await logFn({
      userId, userName, userRole: role, action: 'reject', module: ar.module_name,
      description: `Rejected ${ar.request_type} #${ar.request_id} at ${ar.stage} stage`,
      entityId: approvalId, entityType: 'approval_request'
    });
  }
  return { statusCode: 200, body: { success: true, request: updated } };
}

// Phase 3 (open item): cancel a stale workflow. The instance and its open steps stop; nothing is deleted.
// Used by the approvals cancel route (and by scripts/cancel-stale-approvals.js --cancel). Runs on the
// caller's query function; the caller audits the decision itself.
async function cancelWorkflowInstance(q, instanceId, { userId = null, reason = null } = {}) {
  const claimed = (await q(
    `UPDATE workflow_instances
        SET status = 'cancelled', updated_at = now()
      WHERE id = $1 AND status = 'active' RETURNING id`,
    [instanceId]
  )).rows[0];
  if (!claimed) return null; // already finished/cancelled: nothing to do, no error
  await q(
    `UPDATE workflow_step_instances
        SET status = 'cancelled', completed_at = now()
      WHERE instance_id = $1 AND status = 'pending'`,
    [instanceId]
  );
  // The workflow's open action items close too, so nobody is asked to act on a cancelled workflow.
  const steps = (await q('SELECT id FROM workflow_step_instances WHERE instance_id = $1', [instanceId])).rows;
  for (const step of steps) {
    await actionService.closeForWorkflowStep(instanceId, step.id, 'cancelled', { query: q });
  }
  void userId; void reason; // carried by the audit log on the caller (approvals route), not duplicated here
  return claimed.id;
}

module.exports = {
  MODULE_MANAGER_ROLES,
  DIRECT_TO_OWNER_MODULES,
  APPROVED_STATUS,
  REJECTED_STATUS,
  startWorkflow,
  recordDecision,
  recordLegacyDecision,
  getPendingFor,
  migrateLegacyApprovals,
  expectedLegacyStep,
  verifyApprovalParity,
  stepApplicable,
  resolveAssignedRole,
  resolveAssignedUser,
  allowedRolesFor,
  loadTemplate,
  loadSteps,
  loadInstance,
  loadStepInstances,
  syncExternalState,
  // Phase 3 (open item): non-destructive cancellation of a stale workflow.
  cancelWorkflowInstance,
};
