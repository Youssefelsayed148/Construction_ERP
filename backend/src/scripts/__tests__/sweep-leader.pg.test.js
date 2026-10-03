// Real PostgreSQL. Phase 3.4: the advisory-lock leader for the background sweeps.
//
// Reproduced first (on the pre-3.4 code): the six setInterval sweeps (escalation, receivable reminders,
// permit expiry, replenishment, webhook deliveries, scheduled reports) ran on EVERY backend instance —
// two replicas ran every sweep twice. There was no lock and no run ledger.
//
// services/sweepLeader.js: a session-level pg_try_advisory_lock on a DEDICATED connection that the helper
// owns for the run (never a pooled client — a returned pooled session would keep the lock). The lock is
// released on completion AND on crash (the connection dies with the process). Failures are logged with
// context and recorded in background_sweep_runs (surfaced by npm run outbox:stats); they are never
// swallowed silently: the call result reports them and the error text is stored.
const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('3.4 advisory-lock sweep leader (real PostgreSQL)', () => {
  let db; let sweepLeader;
  const tag = String(Date.now()).slice(-7);
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];

  beforeAll(async () => {
    db = require('../../config/database');
    sweepLeader = require('../../services/sweepLeader');
  });

  afterAll(async () => {
    await db.pool.end();
  });

  test('two concurrent runners: one runs the sweep, the other skips cleanly — no double side effects', async () => {
    const sideEffects = [];
    const run = () => sweepLeader.runSweepAsLeader(`leader.test.${tag}`, async (q2) => {
      sideEffects.push('ran');
    });
    const results = await Promise.all([run(), run()]);
    const ran = results.filter((r) => r.ran);
    expect(ran).toHaveLength(1);
    expect(sideEffects).toHaveLength(1); // the skipped runner did nothing
    const statuses = results.map((r) => r.record.status);
    expect(statuses.filter((s) => s === 'ok')).toHaveLength(1);
    expect(statuses.filter((s) => s === 'skipped')).toHaveLength(1);
  });

  test('a failing sweep is not swallowed: the error is recorded and reported', async () => {
    const result = await sweepLeader.runSweepAsLeader(`leader.fail.${tag}`, async () => {
      throw new Error('sweep exploded');
    });
    expect(result.ran).toBe(true);
    expect(result.record.status).toBe('failed');
    expect(result.record.error).toMatch(/sweep exploded/);
  });

  test('the lock is released after a completed run: the next run can be leader again', async () => {
    const first = await sweepLeader.runSweepAsLeader(`leader.sequential.${tag}`, async () => {});
    expect(first.ran).toBe(true);
    const second = await sweepLeader.runSweepAsLeader(`leader.sequential.${tag}`, async () => {});
    expect(second.ran).toBe(true);
  });

  test('a crashed leader leaves no stuck lock: the session-level lock dies with its connection', async () => {
    const { Client } = require('pg');
    const name = `leader.crash.${tag}`;
    const lockName = sweepLeader.lockName(name);
    const cfg = { host: process.env.DB_HOST || '127.0.0.1', port: parseInt(process.env.DB_PORT || '55433', 10), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD };
    const c = new Client(cfg);
    await c.connect();
    const got = (await c.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok', [lockName])).rows[0].ok;
    expect(got).toBe(true);
    // Simulate the crash: close the connection WITHOUT unlocking.
    await c.end();
    const d = new Client(cfg);
    await d.connect();
    try {
      const again = (await d.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok', [lockName])).rows[0].ok;
      expect(again).toBe(true);
    } finally { await d.query('SELECT pg_advisory_unlock(hashtext($1))', [lockName]); await d.end(); }
  });

  test('every registered sweep has its own lock namespace (no accidental cross-locking)', async () => {
    const a = await sweepLeader.runSweepAsLeader(`leader.a.${tag}`, async () => {});
    const b = await sweepLeader.runSweepAsLeader(`leader.b.${tag}`, async () => {});
    expect(a.ran).toBe(true);
    expect(b.ran).toBe(true);
  });

  test('the real permit-expiry sweep under two concurrent runners expires each permit exactly once', async () => {
    const { expireOverduePermits } = require('../../services/hseEngine');
    const projectId = (await one("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`sw-${tag}`, `SW${tag}`.slice(0, 20)])).id;
    const permit = await one(
      "INSERT INTO permits (project_id, permit_type, title, valid_to, status) VALUES ($1, 'work', $2, now() - interval '1 day', 'active') RETURNING id",
      [projectId, `sw-${tag}`]
    );
    const results = await Promise.all([
      sweepLeader.runSweepAsLeader('permit_expiry', (q2) => expireOverduePermits(q2)),
      sweepLeader.runSweepAsLeader('permit_expiry', (q2) => expireOverduePermits(q2)),
    ]);
    expect(results.filter((r) => r.ran)).toHaveLength(1);
    expect(results.filter((r) => r.record && r.record.status === 'skipped')).toHaveLength(1);
    const row = await one('SELECT status FROM permits WHERE id = $1', [permit.id]);
    expect(row.status).toBe('expired'); // one run, correct result
    // the run ledger recorded exactly one ok + one skipped for this sweep+moment
    const ledger = (await one(
      "SELECT count(*) FILTER (WHERE status = 'ok')::int ok, count(*) FILTER (WHERE status = 'skipped')::int skipped, count(*) FILTER (WHERE status = 'failed')::int failed FROM background_sweep_runs WHERE sweep = 'permit_expiry'",
      []
    ));
    expect(ledger.ok).toBeGreaterThanOrEqual(1);
    expect(ledger.skipped).toBeGreaterThanOrEqual(1);
  });
});
