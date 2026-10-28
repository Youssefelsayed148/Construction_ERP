-- G1.2: VALIDATE the NOT VALID status CHECK constraints (0075-0083).
--
-- Run this ONLY after confirming no row currently violates a constraint:
--   SELECT table_name, status, count(*) FROM <table> GROUP BY 1,2;
-- or in bulk:
--   SELECT conrelid::regclass, conname FROM pg_constraint
--     WHERE conname LIKE '%_status_check' AND NOT convalidated;
--
-- VALIDATE CONSTRAINT re-checks every existing row and fails on the first violation
-- (rolling back only that statement); a failed validation does NOT drop the constraint -
-- clean or restore the offending rows, then re-run. Each line is idempotent: validating an
-- already-validated constraint is a no-op. See docs/MIGRATIONS.md.

-- src/migrations/0075 (procurement_status_checks)
ALTER TABLE purchase_requests VALIDATE CONSTRAINT purchase_requests_status_check;
ALTER TABLE purchase_orders VALIDATE CONSTRAINT purchase_orders_status_check;
ALTER TABLE rfqs VALIDATE CONSTRAINT rfqs_status_check;
ALTER TABLE rfq_vendors VALIDATE CONSTRAINT rfq_vendors_status_check;
ALTER TABLE supplier_quotations VALIDATE CONSTRAINT supplier_quotations_status_check;
ALTER TABLE deliveries VALIDATE CONSTRAINT deliveries_status_check;
ALTER TABLE goods_receipt_notes VALIDATE CONSTRAINT goods_receipt_notes_status_check;
ALTER TABLE supplier_invoices VALIDATE CONSTRAINT supplier_invoices_status_check;
ALTER TABLE supplier_returns VALIDATE CONSTRAINT supplier_returns_status_check;

-- src/migrations/0076 (commercial_finance_status_checks)
ALTER TABLE client_contracts VALIDATE CONSTRAINT client_contracts_status_check;
ALTER TABLE commitments VALIDATE CONSTRAINT commitments_status_check;
ALTER TABLE sub_contracts VALIDATE CONSTRAINT sub_contracts_status_check;
ALTER TABLE variations VALIDATE CONSTRAINT variations_status_check;
ALTER TABLE payment_certificates VALIDATE CONSTRAINT payment_certificates_status_check;
ALTER TABLE sub_payment_certificates VALIDATE CONSTRAINT sub_payment_certificates_status_check;
ALTER TABLE sub_work_verifications VALIDATE CONSTRAINT sub_work_verifications_status_check;
ALTER TABLE ap_review_queue VALIDATE CONSTRAINT ap_review_queue_status_check;
ALTER TABLE receivable_reminders VALIDATE CONSTRAINT receivable_reminders_status_check;
ALTER TABLE project_budgets VALIDATE CONSTRAINT project_budgets_status_check;
ALTER TABLE organizations VALIDATE CONSTRAINT organizations_status_check;

-- src/migrations/0077 (qa_hse_status_checks)
ALTER TABLE ncrs VALIDATE CONSTRAINT ncrs_status_check;
ALTER TABLE near_misses VALIDATE CONSTRAINT near_misses_status_check;
ALTER TABLE observations VALIDATE CONSTRAINT observations_status_check;
ALTER TABLE corrective_actions VALIDATE CONSTRAINT corrective_actions_status_check;
ALTER TABLE preventive_actions VALIDATE CONSTRAINT preventive_actions_status_check;
ALTER TABLE hse_inspections VALIDATE CONSTRAINT hse_inspections_status_check;
ALTER TABLE jsas VALIDATE CONSTRAINT jsas_status_check;
ALTER TABLE risk_assessments VALIDATE CONSTRAINT risk_assessments_status_check;
ALTER TABLE inductions VALIDATE CONSTRAINT inductions_status_check;
ALTER TABLE incidents VALIDATE CONSTRAINT incidents_status_check;
ALTER TABLE permits VALIDATE CONSTRAINT permits_status_check;
ALTER TABLE itps VALIDATE CONSTRAINT itps_status_check;
ALTER TABLE mock_ups VALIDATE CONSTRAINT mock_ups_status_check;
ALTER TABLE punch_items VALIDATE CONSTRAINT punch_items_status_check;
ALTER TABLE wirs VALIDATE CONSTRAINT wirs_status_check;

