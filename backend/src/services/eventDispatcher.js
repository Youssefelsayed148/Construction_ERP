// Phase 7 — event dispatcher: turns event_log rows into notifications and
// action items.
//
// Transport: the repo already runs an in-process EventEmitter
// (global.eventBus) initialized at server startup — costEventListener
// subscribes to it and fireEvent emits to it synchronously after every
// event_log INSERT. The dispatcher follows the exact same pattern:
//   * initEventDispatcher() subscribes one listener per routed event type and
//     runs a catch-up poll so nothing is lost across restarts or when the
//     synchronous emit raced an error.
//   * catchUp(query) scans event_log for rows without dispatched_at, runs the
//     route handler for each, then stamps dispatched_at. Safe to call from a
//     cron/scheduler or manually.
//
// Adding a later phase's event = one line in EVENT_ROUTES. Events without a
// route are a logged no-op, never an error.

'use strict';

const { query: defaultQuery } = require('../config/database');
const actionService = require('./actionService');
const notificationService = require('./notificationService');
const materialDemand = require('./materialDemand');

function parseJson(v) {
  if (v == null) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return {}; }
}

// ---------------------------------------------------------------------------
// EVENT_ROUTES — the hook surface for later phases. Each handler receives
// (evt, opts) where evt = { eventType, entityType, entityId, userId,
// userName, userRole, payload, eventLogId }.
// ---------------------------------------------------------------------------

async function routeObservationCreated(evt, opts) {
  // Consultant Observation raised (later phase owns the full flow). If the
  // emitter already knows the assignee, raise the action item; otherwise
  // notify the project managers on the project.
  const payload = evt.payload || {};
  if (payload.assigned_user_id != null) {
    await actionService.createActionItem({
      source_type: 'observation',
      source_id: evt.entityId,
      project_id: payload.project_id,
      title: payload.title || `Observation #${evt.entityId}`,
      description: payload.description || null,
      assigned_user_id: payload.assigned_user_id,
      priority: payload.priority || 'high',
      due_date: payload.due_date || null,
      created_by: evt.userId,
      event_log_id: evt.eventLogId,
    }, opts);
    return;
  }
  await notificationService.notifyRoles(['project_manager', 'owner', 'admin'], {
    title: `Observation raised: ${payload.title || `#${evt.entityId}`}`,
    body: payload.description || null,
    eventType: evt.eventType,
    entityType: evt.entityType,
    entityId: evt.entityId,
    excludeUserId: evt.userId,
  }, opts);
}

async function routeRfiSubmitted(evt, opts) {
  // RFI submitted for consultant review — notify the consultant org users;
  // until organizations-on-roles lands, fall back to the coordinators.
  const payload = evt.payload || {};
  if (payload.notify_user_ids && payload.notify_user_ids.length) {
    for (const uid of payload.notify_user_ids) {
      await notificationService.notify({
        userId: uid,
        title: payload.title || `RFI #${evt.entityId} submitted`,
        body: payload.description || null,
        eventType: evt.eventType,
        entityType: evt.entityType,
        entityId: evt.entityId,
      }, opts);
    }
    return;
  }
  await notificationService.notifyRoles(['project_manager', 'owner', 'admin'], {
    title: payload.title || `RFI #${evt.entityId} submitted`,
    body: payload.description || null,
    eventType: evt.eventType,
    entityType: evt.entityType,
    entityId: evt.entityId,
    excludeUserId: evt.userId,
  }, opts);
}

async function routePurchaseRequisitionApproved(evt, opts) {
  const payload = evt.payload || {};
  if (payload.requester_id != null) {
    await notificationService.notify({
      userId: payload.requester_id,
      title: `Purchase requisition approved: ${payload.title || `#${evt.entityId}`}`,
      body: 'Your requisition has been approved and is moving to procurement.',
      eventType: evt.eventType,
      entityType: evt.entityType,
      entityId: evt.entityId,
    }, opts);
  }
  await notificationService.notifyRoles(['purchasing_mgr'], {
    title: `Purchase requisition approved: ${payload.title || `#${evt.entityId}`}`,
    body: 'Ready for procurement processing.',
    eventType: evt.eventType,
    entityType: evt.entityType,
    entityId: evt.entityId,
  }, opts);
}

async function routeInvoiceOverdue(evt, opts) {
  const payload = evt.payload || {};
  await notificationService.notifyRoles(['finance_manager', 'owner', 'admin'], {
    title: payload.title || `Invoice overdue: #${evt.entityId}`,
    body: payload.body || null,
    eventType: evt.eventType,
    entityType: evt.entityType,
    entityId: evt.entityId,
  }, opts);
}

