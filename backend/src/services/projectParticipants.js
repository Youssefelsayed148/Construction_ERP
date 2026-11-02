'use strict';
// Add a participant (client, supplier, subcontractor, consultant, ...) to an existing project, and make its portal work:
// the portal engines resolve a participant through the legacy_client_id / legacy_supplier_id / legacy_subcontractor_id columns, so an
// organization created through the API (which has none) gets its legacy record created and linked in the same transaction.
const PARTICIPANT_TYPES = ['client', 'supplier', 'subcontractor', 'consultant', 'other'];
const err = (status, message, error_code) => Object.assign(new Error(message), { status, error_code, error_params: {} });

const LEGACY = {
  client: {
    col: 'legacy_client_id',
    sql: `INSERT INTO clients (code, name_ar, name_en, contact_person, phone, email, address, city, tax_id, payment_terms)
          SELECT code, name_ar, name_en, contact_person, phone, email, address, city, tax_id, payment_terms FROM organizations WHERE id = $1
          ON CONFLICT (code) DO NOTHING RETURNING id`,
    byCode: 'SELECT c.id FROM clients c JOIN organizations o ON o.code = c.code WHERE o.id = $1',
  },
  supplier: {
    col: 'legacy_supplier_id',
    sql: `INSERT INTO suppliers (code, name_ar, name_en, contact_person, phone, email, address, city, tax_id, payment_terms, organization_id)
          SELECT code, name_ar, name_en, contact_person, phone, email, address, city, tax_id, payment_terms, id FROM organizations WHERE id = $1
          ON CONFLICT (code) DO NOTHING RETURNING id`,
    byCode: 'SELECT s.id FROM suppliers s JOIN organizations o ON o.code = s.code WHERE o.id = $1',
  },
  subcontractor: {
    col: 'legacy_subcontractor_id',
    sql: `INSERT INTO subcontractors (code, name, name_en, name_ar, license_no, classification, contact_person, phone, email, address)
          SELECT code, COALESCE(name_en, name_ar), name_en, name_ar, license_no, classification, contact_person, phone, email, address FROM organizations WHERE id = $1
          ON CONFLICT (code) DO NOTHING RETURNING id`,
    byCode: 'SELECT s.id FROM subcontractors s JOIN organizations o ON o.code = s.code WHERE o.id = $1',
  },
};

async function addParticipant(q, projectId, payload) {
  const project = (await q('SELECT id FROM projects WHERE id = $1', [projectId])).rows[0];
  if (!project) throw err(404, 'Project not found', 'project_not_found');
  const org = (await q('SELECT * FROM organizations WHERE id = $1 FOR UPDATE', [payload.organization_id])).rows[0];
  if (!org) throw err(404, 'Organization not found', 'organization_not_found');
  if (org.status && org.status !== 'active') throw err(409, 'Organization is not active', 'organization_inactive');
  const type = payload.participant_type;
  const dup = (await q(
    `SELECT id FROM project_participants WHERE project_id = $1 AND organization_id = $2 AND participant_type = $3 AND (active_to IS NULL OR active_to >= CURRENT_DATE)`,
    [projectId, org.id, type])).rows[0];
  if (dup) throw err(409, 'This organization is already an active participant of the project', 'participant_exists');

  let legacy = { legacy_client_id: org.legacy_client_id, legacy_supplier_id: org.legacy_supplier_id, legacy_subcontractor_id: org.legacy_subcontractor_id };
  const rule = LEGACY[type];
  if (rule && legacy[rule.col] == null) {
    let id = (await q(rule.sql, [org.id])).rows[0]?.id;
    if (id == null) id = (await q(rule.byCode, [org.id])).rows[0]?.id; // a legacy record with this code already exists: link it
    if (id == null) throw err(409, 'Could not link the organization to its portal record', 'legacy_link_failed');
    await q(`UPDATE organizations SET ${rule.col} = $1, updated_at = NOW() WHERE id = $2`, [id, org.id]);
    legacy = { ...legacy, [rule.col]: id };
  }
  const row = (await q(
    `INSERT INTO project_participants (project_id, organization_id, participant_type, role_label, contract_reference, active_from, portal_access_enabled,
        visibility_policy, legacy_client_id, legacy_supplier_id, legacy_subcontractor_id)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6, NOW()),$7,$8,$9,$10,$11) RETURNING *`,
    [projectId, org.id, type, payload.role_label || type, payload.contract_reference || null, payload.active_from || null,
     payload.portal_access_enabled !== false, JSON.stringify(payload.visibility_policy || {}),
     type === 'client' ? legacy.legacy_client_id : null, type === 'supplier' ? legacy.legacy_supplier_id : null,
     type === 'subcontractor' ? legacy.legacy_subcontractor_id : null])).rows[0];
  return row;
}

module.exports = { addParticipant, PARTICIPANT_TYPES };
