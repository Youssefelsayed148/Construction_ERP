-- Phase 3 (open item): stale approval workflows can be cancelled non-destructively.
--
-- A cancelled approval keeps every field, gains the actor, the timestamp and the reason, and stays in the
-- audit trail; nothing is deleted (cleanup-orphan-approvals.js --apply remains the destructive last
-- resort). The linked workflow instance is cancelled by the route (services/workflowEngine.js
-- cancelWorkflowInstance), so no stale workflow keeps ticking next to a cancelled approval.
--
-- Existing rows: untouched (three nullable columns). No preflight needed; on a restored copy confirm the
-- columns exist:
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'approval_requests' AND column_name LIKE 'cancel%';
ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS cancelled_by INTEGER REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
