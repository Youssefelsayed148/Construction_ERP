// Migration runner (Phase 26, versioned in Phase 2.1).
//
// Two kinds of migration, both recorded in schema_migrations with a checksum:
//   legacy     the frozen MIGRATIONS list below (setupDb.js + migrate-N.js). Each script
//              runs in ONE transaction (migration-tx-preload.js) and is skipped once
//              recorded. If its file changed since, it re-runs once (the scripts are
//              idempotent) and the checksum is updated.
//   versioned  src/migrations/NNNN_name.sql, applied in file order, each in one
//              transaction. Forward-only: an applied file must never change (checksum
//              mismatch is fatal). All new schema work goes here.
// A Postgres advisory lock keeps two replicas from migrating at once, and every
// sequence is moved past its data at the end (explicit-id inserts, db_dump).
//
// Run: node src/scripts/run-all-migrations.js
//   --dry-run   list the migrations without running them

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Pool } = require('pg');
const support = require('./migration-support');

// Ordered: base schema first, then phases in commit order.
const MIGRATIONS = [
  'setupDb.js',
  'migrate-1.3.js', 'migrate-1.4.js', 'migrate-2.1.js', 'migrate-2.2.js',
  'migrate-3.js', 'migrate-4.js', 'migrate-5.2.js', 'migrate-7.js',
  'migrate-8.js', 'migrate-9.js', 'migrate-10.js', 'migrate-11.js',
  'migrate-12.js', 'migrate-13.js', 'migrate-14.js', 'migrate-15.js',
  'policy-migration.js', 'migrate-16.js', 'organizations-migration.js',
  'migrate-16-organizations.js', 'migrate-17-policy-engine.js',
  'migrate-18-project-wizard.js', 'project-wizard-migration.js',
  'migrate-19-workflow-engine.js', 'workflow-engine-migration.js',
  'migrate-20-action-engine.js', 'action-engine-migration.js',
  'migrate-21-locations-quantities.js', 'location-quantity-migration.js',
  'migrate-22-material-planning.js', 'material-planning-migration.js',
  'migrate-23-inventory.js', 'inventory-migration.js',
  'migrate-24-replenishment.js', 'replenishment-migration.js',
  'migrate-25-procurement.js', 'procurement-migration.js',
  'migrate-26-commercial.js', 'commercial-migration.js',
  'migrate-27-finance.js', 'finance-migration.js',
  'migrate-28-site.js', 'site-migration.js',
  'migrate-29-consultant.js', 'consultant-migration.js',
  'migrate-30-portals.js', 'portal-migration.js',
  'migrate-31-qaqc.js', 'qaqc-migration.js',
  'migrate-32-hse.js', 'hse-migration.js',
  'migrate-33-doccontrol.js', 'doccontrol-migration.js',
  'migrate-34-planning.js', 'planning-migration.js',
  'migrate-35-reporting.js', 'reporting-migration.js',
  'migrate-36-handover.js', 'handover-migration.js',
  'migrate-37-external-api.js', 'migrate-38-agent-layer.js',
  'migrate-39-project-scope-hardening.js',
];

const VERSIONED_DIR = path.join(__dirname, '..', 'migrations');
const PRELOAD = path.join(__dirname, 'migration-tx-preload.js');

function runScript(script, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['-r', PRELOAD, script], { stdio: 'inherit', env: { ...process.env, ...env } });
    child.on('exit', (code) => resolve(code || 0));
  });
}

function poolFromEnv() {
  return new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'construction_erp',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  });
}

// setupDb.js creates the database on a brand-new server; the runner needs it first for its lock and ledger.
async function ensureDatabase() {
  const name = process.env.DB_NAME || 'construction_erp';
  const probe = poolFromEnv();
  try {
    await probe.query('SELECT 1');
    return;
  } catch (e) {
    if (e.code !== '3D000') throw e;
  } finally {
    await probe.end().catch(() => {});
  }
  const admin = new Pool({
    host: process.env.DB_HOST || 'localhost', port: parseInt(process.env.DB_PORT || '5432', 10),
    database: 'postgres', user: process.env.DB_USER || 'postgres', password: process.env.DB_PASSWORD || '',
  });
  try {
    await admin.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
    console.log(`[migrate] created database ${name}`);
  } finally {
    await admin.end();
  }
}