async function routeActionOverdue(evt, opts) {
  const payload = evt.payload || {};
  const topRoles = payload.top_roles || ['owner', 'admin'];
  await notificationService.notifyRoles(topRoles, {
    title: payload.title || `Action overdue: ${payload.title || `#${evt.entityId}`}`,
    body: payload.body || null,
    eventType: evt.eventType,
    entityType: evt.entityType,
    entityId: evt.entityId,
    actionItemId: payload.action_item_id != null ? payload.action_item_id : null,
  }, opts);
}

async function routeApprovalRequested(evt, opts) {
  // New approval request — let the people who can act on it know.
  const payload = evt.payload || {};
  const roles = ['owner', 'admin'];
  if (payload.manager_role) roles.push(payload.manager_role);
  await notificationService.notifyRoles(roles, {
    title: payload.title || `Approval requested: ${payload.module_name || ''} #${evt.entityId}`,
    body: payload.request_type || null,
    eventType: evt.eventType,
    entityType: evt.entityType,
    entityId: evt.entityId,
    excludeUserId: evt.userId,
  }, opts);
}

// Phase 9 — material demand triggers. Recomputation is idempotent, so a
// direct call (quantities routes) plus this durable catch-up path converge.
async function routeAllocationQuantityChanged(evt, opts) {
  const q = (opts && opts.query) || defaultQuery;
  await materialDemand.recomputeForAllocationEvent(q, evt, opts);
}

// Phase 22 will fire this when a schedule activity's date/quantity changes;
// the route is already wired so the schedule engine lands with zero
// dispatcher changes.
async function routeScheduleActivityChanged(evt, opts) {
  const q = (opts && opts.query) || defaultQuery;
  await materialDemand.recomputeForScheduleEvent(q, evt, opts);
}

// Recipe factors edited (materials routes fire this) — re-derive demand for
// the linked BOQ item, or the event's project for activity-type recipes.
async function routeRecipeChanged(evt, opts) {
  const q = (opts && opts.query) || defaultQuery;
  await materialDemand.recomputeForRecipeEvent(q, evt, opts);
}

const EVENT_ROUTES = {
  'observation.created': routeObservationCreated,
  'rfi.submitted': routeRfiSubmitted,
  'purchase_requisition.approved': routePurchaseRequisitionApproved,
  'invoice.overdue': routeInvoiceOverdue,
  'action.overdue': routeActionOverdue,
  'approval.requested': routeApprovalRequested,
  'allocation.quantity_changed': routeAllocationQuantityChanged,
  'schedule.activity.changed': routeScheduleActivityChanged,
  'recipe.changed': routeRecipeChanged,
};

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------

async function dispatchEvent(eventType, evt, opts = {}) {
  const handler = EVENT_ROUTES[eventType];
  if (!handler) return { handled: false };
  try {
    await handler(evt, opts);
    return { handled: true };
  } catch (e) {
    console.error(`[EVENT_DISPATCH] handler for ${eventType} failed:`, e.message);
    return { handled: true, error: e.message };
  }
}

// Normalize an event_log row (or a raw fireEvent payload) into evt.
function fromRow(row) {
  return {
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    userId: row.user_id,
    userName: row.user_name,
    userRole: row.user_role,
    payload: parseJson(row.payload),
    eventLogId: row.id,
  };
}

// catch-up poll: process event_log rows that no handler has stamped yet.
// Rows are stamped dispatched_at after their handler runs; handler failures
// leave the row unmarked so the next sweep retries.
async function catchUp(query, opts = {}) {
  const qf = query || defaultQuery;
  const rows = (await qf('SELECT * FROM event_log WHERE dispatched_at IS NULL ORDER BY id')).rows;
  let processed = 0;
  for (const row of rows) {
    const r = await dispatchEvent(row.event_type, fromRow(row), opts);
    if (!r.error) {
      await qf('UPDATE event_log SET dispatched_at = $1 WHERE id = $2', [new Date(), row.id]);
    }
    processed++;
  }
  return { scanned: rows.length, processed };
}

// ---------------------------------------------------------------------------
// init — the routed consumers are delivered out of the transactional outbox
// (services/outboxDispatcher.js) with retries, backoff, a dead-letter state and
// a stable event id. This initializer stays for the catch-up poll only: it seeds
// legacy event_log rows (written before the outbox existed) into the outbox and
// reaps any dispatch left stuck, so nothing written before the cutover is lost.
// ---------------------------------------------------------------------------

function initEventDispatcher(opts = {}) {
  const outbox = require('./outboxDispatcher');
  (async () => {
    try {
      await outbox.seedLegacyEventLog(opts.query);
      await outbox.reap(opts.query);
    } catch (e) {
      console.error('[EVENT_DISPATCH] outbox catch-up failed:', e.message);
    }
  })();
  console.log('[EVENT_DISPATCH] consuming from the event_outbox (no direct bus subscription)');
  return null;
}

module.exports = {
  EVENT_ROUTES,
  dispatchEvent,
  catchUp,
  initEventDispatcher,
  fromRow,
  parseJson,
};
