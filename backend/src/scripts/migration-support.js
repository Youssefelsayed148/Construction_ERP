// Shared helpers for the migration runner and for migrations that copy rows
// with explicit ids. Forward-only, versioned, transactional (Phase 2.1).
const crypto = require('crypto');
const fs = require('fs');

const DEFAULT_TABLE = 'schema_migrations';
const LOCK_KEY = 7240100; // pg_advisory_lock key: one migrator at a time

const ident = (name) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`unsafe identifier: ${name}`);
  return `"${name}"`;
};

const checksumOf = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function ensureMigrationsTable(q, table = DEFAULT_TABLE) {
  await q(`CREATE TABLE IF NOT EXISTS ${ident(table)} (
    version TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('legacy', 'versioned')),
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    execution_ms INTEGER
  )`);
}

async function recordMigration(q, { table = DEFAULT_TABLE, version, kind, checksum, ms }) {
  await q(
    `INSERT INTO ${ident(table)} (version, kind, checksum, execution_ms) VALUES ($1, $2, $3, $4)
     ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = NOW(), execution_ms = EXCLUDED.execution_ms`,
    [version, kind, checksum, ms == null ? null : Math.round(ms)]
  );
}

// Raise one serial/identity sequence to at least MAX(column). Never lowers it,
// so ids that were already handed out are not reissued.
async function setSequenceToMax(q, table, column = 'id') {
  const seq = (await q(`SELECT pg_get_serial_sequence($1, $2) AS seq`, [table, column])).rows[0]?.seq;
  if (!seq) return null;
  const max = (await q(`SELECT MAX(${ident(column)}) AS m FROM ${table.split('.').map(ident).join('.')}`)).rows[0].m;
  if (max == null) return seq;
  const cur = (await q(`SELECT last_value, is_called FROM ${seq}`)).rows[0];
  if (Number(max) > Number(cur.last_value) || (Number(max) === Number(cur.last_value) && !cur.is_called)) {
    await q(`SELECT setval($1::regclass, $2, true)`, [seq, max]);
  }
  return seq;
}

// After explicit-id inserts (seed data, db_dump, copied legacy rows) every owned
// sequence must be moved past the data, or the next INSERT collides on the primary key.
async function fixAllSequences(q) {
  const cols = (await q(
    `SELECT t.table_schema AS s, t.table_name AS t, c.column_name AS c
       FROM information_schema.columns c
       JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
        AND (c.column_default LIKE 'nextval(%' OR c.is_identity = 'YES')`
  )).rows;
  let fixed = 0;
  for (const { s, t, c } of cols) {
    if (await setSequenceToMax(q, `${s}.${t}`, c)) fixed += 1;
  }
  return fixed;
}

module.exports = { DEFAULT_TABLE, LOCK_KEY, checksumOf, ensureMigrationsTable, recordMigration, setSequenceToMax, fixAllSequences };
