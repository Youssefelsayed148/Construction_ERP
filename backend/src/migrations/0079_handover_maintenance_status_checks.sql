--
-- G1.2 status-vocabulary closeout, batch 5/9: handover and maintenance.
--
-- Same method and shape as 0075 (procurement batch): every value below was derived from ALL
-- writers of that table's status column (routes, services, workflow engine maps/templates,
-- seeds, fixtures and migrations); workflow-mirrored step keys and filter-only values are
-- called out, and uncertain values are INCLUDED rather than risk blocking a legitimate write
-- (task rule). NOT VALID so existing rows can never block the migration; an operator validates
-- afterwards with backend/scripts/validate-status-constraints.sql (see docs/MIGRATIONS.md).
--
-- Deliberately NOT constrained here: history/audit mirror columns (activity_log.old_status /
-- activity_log.new_status, observation_status_history.from_status) - their vocabulary is the
-- union of every other status by design. agent_action_requests.execution_status and
-- agent_tool_calls.response_status are agent-subsystem telemetry left open this batch.
--
-- Every column in this batch is NULLable with a DEFAULT; no writer writes NULL; each CHECK
-- tolerates NULL explicitly (status IS NULL OR status IN (...)).

-- handover_package_items: DEFAULT 'pending' (handover-migration.js:32, DDL comment matches); INSERTs handover.js:119, handoverEngine.js:152; PUT Joi-valid handover.js:132; verify Joi-valid handover.js:168-177 (pending re-set allowed)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'handover_package_items_status_check' AND conrelid = 'handover_package_items'::regclass) THEN
    ALTER TABLE handover_package_items ADD CONSTRAINT handover_package_items_status_check
      CHECK (status IS NULL OR status IN ('pending', 'uploaded', 'approved', 'complete'))
      NOT VALID;
  END IF;
END $$;

-- warranty_claims: DEFAULT 'raised' (handover-migration.js:72); INSERT handoverEngine.js:190; WARRANTY_STATES transitions handoverEngine.js:31-43,239; route allows handover.js:393; synced to 'warranty_claim' template via syncExternalState - step key 'accepted_rejected' is NEVER written to the column, excluded
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warranty_claims_status_check' AND conrelid = 'warranty_claims'::regclass) THEN
    ALTER TABLE warranty_claims ADD CONSTRAINT warranty_claims_status_check
      CHECK (status IS NULL OR status IN ('raised', 'assigned', 'rectification_in_progress', 'submitted_for_acceptance', 'accepted', 'rejected', 'closed'))
      NOT VALID;
  END IF;
END $$;

-- maintenance_reminders: DEFAULT 'scheduled' (setupDb.js:353); INSERT routes/maintenance.js:52; filters dashboard.js:230; PAIRED ROUTE FIX: PUT status was Joi.string() (unbounded) - tightened to this same list in the same slice so the constraint cannot reject a legitimate API write
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_reminders_status_check' AND conrelid = 'maintenance_reminders'::regclass) THEN
    ALTER TABLE maintenance_reminders ADD CONSTRAINT maintenance_reminders_status_check
      CHECK (status IS NULL OR status IN ('scheduled', 'in_progress', 'completed', 'cancelled'))
      NOT VALID;
  END IF;
END $$;

-- assets: DEFAULT 'active' (setupDb.js:326); INSERT default routes/assets.js:61,70-72; filter values dashboard.js:225; PAIRED ROUTE FIX: PUT status was Joi.string() (unbounded) - tightened to this same list in the same slice
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_status_check' AND conrelid = 'assets'::regclass) THEN
    ALTER TABLE assets ADD CONSTRAINT assets_status_check
      CHECK (status IS NULL OR status IN ('active', 'maintenance', 'repair', 'out_of_service'))
      NOT VALID;
  END IF;
END $$;

-- work_completions: DEFAULT 'pending_verification' (migrate-3.js:125); INSERT omits status routes/workorders.js:292-296; verified/rejected workorders.js:323-329; pending UNCERTAIN (test writers event-integrity.pg.test.js:272, daily-report-progress.pg.test.js:199) - included
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_completions_status_check' AND conrelid = 'work_completions'::regclass) THEN
    ALTER TABLE work_completions ADD CONSTRAINT work_completions_status_check
      CHECK (status IS NULL OR status IN ('pending_verification', 'verified', 'rejected', 'pending'))
      NOT VALID;
  END IF;
END $$;
