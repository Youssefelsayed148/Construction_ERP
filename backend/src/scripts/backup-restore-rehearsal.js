'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const backendRoot = path.join(repoRoot, 'backend');
require('dotenv').config({ path: path.join(repoRoot, '.env.docker') });

function assertSafeRehearsalTarget(env = process.env) {
  if (env.APP_ENV !== 'staging') throw new Error('Refusing backup rehearsal: APP_ENV must be exactly staging');
  if (!/(^|[_-])(staging|stage|test)([_-]|$)/i.test(env.DB_NAME || '')) {
    throw new Error('Refusing backup rehearsal: DB_NAME must contain a staging, stage, or test segment');
  }
  if (!['127.0.0.1', 'localhost', '::1'].includes(String(env.DB_HOST || '').toLowerCase())) {
    throw new Error('Refusing backup rehearsal: DB_HOST must be loopback');
  }
  if (!/^[a-zA-Z0-9_-]{3,55}$/.test(env.DB_USER || '')) {
    throw new Error('Refusing backup rehearsal: DB_USER must be a simple local role name');
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8', windowsHide: true, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${args[0] || ''} failed (exit ${result.status})${detail ? `: ${detail}` : ''}`);
  }
  return result.stdout || '';
}

function composeArgs(...args) {
  return ['compose', '--project-name', process.env.COMPOSE_PROJECT_NAME || 'erp-closeout-pilot-20261013',
    '--env-file', path.join(repoRoot, '.env.docker'), ...args];
}

async function snapshot(pool) {
  const tables = (await pool.query(
    `SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  )).rows;
  const counts = {};
  for (const { schemaname, tablename } of tables) {
    const identifier = `${schemaname}.${tablename}`.split('.').map((part) => `"${part.replace(/"/g, '""')}"`).join('.');
    const result = await pool.query(`SELECT count(*)::bigint AS count FROM ${identifier}`);
    counts[tablename] = Number(result.rows[0].count);
  }
  const sequences = (await pool.query(
    `SELECT schemaname, sequencename FROM pg_sequences WHERE schemaname = 'public' ORDER BY sequencename`
  )).rows;
  const maxima = {};
  for (const { schemaname, sequencename } of sequences) {
    const identifier = `${schemaname}.${sequencename}`.split('.').map((part) => `"${part.replace(/"/g, '""')}"`).join('.');
    const result = await pool.query(`SELECT last_value, is_called FROM ${identifier}`);
    maxima[sequencename] = { last_value: Number(result.rows[0].last_value), is_called: result.rows[0].is_called };
  }
  return { table_count: tables.length, row_count: Object.values(counts).reduce((sum, value) => sum + value, 0), counts, sequence_maxima: maxima };
}

function summarizeDifferences(before, after) {
  const countDifferences = Object.keys(before.counts).filter((name) => before.counts[name] !== after.counts[name]
    || !(name in after.counts));
  const newTables = Object.keys(after.counts).filter((name) => !(name in before.counts));
  const sequenceDifferences = Object.keys(before.sequence_maxima).filter((name) =>
    JSON.stringify(before.sequence_maxima[name]) !== JSON.stringify(after.sequence_maxima[name])
      || !(name in after.sequence_maxima));
  const newSequences = Object.keys(after.sequence_maxima).filter((name) => !(name in before.sequence_maxima));
  return { countDifferences, newTables, sequenceDifferences, newSequences };
}

