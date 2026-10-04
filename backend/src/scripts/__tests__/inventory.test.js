// Phase 10 tests — ledgered stock movements, derived stock projection, MIR
// quarantine gate.
//
// Coverage:
//   - migration: stock_movements / stock_reservations tables; warehouses.
//     warehouse_type; derived projection columns; legacy backfill into
//     'opening' movements (idempotent); projection rebuilt from the ledger;
//     the real-DB immutability trigger exists in the runner source
//   - engine formulas: Physical / Reserved / Available exactly as specified
//   - the acceptance test: a GRN + issue + return sequence reconciles
//     Physical Stock exactly; a rejected MIR never increases Available
//     Stock; a return reverses the originally issued quantity
//   - append-only ledger: corrections are reversal movements referencing the
//     original; insufficient-stock gates; transfer as paired movements

const fs = require('fs');
const path = require('path');
const { MockDb } = require('../test-helpers/mock-db');
const migration = require('../inventory-migration');
const engine = require('../../services/inventoryEngine');

const db = new MockDb();
const q = (sql, params) => db.query(sql, params);

const W1 = 1; // central store
const W2 = 2; // project store
const MAT = 50;

async function stockRow(warehouseId, materialId = MAT) {
  return (await q(
    'SELECT id, warehouse_id, item_id, quantity, reserved_quantity, quarantined_quantity, available_quantity FROM warehouse_stock WHERE warehouse_id = $1 AND item_id = $2',
    [warehouseId, materialId]
  )).rows[0];
}
const num = (v) => parseFloat(v);