-- src/migrations/0078 (doc_control_status_checks)
ALTER TABLE project_documents VALIDATE CONSTRAINT project_documents_status_check;
ALTER TABLE document_versions VALIDATE CONSTRAINT document_versions_status_check;
ALTER TABLE correspondence VALIDATE CONSTRAINT correspondence_status_check;
ALTER TABLE transmittals VALIDATE CONSTRAINT transmittals_status_check;
ALTER TABLE project_rfis VALIDATE CONSTRAINT project_rfis_status_check;
ALTER TABLE project_submittals VALIDATE CONSTRAINT project_submittals_status_check;
ALTER TABLE legal_documents VALIDATE CONSTRAINT legal_documents_status_check;
ALTER TABLE engineer_instructions VALIDATE CONSTRAINT engineer_instructions_status_check;

-- src/migrations/0079 (handover_maintenance_status_checks)
ALTER TABLE handover_package_items VALIDATE CONSTRAINT handover_package_items_status_check;
ALTER TABLE warranty_claims VALIDATE CONSTRAINT warranty_claims_status_check;
ALTER TABLE maintenance_reminders VALIDATE CONSTRAINT maintenance_reminders_status_check;
ALTER TABLE assets VALIDATE CONSTRAINT assets_status_check;
ALTER TABLE work_completions VALIDATE CONSTRAINT work_completions_status_check;

-- src/migrations/0080 (hr_status_checks)
ALTER TABLE employees VALIDATE CONSTRAINT employees_status_check;
ALTER TABLE attendance VALIDATE CONSTRAINT attendance_status_check;
ALTER TABLE leave_requests VALIDATE CONSTRAINT leave_requests_status_check;
ALTER TABLE payroll_periods VALIDATE CONSTRAINT payroll_periods_status_check;

-- src/migrations/0081 (schedule_work_status_checks)
ALTER TABLE schedule_activities VALIDATE CONSTRAINT schedule_activities_status_check;
ALTER TABLE work_packages VALIDATE CONSTRAINT work_packages_status_check;

-- src/migrations/0082 (inventory_materials_status_checks)
ALTER TABLE inventory_transfers VALIDATE CONSTRAINT inventory_transfers_status_check;
ALTER TABLE stock_reservations VALIDATE CONSTRAINT stock_reservations_status_check;
ALTER TABLE material_requirements VALIDATE CONSTRAINT material_requirements_status_check;
ALTER TABLE material_inspection_requests VALIDATE CONSTRAINT material_inspection_requests_status_check;
ALTER TABLE replenishment_alerts VALIDATE CONSTRAINT replenishment_alerts_status_check;

-- src/migrations/0083 (misc_infra_status_checks)
ALTER TABLE action_items VALIDATE CONSTRAINT action_items_status_check;
ALTER TABLE background_sweep_runs VALIDATE CONSTRAINT background_sweep_runs_status_check;
ALTER TABLE idempotency_keys VALIDATE CONSTRAINT idempotency_keys_status_check;
ALTER TABLE notifications VALIDATE CONSTRAINT notifications_status_check;
ALTER TABLE portal_submissions VALIDATE CONSTRAINT portal_submissions_status_check;
ALTER TABLE scheduled_report_runs VALIDATE CONSTRAINT scheduled_report_runs_status_check;
ALTER TABLE webhook_deliveries VALIDATE CONSTRAINT webhook_deliveries_status_check;
ALTER TABLE project_workflows VALIDATE CONSTRAINT project_workflows_status_check;
ALTER TABLE workflow_instances VALIDATE CONSTRAINT workflow_instances_status_check;
ALTER TABLE workflow_step_instances VALIDATE CONSTRAINT workflow_step_instances_status_check;
ALTER TABLE approval_requests VALIDATE CONSTRAINT approval_requests_status_check;
