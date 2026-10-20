const { authorizedProjectId, authorizeProjectPayload } = require('../services/authorizedProject');
const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { queryPaginated } = require('../utils/pagination');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { auditedTransaction } = require('../utils/auditedTransaction');
const engine = require('../services/inventoryEngine');
const lots = require('../services/inventoryLots');
const { routeFail } = require('../utils/typedRoute');

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
  // Receipt cost only. Outbound movements are valued by the database at the weighted average (migration 0007).
  unit_cost: Joi.number().min(0).optional(),
  // Lots (5.3): name an existing lot, or give lot data (a lot of that number is created or reused).
  lot_id: Joi.number().integer().optional().allow(null),
  lot: Joi.object({
    lot_number: Joi.string().max(100).required(), batch_number: Joi.string().max(100).allow('', null),
    manufactured_date: Joi.date().iso().allow(null), expiry_date: Joi.date().iso().allow(null),
  }).optional(),
};
const COST_BEARING_TYPES = ['grn', 'quarantine', 'return', 'adjustment'];

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
    const data = await queryPaginated(req, res, query, { sql: `SELECT w.*, p.name as project_name FROM warehouses w LEFT JOIN projects p ON w.project_id = p.id ${w} ORDER BY w.type, w.name`, params: p, orderBy: [{"column":"type","direction":"ASC"},{"column":"name","direction":"ASC"}] });
    res.json({ success: true, data: data.rows });
  } catch (e) { return routeFail(res, e, 'WAREHOUSES', req); }
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
    const rows = await queryPaginated(req, res, query, {
      sql: `SELECT sm.*, im.code AS material_code, im.name_en AS material_name_en, im.name_ar AS material_name_ar
       FROM stock_movements sm LEFT JOIN item_master im ON im.id = sm.material_id
       WHERE ${conds.join(' AND ')}`,
      params: p,
      orderBy: [{ column: 'sm.created_at', direction: 'DESC' }, { column: 'sm.id', direction: 'DESC' }],
    });
    res.json({ success: true, data: rows.rows });
  } catch (e) { return routeFail(res, e, 'WAREHOUSES', req); }
});

// POST /api/warehouses/:id/movements — the movement API. A 'grn' requires MIR
// evidence (mir_accepted: true + mir reference); received-but-uninspected
// material must be posted as movement_type 'quarantine'.
router.post('/:id/movements', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object(movementBodySchema);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error', error_params: { field: error.details[0].path.join('.') } });

    if (value.movement_type === 'grn') {
      const hasMir = value.mir_accepted === true || (value.reference_type === 'mir' && value.reference_id != null);
      if (!hasMir) {
        return res.status(400).json({
          success: false,
          error: 'A delivery only becomes usable stock after an accepted MIR — post movement_type \'quarantine\' for received-but-uninspected material, or supply mir_accepted/MIR reference evidence',
          error_code: 'grn_requires_accepted_mir', error_params: {},
        });
      }
    }

    if (value.unit_cost != null && !COST_BEARING_TYPES.includes(value.movement_type)) {
      return res.status(400).json({ success: false, error: `unit_cost is not accepted on a ${value.movement_type} movement: it is valued at the current weighted average`, error_code: 'unit_cost_not_accepted', error_params: { movement_type: value.movement_type } });
    }

    const { movement, balances } = await transaction(async (client) => {
      const tq = client.query.bind(client);
      let lotId = value.lot_id || null;
      if (value.lot) {
        lotId = (await lots.getOrCreateLot(tq, {
          warehouse_id: parseInt(req.params.id, 10), material_id: value.material_id, ...value.lot, created_by: req.user.id,
        })).id;
      }
      const created = await engine.createMovement(tq, {
        lot_id: lotId,
        warehouse_id: parseInt(req.params.id, 10),
        material_id: value.material_id,
        movement_type: value.movement_type,
        quantity: value.quantity,
        reference_type: value.reference_type || null,
        reference_id: value.reference_id || null,
        notes: value.notes || null,
        created_by: req.user.id,
        unit_cost: value.unit_cost == null ? null : value.unit_cost,
      });
      const balances = await engine.getBalances(tq, created.warehouse_id, created.material_id);
      await logActivity({
        userId: req.user.id, userName: req.user.name, userRole: req.user.role,
        action: 'create', module: 'inventory',
        description: `Stock movement ${value.movement_type}: ${value.quantity} of item #${value.material_id} at warehouse #${req.params.id}`,
        entityId: created.id, entityType: 'stock_movement',
      }, { query: tq });
      return { movement: created, balances };
    });
    res.status(201).json({ success: true, data: { movement, balances } });
  } catch (e) { return routeFail(res, e, 'WAREHOUSES', req); }
});

