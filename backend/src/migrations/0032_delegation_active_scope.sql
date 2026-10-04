-- Phase 5.1 follow-up, found by org-rbac-5-1.pg.test.js probing the implementation:
--   1. The delegations uniqueness must hold only among ACTIVE rows. An owner re-delegating after the
--      previous window closed (deactivated or expired) is a normal operation, not a collision — 0031's
--      plain UNIQUE (delegate, from, scope) made that impossible once ANY row existed, active or not.
--      The plain UNIQUE is replaced by a PARTIAL unique index on is_active. The constraint lookup is
--      DYNAMIC because PostgreSQL truncates the auto-generated constraint name to 63 characters.
--   2. Grant completion for the deletion side of the organization surface, discovered by the same
--      suite: owner_ceo/coo/hr_manager may remove their own rows inside organizations (the delete
--      action the policy judges for DELETE routes).
-- Additive: no row is touched; no existing grant removed.
DO $drop_old_unique$
DECLARE
  c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'delegations'::regclass AND contype = 'u'
       AND conname LIKE '%delegate_user_id%module_s%'
  LOOP
    EXECUTE format('ALTER TABLE delegations DROP CONSTRAINT %I', c);
  END LOOP;
END
$drop_old_unique$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_delegations_active
  ON delegations (delegate_user_id, delegate_from_user_id, module_scope)
  WHERE is_active;

INSERT INTO permissions (module, action)
  SELECT 'organizations', 'delete'
ON CONFLICT (module, action) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r JOIN permissions p ON p.module = 'organizations' AND p.action = 'delete'
 WHERE r.key = ANY (ARRAY['owner_ceo', 'coo', 'hr_manager'])
ON CONFLICT (role_id, permission_id) DO NOTHING;
