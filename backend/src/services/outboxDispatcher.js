// Phase 3.3 — the transactional outbox dispatcher.
//
// fireEvent writes every domain event to event_outbox in the same transaction as the state change.
// This dispatcher delivers them at least once:
//   * fetchBatch claims a batch by marking it 'dispatching' under SELECT ... FOR UPDATE SKIP LOCKED, so
//     two dispatcher instances running at once claim disjoint rows — each event is delivered once per
//     successful claim;
//   * delivery runs the routed consumer for known event types (eventDispatcher.EVENT_ROUTES, plus the
//     three cost listeners moved here), and otherwise emits the event on the in-process bus so the
//     webhook subscriber keeps working exactly as before;
//   * success stamps 'delivered' + dispatched_at; failure increments attempts, sets next_attempt_at by
//     exponential backoff, and dead-letters the row after its attempt limit;
//   * rows stuck in 'dispatching' (a crashed dispatcher) are reaped back to 'pending' — at-least-once
//     means consumers must be idempotent, and the cost consumers key on (source_type, source_id) exactly
//     for that reason;
//   * every row carries a stable event_id that survives redelivery.
//
// Failure handling is deliberate: a handler failure is NEVER swallowed here (the row retries until the
// attempt limit and then dead-letters). stats() powers `npm run outbox:stats` (pending, dispatching,
// delivered, dead, oldest pending age) — the observability count for this queue and, per Phase 3.4, for
// the sweeps' failed runs.
'use strict';

const { query: defaultQuery } = require('../config/database');
const eventDispatcher = require('./eventDispatcher');
const costEventListener = require('./costEventListener');

const MAX_ATTEMPTS = parseInt(process.env.OUTBOX_MAX_ATTEMPTS || '8', 10);
const BACKOFF_BASE_SECONDS = parseInt(process.env.OUTBOX_BACKOFF_BASE_SECONDS || '30', 10);
const BACKOFF_MAX_SECONDS = parseInt(process.env.OUTBOX_BACKOFF_MAX_SECONDS || '600', 10);
const DISPATCH_BUDGET_MS = parseInt(process.env.OUTBOX_DISPATCH_BUDGET_MS || '10000', 10);
const BATCH_SIZE = parseInt(process.env.OUTBOX_BATCH_SIZE || '25', 10);
const STALE_DISPATCHING_MINUTES = parseInt(process.env.OUTBOX_STALE_MINUTES || '10', 10);
const TIMER_INTERVAL_MS = parseInt(process.env.OUTBOX_INTERVAL_MS || '5000', 10);

const backoffSeconds = (attempts) => Math.min(BACKOFF_BASE_SECONDS * 2 ** Math.max(attempts - 1, 0), BACKOFF_MAX_SECONDS);

// The cost listeners moved onto the outbox (services/costEventListener.js): their handlers are exported
// without try/catch so a failure retries and finally dead-letters instead of vanishing into a log line.
const COST_EVENT_ROUTES = {
  'work_completion.verified': costEventListener.onWorkCompletionVerified,
  'labor_payment.created': costEventListener.onLaborPaymentCreated,
  'sub_payment.paid': costEventListener.onSubPaymentPaid,
};

const ROUTES = Object.assign({}, eventDispatcher.EVENT_ROUTES, COST_EVENT_ROUTES);

// Event types that no longer fire on the in-process bus from fireEvent: their consumers live here.
const hasOutboxRoute = (eventType) => Object.prototype.hasOwnProperty.call(ROUTES, eventType);

function fromRow(row) {
  return {
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    userId: row.user_id,
    userName: row.user_name,
    userRole: row.user_role,
    payload: eventDispatcher.parseJson(row.payload),
    eventId: row.event_id,
    eventLogId: row.source_event_log_id,
    outboxId: row.id,
  };
}

