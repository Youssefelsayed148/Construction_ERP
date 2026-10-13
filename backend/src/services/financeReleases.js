'use strict';

const glPosting = require('./glPosting');

const fail = (status, error_code, message, error_params = {}) => Object.assign(new Error(message), { status, error_code, error_params });

async function postedRetentionBalance(q, projectId, partyType) {
  const rows = (await q(
    `SELECT rl.direction, rl.amount FROM retention_ledger rl
      WHERE rl.project_id = $1 AND rl.party_type = $2 AND rl.direction IN ('held', 'released')
        AND (
          (rl.source_type = 'client_invoice' AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_type = 'client_invoice' AND je.reference_id = rl.source_id))
          OR (rl.source_type = 'payment_certificate' AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_type = 'subcontractor_certificate' AND je.reference_id = rl.source_id))
          OR (rl.source_type = 'client_invoice_void' AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_type = 'client_invoice_void' AND je.reference_id = rl.source_id))
          OR (rl.source_type = 'payment_certificate_void' AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_type = 'subcontractor_certificate_void' AND je.reference_id = rl.source_id))
          OR (rl.source_type = 'retention_release' AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_type = 'retention_release' AND je.reference_id = rl.id))
          OR (rl.source_type = 'retention_release_void' AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_type = 'retention_release_void' AND je.reference_id = rl.source_id))
        )`, [projectId, partyType]
  )).rows;
  return rows.reduce((sum, row) => sum + (row.direction === 'held' ? Number(row.amount) : -Number(row.amount)), 0);
}

async function createRetentionRelease(q, { project_id, party_type, amount, idempotency_key }, user) {
  const key = String(idempotency_key || '').toLowerCase();
  let existing = (await q('SELECT * FROM retention_ledger WHERE idempotency_key = $1', [key])).rows[0];
  if (existing) return { ...existing, reused: true };
  const project = (await q('SELECT id FROM projects WHERE id = $1 FOR UPDATE', [project_id])).rows[0];
  if (!project) throw fail(404, 'project_not_found', `Project #${project_id} not found`, { project_id });
  existing = (await q('SELECT * FROM retention_ledger WHERE idempotency_key = $1 FOR UPDATE', [key])).rows[0];
  if (existing) return { ...existing, reused: true };
  const amt = Number(amount);
  if (!Number.isFinite(amt) || !(amt > 0) || Math.round(amt * 100) !== amt * 100) {
    throw fail(400, 'retention_release_amount_invalid', 'Release amount must be positive with no more than two decimal places');
  }
  const heldBalance = await postedRetentionBalance(q, project_id, party_type);
  if (amt - heldBalance > 0.009) throw fail(409, 'retention_release_exceeds_balance', 'Retention release exceeds the posted retention balance', { held: heldBalance, requested: amt });
  const release = (await q(
    `INSERT INTO retention_ledger (project_id, party_type, source_type, direction, amount, idempotency_key, created_by)
     VALUES ($1, $2, 'retention_release', 'released', $3, $4, $5) RETURNING *`,
    [project_id, party_type, amt, key, user.id]
  )).rows[0];
  await glPosting.postRetentionRelease(q, release, { userId: user.id });
  return release;
}

async function voidRetentionRelease(q, id, user, reason) {
  if (String(reason || '').trim().length < 3) throw fail(400, 'reason_required', 'A reason is required to void a retention release');
  const release = (await q(
    "SELECT * FROM retention_ledger WHERE id = $1 AND source_type = 'retention_release' FOR UPDATE", [id]
  )).rows[0];
  if (!release) throw fail(404, 'retention_release_not_found', `Retention release #${id} not found`, { id });
  if (release.voided_at) throw fail(409, 'retention_release_already_void', 'This retention release is already void');
  const reversed = await glPosting.reverseRetentionRelease(q, release, { userId: user.id });
  if (!reversed) throw fail(409, 'retention_release_not_posted', 'This retention release has no journal posting to reverse');
  await q(
    `INSERT INTO retention_ledger (project_id, party_type, source_type, source_id, direction, amount, created_by)
     VALUES ($1, $2, 'retention_release_void', $3, 'held', $4, $5)`,
    [release.project_id, release.party_type, release.id, release.amount, user.id]
  );
  return (await q(
    `UPDATE retention_ledger SET voided_by = $2, voided_at = NOW(), void_reason = $3 WHERE id = $1 RETURNING *`,
    [release.id, user.id, String(reason).trim()]
  )).rows[0];
}

async function listRetentionReleases(q, projectId) {
  return (await q(
    `SELECT * FROM retention_ledger WHERE project_id = $1 AND source_type = 'retention_release'
     ORDER BY created_at DESC, id DESC LIMIT 200`, [projectId]
  )).rows;
}

module.exports = { createRetentionRelease, voidRetentionRelease, listRetentionReleases };
