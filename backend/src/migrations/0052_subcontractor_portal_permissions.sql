INSERT INTO permissions (module, action, description)
VALUES ('portal', 'create', 'Create portal submissions'),
       ('portal', 'edit', 'Edit portal submissions'),
       ('portal', 'submit', 'Submit portal records')
ON CONFLICT (module, action) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.module = 'portal'
   AND p.action IN ('create', 'edit', 'submit')
 WHERE r.key IN ('subcontractor', 'supplier')
ON CONFLICT (role_id, permission_id) DO NOTHING;