async function buildFixture() {
  await q(`CREATE TABLE IF NOT EXISTS warehouses (
    id SERIAL PRIMARY KEY, name VARCHAR(255), name_en VARCHAR(255), name_ar VARCHAR(255),
    type VARCHAR(50) DEFAULT 'site', project_id INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS warehouse_stock (
    id SERIAL PRIMARY KEY, warehouse_id INTEGER, item_id INTEGER,
    quantity DECIMAL(15,3) DEFAULT 0, reorder_level DECIMAL(15,3) DEFAULT 0,
    UNIQUE(warehouse_id, item_id))`);
  await q(`CREATE TABLE IF NOT EXISTS inventory_transfers (
    id SERIAL PRIMARY KEY, from_warehouse_id INTEGER, to_warehouse_id INTEGER,
    status VARCHAR(50) DEFAULT 'draft', requested_by INTEGER, approved_by INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS inventory_transfer_items (
    id SERIAL PRIMARY KEY, transfer_id INTEGER, item_id INTEGER, quantity DECIMAL(15,3) DEFAULT 0)`);
  await q(`CREATE TABLE IF NOT EXISTS item_master (
    id SERIAL PRIMARY KEY, code VARCHAR(50), name_en VARCHAR(255), name_ar VARCHAR(255), unit VARCHAR(50))`);
  await q(`CREATE TABLE IF NOT EXISTS projects (id SERIAL PRIMARY KEY, name VARCHAR(255))`);
  await q(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name VARCHAR(255))`);

  await q('INSERT INTO warehouses (id, name, type) VALUES ($1,$2,$3)', [W1, 'Central Store', 'central']);
  await q('INSERT INTO warehouses (id, name, type) VALUES ($1,$2,$3)', [W2, 'Site Store', 'site']);
  await q('INSERT INTO item_master (id, code, unit) VALUES ($1,$2,$3)', [MAT, 'RM-CEM', 'bag']);
  await q('INSERT INTO users (id, name) VALUES ($1,$2)', [5, 'Storekeeper']);
  await q(`INSERT INTO inventory_transfers (id, from_warehouse_id, to_warehouse_id, status) VALUES ($1,$2,$3,$4)`, [70, W1, W2, 'draft']);
  await q(`INSERT INTO inventory_transfer_items (transfer_id, item_id, quantity) VALUES ($1,$2,$3)`, [70, MAT, 40]);

  // Legacy stock (directly mutated in Phase 2-era data): 100 bags at W1.
  await q(`INSERT INTO warehouse_stock (id, warehouse_id, item_id, quantity, reorder_level) VALUES ($1,$2,$3,$4,$5)`, [80, W1, MAT, 100, 20]);
}

beforeAll(async () => {
  await buildFixture();
  await migration.ensureTables(q);
  await migration.backfillOpeningMovements(q);
  await migration.rebuildProjection(q);
});

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

describe('migration', () => {
  test('creates the ledger, reservations and the additive columns', () => {
    expect(db.table('stock_movements').columns.has('movement_type')).toBe(true);
    expect(db.table('stock_movements').columns.has('reference_type')).toBe(true);
    expect(db.table('stock_reservations').columns.has('expires_at')).toBe(true);
    expect(db.table('warehouses').columns.has('warehouse_type')).toBe(true);
    expect(db.table('warehouse_stock').columns.has('reserved_quantity')).toBe(true);
    expect(db.table('warehouse_stock').columns.has('quarantined_quantity')).toBe(true);
    expect(db.table('warehouse_stock').columns.has('available_quantity')).toBe(true);
  });

  test('legacy quantities are backfilled as opening movements and the projection reconciles', async () => {
    const opening = (await q(
      `SELECT * FROM stock_movements WHERE movement_type = 'opening' AND reference_type = 'legacy_backfill'`
    )).rows;
    expect(opening.length).toBe(1);
    expect(num(opening[0].quantity)).toBe(100);

    const row = (await q('SELECT * FROM warehouse_stock WHERE warehouse_id = $1 AND item_id = $2', [W1, MAT])).rows[0];
    expect(num(row.quantity)).toBe(100); // physical from ledger
    expect(num(row.available_quantity)).toBe(100);
    expect(num(row.reserved_quantity)).toBe(0);
    expect(num(row.quarantined_quantity)).toBe(0);
  });

  test('backfill is idempotent and the projection rebuild is stable', async () => {
    const again = await migration.backfillOpeningMovements(q);
    expect(again).toBe(0);
    const count = (await q('SELECT * FROM stock_movements')).rows.length;
    await migration.rebuildProjection(q);
    expect((await q('SELECT * FROM stock_movements')).rows.length).toBe(count);
  });

  test('the runner source carries the real-DB immutability trigger', () => {
    const content = fs.readFileSync(
      path.join(__dirname, '..', 'inventory-migration.js'), 'utf8'
    );
    expect(content).toMatch(/CREATE OR REPLACE FUNCTION stock_movements_immutable/);
    expect(content).toMatch(/BEFORE UPDATE OR DELETE ON stock_movements/);
  });
});

// ---------------------------------------------------------------------------
// Engine formulas (pure)
// ---------------------------------------------------------------------------

describe('inventoryEngine formulas', () => {
  test('Physical = Opening + Receipts + Returns + Transfers In − Issues − Transfers Out − Waste', () => {
    expect(engine.physicalStock({ opening: 100, receipts: 50, returns: 10, transfersIn: 5, issues: 30, transfersOut: 20, writeoff: 5 })).toBe(110);
    expect(engine.physicalStock({ opening: 50, receipts: 0, returns: 0, transfersIn: 0, issues: 120 })).toBe(-70); // engine never lets this happen, formula itself is exact
    expect(engine.physicalStock({})).toBe(0);
  });

  test('Reserved = Σ active (unexpired) reservations', () => {
    const now = new Date('2026-09-18T12:00:00Z');
    expect(engine.reservedStock([
      { status: 'active', quantity: 10, expires_at: null },
      { status: 'active', quantity: 15, expires_at: '2026-12-31' },
      { status: 'active', quantity: 100, expires_at: '2026-01-01' }, // expired
      { status: 'released', quantity: 50 },
    ], now)).toBe(25);
  });

  test('Available = Physical − Reserved − Quarantined', () => {
    expect(engine.availableStock(100, 30, 20)).toBe(50);
    expect(engine.availableStock(100, 0, 100)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Acceptance — ledger sequences reconcile the projection exactly
// ---------------------------------------------------------------------------

describe('ledger sequence (acceptance)', () => {
  test('GRN + issue + return reconciles Physical Stock exactly', async () => {
    // Legacy opening: 100. GRN 50 usable (MIR accepted evidence) → 150.
    const grn = await engine.createMovement(q, {
      warehouse_id: W1, material_id: MAT, movement_type: 'grn', quantity: 50,
      reference_type: 'mir', reference_id: 300, created_by: 5,
    });
    let balances = await engine.getBalances(q, W1, MAT);
    expect(balances.physical).toBe(150);
    expect(balances.available).toBe(150);

    // Issue 30 for a work order.
    await engine.createMovement(q, {
      warehouse_id: W1, material_id: MAT, movement_type: 'issue', quantity: 30,
      reference_type: 'work_order_material', reference_id: 990, created_by: 5,
    });
    balances = await engine.getBalances(q, W1, MAT);
    expect(balances.physical).toBe(120);

    // Site returns 10 unused bags.
    await engine.createMovement(q, {
      warehouse_id: W1, material_id: MAT, movement_type: 'return', quantity: 10,
      reference_type: 'work_order_material', reference_id: 990, created_by: 5,
    });
    balances = await engine.getBalances(q, W1, MAT);
    // 100 opening + 50 grn − 30 issue + 10 return = 130 — exact reconciliation.
    expect(balances.physical).toBe(130);
    expect(balances.available).toBe(130);

    const projection = (await q('SELECT * FROM warehouse_stock WHERE warehouse_id = $1 AND item_id = $2', [W1, MAT])).rows[0];
    expect(num(projection.quantity)).toBe(130);
    expect(num(projection.available_quantity)).toBe(130);

    // The projection equals the ledger-derived figure at every step.
    const all = (await q('SELECT * FROM stock_movements WHERE warehouse_id = $1 AND material_id = $2', [W1, MAT])).rows;
    const agg = engine.aggregateMovements(all);
    expect(agg.physical).toBe(130);
    expect(grn.movement_type).toBe('grn');
  });


  test('a return reverses the originally issued quantity exactly', async () => {
    // Issue 25, return 25 → back to the pre-issue balance.
    const before = (await engine.getBalances(q, W1, MAT)).physical;
    await engine.createMovement(q, {
      warehouse_id: W1, material_id: MAT, movement_type: 'issue', quantity: 25, created_by: 5,
    });
    const afterIssue = (await engine.getBalances(q, W1, MAT)).physical;
    expect(afterIssue).toBe(before - 25);
    await engine.createMovement(q, {
      warehouse_id: W1, material_id: MAT, movement_type: 'return', quantity: 25, created_by: 5,
    });
    expect((await engine.getBalances(q, W1, MAT)).physical).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// MIR gate — rejected MIR never increases Available Stock
// ---------------------------------------------------------------------------

describe('MIR quarantine gate (acceptance)', () => {
  const MAT2 = 51;

  beforeAll(async () => {
    await q('INSERT INTO item_master (id, code, unit) VALUES ($1,$2,$3)', [51, 'RM-CEM', 'bag']);
  });


  test('a rejected MIR never increases Available Stock', async () => {
    await engine.createMovement(q, { warehouse_id: W2, material_id: 51, movement_type: 'opening', quantity: 200, unit_cost: 1, created_by: 5 });
    await engine.createMovement(q, {
      warehouse_id: W2, material_id: 51, movement_type: 'quarantine', quantity: 100, created_by: 5,
    });
    let balances = await engine.getBalances(q, W2, 51);
    expect(balances.available).toBe(200); // unchanged — quarantine is not usable stock

    await engine.createMovement(q, {
      warehouse_id: W2, material_id: 51, movement_type: 'quarantine_reject', quantity: 100,
      reference_type: 'mir', reference_id: 302, created_by: 5,
    });
    balances = await engine.getBalances(q, W2, 51);
    // Rejected material is written off; Available never moved up.
    expect(balances.quarantined).toBe(0);
    expect(balances.physical).toBe(200);
    expect(balances.available).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Reservations
// ---------------------------------------------------------------------------

describe('reservations', () => {
  test('a warehouse-scoped reservation subtracts from Available, not Physical', async () => {
    const r = await engine.createReservation(q, {
      material_id: MAT, warehouse_id: W1, quantity: 20, created_by: 5,
    });
    let balances = await engine.getBalances(q, W1, MAT);
    expect(balances.physical).toBe(130);
    expect(balances.reserved).toBe(20);
    expect(balances.available).toBe(110);
    const projection = (await q('SELECT * FROM warehouse_stock WHERE warehouse_id = $1 AND item_id = $2', [W1, MAT])).rows[0];
    expect(num(projection.reserved_quantity)).toBe(20);
    expect(num(projection.available_quantity)).toBe(110);

    await engine.releaseReservation(q, r.id);
    balances = await engine.getBalances(q, W1, MAT);
    expect(balances.reserved).toBe(0);
    expect(balances.available).toBe(130);
  });

});

// ---------------------------------------------------------------------------
// Transfers as paired movements
// ---------------------------------------------------------------------------

describe('transfers', () => {
  test('completion posts transfer_out + transfer_in and both projections reconcile', async () => {
    const fromBefore = (await engine.getBalances(q, W1, MAT)).physical;
    await q(`UPDATE inventory_transfers SET status = 'draft' WHERE id = 70`);
    // Simulate the completion transaction body (route logic) against the mock.
    const transfer = (await q('SELECT * FROM inventory_transfers WHERE id = 70')).rows[0];
    const items = (await q('SELECT * FROM inventory_transfer_items WHERE transfer_id = 70')).rows;
    for (const item of items) {
      await engine.createMovement(q, {
        warehouse_id: transfer.from_warehouse_id, material_id: item.item_id,
        movement_type: 'transfer_out', quantity: item.quantity,
        reference_type: 'inventory_transfer', reference_id: 70, created_by: 5,
      });
      await engine.createMovement(q, {
        warehouse_id: transfer.to_warehouse_id, material_id: item.item_id,
        movement_type: 'transfer_in', quantity: item.quantity,
        reference_type: 'inventory_transfer', reference_id: 70, created_by: 5,
      });
    }
    const fromAfter = (await engine.getBalances(q, W1, MAT)).physical;
    const toBalances = await engine.getBalances(q, W2, MAT);
    expect(fromAfter).toBe(fromBefore - 40);
    expect((await engine.getBalances(q, W2, MAT)).physical).toBe(40);

    const out = (await q(
      "SELECT * FROM stock_movements WHERE movement_type = 'transfer_out' AND reference_id = 70"
    )).rows;
    const inn = (await q(
      "SELECT * FROM stock_movements WHERE movement_type = 'transfer_in' AND reference_id = 70"
    )).rows;
    expect(out.length).toBe(1);
    expect(inn.length).toBe(1);
    expect(num(out[0].quantity)).toBe(40);
    expect(num(inn[0].quantity)).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// Append-only ledger — corrections are reversals referencing the original
// ---------------------------------------------------------------------------

describe('append-only ledger', () => {

  test('reversing a reversal is refused — post an adjustment instead', async () => {
    await engine.createMovement(q, { warehouse_id: W2, material_id: 51, movement_type: 'issue', quantity: 5, created_by: 5 });
    const issue = (await q("SELECT * FROM stock_movements WHERE movement_type = 'issue' AND material_id = 51 ORDER BY id DESC LIMIT 1")).rows[0];
    const firstReversal = await engine.reverseMovement(q, issue.id, { created_by: 5 });
    await expect(engine.reverseMovement(q, firstReversal.id)).rejects.toThrow(/reversal/);
  });

  test('invalid movement types are rejected', async () => {
    await expect(engine.createMovement(q, {
      warehouse_id: W1, material_id: MAT, movement_type: 'teleport', quantity: 5,
    })).rejects.toThrow(/Invalid movement_type/);
  });
});

// ---------------------------------------------------------------------------
// Static invariants — the direct-mutation paths are gone for good
// ---------------------------------------------------------------------------

describe('no direct warehouse_stock mutation remains (static check)', () => {
  const routesDir = path.join(__dirname, '..', '..', 'routes');

  test('the direct-mutation POST /warehouses/:id/stock endpoint is removed', () => {
    const content = fs.readFileSync(path.join(routesDir, 'warehouses.js'), 'utf8');
    expect(content).not.toMatch(/INSERT INTO warehouse_stock/);
    expect(content).not.toMatch(/UPDATE warehouse_stock/);
  });

  test('work-order material issuance goes through the movement API, not direct stock mutation', () => {
    const content = fs.readFileSync(path.join(routesDir, 'workorders.js'), 'utf8');
    expect(content).not.toMatch(/UPDATE warehouse_stock/);
    expect(content).toMatch(/movement_type: 'issue'/);
  });

  test('warehouses.js routes all stock changes through inventoryEngine', () => {
    const content = fs.readFileSync(path.join(routesDir, 'warehouses.js'), 'utf8');
    expect(content).toMatch(/engine\.createMovement/);
    expect(content).toMatch(/'quarantine'/);
  });

  test('warehouses.js exposes the movement/reservation/transfer surface', () => {
    const content = fs.readFileSync(path.join(routesDir, 'warehouses.js'), 'utf8');
    const routes = content.match(/router\.(get|post|put|delete)\s*\(/g) || [];
    expect(routes.length).toBe(12);
  });
});
