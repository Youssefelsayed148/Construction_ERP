// Real PostgreSQL + real app. Phase 2.3: procurement locking.
// Reproduced first:
//   * concurrent deliveries read the same delivered_quantity and wrote absolute values, so a PO line could be
//     over-delivered past ordered + tolerance and the totals lost updates;
//   * two concurrent MIR decisions both passed `status = 'pending'` and both posted stock movements;
//   * a supplier return was not checked against what the GRN accepted, nor decremented, so the same goods could
//     be returned repeatedly;
//   * createGrn passed misspelled arguments to grnConstraintOk, so its constraint never fired;
//   * threeWayMatch loaded every GRN line in the database and filtered in JS.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('procurement locking (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let svc; let owner;
  const tag = String(Date.now()).slice(-7);
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const made = { pos: [], warehouses: [], items: [], suppliers: [] };

  const call = async (method, path, body) => {
    const res = await fetch(`${base}${path}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` }, body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* empty */ }
    return { status: res.status, body: json };
  };

  // A PO with one line (qty 100, tolerance 5%) in an open status, a warehouse and an item.
  const fixture = async (label, { qty = 100, tolerance = 5 } = {}) => {
    const supplier = (await one("INSERT INTO suppliers (name_ar, name_en) VALUES ($1, $1) RETURNING id", [`pl-${tag}-${label}`])).id;
    const item = (await one("INSERT INTO item_master (code, category, name_en, name_ar, unit) VALUES ($1, 'test', $1, $1, 'ea') RETURNING id", [`PL-${tag}-${label}`])).id;
    const warehouse = (await one("INSERT INTO warehouses (name, name_en, type) VALUES ($1, $1, 'central') RETURNING id", [`pl-${tag}-${label}`])).id;
    const po = (await one(
      "INSERT INTO purchase_orders (order_number, supplier_id, status, tolerance_pct) VALUES ($1, $2, 'issued', $3) RETURNING id", [`PL-PO-${tag}-${label}`, supplier, tolerance]
    )).id;
    const line = (await one(
      "INSERT INTO purchase_order_lines (purchase_order_id, material_id, quantity, unit_rate, delivered_quantity, accepted_quantity) VALUES ($1, $2, $3, 10, 0, 0) RETURNING id", [po, item, qty]
    )).id;
    made.pos.push(po); made.warehouses.push(warehouse); made.items.push(item); made.suppliers.push(supplier);
    return { supplier, item, warehouse, po, line };
  };
  const deliver = (f, quantity) => call('POST', '/api/procurement/deliveries', { purchase_order_id: f.po, warehouse_id: f.warehouse, lines: [{ purchase_order_line_id: f.line, quantity }] });
  const poLine = (f) => one('SELECT delivered_quantity::float AS delivered, accepted_quantity::float AS accepted FROM purchase_order_lines WHERE id = $1', [f.line]);
  const stock = (f) => one('SELECT quantity::float AS physical, quarantined_quantity::float AS quarantined FROM warehouse_stock WHERE warehouse_id = $1 AND item_id = $2', [f.warehouse, f.item]);

  // delivery -> MIR -> accepted -> GRN, returning the ids
  const receive = async (f, quantity) => {
    const delivery = (await deliver(f, quantity)).body.data;
    const mirRes = await call('POST', `/api/procurement/deliveries/${delivery.id}/mir`, {}); if (mirRes.status !== 201) throw new Error('mir: ' + JSON.stringify(mirRes.body)); const mir = mirRes.body.data;
    return { delivery, mir };
  };

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    svc = require('../../services/procurementService');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ('pl-owner', $1, 'x', 'owner') RETURNING id, token_version", [`pl-${tag}@test.io`]);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [row.id]);
    owner = { id: row.id, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
  });
  afterAll(async () => {
    await db.query('DELETE FROM supplier_invoice_lines WHERE supplier_invoice_id IN (SELECT id FROM supplier_invoices WHERE purchase_order_id = ANY($1))', [made.pos]);
    await db.query('DELETE FROM supplier_invoices WHERE purchase_order_id = ANY($1)', [made.pos]);
    await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [owner.id]);
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [owner.id]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  describe('createDelivery', () => {
    test('10 concurrent deliveries of 20 against 100 + 5% never deliver more than 105', async () => {
      const f = await fixture('a');
      const results = await Promise.all(Array.from({ length: 10 }, () => deliver(f, 20)));
      const ok = results.filter((r) => r.status === 201).length;
      expect(ok).toBe(5);
      const line = await poLine(f);
      expect(line.delivered).toBe(100);
      const recorded = (await one('SELECT COALESCE(SUM(quantity), 0)::float AS q FROM delivery_lines WHERE purchase_order_line_id = $1', [f.line])).q;
      expect(recorded).toBe(line.delivered);
      expect((await stock(f)).quarantined).toBe(100);
    });

    test('the database refuses over-delivery and accepted above delivered, whoever writes', async () => {
      const f = await fixture('b');
      await expect(db.query('UPDATE purchase_order_lines SET delivered_quantity = 106 WHERE id = $1', [f.line])).rejects.toMatchObject({ code: '23514' });
      await db.query('UPDATE purchase_order_lines SET delivered_quantity = 105 WHERE id = $1', [f.line]);
      await expect(db.query('UPDATE purchase_order_lines SET accepted_quantity = 106 WHERE id = $1', [f.line])).rejects.toMatchObject({ code: '23514' });
      await expect(db.query('UPDATE purchase_order_lines SET delivered_quantity = -1 WHERE id = $1', [f.line])).rejects.toMatchObject({ code: '23514' });
    });
  });

  describe('decideMir', () => {
    test('two concurrent decisions on one MIR post the stock movements once', async () => {
      const f = await fixture('c');
      const { mir } = await receive(f, 10);
      // A second, still-uninspected delivery of the same material sits in the same quarantine bucket, so the
      // stock ledger alone cannot tell a duplicate decision from a legitimate one.
      await receive(f, 10);
      const results = await Promise.all([1, 2].map(() => call('POST', `/api/procurement/mir/${mir.id}/decide`, { decision: 'accept' })));
      expect(results.filter((r) => r.status === 200).length).toBe(1);
      expect(results.filter((r) => r.status === 400).length).toBe(1);
      expect(await poLine(f)).toEqual({ delivered: 20, accepted: 10 });
      expect(await stock(f)).toEqual({ physical: 20, quarantined: 10 });
      const releases = (await one("SELECT count(*)::int AS n FROM stock_movements WHERE reference_type = 'mir' AND reference_id = $1 AND movement_type = 'quarantine_release'", [mir.id])).n;
      expect(releases).toBe(1);
    });

    test('an accept racing a reject leaves one outcome', async () => {
      const f = await fixture('d');
      const { mir } = await receive(f, 10);
      const results = await Promise.all([
        call('POST', `/api/procurement/mir/${mir.id}/decide`, { decision: 'accept' }),
        call('POST', `/api/procurement/mir/${mir.id}/decide`, { decision: 'reject' }),
      ]);
      expect(results.filter((r) => r.status === 200).length).toBe(1);
      const status = (await one('SELECT status FROM material_inspection_requests WHERE id = $1', [mir.id])).status;
      const s = await stock(f);
      expect(s.quarantined).toBe(0);
      expect(s.physical).toBe(status === 'accepted' ? 10 : 0);
    });
  });

  describe('supplier returns', () => {
    const accepted = async (f, qty) => {
      const { mir } = await receive(f, qty);
      expect((await call('POST', `/api/procurement/mir/${mir.id}/decide`, { decision: 'accept' })).status).toBe(200);
      const grn = (await call('POST', `/api/procurement/mir/${mir.id}/grn`, {})).body.data;
      return grn;
    };
    const sendBack = (grn, f, quantity) => call('POST', `/api/procurement/grn/${grn.id}/returns`, { reason: 'damaged', lines: [{ material_id: f.item, quantity }] });

    test('cannot return more than the GRN accepted, and returns decrement what is returnable', async () => {
      const f = await fixture('e');
      const grn = await accepted(f, 10);
      expect((await sendBack(grn, f, 7)).status).toBe(201);
      const again = await sendBack(grn, f, 7);
      expect(again.status).toBe(400);
      expect(again.body.error).toMatch(/returnable|accepted/i);
      expect((await sendBack(grn, f, 3)).status).toBe(201);
      expect((await sendBack(grn, f, 1)).status).toBe(400);
      expect((await one('SELECT returned_quantity::float AS r FROM grn_lines WHERE grn_id = $1', [grn.id])).r).toBe(10);
      expect((await poLine(f)).accepted).toBe(0);
      expect((await stock(f)).physical).toBe(0);
    });

    test('two concurrent returns of 7 against 10 accepted: one succeeds', async () => {
      const f = await fixture('f');
      const grn = await accepted(f, 10);
      const results = await Promise.all([1, 2].map(() => sendBack(grn, f, 7)));
      expect(results.filter((r) => r.status === 201).length).toBe(1);
      expect((await stock(f)).physical).toBe(3);
    });
  });

  describe('GRN constraint and three-way match', () => {
    test('grnConstraintOk is called with the keys it reads, so it can actually fail', () => {
      expect(svc.grnConstraintOk({ ordered: 10, deliveredCumulative: 10, acceptedCumulative: 11, tolerancePct: 5 })).toBe(false);
      expect(svc.grnConstraintOk({ ordered: 10, deliveredCumulative: 10, acceptedCumulative: 10, tolerancePct: 5 })).toBe(true);
      const source = require('fs').readFileSync(require('path').join(__dirname, '../../services/procurementService.js'), 'utf8');
      expect(source).toMatch(/deliveredCumulative:\s*poLine\.delivered_quantity/);
      expect(source).toMatch(/acceptedCumulative:\s*toNum\(poLine\.accepted_quantity\)/);
    });

    test('threeWayMatch looks up GRN lines by PO, never the whole table', async () => {
      const f = await fixture('g');
      const invoice = (await one(
        "INSERT INTO supplier_invoices (invoice_number, supplier_id, purchase_order_id, total_amount) VALUES ($1, $2, $3, 0) RETURNING id", [`PL-INV-${tag}`, f.supplier, f.po]
      )).id;
      await db.query('INSERT INTO supplier_invoice_lines (supplier_invoice_id, purchase_order_line_id, quantity, unit_price) VALUES ($1, $2, 1, 10)', [invoice, f.line]);
      const statements = [];
      const spy = (text, params) => { statements.push(String(text).replace(/\s+/g, ' ').trim()); return db.query(text, params); };
      await svc.threeWayMatch(spy, invoice);
      const unscoped = statements.filter((s) => /FROM (grn_lines|goods_receipt_notes)\s*$/i.test(s));
      expect(unscoped).toEqual([]);
    });
  });
});
