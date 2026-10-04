// Phase 5.4 (spec 08) - the award of an RFQ as a real entity with an approval.
//
//   draft      a procurement user proposes ONE compliant quotation of the RFQ with a basis and a justification.
//              The bid comparison's own pick is recorded; a choice that departs from it is flagged
//              (deviates_from_comparison) and may not claim basis 'comparison'.
//   submitted  the 'rfq_award' workflow runs: procurement review, then authority approval.
//   approved   the last step approved: the RFQ is awarded to that quotation in the same transaction
//              (procurementService.awardRfq, unchanged).
//   rejected / withdrawn   the RFQ stays open and a new recommendation can be made.
//
// One live recommendation per RFQ (database unique index). The old direct award stays for owner/admin as a
// shortcut that writes an approved 'direct_award' recommendation with a mandatory justification, so every
// award has a record.
'use strict';

const workflowEngine = require('./workflowEngine');
const numbering = require('./numbering');
const procurement = require('./procurementService');

class AwardError extends Error {
  constructor(status, code, message, params = {}) {
    super(message);
    this.status = status; this.error_code = code; this.error_params = params;
  }
}
const bad = (code, message, params) => new AwardError(400, code, message, params);
const conflict = (code, message, params) => new AwardError(409, code, message, params);
const missing = (code, message, params) => new AwardError(404, code, message, params);

const BASES = ['comparison', 'lowest_price', 'best_value', 'technical', 'single_source', 'direct_award', 'other'];
const LIVE = ['draft', 'submitted', 'approved'];
const MIN_JUSTIFICATION = 10;
const toInt = (v) => (v == null || v === '' ? null : Number(v));
const toNum = (v) => (v == null ? 0 : Number(v));

async function getRfq(q, rfqId) {
  const rfq = (await q('SELECT * FROM rfqs WHERE id = $1', [toInt(rfqId)])).rows[0];
  if (!rfq) throw missing('rfq_not_found', `RFQ #${rfqId} not found`, { rfq_id: rfqId });
  return rfq;
}

async function get(q, id) {
  const row = (await q(
    `SELECT a.*, r.rfq_number, r.project_id, r.title AS rfq_title, s.name_en AS supplier_name_en, s.name_ar AS supplier_name_ar,
            qt.quotation_number
       FROM rfq_award_recommendations a
       JOIN rfqs r ON r.id = a.rfq_id JOIN suppliers s ON s.id = a.supplier_id JOIN supplier_quotations qt ON qt.id = a.quotation_id
      WHERE a.id = $1`, [toInt(id)])).rows[0];
  if (!row) throw missing('award_recommendation_not_found', `Award recommendation #${id} not found`, { id });
  return row;
}

async function list(q, { rfq_id = null, status = null, project_id = null } = {}) {
  const conds = []; const params = [];
  if (rfq_id != null) conds.push(`a.rfq_id = $${params.push(toInt(rfq_id))}`);
  if (status) conds.push(`a.status = $${params.push(status)}`);
  if (project_id != null) conds.push(`r.project_id = $${params.push(toInt(project_id))}`);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  return (await q(
    `SELECT a.*, r.rfq_number, r.project_id, s.name_en AS supplier_name_en, s.name_ar AS supplier_name_ar
       FROM rfq_award_recommendations a JOIN rfqs r ON r.id = a.rfq_id JOIN suppliers s ON s.id = a.supplier_id
       ${where} ORDER BY a.id DESC LIMIT 200`, params)).rows;
}

