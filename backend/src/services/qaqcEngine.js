// Phase 19 — QA/QC engine: the WIR and punch-item domain state machines,
// synced to the Phase 6 workflow engine the same way the consultant portal
// observation flow (Phase 16) is.
//
// WIR — states EXACTLY as the Phase 6 catalog's 'wir' template defines them:
//   draft → qa_qc → pm_review (optional) → consultant → final result
//   results: approved | approved_with_comments | rejected | reinspect
//   rejected → terminal; reinspect loops back to qa_qc (new inspection cycle).
// The template's reviewer steps (qa_qc → engineer, pm → project_manager,
// consultant → consultant org) are the authorization surface: each domain
// transition checks the same role the template step resolves, so the Phase 6
// catalog stays the single source of truth. Self-steps (the requester's own
// draft) use syncExternalState because the Phase 6 self-approval guard
// targets requester≠reviewer flows; reviewer steps go through
// recordDecision so authorization, step ordering, the append-only decision
// log and the action-item pipeline stay engine-owned.
//
// Punch items — the 'handover_punch' catalog template:
//   raised → assigned → rectified → verified → closed.
// Phase 25 (handover) reuses this table and its workflow.
//
// Every transition: domain status update + workflow sync + Phase 7 event.
// The zero-record requirement holds: every list endpoint returns [] on a
// fresh project, never an error.

'use strict';

const { query: defaultQuery } = require('../config/database');
const numbering = require('./numbering');
const workflowEngine = require('./workflowEngine');
const { fireEvent } = require('../utils/activity');

const WIR_RESULT_STATES = ['approved', 'approved_with_comments', 'rejected', 'reinspect'];

// Domain status → workflow template step key (the sync surface).
const WIR_STEP_FOR_STATE = {
  draft: 'draft',
  submitted: 'qa_qc',
  qa_qc_review: 'qa_qc',
  pm_review: 'pm_optional',
  consultant_review: 'consultant',
  approved: 'approved_comments_rejected_reinspect',
  approved_with_comments: 'approved_comments_rejected_reinspect',
  rejected: 'approved_comments_rejected_reinspect',
  reinspect: 'qa_qc',
};

// Which role may act at each transition — mirrors the 'wir' template steps.
const WIR_ALLOWED_ROLES = {
  submit: ['site_supervisor', 'engineer'],
  qa_qc: ['engineer'],
  pm: ['project_manager'],
  consultant: ['consultant'],
  result: ['consultant'],
};

const PUNCH_STEP_FOR_STATE = {
  open: 'raised',
  assigned: 'assigned',
  rectified: 'rectified',
  verified: 'verified',
  closed: 'closed',
};

const PUNCH_ALLOWED_ROLES = {
  assign: ['project_manager', 'site_supervisor'],
  rectify: ['site_supervisor', 'subcontractor'],
  verify: ['consultant'],
  close: ['project_manager'],
};

