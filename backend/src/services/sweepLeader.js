// Phase 3.4 — the advisory-lock leader for the background sweeps.
//
// With N backend instances only one runs a given sweep at a time. The lock is a SESSION-level
// pg_try_advisory_lock taken on a connection the helper opens for the run and never pools: a returned
// pooled session would carry the lock away, so the helper owns its connection end-to-end and the lock is
// released by unlocking (success or failure) and, if the process dies mid-run, by the connection dying —
// Postgres frees session locks of a dead session.
//
// The runner is not a loser's problem: a skipped instance runs nothing and reports why. Failures are
// logged WITH CONTEXT and recorded in background_sweep_runs (migration 0020), which `npm run
// outbox:stats` counts — they are never swallowed silently. Sweeps themselves are passed as the callback;
// their own try/catch behavior is unchanged where it existed.
'use strict';

const { pool, query } = require('../config/database');

const lockName = (sweep) => `conerp-sweep:${sweep}`;

// One run: try the lock; if taken, skip cleanly; otherwise run the sweep, record the run, release the lock.
async function runSweepAsLeader(sweep, fn, { query: q = query } = {}) {
  const client = await pool.connect();
  let record = null;
  let ran = false;
  try {
    const name = lockName(sweep);
    const got = (await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok', [name])).rows[0].ok;
    if (!got) {
      console.log(`[SWEEP] ${sweep}: another instance is the leader — skipping`);
      try {
        await client.query('INSERT INTO background_sweep_runs (sweep, status, finished_at) VALUES ($1, $2, now())', [sweep, 'skipped']);
      } catch (e) {
        // The ledger row is observability, not the sweep: report and move on (the run itself still skipped).
        console.error(`[SWEEP] ${sweep}: could not record the skipped run: ${e.message}`);
      }
      record = { sweep, status: 'skipped' };
      return { ran, record };
    }
    ran = true;
    const started = await client.query(
      'INSERT INTO background_sweep_runs (sweep, status) VALUES ($1, $2) RETURNING id',
      [sweep, 'running']
    );
    try {
      await fn(q);
      await client.query(
        "UPDATE background_sweep_runs SET status = $2, finished_at = now() WHERE id = $1",
        [started.rows[0].id, 'ok']
      );
      record = { sweep, status: 'ok' };
    } catch (e) {
      // Surfaced, not swallowed: the failure is logged with context, recorded (outbox:stats counts it),
      // and reported on the return value. It is NOT rethrown — a sweep error inside a setInterval
      // callback would crash the process instead of leaving the ledger trail.
      await client.query(
        "UPDATE background_sweep_runs SET status = $2, finished_at = now(), error = $3 WHERE id = $1",
        [started.rows[0].id, 'failed', e.message]
      );
      console.error(`[SWEEP] ${sweep} failed: ${e.message}`);
      record = { sweep, status: 'failed', error: e.message };
    }
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock_all() WHERE pg_advisory_unlock(hashtext($1))", [lockName(sweep)]);
    } catch (e) {
      // Connection is being torn down anyway; the session lock dies with it. Logged so it is never silent.
      console.error(`[SWEEP] ${sweep}: lock release failed (the session lock dies with the connection): ${e.message}`);
    }
    client.release();
  }
  return { ran, record };
}

// Interval wrapper used by the init functions: returns the timer; the sweep never double-runs with
// another replica.
function leaderInterval(sweep, intervalMs, fn, { q = query, immediate = false } = {}) {
  const execute = () => runSweepAsLeader(sweep, fn, { query: q });
  const timer = setInterval(execute, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return { timer, execute };
}

module.exports = { lockName, runSweepAsLeader, leaderInterval };
