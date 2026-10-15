'use strict';

const { nextNumber } = require('./numbering');

const ACTIVE_PO_EXCLUSIONS = ['draft', 'rejected', 'cancelled', 'void'];
const ACTIVE_SUBCONTRACT_STATUSES = ['active', 'approved', 'completed', 'closed'];

async function syncSource(q, { sourceType, sourceId, projectId, amount, active }) {
  const existing = (await q(
    'SELECT id FROM commitments WHERE source_type = $1 AND source_id = $2 FOR UPDATE', [sourceType, sourceId]
  )).rows[0];
  if (!active) {
    if (existing) await q("UPDATE commitments SET status = 'cancelled', updated_at = NOW() WHERE id = $1", [existing.id]);
    return existing || null;
  }
  if (existing) {
    return (await q(
      "UPDATE commitments SET project_id = $2, original_amount = $3, status = 'active', updated_at = NOW() WHERE id = $1 RETURNING *",
      [existing.id, projectId, amount]
    )).rows[0];
  }
  const commitmentNumber = await nextNumber(q, {
    table: 'commitments', column: 'commitment_number', prefix: 'CM', pad: 5,
  });
  return (await q(
    `INSERT INTO commitments (commitment_number, project_id, source_type, source_id, original_amount, status)
     VALUES ($1,$2,$3,$4,$5,'active') RETURNING *`,
    [commitmentNumber, projectId, sourceType, sourceId, amount]
  )).rows[0];
}

async function syncPurchaseOrder(q, id) {
  const po = (await q(
    'SELECT id, project_id, total_amount, status FROM purchase_orders WHERE id = $1 FOR UPDATE', [Number(id)]
  )).rows[0];
  if (!po) return null;
  return syncSource(q, {
    sourceType: 'purchase_order', sourceId: po.id, projectId: po.project_id,
    amount: po.total_amount, active: !ACTIVE_PO_EXCLUSIONS.includes(po.status),
  });
}

async function syncSubcontract(q, id) {
  const subcontract = (await q(
    'SELECT id, project_id, contract_value, revised_amount, status FROM sub_contracts WHERE id = $1 FOR UPDATE', [Number(id)]
  )).rows[0];
  if (!subcontract) return null;
  const revised = Number(subcontract.revised_amount);
  const originalAmount = subcontract.revised_amount != null && Number.isFinite(revised) && revised > 0
    ? revised : subcontract.contract_value;
  return syncSource(q, {
    sourceType: 'sub_contract', sourceId: subcontract.id, projectId: subcontract.project_id,
    amount: originalAmount, active: ACTIVE_SUBCONTRACT_STATUSES.includes(subcontract.status),
  });
}

module.exports = { syncPurchaseOrder, syncSubcontract };