function num(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function nextNumber(q, table, column, prefix) {
  const year = new Date().getFullYear();
  return numbering.nextNumber(q, { table, column, prefix: `${prefix}-${year}`, pad: 4 });
}

// ---------------------------------------------------------------------------
// WIR
// ---------------------------------------------------------------------------

async function createWir(q, input, user) {
  const wirNumber = await nextNumber(q, 'wirs', 'wir_number', 'WIR');
  const r = await q(
    `INSERT INTO wirs (wir_number, project_id, itp_id, itp_point_id, boq_item_id, project_location_id,
       work_package, subcontractor_organization_id, inspection_date, latest_drawing_ref,
       method_statement_ref, checklist_instance_id, photos, notes, status, submitted_by, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9, CURRENT_DATE),$10,$11,$12,$13::jsonb,$14,'draft',$15,$15) RETURNING *`,
    [wirNumber, input.project_id, input.itp_id == null ? null : num(input.itp_id),
     input.itp_point_id == null ? null : num(input.itp_point_id),
     input.boq_item_id == null ? null : num(input.boq_item_id),
     input.project_location_id == null ? null : num(input.project_location_id),
     input.work_package || null, input.subcontractor_organization_id == null ? null : num(input.subcontractor_organization_id),
     input.inspection_date || null, input.latest_drawing_ref || null, input.method_statement_ref || null,
     input.checklist_instance_id == null ? null : num(input.checklist_instance_id),
     JSON.stringify(input.photos || []), input.notes || null, user.id]
  );
  const wir = r.rows[0];

  const workflow = await workflowEngine.startWorkflow(
    'wir', 'wir', wir.id,
    { project_id: input.project_id, requester_id: user.id, wir_number: wirNumber, module_name: 'wir' },
    { query: q }
  );
  await workflowEngine.syncExternalState(workflow.instance.id, 'draft', {
    userId: user.id, userName: user.name, role: user.role,
  }, { query: q, comment: 'WIR drafted' });
  await q('UPDATE wirs SET workflow_instance_id = $1 WHERE id = $2', [workflow.instance.id, wir.id]);
  wir.workflow_instance_id = workflow.instance.id;
  return wir;
}

// submit — requester self-step. The engine's draft step is stamped done and
// the QA/QC step is opened as pending with its assigned role; the Phase 7
// action pipeline picks the step up from there.
async function submitWir(q, wirId, user) {
  const wir = (await q('SELECT * FROM wirs WHERE id = $1', [wirId])).rows[0];
  if (!wir) throw new Error('WIR not found');
  if (wir.status !== 'draft') throw new Error(`WIR is already ${wir.status}`);
  const allowed = user.role === 'owner' || user.role === 'admin' || WIR_ALLOWED_ROLES.submit.includes(user.role);
  if (!allowed) throw new Error('Not authorized to submit this WIR');

  await q(`UPDATE wirs SET status = 'submitted', submitted_by = $1, updated_at = $2 WHERE id = $3`,
    [user.id, new Date(), wirId]);
  await syncWirWorkflow(q, wir, 'draft', user, false, 'Submitted for QA/QC review');
  await openWirStep(q, wir.workflow_instance_id, 'qa_qc');
  await fireEvent({
    eventType: 'wir.submitted', entityType: 'wir', entityId: num(wirId),
    userId: user.id, userName: user.name, userRole: user.role,
    payload: { project_id: wir.project_id, wir_number: wir.wir_number, title: `WIR ${wir.wir_number} submitted` },
  }, { query: q });
  return (await q('SELECT * FROM wirs WHERE id = $1', [wirId])).rows[0];
}

// Reviewer step decisions (QA/QC + PM stages; the consultant stage takes the
// final result via decideWir). Authorization mirrors the 'wir' template's
// step resolvers — the catalog is the single source of truth for who decides.
//   approve → stamp the step done, open the next one; reject/return → the WIR
//   goes back to the requester for correction (re-submission re-opens QA/QC).
async function wirStepDecision(q, wirId, stepKey, user, decision, comment) {
  const wir = (await q('SELECT * FROM wirs WHERE id = $1', [wirId])).rows[0];
  if (!wir) throw new Error('WIR not found');
  if (!['approve', 'reject', 'return'].includes(decision)) {
    throw new Error(`Invalid decision: ${decision}`);
  }
  if (wir.status === 'consultant_review') {
    throw new Error('The consultant stage takes the final result — POST /result');
  }
  if (!['submitted', 'qa_qc_review', 'pm_review'].includes(wir.status)) {
    throw new Error(`WIR is ${wir.status} — no review step is open`);
  }
  if (!wir.workflow_instance_id) throw new Error('WIR has no workflow instance');

  const stage = wir.status === 'pm_review' ? 'pm' : 'qa_qc';
  const step = stage === 'pm' ? 'pm_optional' : 'qa_qc';
  const allowed = user.role === 'owner' || user.role === 'admin' || WIR_ALLOWED_ROLES[stage].includes(user.role);
  if (!allowed) {
    const err = new Error(`Not authorized to decide the ${stage} stage`);
    err.statusCode = 403;
    throw err;
  }

  const now = new Date();
  if (decision === 'approve') {
    await syncWirWorkflow(q, wir, step, user, false, comment || `${stage} approved`);
    const nextStatus = stage === 'qa_qc' ? 'pm_review' : 'consultant_review';
    await q(`UPDATE wirs SET status = $1, ${stampByFor(wir.status === 'pm_review' ? 'pm_review' : 'qa_qc_review')} = $2,
               ${stampAtFor(wir.status === 'pm_review' ? 'pm_review' : 'qa_qc_review')} = $3, updated_at = $3 WHERE id = $4`,
      [nextStatus, user.id, now, wirId]);
    await openWirStep(q, wir.workflow_instance_id, stage === 'qa_qc' ? 'pm_optional' : 'consultant');
  } else {
    // reject / return — back to the requester for correction. The step is
    // stamped rejected for the audit trail; re-submission re-opens QA/QC.
    await syncWirWorkflow(q, wir, step, user, false, comment || `${stage} returned for correction`, { rejected: true });
    await q(`UPDATE wirs SET status = 'draft', updated_at = $1 WHERE id = $2`, [now, wirId]);
  }
  return (await q('SELECT * FROM wirs WHERE id = $1', [wirId])).rows[0];
}

function stampByFor(status) {
  return status === 'qa_qc_review' ? 'qa_qc_by' : (status === 'pm_review' ? 'pm_by' : 'consultant_by');
}
function stampAtFor(status) {
  return status === 'qa_qc_review' ? 'qa_qc_at' : (status === 'pm_review' ? 'pm_at' : 'consultant_at');
}

// Final result — the consultant's decision: approved / approved_with_comments
// / rejected / reinspect. reinspect loops the WIR back into a new QA/QC cycle.
async function decideWir(q, wirId, user, result, { comment = null } = {}) {
  if (!WIR_RESULT_STATES.includes(result)) {
    throw new Error(`Invalid WIR result: ${result}`);
  }
  const wir = (await q('SELECT * FROM wirs WHERE id = $1', [wirId])).rows[0];
  if (!wir) throw new Error('WIR not found');
  if (wir.status !== 'consultant_review') {
    throw new Error(`Only the consultant stage takes the final result (WIR is ${wir.status})`);
  }
  const allowed = user.role === 'owner' || user.role === 'admin' || WIR_ALLOWED_ROLES.result.includes(user.role);
  if (!allowed) {
    const err = new Error('Not authorized to record the WIR result');
    err.statusCode = 403;
    throw err;
  }

  const now = new Date();
  const nextStatus = result === 'reinspect' ? 'submitted' : result;
  await q(
    `UPDATE wirs SET status = $1, result = $2, decision_comment = $3, decided_by = $4, decided_at = $5, updated_at = $5
     WHERE id = $6`,
    [nextStatus, result, comment, user.id, now, wirId]
  );
  // The consultant step is stamped done; the terminal step closes the
  // instance for approval results. reinspect re-opens the QA/QC step instead
  // (a new inspection cycle on the same instance — full audit trail kept).
  await syncWirWorkflow(q, wir, 'consultant', user, false, comment || `Result: ${result}`);
  if (result === 'reinspect') {
    await openWirStep(q, wir.workflow_instance_id, 'qa_qc');
  } else {
    await syncWirWorkflow(q, wir, 'approved_comments_rejected_reinspect', user, true,
      `${result}${comment ? `: ${comment}` : ''}`);
  }
  await fireEvent({
    eventType: `wir.${result}`, entityType: 'wir', entityId: num(wirId),
    userId: user.id, userName: user.name, userRole: user.role,
    payload: { project_id: wir.project_id, wir_number: wir.wir_number, result },
  }, { query: q });
  return (await q('SELECT * FROM wirs WHERE id = $1', [wirId])).rows[0];
}

async function syncWirWorkflow(q, wir, stepKey, actor, terminal = false, comment = null, extra = {}) {
  if (!wir.workflow_instance_id) return;
  const fresh = await workflowEngine.syncExternalState(wir.workflow_instance_id, stepKey, {
    userId: actor.id, userName: actor.name, role: actor.role,
  }, { query: q, comment, terminal, ...extra });
  // The step's action item closes with its decision.
  try {
    const actionService = require('./actionService');
    const done = (fresh.steps || []).find((s) => s.step_key === stepKey);
    if (done) await actionService.closeForWorkflowStep(wir.workflow_instance_id, done.id, extra.rejected ? 'rejected' : 'completed', { query: q });
  } catch (e) { /* action items may not exist */ }
  return fresh;
}

// Open (or re-open) a template step as the instance's pending step and raise
// its action item. Used when a domain transition advances the workflow
// outside the engine's sequential runner (reinspect loops, skipped stages).
async function openWirStep(q, instanceId, stepKey) {
  if (!instanceId) return;
  const client = { query: q };
  const instance = await workflowEngine.loadInstance(client, instanceId);
  if (!instance) return;
  const definitions = await workflowEngine.loadSteps(client, instance.template_id);
  const def = definitions.find((s) => s.step_key === stepKey);
  if (!def) throw new Error(`Workflow step not found: ${stepKey}`);

  const now = new Date();
  await q(
    `UPDATE workflow_step_instances SET status = 'pending', assigned_role = $1, opened_at = $2, completed_at = NULL
     WHERE instance_id = $3 AND step_key = $4`,
    [workflowEngine.resolveAssignedRole(def, parseJson(instance.context)), now, instanceId, stepKey]
  );
  await q(
    `UPDATE workflow_instances SET current_step_key = $1, status = 'active', updated_at = $2 WHERE id = $3`,
    [stepKey, now, instanceId]
  );
  try {
    const actionService = require('./actionService');
    const stepInstance = (await workflowEngine.loadStepInstances(client, instanceId)).find((s) => s.step_key === stepKey);
    await actionService.closeForWorkflowStep(instanceId, stepInstanceSafeId(stepInstance), 'cancelled', { query: q }).catch(() => {});
    await actionService.createForWorkflowStep(instance, stepInstance, def, { query: q });
  } catch (e) {
    console.error('[QAQC] WIR step action item failed:', e.message);
  }
}

function stepInstanceSafeId(stepInstance) {
  return stepInstance ? stepInstance.id : null;
}

function parseJson(v) {
  if (v == null) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return {}; }
}

