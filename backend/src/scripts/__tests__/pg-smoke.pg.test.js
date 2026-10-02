// Runs against real PostgreSQL only (npm run test:pg). See jest.pg.config.js.
const { Pool } = require('pg');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('real PostgreSQL smoke', () => {
  let pool;

  beforeAll(() => {
    pool = new Pool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });
  });

  afterAll(async () => { if (pool) await pool.end(); });

  test('runs on PostgreSQL 16 or newer', async () => {
    const { rows } = await pool.query('SHOW server_version_num');
    expect(parseInt(rows[0].server_version_num, 10)).toBeGreaterThanOrEqual(160000);
  });

  test('the migrated schema has the core tables', async () => {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [['users', 'projects', 'stock_movements', 'journal_entries', 'approval_requests', 'numbering_sequences']]
    );
    expect(rows.map((r) => r.table_name).sort()).toEqual(
      ['approval_requests', 'journal_entries', 'numbering_sequences', 'projects', 'stock_movements', 'users']
    );
  });
});
