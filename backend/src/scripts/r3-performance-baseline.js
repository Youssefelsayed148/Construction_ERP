'use strict';

// R3.0 disposable-database benchmark fixture. Never points at a non-loopback or
// non-test database. Creates representative ERP volumes and prints measured
// query plans before the R3 fixes; the caller owns and removes the container.
const { Client, Pool } = require('pg');
const { performance } = require('perf_hooks');
const financeEngine = require('../services/financeEngine');

function assertSafeTarget(env = process.env) {
  if (env.APP_ENV !== 'test' || env.DB_NAME !== 'erp_r3_perf_test') {
    throw new Error('R3 baseline requires APP_ENV=test and DB_NAME=erp_r3_perf_test');
  }
  if (!['127.0.0.1', 'localhost', '::1'].includes(String(env.DB_HOST).toLowerCase())) {
    throw new Error('R3 baseline requires a loopback DB_HOST');
  }
  if (!env.DB_PASSWORD || !env.DB_USER) throw new Error('R3 baseline requires process-only DB credentials');
}

async function main() {
  assertSafeTarget();
  const db = new Client({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT), database: process.env.DB_NAME,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  });
  await db.connect();
  try {
    await db.query('BEGIN');
    const clientId = (await db.query(
      "INSERT INTO clients (code, name_en, name_ar) VALUES ('R3-PERF-CLIENT', 'R3 performance fixture', 'R3 performance fixture') RETURNING id"
    )).rows[0].id;
    const projectId = (await db.query(
      "INSERT INTO projects (name, name_en, name_ar, code, client_id, status) VALUES ('R3 performance fixture', 'R3 performance fixture', 'R3 performance fixture', 'R3-PERF-PROJECT', $1, 'active') RETURNING id",
      [clientId]
    )).rows[0].id;
    const materialId = (await db.query(
      "INSERT INTO item_master (code, category, name_en, name_ar) VALUES ('R3-PERF-MATERIAL', 'benchmark', 'R3 performance fixture', 'R3 performance fixture') RETURNING id"
    )).rows[0].id;

    await db.query(`
      INSERT INTO invoices (invoice_number, project_id, client_id, amount, net_amount, credited_amount,
                            issue_date, due_date, status, created_at, updated_at)
      SELECT 'R3-PERF-INV-' || lpad(g::text, 6, '0'), $1, $2, 1000, 1000, 0,
             CURRENT_DATE - (g % 365), CURRENT_DATE - (g % 120), 'sent',
             NOW() - (g * INTERVAL '1 second'), NOW() - (g * INTERVAL '1 second')
        FROM generate_series(1, 150000) AS g`, [projectId, clientId]);
    await db.query(`
      INSERT INTO purchase_orders (order_number, project_id, material_id, quantity, unit_price,
                                    total_amount, status, source_type, created_at, updated_at)
      SELECT 'R3-PERF-PO-' || lpad(g::text, 6, '0'), $1, $2, 10, 100, 1000, 'issued', 'benchmark',
             NOW() - (g * INTERVAL '1 second'), NOW() - (g * INTERVAL '1 second')
        FROM generate_series(1, 100000) AS g`, [projectId, materialId]);
    await db.query(`
      INSERT INTO payments (invoice_id, project_id, client_id, amount, payment_date, direction)
      SELECT id, $1, $2, 100, CURRENT_DATE, 'ar'
        FROM invoices WHERE invoice_number LIKE 'R3-PERF-INV-%'`, [projectId, clientId]);
    await db.query(`
      INSERT INTO payment_allocations (payment_id, target_type, invoice_id, amount)
      SELECT p.id, 'client_invoice', p.invoice_id, 100
        FROM payments p JOIN invoices i ON i.id = p.invoice_id
       WHERE i.invoice_number LIKE 'R3-PERF-INV-%'`);
    await db.query(`
      INSERT INTO commitments (commitment_number, project_id, source_type, source_id, original_amount, status)
      SELECT 'R3-PERF-CM-' || lpad(g::text, 6, '0'), $1, 'benchmark', g, 1000, 'active'
        FROM generate_series(1, 75000) AS g`, [projectId]);

    const accountIds = (await db.query(`
      INSERT INTO accounts (code, name, type)
      VALUES ('R3P-D', 'R3 performance debit', 'expense'), ('R3P-C', 'R3 performance credit', 'income')
      ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id, code`)).rows;
    const debitAccount = accountIds.find((a) => a.code === 'R3P-D').id;
    const creditAccount = accountIds.find((a) => a.code === 'R3P-C').id;
    const journalIds = [];
    for (let i = 1; i <= 3; i++) {
      journalIds.push((await db.query(
        `INSERT INTO journal_entries (entry_number, date, description, total_amount)
         VALUES ($1, CURRENT_DATE, 'R3 performance fixture', 5000000) RETURNING id`, [`R3-PERF-JE-${i}`]
      )).rows[0].id);
    }
    // This bulk statement stays under the active balance triggers; the deferred
    // validation must check each of its three entries at commit.
    const journalSeedStarted = performance.now();
    await db.query(`
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, line_order)
      SELECT $1::int + ((g - 1) / 100000)::int,
             CASE WHEN g % 2 = 0 THEN $2::int ELSE $3::int END,
             CASE WHEN g % 2 = 0 THEN 100 ELSE 0 END,
             CASE WHEN g % 2 = 0 THEN 0 ELSE 100 END,
             g
        FROM generate_series(1, 300000) AS g`, [journalIds[0], debitAccount, creditAccount]);
    const unbalanced = await db.query(`
      SELECT journal_entry_id FROM journal_entry_lines
       WHERE journal_entry_id = ANY($1::int[]) GROUP BY journal_entry_id
       HAVING SUM(debit) <> SUM(credit)`, [journalIds]);
    if (unbalanced.rowCount) throw new Error('R3 benchmark journal fixture is unbalanced');
    await db.query('COMMIT');
    console.log(`journal_bulk_insert_and_balance_commit_ms=${(performance.now() - journalSeedStarted).toFixed(2)}`);

    await db.query('ANALYZE invoices');
    await db.query('ANALYZE payments');
    await db.query('ANALYZE payment_allocations');
    await db.query('ANALYZE purchase_orders');
    await db.query('ANALYZE journal_entry_lines');
    const volumes = (await db.query(`
      SELECT 'invoices' AS relation, count(*)::bigint AS rows FROM invoices WHERE invoice_number LIKE 'R3-PERF-INV-%'
      UNION ALL SELECT 'purchase_orders', count(*)::bigint FROM purchase_orders WHERE order_number LIKE 'R3-PERF-PO-%'
      UNION ALL SELECT 'commitments', count(*)::bigint FROM commitments WHERE commitment_number LIKE 'R3-PERF-CM-%'
      UNION ALL SELECT 'payments', count(*)::bigint FROM payments p JOIN invoices i ON i.id = p.invoice_id WHERE i.invoice_number LIKE 'R3-PERF-INV-%'
      UNION ALL SELECT 'payment_allocations', count(*)::bigint FROM payment_allocations a JOIN invoices i ON i.id = a.invoice_id WHERE i.invoice_number LIKE 'R3-PERF-INV-%'
      UNION ALL SELECT 'journal_entry_lines', count(*)::bigint FROM journal_entry_lines WHERE journal_entry_id = ANY($1::int[])
    `, [journalIds])).rows;
    console.log(`fixture project_id=${projectId}; invoice_count=150000; payment_count=150000; allocation_count=150000; purchase_order_count=100000; commitment_count=75000; journal_entry_line_count=300000; balance_check=PASS`);
    for (const volume of volumes) console.log(`rows ${volume.relation}=${volume.rows}`);

    const plans = [
      ['journal entry line balance lookup', 'SELECT SUM(debit), SUM(credit) FROM journal_entry_lines WHERE journal_entry_id = $1', [journalIds[0]]],
      ['trial balance aggregate by account', 'SELECT account_id, SUM(debit) AS debit, SUM(credit) AS credit FROM journal_entry_lines GROUP BY account_id', []],
      ['invoice list page ordered by created_at', 'SELECT id, invoice_number, amount FROM invoices ORDER BY created_at DESC LIMIT 100', []],
      ['open invoice status aggregate', "SELECT SUM(amount) FROM invoices WHERE status NOT IN ('draft','cancelled','void','credited','paid')", []],
      ['purchase orders by project and active status', "SELECT id, total_amount, status FROM purchase_orders WHERE project_id = $1 AND status IN ('issued','approved','confirmed') ORDER BY created_at DESC LIMIT 100", [projectId]],
      ['purchase order project list route', 'SELECT * FROM purchase_orders WHERE project_id = $1 ORDER BY created_at DESC, id DESC LIMIT 200', [projectId]],
      ['commitment numbering count', 'SELECT COUNT(*) FROM commitments', []],
    ];
    for (const [label, sql, params] of plans) {
      console.log(`\nPLAN ${label}`);
      const started = performance.now();
      const result = await db.query(`EXPLAIN (ANALYZE, BUFFERS, TIMING) ${sql}`, params);
      console.log(result.rows.map((row) => row['QUERY PLAN']).join('\n'));
      console.log(`plan_wall_ms=${(performance.now() - started).toFixed(2)}`);
    }

    for (const [label, sql, params] of [
      ['current invoice list query', 'SELECT id, invoice_number, amount FROM invoices ORDER BY created_at DESC LIMIT 100', []],
      ['current purchase order project list query', 'SELECT * FROM purchase_orders WHERE project_id = $1 ORDER BY created_at DESC, id DESC LIMIT 200', [projectId]],
      ['project commitment ledger read', 'SELECT * FROM commitments WHERE project_id = $1 ORDER BY id DESC', [projectId]],
    ]) {
      const started = performance.now();
      const result = await db.query(sql, params);
      console.log(`\nQUERY ${label}: rows=${result.rowCount}; elapsed_ms=${(performance.now() - started).toFixed(2)}`);
    }

    const q = (sql, params) => db.query(sql, params);
    for (const [label, operation] of [
      ['aggregate AR ageing service', () => financeEngine.arAging(q)],
      ['aggregate AP ageing service', () => financeEngine.apAging(q)],
    ]) {
      const started = performance.now();
      const buckets = await operation();
      console.log(`\nSERVICE ${label}: elapsed_ms=${(performance.now() - started).toFixed(2)}; buckets=${JSON.stringify(buckets)}`);
    }
    const servicePool = new Pool({
      host: process.env.DB_HOST, port: Number(process.env.DB_PORT), database: process.env.DB_NAME,
      user: process.env.DB_USER, password: process.env.DB_PASSWORD, max: 4,
    });
    try {
      const pooledQuery = (sql, params) => servicePool.query(sql, params);
      const cashFlowStarted = performance.now();
      const [ar, ap, retentionReceivable, retentionPayable] = await Promise.all([
        financeEngine.arAging(pooledQuery),
        financeEngine.apAging(pooledQuery),
        financeEngine.retentionTotals(pooledQuery, { party_type: 'client' }),
        financeEngine.retentionTotals(pooledQuery, { party_type: 'subcontractor' }),
      ]);
      console.log(`\nSERVICE cash-flow data path: elapsed_ms=${(performance.now() - cashFlowStarted).toFixed(2)}; ar=${JSON.stringify(ar)}; ap=${JSON.stringify(ap)}; retention=${JSON.stringify([retentionReceivable.balance, retentionPayable.balance])}`);
    } finally {
      await servicePool.end();
    }
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(`R3 baseline failed: ${error.message}`);
  process.exitCode = 1;
});
