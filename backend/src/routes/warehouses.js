const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const engine = require('../services/inventoryEngine');

// Phase 10 — inventory surface. Stock is ledgered: every change enters as a
// stock_movements row through the movement API; warehouse_stock is a derived
// projection the engine rewrites (physical / reserved / quarantined /
// available). The old direct-mutation endpoint (POST /:id/stock) is removed —
// frontend/src/pages has no caller for it (Dashboard reads low-stock alerts,
// WorkOrders reads the warehouse dropdown; both go through this API).
//
// The MIR gate: a delivery without an accepted MIR enters as a 'quarantine'
// movement and never counts toward Available Stock. POST
// /movements/:id/mir is the gate — Phase 12's MIR record drives it.

const WAREHOUSE_TYPES = ['central', 'project', 'site', 'temp', 'holding'];
// Direct movement types. transfer_out/transfer_in are only created by the
// transfer completion flow; quarantine_release/quarantine_reject by the MIR
// gate endpoint.
const DIRECT_MOVEMENT_TYPES = ['grn', 'issue', 'return', 'adjustment', 'waste', 'damage', 'supplier_return', 'quarantine'];

const movementBodySchema = {
  material_id: Joi.number().integer().required(),
  movement_type: Joi.string().valid(...DIRECT_MOVEMENT_TYPES).required(),
  quantity: Joi.number().required(),
  reference_type: Joi.string().max(50).optional().allow(null, ''),
  reference_id: Joi.number().integer().optional().allow(null),
  notes: Joi.string().optional().allow(null, ''),
  // MIR gate evidence: a GRN is only accepted with an accepted MIR.
  mir_accepted: Joi.boolean().optional(),
};

// ---------------------------------------------------------------------------
// Warehouses
// ---------------------------------------------------------------------------

