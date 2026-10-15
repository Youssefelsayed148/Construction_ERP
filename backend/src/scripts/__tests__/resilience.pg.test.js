'use strict';

const { EventEmitter } = require('events');
const { Client } = require('pg');
const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('R4.3 PostgreSQL resilience (real PostgreSQL)', () => {
  let db;

  beforeAll(() => { db = require('../../config/database'); });
  afterAll(async () => { if (db) await db.pool.end(); });

  test('new pool sessions have bounded statement and idle-transaction timeouts', async () => {
    const result = await db.query("SELECT current_setting('statement_timeout') AS statement_timeout, current_setting('idle_in_transaction_session_timeout') AS idle_timeout");
    expect(result.rows[0].statement_timeout).toBe('30s');
    expect(result.rows[0].idle_timeout).toBe('1min');
  });

  test('statement timeout maps to 504 and transaction rollback returns its connection cleanly', async () => {
    await expect(db.transaction(async (client) => {
      await client.query("SET LOCAL statement_timeout = '100ms'");
      await client.query('SELECT pg_sleep(2)');
    })).rejects.toMatchObject({ status: 504, error_code: 'database_timeout', error_key: 'errors.databaseTimeout' });
    const leaked = await db.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND usename=current_user AND state='idle in transaction' AND pid <> pg_backend_pid()");
    expect(leaked.rows[0].count).toBe(0);
    expect(db.pool.waitingCount).toBe(0);
  });

  test('closing a client during a long report read destroys its database connection', async () => {
    const req = new EventEmitter();
    req.aborted = false;
    const res = new EventEmitter();
    res.writableEnded = false;
    res.destroyed = false;
    const before = Date.now();
    let backendPid;
    const pending = db.queryCancellable(req, res, 'SELECT pg_sleep(10)', [], { onBackendPid: (pid) => { backendPid = pid; } });
    await new Promise((resolve) => setTimeout(resolve, 100));
    res.emit('close');
    await expect(pending).rejects.toMatchObject({ status: 503, error_code: 'database_unavailable' });
    expect(Date.now() - before).toBeLessThan(3000);
    expect(db.pool.waitingCount).toBe(0);
    const observer = new Client(db.pool.options);
    await observer.connect();
    try {
      let active = true;
      for (let i = 0; i < 30 && active; i += 1) {
        const result = await observer.query("SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND state='active'", [backendPid]);
        active = result.rowCount > 0;
        if (active) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(active).toBe(false);
    } finally { await observer.end(); }
  });
});
