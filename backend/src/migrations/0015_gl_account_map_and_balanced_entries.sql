-- Phase 2.7a: the ledger takes its accounts from configuration and the database refuses unbalanced entries.
--
-- gl_account_map: key -> account (RESTRICT, so a mapped account cannot be deleted). Seeded from the chart of
-- accounts by CODE (the ids 1, 8, 9, 10 that the old code hard-coded are only right on one install). A key whose code
-- does not exist in this database is simply not seeded; posting that needs it fails with a message naming the key
-- until an owner maps it. Keys: cash 1000, receivable 1100, inventory 1200, payable 2000, revenue 4000,
-- salary_expense 5000, material_cost 5100, other_expense 5200.
--
-- journal_entry_lines: a line carries a non-negative amount on exactly one side (CHECK, validated if clean, else left
-- NOT VALID with a NOTICE and listed by `npm run data-cleaning-report`), and a deferred constraint trigger refuses to
-- commit an entry whose debits differ from its credits. The trigger only looks at entries touched after this
-- migration, so existing entries are not rewritten or blocked; scripts/preflight-upgrade.sql counts existing
-- unbalanced entries so a person can look at them.
-- Existing rows: untouched.
CREATE TABLE IF NOT EXISTS gl_account_map (
  key        VARCHAR(50) PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  updated_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO gl_account_map (key, account_id)
SELECT m.key, a.id
  FROM (VALUES ('cash', '1000'), ('receivable', '1100'), ('inventory', '1200'), ('payable', '2000'),
               ('revenue', '4000'), ('salary_expense', '5000'), ('material_cost', '5100'), ('other_expense', '5200')) AS m(key, code)
  JOIN accounts a ON a.code = m.code
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION pg_temp.add_check(tbl regclass, cname text, expr text) RETURNS void AS $fn$
DECLARE
  bad BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = cname AND conrelid = tbl) THEN
    RETURN;
  END IF;
  EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK (%s) NOT VALID', tbl, cname, expr);
  EXECUTE format('SELECT count(*) FROM %s WHERE NOT (%s)', tbl, expr) INTO bad;
  IF bad = 0 THEN
    EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', tbl, cname);
  ELSE
    RAISE NOTICE '% left NOT VALID: % existing row(s) break it (new writes are still checked). Run: npm run data-cleaning-report', cname, bad;
  END IF;
END;
$fn$ LANGUAGE plpgsql;

SELECT pg_temp.add_check('journal_entry_lines', 'journal_entry_lines_one_side',
  'COALESCE(debit, 0) >= 0 AND COALESCE(credit, 0) >= 0 AND NOT (COALESCE(debit, 0) > 0 AND COALESCE(credit, 0) > 0)');

CREATE OR REPLACE FUNCTION journal_entry_must_balance() RETURNS trigger AS $fn$
DECLARE
  d NUMERIC;
  c NUMERIC;
  eid INTEGER;
BEGIN
  eid := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0) INTO d, c FROM journal_entry_lines WHERE journal_entry_id = eid;
  IF d <> c THEN
    RAISE EXCEPTION 'journal entry % does not balance: debit % against credit %', eid, d, c USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS journal_entry_lines_balance ON journal_entry_lines;
CREATE CONSTRAINT TRIGGER journal_entry_lines_balance
  AFTER INSERT OR UPDATE OR DELETE ON journal_entry_lines
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION journal_entry_must_balance();
