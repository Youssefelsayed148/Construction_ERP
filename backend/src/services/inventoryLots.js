// Phase 5.3 - lots, batches and expiry (spec 07).
//
// A lot lives in one warehouse for one material. Its balance is DERIVED from the ledger (the
// stock_lot_balances view: stock_movements rows that carry the lot, with the engine's signs), never
// stored. The movement ledger stays the single source of truth and the per-(warehouse, material) advisory
// lock in inventoryEngine still serialises every write; everything here runs inside that lock.
//
// FEFO (first expired, first out): an issue of a lot-tracked material that names no lot is split across
// the usable lots, earliest expiry first (no expiry last, then oldest received), then the unlotted stock
// (what existed before lots). Issues and transfers skip expired and blocked lots; disposal movements
// (waste, damage, supplier return) may take from any lot, so expired stock can be written off.
'use strict';

class LotError extends Error {
  constructor(status, code, message, params = {}) {
    super(message);
    this.status = status; this.error_code = code; this.error_params = params;
  }
}

const toNum = (v) => (v == null ? 0 : Number(v));
const round3 = (n) => Math.round((toNum(n) + Number.EPSILON) * 1000) / 1000;
const pad2 = (n) => String(n).padStart(2, '0');
// pg returns DATE columns as a Date at LOCAL midnight: read them with the local getters (toISOString would
// shift the day in any timezone east of UTC).
const isoDate = (v) => {
  if (v == null) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`;
  return String(v).slice(0, 10);
};
const todayIso = () => isoDate(new Date());

// Outbound types that must not draw on expired or blocked lots.
const STRICT_OUTBOUND = ['issue', 'transfer_out'];

async function isLotTracked(q, materialId) {
  const row = (await q('SELECT batch_lot_tracking FROM item_master WHERE id = $1', [materialId])).rows[0];
  return Boolean(row && row.batch_lot_tracking);
}

async function getLot(q, lotId) {
  const lot = (await q('SELECT * FROM stock_lots WHERE id = $1', [Number(lotId)])).rows[0];
  if (!lot) throw new LotError(404, 'lot_not_found', `Lot #${lotId} not found`, { lot_id: lotId });
  return lot;
}

async function createLot(q, spec) {
  const {
    warehouse_id, material_id, lot_number, batch_number = null, supplier_id = null, manufactured_date = null,
    received_date = null, expiry_date = null, notes = null, created_by = null,
  } = spec;
  if (!String(lot_number || '').trim()) throw new LotError(400, 'lot_number_required', 'lot_number is required');
  const wh = (await q('SELECT id FROM warehouses WHERE id = $1', [warehouse_id])).rows[0];
  if (!wh) throw new LotError(404, 'warehouse_not_found', `Warehouse #${warehouse_id} not found`, { warehouse_id });
  const item = (await q('SELECT id FROM item_master WHERE id = $1', [material_id])).rows[0];
  if (!item) throw new LotError(404, 'material_not_found', `Material #${material_id} not found`, { material_id });
  if (expiry_date && manufactured_date && String(expiry_date) < String(manufactured_date)) {
    throw new LotError(400, 'lot_dates_inverted', 'expiry_date is before manufactured_date', { expiry_date, manufactured_date });
  }
  const dup = (await q('SELECT id FROM stock_lots WHERE warehouse_id = $1 AND material_id = $2 AND lot_number = $3',
    [warehouse_id, material_id, String(lot_number).trim()])).rows[0];
  if (dup) throw new LotError(409, 'lot_exists', `Lot "${lot_number}" already exists for this warehouse and material`, { lot_id: dup.id, lot_number });
  const status = expiry_date && String(expiry_date) < todayIso() ? 'expired' : 'active';
  return (await q(
    `INSERT INTO stock_lots (warehouse_id, material_id, lot_number, batch_number, supplier_id, manufactured_date,
                             received_date, expiry_date, status, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, CURRENT_DATE), $8, $9, $10, $11) RETURNING *`,
    [warehouse_id, material_id, String(lot_number).trim(), batch_number, supplier_id, manufactured_date, received_date,
      expiry_date, status, notes, created_by])).rows[0];
}

