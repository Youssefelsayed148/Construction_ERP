--
-- G1.2 status-vocabulary closeout, batch 2/9: commercial and finance.
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

-- client_contracts: DEFAULT 'active' (commercial-migration.js:40); PUT Joi-valid list routes/commercial.js:98,129
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_contracts_status_check' AND conrelid = 'client_contracts'::regclass) THEN
    ALTER TABLE client_contracts ADD CONSTRAINT client_contracts_status_check
      CHECK (status IS NULL OR status IN ('active', 'closed', 'terminated'))
      NOT VALID;
  END IF;
END $$;

-- commitments: INSERT/UPDATE services/commitmentLedger.js:13,18,26-27; backfill CASE migrations/0066_commitment_source_backfill.sql:6-44
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commitments_status_check' AND conrelid = 'commitments'::regclass) THEN
    ALTER TABLE commitments ADD CONSTRAINT commitments_status_check
      CHECK (status IS NULL OR status IN ('active', 'cancelled'))
      NOT VALID;
  END IF;
END $$;

-- sub_contracts: DEFAULT 'draft' (migrate-4.js:45); active/terminated workflow-mirrored via applySourceStatus (workflowEngine.js:51,61,529); approved/completed/closed FILTER-ONLY via ACTIVE_SUBCONTRACT_STATUSES (commitmentLedger.js:6) and 0066 backfill CASE - UNCERTAIN, included per the task rule
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sub_contracts_status_check' AND conrelid = 'sub_contracts'::regclass) THEN
    ALTER TABLE sub_contracts ADD CONSTRAINT sub_contracts_status_check
      CHECK (status IS NULL OR status IN ('draft', 'active', 'terminated', 'approved', 'completed', 'closed'))
      NOT VALID;
  END IF;
END $$;

-- variations: DEFAULT 'change_event' (commercial-migration.js:75); INSERT literal commercialEngine.js:236; step keys of the 'variation' template (workflow-engine-migration.js:228-234) mirrored onto status (commercialEngine.js:323-329); incorporated/rejected from terminal wf.status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'variations_status_check' AND conrelid = 'variations'::regclass) THEN
    ALTER TABLE variations ADD CONSTRAINT variations_status_check
      CHECK (status IS NULL OR status IN ('change_event', 'estimate', 'internal_commercial_review', 'authority_approval', 'consultant_recommendation', 'client_approval_reject', 'incorporated', 'rejected'))
      NOT VALID;
  END IF;
END $$;

-- payment_certificates: DEFAULT 'draft' (commercial-migration.js:175); INSERT commercialRecords.js:403, portalEngine.js:279; 'payment_certificate' template step keys mirrored (commercialRecords.js:447-466); finance_review maps step 'certified'-while-active; void at commercialRecords.js:494; cancelled FILTER-ONLY (commercialRecords.js:357, portalEngine.js:266) - UNCERTAIN, included
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_certificates_status_check' AND conrelid = 'payment_certificates'::regclass) THEN
    ALTER TABLE payment_certificates ADD CONSTRAINT payment_certificates_status_check
      CHECK (status IS NULL OR status IN ('draft', 'qs_review', 'pm_commercial', 'consultant_client', 'finance_review', 'invoice_eligible', 'certified', 'rejected', 'void', 'cancelled'))
      NOT VALID;
  END IF;
END $$;

-- sub_payment_certificates: DEFAULT 'draft' (migrate-4.js:83); UPDATE Joi-valid ['certified','paid'] routes/subcontractors.js:257-267
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sub_payment_certificates_status_check' AND conrelid = 'sub_payment_certificates'::regclass) THEN
    ALTER TABLE sub_payment_certificates ADD CONSTRAINT sub_payment_certificates_status_check
      CHECK (status IS NULL OR status IN ('draft', 'certified', 'paid'))
      NOT VALID;
  END IF;
END $$;

-- sub_work_verifications: DEFAULT 'pending' (migrate-4.js:62); INSERTs omit status routes/subcontractors.js:191, routes/portal.js:118-119; UPDATE guarded ['approved','rejected'] routes/subcontractors.js:203-211
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sub_work_verifications_status_check' AND conrelid = 'sub_work_verifications'::regclass) THEN
    ALTER TABLE sub_work_verifications ADD CONSTRAINT sub_work_verifications_status_check
      CHECK (status IS NULL OR status IN ('pending', 'approved', 'rejected'))
      NOT VALID;
  END IF;
END $$;

-- ap_review_queue: DEFAULT 'open' (finance-migration.js:72-82); INSERT financeEngine.js:485; cleared UPDATE routes/financeLedger.js:192
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ap_review_queue_status_check' AND conrelid = 'ap_review_queue'::regclass) THEN
    ALTER TABLE ap_review_queue ADD CONSTRAINT ap_review_queue_status_check
      CHECK (status IS NULL OR status IN ('open', 'cleared'))
      NOT VALID;
  END IF;
END $$;

-- receivable_reminders: DEFAULT 'sent' (finance-migration.js:87-95); INSERT financeEngine.js:700; no UPDATE of the column exists - minimal list, extend when an escalation state ships
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receivable_reminders_status_check' AND conrelid = 'receivable_reminders'::regclass) THEN
    ALTER TABLE receivable_reminders ADD CONSTRAINT receivable_reminders_status_check
      CHECK (status IS NULL OR status IN ('sent'))
      NOT VALID;
  END IF;
END $$;

-- project_budgets: DEFAULT 'draft' (migrate-5.2.js:29); approved INSERT commercialEngine.js:411-412 and workflow-mirrored via applySourceStatus (workflowEngine.js:50,60,529, module 'project_budgets'); rejected workflow-mirrored
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_budgets_status_check' AND conrelid = 'project_budgets'::regclass) THEN
    ALTER TABLE project_budgets ADD CONSTRAINT project_budgets_status_check
      CHECK (status IS NULL OR status IN ('draft', 'approved', 'rejected'))
      NOT VALID;
  END IF;
END $$;

-- organizations: DEFAULT 'active' (organizations-migration.js:58); backfill/seeds organizations-migration.js:293-295, seed-staging.js:62-71; route Joi-valid ['active','inactive'] routes/organizations.js:93 via orgService.js:273-281
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_status_check' AND conrelid = 'organizations'::regclass) THEN
    ALTER TABLE organizations ADD CONSTRAINT organizations_status_check
      CHECK (status IS NULL OR status IN ('active', 'inactive'))
      NOT VALID;
  END IF;
END $$;
