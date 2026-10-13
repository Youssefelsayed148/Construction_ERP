// Phase 16 — consultant portal engine.
//
// Three surfaces:
//   1. Scoped project resolution: a consultant's organization_users /
//      project_participant_users rows (Phase 3) determine exactly which
//      projects they see. No assignment → an empty list, never an error.
//   2. The observation workflow, states EXACTLY as the Phase 6 catalog's
//      'consultant_observation' template defines them:
//        raised → acknowledged → assigned → rectification_in_progress →
//        submitted_for_verification → accepted/rejected → closed
//      Every transition: status_history row, comment row, Phase 7 event +
//      action items, and (on rejection) a reopen back to rectification with
//      full audit trail. The generic recordDecision path is not reused for
//      the self-steps because the requester here IS the deciding consultant
//      (the Phase 6 self-approval guard targets requester≠reviewer request
//      flows); the catalog states, the event vocabulary and the Phase 7
//      action pipeline are the Phase 6 integration surface.
//   3. The consultant dashboard + My Reviews inbox — every widget renders on
//      a project with zero records of its kind.

'use strict';

const { query: defaultQuery } = require('../config/database');
const { nextNumber } = require('./numbering');
const workflowEngine = require('./workflowEngine');
const qaqcEngine = require('./qaqcEngine');
const OBSERVATION_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

const OBSERVATION_TRANSITIONS = {
  raised: ['acknowledged'],
  acknowledged: ['assigned'],
  assigned: ['rectification_in_progress'],
  rectification_in_progress: ['submitted_for_verification'],
  submitted_for_verification: ['accepted', 'rejected'],
  rejected: ['rectification_in_progress'],   // reopen: new comment + audit row
  accepted: ['closed'],
};

const OBSERVATION_STAMP_COLUMN = {
  acknowledged: 'acknowledged_at',
  assigned: 'assigned_at',
  rectification_in_progress: 'rectification_started_at',
  submitted_for_verification: 'submitted_for_verification_at',
  accepted: 'accepted_at',
  rejected: 'rejected_at',
  closed: 'closed_at',
};

