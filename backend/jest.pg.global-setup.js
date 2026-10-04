// Fail fast, with a clear message, before any real-PostgreSQL suite runs (closeout B1):
//   * TEST_PG=1 must be set (the suites would otherwise skip silently);
//   * the database must be reachable within DB_CONNECT_TIMEOUT_MS;
//   * every migration file must be applied (the suites assume migrate-once: `npm run migrate`);
//   * the database must not look like a production one (refuses names containing "prod").
// Isolation model: the schema is migrated ONCE per run; each suite creates its own uniquely tagged rows and
// cleans up what it can (users deactivated, never deleted). There is no transaction-per-test: the suites test
// transactions, locks and constraints themselves, which a wrapping transaction would hide.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

module.exports = async () => {
  if (process.env.TEST_PG !== '1') throw new Error('Real-PG suites need TEST_PG=1 and a migrated throwaway database (see docs/TESTING.md).');
  const name = process.env.DB_NAME || 'construction_erp';
  if (/prod/i.test(name)) throw new Error(`Refusing to run the test suites against a database named "${name}".`);
  const client = new Client({
    host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 5432), database: name,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 5000),
  });
  await client.connect();
  try {
    const dir = path.join(__dirname, 'src', 'migrations');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'));
    const applied = (await client.query('SELECT count(*)::int n FROM schema_migrations')).rows[0].n;
    if (applied < files.length) throw new Error(`Only ${applied} of ${files.length} SQL migrations are applied: run "npm run migrate" first.`);
  } finally { await client.end(); }
};
