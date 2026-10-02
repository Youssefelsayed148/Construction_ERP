// Phase 19 — branded QA/QC document set (pdfkit), rendered through the same
// one-layout-branded renderer the procurement module uses (procurementPdf).
//
// Catalog documents:
//   ITP · WIR · inspection checklist · MIR (procurement module renders it) ·
//   NCR · corrective action · test report · punch list.

'use strict';

const { renderDocument } = require('./procurementPdf');

async function renderITP({ itp, points, projectName }) {
  return renderDocument({
    docType: 'ITP — INSPECTION & TEST PLAN',
    number: itp.itp_number,
    date: itp.created_at,
    meta: [
      ['Project', projectName],
      ['Title', itp.title],
      ['Discipline', itp.discipline],
      ['Work package', itp.work_package],
    ],
    columns: ['#', 'Point', 'Type', 'Responsible', 'Consultant', 'Acceptance criteria'],
    rows: points.map((p, i) => [
      String(i + 1),
      p.title,
      (p.point_type || 'review').toUpperCase(),
      p.responsible_party || '-',
      p.consultant_responsibility || '-',
      (p.acceptance_criteria || '-').slice(0, 80),
    ]),
    notes: 'Hold points require consultant sign-off before work continues; witness points require attendance.',
  });
}

async function renderWIR({ wir, projectName, checklist }) {
  return renderDocument({
    docType: 'WIR — WORK INSPECTION REQUEST',
    number: wir.wir_number,
    date: wir.inspection_date || wir.created_at,
    meta: [
      ['Project', projectName],
      ['Work package', wir.work_package],
      ['Status', wir.status],
      ['Result', wir.result || 'pending'],
    ],
    columns: ['Field', 'Value'],
    rows: [
      ['Location', wir.project_location_name || '-'],
      ['ITP point', wir.itp_point_title || '-'],
      ['Subcontractor', wir.subcontractor_name || '-'],
      ['Drawings', wir.latest_drawing_ref || '-'],
      ['Method statement', wir.method_statement_ref || '-'],
    ],
    notes: wir.decision_comment || wir.notes || null,
  });
}

async function renderNCR({ ncr, projectName }) {
  return renderDocument({
    docType: 'NCR — NON-CONFORMANCE REPORT',
    number: ncr.ncr_number,
    date: ncr.created_at,
    meta: [
      ['Project', projectName],
      ['Severity', ncr.severity],
      ['Status', ncr.status],
      ['Exact location', ncr.exact_location || '-'],
      ['Responsible party', ncr.responsible_party || '-'],
    ],
    columns: ['Field', 'Value'],
    rows: [
      ['Description', ncr.description],
      ['Root cause', ncr.root_cause || '-'],
      ['Corrective action', ncr.corrective_action || '-'],
      ['Preventive action', ncr.preventive_action || '-'],
      ['Cost impact', ncr.cost_impact != null ? String(ncr.cost_impact) : '-'],
      ['Schedule impact (days)', ncr.schedule_impact_days != null ? String(ncr.schedule_impact_days) : '-'],
      ['Verification', ncr.verification_notes || '-'],
      ['Closure authority', ncr.closure_authority || '-'],
    ],
  });
}

async function renderCorrectiveAction({ action, kind, projectName }) {
  return renderDocument({
    docType: kind === 'preventive' ? 'PA — PREVENTIVE ACTION' : 'CA — CORRECTIVE ACTION',
    number: `${kind === 'preventive' ? 'PA' : 'CA'}-${String(action.id).padStart(5, '0')}`,
    date: action.created_at,
    meta: [
      ['Project', projectName],
      ['Source', `${action.source_type} #${action.source_id}`],
      ['Status', action.status],
      ['Due', action.due_date || '-'],
    ],
    columns: ['Field', 'Value'],
    rows: [['Description', action.description], ['Verification', action.verification_notes || '-']],
  });
}

async function renderTestReport({ test, projectName }) {
  return renderDocument({
    docType: 'TEST REPORT',
    number: `QT-${String(test.id).padStart(5, '0')}`,
    date: test.test_date,
    meta: [
      ['Project', projectName],
      ['Test type', test.test_type],
      ['Result', test.result],
      ['Tested by', test.tested_by || '-'],
    ],
    columns: ['Field', 'Value'],
    rows: [['Notes', test.notes || '-']],
  });
}

async function renderPunchList({ items, projectName }) {
  return renderDocument({
    docType: 'PUNCH LIST',
    number: `PUNCH-${new Date().toISOString().slice(0, 10)}`,
    date: new Date(),
    meta: [['Project', projectName], ['Items', String(items.length)]],
    columns: ['Item', 'Location', 'Discipline', 'Responsible', 'Due', 'Status'],
    rows: items.map((i) => [
      i.punch_number, i.location_name || '-', i.discipline || '-',
      i.responsible_name || '-', i.due_date || '-', i.status,
    ]),
  });
}

async function renderChecklist({ instance, projectName }) {
  const items = typeof instance.items === 'string' ? JSON.parse(instance.items) : (instance.items || []);
  return renderDocument({
    docType: 'INSPECTION CHECKLIST',
    number: `CHK-${String(instance.id).padStart(5, '0')}`,
    date: instance.created_at,
    meta: [['Project', projectName], ['Title', instance.title || '-'], ['Context', `${instance.context_type} #${instance.context_id}`]],
    columns: ['#', 'Item', 'Acceptance criteria', 'OK', 'Note'],
    rows: items.map((it, i) => [
      String(i + 1), it.item || it.title || '-',
      it.acceptance_criteria || '-', it.ok ? 'YES' : 'NO', it.note || '',
    ]),
  });
}

module.exports = { renderITP, renderWIR, renderNCR, renderCorrectiveAction, renderTestReport: renderTestReport, renderPunchList, renderChecklist };
