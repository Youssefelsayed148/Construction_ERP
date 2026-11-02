-- Found by the role-testing run (2026-11-02): the handover router lists project_manager as the authorised role for starting a handover and
-- maintaining its package (authorize('owner','admin','project_manager')), but the only handover grants project_manager held were view and approve
-- (0074, 0084). POST/PUT are judged as handover.create / handover.edit, which NO canonical role held, so a project manager got 403 on step one of
-- the handover and only the legacy owner/admin roles could start it.
-- Grant create + edit to project_manager only (the role the router already names); other roles keep their current handover access.
-- Idempotent (ON CONFLICT DO NOTHING).

INSERT INTO permissions (module, action) VALUES ('handover', 'create'), ('handover', 'edit') ON CONFLICT (module, action) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.module = 'handover' AND p.action IN ('create', 'edit')
 WHERE r.key = 'project_manager'
ON CONFLICT (role_id, permission_id) DO NOTHING;
