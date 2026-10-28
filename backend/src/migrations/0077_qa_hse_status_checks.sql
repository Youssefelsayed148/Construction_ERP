--
-- G1.2 status-vocabulary closeout, batch 3/9: QA and HSE.
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

-- ncrs: DEFAULT 'open' (migrate-8.js:33); INSERT omits status routes/qhse.js:141-142; NCR_TRANSITIONS routes/qhse.js:103-107,152-185; closed via verify qhse.js:1107; verification FILTER-ONLY (consultantEngine.js:688,787; ncr template step key) - UNCERTAIN, included
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ncrs_status_check' AND conrelid = 'ncrs'::regclass) THEN
    ALTER TABLE ncrs ADD CONSTRAINT ncrs_status_check
      CHECK (status IS NULL OR status IN ('open', 'in_progress', 'resolved', 'closed', 'verification'))
      NOT VALID;
  END IF;
END $$;

-- near_misses: DEFAULT 'open' (hse-migration.js:178); INSERT routes/hse.js:623-624; UPDATE hse.js:635-642
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'near_misses_status_check' AND conrelid = 'near_misses'::regclass) THEN
    ALTER TABLE near_misses ADD CONSTRAINT near_misses_status_check
      CHECK (status IS NULL OR status IN ('open', 'closed'))
      NOT VALID;
  END IF;
END $$;

-- observations: DEFAULT 'raised' (consultant-migration.js:38); INSERT consultantEngine.js:162-165; actionToStatus transitions consultantEngine.js:273-296; route routes/consultant.js:162-176
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'observations_status_check' AND conrelid = 'observations'::regclass) THEN
    ALTER TABLE observations ADD CONSTRAINT observations_status_check
      CHECK (status IS NULL OR status IN ('raised', 'acknowledged', 'assigned', 'rectification_in_progress', 'submitted_for_verification', 'accepted', 'rejected', 'closed'))
      NOT VALID;
  END IF;
END $$;

-- corrective_actions: DEFAULT 'open' (qaqc-migration.js:132); INSERT routes/qhse.js:830-832; CAPA_TRANSITIONS qhse.js:841-872
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'corrective_actions_status_check' AND conrelid = 'corrective_actions'::regclass) THEN
    ALTER TABLE corrective_actions ADD CONSTRAINT corrective_actions_status_check
      CHECK (status IS NULL OR status IN ('open', 'in_progress', 'completed', 'verified'))
      NOT VALID;
  END IF;
END $$;

-- preventive_actions: DEFAULT 'open' (qaqc-migration.js:152); same writers as corrective_actions (CAPA_TABLES kind switch) routes/qhse.js:830-872
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'preventive_actions_status_check' AND conrelid = 'preventive_actions'::regclass) THEN
    ALTER TABLE preventive_actions ADD CONSTRAINT preventive_actions_status_check
      CHECK (status IS NULL OR status IN ('open', 'in_progress', 'completed', 'verified'))
      NOT VALID;
  END IF;
END $$;

-- hse_inspections: DEFAULT 'pending' (hse-migration.js:59); INSERT/UPDATE routes/hse.js:194-231; also via safety_inspections auto-updatable view qhse.js:245-274
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hse_inspections_status_check' AND conrelid = 'hse_inspections'::regclass) THEN
    ALTER TABLE hse_inspections ADD CONSTRAINT hse_inspections_status_check
      CHECK (status IS NULL OR status IN ('pending', 'passed', 'failed'))
      NOT VALID;
  END IF;
END $$;

-- jsas: DEFAULT 'draft' (hse-migration.js:111); INSERT routes/hse.js:387-388; JSA_TRANSITIONS hse.js:394-408
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jsas_status_check' AND conrelid = 'jsas'::regclass) THEN
    ALTER TABLE jsas ADD CONSTRAINT jsas_status_check
      CHECK (status IS NULL OR status IN ('draft', 'reviewed', 'approved', 'superseded'))
      NOT VALID;
  END IF;
END $$;

-- risk_assessments: DEFAULT 'draft' (hse-migration.js:132); INSERT routes/hse.js:464-465; RA_TRANSITIONS hse.js:473-486
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'risk_assessments_status_check' AND conrelid = 'risk_assessments'::regclass) THEN
    ALTER TABLE risk_assessments ADD CONSTRAINT risk_assessments_status_check
      CHECK (status IS NULL OR status IN ('draft', 'reviewed', 'approved', 'superseded'))
      NOT VALID;
  END IF;
