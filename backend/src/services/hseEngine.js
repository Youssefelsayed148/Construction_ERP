// Phase 20 — HSE engine: the permit-to-work domain state machine synced to
// the Phase 6 'permit' workflow template (draft → HSE review → PM approval),
// plus the HSE dashboard aggregation.
//
// Permit states exactly as the domain requires:
//   draft → pending_approval (HSE review open) → (HSE approve → PM stage) →
//   approved → active (within validity) → suspended / closed / rejected
// Types that require sign-off before work starts (hot work, confined space,
// lifting) cannot leave draft/approved gates without the workflow steps done
// — the workflow instance is the authoritative sign-off record.
//
// The dashboard follows the zero-record contract: every widget renders with
// no underlying records, never an error.

'use strict';

const { query: defaultQuery } = require('../config/database');
const { nextNumber } = require('./numbering');
const workflowEngine = require('./workflowEngine');
const { fireEvent } = require('../utils/activity');
const sweepLeader = require('./sweepLeader');

const SIGN_OFF_TYPES = ['hot_work', 'confined_space', 'lifting'];

const PERMIT_TRANSITIONS = {
  draft: ['pending_approval'],
  pending_approval: ['approved', 'rejected'],
  approved: ['active', 'rejected'],
  active: ['suspended', 'closed'],
  suspended: ['active', 'closed'],
  rejected: ['pending_approval'],
};

const PERMIT_STEP_FOR_STATE = {
  draft: 'draft',
  pending_approval: 'hse_review',
  approved: 'pm_approval',
  rejected: 'pm_approval',
};

// Who may act at each stage — mirrors the 'permit' template resolvers.
const PERMIT_STAGE_ROLES = {
  hse_review: ['engineer'],
  pm_approval: ['project_manager'],
};

function num(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseJson(v) {
  if (v == null) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return {}; }
}

async function nextPermitNumber(q, projectId, permitType) {
  const year = new Date().getFullYear();
  const prefix = { work: 'PTW', hot_work: 'HW', lifting: 'LIF', excavation: 'EXC', confined_space: 'CSE' }[permitType] || 'PTW';
  return nextNumber(q, { table: 'permits', column: 'permit_number', prefix: `${prefix}-${year}`, pad: 4 });
}

// ---------------------------------------------------------------------------
// Permit lifecycle
// ---------------------------------------------------------------------------

async function createPermit(q, input, user) {
  const permitNumber = await nextPermitNumber(q, input.project_id, input.permit_type);
  const r = await q(
    `INSERT INTO permits (permit_number, project_id, permit_type, title, project_location_id, description,
       conditions, precautions, valid_from, valid_to, status, requested_by, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,'draft',$11,$11) RETURNING *`,
    [permitNumber, input.project_id, input.permit_type || 'work', input.title,
     input.project_location_id == null ? null : num(input.project_location_id),
     input.description || null, input.conditions || null, JSON.stringify(input.precautions || []),
     input.valid_from || null, input.valid_to || null, user.id]
  );
  const permit = r.rows[0];

  const workflow = await workflowEngine.startWorkflow(
    'permit', 'permit', permit.id,
    { project_id: input.project_id, requester_id: user.id, permit_number: permitNumber, module_name: 'permit' },
    { query: q }
  );
  await workflowEngine.syncExternalState(workflow.instance.id, 'draft', {
    userId: user.id, userName: user.name, role: user.role,
  }, { query: q, comment: 'Permit drafted' });
  await q('UPDATE permits SET workflow_instance_id = $1 WHERE id = $2', [workflow.instance.id, permit.id]);
  permit.workflow_instance_id = workflow.instance.id;
  return permit;
}