// Receipts into a lot that already exists add to it; a conflicting expiry date is refused (one lot, one expiry).
async function getOrCreateLot(q, spec) {
  const existing = (await q('SELECT * FROM stock_lots WHERE warehouse_id = $1 AND material_id = $2 AND lot_number = $3',
    [spec.warehouse_id, spec.material_id, String(spec.lot_number || '').trim()])).rows[0];
  if (!existing) return createLot(q, spec);
  const had = isoDate(existing.expiry_date);
  const want = spec.expiry_date ? String(spec.expiry_date).slice(0, 10) : null;
  if (want && had && want !== had) {
    throw new LotError(409, 'lot_expiry_conflict', `Lot "${spec.lot_number}" already expires on ${had}, not ${want}`, { lot_id: existing.id, had, want });
  }
  return existing;
}

// Lot balances (derived). filters: warehouse_id, material_id, lot_id, status, include_empty.
async function lotBalances(q, { warehouse_id = null, material_id = null, lot_id = null, status = null, include_empty = false } = {}) {
  const conds = []; const params = [];
  if (warehouse_id != null) conds.push(`warehouse_id = $${params.push(Number(warehouse_id))}`);
  if (material_id != null) conds.push(`material_id = $${params.push(Number(material_id))}`);
  if (lot_id != null) conds.push(`lot_id = $${params.push(Number(lot_id))}`);
  if (status) conds.push(`status = $${params.push(status)}`);
  if (!include_empty) conds.push('(physical <> 0 OR quarantined <> 0)');
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = (await q(`SELECT * FROM stock_lot_balances ${where} ORDER BY expiry_date NULLS LAST, received_date, lot_id`, params)).rows;
  return rows.map((r) => ({ ...r, physical: round3(r.physical), quarantined: round3(r.quarantined), available: round3(toNum(r.physical) - toNum(r.quarantined)) }));
}

// Stock that carries no lot (everything that existed before lots, and untracked receipts).
async function unlottedBalance(q, warehouseId, materialId) {
  const r = (await q(
    `SELECT COALESCE(SUM(CASE movement_type
         WHEN 'opening' THEN quantity WHEN 'grn' THEN quantity WHEN 'quarantine' THEN quantity WHEN 'return' THEN quantity
         WHEN 'transfer_in' THEN quantity WHEN 'adjustment' THEN quantity WHEN 'reversal' THEN quantity
         WHEN 'issue' THEN -quantity WHEN 'transfer_out' THEN -quantity WHEN 'waste' THEN -quantity
         WHEN 'damage' THEN -quantity WHEN 'supplier_return' THEN -quantity WHEN 'quarantine_reject' THEN -quantity
         ELSE 0 END), 0) AS physical,
       COALESCE(SUM(CASE movement_type
         WHEN 'quarantine' THEN quantity WHEN 'quarantine_restore' THEN quantity
         WHEN 'quarantine_release' THEN -quantity WHEN 'quarantine_reject' THEN -quantity ELSE 0 END), 0) AS quarantined
       FROM stock_movements WHERE warehouse_id = $1 AND material_id = $2 AND lot_id IS NULL`, [warehouseId, materialId])).rows[0];
  return round3(toNum(r.physical) - toNum(r.quarantined));
}

// Plan an outbound quantity over lots, FEFO. Returns { parts: [{ lot_id, lot_number, quantity }], shortfall }.
// lot_id null in a part = the unlotted stock. `purpose` is the movement type (strict types skip expired/blocked).
async function fefoAllocation(q, { warehouse_id, material_id, quantity, purpose = 'issue', today = todayIso() }) {
  let remaining = round3(quantity);
  const strict = STRICT_OUTBOUND.includes(purpose);
  const lots = await lotBalances(q, { warehouse_id, material_id });
  const parts = [];
  for (const lot of lots) {
    if (remaining <= 0) break;
    const expired = lot.expiry_date && isoDate(lot.expiry_date) < today;
    if (strict && (lot.status !== 'active' || expired)) continue;
    if (lot.available <= 0) continue;
    const take = round3(Math.min(lot.available, remaining));
    parts.push({ lot_id: lot.lot_id, lot_number: lot.lot_number, quantity: take });
    remaining = round3(remaining - take);
  }
  if (remaining > 0) {
    const loose = await unlottedBalance(q, warehouse_id, material_id);
    if (loose > 0) {
      const take = round3(Math.min(loose, remaining));
      parts.push({ lot_id: null, lot_number: null, quantity: take });
      remaining = round3(remaining - take);
    }
  }
  return { parts, shortfall: remaining };
}