// Claim a batch. One short transaction: SELECT FOR UPDATE SKIP LOCKED, mark, commit. The UPDATE-level
// SELECT guarantees two instances cannot mark the same row; the brief mark means a crash cannot wedge a
// batch forever (see reap below). opts.types narrows the claim to those event types (used by tests and
// by a selectively-running instance).
async function claim(q, limit = BATCH_SIZE, types = null, ids = null) {
  const rows = ids
    ? (await q(
        `UPDATE event_outbox
            SET status = 'dispatching', attempts = attempts + 1, next_attempt_at = now(), updated_at = now()
          WHERE id IN (
            SELECT id FROM event_outbox
             WHERE status = 'pending' AND next_attempt_at <= now() AND id = ANY($2::bigint[])
             ORDER BY id
             LIMIT $1
             FOR UPDATE SKIP LOCKED
          )
          RETURNING *`,
        [limit, ids]
      )).rows
    : types && types.length ? (await q(
        `UPDATE event_outbox
            SET status = 'dispatching', attempts = attempts + 1, next_attempt_at = now(), updated_at = now()
          WHERE id IN (
            SELECT id FROM event_outbox
             WHERE status = 'pending' AND next_attempt_at <= now() AND event_type = ANY($2::text[])
             ORDER BY id
             LIMIT $1
             FOR UPDATE SKIP LOCKED
          )
          RETURNING *`,
        [limit, types]
      )).rows
    : (await q(
        `UPDATE event_outbox
            SET status = 'dispatching', attempts = attempts + 1, next_attempt_at = now(), updated_at = now()
          WHERE id IN (
            SELECT id FROM event_outbox
             WHERE status = 'pending' AND next_attempt_at <= now()
             ORDER BY id
             LIMIT $1
             FOR UPDATE SKIP LOCKED
          )
          RETURNING *`,
        [limit]
      )).rows;
  return rows;
}

// Deliver claimed events sequentially until the time budget runs out; each event is its own try:
// delivered or retried/dead-lettered, the others keep going.
async function deliverClaimed(q, claimed, { handlers = null, maxAttempts = MAX_ATTEMPTS, backoffSeconds: backoff = null } = {}) {
  let delivered = 0;
  let failed = 0;
  const routes = handlers || ROUTES;
  const started = Date.now();
  for (const row of claimed) {
    if (Date.now() - started > DISPATCH_BUDGET_MS) break;
    const evt = fromRow(row);
    try {
      await (routes[row.event_type] || defaultDeliver)(evt, { query: q });
      await q(
        "UPDATE event_outbox SET status = 'delivered', dispatched_at = now(), last_error = NULL, updated_at = now() WHERE id = $1",
        [row.id]
      );
      delivered += 1;
    } catch (e) {
      failed += 1;
      const attempts = row.attempts; // already incremented by the claim
      const dead = attempts >= maxAttempts;
      await q(
        `UPDATE event_outbox
            SET status = CASE WHEN $2 THEN 'dead' ELSE 'pending' END,
                next_attempt_at = CASE WHEN $2 THEN next_attempt_at ELSE now() + ($3 || ' seconds')::interval END,
                last_error = $4, updated_at = now()
          WHERE id = $1`,
        [row.id, dead, String(backoff ? backoff(attempts) : backoffSeconds(attempts)), `${e.message}`]
      );
      console.error(`[OUTBOX] ${row.event_type} delivery attempt ${attempts} of ${maxAttempts} failed for event ${row.event_id}: ${e.message}`);
    }
  }
  return { delivered, failed };
}

// Unrouted types keep their pre-3.3 delivery mechanism: the synchronous in-process bus, now fed by the
// dispatcher (post-commit) instead of by fireEvent inside the caller's transaction.
const defaultDeliver = async (evt) => {
  if (global.eventBus && typeof global.eventBus.emit === 'function') {
    global.eventBus.emit(evt.eventType, evt);
  }
};

