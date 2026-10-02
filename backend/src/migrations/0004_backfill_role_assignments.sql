-- Phase 1.2: users with no user_project_roles row used to fall back to a flat role check; that
-- fallback is gone (no assignment = no access). Give every existing INTERNAL user who has no
-- assignment the company-wide row for their role, which is what the fallback effectively granted.
-- External roles (consultant, client, subcontractor, supplier) are project-bound and are NOT
-- backfilled: they get access only through a project assignment.
INSERT INTO user_project_roles (user_id, project_id, role_id)
SELECT u.id, NULL, r.id
  FROM users u
  JOIN roles r ON r.key = u.role
 WHERE r.key NOT IN ('consultant', 'client', 'subcontractor', 'supplier')
   AND NOT EXISTS (SELECT 1 FROM user_project_roles x WHERE x.user_id = u.id);