// POST /api/warehouses/movements/:id/reverse — append-only correction: posts a
// reversal/adjustment movement referencing the original. The original row is
// never updated or deleted.
router.post('/movements/:id/reverse', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ reason: Joi.string().optional().allow(null, '') });
    const { error, value } = schema.validate(req.body || {});
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error', error_params: { field: error.details[0].path.join('.') } });

    const movement = await auditedTransaction((q) => engine.reverseMovement(q, parseInt(req.params.id, 10), {
      reason: value.reason || null, created_by: req.user.id,
    }), (result) => ({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'create', module: 'inventory',
      description: `Reversed stock movement #${req.params.id} with movement #${result.id}`,
      entityId: result.id, entityType: 'stock_movement',
    }));
    res.status(201).json({ success: true, data: movement });
  } catch (e) { return routeFail(res, e, 'WAREHOUSES', req); }
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
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error', error_params: { field: error.details[0].path.join('.') } });

    const original = (await query('SELECT * FROM stock_movements WHERE id = $1', [req.params.id])).rows[0];
    if (!original) return res.status(404).json({ success: false, error: 'Stock movement not found', error_code: 'stock_movement_not_found', error_params: {} });
    if (original.movement_type !== 'quarantine') {
      return res.status(400).json({ success: false, error: `Movement #${original.id} is not a quarantined receipt`, error_code: 'movement_not_quarantined_receipt', error_params: { movement_id: original.id } });
    }

    const { movement, balances } = await transaction(async (client) => {
      const tq = client.query.bind(client);
      const created = await engine.createMovement(tq, {
        warehouse_id: original.warehouse_id,
        material_id: original.material_id,
        movement_type: value.result === 'accepted' ? 'quarantine_release' : 'quarantine_reject',
        quantity: original.quantity,
        reference_type: 'mir',
        reference_id: value.mir_id || null,
        notes: value.notes || (value.result === 'accepted' ? 'MIR accepted' : 'MIR rejected'),
        created_by: req.user.id,
      });
      const balances = await engine.getBalances(tq, original.warehouse_id, original.material_id);
      await logActivity({
        userId: req.user.id, userName: req.user.name, userRole: req.user.role,
        action: 'create', module: 'inventory', description: `MIR ${value.result} for movement #${original.id}`,
        entityId: created.id, entityType: 'stock_movement',
      }, { query: tq });
      return { movement: created, balances };
    });
    res.status(201).json({ success: true, data: { movement, balances } });
  } catch (e) { return routeFail(res, e, 'WAREHOUSES', req); }
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
    const data = await queryPaginated(req, res, query, {
      sql: `SELECT t.*, fw.name as from_name, tw.name as to_name
       FROM inventory_transfers t
       LEFT JOIN warehouses fw ON t.from_warehouse_id = fw.id
       LEFT JOIN warehouses tw ON t.to_warehouse_id = tw.id
       ${w}`,
      params: p,
      orderBy: [{ column: 't.created_at', direction: 'DESC' }],
    });
    res.json({ success: true, data: data.rows });
  } catch (e) { return routeFail(res, e, 'WAREHOUSES', req); }
});

router.post('/transfers', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      from_warehouse_id: Joi.number().integer().required(),
      to_warehouse_id: Joi.number().integer().required(),
      items: Joi.array().items(Joi.object({ item_id: Joi.number().integer().required(), quantity: Joi.number().positive().required() })).min(1).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error', error_params: { field: error.details[0].path.join('.') } });

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

      const created = transfer.rows[0];
      await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'inventory', description: `Created inventory transfer #${created.id}`, entityId: created.id, entityType: 'inventory_transfer' }, { query: client.query.bind(client) });
      return created;
    });
    res.status(201).json({ success: true, data: result });
  } catch (e) { return routeFail(res, e, 'WAREHOUSES', req); }
});

