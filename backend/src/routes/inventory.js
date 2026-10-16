// Phase 5.3 (spec 07) - inventory documents, lots and unit conversions. Mounted at /api/inventory (policy module
// "inventory"; the action follows the verb, posting an adjustment needs "approve" and a void needs "void",
// see policy.ACTION_OVERRIDES). Every write is audited; every refusal carries error_code and error_params.
//
//   lots          GET /lots, /lots/expiring, /lots/:id   POST /lots   PUT /lots/:id/status
//   conversions   GET /conversions, /conversions/convert   POST/PUT/DELETE /conversions
//   documents     issues | returns | adjustments:  GET, GET/:id, POST, PUT/:id (draft), POST/:id/post, POST/:id/void
const { authorizeProjectPayload } = require('../services/authorizedProject');
const express = require('express');
const Joi = require('joi');
const { query } = require('../config/database');
const { paginateRows } = require('../utils/pagination');
const { authenticate, authorize } = require('../middleware/auth');
const { auditedTransaction } = require('../utils/auditedTransaction');
const lots = require('../services/inventoryLots');
const docs = require('../services/inventoryDocuments');
const units = require('../services/unitConversions');

const router = express.Router();

function fail(res, e) {
  if (e && e.error_code && e.status) {
    return res.status(e.status).json({ success: false, error: e.message, error_code: e.error_code, error_params: e.error_params || {} });
  }
  if (e && /^Insufficient stock/.test(e.message || '')) {
    return res.status(409).json({ success: false, error: e.message, error_code: 'insufficient_stock', error_params: {} });
  }
  console.error('[INVENTORY]', e);
  return res.status(500).json({ success: false, error: e.message, error_code: 'inventory_error', error_params: {} });
}

function validated(schema, body, res) {
  const { error, value } = schema.validate(body, { abortEarly: true });
  if (error) {
    res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error', error_params: { field: error.details[0].path.join('.') } });
    return null;
  }
  return value;
}

// A project-bound caller may only write in warehouses of its own projects (company-level warehouses need a
// company-wide seat): the body names the warehouse, so the route has to check it.
async function warehouseInScope(req, res, warehouseId) {
  const wh = (await query('SELECT id, project_id FROM warehouses WHERE id = $1', [warehouseId])).rows[0];
  if (!wh) { res.status(404).json({ success: false, error: `Warehouse #${warehouseId} not found`, error_code: 'warehouse_not_found', error_params: { warehouse_id: warehouseId } }); return null; }
  const scope = req.accessScope;
  if (scope && !scope.companyWide) {
    const ids = (scope.projectIds || []).map(Number);
    if (wh.project_id == null || !ids.includes(Number(wh.project_id))) {
      res.status(403).json({ success: false, error: 'Insufficient permissions', error_code: 'warehouse_out_of_scope', error_params: { warehouse_id: wh.id } });
      return null;
    }
  }
  return wh;
}

// A list for a project-bound caller holds only rows of its own projects. Rows of a company-level warehouse (no
// project) are excluded too: reading one by id is refused for such a caller, and a list must not show what the
// record route would deny.
function scopeRows(req, rows) {
  const scope = req.accessScope;
  if (!scope || scope.companyWide) return rows;
  const ids = new Set((scope.projectIds || []).map(Number));
  return rows.filter((r) => r.project_id != null && ids.has(Number(r.project_id)));
}

const auditEvent = (req, description, entityType, entityId, action) => ({
  userId: req.user.id, userName: req.user.name, userRole: req.user.role,
  action: action || (req.method === 'DELETE' ? 'delete' : req.method === 'POST' ? 'create' : 'update'),
  module: 'inventory', description, entityId, entityType,
});

// --- lots ----------------------------------------------------------------------------------------
router.get('/lots/expiring', authenticate, authorize(), async (req, res) => {
  try {
    const withinDays = Math.min(Math.max(parseInt(req.query.within_days, 10) || 30, 0), 3650);
    const rows = await lots.expiringLots((t, p) => query(t, p), {
      withinDays, warehouse_id: req.query.warehouse_id, material_id: req.query.material_id,
    });
    const wh = (await query('SELECT id, project_id FROM warehouses')).rows;
    const projectOf = new Map(wh.map((w) => [w.id, w.project_id]));
    const scoped = scopeRows(req, rows.map((r) => ({ ...r, project_id: projectOf.get(r.warehouse_id) ?? null })));
    res.json({ success: true, data: paginateRows(req, res, scoped, { orderBy: [{ column: 'expiry_date' }, { column: 'lot_id' }], tieBreaker: 'lot_id' }).rows, within_days: withinDays });
  } catch (e) { return fail(res, e); }
});

