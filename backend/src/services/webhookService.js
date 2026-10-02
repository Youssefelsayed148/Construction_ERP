// Phase 26 — Webhooks with delivery retry and a dead-letter path.
//
// Subscribers register a URL + secret + event list (wildcards allowed, e.g.
// 'rfi.*'). Events are the Phase 2 architecture event list, emitted through
// the existing event system (utils/activity.fireEvent → event_log row +
// global.eventBus). webhookService subscribes to the bus the same way the
// Phase 7 dispatcher and the Phase 13 cost listener do.
//
// Delivery state machine (webhook_deliveries.status):
//   pending    — queued, not yet attempted
//   retrying   — attempt failed; next_attempt_at holds the backoff slot
//   delivered  — 2xx received
//   dead_letter— max attempts exhausted; redrive via API
//
// Each POST carries:
//   X-Osiris-Event:     event type
//   X-Osiris-Delivery:  delivery id
//   X-Osiris-Signature: HMAC-SHA256(timestamp + '.' + rawBody, secret)
//   X-Osiris-Timestamp: unix seconds (signature freshness window 5 min)

'use strict';

const crypto = require('crypto');
const { query: defaultQuery } = require('../config/database');

// Canonical subscribable events (Phase 2 architecture list + the internal
// events that carry the same meaning). '*' matches any prefix; an exact
// event type matches itself.
const EVENT_CATALOG = [
  'project.created',
  'rfi.*',
  'submittal.*',
  'observation.*',
  'inventory.low',
  'purchase_order.issued',
  'delivery.received',
  'mir.*',
  'invoice.*',
  'payment.received',
  'variation.approved',
  'action.overdue',
  // Additional internal events v1 consumers may subscribe to:
  'approval.requested',
  'work_completion.verified',
  'schedule.activity.changed',
  'allocation.quantity_changed',
  'transmittal.acknowledged',
  'handover.advanced',
  'report.generated',
];

const BACKOFF_MINUTES = [1, 5, 30, 120, 480]; // attempt n+1 waits BACKOFF[n-1]
const DELIVERY_TIMEOUT_MS = 10000;
const SWEEP_INTERVAL_MS = 60 * 1000;

function matches(events, eventType) {
  return (events || []).some((pattern) => {
    if (pattern === eventType) return true;
    if (typeof pattern !== 'string') return false;
    if (pattern.endsWith('.*')) return eventType.startsWith(pattern.slice(0, -1));
    if (pattern === '*') return true;
    return false;
  });
}

function signPayload(secret, timestamp, body) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

// ---------------------------------------------------------------------------
// Registration CRUD
// ---------------------------------------------------------------------------

async function createWebhook({ url, secret, events, description = null, userId, q = defaultQuery }) {
  const r = await q(
    `INSERT INTO webhooks (url, secret, events, description, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [url, secret, JSON.stringify(events), description, userId]
  );
  return r.rows[0];
}

async function listWebhooks(q = defaultQuery) {
  const r = await q('SELECT id, url, events, description, is_active, created_by, created_at FROM webhooks ORDER BY id');
  return r.rows;
}

async function getWebhook(id, q = defaultQuery) {
  return (await q('SELECT * FROM webhooks WHERE id = $1', [id])).rows[0] || null;
}

async function updateWebhook(id, patch, q = defaultQuery) {
  const sets = []; const params = []; let i = 1;
  for (const [col, val] of Object.entries(patch)) {
    sets.push(`${col} = $${i++}`);
    params.push(col === 'events' ? JSON.stringify(val) : val);
  }
  const r = await q(`UPDATE webhooks SET ${sets.join(', ')} WHERE id = $${i} RETURNING id, url, events, description, is_active, created_at`, [...params, id]);
  return r.rows[0] || null;
}

async function deleteWebhook(id, q = defaultQuery) {
  const r = await q('DELETE FROM webhooks WHERE id = $1 RETURNING id', [id]);
  return r.rows.length > 0;
}

async function listDeliveries(webhookId, q = defaultQuery) {
  const r = await q(
    'SELECT * FROM webhook_deliveries WHERE webhook_id = $1 ORDER BY created_at DESC LIMIT 100', [webhookId]);
  return r.rows;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

// Queue the event for every matching active webhook and start the first
// delivery attempt in the background. Never throws — webhook failures must
// not break the emitting transaction.
// opts: { query } — transaction-bound callers may inject their own executor;
// production uses the default pool.
async function dispatchEvent(evt, opts = {}) {
  const q = opts.query || defaultQuery;
  try {
    const hooks = (await q('SELECT * FROM webhooks WHERE is_active = true')).rows;
    const targets = hooks.filter((h) => matches(h.events, evt.eventType));
    if (targets.length === 0) return 0;
    // Store the RAW event data only — attemptDelivery builds the delivery
    // envelope once (event/entity fields come from the delivery row itself).
    const payload = JSON.stringify(evt.payload || {});
    for (const hook of targets) {
      const d = (await q(
        `INSERT INTO webhook_deliveries (webhook_id, event_type, event_log_id, entity_type, entity_id, payload)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [hook.id, evt.eventType, evt.eventId || null, evt.entityType, evt.entityId, payload]
      )).rows[0];
      // Fire-and-forget; each attempt is fully recorded in the delivery row.
      attemptDelivery(d.id, { query: q }).catch(() => {});
    }
    return targets.length;
  } catch (e) {
    console.error('[WEBHOOKS] dispatch failed:', e.message);
    return 0;
  }
}

