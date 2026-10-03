-- Phase 2.6 status audit. READ ONLY. Run on a restored copy of the real database:
--   psql -X -f scripts/status-audit.sql <dsn>
-- Lists, for every status-like column in the public schema, each distinct value and how many rows hold it, and
-- whether the column already has a CHECK constraint. The output is the input for the CHECK vocabularies of the
-- workflow tables that 2.6a left open: a vocabulary is only added when every value seen here (and every value the
-- writing code can produce) is in the list.
BEGIN;

CREATE FUNCTION pg_temp.status_audit() RETURNS TABLE (tbl text, col text, value text, n bigint, has_check boolean) AS $fn$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND data_type IN ('character varying', 'text')
       AND (column_name = 'status' OR column_name LIKE '%\_status' ESCAPE '\')
       AND table_name IN (SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE')
     ORDER BY table_name, column_name
  LOOP
    RETURN QUERY EXECUTE format(
      'SELECT %L::text, %L::text, %I::text, count(*), EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = %L::regclass AND k.contype = ''c'' AND pg_get_constraintdef(k.oid) LIKE %L) FROM %I GROUP BY %I ORDER BY 4 DESC',
      c.table_name, c.column_name, c.column_name, 'public.' || quote_ident(c.table_name), '%' || c.column_name || '%', c.table_name, c.column_name);
  END LOOP;
END;
$fn$ LANGUAGE plpgsql;

SET TRANSACTION READ ONLY;
SELECT tbl AS "table", col AS "column", value, n AS rows, has_check AS "has CHECK" FROM pg_temp.status_audit() ORDER BY tbl, col, n DESC;

ROLLBACK;
