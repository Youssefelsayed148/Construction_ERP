// Focused closeout test for the G1.2 status-CHECK migration batches: parses each
// batch's migration file and asserts every table's constraint carries exactly the
// writer-derived vocabulary (workflow-mirrored step keys and filter-only values
// included where the task rule requires). Pure static check - no live DB needed.
'use strict';

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', '..', 'migrations');

// migration file -> { table: [expected values] } (exact set match)
const EXPECTED = {
  '0075_procurement_status_checks.sql': {
    purchase_requests: ['draft', 'submitted', 'budget_check', 'authority_approval', 'procurement', 'rejected', 'cancelled'],
    purchase_orders: ['draft', 'commercial_procurement_approval', 'financial_authority', 'issued', 'acknowledged', 'partially_fully_delivered', 'partially_delivered', 'fully_delivered', 'closed', 'rejected', 'cancelled', 'approved', 'confirmed'],
  },
  '0076_commercial_finance_status_checks.sql': {
    client_contracts: ['active', 'closed', 'terminated'],
    commitments: ['active', 'cancelled'],
    sub_contracts: ['draft', 'active', 'terminated', 'approved', 'completed', 'closed'],
    variations: ['change_event', 'estimate', 'internal_commercial_review', 'authority_approval', 'consultant_recommendation', 'client_approval_reject', 'incorporated', 'rejected'],
    payment_certificates: ['draft', 'qs_review', 'pm_commercial', 'consultant_client', 'finance_review', 'invoice_eligible', 'certified', 'rejected', 'void', 'cancelled'],
    sub_payment_certificates: ['draft', 'certified', 'paid'],
    sub_work_verifications: ['pending', 'approved', 'rejected'],
    ap_review_queue: ['open', 'cleared'],
    receivable_reminders: ['sent'],
    project_budgets: ['draft', 'approved', 'rejected'],
    organizations: ['active', 'inactive'],
  },
  '0077_qa_hse_status_checks.sql': {
    ncrs: ['open', 'in_progress', 'resolved', 'closed', 'verification'],
    near_misses: ['open', 'closed'],
    observations: ['raised', 'acknowledged', 'assigned', 'rectification_in_progress', 'submitted_for_verification', 'accepted', 'rejected', 'closed'],
    corrective_actions: ['open', 'in_progress', 'completed', 'verified'],
    preventive_actions: ['open', 'in_progress', 'completed', 'verified'],
    hse_inspections: ['pending', 'passed', 'failed'],
    jsas: ['draft', 'reviewed', 'approved', 'superseded'],
    risk_assessments: ['draft', 'reviewed', 'approved', 'superseded'],
    inductions: ['completed', 'pending', 'expired'],
    incidents: ['open', 'investigating', 'closed'],
    permits: ['draft', 'pending_approval', 'approved', 'active', 'rejected', 'suspended', 'closed', 'expired'],
    itps: ['draft', 'active', 'archived'],
    mock_ups: ['proposed', 'under_review', 'approved', 'rejected', 'rework'],
    punch_items: ['open', 'assigned', 'rectified', 'verified', 'closed'],
    wirs: ['draft', 'submitted', 'qa_qc_review', 'pm_review', 'consultant_review', 'approved', 'approved_with_comments', 'rejected'],
  },
  '0078_doc_control_status_checks.sql': {
    project_documents: ['draft', 'review', 'submitted', 'approved', 'rejected', 'archived', 'acknowledged', 'awaiting_acknowledgement'],
    document_versions: ['current', 'superseded'],
    correspondence: ['draft', 'sent', 'received', 'responded', 'closed'],
    transmittals: ['draft', 'sent', 'acknowledged', 'closed'],
    project_rfis: ['open', 'draft', 'submitted', 'coordinator', 'discipline_review', 'answered', 'acknowledged', 'closed'],
    project_submittals: ['submitted', 'internal_technical_review', 'pm', 'consultant_coordinator', 'reviewer', 'resubmit_required', 'closed'],
    legal_documents: ['pending', 'verified', 'rejected'],
    engineer_instructions: ['issued', 'acknowledged', 'implemented', 'closed'],
  },
  '0079_handover_maintenance_status_checks.sql': {
    handover_package_items: ['pending', 'uploaded', 'approved', 'complete'],
    warranty_claims: ['raised', 'assigned', 'rectification_in_progress', 'submitted_for_acceptance', 'accepted', 'rejected', 'closed'],
    maintenance_reminders: ['scheduled', 'in_progress', 'completed', 'cancelled'],
    assets: ['active', 'maintenance', 'repair', 'out_of_service'],
    work_completions: ['pending_verification', 'verified', 'rejected', 'pending'],
  },
  '0080_hr_status_checks.sql': {
    employees: ['active', 'inactive', 'on_leave', 'terminated'],
    attendance: ['present', 'absent', 'late', 'on_leave'],
    leave_requests: ['pending', 'approved', 'rejected'],
    payroll_periods: ['draft', 'approved', 'rejected', 'paid'],
  },
};

describe('G1.2 status CHECK vocabularies', () => {
  for (const [file, tables] of Object.entries(EXPECTED)) {
    test(`${file} constrains every table with the exact derived vocabulary`, () => {
      const sql = fs.readFileSync(path.join(DIR, file), 'utf8');
      for (const [table, expected] of Object.entries(tables)) {
        expect(sql).toMatch(new RegExp(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_status_check`));
        const constraint = sql.match(new RegExp(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_status_check[\\s\\S]*?NOT VALID;`))[0];
        expect(constraint).toMatch('status IS NULL OR status IN (');
        expect(constraint).toMatch('NOT VALID');
        const found = [...constraint.matchAll(/'([a-z_0-9]+)'/g)].map(m => m[1]);
        expect(found.sort()).toEqual([...expected].sort());
      }
    });
  }
});
