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
    for (const name of migrationNames) {
      fs.copyFileSync(path.join(__dirname, '..', '..', 'migrations', name), path.join(versionedDir, name));
    }
    try {
      await pool.query(`
        DROP INDEX IF EXISTS idx_invoices_created_at_desc_r3;
        DROP INDEX IF EXISTS idx_purchase_orders_project_created_at_r3;
        DROP INDEX IF EXISTS idx_project_costs_project_transaction_r3;
        DROP INDEX IF EXISTS idx_journal_entry_lines_account_id_r3;
        DROP INDEX IF EXISTS idx_payments_supplier_id_r3;
        DROP INDEX IF EXISTS idx_payment_allocations_supplier_invoice_r3;
        DROP TRIGGER IF EXISTS journal_entry_lines_balance_insert_statement ON journal_entry_lines;
        DROP TRIGGER IF EXISTS journal_entry_lines_balance_update_statement ON journal_entry_lines;
        DROP TRIGGER IF EXISTS journal_entry_lines_balance_delete_statement ON journal_entry_lines;
        DROP TRIGGER IF EXISTS journal_entry_balance_checks_deferred ON journal_entry_balance_checks;
        DROP TRIGGER IF EXISTS journal_entry_lines_balance ON journal_entry_lines;
        DROP FUNCTION IF EXISTS queue_journal_entry_balance_check();
        DROP FUNCTION IF EXISTS validate_queued_journal_entry_balance();
        DROP TABLE IF EXISTS journal_entry_balance_checks;
        DROP INDEX IF EXISTS idx_journal_entry_lines_journal_entry_id;
        DROP FUNCTION IF EXISTS journal_entry_must_balance();
        CREATE FUNCTION journal_entry_must_balance() RETURNS trigger AS $fn$
        DECLARE d NUMERIC; c NUMERIC; eid INTEGER;
        BEGIN
          eid := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
          SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0) INTO d, c
            FROM journal_entry_lines WHERE journal_entry_id = eid;
          IF d <> c THEN RAISE EXCEPTION 'legacy balance check' USING ERRCODE = '23514'; END IF;
          RETURN NULL;
        END;
        $fn$ LANGUAGE plpgsql;
        CREATE CONSTRAINT TRIGGER journal_entry_lines_balance
          AFTER INSERT OR UPDATE OR DELETE ON journal_entry_lines
          DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION journal_entry_must_balance();
      `);
      await pool.query('DELETE FROM schema_migrations WHERE version = ANY($1)', [migrationNames]);
      const result = await runMigrations({ legacy: [], versionedDir });
      expect(result.applied).toEqual(migrationNames);
      const records = (await pool.query('SELECT version FROM schema_migrations WHERE version = ANY($1) ORDER BY version', [migrationNames])).rows.map((row) => row.version);
      expect(records).toEqual(migrationNames);
      const indexes = (await pool.query(
        "SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1)",
        [['idx_invoices_created_at_desc_r3', 'idx_purchase_orders_project_created_at_r3', 'idx_project_costs_project_transaction_r3', 'idx_journal_entry_lines_account_id_r3', 'idx_payments_supplier_id_r3', 'idx_payment_allocations_supplier_invoice_r3']]
      )).rows[0].n;
      expect(indexes).toBe(6);
      expect((await pool.query("SELECT 1 FROM pg_trigger WHERE tgname = 'journal_entry_lines_balance_insert_statement' AND NOT tgisinternal")).rowCount).toBe(1);
    } finally {
      fs.rmSync(versionedDir, { recursive: true, force: true });
    }
  });
});
