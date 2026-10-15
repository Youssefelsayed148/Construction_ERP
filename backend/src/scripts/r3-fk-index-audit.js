'use strict';

// Rank foreign-key constraints whose referencing columns have no full, left-prefix B-tree index.
// The R3 performance gate invokes this against its disposable database only.
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

function sourceFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(filename);
    return /\.(js|sql)$/.test(entry.name) && !filename.includes(`${path.sep}__tests__${path.sep}`) ? [filename] : [];
  });
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
        SELECT c.conrelid AS table_oid, c.confrelid AS parent_oid, c.conname,
               c.conkey::smallint[] AS key_attnums,
               array_agg(a.attname::text ORDER BY k.ordinality) AS key_columns,
               array_agg(pa.attname::text ORDER BY k.ordinality) AS parent_columns
          FROM pg_constraint c
          JOIN pg_namespace n ON n.oid = c.connamespace
          JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum, ordinality) ON true
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
          JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[k.ordinality]
         WHERE c.contype = 'f' AND n.nspname = 'public'
         GROUP BY c.conrelid, c.confrelid, c.conname, c.conkey
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
      SELECT c.relname AS table_name, f.conname AS constraint_name,
             p.relname AS parent_table, f.key_columns, f.parent_columns,
             cardinality(f.key_attnums)::int AS fk_columns,
             round(c.reltuples)::bigint AS estimated_rows
        FROM coverage f JOIN pg_class c ON c.oid = f.table_oid
        JOIN pg_class p ON p.oid = f.parent_oid
       WHERE f.missing_index
       ORDER BY c.reltuples DESC, cardinality(f.key_attnums) DESC, c.relname, f.conname
    `)).rows;
    const files = sourceFiles(path.join(__dirname, '..', 'routes')).concat(sourceFiles(path.join(__dirname, '..', 'services')));
    const ranked = rows.flatMap((row) => row.key_columns.map((column, index) => {
      const re = new RegExp(`\\b${escapeRegex(column)}\\b`, 'i');
      const sourceUseFiles = files.filter((filename) => {
        const source = fs.readFileSync(filename, 'utf8');
        return re.test(source) && new RegExp(`\\b${row.table_name}\\b`, 'i').test(source);
      });
      const estimatedRows = Math.max(0, Number(row.estimated_rows));
      const score = estimatedRows * (1 + Math.min(sourceUseFiles.length, 5));
      return {
        table: row.table_name, column, parent: `${row.parent_table}.${row.parent_columns[index]}`,
        constraint: row.constraint_name, estimatedRows, sourceFiles: sourceUseFiles.length, score,
      };
    })).sort((a, b) => b.score - a.score || b.estimatedRows - a.estimatedRows || a.table.localeCompare(b.table) || a.column.localeCompare(b.column));
    const constraints = new Set(rows.map((row) => `${row.table_name}.${row.constraint_name}`)).size;
    const columns = ranked.length;
    console.log(`FK_INDEX_AUDIT missing_constraints=${constraints}; missing_fk_columns=${columns}; ranked_columns=${ranked.length}`);
    for (const row of ranked.slice(0, 30)) {
      console.log(`FK_INDEX_RANK table=${row.table}; column=${row.column}; parent=${row.parent}; estimated_rows=${row.estimatedRows}; source_files=${row.sourceFiles}; score=${row.score}`);
    }
    if (process.argv.includes('--write-plan')) {
      const table = [
        '# R3 foreign-key index plan', '',
        'Generated from the current disposable database after all migrations. The review report found 472 uncovered FK columns on 2026-10-14; this current schema audit reports the count below because later migrations add constraints. Each row is one uncovered referencing column. Composite constraints appear once per column and share a constraint name.', '',
        `Current audit: ${constraints} uncovered FK constraints across ${columns} columns.`, '',
        'Ranking method: table row estimate x (1 + min(5, distinct route/service source files containing both table and FK-column tokens)). The base factor represents parent-delete FK checks; source-file co-occurrence approximates read/join use. It is a reproducible prioritization signal, not a query-plan counter. Fresh tables with unknown row estimates receive score 0 and remain listed below the measured relations.', '',
        '## Selected in migration 0067', '',
        '- `journal_entry_lines.account_id`: 300k-row ledger child table and account joins; full FK index added.',
        '- `purchase_orders.project_id`: 100k-row table; measured project list/filter plan and route use; composite project/time/ID index added.',
        '- `payments.supplier_id`: 150k-row payment table; frequent supplier spend joins/restrictions; FK index added.',
        '- `payment_allocations.supplier_invoice_id`: payment allocation to AP invoice; full FK index added.',
        '- `project_costs.project_id`: shared project cost totals/details; project/date index added.',
        '- `invoices.created_at` is not an FK but the measured invoice list bottleneck; covering index added.', '',
        '## Candidates deliberately skipped in 0067', '',
        '- The open-invoice status/amount aggregate: its 50%-selective benchmark plan stayed a parallel sequential scan after a trial partial index, so that index was removed before finalizing migration 0067.',
        '- Remaining uncovered FK columns on invoices, payments, payment_allocations, purchase_orders, and all smaller or unseeded relations: retained in the ranked inventory below; no broad index sweep without workload evidence because each index adds write/storage cost.',
        '- Tables with unknown `reltuples` are marked 0 in the score and need representative fixture volumes or production-like query evidence before promotion.', '',
        '## Ranked uncovered FK columns', '',
        '| Rank | Child FK column | References | Constraint | Estimated child rows | Route/service files with both tokens | Score | Why deferred from 0067 |',
        '|---:|---|---|---|---:|---:|---:|---|',
        ...ranked.map((row, index) => {
          const reason = row.estimatedRows > 0
            ? 'No measured R3 query/delete plan for this specific FK; retain rank for workload follow-up.'
            : 'Child-table volume is unknown in the disposable workload; seed representative data before indexing.';
          return `| ${index + 1} | \`${row.table}.${row.column}\` | \`${row.parent}\` | \`${row.constraint}\` | ${row.estimatedRows || 'unknown'} | ${row.sourceFiles} | ${row.score} | ${reason} |`;
        }),
        '',
      ].join('\n');
      const target = path.resolve(__dirname, '..', '..', '..', 'docs', 'R3_FK_INDEX_PLAN.md');
      fs.writeFileSync(target, table, 'utf8');
      console.log(`FK_INDEX_PLAN written=${path.relative(path.resolve(__dirname, '..', '..', '..'), target)}; rows=${ranked.length}`);
    }
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(`R3 FK index audit failed: ${error.message}`);
  process.exitCode = 1;
});
