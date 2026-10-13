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
const { checksumOf } = require('./src/scripts/migration-support');

function compareVersionedMigrationInventory(dir, appliedRows) {
  const files = fs.readdirSync(dir).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
  const expected = new Map(files.map((file) => [file, checksumOf(path.join(dir, file))]));
  const applied = new Map((appliedRows || []).map((row) => [row.version, row.checksum]));
  const missing = [...expected.keys()].filter((file) => !applied.has(file));
  const unexpected = [...applied.keys()].filter((file) => !expected.has(file));
  const checksumMismatch = [...expected.keys()].filter((file) => applied.has(file) && applied.get(file) !== expected.get(file));
  return { missing, unexpected, checksumMismatch };
}

async function globalSetup() {
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
    const appliedRows = (await client.query(
      "SELECT version, checksum FROM schema_migrations WHERE kind = 'versioned' ORDER BY version"
    )).rows;
    const inventory = compareVersionedMigrationInventory(dir, appliedRows);
    if (inventory.missing.length || inventory.unexpected.length || inventory.checksumMismatch.length) {
      throw new Error(`Versioned migration inventory does not match disk. Missing: ${inventory.missing.join(', ') || 'none'}; unexpected: ${inventory.unexpected.join(', ') || 'none'}; checksum mismatch: ${inventory.checksumMismatch.join(', ') || 'none'}. Run "npm run migrate" first.`);
    }
  } finally { await client.end(); }
}

module.exports = globalSetup;
module.exports.compareVersionedMigrationInventory = compareVersionedMigrationInventory;
