// Phase 7 — escalation scheduler for action items.
//
// The repo has no cron dependency; its only background pattern is the
// in-process interval set up at server startup (initCostEventListener et
// al. in server.js). The scheduler follows it: initEscalationScheduler()
// registers a setInterval sweep; runEscalationSweep() is a pure, testable
// pass over the open action items.
//
// Ladder (every threshold comes from the item's escalation_policy JSONB,
// which the workflow engine seeds from the per-row escalation_rules values —
// ack_remind_hours / overdue_escalate_hours / escalate_to_role — and
// actionService fills with defaults; nothing below is hardcoded):
//
//   L0 → L1: unacknowledged after `ack_remind_hours` (example: 4h)
//            → remind the assignee's manager (manager_roles)
//   L1 → L2: still open after `overdue_escalate_hours` (example: 24h)
//            → escalate further (top_roles)
//   →  L3:   due date missed
//            → durable 'action.overdue' event; the dispatcher notifies the
//              top of the configured chain (top_roles)
//
// Reminder sweep: reminder_policy JSONB (resolved from reminder_rules at
// creation) drives repeat nudges to the assignee — unacknowledged items only,
// capped at max_reminders.

'use strict';

const { query: defaultQuery } = require('../config/database');
const notificationService = require('./notificationService');
const { fireEvent } = require('../utils/activity');

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

const DEFAULT_POLICY = {
  ack_remind_hours: 4,
  overdue_escalate_hours: 24,
  manager_roles: ['admin'],
  top_roles: ['owner', 'admin'],
};

function policyFor(item) {
  const stored = parseJson(item.escalation_policy);
  return {
    ack_remind_hours: stored.ack_remind_hours != null ? Number(stored.ack_remind_hours) : DEFAULT_POLICY.ack_remind_hours,
    overdue_escalate_hours: stored.overdue_escalate_hours != null ? Number(stored.overdue_escalate_hours) : DEFAULT_POLICY.overdue_escalate_hours,
    manager_roles: Array.isArray(stored.manager_roles) && stored.manager_roles.length ? stored.manager_roles : DEFAULT_POLICY.manager_roles,
    top_roles: Array.isArray(stored.top_roles) && stored.top_roles.length ? stored.top_roles : DEFAULT_POLICY.top_roles,
  };
}

function hoursBetween(from, to) {
  return (to.getTime() - from.getTime()) / (3600 * 1000);
}

async function runEscalationSweep(query, opts = {}) {
  const qf = query || defaultQuery;
  const ctx = { client: opts.client || { query: qf } };
  const fire = opts.fireEvent || fireEvent;
  const now = opts.now || new Date();
  const stats = { ack_reminded: 0, escalated: 0, overdue_fired: 0, reminders_sent: 0 };

  const items = (await qf("SELECT * FROM action_items WHERE status IN ('open','in_progress')")).rows;

  for (const item of items) {
    const policy = policyFor(item);
    const createdAt = toDate(item.created_at) || now;
    const ageHours = hoursBetween(createdAt, now);
    const level = Number(item.escalation_level || 0);
    const acknowledgedAt = toDate(item.acknowledged_at);

    // Rung 3 — due date missed → top of the chain (durable event).
    const due = toDate(item.due_date);
    if (due != null && due < now && level < 3) {
      await fire({
        eventType: 'action.overdue',
        entityType: 'action_item',
        entityId: item.id,
        userId: null, userName: null, userRole: 'system',
        payload: {
          action_item_id: item.id,
          title: item.title,
          top_roles: policy.top_roles,
          body: `Action "${item.title}" is past its due date (${due.toISOString().slice(0, 10)}).`,
        },
      });
      await qf(
        'UPDATE action_items SET escalation_level = 3, last_escalated_at = $1, updated_at = $1 WHERE id = $2',
        [now, item.id]
      );
      stats.overdue_fired++;
      continue;
    }

    // Rung 2 — still open after overdue_escalate_hours → escalate further.
    if (level < 2 && ageHours >= policy.overdue_escalate_hours) {
      await notificationService.notifyRoles(policy.top_roles, {
        title: `Action escalated: ${item.title}`,
        body: `Open for ${Math.floor(ageHours)}h without resolution.`,
        eventType: 'action.escalated',
        entityType: 'action_item',
        entityId: item.id,
        actionItemId: item.id,
      }, ctx);
      await qf(
        'UPDATE action_items SET escalation_level = 2, last_escalated_at = $1, updated_at = $1 WHERE id = $2',
        [now, item.id]
      );
      stats.escalated++;
      continue;
    }

    // Rung 1 — unacknowledged after ack_remind_hours → the assignee's manager.
    if (level < 1 && acknowledgedAt == null && ageHours >= policy.ack_remind_hours) {
      await notificationService.notifyRoles(policy.manager_roles, {
        title: `Unacknowledged action: ${item.title}`,
        body: `Assigned ${Math.floor(ageHours)}h ago without acknowledgement.`,
        eventType: 'action.unacknowledged',
        entityType: 'action_item',
        entityId: item.id,
        actionItemId: item.id,
      }, ctx);
      await qf(
        'UPDATE action_items SET escalation_level = 1, last_escalated_at = $1, updated_at = $1 WHERE id = $2',
        [now, item.id]
      );
      stats.ack_reminded++;
      continue;
    }

    // Reminder nudges (independent of the escalation ladder).
    const reminderPolicy = parseJson(item.reminder_policy);
    if (reminderPolicy.remind_after_hours != null && acknowledgedAt == null) {
      const lastReminded = toDate(item.last_reminded_at);
      const anchor = lastReminded || createdAt;
      const sinceLast = hoursBetween(anchor, now);
      const sent = Number(item.reminders_sent || 0);
      if (ageHours >= Number(reminderPolicy.remind_after_hours)
          && (lastReminded == null || sinceLast >= Number(reminderPolicy.repeat_interval_hours))
          && sent < Number(reminderPolicy.max_reminders)) {
        const targets = item.assigned_user_id != null
          ? null
          : (item.assigned_role ? [item.assigned_role] : null);
        const message = {
          title: `Reminder: ${item.title}`,
          body: `Open since ${createdAt.toISOString().slice(0, 10)}.`,
          eventType: 'action.reminder',
          entityType: 'action_item',
          entityId: item.id,
          actionItemId: item.id,
        };
        if (targets) {
          await notificationService.notifyRoles(targets, message, ctx);
        } else {
          await notificationService.notify({ ...message, userId: item.assigned_user_id }, ctx);
        }
        await qf(
          'UPDATE action_items SET last_reminded_at = $1, reminders_sent = $2, updated_at = $1 WHERE id = $3',
          [now, sent + 1, item.id]
        );
        stats.reminders_sent++;
      }
    }
  }

  return stats;
}

function initEscalationScheduler(opts = {}) {
  const minutes = opts.intervalMinutes
    || parseInt(process.env.ESCALATION_SWEEP_MINUTES || '15', 10);
  const timer = setInterval(() => {
    runEscalationSweep().catch((e) => console.error('[ESCALATION] sweep failed:', e.message));
  }, minutes * 60 * 1000);
  if (timer.unref) timer.unref();
  console.log(`[ESCALATION] scheduler initialized — sweep every ${minutes} min`);
  return timer;
}

module.exports = {
  DEFAULT_POLICY,
  policyFor,
  runEscalationSweep,
  initEscalationScheduler,
};