router.put('/transfers/:id/complete', authenticate, authorize(), async (req, res) => {
  try {
    const transfer = await query('SELECT * FROM inventory_transfers WHERE id = $1', [req.params.id]);
    if (transfer.rows.length === 0) return res.status(404).json({ success: false, error: 'Transfer not found', error_code: 'transfer_not_found', error_params: {} });
    if (transfer.rows[0].status !== 'draft') return res.status(400).json({ success: false, error: 'Transfer already processed', error_code: 'transfer_already_processed', error_params: {} });

    const items = await query('SELECT * FROM inventory_transfer_items WHERE transfer_id = $1', [req.params.id]);

    await transaction(async (client) => {
      const txQuery = client.query.bind(client);
      // Claim the transfer first: only the caller whose UPDATE returns the row completes it.
      const claimed = await client.query(
        `UPDATE inventory_transfers SET status = 'completed', approved_by = $1, transferred_at = NOW(), updated_at = NOW()
          WHERE id = $2 AND status = 'draft' RETURNING id`,
        [req.user.id, req.params.id]
      );
      if (claimed.rows.length === 0) throw new Error('Transfer already processed');
      // Lock every (warehouse, material) pair up front, in sorted order, so concurrent transfers cannot deadlock.
      await engine.lockPairs(txQuery, items.rows.flatMap((item) => [
        [transfer.rows[0].from_warehouse_id, item.item_id], [transfer.rows[0].to_warehouse_id, item.item_id],
      ]));
      // Pre-flight: usable (available) stock at the source for every item.
      for (const item of items.rows) {
        const balances = await engine.getBalances(txQuery, transfer.rows[0].from_warehouse_id, item.item_id);
        if (balances.available < engine.toNum(item.quantity)) {
          throw new Error(`Insufficient stock for item #${item.item_id}: ${balances.available} available, ${item.quantity} requested`);
        }
      }
      // Paired movements in one transaction: transfer_out + transfer_in.
      for (const item of items.rows) {
        const out = await engine.createMovement(txQuery, {
          warehouse_id: transfer.rows[0].from_warehouse_id,
          material_id: item.item_id,
          movement_type: 'transfer_out',
          quantity: item.quantity,
          reference_type: 'inventory_transfer',
          reference_id: transfer.rows[0].id,
          created_by: req.user.id,
        });
        // The receiving warehouse takes the stock in at the cost it left the source. Lots travel with the stock:
        // each lot part that left arrives as the same lot (number, batch, expiry) in the destination warehouse.
        for (const part of (out.parts || [out])) {
          let lotId = null;
          if (part.lot_id != null) {
            const src = await lots.getLot(txQuery, part.lot_id);
            lotId = (await lots.getOrCreateLot(txQuery, {
              warehouse_id: transfer.rows[0].to_warehouse_id, material_id: item.item_id, lot_number: src.lot_number,
              batch_number: src.batch_number, supplier_id: src.supplier_id, manufactured_date: src.manufactured_date,
              received_date: src.received_date, expiry_date: src.expiry_date ? lots.isoDate(src.expiry_date) : null, created_by: req.user.id,
            })).id;
          }
          await engine.createMovement(txQuery, {
            warehouse_id: transfer.rows[0].to_warehouse_id,
            material_id: item.item_id,
            movement_type: 'transfer_in',
            quantity: part.quantity,
            reference_type: 'inventory_transfer',
            reference_id: transfer.rows[0].id,
            created_by: req.user.id,
            unit_cost: part.unit_cost == null ? null : part.unit_cost,
            lot_id: lotId,
          });
        }
      }
      await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'complete', module: 'inventory', description: `Completed inventory transfer #${req.params.id} as paired stock movements`, entityId: req.params.id, entityType: 'inventory_transfer' }, { query: txQuery });
    });
    res.json({ success: true, message: 'Transfer completed' });
  } catch (e) { return routeFail(res, e, 'WAREHOUSES', req); }
});

// ---------------------------------------------------------------------------
// Reservations — reserved stock subtracts from Available, never from Physical
// ---------------------------------------------------------------------------

