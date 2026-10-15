'use strict';

// Rank foreign-key constraints whose referencing columns have no full, left-prefix B-tree index.
// The R3 performance gate invokes this against its disposable database only.
const { Client } = require('pg');

function assertSafeTarget(env = process.env) {
  if (env.APP_ENV !== 'test' || env.DB_NAME !== 'erp_r3_perf_test') {
    throw new Error('R3 FK index audit requires APP_ENV=test and DB_NAME=erp_r3_perf_test');
  }
  if (!['127.0.0.1', 'localhost', '::1'].includes(String(env.DB_HOST).toLowerCase())) {
    throw new Error('R3 FK index audit requires a loopback DB_HOST');
  }
  if (!env.DB_PASSWORD || !env.DB_USER) throw new Error('R3 FK index audit requires process-only DB credentials');
}

async function main() {
  assertSafeTarget();
  const db = new Client({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT), database: process.env.DB_NAME,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  });
  await db.connect();
  try {
    const rows = (await db.query(`
      WITH foreign_keys AS (
        SELECT c.conrelid AS table_oid, c.conname,
               c.conkey::smallint[] AS key_attnums,
               array_agg(a.attname::text ORDER BY k.ordinality) AS key_columns
          FROM pg_constraint c
          JOIN pg_namespace n ON n.oid = c.connamespace
          JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum, ordinality) ON true
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
         WHERE c.contype = 'f' AND n.nspname = 'public'
         GROUP BY c.conrelid, c.conname, c.conkey
      ), coverage AS (
        SELECT f.*,
               NOT EXISTS (
                 SELECT 1 FROM pg_index i
                  WHERE i.indrelid = f.table_oid AND i.indisvalid AND i.indisready
                    AND i.indpred IS NULL AND i.indnkeyatts >= cardinality(f.key_attnums)
                    AND (
                      SELECT array_agg(k.attnum::smallint ORDER BY k.ordinality)
                        FROM unnest(i.indkey) WITH ORDINALITY k(attnum, ordinality)
                       WHERE k.ordinality <= cardinality(f.key_attnums)
                    ) = f.key_attnums
               ) AS missing_index
          FROM foreign_keys f
      )
      SELECT c.relname AS table_name, count(*)::int AS fk_constraints,
             sum(cardinality(f.key_attnums))::int AS fk_columns,
             round(c.reltuples)::bigint AS estimated_rows,
             array_agg(f.key_columns::text ORDER BY f.key_columns::text) AS columns
        FROM coverage f JOIN pg_class c ON c.oid = f.table_oid
       WHERE f.missing_index
       GROUP BY c.relname, c.reltuples
       ORDER BY c.reltuples DESC, count(*) DESC, c.relname
    `)).rows;
    const constraints = rows.reduce((sum, row) => sum + Number(row.fk_constraints), 0);
    const columns = rows.reduce((sum, row) => sum + Number(row.fk_columns), 0);
    console.log(`FK_INDEX_AUDIT missing_constraints=${constraints}; missing_fk_columns=${columns}; ranked_tables=${rows.length}`);
    for (const row of rows.slice(0, 30)) {
      console.log(`FK_INDEX_RANK table=${row.table_name}; estimated_rows=${row.estimated_rows}; constraints=${row.fk_constraints}; columns=${row.columns.join(',')}`);
    }
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(`R3 FK index audit failed: ${error.message}`);
  process.exitCode = 1;
});
