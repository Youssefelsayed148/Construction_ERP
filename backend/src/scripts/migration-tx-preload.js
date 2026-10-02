// Preloaded (node -r) into every legacy migration script by the runner.
//
// Legacy scripts were written to run statement by statement against the shared pool and
// call process.exit themselves. This puts the whole script in ONE transaction:
//   - all pool queries go through a single client inside BEGIN
//   - each statement runs under a SAVEPOINT, so a script that handles its own error
//     keeps working, while an unhandled error aborts the migration
//   - BEGIN/COMMIT/ROLLBACK issued by the script become savepoints (no nested BEGIN)
//   - process.exit(0) records the migration row and COMMITs; any other exit ROLLBACKs
// A crash drops the connection, which PostgreSQL also rolls back.
const db = require('../config/database');
const { recordMigration } = require('./migration-support');

const { pool } = db;
const realConnect = pool.connect.bind(pool);
const version = process.env.MIGRATION_VERSION;
const table = process.env.MIGRATIONS_TABLE || undefined;

let clientPromise = null;
let depth = 0;
let counter = 0;
const startedAt = Date.now();

function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const c = await realConnect();
      await c.query('BEGIN');
      return c;
    })();
  }
  return clientPromise;
}

const sqlText = (t) => (typeof t === 'string' ? t : (t && t.text) || '');
const is = (re, t) => re.test(sqlText(t));

async function run(text, params) {
  const c = await getClient();
  if (is(/^\s*BEGIN\b/i, text)) { depth += 1; await c.query(`SAVEPOINT tx_${depth}`); return { rows: [], rowCount: 0 }; }
  if (is(/^\s*(COMMIT|END)\b/i, text)) { if (depth > 0) { await c.query(`RELEASE SAVEPOINT tx_${depth}`); depth -= 1; } return { rows: [], rowCount: 0 }; }
  if (is(/^\s*ROLLBACK\s*;?\s*$/i, text)) { if (depth > 0) { await c.query(`ROLLBACK TO SAVEPOINT tx_${depth}`); await c.query(`RELEASE SAVEPOINT tx_${depth}`); depth -= 1; } return { rows: [], rowCount: 0 }; }
  counter += 1;
  const sp = `stmt_${counter}`;
  await c.query(`SAVEPOINT ${sp}`);
  try {
    const res = await c.query(text, params);
    await c.query(`RELEASE SAVEPOINT ${sp}`);
    return res;
  } catch (e) {
    await c.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    await c.query(`RELEASE SAVEPOINT ${sp}`);
    throw e;
  }
}

pool.query = run;
pool.connect = async () => ({ query: run, release() {} });

async function finish(code) {
  if (!clientPromise) return code;
  const c = await clientPromise;
  try {
    if (code !== 0) { await c.query('ROLLBACK'); return code; }
    if (version) {
      await recordMigration((t, p) => c.query(t, p), {
        table, version, kind: 'legacy', checksum: process.env.MIGRATION_CHECKSUM, ms: Date.now() - startedAt,
      });
    }
    await c.query('COMMIT');
    return 0;
  } catch (e) {
    console.error('[migrate] commit failed:', e.message);
    try { await c.query('ROLLBACK'); } catch (_) { /* connection gone: server rolls back */ }
    return 1;
  }
}

const realExit = process.exit.bind(process);
let exiting = false;
process.exit = (code = 0) => {
  if (exiting) return;
  exiting = true;
  finish(code).then(realExit, () => realExit(1));
};
