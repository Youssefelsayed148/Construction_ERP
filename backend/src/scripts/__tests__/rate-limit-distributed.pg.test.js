'use strict';

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('R4.2 distributed rate limiter (real PostgreSQL)', () => {
  let db;
  const tag = String(Date.now());
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];

  beforeAll(() => { db = require('../../config/database'); });
  afterAll(async () => { if (db) await db.pool.end(); });

  test('atomic upserts enforce one count across concurrent limiter instances', async () => {
    const { createPostgresRateLimit } = require('../../middleware/postgresRateLimit');
    const firstLimiter = createPostgresRateLimit({ scope: 'pg_test', windowMs: 60_000, limit: 15, query: db.query });
    const secondLimiter = createPostgresRateLimit({ scope: 'pg_test', windowMs: 60_000, limit: 15, query: db.query });
    const outcomes = await Promise.all(Array.from({ length: 40 }, (_, i) => {
      const response = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
      const next = jest.fn();
      const limiter = i % 2 ? firstLimiter : secondLimiter;
      return limiter({ ip: `r4-${tag}` }, response, next).then(() => ({ response, next }));
    }));
    expect(outcomes.filter((item) => item.next.mock.calls.length === 1)).toHaveLength(15);
    expect(outcomes.filter((item) => item.response.statusCode === 429)).toHaveLength(25);
    const stored = await one('SELECT hit_count FROM distributed_rate_limits WHERE scope=$1 AND subject_hash=$2', [
      'pg_test', require('crypto').createHash('sha256').update(`pg_test\0r4-${tag}`).digest('hex'),
    ]);
    expect(stored.hit_count).toBe(40);
  });

  test('migration 0068 is repeatable and retains only hashed subject keys', async () => {
    const fs = require('fs');
    const path = require('path');
    const migration = fs.readFileSync(path.resolve(__dirname, '../../migrations/0068_r4_distributed_rate_limits.sql'), 'utf8');
    await db.query(migration);
    const result = await db.query("SELECT to_regclass('distributed_rate_limits') AS table_name");
    expect(result.rows[0].table_name).toBe('distributed_rate_limits');
    const rows = await db.query('SELECT subject_hash FROM distributed_rate_limits WHERE scope=$1', ['pg_test']);
    expect(rows.rows.every((row) => /^[0-9a-f]{64}$/.test(row.subject_hash.trim()))).toBe(true);
  });
});
