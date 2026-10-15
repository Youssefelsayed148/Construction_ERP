-- R3.1: index journal lines by their parent and defer one balance check per
-- affected journal entry per transaction, rather than rescanning once per row.
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_journal_entry_id
  ON journal_entry_lines (journal_entry_id);

CREATE TABLE IF NOT EXISTS journal_entry_balance_checks (
  transaction_id BIGINT NOT NULL,
  journal_entry_id INTEGER NOT NULL,
  PRIMARY KEY (transaction_id, journal_entry_id)
);

CREATE OR REPLACE FUNCTION queue_journal_entry_balance_check() RETURNS trigger AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO journal_entry_balance_checks (transaction_id, journal_entry_id)
    SELECT txid_current(), journal_entry_id
      FROM new_journal_lines
     WHERE journal_entry_id IS NOT NULL
     GROUP BY journal_entry_id
    ON CONFLICT DO NOTHING;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO journal_entry_balance_checks (transaction_id, journal_entry_id)
    SELECT txid_current(), journal_entry_id
      FROM old_journal_lines
     WHERE journal_entry_id IS NOT NULL
     GROUP BY journal_entry_id
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO journal_entry_balance_checks (transaction_id, journal_entry_id)
    SELECT txid_current(), affected.journal_entry_id
      FROM (
        SELECT journal_entry_id FROM old_journal_lines
        UNION
        SELECT journal_entry_id FROM new_journal_lines
      ) AS affected
     WHERE affected.journal_entry_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END;
$fn$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_queued_journal_entry_balance() RETURNS trigger AS $fn$
DECLARE
  debit_total NUMERIC;
  credit_total NUMERIC;
BEGIN
  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
    INTO debit_total, credit_total
    FROM journal_entry_lines
   WHERE journal_entry_id = NEW.journal_entry_id;

  IF debit_total <> credit_total THEN
    RAISE EXCEPTION 'journal entry % does not balance: debit % against credit %',
      NEW.journal_entry_id, debit_total, credit_total USING ERRCODE = '23514';
  END IF;

  DELETE FROM journal_entry_balance_checks
   WHERE transaction_id = NEW.transaction_id
     AND journal_entry_id = NEW.journal_entry_id;
  RETURN NULL;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS journal_entry_lines_balance ON journal_entry_lines;
DROP TRIGGER IF EXISTS journal_entry_lines_balance_insert_statement ON journal_entry_lines;
DROP TRIGGER IF EXISTS journal_entry_lines_balance_update_statement ON journal_entry_lines;
DROP TRIGGER IF EXISTS journal_entry_lines_balance_delete_statement ON journal_entry_lines;
DROP TRIGGER IF EXISTS journal_entry_balance_checks_deferred ON journal_entry_balance_checks;

CREATE TRIGGER journal_entry_lines_balance_insert_statement
  AFTER INSERT ON journal_entry_lines
  REFERENCING NEW TABLE AS new_journal_lines
  FOR EACH STATEMENT EXECUTE FUNCTION queue_journal_entry_balance_check();

CREATE TRIGGER journal_entry_lines_balance_update_statement
  AFTER UPDATE ON journal_entry_lines
  REFERENCING OLD TABLE AS old_journal_lines NEW TABLE AS new_journal_lines
  FOR EACH STATEMENT EXECUTE FUNCTION queue_journal_entry_balance_check();

CREATE TRIGGER journal_entry_lines_balance_delete_statement
  AFTER DELETE ON journal_entry_lines
  REFERENCING OLD TABLE AS old_journal_lines
  FOR EACH STATEMENT EXECUTE FUNCTION queue_journal_entry_balance_check();

CREATE CONSTRAINT TRIGGER journal_entry_balance_checks_deferred
  AFTER INSERT ON journal_entry_balance_checks
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_queued_journal_entry_balance();

DROP FUNCTION IF EXISTS journal_entry_must_balance();
