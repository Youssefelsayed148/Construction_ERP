'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Pool } = require('pg');
const { runMigrations } = require('../run-all-migrations');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('R3.1 statement-level journal balance validation', () => {
  let pool;
  let debitAccount;
  let creditAccount;
  const tag = String(Date.now()).slice(-8);

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.DB_HOST, port: Number(process.env.DB_PORT), database: process.env.DB_NAME,
      user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    });
    debitAccount = (await pool.query(
      "INSERT INTO accounts (code, name, type) VALUES ($1, 'R3 debit test', 'expense') RETURNING id", [`R3D${tag}`]
    )).rows[0].id;
    creditAccount = (await pool.query(
      "INSERT INTO accounts (code, name, type) VALUES ($1, 'R3 credit test', 'income') RETURNING id", [`R3C${tag}`]
    )).rows[0].id;
  });

  afterAll(async () => { await pool?.end(); });

  async function createEntry(label) {
    return (await pool.query(
      'INSERT INTO journal_entries (entry_number, date, description, total_amount) VALUES ($1, CURRENT_DATE, $2, 125) RETURNING id',
      [`R3-${tag}-${label}`, label]
    )).rows[0].id;
  }

  test('allows balanced lines inserted by separate statements in one transaction', async () => {
    const entryId = await createEntry('balanced');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, line_order) VALUES ($1,$2,125,0,1)',
        [entryId, debitAccount]
      );
      await client.query(
        'INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, line_order) VALUES ($1,$2,0,125,2)',
        [entryId, creditAccount]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }

    const totals = (await pool.query(
      'SELECT SUM(debit) AS debit, SUM(credit) AS credit FROM journal_entry_lines WHERE journal_entry_id = $1', [entryId]
    )).rows[0];
    expect(Number(totals.debit)).toBe(125);
    expect(Number(totals.credit)).toBe(125);
    expect((await pool.query('SELECT count(*)::int AS n FROM journal_entry_balance_checks')).rows[0].n).toBe(0);
  });

  test('rejects an unbalanced transaction at commit and rolls its lines back', async () => {
    const entryId = await createEntry('unbalanced');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, line_order) VALUES ($1,$2,125,0,1)',
        [entryId, debitAccount]
      );
      await expect(client.query('COMMIT')).rejects.toMatchObject({ code: '23514' });
      await client.query('ROLLBACK').catch(() => {});
    } finally { client.release(); }

    expect((await pool.query('SELECT count(*)::int AS n FROM journal_entry_lines WHERE journal_entry_id = $1', [entryId])).rows[0].n).toBe(0);
    expect((await pool.query('SELECT count(*)::int AS n FROM journal_entry_balance_checks')).rows[0].n).toBe(0);
  });

  test('tracks old and new parent entries during statement-level updates', async () => {
    const fromId = await createEntry('move-from');
    const toId = await createEntry('move-to');
    await pool.query(`
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, line_order)
      VALUES ($1, $2, 125, 0, 1), ($1, $3, 0, 125, 2)`, [fromId, debitAccount, creditAccount]);
    await pool.query('UPDATE journal_entry_lines SET journal_entry_id = $1 WHERE journal_entry_id = $2', [toId, fromId]);
    const remaining = (await pool.query(
      'SELECT journal_entry_id, count(*)::int AS n FROM journal_entry_lines WHERE journal_entry_id = ANY($1::int[]) GROUP BY journal_entry_id', [[fromId, toId]]
    )).rows;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ journal_entry_id: toId, n: 2 });
  });

  test('rejects deleting one side of a balanced entry and restores it on rollback', async () => {
    const entryId = await createEntry('delete-one-side');
    await pool.query(`
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, line_order)
      VALUES ($1, $2, 125, 0, 1), ($1, $3, 0, 125, 2)`, [entryId, debitAccount, creditAccount]);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM journal_entry_lines WHERE journal_entry_id = $1 AND debit = 0', [entryId]);
      await expect(client.query('COMMIT')).rejects.toMatchObject({ code: '23514' });
      await client.query('ROLLBACK').catch(() => {});
    } finally { client.release(); }
    expect((await pool.query(
      'SELECT SUM(debit) AS debit, SUM(credit) AS credit FROM journal_entry_lines WHERE journal_entry_id = $1', [entryId]
    )).rows[0]).toMatchObject({ debit: '125.00', credit: '125.00' });
  });

  test('checks each affected entry after a multi-row insert', async () => {
    const entryId = await createEntry('bulk');
    const result = await pool.query(`
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, line_order)
      SELECT $1::int, CASE WHEN g % 2 = 0 THEN $2::int ELSE $3::int END,
             CASE WHEN g % 2 = 0 THEN 10 ELSE 0 END,
             CASE WHEN g % 2 = 0 THEN 0 ELSE 10 END, g
        FROM generate_series(1, 2000) AS g`, [entryId, debitAccount, creditAccount]);
    expect(result.rowCount).toBe(2000);
    expect((await pool.query(
      'SELECT count(*)::int AS n FROM journal_entry_balance_checks WHERE journal_entry_id = $1', [entryId]
    )).rows[0].n).toBe(0);
  });

  test('0065 upgrades a schema at 0064 and records its checksum', async () => {
    const migration = '0065_journal_balance_statement_check.sql';
    const versionedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-0065-upgrade-'));
    fs.copyFileSync(path.join(__dirname, '..', '..', 'migrations', migration), path.join(versionedDir, migration));
    try {
      await pool.query(`
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
      await pool.query('DELETE FROM schema_migrations WHERE version = $1', [migration]);

      const result = await runMigrations({ legacy: [], versionedDir });
      expect(result.applied).toEqual([migration]);
      const record = (await pool.query('SELECT checksum FROM schema_migrations WHERE version = $1', [migration])).rows[0];
      expect(record.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect((await pool.query(
        "SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_journal_entry_lines_journal_entry_id'"
      )).rowCount).toBe(1);
      expect((await pool.query(
        "SELECT 1 FROM pg_trigger WHERE tgname = 'journal_entry_lines_balance_insert_statement' AND NOT tgisinternal"
      )).rowCount).toBe(1);
      expect((await pool.query("SELECT 1 FROM schema_migrations WHERE version = '0064_schedule_activity_bac.sql'")).rowCount).toBe(1);
    } finally { fs.rmSync(versionedDir, { recursive: true, force: true }); }
  });
});
