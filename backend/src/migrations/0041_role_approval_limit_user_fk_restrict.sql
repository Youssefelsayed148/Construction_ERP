-- Approval-limit authorship must remain linked to its actor without weakening
-- the append-only user-history policy or allowing ON DELETE SET NULL.
ALTER TABLE role_action_approval_limits
  DROP CONSTRAINT IF EXISTS role_action_approval_limits_created_by_fkey,
  DROP CONSTRAINT IF EXISTS role_action_approval_limits_updated_by_fkey;

ALTER TABLE role_action_approval_limits
  ADD CONSTRAINT role_action_approval_limits_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT role_action_approval_limits_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT;
