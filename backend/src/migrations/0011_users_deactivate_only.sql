-- Phase 2.5c: users are deactivated, never deleted.
--
-- 1. Every foreign key to users that was ON DELETE CASCADE or SET NULL becomes RESTRICT (36 of them: access links
--    such as user_project_roles, and created_by / approved_by style columns on financial and audit records).
--    Foreign keys that were NO ACTION already refuse the delete when a child exists, so they are left as they are.
-- 2. A BEFORE DELETE trigger on users refuses every delete (SQLSTATE 23001, restrict_violation), referenced or
--    not, so the policy does not depend on whether a user happens to have children yet. Deactivate instead
--    (DELETE /api/users/:id and PUT is_active do that). A privacy erasure, if ever required, is a separate,
--    reviewed procedure (anonymise the row), not a delete.
--
-- Existing rows: untouched. The foreign keys are re-checked once on their child tables.
DO $$
DECLARE
  fk RECORD;
  def TEXT;
BEGIN
  FOR fk IN
    SELECT c.oid, c.conname, c.conrelid::regclass AS child
      FROM pg_constraint c
     WHERE c.contype = 'f' AND c.confrelid = 'users'::regclass AND c.confdeltype IN ('c', 'n')
     ORDER BY c.conrelid::regclass::text, c.conname
  LOOP
    def := pg_get_constraintdef(fk.oid);
    IF def NOT LIKE '%ON DELETE CASCADE%' AND def NOT LIKE '%ON DELETE SET NULL%' THEN
      RAISE EXCEPTION 'unexpected definition for %: %', fk.conname, def;
    END IF;
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.child, fk.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', fk.child, fk.conname,
                   replace(replace(def, 'ON DELETE CASCADE', 'ON DELETE RESTRICT'), 'ON DELETE SET NULL', 'ON DELETE RESTRICT'));
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION users_refuse_delete() RETURNS trigger AS $fn$
BEGIN
  RAISE EXCEPTION 'users are deactivated, never deleted (user %): set is_active = false', OLD.id
    USING ERRCODE = 'restrict_violation';
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_refuse_delete ON users;
CREATE TRIGGER trg_users_refuse_delete
  BEFORE DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION users_refuse_delete();