// ---------------------------------------------------------------------------
// Punch items — the 'handover_punch' catalog template
// (raised → assigned → rectified → verified → closed).
// ---------------------------------------------------------------------------

async function createPunchItem(q, input, user) {
  const punchNumber = await nextNumber(q, 'punch_items', 'punch_number', 'PCH');
  const r = await q(
    `INSERT INTO punch_items (punch_number, project_id, project_location_id, discipline, description, photos,
       responsible_subcontractor_id, responsible_user_id, due_date, verification_authority, severity, status, raised_by)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,'open',$12) RETURNING *`,
    [punchNumber, input.project_id, input.project_location_id == null ? null : num(input.project_location_id),
     input.discipline || null, input.description, JSON.stringify(input.photos || []),
     input.responsible_subcontractor_id == null ? null : num(input.responsible_subcontractor_id),
     input.responsible_user_id == null ? null : num(input.responsible_user_id),
     input.due_date || null, input.verification_authority || null, input.severity || 'minor', user.id]
  );
  const punch = r.rows[0];

  const workflow = await workflowEngine.startWorkflow(
    'handover_punch', 'punch_item', punch.id,
    { project_id: input.project_id, requester_id: user.id, punch_number: punchNumber, module_name: 'punch' },
    { query: q }
  );
  await workflowEngine.syncExternalState(workflow.instance.id, 'raised', {
    userId: user.id, userName: user.name, role: user.role,
  }, { query: q, comment: 'Punch item raised', terminal: false });
  await q('UPDATE punch_items SET workflow_instance_id = $1 WHERE id = $2', [workflow.instance.id, punch.id]);
  punch.workflow_instance_id = workflow.instance.id;

  // Phase 7: the rectification assignment opens an action item when the
  // responsible party is known at raise time.
  try {
    const actionService = require('./actionService');
    await actionService.createActionItem({
      source_type: 'punch_item',
      source_id: punch.id,
      project_id: input.project_id,
      location_id: input.project_location_id || null,
      title: `Rectify punch item ${punchNumber}`,
      description: input.description,
      assigned_user_id: input.responsible_user_id || null,
      assigned_role: !input.responsible_user_id ? 'site_supervisor' : null,
      assigned_organization_id: input.responsible_subcontractor_id || null,
      priority: input.severity === 'critical' ? 'high' : 'medium',
      due_date: input.due_date || null,
      created_by: user.id,
      workflow_instance_id: workflow.instance.id,
    }, { query: q });
  } catch (e) {
    console.error('[QAQC] punch action item failed:', e.message);
  }
  return punch;
}