router.get('/lots', authenticate, authorize(), async (req, res) => {
  try {
    const rows = await lots.lotBalances((t, p) => query(t, p), {
      warehouse_id: req.query.warehouse_id, material_id: req.query.material_id, status: req.query.status || null,
      include_empty: req.query.include_empty === 'true',
    });
    const wh = (await query('SELECT id, project_id FROM warehouses')).rows;
    const projectOf = new Map(wh.map((w) => [w.id, w.project_id]));
    const scoped = scopeRows(req, rows.map((r) => ({ ...r, project_id: projectOf.get(r.warehouse_id) ?? null })));
    res.json({ success: true, data: paginateRows(req, res, scoped, { orderBy: [{ column: 'lot_id' }], tieBreaker: 'lot_id' }).rows });
  } catch (e) { return fail(res, e); }
});

router.get('/lots/:id', authenticate, authorize(), async (req, res) => {
  try {
    const lot = await lots.getLot(query, req.params.id);
    const [balance] = await lots.lotBalances((t, p) => query(t, p), { lot_id: lot.id, include_empty: true });
    const wh = (await query('SELECT project_id FROM warehouses WHERE id = $1', [lot.warehouse_id])).rows[0];
    res.json({ success: true, data: { ...lot, ...balance, project_id: wh ? wh.project_id : null } });
  } catch (e) { return fail(res, e); }
});

router.post('/lots', authenticate, authorize(), async (req, res) => {
  try {
    const value = validated(Joi.object({
      warehouse_id: Joi.number().integer().required(), material_id: Joi.number().integer().required(),
      lot_number: Joi.string().max(100).required(), batch_number: Joi.string().max(100).allow('', null),
      supplier_id: Joi.number().integer().allow(null), manufactured_date: Joi.date().iso().allow(null),
      received_date: Joi.date().iso().allow(null), expiry_date: Joi.date().iso().allow(null), notes: Joi.string().allow('', null),
    }), req.body, res);
    if (!value) return;
    if (!(await warehouseInScope(req, res, value.warehouse_id))) return;
    const lot = await auditedTransaction(q => lots.createLot(q, { ...value, created_by: req.user.id }),
      row => auditEvent(req, `Created lot ${row.lot_number}`, 'stock_lot', row.id));
    res.status(201).json({ success: true, data: lot });
  } catch (e) { return fail(res, e); }
});

router.put('/lots/:id/status', authenticate, authorize(), async (req, res) => {
  try {
    const value = validated(Joi.object({ status: Joi.string().required() }), req.body, res);
    if (!value) return;
    const lot = await auditedTransaction(q => lots.setLotStatus(q, req.params.id, value.status),
      row => auditEvent(req, `Lot ${row.lot_number} set to ${row.status}`, 'stock_lot', row.id, 'update'));
    res.json({ success: true, data: lot });
  } catch (e) { return fail(res, e); }
});

// --- unit conversions ------------------------------------------------------------------------------
router.get('/conversions/convert', authenticate, authorize(), async (req, res) => {
  try {
    const value = validated(Joi.object({
      material_id: Joi.number().integer().allow(null, ''), quantity: Joi.number().required(), from: Joi.string().required(), to: Joi.string().required(),
    }), req.query, res);
    if (!value) return;
    const result = await units.convert(query, value.material_id === '' ? null : value.material_id, value.quantity, value.from, value.to);
    res.json({ success: true, data: { quantity: value.quantity, from: value.from, to: value.to, result } });
  } catch (e) { return fail(res, e); }
});

router.get('/conversions', authenticate, authorize(), async (req, res) => {
  try { res.json({ success: true, data: await units.list(query, { material_id: req.query.material_id || null }) }); } catch (e) { return fail(res, e); }
});

const conversionBody = {
  material_id: Joi.number().integer().allow(null), from_unit: Joi.string().max(50), to_unit: Joi.string().max(50),
  factor: Joi.number().positive(), notes: Joi.string().allow('', null),
};

router.post('/conversions', authenticate, authorize(), async (req, res) => {
  try {
    const value = validated(Joi.object({ ...conversionBody, from_unit: conversionBody.from_unit.required(), to_unit: conversionBody.to_unit.required(), factor: conversionBody.factor.required() }), req.body, res);
    if (!value) return;
    const row = await auditedTransaction(q => units.create(q, value, req.user.id),
      saved => auditEvent(req, `Unit conversion ${saved.from_unit} -> ${saved.to_unit} x${saved.factor}`, 'unit_conversion', saved.id));
    res.status(201).json({ success: true, data: row });
  } catch (e) { return fail(res, e); }
});

