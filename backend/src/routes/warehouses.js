const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

router.get('/', authenticate, authorize(), async (req, res) => {
  try {
    const { type, project_id } = req.query;
    let conds = []; let p = []; let i = 1;
    if (type) { conds.push(`w.type = $${i++}`); p.push(type); }
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

    const stock = await query(
      `SELECT ws.*, im.code as item_code, im.name_en, im.name_ar, im.unit
       FROM warehouse_stock ws LEFT JOIN item_master im ON ws.item_id = im.id WHERE ws.warehouse_id = $1`,
      [req.params.id]
    );

    res.json({ success: true, data: { ...wh.rows[0], stock: stock.rows } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Stock operations
router.post('/:id/stock', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      item_id: Joi.number().integer().required(), quantity: Joi.number().required(),
      reorder_level: Joi.number().min(0).default(0),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    await query(
      `INSERT INTO warehouse_stock (warehouse_id, item_id, quantity, reorder_level)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (warehouse_id, item_id) DO UPDATE SET quantity = warehouse_stock.quantity + $3, reorder_level = $4`,
      [req.params.id, value.item_id, value.quantity, value.reorder_level]
    );

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'inventory', description: `Stock updated: warehouse #${req.params.id}, item #${value.item_id}, qty ${value.quantity}`, entityId: req.params.id, entityType: 'warehouse' });
    res.json({ success: true, message: 'Stock updated' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Transfers
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
      for (const item of items.rows) {
        const fromStock = await client.query('SELECT quantity FROM warehouse_stock WHERE warehouse_id = $1 AND item_id = $2', [transfer.rows[0].from_warehouse_id, item.item_id]);
        if (fromStock.rows.length === 0 || parseFloat(fromStock.rows[0].quantity) < parseFloat(item.quantity)) {
          throw new Error(`Insufficient stock for item #${item.item_id}`);
        }

        await client.query('UPDATE warehouse_stock SET quantity = quantity - $1 WHERE warehouse_id = $2 AND item_id = $3', [item.quantity, transfer.rows[0].from_warehouse_id, item.item_id]);
        await client.query(
          `INSERT INTO warehouse_stock (warehouse_id, item_id, quantity) VALUES ($1,$2,$3)
           ON CONFLICT (warehouse_id, item_id) DO UPDATE SET quantity = warehouse_stock.quantity + $3`,
          [transfer.rows[0].to_warehouse_id, item.item_id, item.quantity]
        );
      }

      await client.query(
        `UPDATE inventory_transfers SET status = 'completed', approved_by = $1, transferred_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [req.user.id, req.params.id]
      );
    });

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'complete', module: 'inventory', description: `Completed inventory transfer #${req.params.id}`, entityId: req.params.id, entityType: 'inventory_transfer' });
    res.json({ success: true, message: 'Transfer completed' });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

module.exports = router;