const PUNCH_TRANSITIONS = {
  open: ['assigned', 'rectified'],
  assigned: ['rectified'],
  rectified: ['verified', 'open'],
  verified: ['closed'],
};

function punchStamp(state) {
  return { assigned: null, rectified: 'rectified_at', verified: 'verified_at', closed: 'closed_at' }[state] || null;
}
function punchActorCol(state) {
  return { assigned: null, rectified: 'rectified_by', verified: 'verified_by', closed: 'closed_by' }[state] || null;
}

async function transitionPunchItem(q, punchId, toState, user, { comment = null } = {}) {
  const punch = (await q('SELECT * FROM punch_items WHERE id = $1', [punchId])).rows[0];
  if (!punch) throw new Error('Punch item not found');
  if (!PUNCH_TRANSITIONS[punch.status] || !PUNCH_TRANSITIONS[punch.status].includes(toState)) {
    throw new Error(`Cannot transition punch item from '${punch.status}' to '${toState}'`);
  }
  const roles = {
    assigned: PUNCH_ALLOWED_ROLES.assign, rectified: PUNCH_ALLOWED_ROLES.rectify,
    verified: PUNCH_ALLOWED_ROLES.verify, closed: PUNCH_ALLOWED_ROLES.close, open: PUNCH_ALLOWED_ROLES.assign,
  }[toState] || [];
  const allowed = user.role === 'owner' || user.role === 'admin' || roles.includes(user.role);
  if (!allowed) throw new Error(`Not authorized to move a punch item to ${toState}`);

  const now = new Date();
  const stampCol = punchStamp(toState);
  const actorCol = punchActorCol(toState);
  const sets = ['status = $1', 'updated_at = $2'];
  const params = [toState, now];
  let i = 3;
  if (stampCol) { sets.push(`${stampCol} = $${i++}`); params.push(now); }
  if (actorCol) { sets.push(`${actorCol} = $${i++}`); params.push(user.id); }
  params.push(punchId);
  await q(`UPDATE punch_items SET ${sets.join(', ')} WHERE id = $${i}`, params);

  if (punch.workflow_instance_id && PUNCH_STEP_FOR_STATE[toState]) {
    await workflowEngine.syncExternalState(punch.workflow_instance_id, PUNCH_STEP_FOR_STATE[toState], {
      userId: user.id, userName: user.name, role: user.role,
    }, { query: q, comment, terminal: toState === 'closed' });
  }
  if (toState === 'closed' || toState === 'verified') {
    try {
      const actionService = require('./actionService');
      await actionService.closeBySource('punch_item', punchId, { query: q, status: 'completed' });
    } catch (e) { /* action items may not exist */ }
  }
  await fireEvent({
    eventType: `punch.${toState}`, entityType: 'punch_item', entityId: num(punchId),
    userId: user.id, userName: user.name, userRole: user.role,
    payload: { project_id: punch.project_id, punch_number: punch.punch_number, status: toState },
  }, { query: q });
  return (await q('SELECT * FROM punch_items WHERE id = $1', [punchId])).rows[0];
}

module.exports = {
  WIR_RESULT_STATES,
  PUNCH_TRANSITIONS,
  nextNumber,
  createWir,
  submitWir,
  wirStepDecision,
  decideWir,
  createPunchItem,
  transitionPunchItem,
};