router.put('/conversions/:id', authenticate, authorize(), async (req, res) => {
  try {
    const value = validated(Joi.object(conversionBody).min(1), req.body, res);
    if (!value) return;
    const row = await auditedTransaction(q => units.update(q, req.params.id, value),
      saved => auditEvent(req, `Unit conversion #${saved.id} updated`, 'unit_conversion', saved.id));
    res.json({ success: true, data: row });
  } catch (e) { return fail(res, e); }
});

router.delete('/conversions/:id', authenticate, authorize(), async (req, res) => {
  try {
    const row = await auditedTransaction(q => units.remove(q, req.params.id),
      saved => auditEvent(req, `Unit conversion #${saved.id} removed`, 'unit_conversion', saved.id));
    res.json({ success: true, data: row });
  } catch (e) { return fail(res, e); }
});

// --- documents: issues, returns, adjustments ----------------------------------------------------
const lineSchema = Joi.object({
  material_id: Joi.number().integer().required(), quantity: Joi.number().required(), lot_id: Joi.number().integer().allow(null),
  issue_line_id: Joi.number().integer().allow(null), notes: Joi.string().allow('', null),
});

function documentRoutes(plural, docType) {
  router.get(`/${plural}`, authenticate, authorize(), async (req, res) => {
    try {
      res.json({ success: true, data: scopeRows(req, await docs.listDocuments(query, { ...req.query, doc_type: docType })) });
    } catch (e) { return fail(res, e); }
  });

  router.get(`/${plural}/:id`, authenticate, authorize(), async (req, res) => {
    try {
      const doc = await docs.getDocument(query, req.params.id);
      if (doc.doc_type !== docType) return res.status(404).json({ success: false, error: 'Document not found', error_code: 'document_not_found', error_params: { id: req.params.id } });
      res.json({ success: true, data: doc });
    } catch (e) { return fail(res, e); }
  });

  router.post(`/${plural}`, authenticate, authorize(), async (req, res) => {
    try {
      const value = validated(Joi.object({
        warehouse_id: Joi.number().integer().required(), project_id: Joi.number().integer().allow(null),
        reason: Joi.string().allow('', null), notes: Joi.string().allow('', null), lines: Joi.array().items(lineSchema).min(1).required(),
      }), req.body, res);
      if (!value) return;
      authorizeProjectPayload(req, value);
      if (!(await warehouseInScope(req, res, value.warehouse_id))) return;
      const doc = await auditedTransaction(q => docs.createDraft(q, { ...value, doc_type: docType, created_by: req.user.id }),
        row => auditEvent(req, `Created ${docType} document ${row.doc_number}`, 'inventory_document', row.id));
      res.status(201).json({ success: true, data: doc });
    } catch (e) { return fail(res, e); }
  });

  router.put(`/${plural}/:id`, authenticate, authorize(), async (req, res) => {
    try {
      const value = validated(Joi.object({
        project_id: Joi.number().integer().allow(null), reason: Joi.string().allow('', null), notes: Joi.string().allow('', null),
        lines: Joi.array().items(lineSchema).min(1),
      }).min(1), req.body, res);
      if (!value) return;
      authorizeProjectPayload(req, value);
      const doc = await auditedTransaction(q => docs.updateDraft(q, req.params.id, docType, value),
        row => auditEvent(req, `Updated ${docType} document ${row.doc_number}`, 'inventory_document', row.id));
      res.json({ success: true, data: doc });
    } catch (e) { return fail(res, e); }
  });

  router.post(`/${plural}/:id/post`, authenticate, authorize(), async (req, res) => {
    try {
      const doc = await auditedTransaction(q => docs.postDocument(q, req.params.id, docType, req.user),
        row => auditEvent(req, `Posted ${docType} document ${row.doc_number}`, 'inventory_document', row.id, 'post'));
      res.json({ success: true, data: doc });
    } catch (e) { return fail(res, e); }
  });

  router.post(`/${plural}/:id/void`, authenticate, authorize(), async (req, res) => {
    try {
      const value = validated(Joi.object({ reason: Joi.string().required() }), req.body, res);
      if (!value) return;
      const doc = await auditedTransaction(q => docs.voidDocument(q, req.params.id, docType, req.user, value.reason),
        row => auditEvent(req, `Voided ${docType} document ${row.doc_number}: ${value.reason}`, 'inventory_document', row.id, 'void'));
      res.json({ success: true, data: doc });
    } catch (e) { return fail(res, e); }
  });
}

documentRoutes('issues', 'issue');
documentRoutes('returns', 'return');
documentRoutes('adjustments', 'adjustment');

module.exports = router;