function listVersioned(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
}

// Applies pending migrations. Returns { applied: [...], skipped: [...] }. Throws on a failed or modified migration.
async function runMigrations({
  legacy = [...new Set(MIGRATIONS)], scriptsDir = __dirname, versionedDir = VERSIONED_DIR,
  table = support.DEFAULT_TABLE, log = console.log,
} = {}) {
  await ensureDatabase();
  const pool = poolFromEnv();
  const lock = await pool.connect();
  const q = (t, p) => lock.query(t, p);
  const result = { applied: [], skipped: [] };
  try {
    await q('SELECT pg_advisory_lock($1)', [support.LOCK_KEY]);
    await support.ensureMigrationsTable(q, table);
    const seen = new Map((await q(`SELECT version, checksum FROM "${table}"`)).rows.map((r) => [r.version, r.checksum]));

    for (const file of legacy) {
      const script = path.join(scriptsDir, file);
      if (!fs.existsSync(script)) { log(`[migrate] missing (skipped): ${file}`); continue; }
      const checksum = support.checksumOf(script);
      if (seen.get(file) === checksum) { result.skipped.push(file); continue; }
      log(`[migrate] ${file}${seen.has(file) ? ' (changed since last run)' : ''} ...`);
      const exit = await runScript(script, { MIGRATION_VERSION: file, MIGRATION_CHECKSUM: checksum, MIGRATIONS_TABLE: table });
      if (exit !== 0) throw new Error(`${file} failed (exit ${exit}); its transaction was rolled back and later migrations were not run`);
      // Library modules (no DB work, no process.exit) never reach the preload's commit; record them here.
      const row = (await q(`SELECT checksum FROM "${table}" WHERE version = $1`, [file])).rows[0];
      if (!row || row.checksum !== checksum) await support.recordMigration(q, { table, version: file, kind: 'legacy', checksum });
      result.applied.push(file);
    }

    for (const file of listVersioned(versionedDir)) {
      const full = path.join(versionedDir, file);
      const checksum = support.checksumOf(full);
      if (seen.has(file)) {
        if (seen.get(file) !== checksum) throw new Error(`${file} was modified after it was applied; migrations are forward-only, add a new one`);
        result.skipped.push(file);
        continue;
      }
      log(`[migrate] ${file} ...`);
      const started = Date.now();
      await q('BEGIN');
      try {
        await q(fs.readFileSync(full, 'utf8'));
        await support.recordMigration(q, { table, version: file, kind: 'versioned', checksum, ms: Date.now() - started });
        await q('COMMIT');
      } catch (e) {
        await q('ROLLBACK');
        throw new Error(`${file} failed and was rolled back: ${e.message}`);
      }
      result.applied.push(file);
    }

    await q('BEGIN');
    try { await support.fixAllSequences(q); await q('COMMIT'); } catch (e) { await q('ROLLBACK'); throw e; }
    return result;
  } finally {
    try { await q('SELECT pg_advisory_unlock($1)', [support.LOCK_KEY]); } catch (_) { /* connection closing */ }
    lock.release();
    await pool.end();
  }
}

async function run() {
  if (process.argv.includes('--dry-run')) {
    console.log('Migrations that would run:');
    [...new Set(MIGRATIONS)].forEach((m) => console.log('  ' + m));
    listVersioned(VERSIONED_DIR).forEach((m) => console.log('  ' + m));
    process.exit(0);
  }
  try {
    const { applied, skipped } = await runMigrations();
    console.log(`[migrate] all migrations completed (${applied.length} applied, ${skipped.length} already applied)`);
    process.exit(0);
  } catch (e) {
    console.error(`[migrate] FAILED: ${e.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  run();
}

module.exports = { MIGRATIONS, run, runScript, runMigrations, listVersioned };