// The checks for a movement that names a lot. Returns the lot. (Called under the pair lock.)
async function assertLotUsable(q, lotId, { warehouse_id, material_id, movement_type, quantity }) {
  const lot = await getLot(q, lotId);
  if (Number(lot.warehouse_id) !== Number(warehouse_id) || Number(lot.material_id) !== Number(material_id)) {
    throw new LotError(400, 'lot_scope_mismatch', `Lot #${lotId} belongs to another warehouse or material`, { lot_id: lotId });
  }
  if (STRICT_OUTBOUND.includes(movement_type)) {
    const expired = lot.expiry_date && isoDate(lot.expiry_date) < todayIso();
    if (lot.status === 'blocked') throw new LotError(409, 'lot_blocked', `Lot "${lot.lot_number}" is blocked`, { lot_id: lot.id });
    if (lot.status === 'expired' || expired) throw new LotError(409, 'lot_expired', `Lot "${lot.lot_number}" expired on ${isoDate(lot.expiry_date)}`, { lot_id: lot.id });
  }
  const outbound = ['issue', 'transfer_out', 'waste', 'damage', 'supplier_return'].includes(movement_type);
  if (outbound) {
    const [bal] = await lotBalances(q, { lot_id: lotId, include_empty: true });
    if (bal.available < toNum(quantity)) {
      throw new LotError(409, 'lot_insufficient', `Lot "${lot.lot_number}" has ${bal.available} usable, ${quantity} requested`,
        { lot_id: lot.id, available: bal.available, requested: toNum(quantity) });
    }
  }
  return lot;
}

// Idempotent: lots whose expiry date has passed become 'expired' (blocked lots stay blocked).
async function markExpired(q, today = todayIso()) {
  const r = await q(
    `UPDATE stock_lots SET status = 'expired', updated_at = NOW()
      WHERE status = 'active' AND expiry_date IS NOT NULL AND expiry_date < $1 RETURNING id`, [today]);
  return r.rows.length;
}

// Lots that still hold stock and expire within `withinDays` (or already expired).
async function expiringLots(q, { withinDays = 30, today = todayIso(), warehouse_id = null, material_id = null } = {}) {
  const lots = await lotBalances(q, { warehouse_id, material_id });
  const limit = new Date(`${today}T00:00:00Z`).getTime() + withinDays * 86400000;
  return lots.filter((l) => {
    if (!l.expiry_date || l.physical <= 0) return false;
    const t = new Date(`${isoDate(l.expiry_date)}T00:00:00Z`).getTime();
    return t <= limit;
  }).map((l) => {
    const iso = isoDate(l.expiry_date);
    return { ...l, days_to_expiry: Math.round((new Date(`${iso}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000) };
  });
}

async function setLotStatus(q, lotId, status) {
  if (!['active', 'blocked'].includes(status)) throw new LotError(400, 'lot_status_invalid', 'status must be active or blocked (expired is derived from the expiry date)', { status });
  const lot = await getLot(q, lotId);
  const expired = lot.expiry_date && isoDate(lot.expiry_date) < todayIso();
  const next = status === 'active' && expired ? 'expired' : status;
  return (await q('UPDATE stock_lots SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *', [lot.id, next])).rows[0];
}

module.exports = {
  isoDate, LotError, STRICT_OUTBOUND, isLotTracked, getLot, createLot, getOrCreateLot, lotBalances, unlottedBalance,
  fefoAllocation, assertLotUsable, markExpired, expiringLots, setLotStatus,
};
