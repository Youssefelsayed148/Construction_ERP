// Cost consumers (Phase 3.3: moved onto the transactional outbox).
//
// These handlers used to subscribe to the in-process event bus with local try/catch blocks — a
// failed cost posting was logged and lost. They are now delivered by services/outboxDispatcher.js
// directly from event_outbox: a handler failure retries with backoff and finally dead-letters, visible
// to `npm run outbox:stats` instead of vanishing. Idempotency comes from UNIQUE (source_type, source_id)
// on project_costs (migration 0018): the inserts here are ON CONFLICT DO NOTHING, so a redelivery (or the
// catch-up after a restart) cannot double the cost.
//
// Closeout A2.3: the source types and cost codes come from COST_ACCRUAL_RULES (services/costAccrual.js).
// A work completion no longer accrues the work order's labour (each labour payment accrues itself) and no
// longer re-counts the whole order on every completion: it accrues the order's EQUIPMENT lines, once each.
const { query } = require('../config/database');
const costAccrual = require('./costAccrual');

const { COST_ACCRUAL_RULES: RULES } = costAccrual;
const money = require('../utils/money');

async function onWorkCompletionVerified(evt, opts = {}) {
  const q = opts.query || query;
  const rule = RULES.work_order_equipment;
  const comp = await q(
    `SELECT wc.id, wc.work_order_id, wo.project_id FROM work_completions wc JOIN work_orders wo ON wc.work_order_id = wo.id WHERE wc.id = $1`,
    [evt.entityId]
  );
  if (comp.rows.length === 0) return;
  const { work_order_id: woId, project_id: projectId } = comp.rows[0];

  // An order whose cost was already accrued by a pre-A2.3 completion row (labour + equipment, whole order) is
  // left alone: accruing its equipment again would double count against that legacy row.
  const legacy = await q(
    `SELECT 1 FROM project_costs pc JOIN work_completions wc ON pc.source_id = wc.id
      WHERE pc.source_type = $1 AND wc.work_order_id = $2 LIMIT 1`,
    [rule.legacy_source, woId]
  );
  if (legacy.rows.length > 0) return;

  const lines = (await q('SELECT id, total_cost, hours FROM work_order_equipment WHERE work_order_id = $1 AND total_cost > 0 ORDER BY id', [woId])).rows;
  const costCode = await costAccrual.costCodeIdFor(q, rule.cost_code);
  for (const line of lines) {
    const row = await costAccrual.insertCostRow(q, {
      projectId, costCodeId: costCode, sourceType: rule.project_costs_source, sourceId: line.id,
      amountMinor: money.toMinor(line.total_cost), description: `Equipment on work order #${woId} (${line.hours} h), verified completion #${evt.entityId}`,
    });
    if (row) console.log(`[COSTING] Equipment line #${line.id}: ${line.total_cost} EGP → project #${projectId}`);
  }
}

async function onLaborPaymentCreated(evt, opts = {}) {
  const q = opts.query || query;
  const rule = RULES.labor_payment;
  const payload = evt.payload || {};
  if (!payload.project_id || !payload.amount) return;
  const row = await costAccrual.insertCostRow(q, {
    projectId: payload.project_id, costCodeId: await costAccrual.costCodeIdFor(q, rule.cost_code),
    sourceType: rule.project_costs_source, sourceId: evt.entityId,
    amountMinor: money.toMinor(payload.amount), description: `Labor payment #${evt.entityId} - ${payload.amount} EGP`,
  });
  if (row) console.log(`[COSTING] Labor payment #${evt.entityId}: ${payload.amount} EGP → project #${payload.project_id}`);
}

async function onSubPaymentPaid(evt, opts = {}) {
  const q = opts.query || query;
  const rule = RULES.subcontractor_payment;
  const payload = evt.payload || {};
  if (!payload.amount) return;

  const cert = await q(
    `SELECT spc.*, sc.project_id FROM sub_payment_certificates spc JOIN sub_contracts sc ON spc.sub_contract_id = sc.id WHERE spc.id = $1`,
    [evt.entityId]
  );
  if (cert.rows.length === 0) return;
  const projectId = cert.rows[0].project_id;

  const row = await costAccrual.insertCostRow(q, {
    projectId, costCodeId: await costAccrual.costCodeIdFor(q, rule.cost_code),
    sourceType: rule.project_costs_source, sourceId: evt.entityId,
    amountMinor: money.toMinor(payload.amount), description: `Subcontractor payment cert #${evt.entityId} - ${payload.amount} EGP`,
  });
  if (row) console.log(`[COSTING] Sub payment #${evt.entityId}: ${payload.amount} EGP → project #${projectId}`);
}

module.exports = { onWorkCompletionVerified, onLaborPaymentCreated, onSubPaymentPaid };
