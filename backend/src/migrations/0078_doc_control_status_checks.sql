--
-- G1.2 status-vocabulary closeout, batch 4/9: document control.
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

-- project_documents: DEFAULT 'draft' (migrate-9.js:29); INSERT omits status routes/doccontrol.js:165-174; submitted doccontrol.js:291; approved/rejected doccontrol.js:310-315; draft/review/archived PUT Joi doccontrol.js:248,265-272; acknowledged clientEngine.js:174; awaiting_acknowledgement UNCERTAIN (gated on at clientEngine.js:164,383, seeded in fixtures) - included
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_documents_status_check' AND conrelid = 'project_documents'::regclass) THEN
    ALTER TABLE project_documents ADD CONSTRAINT project_documents_status_check
      CHECK (status IS NULL OR status IN ('draft', 'review', 'submitted', 'approved', 'rejected', 'archived', 'acknowledged', 'awaiting_acknowledgement'))
      NOT VALID;
  END IF;
END $$;

-- document_versions: DEFAULT 'current' (doccontrol-migration.js:41); INSERT doccontrol.js:223-224; superseded doccontrolEngine.js:136
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_versions_status_check' AND conrelid = 'document_versions'::regclass) THEN
    ALTER TABLE document_versions ADD CONSTRAINT document_versions_status_check
      CHECK (status IS NULL OR status IN ('current', 'superseded'))
      NOT VALID;
  END IF;
END $$;

-- correspondence: DEFAULT 'draft' (doccontrol-migration.js:123); INSERT doccontrolEngine.js:244; CORR_TRANSITIONS doccontrolEngine.js:257-277, route Joi doccontrol.js:856; received UNCERTAIN (transition source + DDL comment, no writer) - included
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'correspondence_status_check' AND conrelid = 'correspondence'::regclass) THEN
    ALTER TABLE correspondence ADD CONSTRAINT correspondence_status_check
      CHECK (status IS NULL OR status IN ('draft', 'sent', 'received', 'responded', 'closed'))
      NOT VALID;
  END IF;
END $$;

-- transmittals: DEFAULT 'draft' (doccontrol-migration.js:83); INSERT doccontrolEngine.js:185; transitions doccontrolEngine.js:196-222
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transmittals_status_check' AND conrelid = 'transmittals'::regclass) THEN
    ALTER TABLE transmittals ADD CONSTRAINT transmittals_status_check
      CHECK (status IS NULL OR status IN ('draft', 'sent', 'acknowledged', 'closed'))
      NOT VALID;
  END IF;
END $$;

-- project_rfis: DEFAULT 'open' (migrate-9.js:65); INSERT omits status doccontrol.js:390-395; submitted portal.js:174; consultant stages consultantEngine.js:429-430; answered :426; closed doccontrol.js:412, consultantEngine.js:446; draft UNCERTAIN (rfi template step key, test inserts) - included
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_rfis_status_check' AND conrelid = 'project_rfis'::regclass) THEN
    ALTER TABLE project_rfis ADD CONSTRAINT project_rfis_status_check
      CHECK (status IS NULL OR status IN ('open', 'draft', 'submitted', 'coordinator', 'discipline_review', 'answered', 'acknowledged', 'closed'))
      NOT VALID;
  END IF;
END $$;

-- project_submittals: DEFAULT 'submitted' (migrate-9.js:84); INSERT portal.js:199, resubmit consultantEngine.js:502; stage passthrough consultantEngine.js:493; response codes A-D -> closed/resubmit_required consultantEngine.js:488
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_submittals_status_check' AND conrelid = 'project_submittals'::regclass) THEN
    ALTER TABLE project_submittals ADD CONSTRAINT project_submittals_status_check
      CHECK (status IS NULL OR status IN ('submitted', 'internal_technical_review', 'pm', 'consultant_coordinator', 'reviewer', 'resubmit_required', 'closed'))
      NOT VALID;
  END IF;
END $$;

-- legal_documents: DEFAULT 'pending' (setupDb.js:301); route Joi-valid routes/legal.js:60; verified/rejected also workflow-mirrored via applySourceStatus (workflowEngine.js:49,59,529, module 'legal')
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'legal_documents_status_check' AND conrelid = 'legal_documents'::regclass) THEN
    ALTER TABLE legal_documents ADD CONSTRAINT legal_documents_status_check
      CHECK (status IS NULL OR status IN ('pending', 'verified', 'rejected'))
      NOT VALID;
  END IF;
END $$;

-- engineer_instructions: DEFAULT 'issued' (migrate-7.js:36); INSERT omits status routes/site.js:211; acknowledge/implemented/closed site.js:285-319; portalEngine.js:243
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'engineer_instructions_status_check' AND conrelid = 'engineer_instructions'::regclass) THEN
    ALTER TABLE engineer_instructions ADD CONSTRAINT engineer_instructions_status_check
      CHECK (status IS NULL OR status IN ('issued', 'acknowledged', 'implemented', 'closed'))
      NOT VALID;
  END IF;
END $$;