async function main(argv = process.argv.slice(2)) {
  assertSafeRehearsalTarget();
  const explicitDir = argv.find((arg) => arg.startsWith('--backup-dir='))?.slice('--backup-dir='.length);
  const backupDir = path.resolve(explicitDir || path.join(os.tmpdir(), `erp-closeout-backup-${Date.now()}`));
  fs.mkdirSync(backupDir, { recursive: true });
  const { Pool } = require('pg');
  const pool = new Pool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), database: process.env.DB_NAME,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, connectionTimeoutMillis: 5000 });
  const runEnv = { ...process.env, DOTENV_CONFIG_PATH: path.join(repoRoot, '.env.docker') };
  const tag = `erp-closeout-${Date.now()}`;
  const dumpInContainer = `/tmp/${tag}.dump`;
  const dumpOnHost = path.join(backupDir, 'database.dump');
  const uploadsOnHost = path.join(backupDir, 'uploads');
  const restoreDb = `${process.env.DB_NAME.slice(0, 40)}_restore_${Date.now()}`;
  let restoreCreated = false;

  try {
    const before = await snapshot(pool);
    run('docker', composeArgs('exec', '-T', 'db', 'pg_dump', '-U', process.env.DB_USER, '-Fc', '-f', dumpInContainer, process.env.DB_NAME));
    run('docker', composeArgs('cp', `db:${dumpInContainer}`, dumpOnHost));
    if (!fs.existsSync(dumpOnHost) || fs.statSync(dumpOnHost).size === 0) throw new Error('Database backup is missing or empty');
    fs.mkdirSync(uploadsOnHost, { recursive: true });
    run('docker', composeArgs('cp', 'backend:/app/uploads/.', uploadsOnHost));
    const uploadFiles = fs.readdirSync(uploadsOnHost, { recursive: true }).filter((name) => fs.statSync(path.join(uploadsOnHost, name)).isFile());
    const uploadBytes = uploadFiles.reduce((sum, name) => sum + fs.statSync(path.join(uploadsOnHost, name)).size, 0);
    console.log(`BACKUP_VERIFIED database=${process.env.DB_NAME} dump_bytes=${fs.statSync(dumpOnHost).size} uploads_files=${uploadFiles.length} uploads_bytes=${uploadBytes}`);

    run('docker', composeArgs('exec', '-T', 'db', 'createdb', '-U', process.env.DB_USER, '-T', 'template0', restoreDb));
    restoreCreated = true;
    run('docker', composeArgs('exec', '-T', 'db', 'pg_restore', '-U', process.env.DB_USER, '--exit-on-error', '-d', restoreDb, dumpInContainer));
    const restorePool = new Pool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), database: restoreDb,
      user: process.env.DB_USER, password: process.env.DB_PASSWORD, connectionTimeoutMillis: 5000 });
    let after;
    try { after = await snapshot(restorePool); } finally { await restorePool.end(); }
    const differences = summarizeDifferences(before, after);
    if (JSON.stringify(differences) !== JSON.stringify({ countDifferences: [], newTables: [], sequenceDifferences: [], newSequences: [] })) {
      throw new Error(`Restored snapshot differs from source: ${JSON.stringify(differences)}`);
    }
    console.log(`RESTORE_VERIFIED database=${restoreDb} tables=${after.table_count} rows=${after.row_count} sequences=${Object.keys(after.sequence_maxima).length}`);
    const reportPath = path.join(backupDir, 'snapshot-before-after.json');
    fs.writeFileSync(reportPath, JSON.stringify({ before, after }, null, 2));
    const coreTables = ['users', 'projects', 'purchase_requests', 'rfqs', 'purchase_orders', 'deliveries',
      'material_inspection_requests', 'goods_receipt_notes', 'supplier_invoices', 'payments', 'journal_entries'];
    const coreCounts = (source) => Object.fromEntries(coreTables.map((name) => [name, source.counts[name] || 0]));
    const activeSequences = (source) => Object.fromEntries(Object.entries(source.sequence_maxima)
      .filter(([, value]) => value.is_called || value.last_value !== 1));
    console.log(`SNAPSHOT_COUNTS ${JSON.stringify({ before: { tables: before.table_count, rows: before.row_count, core: coreCounts(before) }, after: { tables: after.table_count, rows: after.row_count, core: coreCounts(after) } })}`);
    console.log(`SEQUENCE_MAXIMA ${JSON.stringify({ before: activeSequences(before), after: activeSequences(after), all_sequence_count: Object.keys(after.sequence_maxima).length })}`);
    console.log(`SNAPSHOT_REPORT ${reportPath}`);

    // The backup is independently verified before the required flag is set for read-only integrity checks.
    const dryRun = run(process.execPath, ['src/scripts/run-all-migrations.js', '--dry-run'], { cwd: backendRoot, env: runEnv });
    if (!dryRun.includes('Migrations that would run:')) throw new Error('Migration dry-run did not produce its migration inventory');
    console.log(`MIGRATION_DRY_RUN_OK entries=${dryRun.trim().split(/\r?\n/).length - 1}`);
    const restoredEnv = { ...runEnv, DB_NAME: restoreDb, RECONCILIATION_BACKUP_CONFIRMED: 'true' };
    const reconciliation = run(process.execPath, ['src/scripts/reconcile-database.js'], { cwd: backendRoot, env: restoredEnv });
    if (/\b(failed|violations?: [1-9]\d*)\b/i.test(reconciliation)) throw new Error('Database reconciliation reported failures');
    console.log(reconciliation.trim());
    console.log('RECONCILE_OK');
    run(process.execPath, ['src/scripts/data-cleaning-report.js', '--json'], { cwd: backendRoot, env: restoredEnv, stdio: 'inherit' });
    console.log(`BACKUP_RESTORE_REHEARSAL_OK backup_dir=${backupDir}`);
  } finally {
    await pool.end();
    if (restoreCreated) run('docker', composeArgs('exec', '-T', 'db', 'dropdb', '-U', process.env.DB_USER, restoreDb));
    run('docker', composeArgs('exec', '-T', 'db', 'rm', '-f', dumpInContainer));
  }
}

if (require.main === module) main().catch((error) => {
  console.error(`Backup/restore rehearsal failed: ${error.message}`);
  process.exitCode = 1;
});

module.exports = { assertSafeRehearsalTarget, summarizeDifferences, snapshot };