router.get('/', authenticate, authorize(), async (req, res) => {
  try {
    const { type, warehouse_type, project_id } = req.query;
    let conds = []; let p = []; let i = 1;
    if (type) { conds.push(`w.type = $${i++}`); p.push(type); }
    if (warehouse_type && WAREHOUSE_TYPES.includes(warehouse_type)) { conds.push(`w.warehouse_type = $${i++}`); p.push(warehouse_type); }
    if (project_id) { conds.push(`w.project_id = $${i++}`); p.push(parseInt(project_id)); }
    const w = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const data = await query(`SELECT w.*, p.name as project_name FROM warehouses w LEFT JOIN projects p ON w.project_id = p.id ${w} ORDER BY w.type, w.name`, p);
    res.json({ success: true, data: data.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const wh = await query('SELECT * FROM warehouses WHERE id = $1', [req.params.id]);
    if (wh.rows.length === 0) return res.status(404).json({ success: false, error: 'Warehouse not found' });

    // Derived projection — physical/reserved/quarantined/available come from
    // the ledger via the engine; the stored columns are never hand-edited.
    const stock = await query(
      `SELECT ws.*, im.code as item_code, im.name_en, im.name_ar, im.unit
       FROM warehouse_stock ws LEFT JOIN item_master im ON ws.item_id = im.id WHERE ws.warehouse_id = $1`,
      [req.params.id]
    );

    res.json({ success: true, data: { ...wh.rows[0], stock: stock.rows } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ---------------------------------------------------------------------------
// Stock movements — the only way stock changes
// ---------------------------------------------------------------------------

// GET /api/warehouses/:id/movements?movement_type=&material_id=
router.get('/:id/movements', authenticate, authorize(), async (req, res) => {
  try {
    let conds = ['warehouse_id = $1']; const p = [parseInt(req.params.id, 10)]; let i = 2;
    if (req.query.movement_type) { conds.push(`movement_type = $${i++}`); p.push(req.query.movement_type); }
    if (req.query.material_id) { conds.push(`material_id = $${i++}`); p.push(parseInt(req.query.material_id, 10)); }
    const rows = (await query(
      `SELECT sm.*, im.code AS material_code, im.name_en AS material_name_en, im.name_ar AS material_name_ar
       FROM stock_movements sm LEFT JOIN item_master im ON im.id = sm.material_id
       WHERE ${conds.join(' AND ')} ORDER BY sm.created_at DESC, sm.id DESC LIMIT 200`,
      p
    )).rows;
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/warehouses/:id/movements — the movement API. A 'grn' requires MIR
// evidence (mir_accepted: true + mir reference); received-but-uninspected
// material must be posted as movement_type 'quarantine'.
router.post('/:id/movements', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object(movementBodySchema);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    if (value.movement_type === 'grn') {
      const hasMir = value.mir_accepted === true || (value.reference_type === 'mir' && value.reference_id != null);
      if (!hasMir) {
        return res.status(400).json({
          success: false,
          error: 'A delivery only becomes usable stock after an accepted MIR — post movement_type \'quarantine\' for received-but-uninspected material, or supply mir_accepted/MIR reference evidence',
        });
      }
    }

    const movement = await engine.createMovement(query, {
      warehouse_id: parseInt(req.params.id, 10),
      material_id: value.material_id,
      movement_type: value.movement_type,
      quantity: value.quantity,
      reference_type: value.reference_type || null,
      reference_id: value.reference_id || null,
      notes: value.notes || null,
      created_by: req.user.id,
    });
    const balances = await engine.getBalances(query, movement.warehouse_id, movement.material_id);

    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'create', module: 'inventory',
      description: `Stock movement ${value.movement_type}: ${value.quantity} of item #${value.material_id} at warehouse #${req.params.id}`,
      entityId: movement.id, entityType: 'stock_movement',
    });
    res.status(201).json({ success: true, data: { movement, balances } });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// POST /api/warehouses/movements/:id/reverse — append-only correction: posts a
// reversal/adjustment movement referencing the original. The original row is
// never updated or deleted.
router.post('/movements/:id/reverse', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ reason: Joi.string().optional().allow(null, '') });
    const { error, value } = schema.validate(req.body || {});
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const movement = await engine.reverseMovement(query, parseInt(req.params.id, 10), {
      reason: value.reason || null,
      created_by: req.user.id,
    });

    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'create', module: 'inventory',
      description: `Reversed stock movement #${req.params.id} with movement #${movement.id}`,
      entityId: movement.id, entityType: 'stock_movement',
    });
    res.status(201).json({ success: true, data: movement });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// POST /api/warehouses/movements/:id/mir — the MIR gate. result 'accepted'
// releases the quarantined receipt into usable stock; 'rejected' removes it
// from quarantine (it was never usable, so Available never increased).
router.post('/movements/:id/mir', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      result: Joi.string().valid('accepted', 'rejected').required(),
      mir_id: Joi.number().integer().optional().allow(null),
      notes: Joi.string().optional().allow(null, ''),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const original = (await query('SELECT * FROM stock_movements WHERE id = $1', [req.params.id])).rows[0];
    if (!original) return res.status(404).json({ success: false, error: 'Stock movement not found' });
    if (original.movement_type !== 'quarantine') {
      return res.status(400).json({ success: false, error: `Movement #${original.id} is not a quarantined receipt` });
    }

    const movement = await engine.createMovement(query, {
      warehouse_id: original.warehouse_id,
      material_id: original.material_id,
      movement_type: value.result === 'accepted' ? 'quarantine_release' : 'quarantine_reject',
      quantity: original.quantity,
      reference_type: 'mir',
      reference_id: value.mir_id || null,
      notes: value.notes || (value.result === 'accepted' ? 'MIR accepted' : 'MIR rejected'),
      created_by: req.user.id,
    });
    const balances = await engine.getBalances(query, original.warehouse_id, original.material_id);

    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'create', module: 'inventory',
      description: `MIR ${value.result} for movement #${original.id}`,
      entityId: movement.id, entityType: 'stock_movement',
    });
    res.status(201).json({ success: true, data: { movement, balances } });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// ---------------------------------------------------------------------------
// Transfers — a completed transfer is a paired stock_movement
// (transfer_out + transfer_in) written in one transaction.
// ---------------------------------------------------------------------------

router.get('/transfers', authenticate, authorize(), async (req, res) => {
  try {
    const { status } = req.query;
    let conds = []; let p = []; let i = 1;
    if (status) { conds.push(`t.status = $${i++}`); p.push(status); }
    const w = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const data = await query(
      `SELECT t.*, fw.name as from_name, tw.name as to_name
       FROM inventory_transfers t
       LEFT JOIN warehouses fw ON t.from_warehouse_id = fw.id
       LEFT JOIN warehouses tw ON t.to_warehouse_id = tw.id
       ${w} ORDER BY t.created_at DESC LIMIT 100`, p
    );
    res.json({ success: true, data: data.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/transfers', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      from_warehouse_id: Joi.number().integer().required(),
      to_warehouse_id: Joi.number().integer().required(),
      items: Joi.array().items(Joi.object({ item_id: Joi.number().integer().required(), quantity: Joi.number().positive().required() })).min(1).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const result = await transaction(async (client) => {
      const transfer = await client.query(
        `INSERT INTO inventory_transfers (from_warehouse_id, to_warehouse_id, requested_by) VALUES ($1,$2,$3) RETURNING *`,
        [value.from_warehouse_id, value.to_warehouse_id, req.user.id]
      );
      const tid = transfer.rows[0].id;

      for (const item of value.items) {
        await client.query(
          `INSERT INTO inventory_transfer_items (transfer_id, item_id, quantity) VALUES ($1,$2,$3)`,
          [tid, item.item_id, item.quantity]
        );
      }

      return transfer.rows[0];
    });

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'inventory', description: `Created inventory transfer #${result.id}`, entityId: result.id, entityType: 'inventory_transfer' });
    res.status(201).json({ success: true, data: result });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/transfers/:id/complete', authenticate, authorize(), async (req, res) => {
  try {
    const transfer = await query('SELECT * FROM inventory_transfers WHERE id = $1', [req.params.id]);
    if (transfer.rows.length === 0) return res.status(404).json({ success: false, error: 'Transfer not found' });
    if (transfer.rows[0].status !== 'draft') return res.status(400).json({ success: false, error: 'Transfer already processed' });

    const items = await query('SELECT * FROM inventory_transfer_items WHERE transfer_id = $1', [req.params.id]);

    await transaction(async (client) => {
      const txQuery = client.query.bind(client);
      // Pre-flight: usable (available) stock at the source for every item.
      for (const item of items.rows) {
        const balances = await engine.getBalances(txQuery, transfer.rows[0].from_warehouse_id, item.item_id);
        if (balances.available < engine.toNum(item.quantity)) {
          throw new Error(`Insufficient stock for item #${item.item_id}: ${balances.available} available, ${item.quantity} requested`);
        }
      }
      // Paired movements in one transaction: transfer_out + transfer_in.
      for (const item of items.rows) {
        await engine.createMovement(txQuery, {
          warehouse_id: transfer.rows[0].from_warehouse_id,
          material_id: item.item_id,
          movement_type: 'transfer_out',
          quantity: item.quantity,
          reference_type: 'inventory_transfer',
          reference_id: transfer.rows[0].id,
          created_by: req.user.id,
        });
        await engine.createMovement(txQuery, {
          warehouse_id: transfer.rows[0].to_warehouse_id,
          material_id: item.item_id,
          movement_type: 'transfer_in',
          quantity: item.quantity,
          reference_type: 'inventory_transfer',
          reference_id: transfer.rows[0].id,
          created_by: req.user.id,
        });
      }
      await client.query(
        `UPDATE inventory_transfers SET status = 'completed', approved_by = $1, transferred_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [req.user.id, req.params.id]
      );
    });

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'complete', module: 'inventory', description: `Completed inventory transfer #${req.params.id} as paired stock movements`, entityId: req.params.id, entityType: 'inventory_transfer' });
    res.json({ success: true, message: 'Transfer completed' });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// ---------------------------------------------------------------------------
// Reservations — reserved stock subtracts from Available, never from Physical
// ---------------------------------------------------------------------------

// GET /api/warehouses/reservations?material_id=&project_id=&warehouse_id=&status=
router.get('/reservations', authenticate, authorize(), async (req, res) => {
  try {
    let conds = []; const p = []; let i = 1;
    if (req.query.material_id) { conds.push(`material_id = $${i++}`); p.push(parseInt(req.query.material_id, 10)); }
    if (req.query.project_id) { conds.push(`project_id = $${i++}`); p.push(parseInt(req.query.project_id, 10)); }
    if (req.query.warehouse_id) { conds.push(`warehouse_id = $${i++}`); p.push(parseInt(req.query.warehouse_id, 10)); }
    if (req.query.status) { conds.push(`status = $${i++}`); p.push(req.query.status); }
    const rows = (await query(
      `SELECT sr.*, im.code AS material_code, im.name_en AS material_name_en, p.name AS project_name
       FROM stock_reservations sr
       LEFT JOIN item_master im ON im.id = sr.material_id
       LEFT JOIN projects p ON p.id = sr.project_id
       ${conds.length ? ' WHERE ' + conds.join(' AND ') : ''} ORDER BY sr.created_at DESC LIMIT 200`,
      p
    )).rows;
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/warehouses/reservations
router.post('/reservations', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      material_id: Joi.number().integer().required(),
      quantity: Joi.number().positive().required(),
      project_id: Joi.number().integer().optional().allow(null),
      location_id: Joi.number().integer().optional().allow(null),
      warehouse_id: Joi.number().integer().optional().allow(null),
      expires_at: Joi.date().iso().optional().allow(null),
      reference_type: Joi.string().max(50).optional().allow(null, ''),
      reference_id: Joi.number().integer().optional().allow(null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const reservation = await engine.createReservation(query, {
      material_id: value.material_id,
      project_id: value.project_id || null,
      location_id: value.location_id || null,
      warehouse_id: value.warehouse_id || null,
      quantity: value.quantity,
      expires_at: value.expires_at || null,
      reference_type: value.reference_type || null,
      reference_id: value.reference_id || null,
      created_by: req.user.id,
    });

    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'create', module: 'inventory',
      description: `Reserved ${value.quantity} of item #${value.material_id}`,
      entityId: reservation.id, entityType: 'stock_reservation',
    });
    res.status(201).json({ success: true, data: reservation });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// POST /api/warehouses/reservations/:id/release
router.post('/reservations/:id/release', authenticate, authorize(), async (req, res) => {
  try {
    const reservation = await engine.releaseReservation(query, parseInt(req.params.id, 10), {
      status: 'released',
      created_by: req.user.id,
    });
    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'update', module: 'inventory',
      description: `Released reservation #${req.params.id}`,
      entityId: reservation.id, entityType: 'stock_reservation',
    });
    res.json({ success: true, data: reservation });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

module.exports = router;
