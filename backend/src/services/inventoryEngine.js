// Phase 10 — inventory engine: ledgered stock, derived projection.
//
// Single source of truth: stock_movements rows. warehouse_stock is a DERIVED
// projection (sum of signed movement contributions per warehouse+material),
// rewritten only by this engine — the same pattern as Phase 8's quantity
// engine. No API path mutates the projection directly.
//
// Formulas (implemented exactly, nothing invented):
//   Physical Stock  = Opening + Receipts + Returns + Transfers In
//                     − Issues − Transfers Out − Waste/Writeoff
//   Reserved Stock  = Σ active reservations (unexpired)
//   Available Stock = Physical Stock − Reserved − Quarantined
//
// Quarantine (the MIR gate, Phase 12 consumes this): a delivery recorded
// without an accepted MIR enters as a 'quarantine' movement — it counts
// toward the quarantined bucket only, never Available Stock. An accepted MIR
// posts 'quarantine_release' (quarantined → physical); a rejected MIR posts
// 'quarantine_reject' (material leaves the ledger bucket untouched — it was
// never usable stock).
//
// Movement ledger is append-only: corrections are 'reversal'/'adjustment'
// movements referencing the original row (reverseMovement), never edits.

'use strict';

function toNum(v) {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function round3(n) {
  return Math.round((toNum(n) + Number.EPSILON) * 1000) / 1000;
}

// Signed contribution of one movement to Physical Stock. Quarantined
// material IS physically present (a receipt), so 'quarantine' counts toward
// Physical while Available subtracts the Quarantined bucket;
// quarantine_reject writes the material off.
const PHYSICAL_SIGNS = {
  opening: 1,
  grn: 1,
  quarantine: 1,
  quarantine_release: 0,
  quarantine_reject: -1,
  return: 1,
  transfer_in: 1,
  adjustment: 1, // signed quantity carries the direction
  reversal: 1,   // signed quantity carries the direction
  issue: -1,
  transfer_out: -1,
  waste: -1,
  damage: -1,
  supplier_return: -1,
};

// Signed contribution to the Quarantined bucket.
const QUARANTINE_SIGNS = {
  quarantine: 1,
  quarantine_release: -1,
  quarantine_reject: -1,
};

const MOVEMENT_TYPES = Object.keys(PHYSICAL_SIGNS);
// Types that must be paired/derived (transfer API) or MIR-gated.
const PAIRED_TYPES = ['transfer_out', 'transfer_in', 'quarantine_release', 'quarantine_reject'];
// Types that draw down usable (available) stock and need a balance check.
const OUTBOUND_TYPES = ['issue', 'transfer_out', 'waste', 'damage', 'supplier_return'];

// ---------------------------------------------------------------------------
// Formulas (pure)
// ---------------------------------------------------------------------------

function physicalStock({ opening = 0, receipts = 0, returns = 0, transfersIn = 0, issues = 0, transfersOut = 0, writeoff = 0 } = {}) {
  return round3(toNum(opening) + toNum(receipts) + toNum(returns) + toNum(transfersIn)
    - toNum(issues) - toNum(transfersOut) - toNum(writeoff));
}

// Σ active, unexpired reservations.
function reservedStock(reservations, now = new Date()) {
  let sum = 0;
  for (const r of reservations || []) {
    if (r.status !== 'active') continue;
    if (r.expires_at != null && new Date(r.expires_at) <= now) continue;
    sum += toNum(r.quantity);
  }
  return round3(sum);
}

function availableStock(physical, reserved, quarantined) {
  return round3(toNum(physical) - toNum(reserved) - toNum(quarantined));
}

// Aggregate raw movement rows into { physical, quarantined } per row.
function aggregateMovements(movements) {
  let physical = 0;
  let quarantined = 0;
  for (const m of movements || []) {
    const sign = PHYSICAL_SIGNS[m.movement_type];
    if (sign === undefined) throw new Error(`Unknown movement_type: ${m.movement_type}`);
    physical += sign * toNum(m.quantity);
    const qSign = QUARANTINE_SIGNS[m.movement_type] || 0;
    quarantined += qSign * toNum(m.quantity);
  }
  return { physical: round3(physical), quarantined: round3(quarantined) };
}

// ---------------------------------------------------------------------------
// Projection rebuild — warehouse_stock rows rewritten FROM the ledger
// ---------------------------------------------------------------------------

function whereClause(conds) {
  return conds.length ? ' WHERE ' + conds.join(' AND ') : '';
}

async function rebuildWarehouseStock(q, { warehouseId, materialId } = {}) {
  // 1. Ledger slice.
  const conds = [];
  const p = [];
  let i = 1;
  if (warehouseId != null) { conds.push(`warehouse_id = $${i++}`); p.push(warehouseId); }
  if (materialId != null) { conds.push(`material_id = $${i++}`); p.push(materialId); }
  const movements = (await q(`SELECT * FROM stock_movements${whereClause(conds)}`, p)).rows;

  // 2. Active reservations keyed by (warehouse, material) — only
  //    warehouse-scoped reservations subtract from a warehouse's Available.
  const reservations = (await q("SELECT * FROM stock_reservations WHERE status = 'active'")).rows;
  const reservedByKey = new Map();
  for (const r of reservations) {
    if (r.warehouse_id == null) continue; // planning-level reservation, not warehouse stock
    if (warehouseId != null && r.warehouse_id !== warehouseId) continue;
    if (materialId != null && r.material_id !== materialId) continue;
    const key = `${r.warehouse_id}:${r.material_id}`;
    reservedByKey.set(key, round3((reservedByKey.get(key) || 0) + toNum(r.quantity)));
  }

  // 3. Aggregate the ledger.
  const balances = new Map();
  for (const m of movements) {
    const key = `${m.warehouse_id}:${m.material_id}`;
    if (!balances.has(key)) balances.set(key, { warehouse_id: m.warehouse_id, material_id: m.material_id, physical: 0, quarantined: 0 });
    const b = balances.get(key);
    b.physical += (PHYSICAL_SIGNS[m.movement_type] || 0) * toNum(m.quantity);
    b.quarantined += (QUARANTINE_SIGNS[m.movement_type] || 0) * toNum(m.quantity);
  }
  for (const [key, reserved] of reservedByKey.entries()) {
    if (!balances.has(key)) {
      const [w, m] = key.split(':').map((x) => parseInt(x, 10));
      balances.set(key, { warehouse_id: w, material_id: m, physical: 0, quarantined: 0 });
    }
  }

  // 4. Upsert projection rows (UPDATE when the row exists, INSERT otherwise —
  //    no ON CONFLICT DO UPDATE so the mock executor stays portable).
  let written = 0;
  const now = new Date();
  for (const b of balances.values()) {
    const physical = round3(b.physical);
    const quarantined = round3(b.quarantined);
    const reserved = reservedByKey.get(`${b.warehouse_id}:${b.material_id}`) || 0;
    const available = availableStock(physical, reserved, quarantined);
    const existing = (await q(
      'SELECT id FROM warehouse_stock WHERE warehouse_id = $1 AND item_id = $2',
      [b.warehouse_id, b.material_id]
    )).rows[0];
    if (existing) {
      await q(
        `UPDATE warehouse_stock
         SET quantity = $1, reserved_quantity = $2, quarantined_quantity = $3,
             available_quantity = $4, updated_at = $5
         WHERE id = $6`,
        [physical, reserved, quarantined, available, now, existing.id]
      );
    } else {
      await q(
        `INSERT INTO warehouse_stock
           (warehouse_id, item_id, quantity, reserved_quantity, quarantined_quantity, available_quantity, reorder_level, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 0, $7)`,
        [b.warehouse_id, b.material_id, physical, reserved, quarantined, available, now]
      );
    }
    written++;
  }
  return written;
}

// Current balances for one warehouse+material, computed live from the ledger
// (never trusts the projection).
async function getBalances(q, warehouseId, materialId) {
  const movements = (await q(
    'SELECT * FROM stock_movements WHERE warehouse_id = $1 AND material_id = $2',
    [warehouseId, materialId]
  )).rows;
  const { physical, quarantined } = aggregateMovements(movements);
  const reservations = (await q(
    "SELECT * FROM stock_reservations WHERE warehouse_id = $1 AND material_id = $2 AND status = 'active'",
    [warehouseId, materialId]
  )).rows;
  const reserved = reservedStock(reservations);
  return {
    physical,
    quarantined,
    reserved,
    available: availableStock(physical, reserved, quarantined),
  };
}

// ---------------------------------------------------------------------------
// Ledger writes
// ---------------------------------------------------------------------------

// Append one movement + rebuild the affected projection row. The only way
// stock moves. Adjustment/reversal carry signed quantities; every other type
// is strictly positive. Outbound types are gated on available stock.
async function createMovement(q, {
  warehouse_id, material_id, movement_type, quantity,
  reference_type = null, reference_id = null, notes = null, created_by = null,
}) {
  if (!MOVEMENT_TYPES.includes(movement_type)) {
    throw new Error(`Invalid movement_type: ${movement_type}`);
  }
  const qty = toNum(quantity);
  if (qty === 0 && !['adjustment', 'reversal'].includes(movement_type)) {
    throw new Error('quantity must be non-zero');
  }
  if (qty < 0 && !['adjustment', 'reversal'].includes(movement_type)) {
    throw new Error(`${movement_type} quantity must be positive — direction is encoded by the movement type`);
  }

  // Balance gate: outbound movements draw down available stock; the MIR
  // bucket movements (release/reject) draw down the quarantined bucket.
  // transfer_in / quarantine are receipts — never gated.
  if (OUTBOUND_TYPES.includes(movement_type) || movement_type === 'quarantine_release' || movement_type === 'quarantine_reject') {
    const balances = await getBalances(q, warehouse_id, material_id);
    const fromQuarantine = movement_type === 'quarantine_release' || movement_type === 'quarantine_reject';
    const usable = fromQuarantine ? balances.quarantined : balances.available;
    if (usable < qty) {
      throw new Error(`Insufficient stock: ${usable} usable (${fromQuarantine ? 'quarantined' : 'available'}), ${qty} requested`);
    }
  }

  const r = await q(
    `INSERT INTO stock_movements
       (warehouse_id, material_id, movement_type, quantity, reference_type, reference_id, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [warehouse_id, material_id, movement_type, qty, reference_type, reference_id, notes || null, created_by]
  );
  const movement = r.rows[0];
  await rebuildWarehouseStock(q, { warehouseId: warehouse_id, materialId: material_id });
  return movement;
}

// Append-only corrections: reverseMovement posts a signed 'reversal' (or a
// 'quarantine_reject' for quarantined receipts) referencing the original.
// The original row is never touched.
async function reverseMovement(q, movementId, { reason = null, created_by = null } = {}) {
  const original = (await q('SELECT * FROM stock_movements WHERE id = $1', [movementId])).rows[0];
  if (!original) throw new Error(`Stock movement #${movementId} not found`);
  if (original.movement_type === 'reversal') {
    throw new Error('Cannot reverse a reversal — post a new adjustment movement instead');
  }
  if (original.movement_type === 'quarantine') {
    return createMovement(q, {
      warehouse_id: original.warehouse_id,
      material_id: original.material_id,
      movement_type: 'quarantine_reject',
      quantity: toNum(original.quantity),
      reference_type: 'stock_movement',
      reference_id: original.id,
      notes: reason || `Reversal of movement #${original.id}`,
      created_by,
    });
  }
  if (original.movement_type === 'quarantine_release' || original.movement_type === 'quarantine_reject') {
    // Undo a MIR decision: the material goes back into quarantine.
    return createMovement(q, {
      warehouse_id: original.warehouse_id,
      material_id: original.material_id,
      movement_type: 'quarantine',
      quantity: toNum(original.quantity),
      reference_type: 'stock_movement',
      reference_id: original.id,
      notes: reason || `Reversal of movement #${original.id}`,
      created_by,
    });
  }
  return createMovement(q, {
    warehouse_id: original.warehouse_id,
    material_id: original.material_id,
    movement_type: 'reversal',
    quantity: -1 * toNum(original.quantity) * PHYSICAL_SIGNS[original.movement_type],
    reference_type: 'stock_movement',
    reference_id: original.id,
    notes: reason || `Reversal of movement #${original.id}`,
    created_by,
  });
}

// ---------------------------------------------------------------------------
// Reservations
// ---------------------------------------------------------------------------

async function createReservation(q, {
  material_id, project_id = null, location_id = null, warehouse_id = null,
  quantity, expires_at = null, reference_type = null, reference_id = null, created_by = null,
}) {
  const qty = toNum(quantity);
  if (!(qty > 0)) throw new Error('Reservation quantity must be positive');
  // Warehouse-scoped reservations are gated on available stock at creation.
  if (warehouse_id != null) {
    const balances = await getBalances(q, warehouse_id, material_id);
    if (balances.available < qty) {
      throw new Error(`Insufficient available stock: ${balances.available} available, ${qty} requested`);
    }
  }
  const r = await q(
    `INSERT INTO stock_reservations
       (material_id, project_id, location_id, warehouse_id, quantity, status, expires_at, reference_type, reference_id, created_by)
     VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8, $9) RETURNING *`,
    [material_id, project_id, location_id, warehouse_id, qty, expires_at, reference_type, reference_id, created_by]
  );
  if (warehouse_id != null) {
    await rebuildWarehouseStock(q, { warehouseId: warehouse_id, materialId: material_id });
  }
  return r.rows[0];
}

async function releaseReservation(q, reservationId, { status = 'released', created_by = null } = {}) {
  const existing = (await q('SELECT * FROM stock_reservations WHERE id = $1', [reservationId])).rows[0];
  if (!existing) throw new Error(`Reservation #${reservationId} not found`);
  if (existing.status !== 'active') throw new Error(`Reservation #${reservationId} is already ${existing.status}`);
  const r = await q(
    `UPDATE stock_reservations
     SET status = $1, released_at = $2, updated_at = $3
     WHERE id = $4 RETURNING *`,
    [status, new Date(), new Date(), reservationId]
  );
  if (existing.warehouse_id != null) {
    await rebuildWarehouseStock(q, { warehouseId: existing.warehouse_id, materialId: existing.material_id });
  }
  return r.rows[0];
}

module.exports = {
  MOVEMENT_TYPES,
  PAIRED_TYPES,
  OUTBOUND_TYPES,
  PHYSICAL_SIGNS,
  QUARANTINE_SIGNS,
  toNum,
  round3,
  physicalStock,
  reservedStock,
  availableStock,
  aggregateMovements,
  rebuildWarehouseStock,
  getBalances,
  createMovement,
  reverseMovement,
  createReservation,
  releaseReservation,
};
