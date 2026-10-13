INSERT INTO permissions (module, action, description)
VALUES ('client-portal', 'approve', 'Respond to client portal actions'),
       ('client-portal', 'reject', 'Reject client portal actions')
ON CONFLICT (module, action) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.module = 'client-portal'
   AND p.action IN ('approve', 'reject')
 WHERE r.key = 'client'
ON CONFLICT (role_id, permission_id) DO NOTHING;
