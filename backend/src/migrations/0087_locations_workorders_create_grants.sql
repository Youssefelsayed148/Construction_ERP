-- Found by the role-testing run (2026-11-02): POST /api/locations (project structure) and POST /api/work-orders are judged as locations.create /
-- work-orders.create / locations.edit, which no canonical role held, so only legacy owner/admin could create locations or work orders even though
-- the project and construction managers own that work (they already hold work-orders.edit and work-orders.approve).
-- Grant: locations create+edit and work-orders create to project_manager and construction_manager only. Other seed-run fallbacks (RFI/submittal
-- stages, WIR/permit submission, handover package items, AP invoice workflow) are NOT granted: those belong to other roles' jobs; the seed changed instead.
-- Idempotent (ON CONFLICT DO NOTHING).

INSERT INTO permissions (module, action) VALUES ('locations', 'create'), ('locations', 'edit'), ('work-orders', 'create') ON CONFLICT (module, action) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON (p.module = 'locations' AND p.action IN ('create', 'edit')) OR (p.module = 'work-orders' AND p.action = 'create')
 WHERE r.key IN ('project_manager', 'construction_manager')
ON CONFLICT (role_id, permission_id) DO NOTHING;
