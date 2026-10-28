--
-- G1.2 status-vocabulary closeout, batch 9/9: workflow engine and misc/infra.
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

-- action_items: DEFAULT 'open' (action-engine-migration.js:39); INSERT actionService.js:82-87; completed actionService.js:189-237; cancelled closeForWorkflowStep outcome rejected/cancelled (actionService.js:189, workflowEngine.js:396,425,452,869); in_progress FILTER-ONLY (actionService.js:192,205) - included
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'action_items_status_check' AND conrelid = 'action_items'::regclass) THEN
    ALTER TABLE action_items ADD CONSTRAINT action_items_status_check
      CHECK (status IS NULL OR status IN ('open', 'in_progress', 'completed', 'cancelled'))
      NOT VALID;
  END IF;
END $$;

-- background_sweep_runs: NO default, nullable (0020_event_outbox.sql:55); every code INSERT supplies status: skipped sweepLeader.js:32,50; running :58-59; ok :64-65; failed :73-74
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'background_sweep_runs_status_check' AND conrelid = 'background_sweep_runs'::regclass) THEN
    ALTER TABLE background_sweep_runs ADD CONSTRAINT background_sweep_runs_status_check
      CHECK (status IS NULL OR status IN ('running', 'ok', 'failed', 'skipped'))
      NOT VALID;
  END IF;
END $$;

-- idempotency_keys: DEFAULT 'in_flight' (migrate-37-external-api.js:43); INSERT v1.js:214-215; completed UPDATE v1.js:261-263
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'idempotency_keys_status_check' AND conrelid = 'idempotency_keys'::regclass) THEN
    ALTER TABLE idempotency_keys ADD CONSTRAINT idempotency_keys_status_check
      CHECK (status IS NULL OR status IN ('in_flight', 'completed'))
      NOT VALID;
  END IF;
END $$;

-- notifications: DEFAULT 'unread' (action-engine-migration.js:73); INSERT notificationService.js:40-41; read UPDATE notificationService.js:318
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_status_check' AND conrelid = 'notifications'::regclass) THEN
    ALTER TABLE notifications ADD CONSTRAINT notifications_status_check
      CHECK (status IS NULL OR status IN ('unread', 'read'))
      NOT VALID;
  END IF;
END $$;

-- portal_submissions: DEFAULT 'submitted' (portal-migration.js:29); INSERT omits status portalEngine.js:448-450; no UPDATE or filter exists - single-value list, extend when a review flow ships
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_submissions_status_check' AND conrelid = 'portal_submissions'::regclass) THEN
    ALTER TABLE portal_submissions ADD CONSTRAINT portal_submissions_status_check
      CHECK (status IS NULL OR status IN ('submitted'))
      NOT VALID;
  END IF;
END $$;

-- scheduled_report_runs: DEFAULT 'generated' (reporting-migration.js:36, DDL comment matches); INSERT reports.js:433,445; generated is default-only, must be allowed
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scheduled_report_runs_status_check' AND conrelid = 'scheduled_report_runs'::regclass) THEN
    ALTER TABLE scheduled_report_runs ADD CONSTRAINT scheduled_report_runs_status_check
      CHECK (status IS NULL OR status IN ('generated', 'notified', 'failed'))
      NOT VALID;
  END IF;
END $$;

-- webhook_deliveries: DEFAULT 'pending' (migrate-37-external-api.js:73; state machine webhookService.js:9-13); redrive reset webhookService.js:441-443; delivered :411; retrying :429; dead_letter :380,420
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'webhook_deliveries_status_check' AND conrelid = 'webhook_deliveries'::regclass) THEN
    ALTER TABLE webhook_deliveries ADD CONSTRAINT webhook_deliveries_status_check
      CHECK (status IS NULL OR status IN ('pending', 'retrying', 'delivered', 'dead_letter'))
      NOT VALID;
  END IF;
END $$;

-- project_workflows: DEFAULT 'active' (project-wizard-migration.js:152); INSERT literal projectProvisioning.js:347-348; no other writer or filter exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_workflows_status_check' AND conrelid = 'project_workflows'::regclass) THEN
    ALTER TABLE project_workflows ADD CONSTRAINT project_workflows_status_check
      CHECK (status IS NULL OR status IN ('active'))
      NOT VALID;
  END IF;
END $$;

-- workflow_instances: DEFAULT 'active' (workflow-engine-migration.js:72); engine-owned: startWorkflow INSERT workflowEngine.js:192-193; terminal :389,420; syncExternalState :295-296; cancelWorkflowInstance :854-856 (routes/approvals.js:365, cancel-stale-approvals.js:57); legacy migration :562
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_instances_status_check' AND conrelid = 'workflow_instances'::regclass) THEN
    ALTER TABLE workflow_instances ADD CONSTRAINT workflow_instances_status_check
      CHECK (status IS NULL OR status IN ('active', 'approved', 'rejected', 'cancelled'))
      NOT VALID;
  END IF;
END $$;

-- workflow_step_instances: DEFAULT 'waiting' (workflow-engine-migration.js:88); engine-owned: first-step pending + later steps waiting/skipped INSERT workflowEngine.js:214; done :372,292; rejected :416,292; waiting via return :438; cancelled :861-863; reopen loops qaqcEngine.js:266, hseEngine.js:245
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_step_instances_status_check' AND conrelid = 'workflow_step_instances'::regclass) THEN
    ALTER TABLE workflow_step_instances ADD CONSTRAINT workflow_step_instances_status_check
      CHECK (status IS NULL OR status IN ('pending', 'waiting', 'skipped', 'done', 'rejected', 'cancelled'))
      NOT VALID;
  END IF;
END $$;

-- approval_requests: DEFAULT 'pending' (setupDb.js:101); INSERT routes/approvals.js:202-203; approved/rejected recordLegacyDecision workflowEngine.js:810-835; cancelled approvals.js:355-357, cancel-stale-approvals.js:47-49
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'approval_requests_status_check' AND conrelid = 'approval_requests'::regclass) THEN
    ALTER TABLE approval_requests ADD CONSTRAINT approval_requests_status_check
      CHECK (status IS NULL OR status IN ('pending', 'approved', 'rejected', 'cancelled'))
      NOT VALID;
  END IF;
END $$;