async function create(q, { rfq_id, quotation_id, basis, justification, created_by = null }) {
  if (!BASES.includes(basis) || basis === 'direct_award') throw bad('award_basis_invalid', `basis must be one of ${BASES.filter((b) => b !== 'direct_award').join(', ')}`, { basis });
  const text = String(justification || '').trim();
  if (text.length < MIN_JUSTIFICATION) throw bad('award_justification_required', `A justification of at least ${MIN_JUSTIFICATION} characters is required`, { min: MIN_JUSTIFICATION });
  const rfq = await getRfq(q, rfq_id);
  if (rfq.awarded_quotation_id != null || rfq.status === 'awarded') throw conflict('rfq_already_awarded', `RFQ ${rfq.rfq_number} is already awarded`, { rfq_id: rfq.id });
  if (rfq.status === 'cancelled') throw conflict('rfq_cancelled', `RFQ ${rfq.rfq_number} is cancelled`, { rfq_id: rfq.id });
  const quotation = (await q('SELECT * FROM supplier_quotations WHERE id = $1 AND rfq_id = $2', [toInt(quotation_id), rfq.id])).rows[0];
  if (!quotation) throw bad('quotation_not_on_rfq', `Quotation #${quotation_id} is not on RFQ ${rfq.rfq_number}`, { rfq_id: rfq.id, quotation_id });
  if (quotation.compliant === false) throw bad('quotation_not_compliant', 'A non-compliant quotation cannot be recommended for award', { quotation_id: quotation.id });
  const live = (await q('SELECT id, status FROM rfq_award_recommendations WHERE rfq_id = $1 AND status = ANY($2::text[])', [rfq.id, LIVE])).rows[0];
  if (live) throw conflict('award_recommendation_exists', `RFQ ${rfq.rfq_number} already has a ${live.status} recommendation (#${live.id})`, { id: live.id, status: live.status });

  const comparison = await procurement.buildBidComparison(q, rfq.id, { persist: false });
  const pick = comparison.recommendation;
  const deviates = !pick || Number(pick.quotation_id) !== Number(quotation.id);
  if (deviates && basis === 'comparison') {
    throw bad('award_basis_conflicts_with_comparison', 'This quotation is not the comparison\'s recommendation: choose the basis that explains the choice', { comparison_pick: pick ? pick.quotation_id : null });
  }
  const number = await numbering.nextNumber(q, { table: 'rfq_award_recommendations', column: 'recommendation_number', prefix: 'AWR', pad: 5 });
  const row = (await q(
    `INSERT INTO rfq_award_recommendations
       (recommendation_number, rfq_id, quotation_id, supplier_id, total_price, basis, justification, deviates_from_comparison, comparison_snapshot, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10) RETURNING id`,
    [number, rfq.id, quotation.id, quotation.supplier_id, toNum(quotation.total_price), basis, text, deviates, JSON.stringify(comparison), created_by])).rows[0];
  return get(q, row.id);
}

async function submit(q, id, user) {
  const rec = (await q('SELECT * FROM rfq_award_recommendations WHERE id = $1 FOR UPDATE', [toInt(id)])).rows[0];
  if (!rec) throw missing('award_recommendation_not_found', `Award recommendation #${id} not found`, { id });
  if (rec.status !== 'draft') throw conflict('award_not_draft', `Recommendation ${rec.recommendation_number} is ${rec.status}: only a draft can be submitted`, { id: rec.id, status: rec.status });
  const rfq = await getRfq(q, rec.rfq_id);
  const instance = await workflowEngine.startWorkflow('rfq_award', 'rfq_award_recommendation', rec.id, {
    module_name: 'rfq_award', requester_id: user.id, project_id: rfq.project_id, amount: toNum(rec.total_price),
  }, { query: q });
  const step = (await q("SELECT id FROM workflow_step_instances WHERE instance_id = $1 AND step_key = 'draft' AND status = 'pending'", [instance.instance.id])).rows[0];
  if (step) {
    const r = await workflowEngine.recordDecision(instance.instance.id, step.id, user.id, 'approve', 'Submitted', { query: q, role: user.role, userName: user.name });
    if (!r.ok) throw new AwardError(400, 'award_submit_failed', r.error);
  }
  await q("UPDATE rfq_award_recommendations SET status = 'submitted', workflow_instance_id = $2, submitted_by = $3, submitted_at = NOW(), updated_at = NOW() WHERE id = $1",
    [rec.id, instance.instance.id, user.id]);
  return get(q, rec.id);
}