END $$;

-- inductions: DEFAULT 'completed' (hse-migration.js:79, DDL comment lists all three); INSERT-only routes/hse.js:539-540 (no update route); pending/expired UNCERTAIN, included per the task rule
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inductions_status_check' AND conrelid = 'inductions'::regclass) THEN
    ALTER TABLE inductions ADD CONSTRAINT inductions_status_check
      CHECK (status IS NULL OR status IN ('completed', 'pending', 'expired'))
      NOT VALID;
  END IF;
END $$;

-- incidents: DEFAULT 'open' (hse-migration.js:37); INSERT routes/hse.js:92-94 and legacy qhse.js:313-315; INCIDENT_TRANSITIONS hse.js:126-141; legacy PUT qhse.js:328-342
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'incidents_status_check' AND conrelid = 'incidents'::regclass) THEN
    ALTER TABLE incidents ADD CONSTRAINT incidents_status_check
      CHECK (status IS NULL OR status IN ('open', 'investigating', 'closed'))
      NOT VALID;
  END IF;
END $$;

-- permits: DEFAULT 'draft' (hse-migration.js:153); INSERT literal hseEngine.js:72-75; transitions hseEngine.js:105,145,148,158,169-188 (PERMIT_TRANSITIONS:26-33); expired sweep hseEngine.js:214
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'permits_status_check' AND conrelid = 'permits'::regclass) THEN
    ALTER TABLE permits ADD CONSTRAINT permits_status_check
      CHECK (status IS NULL OR status IN ('draft', 'pending_approval', 'approved', 'active', 'rejected', 'suspended', 'closed', 'expired'))
      NOT VALID;
  END IF;
END $$;

-- itps: DEFAULT 'active' (qaqc-migration.js:30); INSERT routes/qhse.js:434-436; PUT Joi-valid qhse.js:489-516
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'itps_status_check' AND conrelid = 'itps'::regclass) THEN
    ALTER TABLE itps ADD CONSTRAINT itps_status_check
      CHECK (status IS NULL OR status IN ('draft', 'active', 'archived'))
      NOT VALID;
  END IF;
END $$;

-- mock_ups: DEFAULT 'proposed' (qaqc-migration.js:174); INSERT routes/qhse.js:927-929; MOCK_UP_TRANSITIONS qhse.js:935-958
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mock_ups_status_check' AND conrelid = 'mock_ups'::regclass) THEN
    ALTER TABLE mock_ups ADD CONSTRAINT mock_ups_status_check
      CHECK (status IS NULL OR status IN ('proposed', 'under_review', 'approved', 'rejected', 'rework'))
      NOT VALID;
  END IF;
END $$;

-- punch_items: DEFAULT 'open' (qaqc-migration.js:218); INSERT qaqcEngine.js:302-304; PUNCH_TRANSITIONS qaqcEngine.js:349-385 (rectified->open rework); NOTE 'raised' is a workflow step key, not a domain value - excluded
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'punch_items_status_check' AND conrelid = 'punch_items'::regclass) THEN
    ALTER TABLE punch_items ADD CONSTRAINT punch_items_status_check
      CHECK (status IS NULL OR status IN ('open', 'assigned', 'rectified', 'verified', 'closed'))
      NOT VALID;
  END IF;
END $$;

-- wirs: DEFAULT 'draft' (qaqc-migration.js:73); INSERT qaqcEngine.js:96, return-to-draft :183; submitted :131,:214; pm_review/consultant_review :174-177; decideWir :214-218; qa_qc_review UNCERTAIN (accepted by state machine, no current writer) - included; 'reinspect' is a result, never stored - excluded
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wirs_status_check' AND conrelid = 'wirs'::regclass) THEN
    ALTER TABLE wirs ADD CONSTRAINT wirs_status_check
      CHECK (status IS NULL OR status IN ('draft', 'submitted', 'qa_qc_review', 'pm_review', 'consultant_review', 'approved', 'approved_with_comments', 'rejected'))
      NOT VALID;
  END IF;
END $$;
