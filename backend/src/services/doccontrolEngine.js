// Phase 21 — document control engine.
//
// Auto-numbering (PROJECT-DISCIPLINE-TYPE-SEQ-REV), the revision rules
// (exactly one current revision; previous revisions immutable and
// superseded), transmittals and revision-safe correspondence.
//
// The existing revision-history and approval-reset behavior in
// routes/doccontrol.js is preserved — this engine adds the controlled
// register semantics beside it and every write goes through here.

'use strict';

const { query: defaultQuery } = require('../config/database');
const { nextNumber } = require('./numbering');
const { fireEvent } = require('../utils/activity');

const CONTROLLED_DOC_TYPES = ['drawing', 'specification', 'contract', 'report', 'method_statement', 'as_built', 'o_m'];
const DISCIPLINE_CODES = {
  architectural: 'ARC', structural: 'STR', civil: 'CIV', mechanical: 'MEC',
  electrical: 'ELE', plumbing: 'PLB', hvac: 'HVC', fire: 'FIR', general: 'GEN',
};
const TYPE_CODES = {
  drawing: 'DWG', specification: 'SPE', contract: 'CON', report: 'REP',
  method_statement: 'MET', as_built: 'ASB', o_m: 'OM', other: 'OTH',
};

function num(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pad(v, width) {
  return String(v).padStart(Math.max(1, width || 4), '0');
}

// ---------------------------------------------------------------------------
// Auto-numbering — PROJECT-DISCIPLINE-TYPE-SEQ-REV
// ---------------------------------------------------------------------------

async function loadSettings(q, projectId) {
  const r = await q('SELECT * FROM project_numbering_settings WHERE project_id = $1', [num(projectId)]);
  if (r.rows[0]) return r.rows[0];
  // Default settings per project (created on demand, configurable after).
  const project = (await q('SELECT code, id FROM projects WHERE id = $1', [num(projectId)])).rows[0];
  const prefix = (project && project.code) || `P${projectId}`;
  const ins = await q(
    `INSERT INTO project_numbering_settings (project_id, doc_prefix, include_discipline, include_type, seq_pad, rev_prefix)
     VALUES ($1,$2,true,true,4,'R')`,
    [num(projectId), prefix]
  );
  return (await q('SELECT * FROM project_numbering_settings WHERE project_id = $1', [num(projectId)])).rows[0];
}

async function bumpSequence(q, projectId, discipline, docType) {
  const key = [num(projectId), discipline || '-', docType || '-'];
  const existing = (await q(
    'SELECT id, seq FROM document_number_sequences WHERE project_id = $1 AND discipline = $2 AND doc_type = $3', key
  )).rows[0];
  if (!existing) {
    try {
      await q(
        'INSERT INTO document_number_sequences (project_id, discipline, doc_type, seq) VALUES ($1,$2,$3,0)',
        key
      );
    } catch (e) { /* unique conflict on concurrent first bump — re-select */ }
    const again = (await q(
      'SELECT id, seq FROM document_number_sequences WHERE project_id = $1 AND discipline = $2 AND doc_type = $3', key
    )).rows[0];
    if (!again) throw new Error('Unable to initialize document number sequence');
    return again;
  }
  await q('UPDATE document_number_sequences SET seq = $1 WHERE id = $2', [num(existing.seq) + 1, existing.id]);
  return (await q('SELECT id, seq FROM document_number_sequences WHERE id = $1', [existing.id])).rows[0];
}

// Compose the number; settings decide which parts are included.
async function nextDocNumber(q, { project_id, discipline, doc_type, rev_code = 'R0' }) {
  const settings = await loadSettings(q, project_id);
  const seq = await bumpSequence(q, project_id, discipline, doc_type);
  const prefix = settings.doc_prefix || `P${project_id}`;
  const parts = [prefix];
  if (settings.include_discipline !== false) {
    parts.push(DISCIPLINE_CODES[discipline] || (discipline || 'GEN').slice(0, 3).toUpperCase());
  }
  if (settings.include_type !== false) {
    parts.push(TYPE_CODES[doc_type] || (doc_type || 'OTH').slice(0, 3).toUpperCase());
  }
  parts.push(pad(num(seq.seq) + 1, settings.seq_pad));
  parts.push(`${settings.rev_prefix || 'R'}${String(rev_code || 'R0').replace(/^[Rr]/, '')}`);
  return parts.join('-');
}

// ---------------------------------------------------------------------------
// Revision rules
// ---------------------------------------------------------------------------

// Register a NEW controlled document: assigns the doc number + R0 revision
// code and stamps the register metadata.
async function registerDocument(q, { documentId, revisionCode = 'R0' }) {
  const doc = (await q('SELECT * FROM project_documents WHERE id = $1', [num(documentId) || documentId])).rows[0];
  if (!doc) throw new Error('Document not found');
  if (doc.doc_number) {
    const dupe = (await q(
      'SELECT id FROM project_documents WHERE project_id = $1 AND doc_number = $2 AND id != $3',
      [doc.project_id, doc.doc_number, doc.id]
    )).rows[0];
    if (dupe) throw new Error(`Document number ${doc.doc_number} is already used by document #${dupe.id}`);
    return doc;
  }
  const docNumber = await nextDocNumber(q, {
    project_id: doc.project_id, discipline: doc.discipline, doc_type: doc.doc_type, rev_code: revisionCode,
  });
  await q(
    `UPDATE project_documents SET doc_number = $1, revision_code = $2, registered_at = $3, updated_at = $3 WHERE id = $4`,
    [docNumber, revisionCode, new Date(), doc.id]
  );
  const fresh = (await q('SELECT * FROM project_documents WHERE id = $1', [doc.id])).rows[0];
  fresh.revision_code = revisionCode;
  return fresh;
}

// Upload a new revision: the previous current version becomes superseded
// (immutable — never edited), the document resets to draft pending
// re-approval, and the revision code bumps. Exactly one current revision.
async function supersedeForNewRevision(q, documentId, newRevisionCode) {
  const doc = (await q('SELECT * FROM project_documents WHERE id = $1', [documentId])).rows[0];
  if (!doc) throw new Error('Document not found');
  const prevVersions = (await q(
    'SELECT id FROM document_versions WHERE document_id = $1 AND is_current = $2',
    [documentId, true]
  )).rows;
  for (const v of prevVersions) {
    await q(
      `UPDATE document_versions SET is_current = $3, status = 'superseded', superseded_at = $1 WHERE id = $2`,
      [new Date(), v.id, false]
    );
  }
  await q(
    `UPDATE project_documents SET is_current = $4, doc_status = 'draft', revision_code = $1, updated_at = $2 WHERE id = $3`,
    [newRevisionCode, new Date(), documentId, true]
  );
  return (await q('SELECT * FROM project_documents WHERE id = $1', [documentId])).rows[0];
}

// Explicit supersede — points the old document at the new revision.
async function supersedeDocument(q, oldDocumentId, newDocumentId, user) {
  const oldDoc = (await q('SELECT * FROM project_documents WHERE id = $1', [oldDocumentId])).rows[0];
  if (!oldDoc) throw new Error('Document not found');
  const newDoc = (await q('SELECT * FROM project_documents WHERE id = $1', [newDocumentId])).rows[0];
  if (!newDoc) throw new Error('Replacement document not found');
  await q(
    `UPDATE project_documents SET is_current = $4, doc_status = 'superseded', superseded_by_doc_id = $1, updated_at = $2 WHERE id = $3`,
    [newDoc.id, new Date(), oldDocumentId, false]
  );
  await fireEvent({
    eventType: 'document.superseded', entityType: 'project_document', entityId: num(oldDocumentId),
    userId: user.id, userName: user.name, userRole: user.role,
    payload: {
      project_id: oldDoc.project_id,
      doc_number: oldDoc.doc_number || `#${oldDoc.id}`,
      replaced_by: newDoc.doc_number || `#${newDoc.id}`,
      title: `Document superseded: ${oldDoc.doc_number || oldDoc.title}`,
    },
  }, { query: q });
  return (await q('SELECT * FROM project_documents WHERE id = $1', [oldDocumentId])).rows[0];
}

// ---------------------------------------------------------------------------
// Transmittals
// ---------------------------------------------------------------------------

async function nextTransmittalNumber(q, projectId, direction) {
  const year = new Date().getFullYear();
  const prefix = direction === 'incoming' ? 'TRI' : 'TRO';
  return nextNumber(q, { table: 'transmittals', column: 'transmittal_number', prefix: `${prefix}-${year}`, pad: 4 });
}

async function createTransmittal(q, input, user) {
  const transmittalNumber = await nextTransmittalNumber(q, input.project_id, input.direction);
  const r = await q(
    `INSERT INTO transmittals (transmittal_number, project_id, direction, purpose, sender_organization_id,
       sender_user_id, recipient_organization_id, recipient_user_id, attention, response_due, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',$11) RETURNING *`,
    [transmittalNumber, input.project_id, input.direction || 'outgoing', input.purpose || null,
     input.sender_organization_id == null ? null : num(input.sender_organization_id),
     user.id,
     input.recipient_organization_id == null ? null : num(input.recipient_organization_id),
     input.recipient_user_id == null ? null : num(input.recipient_user_id),
     input.attention || null, input.response_due || null, user.id]
  );
  return r.rows[0];
}

const TRANSMITTAL_TRANSITIONS = {
  draft: ['sent'],
  sent: ['acknowledged', 'closed'],
  acknowledged: ['closed'],
};

async function transitionTransmittal(q, transmittalId, toState, user, { ackNote = null } = {}) {
  const t = (await q('SELECT * FROM transmittals WHERE id = $1', [transmittalId])).rows[0];
  if (!t) throw new Error('Transmittal not found');
  if (!TRANSMITTAL_TRANSITIONS[t.status] || !TRANSMITTAL_TRANSITIONS[t.status].includes(toState)) {
    throw new Error(`Cannot transition transmittal from '${t.status}' to '${toState}'`);
  }
  if (toState === 'acknowledged') {
    await q(
      `UPDATE transmittals SET status = 'acknowledged', acknowledged_at = $1, acknowledged_by_user_id = $2, ack_note = $3, updated_at = $1 WHERE id = $4`,
      [new Date(), user.id, ackNote, transmittalId]
    );
    await fireEvent({
      eventType: 'transmittal.acknowledged', entityType: 'transmittal', entityId: num(transmittalId),
      userId: user.id, userName: user.name, userRole: user.role,
      payload: { project_id: t.project_id, transmittal_number: t.transmittal_number },
    }, { query: q });
  } else {
    await q(
      `UPDATE transmittals SET status = $1, updated_at = $2 WHERE id = $3`,
      [toState, new Date(), transmittalId]
    );
  }
  return (await q('SELECT * FROM transmittals WHERE id = $1', [transmittalId])).rows[0];
}

// ---------------------------------------------------------------------------
// Correspondence — numbered, revision-safe (amendments increment the
// revision with an immutable history row), audit-trailed.
// ---------------------------------------------------------------------------

async function nextCorrNumber(q, projectId, corrType) {
  const year = new Date().getFullYear();
  const prefix = { letter: 'LTR', notice: 'NOT', instruction: 'INS', claim: 'CLM' }[corrType] || 'LTR';
  return nextNumber(q, { table: 'correspondence', column: 'corr_number', prefix: `${prefix}-${year}`, pad: 4 });
}

async function createCorrespondence(q, input, user) {
  const corrNumber = await nextCorrNumber(q, input.project_id, input.corr_type);
  const r = await q(
    `INSERT INTO correspondence (corr_number, project_id, direction, corr_type, subject, body,
       sender_organization_id, sender_user_id, recipient_organization_id, recipient_user_id,
       linked_entity_type, linked_entity_id, contract_ref, response_due, status, revision, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'draft',$15,$16) RETURNING *`,
    [corrNumber, input.project_id, input.direction || 'outgoing', input.corr_type || 'letter',
     input.subject, input.body || null,
     input.sender_organization_id == null ? null : num(input.sender_organization_id),
     user.id,
     input.recipient_organization_id == null ? null : num(input.recipient_organization_id),
     input.recipient_user_id == null ? null : num(input.recipient_user_id),
     input.linked_entity_type || null, input.linked_entity_id == null ? null : num(input.linked_entity_id),
     input.contract_ref || null, input.response_due || null, 0, user.id]
  );
  return r.rows[0];
}

const CORR_TRANSITIONS = {
  draft: ['sent'],
  sent: ['responded', 'closed'],
  received: ['responded', 'closed'],
  responded: ['closed'],
};

async function transitionCorrespondence(q, corrId, toState, user, { note = null } = {}) {
  const c = (await q('SELECT * FROM correspondence WHERE id = $1', [corrId])).rows[0];
  if (!c) throw new Error('Correspondence not found');
  if (!CORR_TRANSITIONS[c.status] || !CORR_TRANSITIONS[c.status].includes(toState)) {
    throw new Error(`Cannot transition correspondence from '${c.status}' to '${toState}'`);
  }
  const now = new Date();
  if (toState === 'responded') {
    await q(
      `UPDATE correspondence SET status = $1, responded_at = $2, response_note = $2, updated_at = $2 WHERE id = $3`,
      [toState, note || null, corrId]
    );
  } else {
    await q(`UPDATE correspondence SET status = $1, updated_at = $2 WHERE id = $3`, [toState, now, corrId]);
  }
  await fireEvent({
    eventType: `correspondence.${toState}`, entityType: 'correspondence', entityId: num(corrId),
    userId: user.id, userName: user.name, userRole: user.role,
    payload: { project_id: c.project_id, corr_number: c.corr_number, corr_type: c.corr_type },
  }, { query: q });
  return (await q('SELECT * FROM correspondence WHERE id = $1', [corrId])).rows[0];
}

// Amend — the only way a sent letter's content changes. Bumps the revision
// with an immutable history row (revision-safe).
async function amendCorrespondence(q, corrId, user, { body = null, subject = null, note = null } = {}) {
  const c = (await q('SELECT * FROM correspondence WHERE id = $1', [corrId])).rows[0];
  if (!c) throw new Error('Correspondence not found');
  if (c.status === 'closed') throw new Error('Closed correspondence is read-only');
  const toRevision = num(c.revision) + 1;
  // Read-modify-write keeps the expression portable across PostgreSQL and the
  // test MockDb (COALESCE-with-param UPDATE expressions are not portable).
  const newBody = body != null ? body : c.body;
  const newSubject = subject != null ? subject : c.subject;
  await q(
    `UPDATE correspondence SET body = $1, subject = $2, revision = $3, updated_at = $4 WHERE id = $5`,
    [newBody, newSubject, toRevision, new Date(), corrId]
  );
  await q(
    `INSERT INTO correspondence_history (correspondence_id, from_revision, to_revision, note, changed_by)
     VALUES ($1,$2,$3,$4,$5)`,
    [corrId, num(c.revision), toRevision, note || 'Amended', user.id]
  );
  return (await q('SELECT * FROM correspondence WHERE id = $1', [corrId])).rows[0];
}

module.exports = {
  CONTROLLED_DOC_TYPES,
  DISCIPLINE_CODES,
  TYPE_CODES,
  TRANSMITTAL_TRANSITIONS,
  nextDocNumber,
  nextTransmittalNumber,
  nextCorrNumber,
  registerDocument,
  supersedeForNewRevision,
  supersedeDocument,
  createTransmittal,
  transitionTransmittal,
  createCorrespondence,
  transitionCorrespondence,
  amendCorrespondence,
  loadSettings,
  num,
  pad,
};
