// Real PostgreSQL + real app. Phase 2.2: inventory integrity.
// Reproduced first:
//   * N concurrent issues against limited stock all passed the availability check (read) before any wrote
//     (insert), so stock was oversold and went negative;
//   * a failure between the movement insert and the projection update left the ledger and warehouse_stock
//     disagreeing (the movement routes ran on the pool, not in a transaction);
//   * warehouse_stock accepted negative quantities;
//   * issue cost was whatever the client sent (work_order_materials.unit_cost) and computed with JS floats.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('inventory integrity (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let engine; let owner;
  const tag = String(Date.now()).slice(-7);
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const created = { warehouses: [], items: [] };

  const call = async (method, path, body) => {
    const res = await fetch(`${base}${path}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` }, body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* empty */ }
    return { status: res.status, body: json };
  };
  const newWarehouse = async (label) => {
    const w = (await one("INSERT INTO warehouses (name, name_en, type) VALUES ($1, $1, 'central') RETURNING id", [`inv-${tag}-${label}`])).id;
    created.warehouses.push(w);
    return w;
  };
  const newItem = async (label) => {
    const i = (await one("INSERT INTO item_master (code, category, name_en, name_ar, unit) VALUES ($1, 'test', $1, $1, 'ea') RETURNING id", [`INV-${tag}-${label}`])).id;
    created.items.push(i);
    return i;
  };
  const move = (warehouse, body) => call('POST', `/api/warehouses/${warehouse}/movements`, body);
  const ledger = async (w, m) => engine.getBalances(db.query, w, m);
  const projection = async (w, m) => one('SELECT quantity::float AS quantity, reserved_quantity::float AS reserved, quarantined_quantity::float AS quarantined, available_quantity::float AS available FROM warehouse_stock WHERE warehouse_id = $1 AND item_id = $2', [w, m]);

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    engine = require('../../services/inventoryEngine');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ('inv-owner', $1, 'x', 'owner') RETURNING id, token_version", [`inv-${tag}@test.io`]);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [row.id]);
    owner = { id: row.id, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
  });
  afterAll(async () => {
    await db.query('DROP TRIGGER IF EXISTS trg_inv_test_fail ON warehouse_stock');
    await db.query('DROP FUNCTION IF EXISTS inv_test_fail()');
    // stock_movements is append-only by design: leave the rows, remove what can be removed.
    await db.query('DELETE FROM stock_reservations WHERE warehouse_id = ANY($1)', [created.warehouses]);
    await db.query('DELETE FROM warehouse_stock WHERE warehouse_id = ANY($1)', [created.warehouses]);
    await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [owner.id]);
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [owner.id]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  describe('concurrency', () => {
    test('25 concurrent issues against 10 units: exactly 10 succeed, stock never goes negative, projection equals the ledger', async () => {
      const w = await newWarehouse('a'); const m = await newItem('a');
      expect((await move(w, { material_id: m, movement_type: 'quarantine', quantity: 10 })).status).toBe(201);
      const q = (await one("SELECT id FROM stock_movements WHERE warehouse_id = $1 AND material_id = $2 AND movement_type = 'quarantine'", [w, m])).id;
      expect((await call('POST', `/api/warehouses/movements/${q}/mir`, { result: 'accepted' })).status).toBe(201);

      const results = await Promise.all(Array.from({ length: 25 }, () => move(w, { material_id: m, movement_type: 'issue', quantity: 1 })));
      expect(results.filter((r) => r.status === 201).length).toBe(10);
      expect(results.filter((r) => r.status === 400).length).toBe(15);
      const balances = await ledger(w, m);
      expect(balances.physical).toBe(0);
      expect(await projection(w, m)).toMatchObject({ quantity: 0, available: 0 });
    });

    test('concurrent reservations cannot reserve more than is available', async () => {
      const w = await newWarehouse('b'); const m = await newItem('b');
      await engine.createMovement(db.query, { warehouse_id: w, material_id: m, movement_type: 'opening', quantity: 10 });
      const results = await Promise.all(Array.from({ length: 15 }, () => call('POST', '/api/warehouses/reservations', { material_id: m, warehouse_id: w, quantity: 1 })));
      expect(results.filter((r) => r.status === 201).length).toBe(10);
      expect((await projection(w, m)).available).toBe(0);
    });

    test('two concurrent reversals of one movement post only one reversal', async () => {
      const w = await newWarehouse('c'); const m = await newItem('c');
      const receipt = await engine.createMovement(db.query, { warehouse_id: w, material_id: m, movement_type: 'opening', quantity: 5 });
      const results = await Promise.all([1, 2].map(() => call('POST', `/api/warehouses/movements/${receipt.id}/reverse`, {})));
      expect(results.filter((r) => r.status === 201).length).toBe(1);
      expect((await ledger(w, m)).physical).toBe(0);
    });
  });

  describe('atomicity', () => {
    test('a failure while updating the projection rolls the movement back too', async () => {
      const w = await newWarehouse('d'); const m = await newItem('d');
      await engine.createMovement(db.query, { warehouse_id: w, material_id: m, movement_type: 'opening', quantity: 5 });
      await db.query(`CREATE OR REPLACE FUNCTION inv_test_fail() RETURNS trigger AS $f$ BEGIN
        IF NEW.warehouse_id = ${w} AND NEW.quantity <> OLD.quantity THEN RAISE EXCEPTION 'simulated crash'; END IF; RETURN NEW; END $f$ LANGUAGE plpgsql`);
      await db.query('CREATE TRIGGER trg_inv_test_fail BEFORE UPDATE ON warehouse_stock FOR EACH ROW EXECUTE FUNCTION inv_test_fail()');
      const before = (await one('SELECT count(*)::int AS n FROM stock_movements WHERE warehouse_id = $1', [w])).n;
      const r = await move(w, { material_id: m, movement_type: 'issue', quantity: 1 });
      await db.query('DROP TRIGGER trg_inv_test_fail ON warehouse_stock');
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect((await one('SELECT count(*)::int AS n FROM stock_movements WHERE warehouse_id = $1', [w])).n).toBe(before);
      expect((await ledger(w, m)).physical).toBe(5);
      expect((await projection(w, m)).quantity).toBe(5);
    });
  });

  describe('constraints', () => {
    test('warehouse_stock refuses negative quantities', async () => {
      const w = await newWarehouse('e'); const m = await newItem('e');
      await engine.createMovement(db.query, { warehouse_id: w, material_id: m, movement_type: 'opening', quantity: 3 });
      await expect(db.query('UPDATE warehouse_stock SET quantity = -1 WHERE warehouse_id = $1 AND item_id = $2', [w, m])).rejects.toMatchObject({ code: '23514' });
      await expect(db.query('UPDATE warehouse_stock SET reserved_quantity = -1 WHERE warehouse_id = $1 AND item_id = $2', [w, m])).rejects.toMatchObject({ code: '23514' });
    });
  });

  describe('valuation (weighted average, server-derived)', () => {
    test('receipts set the average, issues are valued at it, and the client cannot choose the cost', async () => {
      const w = await newWarehouse('f'); const m = await newItem('f');
      await engine.createMovement(db.query, { warehouse_id: w, material_id: m, movement_type: 'opening', quantity: 10, unit_cost: '10.0000' });
      await engine.createMovement(db.query, { warehouse_id: w, material_id: m, movement_type: 'opening', quantity: 10, unit_cost: '20.0000' });
      const issue = await move(w, { material_id: m, movement_type: 'issue', quantity: 4 });
      expect(issue.status).toBe(201);
      expect(issue.body.data.movement.unit_cost).toBe('15.0000');
      expect(issue.body.data.movement.total_cost).toBe('60.00');
      // A cost on an outbound movement is refused, not trusted.
      const forged = await move(w, { material_id: m, movement_type: 'issue', quantity: 1, unit_cost: 1 });
      expect(forged.status).toBe(400);
      // Even if one reaches the database, the trigger overrides it.
      const sneaky = await engine.createMovement(db.query, { warehouse_id: w, material_id: m, movement_type: 'issue', quantity: 1, unit_cost: '0.0100' });
      expect(sneaky.unit_cost).toBe('15.0000');
      // Averages do not drift through float error: 3 receipts at 0.1 are valued exactly.
      const w2 = await newWarehouse('g'); const m2 = await newItem('g');
      for (let i = 0; i < 3; i += 1) await engine.createMovement(db.query, { warehouse_id: w2, material_id: m2, movement_type: 'opening', quantity: 1, unit_cost: '0.1000' });
      const out = await engine.createMovement(db.query, { warehouse_id: w2, material_id: m2, movement_type: 'issue', quantity: 3 });
      expect(out.unit_cost).toBe('0.1000');
      expect(out.total_cost).toBe('0.30');
    });

    test('a work-order issue takes its cost from the ledger, not from the request', async () => {
      const w = await newWarehouse('h'); const m = await newItem('h');
      await engine.createMovement(db.query, { warehouse_id: w, material_id: m, movement_type: 'opening', quantity: 10, unit_cost: '12.5000' });
      const project = (await one("INSERT INTO projects (name, name_en, code) VALUES ('inv wo', 'inv wo', $1) RETURNING id", [`IW${tag}`])).id;
      const wo = await one("INSERT INTO work_orders (project_id, title) VALUES ($1, 'inv wo') RETURNING id", [project]);
      const r = await call('POST', `/api/work-orders/${wo.id}/materials`, { item_id: m, actual_quantity: 2, unit_cost: 999, warehouse_id: w });
      expect(r.status).toBe(201);
      const row = await one('SELECT unit_cost, total_cost FROM work_order_materials WHERE work_order_id = $1', [wo.id]);
      expect(row.unit_cost).toBe('12.5000');
      expect(row.total_cost).toBe('25.00');
      await db.query('DELETE FROM work_order_materials WHERE work_order_id = $1', [wo.id]);
      await db.query('DELETE FROM work_orders WHERE id = $1', [wo.id]);
      await db.query('DELETE FROM projects WHERE id = $1', [project]);
    });
  });
});