// Requester submits → HSE review opens.
async function submitPermit(q, permitId, user) {
  const permit = (await q('SELECT * FROM permits WHERE id = $1', [permitId])).rows[0];
  if (!permit) throw new Error('Permit not found');
  if (permit.status !== 'draft') throw new Error(`Permit is already ${permit.status}`);
  const allowed = user.role === 'owner' || user.role === 'admin' ||
    ['engineer', 'site_supervisor'].includes(user.role);
  if (!allowed) throw new Error('Not authorized to submit this permit');

  await q(`UPDATE permits SET status = 'pending_approval', updated_at = $1 WHERE id = $2`, [new Date(), permitId]);
  await syncPermitStep(q, permit, 'draft', user, false, 'Submitted for HSE review');
  await openPermitStep(q, permit.workflow_instance_id, 'hse_review');
  await fireEvent({
    eventType: 'permit.submitted', entityType: 'permit', entityId: num(permitId),
    userId: user.id, userName: user.name, userRole: user.role,
    payload: {
      project_id: permit.project_id, permit_number: permit.permit_number,
      permit_type: permit.permit_type,
      requires_sign_off: SIGN_OFF_TYPES.includes(permit.permit_type),
      title: `Permit ${permit.permit_number} submitted`,
    },
  }, { query: q });
  return (await q('SELECT * FROM permits WHERE id = $1', [permitId])).rows[0];
}

// HSE review + PM approval — domain decisions synced to the engine, exactly
// the consultantEngine pattern. Rejected permits reopen for correction.
async function permitStageDecision(q, permitId, user, decision, { comment = null } = {}) {
  if (!['approve', 'reject'].includes(decision)) throw new Error(`Invalid decision: ${decision}`);
  const permit = (await q('SELECT * FROM permits WHERE id = $1', [permitId])).rows[0];
  if (!permit) throw new Error('Permit not found');
  if (!['pending_approval', 'approved'].includes(permit.status)) {
    throw new Error(`Permit is ${permit.status} — no approval stage is open`);
  }
  if (!permit.workflow_instance_id) throw new Error('Permit has no workflow instance');

  const stage = permit.status === 'pending_approval' ? 'hse_review' : 'pm_approval';
  const step = stage === 'hse_review' ? 'hse_review' : 'pm_approval';
  const allowed = user.role === 'owner' || user.role === 'admin' || PERMIT_STAGE_ROLES[stage].includes(user.role);
  if (!allowed) {
    const err = new Error(`Not authorized to decide the ${stage} stage`);
    err.statusCode = 403;
    throw err;
  }

  const now = new Date();
  if (decision === 'approve') {
    await syncPermitStep(q, permit, step, user, comment || `${stage} approved`);
    if (stage === 'hse_review') {
      await q(`UPDATE permits SET status = 'approved', updated_at = $1 WHERE id = $2`, [now, permitId]);
      await openPermitStep(q, permit.workflow_instance_id, 'pm_approval');
    } else {
      await q(`UPDATE permits SET status = 'active', approved_by = $1, approved_at = $2, updated_at = $2 WHERE id = $3`,
        [user.id, now, permitId]);
      await fireEvent({
        eventType: 'permit.approved', entityType: 'permit', entityId: num(permitId),
        userId: user.id, userName: user.name, userRole: user.role,
        payload: { project_id: permit.project_id, permit_number: permit.permit_number },
      }, { query: q });
    }
  } else {
    await syncPermitStep(q, permit, step, user, comment || `${stage} rejected`, { rejected: true });
    await q(`UPDATE permits SET status = 'rejected', updated_at = $1 WHERE id = $2`, [now, permitId]);
    await fireEvent({
      eventType: 'permit.rejected', entityType: 'permit', entityId: num(permitId),
      userId: user.id, userName: user.name, userRole: user.role,
      payload: { project_id: permit.project_id, permit_number: permit.permit_number },
    }, { query: q });
  }
  return (await q('SELECT * FROM permits WHERE id = $1', [permitId])).rows[0];
}

