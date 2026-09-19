const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const engine = require('../services/commercialEngine');

// Phase 13 — the commercial surface: client contracts (SOV), the variation
// lifecycle (through the Phase 6 'variation' workflow with the catalog's
// exact states), commitments, retention/advance ledgers.

// ---------------------------------------------------------------------------
// Client contracts + SOV
// ---------------------------------------------------------------------------

router.get('/contracts/:projectId', authenticate, authorize(), async (req, res) => {
  try {
    const contracts = (await query('SELECT * FROM client_contracts WHERE project_id = $1 ORDER BY id', [req.params.projectId])).rows;
    for (const c of contracts) {
      c.lines = (await query('SELECT * FROM contract_lines WHERE client_contract_id = $1 ORDER BY sort_order, id', [c.id])).rows;
    }
    res.json({ success: true, data: contracts });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/contracts', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      client_id: Joi.number().integer().optional().allow(null),
      title: Joi.string().optional().allow('', null),
      original_value: Joi.number().min(0).required(),
      retention_percent: Joi.number().min(0).max(100).default(10),
      advance_percent: Joi.number().min(0).max(100).default(0),
      contract_date: Joi.date().iso().optional().allow(null),
      start_date: Joi.date().iso().optional().allow(null),
      end_date: Joi.date().iso().optional().allow(null),
      notes: Joi.string().optional().allow('', null),
      lines: Joi.array().items(Joi.object({
        boq_item_id: Joi.number().integer().optional().allow(null),
        description: Joi.string().optional().allow('', null),
        quantity: Joi.number().min(0).default(0),
        unit: Joi.string().optional().allow('', null),
        unit_rate: Joi.number().min(0).default(0),
      })).default([]),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const count = parseInt((await query('SELECT COUNT(*) FROM client_contracts')).rows[0].count);
    const contractNumber = `CC-${String(count + 1).padStart(5, '0')}`;

    const created = await transaction(async (client) => {
      const r = await client.query(
        `INSERT INTO client_contracts
           (contract_number, project_id, client_id, title, original_value, revised_value,
            retention_percent, advance_percent, contract_date, start_date, end_date, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [contractNumber, value.project_id, value.client_id || null, value.title || null, value.original_value,
         value.retention_percent, value.advance_percent, value.contract_date || null,
         value.start_date || null, value.end_date || null, value.notes || null, req.user.id]
      );
      const contract = r.rows[0];
      let sort = 0;
      for (const line of value.lines) {
        await client.query(
          `INSERT INTO contract_lines (client_contract_id, boq_item_id, description, quantity, unit, unit_rate, amount, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [contract.id, line.boq_item_id || null, line.description || null, line.quantity,
           line.unit || null, line.unit_rate || 0, Math.round((line.quantity * line.unit_rate + Number.EPSILON) * 100) / 100, ++sort]
        );
      }
      return contract;
    });

    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'create', module: 'commercial',
      description: `Created client contract ${contractNumber}`,
      entityId: created.id, entityType: 'client_contract',
    });
    res.status(201).json({ success: true, data: created });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// ---------------------------------------------------------------------------
// Variations — lifecycle through the Phase 6 'variation' template
// ---------------------------------------------------------------------------

router.get('/variations/:projectId', authenticate, authorize(), async (req, res) => {
  try {
    const data = (await query('SELECT * FROM variations WHERE project_id = $1 ORDER BY id', [req.params.projectId])).rows;
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/variations', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      client_contract_id: Joi.number().integer().optional().allow(null),
      sub_contract_id: Joi.number().integer().optional().allow(null),
      title: Joi.string().required(),
      description: Joi.string().optional().allow('', null),
      variation_type: Joi.string().valid('client', 'internal', 'subcontract').default('client'),
      lines: Joi.array().items(Joi.object({
        boq_item_id: Joi.number().integer().optional().allow(null),
        description: Joi.string().optional().allow('', null),
        quantity: Joi.number().min(0).default(0),
        unit: Joi.string().optional().allow('', null),
        unit_rate: Joi.number().default(0),
      })).default([]),
      cost_buildup: Joi.array().items(Joi.object({
        component: Joi.string().required(),
        cost_code_id: Joi.number().integer().optional().allow(null),
        quantity: Joi.number().default(0),
        unit_rate: Joi.number().default(0),
        amount: Joi.number().default(0),
        notes: Joi.string().optional().allow('', null),
      })).default([]),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const variation = await engine.createVariation(query, { ...value, created_by: req.user.id });
    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'create', module: 'commercial',
      description: `Created variation ${variation.variation_number}`,
      entityId: variation.id, entityType: 'variation',
    });
    res.status(201).json({ success: true, data: variation });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/variations/:id/start', authenticate, authorize(), async (req, res) => {
  try {
    const instance = await transaction((client) => engine.startVariationWorkflow(
      client.query.bind(client), parseInt(req.params.id, 10), req.user
    ));
    res.json({ success: true, data: instance });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/variations/:id/decide', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ decision: Joi.string().valid('approve', 'reject').required(), comment: Joi.string().allow('', null) });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const result = await transaction((client) => engine.decideVariation(
      client.query.bind(client), parseInt(req.params.id, 10), req.user, value.decision, value.comment
    ));
    res.json({ success: true, data: result });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// ---------------------------------------------------------------------------
// Commercial snapshot of a project (the canonical figures)
// ---------------------------------------------------------------------------

router.get('/project/:projectId/commercial', authenticate, authorize(), async (req, res) => {
  try {
    const data = await engine.projectCommercial(query, parseInt(req.params.projectId, 10));
    if (!data) return res.status(404).json({ success: false, error: 'Project not found' });
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Legacy snapshots (audit trail of the three retired formulas).
router.get('/project/:projectId/legacy-snapshots', authenticate, authorize(), async (req, res) => {
  try {
    const data = (await query(
      'SELECT * FROM commercial_snapshots WHERE project_id = $1 ORDER BY snapshot_type',
      [req.params.projectId]
    )).rows;
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
