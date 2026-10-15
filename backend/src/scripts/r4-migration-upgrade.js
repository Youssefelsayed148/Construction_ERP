// Disposable R4 migration upgrade proof: stop at the prior versioned migration,
// then run the normal migrator and assert it applies only the current head.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Pool } = require('pg');
const { listVersioned, runMigrations } = require('./run-all-migrations');

async function main() {
  const sourceDir = path.join(__dirname, '..', 'migrations');
  const versions = listVersioned(sourceDir);
  if (versions.length < 2) throw new Error('Need at least two versioned migrations for an upgrade proof.');
  const latest = versions[versions.length - 1];
  const previous = versions[versions.length - 2];
  const stagedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-r04-migration-upgrade-'));
  try {
    for (const file of versions.slice(0, -1)) {
      fs.copyFileSync(path.join(sourceDir, file), path.join(stagedDir, file));
    }

    const before = await runMigrations({ versionedDir: stagedDir, log: () => {} });
    if (before.applied.includes(latest)) throw new Error(`Prior-version run unexpectedly applied ${latest}.`);
    const after = await runMigrations({ log: () => {} });
    const latestApplied = after.applied.filter((version) => version === latest);
    if (latestApplied.length !== 1) throw new Error(`Expected ${latest} to apply once; applied ${latestApplied.length} times.`);

    const pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: Number.parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'construction_erp',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
    });
    try {
      const row = await pool.query('SELECT version FROM schema_migrations WHERE version = $1', [latest]);
      if (row.rowCount !== 1) throw new Error(`Migration ledger does not contain ${latest}.`);
      const table = await pool.query("SELECT to_regclass('public.distributed_rate_limits') AS relation");
      if (table.rows[0].relation !== 'distributed_rate_limits') throw new Error('Expected R4 rate-limit table is missing.');
    } finally {
      await pool.end();
    }
    console.log(`migration upgrade PASS: ${previous} -> ${latest}; previous run excluded head; latest applied once`);
  } finally {
    fs.rmSync(stagedDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`migration upgrade FAIL: ${error.message}`);
  process.exitCode = 1;
});
