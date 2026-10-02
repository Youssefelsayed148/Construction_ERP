// Phase 25 — handover, closeout & warranty engine.
//
// The §79 lifecycle through the Phase 6 'handover' workflow template with the
// exact states:
//   pre_handover → punch_snag → rectification → final_inspection →
//   testing_commissioning → as_builts → o_m → training → taking_over →
//   dlp_warranty → final_completion
// Gate: the process cannot leave the punch/snag stage while punch items
// (Phase 19's register) are open. Warranty/DLP claims follow the
// 'warranty_claim' catalog states with SLA tracking.
//
// Every calculation is pure over fetched rows (portable across PostgreSQL
// and the test MockDb). The zero-record contract holds: a project with zero
// punch items renders the handover screen at a correct 0%/clean state.

'use strict';

const { query: defaultQuery } = require('../config/database');
const numbering = require('./numbering');
const workflowEngine = require('./workflowEngine');
const { fireEvent } = require('../utils/activity');
const { WARRANTY_STEP_FOR_STATE } = require('../scripts/handover-migration');

const HANDOVER_STATES = [
  'pre_handover', 'punch_snag', 'rectification', 'final_inspection',
  'testing_commissioning', 'as_builts', 'o_m', 'training', 'taking_over',
  'dlp_warranty', 'final_completion',
];

const WARRANTY_STATES = [
  'raised', 'assigned', 'rectification_in_progress', 'submitted_for_acceptance',
  'accepted', 'rejected', 'closed',
];

const WARRANTY_TRANSITIONS = {
  raised: ['assigned'],
  assigned: ['rectification_in_progress', 'submitted_for_acceptance'],
  rectification_in_progress: ['submitted_for_acceptance'],
  submitted_for_acceptance: ['accepted', 'rejected'],
  rejected: ['rectification_in_progress'],   // reopen with audit trail
  accepted: ['closed'],
};

const PACKAGE_ITEM_TYPES = [
  'as_built_drawings', 'o_m_manuals', 'warranties', 'test_commissioning_results',
  'certificates', 'asset_register', 'keys_access', 'training_records', 'authority_approvals',
];

