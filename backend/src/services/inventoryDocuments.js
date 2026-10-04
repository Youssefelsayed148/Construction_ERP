// Phase 5.3 - material issue, return and adjustment as first-class documents (spec 07).
//
// A document is a draft header + lines. Posting runs in the caller's transaction: it creates one
// stock_movements row per line through inventoryEngine (so the per-(warehouse, material) lock, the balance
// gate, the weighted-average valuation and the lot rules all apply unchanged) and stores the movement id on the
// line (UNIQUE). The movement ledger remains the single source of truth; the document is the business record
// that explains it.
//
//   issue       stock leaves for a project / use. A lot-tracked material without a named lot is issued FEFO and
//               the line is split per lot. An issue to a project accrues the project's material cost (the
//               engine does that per movement; the document names the project).
//   return      stock comes back. A return that names the issue line it undoes is capped by what that line
//               issued net of earlier returns, goes back to the same lot, is valued at the ORIGINAL issue cost
//               (not today's average) and reverses its share of the project cost.
//   adjustment  a signed count correction; a reason is mandatory (CHECK in the database as well).
//
// Void: a posted issue or adjustment is undone by reversal movements (append-only) and the issue's project
// cost is reversed; an issue that has returns, and any posted return, cannot be voided (post the opposite
// document instead). A draft is voided without movements.
'use strict';

const engine = require('./inventoryEngine');
const lots = require('./inventoryLots');
const numbering = require('./numbering');
const costAccrual = require('./costAccrual');

class DocError extends Error {
  constructor(status, code, message, params = {}) {
    super(message);
    this.status = status; this.error_code = code; this.error_params = params;
  }
}
const bad = (code, message, params) => new DocError(400, code, message, params);
const conflict = (code, message, params) => new DocError(409, code, message, params);
const missing = (code, message, params) => new DocError(404, code, message, params);

const TYPES = ['issue', 'return', 'adjustment'];
const PREFIX = { issue: 'MI', return: 'MR', adjustment: 'SA' };
const toNum = (v) => (v == null ? 0 : Number(v));
const round3 = (n) => Math.round((toNum(n) + Number.EPSILON) * 1000) / 1000;
const toInt = (v) => (v == null || v === '' ? null : Number(v));

async function requireWarehouse(q, id) {
  const wh = (await q('SELECT id, project_id FROM warehouses WHERE id = $1', [toInt(id)])).rows[0];
  if (!wh) throw missing('warehouse_not_found', `Warehouse #${id} not found`, { warehouse_id: id });
  return wh;
}

function validateLine(docType, line, index) {
  const qty = toNum(line.quantity);
  if (docType === 'adjustment') {
    if (!Number.isFinite(qty) || qty === 0) throw bad('line_quantity_invalid', `Line ${index + 1}: an adjustment quantity must be non-zero (signed)`, { line: index + 1 });
  } else if (!(qty > 0)) {
    throw bad('line_quantity_invalid', `Line ${index + 1}: quantity must be positive`, { line: index + 1 });
  }
  if (toInt(line.material_id) == null) throw bad('line_material_required', `Line ${index + 1}: material_id is required`, { line: index + 1 });
}