async function decide(q, id, user, decision, comment = null) {
  if (!['approve', 'reject'].includes(decision)) throw bad('decision_invalid', 'decision must be approve or reject', { decision });
  const rec = (await q('SELECT * FROM rfq_award_recommendations WHERE id = $1 FOR UPDATE', [toInt(id)])).rows[0];
  if (!rec) throw missing('award_recommendation_not_found', `Award recommendation #${id} not found`, { id });
  if (rec.status !== 'submitted') throw conflict('award_not_submitted', `Recommendation ${rec.recommendation_number} is ${rec.status}: only a submitted one can be decided`, { id: rec.id, status: rec.status });
  const result = await workflowEngine.recordDecision(rec.workflow_instance_id, null, user.id, decision, comment, { query: q, role: user.role, userName: user.name });
  if (!result.ok) throw new AwardError(403, 'award_decision_refused', result.error, { id: rec.id });
  const wf = (await q('SELECT status FROM workflow_instances WHERE id = $1', [rec.workflow_instance_id])).rows[0];
  let status = 'submitted';
  if (wf && wf.status === 'rejected') status = 'rejected';
  if (wf && wf.status === 'approved') status = 'approved';
  if (status !== 'submitted') {
    await q('UPDATE rfq_award_recommendations SET status = $2, decided_by = $3, decided_at = NOW(), decision_comment = $4, updated_at = NOW() WHERE id = $1',
      [rec.id, status, user.id, comment]);
  }
  if (status === 'approved') await procurement.awardRfq(q, rec.rfq_id, rec.quotation_id, user);
  return get(q, rec.id);
}

async function withdraw(q, id, user, reason) {
  if (String(reason || '').trim().length < 3) throw bad('withdraw_reason_required', 'A reason is required to withdraw a recommendation');
  const rec = (await q('SELECT * FROM rfq_award_recommendations WHERE id = $1 FOR UPDATE', [toInt(id)])).rows[0];
  if (!rec) throw missing('award_recommendation_not_found', `Award recommendation #${id} not found`, { id });
  if (!['draft', 'submitted'].includes(rec.status)) throw conflict('award_cannot_withdraw', `Recommendation ${rec.recommendation_number} is ${rec.status} and cannot be withdrawn`, { id: rec.id, status: rec.status });
  if (rec.workflow_instance_id != null) await workflowEngine.cancelWorkflowInstance(q, rec.workflow_instance_id, { userId: user.id, reason });
  await q("UPDATE rfq_award_recommendations SET status = 'withdrawn', decided_by = $2, decided_at = NOW(), decision_comment = $3, updated_at = NOW() WHERE id = $1",
    [rec.id, user.id, String(reason).trim()]);
  return get(q, rec.id);
}

// The owner/admin shortcut: award now, on the record. Writes an approved 'direct_award' recommendation.
async function directAward(q, rfqId, quotationId, user, justification) {
  const text = String(justification || '').trim();
  if (text.length < MIN_JUSTIFICATION) throw bad('award_justification_required', `A justification of at least ${MIN_JUSTIFICATION} characters is required`, { min: MIN_JUSTIFICATION });
  const rfq = await getRfq(q, rfqId);
  const quotation = (await q('SELECT * FROM supplier_quotations WHERE id = $1 AND rfq_id = $2', [toInt(quotationId), rfq.id])).rows[0];
  if (!quotation) throw bad('quotation_not_on_rfq', `Quotation #${quotationId} is not on RFQ ${rfq.rfq_number}`, { rfq_id: rfq.id, quotation_id: quotationId });
  if (quotation.compliant === false) throw bad('quotation_not_compliant', 'A non-compliant quotation cannot be awarded', { quotation_id: quotation.id });
  const live = (await q('SELECT id, status FROM rfq_award_recommendations WHERE rfq_id = $1 AND status = ANY($2::text[])', [rfq.id, LIVE])).rows[0];
  if (live) throw conflict('award_recommendation_exists', `RFQ ${rfq.rfq_number} already has a ${live.status} recommendation (#${live.id})`, { id: live.id, status: live.status });
  const awarded = await procurement.awardRfq(q, rfq.id, quotation.id, user);
  const number = await numbering.nextNumber(q, { table: 'rfq_award_recommendations', column: 'recommendation_number', prefix: 'AWR', pad: 5 });
  await q(
    `INSERT INTO rfq_award_recommendations
       (recommendation_number, rfq_id, quotation_id, supplier_id, total_price, basis, justification, status, created_by, decided_by, decided_at)
     VALUES ($1, $2, $3, $4, $5, 'direct_award', $6, 'approved', $7, $7, NOW())`,
    [number, rfq.id, quotation.id, quotation.supplier_id, toNum(quotation.total_price), text, user.id]);
  return awarded;
}

module.exports = { AwardError, BASES, MIN_JUSTIFICATION, get, list, create, submit, decide, withdraw, directAward };