function num(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function safeAll(q, sql, params) {
  try { return (await q(sql, params)).rows; } catch (e) { return []; }
}

async function safeOne(q, sql, params) {
  try { return (await q(sql, params)).rows[0] || {}; } catch (e) { return {}; }
}

async function nextNumber(q, table, column, prefix) {
  const year = new Date().getFullYear();
  return numbering.nextNumber(q, { table, column, prefix: `${prefix}-${year}`, pad: 4 });
}

// ---------------------------------------------------------------------------
// Handover process lifecycle
// ---------------------------------------------------------------------------

async function startHandover(q, projectId, user) {
  const existing = (await safeOne(q, 'SELECT * FROM handover_processes WHERE project_id = $1', [projectId]));
  if (existing.id) return existing;
  const processNumber = await nextNumber(q, 'handover_processes', 'process_number', 'HO');
  const r = await q(
    `INSERT INTO handover_processes (process_number, project_id, status, created_by) VALUES ($1,$2,'pre_handover',$3) RETURNING *`,
    [processNumber, projectId, user.id]
  );
  const process = r.rows[0];
  const workflow = await workflowEngine.startWorkflow(
    'handover', 'handover_process', process.id,
    { project_id: projectId, requester_id: user.id, module_name: 'handover' },
    { query: q }
  );
  await workflowEngine.syncExternalState(workflow.instance.id, 'pre_handover', {
    userId: user.id, userName: user.name, role: user.role,
  }, { query: q, comment: 'Handover process started' });
  await q('UPDATE handover_processes SET workflow_instance_id = $1 WHERE id = $2', [workflow.instance.id, process.id]);
  process.workflow_instance_id = workflow.instance.id;
  return process;
}

// Transition — the exact state chain, with the punch gate: leaving the
// punch/snag stage requires zero open punch items (Phase 19 register).
async function transitionHandover(q, processId, toState, user) {
  const process = (await safeOne(q, 'SELECT * FROM handover_processes WHERE id = $1', [processId]));
  if (!process.id) throw new Error('Handover process not found');
  const currentIdx = HANDOVER_STATES.indexOf(process.status);
  const nextIdx = HANDOVER_STATES.indexOf(toState);
  if (nextIdx === -1) throw new Error(`Unknown handover state: ${toState}`);
  if (nextIdx !== currentIdx + 1) {
    throw new Error(`Handover must move through the exact states — cannot go from '${process.status}' to '${toState}'`);
  }
  if (process.status === 'punch_snag') {
    const open = (await safeOne(q,
      `SELECT COUNT(*) AS c FROM punch_items WHERE project_id = $1 AND status = ANY($2::text[])`,
      [process.project_id, ['open', 'assigned', 'rectified']]));
    if (parseInt(open.c || 0, 10) > 0) {
      throw new Error(`Cannot leave the punch/snag stage with ${open.c} open punch item(s)`);
    }
  }
  const now = new Date();
  await q(
    `UPDATE handover_processes SET status = $1, completed_at = $2, updated_at = $2 WHERE id = $3`,
    [toState, toState === 'final_completion' ? now : null, processId]
  );
  if (process.workflow_instance_id) {
    await workflowEngine.syncExternalState(process.workflow_instance_id, toState, {
      userId: user.id, userName: user.name, role: user.role,
    }, { query: q, comment: `Advanced to ${toState}`, terminal: toState === 'final_completion' });
  }
  await fireEvent({
    eventType: 'handover.advanced', entityType: 'handover_process', entityId: num(processId),
    userId: user.id, userName: user.name, userRole: user.role,
    payload: { project_id: process.project_id, status: toState },
  }, { query: q });
  return (await safeOne(q, 'SELECT * FROM handover_processes WHERE id = $1', [processId]));
}

// ---------------------------------------------------------------------------
// Package checklist + readiness
// ---------------------------------------------------------------------------

async function ensureDefaultPackageItems(q, projectId) {
  const existing = (await safeOne(q, 'SELECT COUNT(*) AS c FROM handover_package_items WHERE project_id = $1', [projectId]));
  if (parseInt(existing.c || 0, 10) > 0) return 0;
  const defaults = [
    ['as_built_drawings', 'As-built drawings'],
    ['o_m_manuals', 'O&M manuals'],
    ['warranties', 'Warranties'],
    ['test_commissioning_results', 'Test & commissioning results'],
    ['certificates', 'Certificates'],
    ['asset_register', 'Equipment/asset register'],
    ['keys_access', 'Keys & access items'],
    ['training_records', 'Training records'],
    ['authority_approvals', 'Authority approvals'],
  ];
  for (const [item_type, title] of defaults) {
    await q(
      `INSERT INTO handover_package_items (project_id, item_type, title, status) VALUES ($1,$2,$3,'pending')`,
      [projectId, item_type, title]
    );
  }
  return defaults.length;
}

// Readiness percent — complete package items ÷ total; zero records → 0%
// (never an error). Open punch items surface alongside.
async function handoverReadiness(q, projectId) {
  const rows = await safeAll(q,
    'SELECT status FROM handover_package_items WHERE project_id = $1', [projectId]);
  const total = rows.length;
  const complete = rows.filter((r) => r.status === 'complete').length;
  const openPunchRow = await safeOne(q,
    `SELECT COUNT(*) AS c FROM punch_items WHERE project_id = $1 AND status = ANY($2::text[])`,
    [projectId, ['open', 'assigned', 'rectified']]);
  const openPunch = parseInt(openPunchRow.c || 0, 10);
  return {
    items_total: total,
    items_complete: complete,
    percent: total > 0 ? Math.round((complete / total) * 100) : 0,
    open_punch_items: openPunch,
  };
}

// ---------------------------------------------------------------------------
// Warranty / DLP claims — 'warranty_claim' catalog states with SLA tracking
// ---------------------------------------------------------------------------

async function createWarrantyClaim(q, input, user) {
  const claimNumber = await nextNumber(q, 'warranty_claims', 'claim_number', 'WCL');
  const slaDays = input.sla_days == null ? 30 : num(input.sla_days);
  const dueDate = input.due_date
    || new Date(Date.now() + slaDays * 86400000).toISOString().slice(0, 10);
  const r = await q(
    `INSERT INTO warranty_claims (claim_number, project_id, asset_id, project_location_id, title, description,
       raised_by_user_id, status, sla_days, due_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'raised',$8,$9) RETURNING *`,
    [claimNumber, input.project_id, input.asset_id == null ? null : num(input.asset_id),
     input.project_location_id == null ? null : num(input.project_location_id),
     input.title, input.description, user.id, slaDays, dueDate]
  );
  const claim = r.rows[0];
  const workflow = await workflowEngine.startWorkflow(
    'warranty_claim', 'warranty_claim', claim.id,
    { project_id: input.project_id, requester_id: user.id, module_name: 'warranty' },
    { query: q }
  );
  await workflowEngine.syncExternalState(workflow.instance.id, 'raised', {
    userId: user.id, userName: user.name, role: user.role,
  }, { query: q, comment: 'Warranty claim raised' });
  await q('UPDATE warranty_claims SET workflow_instance_id = $1 WHERE id = $2', [workflow.instance.id, claim.id]);
  claim.workflow_instance_id = workflow.instance.id;
  return claim;
}

// Claim transitions — assignment routes the claim to the PM/subcontractor;
// acceptance requires rectification evidence and closes the claim.
async function transitionWarrantyClaim(q, claimId, toState, user, {
  note = null, assigned_organization_id = null, assigned_user_id = null, evidence = null,
} = {}) {
  const claim = (await safeOne(q, 'SELECT * FROM warranty_claims WHERE id = $1', [claimId]));
  if (!claim.id) throw new Error('Warranty claim not found');
  if (!WARRANTY_TRANSITIONS[claim.status] || !WARRANTY_TRANSITIONS[claim.status].includes(toState)) {
    throw new Error(`Cannot transition warranty claim from '${claim.status}' to '${toState}'`);
  }
  const now = new Date();
  const params = [toState, now];
  const sets = ['status = $1', 'updated_at = $2'];
  let i = 3;
  if (toState === 'assigned') {
    sets.push(`assigned_organization_id = $${i++}`, `assigned_user_id = $${i++}`, `assigned_at = $${i++}`);
    params.push(assigned_organization_id == null ? null : num(assigned_organization_id),
      assigned_user_id == null ? null : num(assigned_user_id), now);
  }
  if (toState === 'submitted_for_acceptance' || toState === 'rejected' || toState === 'accepted') {
    if (evidence) {
      const existing = typeof claim.rectification_evidence === 'string'
        ? JSON.parse(claim.rectification_evidence) : (claim.rectification_evidence || []);
      sets.push(`rectification_evidence = $${i++}`);
      params.push(JSON.stringify([...existing, { by: user.name, at: now.toISOString(), note: note || null, ...(evidence || {}) }]));
    }
  }
  if (toState === 'accepted') { sets.push(`accepted_by = $${i++}`, `accepted_at = $${i++}`); params.push(user.id, now); }
  if (toState === 'closed') { sets.push(`closed_at = $${i++}`); params.push(now); }
  params.push(claimId);
  await q(`UPDATE warranty_claims SET ${sets.join(', ')} WHERE id = $${i}`, params);

  if (claim.workflow_instance_id) {
    const stepKey = WARRANTY_STEP_FOR_STATE[toState] || toState;
    await workflowEngine.syncExternalState(claim.workflow_instance_id, stepKey, {
      userId: user.id, userName: user.name, role: user.role,
    }, { query: q, comment: note || `Claim ${toState}`, terminal: toState === 'closed' });
  }
  await fireEvent({
    eventType: `warranty.${toState}`, entityType: 'warranty_claim', entityId: num(claimId),
    userId: user.id, userName: user.name, userRole: user.role,
    payload: { project_id: claim.project_id, claim_number: claim.claim_number, status: toState },
  }, { query: q });
  return (await safeOne(q, 'SELECT * FROM warranty_claims WHERE id = $1', [claimId]));
}

// SLA tracking — overdue claims (past due, not closed) with days remaining.
async function warrantySlaStatus(q, claimId) {
  const claim = await safeOne(q, 'SELECT * FROM warranty_claims WHERE id = $1', [claimId]);
  if (!claim.id) throw new Error('Warranty claim not found');
  const due = claim.due_date ? new Date(claim.due_date) : null;
  const open = !['accepted', 'closed'].includes(claim.status);
  return {
    claim_number: claim.claim_number,
    status: claim.status,
    due_date: claim.due_date,
    is_overdue: open && due ? due < new Date() : false,
    days_remaining: due ? Math.ceil((due.getTime() - Date.now()) / 86400000) : null,
  };
}

module.exports = {
  HANDOVER_STATES,
  WARRANTY_STATES,
  WARRANTY_TRANSITIONS,
  PACKAGE_ITEM_TYPES,
  startHandover,
  transitionHandover,
  ensureDefaultPackageItems,
  handoverReadiness,
  createWarrantyClaim,
  transitionWarrantyClaim,
  warrantySlaStatus,
  nextNumber,
  safeAll,
  safeOne,
};
