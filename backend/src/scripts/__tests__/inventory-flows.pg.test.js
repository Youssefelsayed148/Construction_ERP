// Real PostgreSQL + real app. Ported from the mock suite inventory.test.js: the ledger sequences that
// reconcile Physical/Available stock exactly — a GRN receipt + issue + site-return, the return that
// reverses the issued quantity, the MIR quarantine gate through the real procurement services
// (a REJECTED delivery never becomes usable stock), warehouse-scoped reservations, the paired transfer
// movements, the append-only reversal rules and the movement-type whitelist.
//
// NOTE (port audit): the mock suite's "two concurrent reversals post only one reversal" case is already
// covered on real PostgreSQL in inventory-integrity.pg.test.js ('two concurrent reversals of one
// movement post only one reversal') and is intentionally NOT duplicated here.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('inventory flows (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let engine; let svc; let owner;
  const tag = String(Date.now()).slice(-7);
  let seq = 0;
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const all = async (sql, params) => (await db.query(sql, params)).rows;
  const call = async (method, path, body) => {
    const res = await fetch(`${base}${path}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` }, body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* empty */ }
    return { status: res.status, body: json };
  };
  const created = { warehouses: [], items: [], suppliers: [], projects: [] };
  const projection = async (w, m) => one(
    'SELECT quantity, reserved_quantity, quarantined_quantity, available_quantity FROM warehouse_stock WHERE warehouse_id = $1 AND item_id = $2', [w, m]);
  const ledgerSum = async (w, m) => one(
    `SELECT COALESCE(SUM(CASE movement_type
        WHEN 'quarantine' THEN quantity WHEN 'grn' THEN quantity WHEN 'opening' THEN quantity WHEN 'return' THEN quantity
        WHEN 'transfer_in' THEN quantity WHEN 'reversal' THEN quantity WHEN 'adjustment' THEN quantity
        WHEN 'quarantine_release' THEN 0 WHEN 'quarantine_restore' THEN 0
        WHEN 'issue' THEN -quantity WHEN 'transfer_out' THEN -quantity WHEN 'waste' THEN -quantity
        WHEN 'damage' THEN -quantity WHEN 'supplier_return' THEN -quantity WHEN 'quarantine_reject' THEN -quantity
      END), 0) s, count(*) n
      FROM stock_movements WHERE warehouse_id = $1 AND material_id = $2`, [w, m]);
  const newWarehouse = async (label) => {
    const w = (await one("INSERT INTO warehouses (name, name_en, type) VALUES ($1, $1, 'central') RETURNING id", [`invf-${tag}-${label}`])).id;
    created.warehouses.push(w);
    return w;
  };
  const newItem = async (label) => {
    const i = (await one("INSERT INTO item_master (code, category, name_en, name_ar, unit) VALUES ($1, 'test', $1, $1, 'ea') RETURNING id", [`invf-m-${tag}-${label}`])).id;
    created.items.push(i);
    return i;
  };
  const move = (type, quantity, opts = {}) => engine.createMovement(db.query, {
    warehouse_id: fixtures.w1, material_id: fixtures.m1, movement_type: type, quantity, ...opts,
  });
  const tx = (fn) => db.transaction((client) => fn(client.query.bind(client)));

  // The shared sequential fixture (a bank of stock the first tests draw down and the later ones top up again).
  const fixtures = {};

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    engine = require('../../services/inventoryEngine');
    svc = require('../../services/procurementService');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ('invf-owner', $1, 'x', 'owner') RETURNING id, token_version", [`invf-${tag}@test.io`]);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [row.id]);
    owner = { id: row.id, role: 'owner', name: 'invf-owner', token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
    // one shared material for the sequential tests
    fixtures.w1 = await newWarehouse('main');
    fixtures.m1 = await newItem('main');
  });

  afterAll(async () => {
    // stock_movements is append-only: leave the movements, delete what FKs allow.
    await db.query('DELETE FROM stock_reservations WHERE warehouse_id = ANY($1)', [created.warehouses]);
    await db.query('DELETE FROM warehouse_stock WHERE warehouse_id = ANY($1)', [created.warehouses]);
    await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [owner.id]);
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [owner.id]);
    for (const s of created.suppliers) await db.query('DELETE FROM supplier_materials WHERE supplier_id = $1', [s]).catch(() => {});
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('1. a GRN receipt + issue + site-return sequence reconciles Physical stock exactly and the projection equals the ledger', async () => {
    seq += 1;
    const grn = await move('grn', 50, { reference_type: 'mir', reference_id: null, unit_cost: '10.0000', created_by: owner.id });
    expect(grn.movement_type).toBe('grn');
    let balances = await engine.getBalances(db.query, fixtures.w1, fixtures.m1);
    expect(balances.physical).toBe(50);
    expect(balances.available).toBe(50);

    await move('issue', 30, { created_by: owner.id });
    balances = await engine.getBalances(db.query, fixtures.w1, fixtures.m1);
    expect(balances.physical).toBe(20);

    // Site returns 10 unused units: 50 − 30 + 10 = 30 — exact reconciliation.
    await move('return', 10, { created_by: owner.id });
    balances = await engine.getBalances(db.query, fixtures.w1, fixtures.m1);
    expect(balances.physical).toBe(30);
    expect(balances.available).toBe(30);

    // The projection carries the same numbers the ledger aggregates to.
    const row = await projection(fixtures.w1, fixtures.m1);
    expect(Number(row.quantity)).toBe(30);
    expect(Number(row.available_quantity)).toBe(30);
    const sum = await ledgerSum(fixtures.w1, fixtures.m1);
    expect(Math.round(Number(sum.s) * 1000) / 1000).toBe(30);
    const aggregate = engine.aggregateMovements(
      await all('SELECT * FROM stock_movements WHERE warehouse_id = $1 AND material_id = $2', [fixtures.w1, fixtures.m1])
    );
    expect(aggregate.physical).toBe(30);
  });

  test('2. a site return reverses the originally issued quantity exactly and available goes back up by exactly that quantity', async () => {
    const before = (await engine.getBalances(db.query, fixtures.w1, fixtures.m1)).available;
    await move('issue', 25, { created_by: owner.id });
    const afterIssue = await engine.getBalances(db.query, fixtures.w1, fixtures.m1);
    expect(afterIssue.available).toBe(before - 25);
    expect(afterIssue.physical).toBe(before - 25);
    await move('return', 25, { created_by: owner.id });
    const after = await engine.getBalances(db.query, fixtures.w1, fixtures.m1);
    expect(after.physical).toBe(before);
    expect(after.available).toBe(before);
    // The original rows are untouched (append-only): two movements, not an edit.
    const types = (await all('SELECT movement_type FROM stock_movements WHERE warehouse_id = $1 ORDER BY id DESC LIMIT 2', [fixtures.w1])).map((r) => r.movement_type);
    expect(types).toEqual(['return', 'issue']);
  });

  test('3. quarantine_reject: a rejected delivery never increases available stock and the quarantined bucket goes down', async () => {
    seq += 1;
    const supplier = (await one('INSERT INTO suppliers (code, name_en, name_ar) VALUES ($1, $1, $1) RETURNING id', [`invf-s-${tag}`])).id;
    created.suppliers.push(supplier);
    const material = await newItem('qrej');
    const warehouse = await newWarehouse('qrej');
    await db.query('INSERT INTO supplier_materials (supplier_id, material_id) VALUES ($1, $2)', [supplier, material]);
    const po = await tx((q) => svc.createPurchaseOrder(q, {
      supplier_id: supplier, project_id: null, warehouse_id: warehouse,
      lines: [{ material_id: material, quantity: 8, unit_rate: 50 }],
      created_by: owner.id,
    }));
    const delivery = await tx((q) => svc.createDelivery(q, {
      purchase_order_id: po.id, warehouse_id: warehouse,
      lines: [{ purchase_order_line_id: po.lines[0].id, material_id: material, quantity: 8 }],
      received_by: owner.id,
    }));
    // Received-but-uninspected: physically present, held out of Available.
    let balances = await engine.getBalances(db.query, warehouse, material);
    expect(balances.physical).toBe(8);
    expect(balances.quarantined).toBe(8);
    expect(balances.available).toBe(0);
    const rowMid = await projection(warehouse, material);
    expect(Number(rowMid.quarantined_quantity)).toBe(8);

    const mir = await tx((q) => svc.createMir(q, { delivery_id: delivery.id, created_by: owner.id }));
    const decided = await tx((q) => svc.decideMir(q, mir.id, owner, 'reject'));
    expect(decided.status).toBe('rejected');
    balances = await engine.getBalances(db.query, warehouse, material);
    // Rejected material is written off: the quarantine bucket empties, Available never moved up.
    expect(balances.quarantined).toBe(0);
    expect(balances.physical).toBe(0);
    expect(balances.available).toBe(0);
    const row = await projection(warehouse, material);
    expect(Number(row.quarantined_quantity)).toBe(0);
    expect(Number(row.available_quantity)).toBe(0);
    const reject = (await all(
      "SELECT * FROM stock_movements WHERE warehouse_id = $1 AND movement_type = 'quarantine_reject' AND reference_type = 'mir'", [warehouse]))
      .at(-1);
    expect(Math.round(Number(reject.quantity) * 1000) / 1000).toBe(8);
  });

  test('4. a warehouse-scoped reservation subtracts from available but not physical; release restores exactly', async () => {
    const before = await engine.getBalances(db.query, fixtures.w1, fixtures.m1);
    const reservation = await engine.createReservation(db.query, {
      material_id: fixtures.m1, warehouse_id: fixtures.w1, quantity: 20, created_by: owner.id,
    });
    let balances = await engine.getBalances(db.query, fixtures.w1, fixtures.m1);
    expect(balances.physical).toBe(before.available);       // physical untouched by the reservation
    expect(balances.reserved).toBe(20);
    expect(balances.available).toBe(before.available - 20);
    const row = await projection(fixtures.w1, fixtures.m1);
    expect(Number(row.reserved_quantity)).toBe(20);
    expect(Number(row.available_quantity)).toBe(before.available - 20);

    // A second reservation cannot overcommit what is available.
    await expect(engine.createReservation(db.query, {
      material_id: fixtures.m1, warehouse_id: fixtures.w1, quantity: 100000, created_by: owner.id,
    })).rejects.toThrow(/Insufficient/);

    await engine.releaseReservation(db.query, reservation.id);
    balances = await engine.getBalances(db.query, fixtures.w1, fixtures.m1);
    expect(balances.reserved).toBe(0);
    expect(balances.available).toBe(before.available);
    expect(balances.physical).toBe(before.physical);
  });

  test('5. an inventory transfer posts paired transfer_out + transfer_in movements and both projections reconcile with conserved totals', async () => {
    const from = await newWarehouse('tr-from');
    const to = await newWarehouse('tr-to');
    const material = await newItem('tr');
    await engine.createMovement(db.query, { warehouse_id: from, material_id: material, movement_type: 'opening', quantity: 40, unit_cost: '5.0000' });

    const createdRes = await call('POST', '/api/warehouses/transfers', {
      from_warehouse_id: from, to_warehouse_id: to, items: [{ item_id: material, quantity: 40 }],
    });
    expect(createdRes.status).toBe(201);
    const tid = createdRes.body.data.id;
    const completed = await call('PUT', `/api/warehouses/transfers/${tid}/complete`, {});
    expect(completed.status).toBe(200);

    const out = (await all(
      "SELECT * FROM stock_movements WHERE movement_type = 'transfer_out' AND reference_type = 'inventory_transfer' AND reference_id = $1", [tid]));
    const inn = (await all(
      "SELECT * FROM stock_movements WHERE movement_type = 'transfer_in' AND reference_type = 'inventory_transfer' AND reference_id = $1", [tid]));
    expect(out).toHaveLength(1);
    expect(inn).toHaveLength(1);
    expect(Math.round(Number(out[0].quantity) * 1000) / 1000).toBe(40);
    expect(Math.round(Number(inn[0].quantity) * 1000) / 1000).toBe(40);

    const balancesFrom = await engine.getBalances(db.query, from, material);
    const balancesTo = await engine.getBalances(db.query, to, material);
    expect(balancesFrom.physical).toBe(0);
    expect(balancesTo.physical).toBe(40);
    // Totals conserved: the ledger of both warehouses sums to what we started with.
    const sumFrom = await ledgerSum(from, material);
    const sumTo = await ledgerSum(to, material);
    expect(Number(sumFrom.s)).toBe(0);
    expect(Number(sumTo.s)).toBe(40);
    // And the projections agree with their own ledgers.
    expect(Number((await projection(from, material)).available_quantity)).toBe(0);
    expect(Number((await projection(to, material)).available_quantity)).toBe(40);
  });

  test('6. reversing a reversal is refused — post an adjustment instead', async () => {
    const before = (await engine.getBalances(db.query, fixtures.w1, fixtures.m1)).available;
    const issue = await move('issue', 12, { created_by: owner.id });
    const reversal = await engine.reverseMovement(db.query, issue.id, { created_by: owner.id });
    expect(reversal.movement_type).toBe('reversal');
    expect(Math.round(Number(reversal.quantity) * 1000) / 1000).toBe(12);
    expect(reversal.reference_type).toBe('stock_movement');
    expect(Number(reversal.reference_id)).toBe(issue.id);
    expect((await engine.getBalances(db.query, fixtures.w1, fixtures.m1)).available).toBe(before);

    // The appended reversal cannot itself be reversed.
    await expect(engine.reverseMovement(db.query, reversal.id, { created_by: owner.id }))
      .rejects.toThrow(/reversal/i);
    // And the ledger still carries the correction, not a second one.
    const correction = (await all(
      "SELECT id FROM stock_movements WHERE reference_type = 'stock_movement' AND reference_id = $1", [reversal.id]));
    expect(correction).toHaveLength(0);
    expect((await engine.getBalances(db.query, fixtures.w1, fixtures.m1)).available).toBe(before);
  });

  test('7. an invalid movement_type is rejected and writes nothing', async () => {
    const before = (await all('SELECT count(*)::int n FROM stock_movements WHERE warehouse_id = $1', [fixtures.w1]))[0].n;
    await expect(move('teleport', 5)).rejects.toThrow(/Invalid movement_type/);
    await expect(move('gravity', -5)).rejects.toThrow(/Invalid movement_type/);
    const after = (await all('SELECT count(*)::int n FROM stock_movements WHERE warehouse_id = $1', [fixtures.w1]))[0].n;
    expect(after).toBe(before);
  });

  test('8. an issue beyond available stock is refused and the ledger does not move', async () => {
    const balancesBefore = await engine.getBalances(db.query, fixtures.w1, fixtures.m1);
    await expect(move('issue', 99999)).rejects.toThrow(/Insufficient/);
    const balancesAfter = await engine.getBalances(db.query, fixtures.w1, fixtures.m1);
    expect(balancesAfter.physical).toBe(balancesBefore.physical);
    expect(balancesAfter.available).toBe(balancesBefore.available);
    const movements = (await all('SELECT count(*)::int n FROM stock_movements WHERE warehouse_id = $1 AND material_id = $2', [fixtures.w1, fixtures.m1]))[0].n;
    // Only the movements of the earlier tests; the refused issue wrote nothing.
    expect(movements).toBe(Number((await ledgerSum(fixtures.w1, fixtures.m1)).n));
  });
});
