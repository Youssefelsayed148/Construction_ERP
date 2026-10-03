// Cost consumers (Phase 3.3: moved onto the transactional outbox).
//
// These three handlers used to subscribe to the in-process event bus with local try/catch blocks — a
// failed cost posting was logged and lost. They are now delivered by services/outboxDispatcher.js
// directly from event_outbox: a handler failure retries with backoff and finally dead-letters, visible
// to `npm run outbox:stats` instead of vanishing. Idempotency comes from UNIQUE (source_type, source_id)
// on project_costs (migration 0018): the inserts here are ON CONFLICT DO NOTHING, so a redelivery (or the
// catch-up after a restart) cannot double the cost.
const { query } = require('../config/database');

async function onWorkCompletionVerified(evt, opts = {}) {
  const q = opts.query || query;
  const comp = await q(
    `SELECT wc.*, wo.project_id, wo.id as work_order_id FROM work_completions wc JOIN work_orders wo ON wc.work_order_id = wo.id WHERE wc.id = $1`,
    [evt.entityId]
  );
  if (comp.rows.length === 0) return;

  const woId = comp.rows[0].work_order_id;
  const projectId = comp.rows[0].project_id;

  const [equipCosts, laborPayments] = await Promise.all([
    q('SELECT SUM(total_cost) as total FROM work_order_equipment WHERE work_order_id = $1', [woId]),
    q('SELECT SUM(total_amount) as total FROM labor_payments WHERE work_order_id = $1', [woId]),
  ]);

  const totalCost = parseFloat(equipCosts.rows[0]?.total || 0) + parseFloat(laborPayments.rows[0]?.total || 0);

  if (totalCost > 0) {
    await q(
      `INSERT INTO project_costs (project_id, cost_code_id, source_type, source_id, amount, description)
       VALUES ($1, (SELECT id FROM cost_codes WHERE code = '11' LIMIT 1), 'work_completion', $2, $3, $4)
       ON CONFLICT (source_type, source_id) DO NOTHING`,
      [projectId, evt.entityId, totalCost, `Work completion #${evt.entityId} - labor + equipment for WO #${woId}`]
    );
    console.log(`[COSTING] Work completion #${evt.entityId}: ${totalCost} EGP → project #${projectId}`);
  }
}

async function onLaborPaymentCreated(evt, opts = {}) {
  const q = opts.query || query;
  const payload = evt.payload || {};
  if (!payload?.project_id || !payload?.amount) return;

  await q(
    `INSERT INTO project_costs (project_id, cost_code_id, source_type, source_id, amount, description)
     VALUES ($1, (SELECT id FROM cost_codes WHERE code = '11' LIMIT 1), 'labor_payment', $2, $3, $4)
     ON CONFLICT (source_type, source_id) DO NOTHING`,
    [payload.project_id, evt.entityId, payload.amount, `Labor payment #${evt.entityId} - ${payload.amount} EGP`]
  );
  console.log(`[COSTING] Labor payment #${evt.entityId}: ${payload.amount} EGP → project #${payload.project_id}`);
}

async function onSubPaymentPaid(evt, opts = {}) {
  const q = opts.query || query;
  const payload = evt.payload || {};
  if (!payload?.amount) return;

  const cert = await q(
    `SELECT spc.*, sc.project_id FROM sub_payment_certificates spc JOIN sub_contracts sc ON spc.sub_contract_id = sc.id WHERE spc.id = $1`,
    [evt.entityId]
  );
  if (cert.rows.length === 0) return;
  const projectId = cert.rows[0].project_id;

  await q(
    `INSERT INTO project_costs (project_id, cost_code_id, source_type, source_id, amount, description)
     VALUES ($1, (SELECT id FROM cost_codes WHERE code = '12' LIMIT 1), 'sub_payment', $2, $3, $4)
     ON CONFLICT (source_type, source_id) DO NOTHING`,
    [projectId, evt.entityId, payload.amount, `Subcontractor payment cert #${evt.entityId} - ${payload.amount} EGP`]
  );
  console.log(`[COSTING] Sub payment #${evt.entityId}: ${payload.amount} EGP → project #${projectId}`);
}

module.exports = { onWorkCompletionVerified, onLaborPaymentCreated, onSubPaymentPaid };
