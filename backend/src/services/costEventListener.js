const { query } = require('../config/database');

function initCostEventListener() {
  if (!global.eventBus) {
    const EventEmitter = require('events');
    global.eventBus = new EventEmitter();
  }

  global.eventBus.on('work_completion.verified', async ({ entityType, entityId, payload }) => {
    try {
      const comp = await query(
        `SELECT wc.*, wo.project_id, wo.id as work_order_id FROM work_completions wc JOIN work_orders wo ON wc.work_order_id = wo.id WHERE wc.id = $1`,
        [entityId]
      );
      if (comp.rows.length === 0) return;

      const woId = comp.rows[0].work_order_id;
      const projectId = comp.rows[0].project_id;

      const [equipCosts, laborPayments] = await Promise.all([
        query('SELECT SUM(total_cost) as total FROM work_order_equipment WHERE work_order_id = $1', [woId]),
        query('SELECT SUM(total_amount) as total FROM labor_payments WHERE work_order_id = $1', [woId]),
      ]);

      const totalCost = parseFloat(equipCosts.rows[0]?.total || 0) + parseFloat(laborPayments.rows[0]?.total || 0);

      if (totalCost > 0) {
        await query(
           `INSERT INTO project_costs (project_id, cost_code_id, source_type, source_id, amount, description)
            VALUES ($1, (SELECT id FROM cost_codes WHERE code = '11' LIMIT 1), 'work_completion', $2, $3, $4)
            ON CONFLICT (source_type, source_id) DO NOTHING`,
          [projectId, entityId, totalCost, `Work completion #${entityId} - labor + equipment for WO #${woId}`]
        );
        console.log(`[COSTING] Work completion #${entityId}: ${totalCost} EGP → project #${projectId}`);
      }
    } catch (e) { console.error('[COSTING] work_completion.verified error:', e.message); }
  });

  global.eventBus.on('labor_payment.created', async ({ entityType, entityId, payload }) => {
    try {
      if (!payload?.project_id || !payload?.amount) return;

      await query(
        `INSERT INTO project_costs (project_id, cost_code_id, source_type, source_id, amount, description)
         VALUES ($1, (SELECT id FROM cost_codes WHERE code = '11' LIMIT 1), 'labor_payment', $2, $3, $4)
         ON CONFLICT (source_type, source_id) DO NOTHING`,
        [payload.project_id, entityId, payload.amount, `Labor payment #${entityId} - ${payload.amount} EGP`]
      );
      console.log(`[COSTING] Labor payment #${entityId}: ${payload.amount} EGP → project #${payload.project_id}`);
    } catch (e) { console.error('[COSTING] labor_payment.created error:', e.message); }
  });

  global.eventBus.on('sub_payment.paid', async ({ entityType, entityId, payload }) => {
    try {
      if (!payload?.amount) return;

      const cert = await query(
        `SELECT spc.*, sc.project_id FROM sub_payment_certificates spc JOIN sub_contracts sc ON spc.sub_contract_id = sc.id WHERE spc.id = $1`,
        [entityId]
      );
      if (cert.rows.length === 0) return;
      const projectId = cert.rows[0].project_id;

      await query(
        `INSERT INTO project_costs (project_id, cost_code_id, source_type, source_id, amount, description)
         VALUES ($1, (SELECT id FROM cost_codes WHERE code = '12' LIMIT 1), 'sub_payment', $2, $3, $4)
         ON CONFLICT (source_type, source_id) DO NOTHING`,
        [projectId, entityId, payload.amount, `Subcontractor payment cert #${entityId} - ${payload.amount} EGP`]
      );
      console.log(`[COSTING] Sub payment #${entityId}: ${payload.amount} EGP → project #${projectId}`);
    } catch (e) { console.error('[COSTING] sub_payment.paid error:', e.message); }
  });

  console.log('[COSTING] Event listener initialized — watching: work_completion.verified, labor_payment.created, sub_payment.paid');
}

module.exports = { initCostEventListener };
