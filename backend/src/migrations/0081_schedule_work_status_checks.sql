--
-- G1.2 status-vocabulary closeout, batch 7/9: schedule and work.
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

-- schedule_activities: DEFAULT 'planned' (planning-migration.js:50, DDL comment matches); INSERTs omit status routes/schedule.js:250-254,880, seed-golden-demo.js:137-139; in_progress/completed progress CASE progressEngine.js:114-118; PUT Joi-valid routes/schedule.js:303,326
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedule_activities_status_check' AND conrelid = 'schedule_activities'::regclass) THEN
    ALTER TABLE schedule_activities ADD CONSTRAINT schedule_activities_status_check
      CHECK (status IS NULL OR status IN ('planned', 'in_progress', 'completed', 'suspended'))
      NOT VALID;
  END IF;
END $$;

-- work_packages: DEFAULT 'planned' (organizations-migration.js:214); INSERT COALESCE projectSetupService.js:247-249; PUT Joi-valid routes/project-setup.js:142 via projectSetupService.js:270-272
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_packages_status_check' AND conrelid = 'work_packages'::regclass) THEN
    ALTER TABLE work_packages ADD CONSTRAINT work_packages_status_check
      CHECK (status IS NULL OR status IN ('planned', 'in_progress', 'completed', 'on_hold', 'cancelled'))
      NOT VALID;
  END IF;
END $$;