// GET /api/warehouses/reservations?material_id=&project_id=&warehouse_id=&status=
router.get('/reservations', authenticate, authorize(), async (req, res) => {
  try {
    let conds = []; const p = []; let i = 1;
    if (req.query.material_id) { conds.push(`sr.material_id = $${i++}`); p.push(parseInt(req.query.material_id, 10)); }
    if (req.query.project_id) { conds.push(`sr.project_id = $${i++}`); p.push(parseInt(req.query.project_id, 10)); }
    if (req.query.warehouse_id) { conds.push(`sr.warehouse_id = $${i++}`); p.push(parseInt(req.query.warehouse_id, 10)); }
    if (req.query.status) { conds.push(`sr.status = $${i++}`); p.push(req.query.status); }
    const rows = await queryPaginated(req, res, query, {
      sql: `SELECT sr.*, im.code AS material_code, im.name_en AS material_name_en, p.name AS project_name
       FROM stock_reservations sr
       LEFT JOIN item_master im ON im.id = sr.material_id
       LEFT JOIN projects p ON p.id = sr.project_id
       ${conds.length ? ' WHERE ' + conds.join(' AND ') : ''}`,
      params: p,
      orderBy: [{ column: 'sr.created_at', direction: 'DESC' }],
    });
    res.json({ success: true, data: rows.rows });
  } catch (e) { return routeFail(res, e, 'WAREHOUSES', req); }
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
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error', error_params: { field: error.details[0].path.join('.') } });
    authorizeProjectPayload(req, value);

    const reservation = await auditedTransaction((q) => engine.createReservation(q, {
      material_id: value.material_id,
      project_id: authorizedProjectId(req, value) || null,
      location_id: value.location_id || null,
      warehouse_id: value.warehouse_id || null,
      quantity: value.quantity,
      expires_at: value.expires_at || null,
      reference_type: value.reference_type || null,
      reference_id: value.reference_id || null,
      created_by: req.user.id,
    }), (result) => ({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'create', module: 'inventory',
      description: `Reserved ${value.quantity} of item #${value.material_id}`,
      entityId: result.id, entityType: 'stock_reservation',
    }));
    res.status(201).json({ success: true, data: reservation });
  } catch (e) { return routeFail(res, e, 'WAREHOUSES', req); }
});

// POST /api/warehouses/reservations/:id/release
router.post('/reservations/:id/release', authenticate, authorize(), async (req, res) => {
  try {
    const reservation = await auditedTransaction((q) => engine.releaseReservation(q, parseInt(req.params.id, 10), {
      status: 'released',
      created_by: req.user.id,
    }), (result) => ({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'update', module: 'inventory',
      description: `Released reservation #${req.params.id}`,
      entityId: result.id, entityType: 'stock_reservation',
    }));
    res.json({ success: true, data: reservation });
  } catch (e) { return routeFail(res, e, 'WAREHOUSES', req); }
});

// ---------------------------------------------------------------------------
// Warehouses — master create/update (B3: C-MASTER-001 / C-INVENTORY-001)
// ---------------------------------------------------------------------------

// Current warehouses schema (migrate-2.2.js base + inventory-migration.js
// warehouse_type + replenishment-migration.js storage_capacity). No code
// column exists, so the numbering service is not needed here.
const WAREHOUSE_BODY = {
  name: Joi.string().trim().max(255).required(),
  name_en: Joi.string().trim().max(255).allow('', null),
  name_ar: Joi.string().trim().max(255).allow('', null),
  warehouse_type: Joi.string().valid(...WAREHOUSE_TYPES).default('project'),
  project_id: Joi.number().integer().allow(null),
  storage_capacity: Joi.number().min(0).allow(null),
};

router.post('/', authenticate, authorize(), async (req, res) => {
  try {
    const { error, value } = Joi.object(WAREHOUSE_BODY).validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error', error_params: { field: error.details[0].path.join('.') } });
    // Project scope through the central check when the body names a project.
    authorizeProjectPayload(req, value);
    // The project id always comes from the authorized helper (lint guard
    // direct-project-id); an omitted project_id means a company-level warehouse.
    const projectId = Object.prototype.hasOwnProperty.call(value, 'project_id') ? authorizedProjectId(req, value) : null;

    const created = await auditedTransaction(
      (q) => q(
        `INSERT INTO warehouses (name, name_en, name_ar, type, warehouse_type, project_id, storage_capacity)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [value.name, value.name_en || value.name, value.name_ar || value.name_en || value.name,
         value.warehouse_type, value.warehouse_type, projectId, value.storage_capacity ?? null]
      ).then((r) => r.rows[0]),
      (result) => ({
        userId: req.user.id, userName: req.user.name, userRole: req.user.role,
        action: 'create', module: 'warehouses',
        description: `Created warehouse ${result.name}`,
        entityId: result.id, entityType: 'warehouse',
      })
    );
    res.status(201).json({ success: true, data: created });
  } catch (e) { return routeFail(res, e, 'WAREHOUSES', req); }
});

router.put('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const { error, value } = Joi.object({
      ...WAREHOUSE_BODY, name: Joi.string().trim().max(255),
      warehouse_type: Joi.string().valid(...WAREHOUSE_TYPES),
    }).min(1).validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error', error_params: { field: error.details[0].path.join('.') } });
    authorizeProjectPayload(req, value);

    const updated = await auditedTransaction(async (q) => {
      const existing = (await q('SELECT * FROM warehouses WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      if (!existing) return null;
      const sets = []; const params = []; let i = 1;
      for (const [k, v] of Object.entries(value)) {
        sets.push(`${k} = $${i++}`);
        params.push(k === 'name_ar' ? (v == null || v === '' ? null : v) : v);
      }
      if (sets.length) {
        params.push(req.params.id);
        return (await q(`UPDATE warehouses SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, params)).rows[0];
      }
      return existing;
    }, (result) => (result ? {
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'update', module: 'warehouses',
      description: `Updated warehouse ${result.name}`,
      entityId: result.id, entityType: 'warehouse',
    } : null));
    if (!updated) return res.status(404).json({ success: false, error: 'Warehouse not found', error_code: 'warehouse_not_found', error_params: {} });
    res.json({ success: true, data: updated });
  } catch (e) { return routeFail(res, e, 'WAREHOUSES', req); }
});