// Work starts / suspends / closes — only valid-window moves, terminal on close.
async function transitionPermit(q, permitId, toState, user, { comment = null } = {}) {
  const permit = (await q('SELECT * FROM permits WHERE id = $1', [permitId])).rows[0];
  if (!permit) throw new Error('Permit not found');
  if (!PERMIT_TRANSITIONS[permit.status] || !PERMIT_TRANSITIONS[permit.status].includes(toState)) {
    throw new Error(`Cannot transition permit from '${permit.status}' to '${toState}'`);
  }
  const allowed = user.role === 'owner' || user.role === 'admin' ||
    ['project_manager', 'engineer', 'site_supervisor'].includes(user.role);
  if (!allowed) throw new Error('Not authorized for this permit transition');

  const now = new Date();
  const stampCol = { suspended: 'suspended_at', closed: 'closed_at', rejected: null, active: null }[toState] || null;
  const actorCol = { suspended: null, closed: 'closed_by', rejected: null, active: null }[toState] || null;
  const sets = [`status = $1`, `updated_at = $2`];
  const params = [toState, now];
  let i = 3;
  if (stampCol) { sets.push(`${stampCol} = $${i++}`); params.push(now); }
  if (actorCol) { sets.push(`${actorCol} = $${i++}`); params.push(user.id); }
  params.push(permitId);
  await q(`UPDATE permits SET ${sets.join(', ')} WHERE id = $${i}`, params);

  if (toState === 'closed' && permit.workflow_instance_id) {
    await workflowEngine.syncExternalState(permit.workflow_instance_id, 'pm_approval', {
      userId: user.id, userName: user.name, role: user.role,
    }, { query: q, comment: comment || 'Permit closed', terminal: true });
  }
  await fireEvent({
    eventType: `permit.${toState}`, entityType: 'permit', entityId: num(permitId),
    userId: user.id, userName: user.name, userRole: user.role,
    payload: { project_id: permit.project_id, permit_number: permit.permit_number },
  }, { query: q });
  return (await q('SELECT * FROM permits WHERE id = $1', [permitId])).rows[0];
}

// Expiry sweep — permits past valid_to become 'expired' (idempotent, run by
// the scheduler and on-demand). Date comparison happens in JS so the sweep
// runs identically on PostgreSQL and the test MockDb.
async function expireOverduePermits(q) {
  const candidates = (await q(
    `SELECT id, valid_to, status FROM permits WHERE valid_to IS NOT NULL AND status IN ('active','approved','suspended')`
  )).rows;
  const now = Date.now();
  let n = 0;
  for (const row of candidates) {
    if (new Date(row.valid_to).getTime() < now) {
      await q(`UPDATE permits SET status = 'expired', updated_at = $1 WHERE id = $2`, [new Date(), row.id]);
      n++;
    }
  }
  return n;
}

async function syncPermitStep(q, permit, stepKey, actor, comment = null, extra = {}) {
  if (!permit.workflow_instance_id) return;
  const fresh = await workflowEngine.syncExternalState(permit.workflow_instance_id, stepKey, {
    userId: actor.id, userName: actor.name, role: actor.role,
  }, { query: q, comment, ...extra });
  try {
    const actionService = require('./actionService');
    const done = (fresh.steps || []).find((s) => s.step_key === stepKey);
    if (done) await actionService.closeForWorkflowStep(permit.workflow_instance_id, done.id, extra.rejected ? 'rejected' : 'completed', { query: q });
  } catch (e) { /* action items may not exist */ }
  return fresh;
}

async function openPermitStep(q, instanceId, stepKey) {
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
    await actionService.createForWorkflowStep(instance, stepInstance, def, { query: q });
  } catch (e) {
    console.error('[HSE] permit action item failed:', e.message);
  }
}

// ---------------------------------------------------------------------------
// HSE dashboard
// ---------------------------------------------------------------------------

