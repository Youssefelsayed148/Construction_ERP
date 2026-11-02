-- Found by the role-testing run (2026-11-02): POST /api/quantities/measurements/:id/review was judged as a plain `create`, so any role that can
-- record a measurement (site_engineer, site_manager, ...) could also approve or reject it, including its own. The policy override now judges the
-- review as `quantities.approve`; this migration gives that action to the reviewing roles so nobody who reviewed before is locked out.
-- Roles: quantity_surveyor (the measurement reviewer), project_manager, construction_manager, owner_ceo, coo. Site-side recorders do NOT get it.
-- Idempotent (ON CONFLICT DO NOTHING); an unknown role key is skipped.

INSERT INTO permissions (module, action) VALUES ('quantities', 'approve') ON CONFLICT (module, action) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.module = 'quantities' AND p.action = 'approve'
 WHERE r.key IN ('quantity_surveyor', 'project_manager', 'construction_manager', 'owner_ceo', 'coo')
ON CONFLICT (role_id, permission_id) DO NOTHING;
