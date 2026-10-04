// Phase 7 — universal action items.
//
// One polymorphic to-do row per actionable thing: workflow steps (Phase 6),
// observations, NCRs, punch items, requisitions... anything that later phases
// raise via the event dispatcher or directly.
//
// Buckets for the "My Actions" screen (computed here, rendered 1:1):
//   overdue            — open/in_progress with due_date in the past
//   due_today          — due_date is today
//   due_soon           — due within the next 7 days
//   awaiting_me        — open items explicitly assigned to the user (incl.
//                        role-assigned items whose role the user holds)
//   delegated          — items this user delegated to someone else
//   recently_completed — items the user completed in the last 14 days
//
// Visibility: a user sees items assigned to them, items assigned to a role
// they hold, and items they delegated away.

'use strict';

const { query: defaultQuery } = require('../config/database');
const notificationService = require('./notificationService');

const OPEN_STATUSES = ['open', 'in_progress'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

function parseJson(v) {
  if (v == null) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return {}; }
}

function toDate(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// Reminder policy resolution — reminder_rules rows scoped by applies_to
// (source_type or '*').
// ---------------------------------------------------------------------------

async function resolveReminderPolicy(client, sourceType) {
  const rules = await client.query('SELECT * FROM reminder_rules WHERE is_active = true ORDER BY id');
  const rows = rules.rows || [];
  const specific = rows.find((r) => r.applies_to === sourceType);
  const wildcard = rows.find((r) => r.applies_to === '*');
  const rule = specific || wildcard;
  if (!rule) return {};
  return {
    rule_id: rule.id,
    remind_after_hours: rule.remind_after_hours,
    repeat_interval_hours: rule.repeat_interval_hours,
    max_reminders: rule.max_reminders,
  };
}

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

async function createActionItem(input, opts = {}) {
  const client = opts.client || { query: opts.query || defaultQuery };
  const notifyFlag = opts.notify !== false;

  if (!input.title || !String(input.title).trim()) {
    throw new Error('Action item requires a title');
  }
  if (input.priority && !PRIORITIES.includes(input.priority)) {
    throw new Error(`Invalid priority: ${input.priority}`);
  }
  if (input.assigned_user_id == null && input.assigned_role == null) {
    throw new Error('Action item requires assigned_user_id or assigned_role');
  }

  const reminderPolicy = input.reminder_policy || await resolveReminderPolicy(client, input.source_type || '*');
  const escalationPolicy = input.escalation_policy || {};

  const res = await client.query(
    `INSERT INTO action_items
       (source_type, source_id, project_id, location_id, title, description,
        assigned_user_id, assigned_role, assigned_organization_id, priority, due_date,
        status, reminder_policy, escalation_policy, created_by,
        workflow_instance_id, workflow_step_instance_id, event_log_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'open',$12,$13,$14,$15,$16,$17) RETURNING *`,
    [
      input.source_type || 'manual',
      input.source_id == null ? null : input.source_id,
      input.project_id == null ? null : input.project_id,
      input.location_id == null ? null : input.location_id,
      String(input.title).trim(),
      input.description || null,
      input.assigned_user_id == null ? null : input.assigned_user_id,
      input.assigned_role || null,
      input.assigned_organization_id == null ? null : input.assigned_organization_id,
      input.priority || 'medium',
      input.due_date || null,
      JSON.stringify(reminderPolicy),
      JSON.stringify(escalationPolicy),
      input.created_by == null ? null : input.created_by,
      input.workflow_instance_id == null ? null : input.workflow_instance_id,
      input.workflow_step_instance_id == null ? null : input.workflow_step_instance_id,
      input.event_log_id == null ? null : input.event_log_id,
    ]
  );
  const item = res.rows[0];

  // Immediate assignment notification (the first rung of the escalation
  // ladder). Best-effort: a broken notification channel never fails the
  // action item itself.
  if (notifyFlag && item.assigned_user_id != null) {
    try {
      await notificationService.notify({
        userId: item.assigned_user_id,
        title: `New action: ${item.title}`,
        body: input.description || (item.due_date ? `Due ${toDate(item.due_date).toISOString().slice(0, 10)}` : null),
        eventType: 'action.assigned',
        entityType: 'action_item',
        entityId: item.id,
        actionItemId: item.id,
      }, { client });
    } catch (e) {
      console.error('[ACTIONS] assignment notification failed:', e.message);
    }
  }

  return item;
}

// ---------------------------------------------------------------------------
// Workflow-engine integration
// ---------------------------------------------------------------------------

// A workflow step became actionable → matching action item. Steps assigned by
// role create a role-scoped item (every holder of the role sees it in
// "awaiting me"); steps with a concrete user create a user-scoped one.
async function createForWorkflowStep(instance, stepInstance, templateStep, opts = {}) {
  const client = opts.client || { query: opts.query || defaultQuery };
  if (!stepInstance || stepInstance.status !== 'pending') return null;
  // A requester step of a system-raised request (the replenishment sweep) has no person to act: the system completes it, so no action item.
  if (templateStep && templateStep.resolver_type === 'requester' && stepInstance.assigned_user_id == null) return null;

  let escalationPolicy = {};
  try {
    const esc = await client.query(
      'SELECT ack_remind_hours, overdue_escalate_hours, escalate_to_role FROM escalation_rules WHERE template_id = $1 AND step_key = $2',
      [instance.template_id, stepInstance.step_key]
    );
    if (esc.rows[0]) {
      escalationPolicy = {
        ack_remind_hours: esc.rows[0].ack_remind_hours != null ? Number(esc.rows[0].ack_remind_hours) : 4,
        overdue_escalate_hours: esc.rows[0].overdue_escalate_hours != null ? Number(esc.rows[0].overdue_escalate_hours) : 24,
        manager_roles: [esc.rows[0].escalate_to_role || 'admin'],
        top_roles: [esc.rows[0].escalate_to_role || 'admin', 'owner', 'admin'],
      };
    }
  } catch (e) { /* no escalation rule — defaults apply */ }

  let dueDate = null;
  const slaHours = templateStep && templateStep.sla_hours != null ? Number(templateStep.sla_hours) : null;
  if (slaHours) {
    dueDate = new Date(Date.now() + slaHours * 3600 * 1000);
  }

  return createActionItem({
    source_type: 'workflow_step',
    source_id: instance.entity_id,
    project_id: instance.project_id,
    title: `${stepInstance.name || stepInstance.step_key} — ${instance.template_key} #${instance.entity_id}`,
    description: null,
    assigned_user_id: stepInstance.assigned_user_id,
    assigned_role: stepInstance.assigned_role,
    priority: 'medium',
    due_date: dueDate,
    escalation_policy: escalationPolicy,
    created_by: instance.requester_id,
    workflow_instance_id: instance.id,
    workflow_step_instance_id: stepInstance.id,
  }, opts);
}

// The step was decided → close its action item.
async function closeForWorkflowStep(instanceId, stepInstanceId, outcomeStatus, opts = {}) {
  const client = opts.client || { query: opts.query || defaultQuery };
  // 'rejected' (and, from Phase 3.3/3.4-era cancellations, 'cancelled') close the item as cancelled;
  // every other outcome completes it.
  const status = outcomeStatus === 'rejected' || outcomeStatus === 'cancelled' ? 'cancelled' : 'completed';
  const res = await client.query(
    `UPDATE action_items SET status = $1, completed_at = $3, updated_at = $3
     WHERE workflow_instance_id = $2 AND workflow_step_instance_id = $4 AND status IN ('open','in_progress')`,
    [status, instanceId, new Date(), stepInstanceId]
  );
  return res.rowCount != null ? res.rowCount : 0;
}

// Anything still open for the source entity is closed (e.g. a workflow was
// rejected — its pending step items and any strays must not linger).
async function closeBySource(sourceType, sourceId, opts = {}) {
  const client = opts.client || { query: opts.query || defaultQuery };
  const status = opts.status || 'completed';
  const res = await client.query(
    `UPDATE action_items SET status = $1, completed_at = $4, updated_at = $4
     WHERE source_type = $2 AND source_id = $3 AND status IN ('open','in_progress')`,
    [status, sourceType, sourceId, new Date()]
  );
  return res.rowCount != null ? res.rowCount : 0;
}

// ---------------------------------------------------------------------------
// Lifecycle transitions
// ---------------------------------------------------------------------------

async function acknowledge(itemId, userId, opts = {}) {
  const client = opts.client || { query: opts.query || defaultQuery };
  const item = (await client.query('SELECT * FROM action_items WHERE id = $1', [itemId])).rows[0];
  if (!item) return { ok: false, statusCode: 404, error: 'Action item not found' };
  if (item.assigned_user_id != null && Number(item.assigned_user_id) !== Number(userId)) {
    return { ok: false, statusCode: 403, error: 'Only the assignee can acknowledge this action' };
  }
  await client.query(
    'UPDATE action_items SET acknowledged_at = $1, updated_at = $1 WHERE id = $2',
    [new Date(), itemId]
  );
  return { ok: true };
}

async function complete(itemId, userId, opts = {}) {
  const client = opts.client || { query: opts.query || defaultQuery };
  const item = (await client.query('SELECT * FROM action_items WHERE id = $1', [itemId])).rows[0];
  if (!item) return { ok: false, statusCode: 404, error: 'Action item not found' };
  if (item.status !== 'open' && item.status !== 'in_progress') {
    return { ok: false, statusCode: 400, error: 'Action item already closed' };
  }
  await client.query(
    `UPDATE action_items SET status = 'completed', completed_at = $1, completed_by = $2, updated_at = $1 WHERE id = $3`,
    [new Date(), userId, itemId]
  );
  return { ok: true, item };
}

async function delegate(itemId, userId, toUserId, opts = {}) {
  const client = opts.client || { query: opts.query || defaultQuery };
  const item = (await client.query('SELECT * FROM action_items WHERE id = $1', [itemId])).rows[0];
  if (!item) return { ok: false, statusCode: 404, error: 'Action item not found' };
  if (item.assigned_user_id != null && Number(item.assigned_user_id) !== Number(userId)) {
    return { ok: false, statusCode: 403, error: 'Only the assignee can delegate this action' };
  }
  const target = (await client.query('SELECT id, name, email, role FROM users WHERE id = $1', [toUserId])).rows[0];
  if (!target) return { ok: false, statusCode: 400, error: 'Delegate target user not found' };
  await client.query(
    `UPDATE action_items SET delegated_to_user_id = $1, delegated_at = $2, delegated_by_user_id = $3, acknowledged_at = NULL, updated_at = $2 WHERE id = $4`,
    [toUserId, new Date(), userId, itemId]
  );
  try {
    await notificationService.notify({
      userId: toUserId,
      title: `Delegated action: ${item.title}`,
      body: opts.comment || null,
      eventType: 'action.delegated',
      entityType: 'action_item',
      entityId: itemId,
      actionItemId: itemId,
    }, { client });
  } catch (e) { console.error('[ACTIONS] delegate notification failed:', e.message); }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// My Actions buckets
// ---------------------------------------------------------------------------

function inBuckets(item, now = new Date()) {
  const due = toDate(item.due_date);
  const endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999);
  const in7 = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  return {
    isOverdue: due != null && due < now,
    isDueToday: due != null && due >= now && due <= endOfToday,
    isDueSoon: due != null && due > endOfToday && due <= in7,
  };
}

function buildBuckets(items, userId, userRoles = [], now = new Date()) {
  const uid = Number(userId);
  const roleSet = new Set(userRoles.map(String));
  const buckets = { overdue: [], due_today: [], due_soon: [], awaiting_me: [], delegated: [], recently_completed: [] };
  const cutoff = new Date(now.getTime() - 14 * 24 * 3600 * 1000);

  for (const item of items) {
    const delegatedByMe = item.delegated_to_user_id != null
      && Number(item.delegated_by_user_id) === uid
      && Number(item.delegated_to_user_id) !== uid;
    const mine = (item.assigned_user_id != null && Number(item.assigned_user_id) === uid)
      || (item.delegated_to_user_id != null && Number(item.delegated_to_user_id) === uid)
      || (item.assigned_role != null && roleSet.has(String(item.assigned_role)));

    if (item.status === 'completed' || item.status === 'cancelled') {
      const completedAt = toDate(item.completed_at);
      if (item.status === 'completed' && completedAt && completedAt >= cutoff
          && (Number(item.completed_by) === uid || mine)) {
        buckets.recently_completed.push(item);
      }
      continue;
    }

    if (delegatedByMe) { buckets.delegated.push(item); continue; }
    if (!mine) continue;

    const flags = inBuckets(item, now);
    if (flags.isOverdue) { buckets.overdue.push(item); continue; }
    if (flags.isDueToday) { buckets.due_today.push(item); continue; }
    if (flags.isDueSoon) { buckets.due_soon.push(item); continue; }
    buckets.awaiting_me.push(item);
  }
  return buckets;
}

// ---------------------------------------------------------------------------
// listForUser — fetches the rows the user can see, then buckets in JS.
// ---------------------------------------------------------------------------

async function listForUser(userId, opts = {}) {
  const client = opts.client || { query: opts.query || defaultQuery };
  const now = opts.now || new Date();

  const userRes = await client.query('SELECT id, role FROM users WHERE id = $1', [userId]);
  const legacyRole = userRes.rows[0] ? userRes.rows[0].role : null;
  const upr = await client.query(
    'SELECT r.key AS role_key FROM user_project_roles upr LEFT JOIN roles r ON r.id = upr.role_id WHERE upr.user_id = $1',
    [userId]
  );
  const userRoles = [legacyRole, ...upr.rows.map((r) => r.role_key)].filter(Boolean);

  const mine = await client.query(
    'SELECT * FROM action_items WHERE assigned_user_id = $1 OR delegated_to_user_id = $1 OR delegated_by_user_id = $1 ORDER BY due_date ASC NULLS LAST, id DESC',
    [userId]
  );
  const roleItems = userRoles.length
    ? (await client.query('SELECT * FROM action_items WHERE assigned_role = ANY($1)', [userRoles])).rows
    : [];

  const seen = new Set();
  const items = [];
  for (const it of [...mine.rows, ...roleItems]) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    items.push(it);
  }

  const buckets = buildBuckets(items, userId, userRoles, now);
  return { buckets, total: items.length };
}

module.exports = {
  OPEN_STATUSES,
  PRIORITIES,
  resolveReminderPolicy,
  createActionItem,
  createForWorkflowStep,
  closeForWorkflowStep,
  closeBySource,
  acknowledge,
  complete,
  delegate,
  buildBuckets,
  listForUser,
  parseJson,
  toDate,
};
