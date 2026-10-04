// Real PostgreSQL + real app. Phase 3.3: the transactional outbox and its multi-instance dispatcher.
//
// Reproduced first (on the pre-3.3 code):
//   * fireEvent swallowed INSERT failures (returned null, console.error) — a broken event_log insert lost the event;
//   * routed consumers (notifications, action items, material recompute, cost postings) ran off a synchronous
//     in-process bus: a crash between commit and delivery lost them, a busy process delayed them, and there
//     was no retry;
//   * within a caller's transaction the bus fired BEFORE commit (listeners read uncommitted rows or raced them);
//   * nothing delivered at least once with a retry count, backoff or dead-letter, and nothing was safe with
//     two dispatcher instances.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

const fireEvent2 = (evt) => require('../../utils/activity').fireEvent(evt);
const eventDispatcher = require('../../services/eventDispatcher');

describePg('3.3 transactional outbox and dispatcher (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let outbox;
  const tag = String(Date.now()).slice(-7);
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const seed = async (eventType, eventId) => (await one(
    "INSERT INTO event_outbox (event_type, entity_type, payload, event_id) VALUES ($1, 'test_entity', '{}', $2) RETURNING id",
    [eventType, eventId]
  )).id;

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    outbox = require('../../services/outboxDispatcher');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('fireEvent enqueues the outbox row in the caller transaction and rolls back with it', async () => {
    const { fireEvent } = require('../../utils/activity');
    const before = (await one('SELECT count(*)::int n FROM event_outbox')).n;
    await expect(db.transaction((client) => (async () => {
      await fireEvent({ eventType: `test.rollback.${tag}`, entityType: 'x', entityId: 1, payload: { p: 1 } }, { query: client.query.bind(client) });
      throw new Error('boom');
    })())).rejects.toMatchObject({ message: 'boom' });
    expect((await one('SELECT count(*)::int n FROM event_outbox')).n).toBe(before);
    await fireEvent({ eventType: `test.commit.${tag}`, entityType: 'x', entityId: 2, payload: { p: 2 } });
    const row = await one('SELECT * FROM event_outbox WHERE event_type = $1 ORDER BY id DESC LIMIT 1', [`test.commit.${tag}`]);
    expect(row).toBeTruthy();
    expect(row.event_id).toMatch(/./); // every event carries a stable id
  });

  test('fireEvent does not swallow an enqueue failure: the caller fails loudly', async () => {
    const { fireEvent } = require('../../utils/activity');
    // event_outbox.event_type is NOT NULL: a broken event must refuse to enqueue, not vanish.
    await expect(fireEvent({ eventType: null, entityType: 'x', entityId: 3 })).rejects.toThrow();
  });

  test('two concurrent dispatcher instances deliver every event exactly once (SKIP LOCKED claim)', async () => {
    const delivered = [];
    const type = `test.multi.${tag}`;
    const ids = [];
    for (let i = 0; i < 12; i += 1) ids.push(await seed(type, `3.3-multi-${tag}-${i}`));
    const handler = async (evt) => { delivered.push(evt.eventId); await new Promise((r) => setTimeout(r, 5)); };
    // Two instances run at once; each claims a disjoint batch through FOR UPDATE SKIP LOCKED.
    const results = await Promise.allSettled([
      outbox.dispatchOnce(null, { types: [type], handlers: { [type]: handler } }),
      outbox.dispatchOnce(null, { types: [type], handlers: { [type]: handler } }),
    ]);
    for (const r of results) expect(r.status).toBe('fulfilled');
    expect(delivered).toHaveLength(12);
    expect(new Set(delivered).size).toBe(12); // one delivery per event, never two
    const rows = (await db.query('SELECT status, attempts FROM event_outbox WHERE event_type = $1', [type])).rows;
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.status === 'delivered' && r.attempts === 1)).toBe(true);
  });

  test('a failing handler retries with backoff and keeps the same stable event id until delivered', async () => {
    const type = `test.retry.${tag}`;
    const id = await seed(type, `3.3-retry-${tag}`);
    const eventIds = [];
    let attempt = 0;
    const flaky = async (evt) => {
      eventIds.push(evt.eventId);
      attempt += 1;
      if (attempt < 3) throw new Error(`not yet ${attempt}`);
    };
    await outbox.dispatchOnce(null, { types: [type], handlers: { [type]: flaky }, backoffSeconds: () => 0, maxAttempts: 5 });
    const afterFirst = await one('SELECT status, attempts, last_error FROM event_outbox WHERE id = $1', [id]);
    expect(afterFirst.status).toBe('pending');
    expect(afterFirst.attempts).toBe(1);
    expect(afterFirst.last_error).toMatch(/not yet 1/);
    for (let i = 0; i < 2; i += 1) {
      await outbox.dispatchOnce(null, { types: [type], handlers: { [type]: flaky }, backoffSeconds: () => 0, maxAttempts: 5 });
    }
    const row = await one('SELECT status, attempts, event_id FROM event_outbox WHERE id = $1', [id]);
    expect(row.status).toBe('delivered');
    expect(row.attempts).toBe(3);
    expect(new Set(eventIds).size).toBe(1); // consumers see ONE stable event id across redeliveries
  });

  test('a handler failing past the attempt limit dead-letters, and the stats count states', async () => {
    const type = `test.dead.${tag}`;
    const id = await seed(type, `3.3-dead-${tag}`);
    for (let i = 0; i < 4; i += 1) {
      await outbox.dispatchOnce(null, { types: [type], handlers: { [type]: async () => { throw new Error(`fail ${i}`); } }, backoffSeconds: () => 0, maxAttempts: 3 });
    }
    const row = await one('SELECT status, attempts FROM event_outbox WHERE id = $1', [id]);
    expect(row.status).toBe('dead');
    expect(row.attempts).toBe(3);
    const counts = await outbox.stats(null);
    expect(counts.dead).toBeGreaterThanOrEqual(1);
    expect(counts.pending + counts.delivered + counts.dead + counts.dispatching).toBe(counts.total);
  });

  test('a routed notification event flows through the outbox to its consumer exactly once', async () => {
    const notificationService = require('../../services/notificationService');
    const spy = jest.spyOn(notificationService, 'notifyRoles');
    spy.mockImplementation(async () => ({}));
    try {
      await fireEvent2({ eventType: 'approval.requested', entityType: 'purchase_request', entityId: 4242, payload: { title: `3.3 flow ${tag}` } });
      // Claim precisely THIS run's row (its id): older pending rows of the same type belong to other runs.
      const mine = (await one("SELECT id FROM event_outbox WHERE event_type = 'approval.requested' AND status = 'pending' AND payload->>'title' = $1 ORDER BY id DESC LIMIT 1", [`3.3 flow ${tag}`])).id;
      const handler = async (evt, opts) => eventDispatcher.EVENT_ROUTES['approval.requested'](evt, opts);
      const batch = await outbox.dispatchOnce(null, { ids: [mine], handlers: { 'approval.requested': handler } });
      expect(batch.claimed).toBe(1);
      await outbox.dispatchOnce(null, { ids: [mine], handlers: { 'approval.requested': handler } }); // second pass: the row is delivered, nothing reclaims it
      const row = await one('SELECT status, event_id FROM event_outbox WHERE id = $1', [mine]);
      expect(row.status).toBe('delivered');
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][1].title).toBe(`3.3 flow ${tag}`); // the consumer receives the event's payload
    } finally { spy.mockRestore(); }
  });

  test('a routed cost event delivers through the outbox and its replay does not double-count', async () => {
    const projectId = (await one("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`ob-${tag}`, `OB${tag}`.slice(0, 20)])).id;
    const wo = (await one('INSERT INTO work_orders (project_id, title) VALUES ($1, $2) RETURNING id', [projectId, `ob-wo-${tag}`])).id;
    const location = (await one('INSERT INTO project_locations (project_id, name) VALUES ($1, $2) RETURNING id', [projectId, `loc-${tag}`])).id;
    const comp = (await one('INSERT INTO work_completions (work_order_id, status, project_location_id) VALUES ($1, $2, $3) RETURNING id', [wo, 'verified', location])).id;
    // Closeout A2.3: the cost consumer books the work order's EQUIPMENT lines, once each (labour is booked by its own payments).
    const equipmentId = (await one('INSERT INTO work_order_equipment (work_order_id, hours, hourly_cost, total_cost) VALUES ($1, 2, 50, 100) RETURNING id', [wo])).id;
    const before = (await one('SELECT count(*)::int n FROM project_costs WHERE source_type = $1 AND source_id = $2', ['wo_equipment', equipmentId])).n;
    await fireEvent2({ eventType: 'work_completion.verified', entityType: 'work_completion', entityId: comp, payload: {} });
    await outbox.dispatchOnce(null, { types: ['work_completion.verified'] });
    await outbox.dispatchOnce(null, { types: ['work_completion.verified'] }); // replay: at-least-once delivery, one cost row
    const after = await one(
      `SELECT (SELECT count(*)::int FROM project_costs WHERE source_type = $1 AND source_id = $2) n,
              COALESCE((SELECT sum(amount) FROM project_costs WHERE source_type = $1 AND source_id = $2), 0)::float a
         FROM (SELECT 1) x`,
      ['wo_equipment', equipmentId]
    );
    expect(after.n).toBe(before + 1);
    expect(after.a).toBeGreaterThan(0);
  });

  test('stuck "dispatching" rows (a crashed dispatcher) are reaped back to pending', async () => {
    const type = `test.stuck.${tag}`;
    const id = await seed(type, `3.3-stuck-${tag}`);
    await db.query("UPDATE event_outbox SET status = 'dispatching', attempts = 1, next_attempt_at = now() - interval '1 hour', updated_at = now() - interval '1 hour' WHERE id = $1", [id]);
    await outbox.reap(null, { staleMinutes: 1 });
    const row = await one('SELECT status FROM event_outbox WHERE id = $1', [id]);
    expect(row.status).toBe('pending');
  });

  test('legacy event_log rows without dispatched_at are seeded into the outbox once, with a stable id', async () => {
    const legacyId = (await one("INSERT INTO event_log (event_type, entity_type, payload) VALUES ($1, 'x', '{}') RETURNING id", [`legacy.unrouted.${tag}`])).id;
    await outbox.seedLegacyEventLog(null);
    await outbox.seedLegacyEventLog(null); // twice: the stable id makes the seed idempotent
    const rows = (await db.query('SELECT count(*)::int n, min(event_id) e FROM event_outbox WHERE event_type = $1', [`legacy.unrouted.${tag}`])).rows[0];
    expect(rows.n).toBe(1);
    expect(rows.e).toBe(`log-${legacyId}`);
  });
});
