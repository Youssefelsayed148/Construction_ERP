-- Owner decisions 2026-11-02:
-- 1) owner_ceo and coo get READ-ONLY view of approval-limits, activity and handover (users / workflow-templates stay owner/admin).
-- 2) consultant_reviewer gets review actions only: consultant.approve and consultant.reject (it already holds view + submit = comment).
--    It gets no create/edit. Idempotent.
INSERT INTO permissions (module, action) VALUES
  ('approval-limits', 'view'), ('activity', 'view'), ('handover', 'view'), ('consultant', 'approve'), ('consultant', 'reject')
ON CONFLICT (module, action) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
  JOIN permissions p ON p.action = 'view' AND p.module IN ('approval-limits', 'activity', 'handover')
 WHERE r.key IN ('owner_ceo', 'coo')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
  JOIN permissions p ON p.module = 'consultant' AND p.action IN ('approve', 'reject')
 WHERE r.key = 'consultant_reviewer'
ON CONFLICT (role_id, permission_id) DO NOTHING;