async function dispatchOnce(query = null, opts = {}) {
  const q = query || defaultQuery;
  const claimed = await claim(q, opts.batchSize || BATCH_SIZE, opts.types || null, opts.ids || null);
  const result = await deliverClaimed(q, claimed, {
    handlers: opts.handlers,
    maxAttempts: opts.maxAttempts,
    backoffSeconds: opts.backoffSeconds,
  });
  return { claimed: claimed.length, ...result };
}

// Rows stuck in 'dispatching' beyond the stale window go back to 'pending'. The attempts already counted.
async function reap(query = null, { staleMinutes = null } = {}) {
  const q = query || defaultQuery;
  const r = await q(
    `UPDATE event_outbox
        SET status = 'pending', next_attempt_at = now(), updated_at = now()
      WHERE status = 'dispatching'
        AND next_attempt_at < now() - ($1 || ' minutes')::interval
      RETURNING id`,
    [String(staleMinutes == null ? STALE_DISPATCHING_MINUTES : staleMinutes)]
  );
  return { reaped: r.rows.length };
}

// Legacy rows written to event_log before the outbox existed are seeded once with a stable id.
async function seedLegacyEventLog(query = null) {
  const q = query || defaultQuery;
  const r = await q(
    `INSERT INTO event_outbox (event_id, event_type, entity_type, entity_id, user_id, user_name, user_role, payload, source_event_log_id)
     SELECT 'log-' || el.id::text, el.event_type, el.entity_type, el.entity_id, el.user_id, el.user_name, el.user_role, COALESCE(el.payload, '{}'), el.id
       FROM event_log el
      WHERE el.dispatched_at IS NULL
        AND (el.payload IS NULL OR jsonb_typeof(el.payload::jsonb) = 'object')
     ON CONFLICT (event_id) DO NOTHING
     RETURNING id`
  );
  const ids = r.rows.map((row) => row.id);
  if (ids.length) {
    await q('UPDATE event_log SET dispatched_at = now() WHERE id = ANY($1::int[]) AND dispatched_at IS NULL', [ids]);
  }
  return { seeded: ids.length };
}

// Observability: the count the ops script prints. Sweep failures (Phase 3.4) report here too through
// background_sweep_runs.
async function stats(query = null) {
  const q = query || defaultQuery;
  const s = (await q(
    `SELECT
       count(*)::int AS total,
       count(*) FILTER (WHERE status = 'pending')::int AS pending,
       count(*) FILTER (WHERE status = 'dispatching')::int AS dispatching,
       count(*) FILTER (WHERE status = 'delivered')::int AS delivered,
       count(*) FILTER (WHERE status = 'dead')::int AS dead,
       (SELECT count(*)::int FROM background_sweep_runs WHERE status = 'failed') AS sweep_failures,
       (SELECT date_trunc('second', min(next_attempt_at)) FROM event_outbox WHERE status = 'pending') AS oldest_pending_next_retry
     FROM event_outbox`
  )).rows[0];
  return s;
}

let timer = null;
function initOutboxDispatcher(opts = {}) {
  if (timer) return timer;
  (async () => {
    try {
      await seedLegacyEventLog();
      await reap();
    } catch (e) {
      console.error('[OUTBOX] startup catch-up failed:', e.message);
    }
    timer = setInterval(() => {
      dispatchOnce().catch((e) => console.error('[OUTBOX] dispatch cycle failed:', e.message));
    }, TIMER_INTERVAL_MS);
    if (timer.unref) timer.unref();
    console.log(`[OUTBOX] dispatcher initialized every ${TIMER_INTERVAL_MS}ms — routes: ${Object.keys(ROUTES).join(', ')}`);
  })();
  return timer;
}

module.exports = {
  ROUTES, hasOutboxRoute, fromRow, claim, deliverClaimed, dispatchOnce, reap, seedLegacyEventLog, stats,
  initOutboxDispatcher, backoffSeconds,
  MAX_ATTEMPTS, BACKOFF_BASE_SECONDS, BACKOFF_MAX_SECONDS, BATCH_SIZE, TIMER_INTERVAL_MS,
};