// PUT /api/warehouses/:id/stock/:itemId/reorder-level — the reorder-level setter
// (C-INVENTORY-001): stock is never touched, only the alert threshold.
router.put('/:id/stock/:itemId/reorder-level', authenticate, authorize(), async (req, res) => {
  try {
    const { error, value } = Joi.object({ reorder_level: Joi.number().min(0).required() }).validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error', error_params: { field: error.details[0].path.join('.') } });

    const updated = await auditedTransaction(async (q) => {
      const warehouse = (await q('SELECT id, project_id FROM warehouses WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      if (!warehouse) return null;
      // Record scope: a project-bound warehouse is only reachable for its project's roles.
      if (warehouse.project_id != null && !req.accessScope?.companyWide
          && !(req.accessScope?.projectIds || []).includes(Number(warehouse.project_id))) {
        const denied = new Error('Warehouse belongs to another project');
        denied.status = 403; denied.error_code = 'warehouse_project_scope_denied'; denied.error_params = {};
        throw denied;
      }
      const item = (await q('SELECT id FROM item_master WHERE id = $1', [req.params.itemId])).rows[0];
      if (!item) return null;
      // Upsert: a (warehouse, item) row may not exist until the first movement; the
      // threshold must be settable before any movement creates the projection row.
      return (await q(
        `INSERT INTO warehouse_stock (warehouse_id, item_id, quantity, reorder_level, updated_at)
         VALUES ($1, $2, 0, $3, NOW())
         ON CONFLICT (warehouse_id, item_id)
         DO UPDATE SET reorder_level = $3, updated_at = NOW()
         RETURNING *`,
        [warehouse.id, item.id, value.reorder_level]
      )).rows[0];
    }, (result) => (result ? {
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'update', module: 'inventory',
      description: `Set reorder level ${value.reorder_level} for item #${req.params.itemId} at warehouse #${req.params.id}`,
      entityId: req.params.id, entityType: 'warehouse_stock',
    } : null));
    if (!updated) return res.status(404).json({ success: false, error: 'Warehouse or item not found', error_code: 'warehouse_stock_not_found', error_params: {} });
    res.json({ success: true, data: updated });
  } catch (e) { return routeFail(res, e, 'WAREHOUSES', req); }
});

// Register the catch-all warehouse detail route after named collection routes.
router.get('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const wh = await query('SELECT * FROM warehouses WHERE id = $1', [req.params.id]);
    if (wh.rows.length === 0) return res.status(404).json({ success: false, error: 'Warehouse not found', error_code: 'warehouse_not_found', error_params: {} });

    // Derived projection — physical/reserved/quarantined/available come from
    // the ledger via the engine; the stored columns are never hand-edited.
    const stock = await query(
      `SELECT ws.*, im.code as item_code, im.name_en, im.name_ar, im.unit
       FROM warehouse_stock ws LEFT JOIN item_master im ON ws.item_id = im.id WHERE ws.warehouse_id = $1`,
      [req.params.id]
    );

    res.json({ success: true, data: { ...wh.rows[0], stock: stock.rows } });
  } catch (e) { return routeFail(res, e, 'WAREHOUSES', req); }
});

module.exports = router;