async function attemptDelivery(deliveryId, opts = {}) {
  const q = opts.query || defaultQuery;
  const d = (await q('SELECT * FROM webhook_deliveries WHERE id = $1', [deliveryId])).rows[0];
  if (!d || ['delivered', 'dead_letter'].includes(d.status)) return { skipped: true };
  const hook = (await q('SELECT * FROM webhooks WHERE id = $1', [d.webhook_id])).rows[0];
  if (!hook) return { skipped: true };

  const body = JSON.stringify({
    id: d.id, event: d.event_type, entity_type: d.entity_type, entity_id: d.entity_id,
    data: typeof d.payload === 'string' ? JSON.parse(d.payload) : (d.payload || {}),
    occurred_at: d.created_at,
  });
  const timestamp = Math.floor(Date.now() / 1000);

  let ok = false; let statusCode = null; let errorText = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    const res = await fetch(hook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Osiris-Event': d.event_type,
        'X-Osiris-Delivery': String(d.id),
        'X-Osiris-Timestamp': String(timestamp),
        'X-Osiris-Signature': signPayload(hook.secret, timestamp, body),
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    statusCode = res.status;
    ok = res.status >= 200 && res.status < 300;
    if (!ok) errorText = `HTTP ${res.status}`;
  } catch (e) {
    errorText = e.message;
  }

  const attempt = d.attempt_count + 1;
  if (ok) {
    await q(
      `UPDATE webhook_deliveries SET status = 'delivered', attempt_count = $2, last_status_code = $3,
       last_error = NULL, delivered_at = NOW() WHERE id = $1`,
      [d.id, attempt, statusCode]
    );
    return { delivered: true, attempt };
  }

  if (attempt >= d.max_attempts) {
    await q(
      `UPDATE webhook_deliveries SET status = 'dead_letter', attempt_count = $2, last_status_code = $3,
       last_error = $4 WHERE id = $1`,
      [d.id, attempt, statusCode, errorText]
    );
    return { dead_letter: true, attempt };
  }

  const backoffMin = BACKOFF_MINUTES[Math.min(attempt - 1, BACKOFF_MINUTES.length - 1)];
  await q(
    `UPDATE webhook_deliveries SET status = 'retrying', attempt_count = $2, last_status_code = $3,
     last_error = $4, next_attempt_at = NOW() + ($5 || ' minutes')::interval WHERE id = $1`,
    [d.id, attempt, statusCode, errorText, String(backoffMin)]
  );
  return { retrying: true, attempt, backoff_minutes: backoffMin };
}

// Redrive a dead-letter (or stuck retrying) delivery: reset attempt count and
// retry immediately.
async function redriveDelivery(deliveryId, opts = {}) {
  const q = opts.query || defaultQuery;
  const d = (await q(
    `UPDATE webhook_deliveries
     SET status = 'pending', attempt_count = 0, next_attempt_at = NOW(), last_error = NULL
     WHERE id = $1 AND status IN ('dead_letter', 'retrying') RETURNING id`,
    [deliveryId]
  )).rows[0];
  if (!d) return null;
  const result = await attemptDelivery(d.id, opts);
  return result;
}

// Sweep: attempts that are due (pending never attempted, retrying backoff
// elapsed). Runs on an interval when initialized; also safe to call manually.
async function sweepDueDeliveries(opts = {}) {
  const q = opts.query || defaultQuery;
  const due = (await q(
    `SELECT id FROM webhook_deliveries
     WHERE status IN ('pending', 'retrying') AND next_attempt_at <= NOW()
     ORDER BY next_attempt_at LIMIT 50`
  )).rows;
  let delivered = 0; let dead = 0; let retried = 0;
  for (const row of due) {
    const r = await attemptDelivery(row.id, opts);
    if (r.delivered) delivered++;
    else if (r.dead_letter) dead++;
    else if (r.retrying) retried++;
  }
  return { checked: due.length, delivered, dead_letter: dead, retrying: retried };
}

// Subscribe to the in-process event bus for every event type a webhook might
// want. Wildcard patterns can't be subscribed directly, so subscribe to the
// concrete types seen in the catalog plus any type seen at dispatch time.
function initWebhookEventSubscriber(queryFn = defaultQuery) {
  if (!global.eventBus || typeof global.eventBus.on !== 'function') {
    console.error('[WEBHOOKS] global.eventBus unavailable — webhook dispatch disabled');
    return null;
  }
  const subscriber = async (evt) => { await dispatchEvent(evt, { query: queryFn }); };
  for (const pattern of EVENT_CATALOG) {
    if (pattern === '*') continue;
    // Subscribe to the concrete prefix (bus events are exact-typed).
    const exact = pattern.endsWith('.*') ? pattern.slice(0, -2) : pattern;
    global.eventBus.on(exact, subscriber);
  }
  // Safety net: subscribe to all event_log-derived emits via a catch-all on
  // 'event' is not supported by EventEmitter; the dispatcher poll pattern is
  // the durable path. A sweep timer also drains queued deliveries.
  const timer = setInterval(() => {
    sweepDueDeliveries().catch((e) => console.error('[WEBHOOKS] sweep failed:', e.message));
  }, SWEEP_INTERVAL_MS);
  if (timer.unref) timer.unref();
  console.log('[WEBHOOKS] event subscriber initialized — sweep every 60s');
  return timer;
}

module.exports = {
  EVENT_CATALOG,
  BACKOFF_MINUTES,
  matches,
  signPayload,
  createWebhook,
  listWebhooks,
  getWebhook,
  updateWebhook,
  deleteWebhook,
  listDeliveries,
  dispatchEvent,
  attemptDelivery,
  redriveDelivery,
  sweepDueDeliveries,
  initWebhookEventSubscriber,
};