async function insertLines(q, documentId, docType, warehouseId, lines) {
  for (const [i, line] of lines.entries()) {
    validateLine(docType, line, i);
    const material = (await q('SELECT id FROM item_master WHERE id = $1', [toInt(line.material_id)])).rows[0];
    if (!material) throw missing('material_not_found', `Line ${i + 1}: material #${line.material_id} not found`, { line: i + 1, material_id: line.material_id });
    if (line.lot_id != null) {
      const lot = await lots.getLot(q, line.lot_id);
      if (Number(lot.warehouse_id) !== Number(warehouseId) || Number(lot.material_id) !== Number(line.material_id)) {
        throw bad('lot_scope_mismatch', `Line ${i + 1}: lot #${line.lot_id} belongs to another warehouse or material`, { line: i + 1, lot_id: line.lot_id });
      }
    }
    let issueLineId = null;
    if (line.issue_line_id != null) {
      if (docType !== 'return') throw bad('issue_line_only_on_returns', `Line ${i + 1}: only a return can reference an issue line`, { line: i + 1 });
      const il = (await q(
        `SELECT l.*, d.doc_type, d.status, d.warehouse_id FROM inventory_document_lines l JOIN inventory_documents d ON d.id = l.document_id WHERE l.id = $1`,
        [toInt(line.issue_line_id)])).rows[0];
      if (!il || il.doc_type !== 'issue' || il.status !== 'posted') {
        throw bad('issue_line_invalid', `Line ${i + 1}: issue line #${line.issue_line_id} is not a posted issue line`, { line: i + 1, issue_line_id: line.issue_line_id });
      }
      if (Number(il.warehouse_id) !== Number(warehouseId) || Number(il.material_id) !== Number(line.material_id)) {
        throw bad('issue_line_mismatch', `Line ${i + 1}: the issue line is for another warehouse or material`, { line: i + 1, issue_line_id: il.id });
      }
      issueLineId = il.id;
    }
    await q(
      `INSERT INTO inventory_document_lines (document_id, material_id, lot_id, quantity, issue_line_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [documentId, toInt(line.material_id), toInt(line.lot_id), toNum(line.quantity), issueLineId, line.notes || null]);
  }
}

async function createDraft(q, { doc_type, warehouse_id, project_id = null, reason = null, notes = null, lines = [], created_by = null }) {
  if (!TYPES.includes(doc_type)) throw bad('doc_type_invalid', `doc_type must be one of ${TYPES.join(', ')}`, { doc_type });
  if (!Array.isArray(lines) || lines.length === 0) throw bad('lines_required', 'A document needs at least one line');
  const wh = await requireWarehouse(q, warehouse_id);
  if (doc_type === 'adjustment' && !String(reason || '').trim()) throw bad('adjustment_reason_required', 'An adjustment needs a reason');
  if (project_id != null) {
    const p = (await q('SELECT id FROM projects WHERE id = $1', [toInt(project_id)])).rows[0];
    if (!p) throw missing('project_not_found', `Project #${project_id} not found`, { project_id });
    if (doc_type === 'issue' && wh.project_id != null && Number(wh.project_id) !== Number(project_id)) {
      // Issuing from another project's warehouse is allowed (the cost moves), but it must be said on purpose:
      // the project of the document is the project the stock is issued TO.
    }
  }
  const docNumber = await numbering.nextNumber(q, { table: 'inventory_documents', column: 'doc_number', prefix: PREFIX[doc_type], pad: 5 });
  const doc = (await q(
    `INSERT INTO inventory_documents (doc_type, doc_number, warehouse_id, project_id, reason, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [doc_type, docNumber, toInt(warehouse_id), toInt(project_id), reason, notes, created_by])).rows[0];
  await insertLines(q, doc.id, doc_type, toInt(warehouse_id), lines);
  return getDocument(q, doc.id);
}

async function getDocument(q, id) {
  const doc = (await q(
    `SELECT d.*, COALESCE(d.project_id, w.project_id) AS scope_project_id, w.name AS warehouse_name
       FROM inventory_documents d JOIN warehouses w ON w.id = d.warehouse_id WHERE d.id = $1`, [toInt(id)])).rows[0];
  if (!doc) throw missing('document_not_found', `Inventory document #${id} not found`, { id });
  const lines = (await q(
    `SELECT l.*, im.code AS material_code, im.name_en AS material_name_en, im.name_ar AS material_name_ar, sl.lot_number
       FROM inventory_document_lines l JOIN item_master im ON im.id = l.material_id LEFT JOIN stock_lots sl ON sl.id = l.lot_id
      WHERE l.document_id = $1 ORDER BY l.id`, [doc.id])).rows;
  return { ...doc, project_id: doc.scope_project_id, document_project_id: doc.project_id, lines };
}

async function listDocuments(q, { doc_type = null, warehouse_id = null, project_id = null, status = null, limit = 100, offset = 0 } = {}) {
  const conds = []; const params = [];
  if (doc_type) conds.push(`d.doc_type = $${params.push(doc_type)}`);
  if (warehouse_id != null) conds.push(`d.warehouse_id = $${params.push(toInt(warehouse_id))}`);
  if (project_id != null) conds.push(`COALESCE(d.project_id, w.project_id) = $${params.push(toInt(project_id))}`);
  if (status) conds.push(`d.status = $${params.push(status)}`);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  params.push(Math.min(toInt(limit) || 100, 500)); params.push(toInt(offset) || 0);
  return (await q(
    `SELECT d.*, COALESCE(d.project_id, w.project_id) AS project_id, d.project_id AS document_project_id, w.name AS warehouse_name,
            (SELECT count(*)::int FROM inventory_document_lines l WHERE l.document_id = d.id) AS line_count
       FROM inventory_documents d JOIN warehouses w ON w.id = d.warehouse_id ${where}
      ORDER BY d.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params)).rows;
}

async function lockDocument(q, id, docType) {
  const doc = (await q('SELECT * FROM inventory_documents WHERE id = $1 FOR UPDATE', [toInt(id)])).rows[0];
  if (!doc || (docType && doc.doc_type !== docType)) throw missing('document_not_found', `Inventory document #${id} not found`, { id });
  return doc;
}

async function updateDraft(q, id, docType, patch) {
  const doc = await lockDocument(q, id, docType);
  if (doc.status !== 'draft') throw conflict('document_not_draft', `Document ${doc.doc_number} is ${doc.status} and can no longer be edited`, { id: doc.id, status: doc.status });
  const reason = patch.reason !== undefined ? patch.reason : doc.reason;
  if (doc.doc_type === 'adjustment' && !String(reason || '').trim()) throw bad('adjustment_reason_required', 'An adjustment needs a reason');
  await q('UPDATE inventory_documents SET reason = $2, notes = COALESCE($3, notes), project_id = $4, updated_at = NOW() WHERE id = $1',
    [doc.id, reason, patch.notes === undefined ? null : patch.notes, patch.project_id !== undefined ? toInt(patch.project_id) : doc.project_id]);
  if (Array.isArray(patch.lines)) {
    if (patch.lines.length === 0) throw bad('lines_required', 'A document needs at least one line');
    await q('DELETE FROM inventory_document_lines WHERE document_id = $1', [doc.id]);
    await insertLines(q, doc.id, doc.doc_type, doc.warehouse_id, patch.lines);
  }
  return getDocument(q, doc.id);
}

// What a posted issue line has not had returned yet.
async function returnableOn(q, issueLineId) {
  const il = (await q('SELECT quantity FROM inventory_document_lines WHERE id = $1', [issueLineId])).rows[0];
  const returned = (await q(
    `SELECT COALESCE(SUM(l.quantity), 0) AS qty FROM inventory_document_lines l
       JOIN inventory_documents d ON d.id = l.document_id
      WHERE l.issue_line_id = $1 AND d.doc_type = 'return' AND d.status = 'posted'`, [issueLineId])).rows[0];
  return round3(toNum(il.quantity) - toNum(returned.qty));
}

// Replace a draft line by one line per movement part (FEFO may split an issue across lots).
async function settleLine(q, line, movement) {
  const parts = movement.parts || [movement];
  const [first, ...rest] = parts;
  await q('UPDATE inventory_document_lines SET quantity = $2, lot_id = $3, unit_cost = $4, movement_id = $5 WHERE id = $1',
    [line.id, toNum(first.quantity), first.lot_id, first.unit_cost, first.id]);
  for (const part of rest) {
    await q(
      `INSERT INTO inventory_document_lines (document_id, material_id, lot_id, quantity, unit_cost, issue_line_id, movement_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [line.document_id, line.material_id, part.lot_id, toNum(part.quantity), part.unit_cost, line.issue_line_id, part.id, line.notes]);
  }
  return parts;
}

async function postDocument(q, id, docType, user = {}) {
  const doc = await lockDocument(q, id, docType);
  if (doc.status !== 'draft') throw conflict('document_not_draft', `Document ${doc.doc_number} is already ${doc.status}`, { id: doc.id, status: doc.status });
  const lines = (await q('SELECT * FROM inventory_document_lines WHERE document_id = $1 ORDER BY id', [doc.id])).rows;
  if (lines.length === 0) throw bad('lines_required', 'A document needs at least one line');
  const ref = { reference_type: 'inventory_document', reference_id: doc.id, created_by: user.id || null };

  for (const line of lines) {
    const qty = toNum(line.quantity);
    if (doc.doc_type === 'issue') {
      const movement = await engine.createMovement(q, {
        ...ref, warehouse_id: doc.warehouse_id, material_id: line.material_id, movement_type: 'issue', quantity: qty, lot_id: line.lot_id,
        notes: doc.reason || `Issue ${doc.doc_number}`,
      });
      await settleLine(q, line, movement);
    } else if (doc.doc_type === 'return') {
      let unitCost = null; let lotId = line.lot_id; let issueMovement = null;
      if (line.issue_line_id != null) {
        const room = await returnableOn(q, line.issue_line_id);
        if (qty > room + 1e-9) {
          throw conflict('return_exceeds_issue', `Line returns ${qty} but only ${room} of the issue line is still out`, { issue_line_id: line.issue_line_id, requested: qty, returnable: room });
        }
        const il = (await q('SELECT * FROM inventory_document_lines WHERE id = $1', [line.issue_line_id])).rows[0];
        unitCost = il.unit_cost; lotId = il.lot_id;
        issueMovement = (await q('SELECT * FROM stock_movements WHERE id = $1', [il.movement_id])).rows[0];
      }
      const movement = await engine.createMovement(q, {
        ...ref, warehouse_id: doc.warehouse_id, material_id: line.material_id, movement_type: 'return', quantity: qty, lot_id: lotId,
        unit_cost: unitCost, notes: doc.reason || `Return ${doc.doc_number}`,
      });
      await settleLine(q, line, movement);
      if (issueMovement) await costAccrual.reverseMaterialIssueCost(q, { returnMovement: movement, issueMovement, quantity: qty });
    } else {
      await postAdjustmentLine(q, doc, line, ref);
    }
  }
  await q("UPDATE inventory_documents SET status = 'posted', posted_by = $2, posted_at = NOW(), updated_at = NOW() WHERE id = $1", [doc.id, user.id || null]);
  return getDocument(q, doc.id);
}

async function postAdjustmentLine(q, doc, line, ref) {
  const qty = toNum(line.quantity);
  const base = { ...ref, warehouse_id: doc.warehouse_id, material_id: line.material_id, movement_type: 'adjustment', notes: doc.reason };
  if (qty > 0) {
    const movement = await engine.createMovement(q, { ...base, quantity: qty, lot_id: line.lot_id });
    await settleLine(q, line, movement);
    return;
  }
  // A negative count correction draws stock down: it needs the stock to be there (pair and lot), and for a
  // lot-tracked material without a named lot it is taken FEFO, expired lots included (it is a write-off).
  const need = round3(-qty);
  await engine.lockPairs(q, [[doc.warehouse_id, line.material_id]]);
  if (line.lot_id == null && (await lots.isLotTracked(q, line.material_id))) {
    const plan = await lots.fefoAllocation(q, { warehouse_id: doc.warehouse_id, material_id: line.material_id, quantity: need, purpose: 'waste' });
    if (plan.shortfall > 0) throw conflict('adjustment_exceeds_stock', `Adjustment takes ${need} but only ${round3(need - plan.shortfall)} is on hand`, { requested: need });
    const made = [];
    for (const part of plan.parts) {
      made.push(await engine.createMovement(q, { ...base, quantity: -part.quantity, lot_id: part.lot_id }));
    }
    await settleLine(q, line, Object.assign({}, made[0], { parts: made.map((m) => ({ ...m, quantity: m.quantity })) }));
    return;
  }
  const balances = await engine.getBalances(q, doc.warehouse_id, line.material_id);
  if (balances.available < need) throw conflict('adjustment_exceeds_stock', `Adjustment takes ${need} but only ${balances.available} is available`, { requested: need, available: balances.available });
  if (line.lot_id != null) {
    const [bal] = await lots.lotBalances(q, { lot_id: line.lot_id, include_empty: true });
    if (bal.available < need) throw conflict('lot_insufficient', `Lot "${bal.lot_number}" has ${bal.available} usable, adjustment takes ${need}`, { lot_id: line.lot_id });
  }
  const movement = await engine.createMovement(q, { ...base, quantity: qty, lot_id: line.lot_id });
  await settleLine(q, line, movement);
}

async function voidDocument(q, id, docType, user = {}, reason) {
  if (!String(reason || '').trim()) throw bad('void_reason_required', 'A void needs a reason');
  const doc = await lockDocument(q, id, docType);
  if (doc.status === 'void') throw conflict('document_already_void', `Document ${doc.doc_number} is already void`, { id: doc.id });
  if (doc.status === 'posted') {
    if (doc.doc_type === 'return') {
      throw conflict('return_cannot_be_voided', 'A posted return cannot be voided: issue the stock again with a new issue document', { id: doc.id });
    }
    if (doc.doc_type === 'issue') {
      const returns = (await q(
        `SELECT count(*)::int AS n FROM inventory_document_lines r JOIN inventory_documents rd ON rd.id = r.document_id
          WHERE rd.status = 'posted' AND r.issue_line_id IN (SELECT id FROM inventory_document_lines WHERE document_id = $1)`, [doc.id])).rows[0].n;
      if (returns > 0) throw conflict('issue_has_returns', `Document ${doc.doc_number} has posted returns and cannot be voided`, { id: doc.id, returns });
    }
    const lines = (await q('SELECT * FROM inventory_document_lines WHERE document_id = $1 AND movement_id IS NOT NULL ORDER BY id DESC', [doc.id])).rows;
    for (const line of lines) {
      const original = (await q('SELECT * FROM stock_movements WHERE id = $1', [line.movement_id])).rows[0];
      const reversal = await engine.reverseMovement(q, line.movement_id, { reason: `Void of ${doc.doc_number}: ${reason}`, created_by: user.id || null });
      if (doc.doc_type === 'issue') await costAccrual.reverseMaterialIssueCost(q, { returnMovement: reversal, issueMovement: original, quantity: toNum(original.quantity), voided: true });
    }
  }
  await q(
    `UPDATE inventory_documents SET status = 'void', voided_by = $2, voided_at = NOW(), void_reason = $3, updated_at = NOW() WHERE id = $1`,
    [doc.id, user.id || null, String(reason).trim()]);
  return getDocument(q, doc.id);
}

module.exports = { DocError, TYPES, createDraft, getDocument, listDocuments, updateDraft, postDocument, voidDocument, returnableOn };