function toNum(v) {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function dateOnly(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Best-effort widget loader — a missing table renders an empty widget, never
// an error (the zero-requirement).
async function safeAll(q, sql, params) {
  try {
    return (await q(sql, params)).rows;
  } catch (e) {
    console.error(`[CONSULTANT] ${e.message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Scoped project resolution
// ---------------------------------------------------------------------------

// A consultant sees exactly the projects where their organization is an
// active consultant participant with portal access enabled. (Filtering in JS
// keeps the query parseable by the test MockDb.)
async function resolveConsultantProjects(q, userId) {
  const orgLinks = (await safeAll(q, 'SELECT organization_id, is_active FROM organization_users WHERE user_id = $1', [userId]))
    .filter((link) => link.is_active !== false);
  const projects = [];
  const now = new Date();
  for (const link of orgLinks) {
    const participants = await safeAll(q,
      'SELECT id, project_id, participant_type, portal_access_enabled, active_from, active_to FROM project_participants WHERE organization_id = $1',
      [link.organization_id]);
    for (const p of participants) {
      if (p.participant_type !== 'consultant') continue;
      if (p.portal_access_enabled === false) continue;
      if (p.active_from != null && new Date(p.active_from) > now) continue;
      if (p.active_to != null && new Date(p.active_to) < now) continue;
      const assignedUsers = await safeAll(q, 'SELECT user_id FROM project_participant_users WHERE project_participant_id = $1', [p.id]);
      if (assignedUsers.length > 0 && !assignedUsers.some((u) => toNum(u.user_id) === toNum(userId))) continue;
      const id = toNum(p.project_id);
      if (!projects.includes(id)) projects.push(id);
    }
  }
  return projects.sort((a, b) => a - b);
}

async function assertConsultantProject(q, user, projectId) {
  if (!user) throw new Error('Authentication required');
  if (user.role !== 'consultant') return true;
  const projects = await resolveConsultantProjects(q, user.id);
  if (!projects.includes(toNum(projectId))) throw new Error('Consultant is not assigned to this project');
  return true;
}

async function consultantIdentity(q, user, projectId) {
  if (user.role !== 'consultant') return { organization_id: null, organization_name: null };
  await assertConsultantProject(q, user, projectId);
  const links = (await q('SELECT organization_id, is_active FROM organization_users WHERE user_id = $1', [user.id])).rows
    .filter((l) => l.is_active !== false);
  const now = new Date();
  for (const link of links) {
    const participants = (await q('SELECT * FROM project_participants WHERE organization_id = $1', [link.organization_id])).rows;
    for (const p of participants) {
      if (p.participant_type !== 'consultant' || toNum(p.project_id) !== toNum(projectId) || p.portal_access_enabled === false) continue;
      if (p.active_from != null && new Date(p.active_from) > now) continue;
      if (p.active_to != null && new Date(p.active_to) < now) continue;
      const assigned = (await q('SELECT user_id FROM project_participant_users WHERE project_participant_id = $1', [p.id])).rows;
      if (assigned.length && !assigned.some((r) => toNum(r.user_id) === toNum(user.id))) continue;
      const org = (await q('SELECT * FROM organizations WHERE id = $1', [link.organization_id])).rows[0];
      return { organization_id: toNum(link.organization_id), organization_name: org?.name || org?.name_en || org?.name_ar || null };
    }
  }
  throw new Error('Consultant is not assigned to this project');
}

// ---------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------

async function createObservation(q, {
  project_id, title, description = null, discipline = null, location_id = null,
  severity = 'normal', due_date = null, drawing_reference = null, drawing_document_id = null,
  before_photos = [], after_photos = [], user, organization_id = null,
}) {
  await assertConsultantProject(q, user, project_id);
  if (user.role === 'consultant') organization_id = (await consultantIdentity(q, user, project_id)).organization_id;
  if (location_id != null) {
    const location = (await q('SELECT project_id FROM project_locations WHERE id = $1', [location_id])).rows[0];
    if (!location || toNum(location.project_id) !== toNum(project_id)) throw new Error('Observation location must belong to the same project');
  }
  if (drawing_document_id != null) {
    const drawing = (await q('SELECT * FROM project_documents WHERE id = $1', [drawing_document_id])).rows[0];
    if (!drawing || toNum(drawing.project_id) !== toNum(project_id) || drawing.document_type !== 'drawing') throw new Error('Reference drawing must belong to the same project');
    if (user.role === 'consultant' && (drawing.status !== 'approved' || !['consultant', 'all_external'].includes(drawing.portal_visibility))) {
      throw new Error('Reference drawing is not available in the consultant portal');
    }
  }
  const observationNumber = await nextNumber(q, { table: 'observations', column: 'observation_number', prefix: 'OBS', pad: 4 });

  const r = await q(
    `INSERT INTO observations (observation_number, project_id, consultant_organization_id, consultant_user_id,
       discipline, location_id, title, description, severity, due_date, drawing_reference, drawing_document_id,
       status, raised_by_user_id, raised_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'raised',$13,$14) RETURNING *`,
    [observationNumber, project_id, organization_id, user.id, discipline, location_id,
     title, description, severity, due_date || null, drawing_reference || null, drawing_document_id || null, user.id, new Date()]
  );
  const observation = r.rows[0];
  observation.due_date = dateOnly(observation.due_date);

  for (const [kind, evidence] of [['observation_before', before_photos], ['observation_after', after_photos]]) {
    for (const file of evidence) {
      const fileName = String(file.file_name || '');
      const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
      if (!/^[a-zA-Z0-9_.-]+$/.test(fileName) || fileName === '.' || fileName === '..' || !OBSERVATION_IMAGE_EXTENSIONS.has(extension) || file.file_url !== `/uploads/${fileName}`) {
        throw new Error('Observation evidence must reference an uploaded image file');
      }
      const ownedFile = (await q('SELECT file_name FROM uploaded_files WHERE file_name = $1 AND uploaded_by = $2', [fileName, user.id])).rows[0];
      if (!ownedFile) throw new Error('Observation evidence must be uploaded by the current user');
      await q(
        `INSERT INTO photos (project_id, linked_entity_type, linked_entity_id, file_name, file_url, uploader_user_id, organization_id, caption)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [project_id, kind, observation.id, fileName, file.file_url, user.id, organization_id, file.caption || null]
      );
    }
  }

  const workflow = await workflowEngine.startWorkflow(
    'consultant_observation', 'observation', observation.id,
    { project_id, requester_id: null, observation_number: observationNumber }, { query: q }
  );
  await workflowEngine.syncExternalState(workflow.instance.id, 'raised', {
    userId: user.id, userName: user.name, role: user.role,
  }, { query: q, comment: 'Observation raised' });
  await q('UPDATE observations SET workflow_instance_id = $1 WHERE id = $2', [workflow.instance.id, observation.id]);
  observation.workflow_instance_id = workflow.instance.id;

  await q(
    `INSERT INTO observation_status_history (observation_id, from_status, to_status, actor_user_id, actor_name, actor_organization_id, note)
     VALUES ($1, NULL, 'raised', $2, $3, $4, $5)`,
    [observation.id, user.id, user.name || null, organization_id, 'Observation raised']
  );

  // Phase 7: the dispatcher's observation.created route notifies the project
  // managers; the engine also opens the PM action item directly so the
  // observation shows up in the PM's "My Actions" queue even when the
  // assignment isn't known at raise time.
  try {
    const actionService = require('./actionService');
    await actionService.createActionItem({
      source_type: 'observation',
      source_id: observation.id,
      project_id,
      title: `Review observation ${observationNumber}: ${title.slice(0, 120)}`,
      description: description || null,
      assigned_role: 'project_manager',
      priority: severity === 'urgent' ? 'high' : 'medium',
      created_by: user.id,
    }, { query: q, notify: false });
  } catch (e) {
    console.error('[CONSULTANT] PM action item failed:', e.message);
  }

  try {
    await require('../utils/activity').fireEvent({
      eventType: 'observation.created',
      entityType: 'observation',
      entityId: observation.id,
      userId: user.id, userName: user.name, userRole: user.role,
      payload: { project_id, title, description, severity, due_date, drawing_document_id },
    }, { query: q });
  } catch (e) {
    console.error('[CONSULTANT] observation event failed:', e.message);
  }

  return observation;
}

async function addObservationComment(q, { observation_id, user, organization_id = null, comment_type = 'comment', body }) {
  if (!body || !String(body).trim()) throw new Error('Comment body is required');
  const observation = (await q('SELECT project_id FROM observations WHERE id = $1', [observation_id])).rows[0];
  if (!observation) throw new Error(`Observation #${observation_id} not found`);
  await assertConsultantProject(q, user, observation.project_id);
  if (user.role === 'consultant') organization_id = (await consultantIdentity(q, user, observation.project_id)).organization_id;
  const r = await q(
    `INSERT INTO observation_comments (observation_id, author_user_id, organization_id, comment_type, body)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [observation_id, user.id, organization_id, comment_type, String(body).trim()]
  );
  return r.rows[0];
}

// The lifecycle advance. `action` ∈ acknowledge | assign | start_rectification |
// submit_for_verification | accept | reject | close.
async function advanceObservation(q, observationId, user, action, opts = {}) {
  const observation = (await q('SELECT * FROM observations WHERE id = $1', [observationId])).rows[0];
  if (!observation) throw new Error(`Observation #${observationId} not found`);
  await assertConsultantProject(q, user, observation.project_id);
  const actorOrganizationId = user.role === 'consultant'
    ? (await consultantIdentity(q, user, observation.project_id)).organization_id : null;
  const allowedRoles = {
    acknowledge: ['consultant', 'project_manager', 'owner', 'admin'],
    assign: ['project_manager', 'owner', 'admin'],
    start_rectification: ['engineer', 'site_supervisor', 'project_manager', 'owner', 'admin'],
    submit_for_verification: ['engineer', 'site_supervisor', 'project_manager', 'owner', 'admin'],
    accept: ['consultant', 'owner', 'admin'],
    reject: ['consultant', 'owner', 'admin'],
    close: ['consultant', 'project_manager', 'owner', 'admin'],
  };
  if (!(allowedRoles[action] || []).includes(user.role)) throw new Error(`Role ${user.role} cannot ${action} an observation`);

  const actionToStatus = {
    acknowledge: 'acknowledged',
    assign: 'assigned',
    start_rectification: 'rectification_in_progress',
    submit_for_verification: 'submitted_for_verification',
    accept: 'accepted',
    reject: 'rejected',
    close: 'closed',
  };
  const to = actionToStatus[action];
  const from = observation.status === 'rejected' ? observation.status : observation.status;
  const allowed = (from === 'submitted_for_verification' && to === 'rejected')
    || (from === 'rejected' && to === 'rectification_in_progress')
    || (from === 'accepted' && to === 'closed')
    || (OBSERVATION_TRANSITIONS[from] || []).includes(to);
  if (!allowed) throw new Error(`Cannot move observation from '${from}' to '${to}'`);

  const stampColumn = OBSERVATION_STAMP_COLUMN[to];
  const params = [to, new Date()];
  const sets = [`status = $1`];
  if (stampColumn) sets.push(`${stampColumn} = $2`);
  sets.push(`updated_at = $2`);
  if (to === 'assigned' && (opts.assigned_user_id != null || opts.assigned_organization_id != null)) {
    if (opts.assigned_user_id != null) { sets.push(`assigned_user_id = $${params.length + 1}`); params.push(opts.assigned_user_id); }
    if (opts.assigned_organization_id != null) { sets.push(`assigned_organization_id = $${params.length + 1}`); params.push(opts.assigned_organization_id); }
  }
  params.push(observationId);
  await q(
    `UPDATE observations SET ${sets.join(', ')} WHERE id = $${params.length}`,
    params
  );

  await q(
    `INSERT INTO observation_status_history (observation_id, from_status, to_status, actor_user_id, actor_name, actor_organization_id, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [observationId, from, to, user.id, user.name || null, actorOrganizationId, opts.note || null]
  );

  if (observation.workflow_instance_id != null) {
    const workflowStep = {
      acknowledged: 'acknowledged', assigned: 'assigned',
      rectification_in_progress: 'rectification',
      submitted_for_verification: 'verification_requested',
      accepted: 'accepted_rejected', rejected: 'accepted_rejected', closed: 'closed',
    }[to];
    await workflowEngine.syncExternalState(observation.workflow_instance_id, workflowStep, {
      userId: user.id, userName: user.name, role: user.role,
    }, {
      query: q, comment: opts.comment || opts.note || null,
      rejected: to === 'rejected', decision: to === 'rejected' ? 'reject' : action,
      terminal: to === 'closed',
    });
  }

  if (opts.comment) {
    await addObservationComment(q, {
      observation_id: observationId, user,
      organization_id: actorOrganizationId,
      comment_type: to === 'rejected' ? 'rejection' : to === 'accepted' ? 'verification' : to === 'assigned' ? 'assignment' : 'comment',
      body: opts.comment,
    });
  }

  // Rectification photos — captured against the observation via the Phase 15
  // photo-metadata model.
  for (const photo of (opts.photos || [])) {
    await q(
      `INSERT INTO photos (project_id, linked_entity_type, linked_entity_id, file_name, file_url,
         uploader_user_id, organization_id, captured_at, caption, annotations)
       VALUES ($1, 'observation', $2, $3, $4, $5, $6, $7, $8, '[]'::jsonb)`,
      [observation.project_id, observationId, photo.file_name || null, photo.file_url || null,
       user.id, actorOrganizationId, new Date(), photo.caption || null]
    );
  }

  // Phase 7: action items follow the actor.
  try {
    const actionService = require('./actionService');
    if (to === 'assigned' && opts.assigned_user_id != null) {
      await actionService.closeBySource('observation', observationId, { query: q }).catch(() => {});
      await actionService.createActionItem({
        source_type: 'observation',
        source_id: observationId,
        project_id: observation.project_id,
        title: `Rectify observation ${observation.observation_number}: ${observation.title.slice(0, 120)}`,
        description: opts.comment || observation.description || null,
        assigned_user_id: opts.assigned_user_id,
        priority: observation.severity === 'urgent' ? 'high' : 'medium',
        created_by: user.id,
      }, { query: q });
    } else if (to === 'accepted' || to === 'closed') {
      await actionService.closeBySource('observation', observationId, { query: q }).catch(() => {});
    } else if (to === 'submitted_for_verification') {
      await actionService.closeBySource('observation', observationId, { query: q }).catch(() => {});
    }
  } catch (e) {
    console.error('[CONSULTANT] observation action sync failed:', e.message);
  }

  try {
    await require('../utils/activity').fireEvent({
      eventType: `observation.${to}`,
      entityType: 'observation',
      entityId: observationId,
      userId: user.id, userName: user.name, userRole: user.role,
      payload: { project_id: observation.project_id, from, to, comment: opts.comment || null },
    }, { query: q });
  } catch (e) {
    console.error('[CONSULTANT] observation event failed:', e.message);
  }

  return (await q('SELECT * FROM observations WHERE id = $1', [observationId])).rows[0];
}

// ---------------------------------------------------------------------------
// Multi-stage RFI / submittal flows
// ---------------------------------------------------------------------------

// Official consultant RFI response — user, organization, date/time, revision,
// comments and attachments recorded (the dispute audit trail).
async function recordRfiResponse(q, { rfi_id, stage = 'official_response', user, organization_id = null, organization_name = null, body, attachments = [], revision = 1 }) {
  if (!body || !String(body).trim()) throw new Error('Response body is required');
  const rfi = (await q('SELECT * FROM project_rfis WHERE id = $1', [rfi_id])).rows[0];
  if (!rfi) throw new Error(`RFI #${rfi_id} not found`);
  if (!['coordinator', 'discipline_review', 'official_response', 'acknowledgement'].includes(stage)) throw new Error('Invalid RFI stage');
  if (toNum(revision) !== toNum(rfi.revision || 1)) throw new Error('RFI revision does not match the current record');
  const prior = (await q('SELECT * FROM rfi_responses WHERE rfi_id = $1', [rfi_id])).rows
    .filter((r) => toNum(r.revision) === toNum(revision)).sort((a, b) => toNum(a.id) - toNum(b.id));
  const previousStage = prior.at(-1)?.stage || null;
  const expected = previousStage == null ? ['coordinator']
    : previousStage === 'coordinator' ? ['discipline_review']
      : previousStage === 'discipline_review' ? ['discipline_review', 'official_response']
        : previousStage === 'official_response' ? ['acknowledgement'] : [];
  if (!expected.includes(stage)) throw new Error(`RFI stage ${stage} cannot follow ${previousStage || 'submission'}`);
  if (stage === 'acknowledgement') {
    if (toNum(rfi.raised_by) !== toNum(user.id) && !['owner', 'admin'].includes(user.role)) {
      throw new Error('Only the RFI requester can acknowledge the response');
    }
  } else {
    if (!['consultant', 'owner', 'admin', 'project_manager'].includes(user.role)) throw new Error('Consultant review role required');
    await assertConsultantProject(q, user, rfi.project_id);
    if (user.role === 'consultant') ({ organization_id, organization_name } = await consultantIdentity(q, user, rfi.project_id));
  }
  const r = await q(
    `INSERT INTO rfi_responses (rfi_id, revision, stage, responder_user_id, responder_name,
       responder_organization_id, responder_organization_name, body, attachments)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [rfi_id, revision, stage, user.id, user.name || null, organization_id, organization_name,
     String(body).trim(), JSON.stringify(attachments)]
  );
  const response = r.rows[0];
  if (stage === 'official_response') {
    await q(
      "UPDATE project_rfis SET status = 'answered', answer = $1, answered_by = $2, answered_at = $3, revision = $4, updated_at = $3 WHERE id = $5",
      [String(body).trim(), user.id, new Date(), revision, rfi_id]
    );
  } else await q('UPDATE project_rfis SET status = $1, updated_at = $2 WHERE id = $3',
    [stage === 'acknowledgement' ? 'acknowledged' : stage, new Date(), rfi_id]);
  try {
    await require('./financeEngine').writeAuditEvent(q, {
      entity_type: 'rfi_response', entity_id: response.id, event_type: stage,
      actor_id: user.id, actor_name: user.name, after_state: response,
    });
  } catch (e) { /* audit best-effort */ }
  return response;
}

async function closeRfi(q, rfiId, user) {
  const rfi = (await q('SELECT * FROM project_rfis WHERE id = $1', [rfiId])).rows[0];
  if (!rfi) throw new Error(`RFI #${rfiId} not found`);
  if (rfi.status !== 'acknowledged') throw new Error('RFI must be acknowledged before closing');
  if (!['consultant', 'project_manager', 'owner', 'admin'].includes(user.role)) throw new Error('Consultant or PM role required');
  await assertConsultantProject(q, user, rfi.project_id);
  await q("UPDATE project_rfis SET status = 'closed', updated_at = $1 WHERE id = $2", [new Date(), rfiId]);
  return (await q('SELECT * FROM project_rfis WHERE id = $1', [rfiId])).rows[0];
}

async function recordSubmittalResponse(q, { submittal_id, stage = 'response', user, organization_id = null, organization_name = null, response_code, comments, attachments = [], revision = 1 }) {
  const submittal = (await q('SELECT * FROM project_submittals WHERE id = $1', [submittal_id])).rows[0];
  if (!submittal) throw new Error(`Submittal #${submittal_id} not found`);
  if (submittal.status !== 'submitted' && !['internal_technical_review', 'pm', 'consultant_coordinator', 'reviewer'].includes(submittal.status)) {
    throw new Error('Submittal is not awaiting review');
  }
  if (toNum(revision) !== toNum(submittal.revision_number || 1)) throw new Error('Submittal revision does not match the current record');
  const prior = (await q('SELECT * FROM submittal_revisions WHERE submittal_id = $1', [submittal_id])).rows
    .filter((r) => toNum(r.revision_number) === toNum(revision) && r.stage !== 'resubmitted')
    .sort((a, b) => toNum(a.id) - toNum(b.id));
  const previousStage = prior.at(-1)?.stage || null;
  const expected = previousStage == null ? ['internal_technical_review']
    : previousStage === 'internal_technical_review' ? ['pm']
      : previousStage === 'pm' ? ['consultant_coordinator']
        : previousStage === 'consultant_coordinator' ? ['reviewer']
          : previousStage === 'reviewer' ? ['reviewer', 'response'] : [];
  if (!expected.includes(stage)) throw new Error(`Submittal stage ${stage} cannot follow ${previousStage || 'submission'}`);
  if (stage === 'response' && !['A', 'B', 'C', 'D'].includes(response_code)) throw new Error('Response code must be A, B, C or D');
  if (stage !== 'response' && response_code != null) throw new Error('Response code is only valid at the final stage');
  const allowedRoles = {
    internal_technical_review: ['engineer', 'site_supervisor', 'project_manager', 'owner', 'admin'],
    pm: ['project_manager', 'owner', 'admin'],
    consultant_coordinator: ['consultant', 'owner', 'admin'],
    reviewer: ['consultant', 'owner', 'admin'],
    response: ['consultant', 'owner', 'admin'],
  };
  if (!allowedRoles[stage].includes(user.role)) throw new Error(`Role ${user.role} cannot complete ${stage}`);
  if (user.role === 'consultant') await assertConsultantProject(q, user, submittal.project_id);
  if (user.role === 'consultant') ({ organization_id, organization_name } = await consultantIdentity(q, user, submittal.project_id));
  const r = await q(
    `INSERT INTO submittal_revisions (submittal_id, revision_number, stage, actor_user_id, actor_name,
       actor_organization_id, actor_organization_name, response_code, comments, attachments)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [submittal_id, revision, stage, user.id, user.name || null, organization_id, organization_name,
     response_code, comments || null, JSON.stringify(attachments)]
  );
  const row = r.rows[0];
  if (stage === 'response') {
    const newStatus = ['C', 'D'].includes(response_code) ? 'resubmit_required' : 'closed';
    await q(
      'UPDATE project_submittals SET status = $1, response = $2, responded_by = $3, responded_at = $4, response_code = $5, revision_number = $6, updated_at = $4 WHERE id = $7',
      [newStatus, comments || response_code, user.id, new Date(), response_code, revision, submittal_id]
    );
  } else await q('UPDATE project_submittals SET status = $1, updated_at = $2 WHERE id = $3', [stage, new Date(), submittal_id]);
  return row;
}

async function resubmitSubmittal(q, submittalId, user, { comments = null, attachments = [] } = {}) {
  const submittal = (await q('SELECT * FROM project_submittals WHERE id = $1', [submittalId])).rows[0];
  if (!submittal) throw new Error(`Submittal #${submittalId} not found`);
  if (submittal.status !== 'resubmit_required') throw new Error('Submittal does not require resubmission');
  const revision = toNum(submittal.revision_number || 1) + 1;
  await q('UPDATE project_submittals SET status = $1, revision_number = $2, updated_at = $3 WHERE id = $4', ['submitted', revision, new Date(), submittalId]);
  return (await q(
    `INSERT INTO submittal_revisions (submittal_id, revision_number, stage, actor_user_id, actor_name, comments, attachments)
     VALUES ($1,$2,'resubmitted',$3,$4,$5,$6) RETURNING *`,
    [submittalId, revision, user.id, user.name || null, comments, JSON.stringify(attachments)]
  )).rows[0];
}

async function decideConsultantWir(q, wirId, user, result, { comment = null } = {}) {
  const wir = (await q('SELECT * FROM wirs WHERE id = $1 FOR UPDATE', [wirId])).rows[0];
  if (!wir) throw Object.assign(new Error('WIR not found'), { status: 404, error_code: 'record_not_found' });
  if (user.role !== 'consultant') {
    throw Object.assign(new Error('Consultant role required'), { status: 403, error_code: 'forbidden' });
  }
  const projectIds = await resolveConsultantProjects(q, user.id);
  if (!projectIds.includes(toNum(wir.project_id))) {
    throw Object.assign(new Error('WIR not found'), { status: 404, error_code: 'record_not_found' });
  }
  try {
    return await qaqcEngine.decideWir(q, wirId, user, result, { comment });
  } catch (error) {
    if (error.statusCode === 403) {
      throw Object.assign(error, { status: 403, error_code: 'forbidden' });
    }
    throw Object.assign(error, { status: 409, error_code: 'invalid_workflow_transition' });
  }
}

async function decideConsultantVariation(q, variationId, user, decision, comment = null) {
  const row = (await q('SELECT * FROM variations WHERE id = $1 FOR UPDATE', [variationId])).rows[0];
  if (!row) throw Object.assign(new Error('Variation not found'), { status: 404, error_code: 'record_not_found' });
  if (user.role !== 'consultant') throw Object.assign(new Error('Consultant role required'), { status: 403, error_code: 'forbidden' });
  if (!(await resolveConsultantProjects(q, user.id)).includes(toNum(row.project_id))) {
    throw Object.assign(new Error('Variation not found'), { status: 404, error_code: 'record_not_found' });
  }
  if (row.status !== 'consultant_recommendation') {
    throw Object.assign(new Error('Variation is not awaiting consultant recommendation'), { status: 409, error_code: 'invalid_workflow_transition' });
  }
  try {
    return await require('./commercialEngine').decideVariation(q, variationId, user, decision, comment);
  } catch (error) {
    throw Object.assign(error, { status: error.status || 409, error_code: error.error_code || 'invalid_workflow_transition' });
  }
}

async function decideConsultantCertificate(q, certificateId, user, decision, comment = null) {
  const row = (await q('SELECT * FROM payment_certificates WHERE id = $1 FOR UPDATE', [certificateId])).rows[0];
  if (!row) throw Object.assign(new Error('Payment certificate not found'), { status: 404, error_code: 'record_not_found' });
  if (user.role !== 'consultant') throw Object.assign(new Error('Consultant role required'), { status: 403, error_code: 'forbidden' });
  if (!(await resolveConsultantProjects(q, user.id)).includes(toNum(row.project_id))) {
    throw Object.assign(new Error('Payment certificate not found'), { status: 404, error_code: 'record_not_found' });
  }
  if (row.status !== 'consultant_client') {
    throw Object.assign(new Error('Payment certificate is not awaiting consultant review'), { status: 409, error_code: 'invalid_workflow_transition' });
  }
  try {
    return await require('./commercialRecords').decideCertificate(q, certificateId, user, decision, comment);
  } catch (error) {
    throw Object.assign(error, { status: error.status || 409, error_code: error.error_code || 'invalid_workflow_transition' });
  }
}

async function recommendEngineerInstruction(q, instructionId, user, decision, comment = null) {
  if (user.role !== 'consultant') throw Object.assign(new Error('Consultant role required'), { status: 403, error_code: 'forbidden' });
  const found = await q('SELECT * FROM engineer_instructions WHERE id = $1 FOR UPDATE', [instructionId]);
  if (!found.rows.length) throw Object.assign(new Error('Engineer instruction not found'), { status: 404, error_code: 'record_not_found' });
  const instruction = found.rows[0];
  if (!(await resolveConsultantProjects(q, user.id)).includes(toNum(instruction.project_id))) {
    throw Object.assign(new Error('Engineer instruction not found'), { status: 404, error_code: 'record_not_found' });
  }
  if (!['issued', 'acknowledged'].includes(instruction.status)) {
    throw Object.assign(new Error('Engineer instruction is not awaiting consultant recommendation'), { status: 409, error_code: 'invalid_workflow_transition' });
  }
  const previous = await q('SELECT id FROM engineer_instruction_recommendations WHERE instruction_id = $1', [instructionId]);
  if (previous.rows.length) throw Object.assign(new Error('Engineer instruction already has a consultant recommendation'), { status: 409, error_code: 'already_recommended' });
  const saved = await q(
    `INSERT INTO engineer_instruction_recommendations (instruction_id, consultant_user_id, decision, comment)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [instructionId, user.id, decision, comment || null]
  );
  return { ...saved.rows[0], instruction_number: instruction.instruction_number, project_id: instruction.project_id };
}

// ---------------------------------------------------------------------------
// My Reviews inbox — one list, sorted by due date then priority, filterable
// by project / discipline / type / location.
// ---------------------------------------------------------------------------

const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, medium: 2, low: 3 };

async function myReviews(q, user, filters = {}) {
  const rows = [];
  const addAll = (type, list, mapper) => {
    for (const r0 of list) rows.push(mapper(type, r0));
  };

  const orgLinks = await resolveConsultantProjects(q, user.id);
  const scopedProject = (r) => orgLinks.includes(toNum(r.project_id))
    && (filters.project_id == null || toNum(r.project_id) === toNum(filters.project_id));
  const scopedDiscipline = (r) => filters.discipline == null || (r.discipline || null) === filters.discipline;
  const scopedType = (type) => filters.type == null || type === filters.type;

  const rfis = (await safeAll(q, 'SELECT * FROM project_rfis', []))
    .filter((r0) => !['closed', 'answered', 'acknowledged'].includes(r0.status))
    .filter(scopedProject).filter(scopedDiscipline).filter(() => !filters.type || filters.type === 'rfi');
  addAll('rfi', rfis, (type, r0) => ({
    type, id: r0.id, project_id: toNum(r0.project_id), number: r0.rfi_number, title: r0.subject,
    due_date: r0.due_date, priority: r0.priority || 'normal', status: r0.status, discipline: r0.discipline || null,
    location_id: r0.project_location_id == null ? null : toNum(r0.project_location_id),
    work_package_id: r0.work_package_id == null ? null : toNum(r0.work_package_id),
    cost_impact: r0.cost_impact == null ? null : toNum(r0.cost_impact),
    schedule_impact_days: r0.schedule_impact_days == null ? null : toNum(r0.schedule_impact_days),
  }));

  const submittals = (await safeAll(q, 'SELECT * FROM project_submittals', []))
    .filter((s) => !['closed', 'resubmit_required'].includes(s.status))
    .filter(scopedProject).filter(() => !filters.type || filters.type === 'submittal');
  addAll('submittal', submittals, (type, r0) => ({ type, id: r0.id, project_id: toNum(r0.project_id), number: r0.submittal_number, title: r0.title, due_date: null, priority: 'normal', status: r0.status, discipline: null, location_id: null }));

  // Formal WIR consultant decisions live on the QA/QC register. The workflow
  // step's configured SLA starts when the consultant step is opened; legacy
  // sub-work-verification rows are not a source for the WIR review inbox.
  const wirs = await safeAll(q,
    `SELECT w.id, w.project_id, w.wir_number, w.status, w.project_location_id,
            w.latest_drawing_ref, w.inspection_date,
            CASE WHEN ws.sla_hours IS NOT NULL AND wsi.opened_at IS NOT NULL
                 THEN wsi.opened_at + (ws.sla_hours * INTERVAL '1 hour')
                 ELSE NULL END AS due_date
       FROM wirs w
       LEFT JOIN workflow_instances wi ON wi.id = w.workflow_instance_id
       LEFT JOIN workflow_step_instances wsi
         ON wsi.instance_id = wi.id AND wsi.step_key = 'consultant' AND wsi.status = 'pending'
       LEFT JOIN workflow_steps ws ON ws.id = wsi.step_id
      WHERE w.status = 'consultant_review' AND wi.status = 'active'
        AND wi.current_step_key = 'consultant'`, []);
  const consultantWirs = wirs.filter(scopedProject)
    .filter(() => !filters.type || filters.type === 'wir');
  addAll('wir', consultantWirs, (type, r0) => ({
    type, id: r0.id, project_id: toNum(r0.project_id), number: r0.wir_number,
    title: `WIR ${r0.wir_number}`, due_date: r0.due_date || null, priority: 'normal',
    status: r0.status, discipline: null, location_id: r0.project_location_id || null,
    drawing_reference: r0.latest_drawing_ref || null, inspection_date: dateOnly(r0.inspection_date),
  }));

  const variations = await safeAll(q,
    `SELECT v.id, v.project_id, v.variation_number, v.title, v.status, v.amount,
            CASE WHEN ws.sla_hours IS NOT NULL AND wsi.opened_at IS NOT NULL
                 THEN wsi.opened_at + (ws.sla_hours * INTERVAL '1 hour')
                 ELSE NULL END AS due_date
       FROM variations v
       JOIN workflow_instances wi ON wi.id = v.workflow_instance_id
       JOIN workflow_step_instances wsi
         ON wsi.instance_id = wi.id AND wsi.step_key = 'consultant_recommendation' AND wsi.status = 'pending'
       LEFT JOIN workflow_steps ws ON ws.id = wsi.step_id
      WHERE v.status = 'consultant_recommendation' AND wi.status = 'active'
        AND wi.current_step_key = 'consultant_recommendation'`, []);
  addAll('variation', variations.filter(scopedProject).filter(() => !filters.type || filters.type === 'variation'),
    (type, r0) => ({ type, id: r0.id, project_id: toNum(r0.project_id), number: r0.variation_number, title: r0.title, status: r0.status, amount: toNum(r0.amount), due_date: r0.due_date || null, priority: 'normal' }));

  const certificates = await safeAll(q,
    `SELECT c.id, c.project_id, c.certificate_number, c.status, c.net_certificate,
            CASE WHEN ws.sla_hours IS NOT NULL AND wsi.opened_at IS NOT NULL
                 THEN wsi.opened_at + (ws.sla_hours * INTERVAL '1 hour')
                 ELSE NULL END AS due_date
       FROM payment_certificates c
       JOIN workflow_instances wi ON wi.id = c.workflow_instance_id
       JOIN workflow_step_instances wsi
         ON wsi.instance_id = wi.id AND wsi.step_key = 'consultant_client' AND wsi.status = 'pending'
       LEFT JOIN workflow_steps ws ON ws.id = wsi.step_id
      WHERE c.status = 'consultant_client' AND wi.status = 'active'
        AND wi.current_step_key = 'consultant_client'`, []);
  addAll('certificate', certificates.filter(scopedProject).filter(() => !filters.type || filters.type === 'certificate'),
    (type, r0) => ({ type, id: r0.id, project_id: toNum(r0.project_id), number: r0.certificate_number, title: `Certificate ${r0.certificate_number}`, status: r0.status, amount: toNum(r0.net_certificate), due_date: r0.due_date || null, priority: 'normal' }));

  const instructions = await safeAll(q,
    `SELECT ei.id, ei.project_id, ei.instruction_number, ei.title, ei.status, ei.priority
       FROM engineer_instructions ei
       LEFT JOIN engineer_instruction_recommendations eir ON eir.instruction_id = ei.id
      WHERE ei.status IN ('issued', 'acknowledged') AND eir.id IS NULL`, []);
  addAll('instruction', instructions.filter(scopedProject).filter(() => !filters.type || filters.type === 'instruction'),
    (type, r0) => ({ type, id: r0.id, project_id: toNum(r0.project_id), number: r0.instruction_number, title: r0.title, status: r0.status, due_date: null, priority: r0.priority || 'normal' }));

  const observations = (await safeAll(q, "SELECT * FROM observations WHERE status = 'submitted_for_verification'", []))
    .filter(scopedProject).filter(scopedDiscipline).filter(() => !filters.type || filters.type === 'observation');
  addAll('observation', observations, (type, r0) => ({ type, id: r0.id, project_id: toNum(r0.project_id), number: r0.observation_number, title: r0.title, due_date: dateOnly(r0.due_date), priority: r0.severity === 'urgent' ? 'high' : 'normal', status: r0.status, discipline: r0.discipline || null, location_id: r0.location_id || null, drawing_reference: r0.drawing_reference || null, drawing_document_id: r0.drawing_document_id || null }));

  const ncrs = (await safeAll(q, "SELECT * FROM ncrs WHERE status IN ('verification','resolved')", []))
    .filter(scopedProject).filter(() => !filters.type || filters.type === 'ncr');
  addAll('ncr', ncrs, (type, r0) => ({ type, id: r0.id, project_id: toNum(r0.project_id), number: r0.ncr_number || String(r0.id), title: r0.title || r0.description || 'NCR closeout', due_date: null, priority: 'normal', status: r0.status, discipline: null, location_id: null }));

  const mirs = (await safeAll(q, "SELECT * FROM material_inspection_requests WHERE status IN ('pending','submitted')", []))
    .filter(scopedProject).filter(() => !filters.type || filters.type === 'mir');
  addAll('mir', mirs, (type, r0) => ({ type, id: r0.id, project_id: toNum(r0.project_id), number: r0.mir_number || String(r0.id), title: r0.title || 'MIR pending', due_date: null, priority: 'normal', status: r0.status, discipline: null, location_id: null }));

  // A discipline filter excludes records with no discipline at all —
  // "not assigned to this discipline" reads as an empty inbox, not everything.
  const finalRows = filters.discipline == null
    ? rows
    : rows.filter((r0) => (r0.discipline || null) === filters.discipline);
  finalRows.sort((a, b) => {
    const d = (a.due_date ? new Date(a.due_date).getTime() : Infinity) - (b.due_date ? new Date(b.due_date).getTime() : Infinity);
    if (d !== 0) return d;
    return (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);
  });
  return finalRows;
}

// ---------------------------------------------------------------------------
// The consultant dashboard — every widget zero-safe
// ---------------------------------------------------------------------------

async function consultantDashboard(q, user, { project_id = null, now = new Date() } = {}) {
  const projectIds = await resolveConsultantProjects(q, user.id);
  const scoped = project_id != null && projectIds.includes(toNum(project_id)) ? [toNum(project_id)] : projectIds;
  const today = new Date(now).toISOString().slice(0, 10);
  const projects = [];
  for (const pid of scoped) {
    const p = (await q('SELECT id, name, name_en, status, completion_percentage FROM projects WHERE id = $1', [pid])).rows[0];
    if (p) projects.push(p);
  }

  const dashboard = { projects, project_ids: scoped, today };
  const forProjects = (rows) => rows.filter((r) => scoped.includes(toNum(r.project_id)));
  const todayOf = (v) => v != null && new Date(v).toISOString().slice(0, 10) === today;

  // Overall progress + planned vs actual (BOQ planned quantity vs approved
  // executed measurements).
  const plannedRows = forProjects(await safeAll(q, 'SELECT * FROM boq_items', []));
  const measurements = forProjects((await safeAll(q, 'SELECT * FROM quantity_measurements', [])).filter((m) => m.approval_state === 'approved'));
  const plannedQty = plannedRows.reduce((s, b) => s + toNum(b.quantity), 0);
  const executedQty = measurements.reduce((s, m) => s + toNum(m.quantity), 0);
  dashboard.overall_progress = {
    planned_quantity: Math.round(plannedQty * 1000) / 1000,
    executed_quantity: Math.round(executedQty * 1000) / 1000,
    percent: plannedQty > 0 ? Math.round((executedQty / plannedQty) * 10000) / 100 : 0,
  };

  // Milestones + planned vs actual schedule.
  const milestones = forProjects(await safeAll(q, 'SELECT * FROM project_milestones', []));
  dashboard.milestones = {
    items: milestones.map((m) => ({ id: m.id, title: m.title || m.title_en, target_date: m.target_date, achieved_date: m.achieved_date, status: m.status })),
    planned: milestones.length,
    achieved: milestones.filter((m) => m.achieved_date != null).length,
  };
  const orders = forProjects(await safeAll(q, 'SELECT * FROM work_orders', []));
  dashboard.planned_vs_actual = {
    work_orders_planned: orders.length,
    started: orders.filter((w) => w.actual_start_date != null).length,
    completed: orders.filter((w) => w.actual_end_date != null).length,
  };

  // Today's inspections + new work ready for inspection.
  const tests = forProjects((await safeAll(q, 'SELECT * FROM quality_tests', [])).filter((t) => todayOf(t.test_date)));
  const readyWork = forProjects(await safeAll(q, "SELECT * FROM work_completions WHERE verified_by IS NULL", []));
  dashboard.todays_inspections = {
    items: tests.map((t) => ({ id: t.id, test_type: t.test_type, status: t.status || t.result || null })),
    count: tests.length,
    empty_label: 'No inspections scheduled today',
  };
  dashboard.work_ready_for_inspection = {
    items: readyWork.map((w) => ({ id: w.id, work_order_id: w.work_order_id, quantity: toNum(w.quantity_completed) })),
    count: readyWork.length,
    empty_label: 'No new work ready for inspection',
  };

  // WIR/MIR pending, RFIs, submittals, observations, NCRs.
  const mirs = forProjects(await safeAll(q, "SELECT * FROM material_inspection_requests WHERE status IN ('pending','submitted')", []));
  dashboard.mir_pending = { items: mirs.map((m) => ({ id: m.id, mir_number: m.mir_number || String(m.id) })), count: mirs.length, empty_label: 'No MIRs pending your review' };
  const wirs = forProjects(await safeAll(q, "SELECT * FROM wirs WHERE status = 'consultant_review'", []));
  dashboard.wir_pending = { items: wirs.map((w) => ({ id: w.id, wir_number: w.wir_number, status: w.status })), count: wirs.length, empty_label: 'No WIRs pending your review' };

  const rfis = forProjects((await safeAll(q, 'SELECT * FROM project_rfis', []))
    .filter((r0) => !['closed', 'answered', 'acknowledged'].includes(r0.status)));
  dashboard.rfis_awaiting_response = { items: rfis.map((r0) => ({ id: r0.id, rfi_number: r0.rfi_number, subject: r0.subject, due_date: r0.due_date })), count: rfis.length, empty_label: 'No RFIs require your response' };

  const submittals = forProjects((await safeAll(q, 'SELECT * FROM project_submittals', []))
    .filter((s) => !['closed', 'resubmit_required'].includes(s.status)));
  dashboard.submittals_awaiting_review = { items: submittals.map((s) => ({ id: s.id, submittal_number: s.submittal_number, title: s.title })), count: submittals.length, empty_label: 'No submittals awaiting review' };

  const obs = forProjects((await safeAll(q, "SELECT * FROM observations WHERE status = 'submitted_for_verification'", [])));
  dashboard.observations_awaiting_verification = { items: obs.map((o) => ({ id: o.id, observation_number: o.observation_number, title: o.title, due_date: dateOnly(o.due_date), drawing_reference: o.drawing_reference || null })), count: obs.length, empty_label: 'No observations awaiting verification' };

  const ncrs = forProjects((await safeAll(q, "SELECT * FROM ncrs WHERE status IN ('verification','resolved')", [])));
  dashboard.ncr_closeouts_awaiting_review = { items: ncrs.map((n) => ({ id: n.id })), count: ncrs.length, empty_label: 'No NCR closeouts awaiting review' };

  // Latest drawings, recent daily progress/photos, notes, upcoming visits.
  const drawings = forProjects(await safeAll(q,
    "SELECT * FROM project_documents WHERE document_type = 'drawing' AND status = 'approved' AND portal_visibility IN ('consultant','all_external') ORDER BY id DESC", []));
  dashboard.latest_drawings = { items: drawings.slice(0, 5).map((d) => ({ id: d.id, project_id: toNum(d.project_id), title: d.title || d.file_name, file_url: d.file_url })), count: drawings.length, empty_label: 'No drawings uploaded yet' };

  const dailyReports = forProjects(await safeAll(q, 'SELECT * FROM site_daily_reports ORDER BY report_date DESC', []));
  dashboard.recent_daily_reports = { items: dailyReports.slice(0, 5).map((d) => ({ id: d.id, report_date: d.report_date, work_summary: d.work_summary })), count: dailyReports.length, empty_label: 'No daily reports yet' };

  const photos = forProjects(await safeAll(q, 'SELECT * FROM photos ORDER BY uploaded_at DESC', []));
  dashboard.recent_photos = { items: photos.slice(0, 8).map((p) => ({ id: p.id, caption: p.caption, file_url: p.file_url, linked_entity_type: p.linked_entity_type, linked_entity_id: p.linked_entity_id })), count: photos.length, empty_label: 'No photos yet' };

  const notes = await safeAll(q, 'SELECT * FROM sticky_notes WHERE owner_user_id = $1', [user.id]);
  dashboard.personal_notes = { items: notes.filter((n) => n.scope === 'personal').slice(0, 10), count: notes.length, empty_label: 'No personal notes' };

  const visits = forProjects((await safeAll(q, 'SELECT * FROM site_visits ORDER BY visit_date DESC', []))
    .filter((v) => v.visit_date && new Date(v.visit_date) >= new Date(today)));
  dashboard.upcoming_visits = { items: visits.slice(0, 5).map((v) => ({ id: v.id, visit_date: v.visit_date, visitor_name: v.visitor_name, visit_type: v.visit_type || 'inspection' })), count: visits.length, empty_label: 'No upcoming visits' };

  return dashboard;
}

module.exports = {
  OBSERVATION_TRANSITIONS,
  resolveConsultantProjects,
  assertConsultantProject,
  createObservation,
  addObservationComment,
  advanceObservation,
  recordRfiResponse,
  closeRfi,
  recordSubmittalResponse,
  resubmitSubmittal,
  decideConsultantWir,
  decideConsultantVariation,
  decideConsultantCertificate,
  recommendEngineerInstruction,
  myReviews,
  consultantDashboard,
};
