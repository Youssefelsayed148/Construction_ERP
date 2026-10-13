-- The consultant role's seeded permission catalog grants formal review
-- actions. Older installations have only the view row from the initial policy
-- migration, so reconcile those intended writes on upgrade.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.module = 'consultant'
   AND p.action IN ('create', 'edit', 'submit', 'approve', 'reject')
 WHERE r.key = 'consultant'
ON CONFLICT (role_id, permission_id) DO NOTHING;