// Man-hours from attendance (8h per present/late shift) for the day or the
// whole project when no date is given. Aggregation happens in JS over plain
// row selects so the formulas run identically on PostgreSQL and the test
// MockDb (the zero-record contract still holds — empty tables → zero state).
async function hseDashboard(q, { projectId = null } = {}) {
  const safeAll = async (sql, params) => {
    try { return (await q(sql, params)).rows || []; } catch (e) { return []; }
  };

  const hasScope = projectId != null;
  const where = hasScope ? ' WHERE project_id = $1' : '';
  const params = hasScope ? [num(projectId)] : [];
  const today = new Date().toISOString().slice(0, 10);

  const attendanceRows = await safeAll(
    `SELECT status, date FROM attendance${hasScope ? where : ''}`, params
  );
  const manHours = attendanceRows.filter((a) => ['present', 'late'].includes(a.status)
    && String(a.date).slice(0, 10) === today).length * 8;

  const incidentRows = await safeAll(`SELECT incident_date, status, is_lti FROM incidents${hasScope ? where : ''}`, params);
  const openIncidents = incidentRows.filter((i) => i.status !== 'closed').length;
  const ltiCount = incidentRows.filter((i) => i.is_lti === true).length;
  const lastLti = incidentRows
    .filter((i) => i.is_lti === true && i.incident_date)
    .map((i) => new Date(i.incident_date).getTime())
    .filter((t) => Number.isFinite(t))
    .reduce((max, t) => Math.max(max, t), null);
  const daysWithoutLti = lastLti != null
    ? Math.max(0, Math.floor((Date.now() - lastLti) / 86400000))
    : null;

  const nearMissRows = await safeAll(`SELECT status FROM near_misses${hasScope ? where : ''}`, params);
  const openNearMisses = nearMissRows.filter((n) => n.status === 'open').length;

  const permitRows = await safeAll(`SELECT status, valid_to FROM permits${hasScope ? where : ''}`, params);
  const nowMs = Date.now();
  const permits = {
    active: permitRows.filter((p) => p.status === 'active').length,
    pending_or_active: permitRows.filter((p) => ['pending_approval', 'approved'].includes(p.status)).length,
    expiring_today: permitRows.filter((p) => p.status === 'active' && p.valid_to
      && new Date(p.valid_to).getTime() >= nowMs - 86400000
      && String(p.valid_to).slice(0, 10) === today).length,
    expired_active: permitRows.filter((p) => p.status === 'active' && p.valid_to && new Date(p.valid_to).getTime() < nowMs).length,
  };

  const capaRows = await safeAll(`SELECT status, due_date FROM corrective_actions${hasScope ? where : ''}`, params);
  const overdueCorrective = capaRows.filter((c) => c.status !== 'completed' && c.status !== 'verified'
    && c.due_date && new Date(c.due_date).getTime() < nowMs).length;

  const inspectionCount = (await safeAll(
    `SELECT COUNT(*) AS c FROM hse_inspections${hasScope ? where : ''}`, params
  ))[0];

  return {
    man_hours_today: manHours,
    days_without_lti: daysWithoutLti,
    open_incidents: openIncidents,
    lti_count: ltiCount,
    open_near_misses: openNearMisses,
    permits,
    overdue_corrective_actions: overdueCorrective,
    inspections: parseInt(inspectionCount ? inspectionCount.c : 0, 10) || 0,
  };
}

// Permit expiry sweep (Phase 20) — permits past their valid_to become
// 'expired'. Idempotent; safe to run repeatedly.
function initPermitExpiryScheduler(opts = {}) {
  const { query } = require('../config/database');
  const run = () => expireOverduePermits(opts.query || query)
    .then((n) => { if (n > 0) console.log(`[HSE] expired ${n} permit(s)`); });
  // Phase 3.4: one leader across backend instances (sweepLeader); failures are logged with context and
  // recorded in background_sweep_runs by the leader itself.
  const { timer, execute } = sweepLeader.leaderInterval('permit_expiry', 60 * 60 * 1000, run, { query: opts.query || query, immediate: false });
  execute().catch((e) => console.error('[HSE] initial permit expiry sweep failed:', e.message));
}

module.exports = {
  SIGN_OFF_TYPES,
  PERMIT_TRANSITIONS,
  createPermit,
  submitPermit,
  permitStageDecision,
  transitionPermit,
  expireOverduePermits,
  hseDashboard,
  initPermitExpiryScheduler,
};
