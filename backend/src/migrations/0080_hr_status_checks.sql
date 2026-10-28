--
-- G1.2 status-vocabulary closeout, batch 6/9: HR.
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

-- employees: DEFAULT 'active' (setupDb.js:381); INSERT omits status routes/hr.js:55-57; PUT Joi-valid hr.js:75
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_status_check' AND conrelid = 'employees'::regclass) THEN
    ALTER TABLE employees ADD CONSTRAINT employees_status_check
      CHECK (status IS NULL OR status IN ('active', 'inactive', 'on_leave', 'terminated'))
      NOT VALID;
  END IF;
END $$;

-- attendance: DEFAULT 'present' (setupDb.js:394); INSERT Joi-valid routes/hr.js:124,134; seeds company-demo-hr.js:57
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_status_check' AND conrelid = 'attendance'::regclass) THEN
    ALTER TABLE attendance ADD CONSTRAINT attendance_status_check
      CHECK (status IS NULL OR status IN ('present', 'absent', 'late', 'on_leave'))
      NOT VALID;
  END IF;
END $$;

-- leave_requests: DEFAULT 'pending' (setupDb.js:412); INSERT omits status routes/hr.js:169; guard + UPDATE hr.js:181-184
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_requests_status_check' AND conrelid = 'leave_requests'::regclass) THEN
    ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_status_check
      CHECK (status IS NULL OR status IN ('pending', 'approved', 'rejected'))
      NOT VALID;
  END IF;
END $$;

-- payroll_periods: DEFAULT 'draft' (setupDb.js:430); INSERT omits status routes/payroll.js:58-60; approved/rejected workflow-mirrored via APPROVED_STATUS/REJECTED_STATUS (workflowEngine.js:47,57,529, module 'payroll'); paid via PUT cost-posting.pg.test.js:289; PAIRED ROUTE FIX: PUT status was Joi.string() (unbounded) - tightened to this same list in the same slice
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_periods_status_check' AND conrelid = 'payroll_periods'::regclass) THEN
    ALTER TABLE payroll_periods ADD CONSTRAINT payroll_periods_status_check
      CHECK (status IS NULL OR status IN ('draft', 'approved', 'rejected', 'paid'))
      NOT VALID;
  END IF;
END $$;
