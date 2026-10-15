// Real PostgreSQL: R3.5's focused query and high-volume FK indexes are present after migration.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Pool } = require('pg');
const { runMigrations } = require('../run-all-migrations');

const describePg = process.env.TEST_PG === '1' ? describe : describe.skip;

describePg('R3.5 ranked query indexes (real PostgreSQL)', () => {
  let pool;
  beforeAll(async () => {
    pool = new Pool({
      host: process.env.DB_HOST || '127.0.0.1', port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    });
  });
  afterAll(async () => { await pool.end(); });

  test('the invoice, purchase-order, cost, journal and supplier indexes exist', async () => {
    const names = [
      'idx_invoices_created_at_desc_r3',
      'idx_purchase_orders_project_created_at_r3',
      'idx_project_costs_project_transaction_r3',
      'idx_journal_entry_lines_account_id_r3',
      'idx_payments_supplier_id_r3',
      'idx_payment_allocations_supplier_invoice_r3',
    ];
    const rows = (await pool.query(
      "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1)", [names]
    )).rows;
    expect(rows.map((row) => row.indexname).sort()).toEqual([...names].sort());
    expect(rows.find((row) => row.indexname === 'idx_purchase_orders_project_created_at_r3').indexdef)
      .toMatch(/\(project_id, created_at DESC, id DESC\)/);
  });

  test('0064 schema upgrades through every R3 migration to the latest schema', async () => {
    const migrationNames = [
      '0065_journal_balance_statement_check.sql',
      '0066_commitment_source_backfill.sql',
      '0067_r3_ranked_query_and_fk_indexes.sql',
    ];
    const versionedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-latest-upgrade-'));
    const schema = `r3_upgrade_${process.pid}`;
    const previousPgOptions = process.env.PGOPTIONS;
    for (const name of migrationNames) {
      fs.copyFileSync(path.join(__dirname, '..', '..', 'migrations', name), path.join(versionedDir, name));
    }
    try {
      await pool.query(`CREATE SCHEMA ${schema}`);
      for (const table of ['journal_entry_lines', 'commitments', 'purchase_orders', 'sub_contracts', 'document_counters', 'invoices', 'project_costs', 'payments', 'payment_allocations']) {
        await pool.query(`CREATE TABLE ${schema}.${table} (LIKE public.${table} INCLUDING ALL)`);
      }
      // runMigrations and its child scripts use fresh pools; PGOPTIONS scopes all of them to this empty replay schema.
      process.env.PGOPTIONS = `-c search_path=${schema},public`;
      const result = await runMigrations({ legacy: [], versionedDir });
      expect(result.applied).toEqual(migrationNames);
      const records = (await pool.query(`SELECT version FROM ${schema}.schema_migrations WHERE version = ANY($1) ORDER BY version`, [migrationNames])).rows.map((row) => row.version);
      expect(records).toEqual(migrationNames);
      const indexes = (await pool.query(
        'SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname = $1 AND indexname = ANY($2)',
        [schema, ['idx_invoices_created_at_desc_r3', 'idx_purchase_orders_project_created_at_r3', 'idx_project_costs_project_transaction_r3', 'idx_journal_entry_lines_account_id_r3', 'idx_payments_supplier_id_r3', 'idx_payment_allocations_supplier_invoice_r3']]
      )).rows[0].n;
      expect(indexes).toBe(6);
      expect((await pool.query(`SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND t.tgname = 'journal_entry_lines_balance_insert_statement' AND NOT t.tgisinternal`, [schema])).rowCount).toBe(1);
    } finally {
      if (previousPgOptions === undefined) delete process.env.PGOPTIONS;
      else process.env.PGOPTIONS = previousPgOptions;
      await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      fs.rmSync(versionedDir, { recursive: true, force: true });
    }
  });
});
