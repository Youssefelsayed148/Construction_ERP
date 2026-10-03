-- Phase 3.5: manual progress overrides are a distinct permission, not part of 'edit'.
--
-- projects.completion_percentage and project_phases.completion_percentage are derived at recompute
-- points (measurement writes and reviews, schedule progress changes — services/progressEngine.js).
-- Setting either column by hand is blocked by the policy engine unless the caller holds the explicit
-- ('projects','override_progress') permission (policy.js ACTION_OVERRIDES maps the field's presence in
-- the body to that action and routes audit it as 'override_progress').
--
-- Legacy roles hold the ('*','*') blanket and are unaffected; the Phase 5.1 least-privilege roles do not
-- get this by default. The permission row is seeded so it is grantable later. Existing rows: untouched.
-- Preflight on a restored copy (no dedupe needed; the row is a no-op if it exists):
--
--   SELECT * FROM permissions WHERE module = 'projects' AND action = 'override_progress';
INSERT INTO permissions (module, action)
SELECT 'projects', 'override_progress'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE module = 'projects' AND action = 'override_progress');
