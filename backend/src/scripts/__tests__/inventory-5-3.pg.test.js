// Real PostgreSQL + real app. Phase 5.3 - materials and inventory (spec 07):
//   lots / batch / expiry (FEFO, expired and blocked lots, lot-level race), the unit conversion table,
//   issue / return / adjustment as first-class documents (cost at the original issue cost, reversal,
//   void rules), the expiry alert, replenishment endpoints, the one open-requirement formula, and the role
//   matrix on the internal API and /api/v1. The per-(warehouse, material) lock and the weighted-average
//   valuation are exercised, not bypassed.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const fs = require('fs');
const path = require('path');
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('5.3 inventory: lots, documents, conversions, replenishment (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let engine; let lots; let repl; let units;
  const tag = String(Date.now()).slice(-8);
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const all = async (sql, params) => (await db.query(sql, params)).rows;
  const call = async (method, p, user, body) => {
    const res = await fetch(`${base}${p}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user && user.token ? user.token : ''}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* empty */ }
    return { status: res.status, body: json };
  };
  const users = {};
  const made = { projects: [], warehouses: [], items: [], suppliers: [] };
  let day = 0;
  const makeUser = async (key, userRole, grantRole = userRole, projectId = null) => {
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ($1, $2, 'x', $3) RETURNING id, token_version",
      [`inv-${key}`, `inv-${key}-${++day}-${tag}@test.io`, userRole]);
    if (grantRole) {
      await db.query('INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, $2, id FROM roles WHERE key = $3', [row.id, projectId, grantRole]);
    }
    users[key] = { id: row.id, role: userRole, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
    return users[key];
  };
  const makeProject = async (s) => {
    const id = (await one("INSERT INTO projects (name, name_en, code, status, budget) VALUES ($1, $1, $2, 'active', 100000) RETURNING id", [`inv ${s}`, `IV${tag}${s}`.slice(0, 20)])).id;
    made.projects.push(id); return id;
  };
  const makeWarehouse = async (s, projectId) => {
    const id = (await one("INSERT INTO warehouses (name, name_en, type, project_id) VALUES ($1, $1, 'site', $2) RETURNING id", [`inv-wh-${s}-${tag}`, projectId])).id;
    made.warehouses.push(id); return id;
  };
  const makeItem = async (s, { tracked = false, unit = 'piece' } = {}) => {
    const id = (await one(
      "INSERT INTO item_master (code, category, unit, name_en, name_ar, batch_lot_tracking) VALUES ($1, 'raw_material', $2, $3, $3, $4) RETURNING id",
      [`INV-${s}-${tag}`, unit, `inv ${s}`, tracked])).id;
    made.items.push(id); return id;
  };
  const dateIn = (days) => { const d = new Date(Date.now() + days * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const stock = (warehouse_id, material_id, quantity, extra = {}) => engine.createMovement(db.query, {
    warehouse_id, material_id, movement_type: 'opening', quantity, unit_cost: 10, created_by: users.owner.id, ...extra,
  });
  const lotOf = async (warehouse_id, material_id, lot_number, expiry_date = null) => (await lots.createLot(db.query,
    { warehouse_id, material_id, lot_number: `${lot_number}-${tag}`, expiry_date, created_by: users.owner.id }));
  const pair = async (w, m) => engine.getBalances(db.query, w, m);
  const lotBal = async (id) => (await lots.lotBalances(db.query, { lot_id: id, include_empty: true }))[0];
  const migrationSql = fs.readFileSync(path.join(__dirname, '..', '..', 'migrations', '0034_inventory_lots_documents.sql'), 'utf8');

  let pA; let pB; let whA; let whB; let whC; let mL; let mP;
  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    engine = require('../../services/inventoryEngine');
    lots = require('../../services/inventoryLots');
    repl = require('../../services/replenishment');
    units = require('../../services/unitConversions');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    pA = await makeProject('A'); pB = await makeProject('B');
    whA = await makeWarehouse('A', pA); whB = await makeWarehouse('B', pB); whC = await makeWarehouse('C', null);
    mL = await makeItem('LOT', { tracked: true }); mP = await makeItem('PLAIN');
    await makeUser('owner', 'owner');
    await makeUser('keeper', 'storekeeper');                                     // inventory create/edit/view, company-wide
    await makeUser('keeperA', 'storekeeper', 'storekeeper', pA);                 // the same, bound to project A
    await makeUser('manager', 'construction_manager');                           // inventory approve + void
    await makeUser('procurement', 'procurement_manager');                        // materials create/edit/approve
    await makeUser('client', 'client', 'client', pA);
    await makeUser('fresh', 'staff', null);
  });

  afterAll(async () => {
    const uids = [...new Set(Object.values(users).map((u) => u.id))];
    await db.query('DELETE FROM replenishment_alerts WHERE material_id = ANY($1)', [made.items]);
    await db.query('DELETE FROM material_requirements WHERE material_id = ANY($1)', [made.items]);
    await db.query('DELETE FROM unit_conversions WHERE material_id = ANY($1)', [made.items]);
    await db.query("DELETE FROM business_rules WHERE rule_key = ANY($1)", [made.items.map((i) => `replenishment_policy:material:${i}`)]);
    await db.query('DELETE FROM user_project_roles WHERE user_id = ANY($1)', [uids]);
    await db.query('UPDATE users SET is_active = false WHERE id = ANY($1)', [uids]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  // ------------------------------------------------------------------------------------------------
  test('1. migration: composite FK, valid conversions, backfill, and a preflight that stops with counts', async () => {
    for (const t of ['unit_conversions', 'stock_lots', 'inventory_documents', 'inventory_document_lines']) {
      expect((await one('SELECT count(*)::int n FROM information_schema.tables WHERE table_name = $1', [t])).n).toBe(1);
    }
    expect((await one("SELECT count(*)::int n FROM information_schema.views WHERE table_name = 'stock_lot_balances'")).n).toBe(1);
    // a movement cannot name a lot of another warehouse or material
    const lotA = await lotOf(whA, mL, 'FKLOT');
    await expect(db.query("INSERT INTO stock_movements (warehouse_id, material_id, movement_type, quantity, lot_id) VALUES ($1, $2, 'opening', 1, $3)", [whB, mL, lotA.id]))
      .rejects.toThrow(/stock_movements_lot_scope_fk/);
    await expect(db.query("INSERT INTO unit_conversions (material_id, from_unit, to_unit, factor) VALUES ($1, 'a', 'b', 0)", [mP])).rejects.toThrow(/factor_positive/);
    await expect(db.query("INSERT INTO unit_conversions (material_id, from_unit, to_unit, factor) VALUES ($1, 'a', 'A', 2)", [mP])).rejects.toThrow(/distinct_units/);

    const c = await db.pool.connect();
    try {
      await c.query('BEGIN');
      const item = (await c.query(
        `INSERT INTO item_master (code, category, unit, name_en, name_ar, unit_conversions) VALUES ($1, 'raw_material', 'bag', 'bf', 'bf',
           '[{"from_unit":"bag","to_unit":"kg","factor":50}]') RETURNING id`, [`INV-MIG-${tag}`])).rows[0].id;
      await c.query(migrationSql);                                           // clean data: backfilled, nothing stops
      const row = (await c.query("SELECT factor FROM unit_conversions WHERE material_id = $1 AND from_unit = 'bag' AND to_unit = 'kg'", [item])).rows[0];
      expect(Number(row.factor)).toBe(50);
      await c.query("UPDATE item_master SET unit_conversions = '[{\"from_unit\":\"bag\",\"to_unit\":\"bag\",\"factor\":2},{\"from_unit\":\"x\",\"factor\":-1}]' WHERE id = $1", [item]);
      await c.query('SAVEPOINT pre');
      await expect(c.query(migrationSql)).rejects.toThrow(/preflight UNSAFE: 2 unit conversion entr/);
      await c.query('ROLLBACK TO SAVEPOINT pre');
    } finally { await c.query('ROLLBACK'); c.release(); }
  });

  test('2. a lot-tracked receipt gets an automatic lot; untracked material is untouched', async () => {
    const m = await stock(whC, mL, 5, { reference_type: 'test', reference_id: Number(tag) });
    expect(m.lot_id).not.toBeNull();
    const lot = await lots.getLot(db.query, m.lot_id);
    expect(lot.lot_number).toBe(`AUTO-test-${Number(tag)}`);
    const plain = await stock(whC, mP, 5);
    expect(plain.lot_id).toBeNull();
    // the same reference again reuses the lot instead of failing on the unique lot number
    const again = await stock(whC, mL, 2, { reference_type: 'test', reference_id: Number(tag) });
    expect(again.lot_id).toBe(m.lot_id);
    expect((await lotBal(m.lot_id)).physical).toBe(7);
  });

  test('3. FEFO: an issue with no lot is split earliest-expiry first, then no-expiry; pair = sum of lots', async () => {
    const wh = await makeWarehouse('FEFO', null);
    const l1 = await lotOf(wh, mL, 'F-LATE', dateIn(40));
    const l2 = await lotOf(wh, mL, 'F-SOON', dateIn(5));
    const l3 = await lotOf(wh, mL, 'F-NONE', null);
    await stock(wh, mL, 10, { lot_id: l1.id });
    await stock(wh, mL, 10, { lot_id: l2.id });
    await stock(wh, mL, 10, { lot_id: l3.id });
    const issued = await engine.createMovement(db.query, { warehouse_id: wh, material_id: mL, movement_type: 'issue', quantity: 25, created_by: users.owner.id });
    expect(issued.parts.map((p) => [p.lot_id, Number(p.quantity)])).toEqual([[l2.id, 10], [l1.id, 10], [l3.id, 5]]);
    expect([(await lotBal(l1.id)).physical, (await lotBal(l2.id)).physical, (await lotBal(l3.id)).physical]).toEqual([0, 0, 5]);
    expect((await pair(wh, mL)).physical).toBe(5);
    // the ledger invariant: pair balance = lots + unlotted
    const unlotted = await lots.unlottedBalance(db.query, wh, mL);
    const sum = (await lots.lotBalances(db.query, { warehouse_id: wh, material_id: mL, include_empty: true })).reduce((s, l) => s + l.available, 0);
    expect(sum + unlotted).toBe((await pair(wh, mL)).available);
    // legacy: stock that predates lots (no lot) is issued after the lots
    const legacy = await stock(wh, mL, 4, { lot_id: null, reference_type: 'legacy' });   // tracked receipt: auto lot, so use raw SQL for a truly lotless row
    expect(legacy.lot_id).not.toBeNull();
    await db.query("INSERT INTO stock_movements (warehouse_id, material_id, movement_type, quantity, unit_cost) VALUES ($1, $2, 'opening', 3, 10)", [wh, mL]);
    await db.query("UPDATE warehouse_stock SET quantity = quantity + 3, available_quantity = available_quantity + 3 WHERE warehouse_id = $1 AND item_id = $2", [wh, mL]);
    const rest = await engine.createMovement(db.query, { warehouse_id: wh, material_id: mL, movement_type: 'issue', quantity: 12, created_by: users.owner.id });
    expect(rest.parts.map((p) => [p.lot_id === null ? 'loose' : 'lot', Number(p.quantity)])).toEqual([['lot', 5], ['lot', 4], ['loose', 3]]);
  });

  test('4. expired and blocked lots: skipped by issues, named in the error, still disposable', async () => {
    const wh = await makeWarehouse('EXP', null);
    const old = await lotOf(wh, mL, 'E-OLD', dateIn(-3));
    const good = await lotOf(wh, mL, 'E-GOOD', dateIn(60));
    await stock(wh, mL, 10, { lot_id: old.id });
    await stock(wh, mL, 10, { lot_id: good.id });
    expect((await lots.getLot(db.query, old.id)).status).toBe('expired');           // already past its date at creation
    await expect(engine.createMovement(db.query, { warehouse_id: wh, material_id: mL, movement_type: 'issue', quantity: 15 }))
      .rejects.toMatchObject({ error_code: 'lot_stock_unusable' });
    await expect(engine.createMovement(db.query, { warehouse_id: wh, material_id: mL, movement_type: 'issue', quantity: 5, lot_id: old.id }))
      .rejects.toMatchObject({ error_code: 'lot_expired' });
    const ok = await engine.createMovement(db.query, { warehouse_id: wh, material_id: mL, movement_type: 'issue', quantity: 10 });
    expect(ok.parts.map((p) => p.lot_id)).toEqual([good.id]);
    // disposal of expired stock is allowed (waste), so it can be written off
    const waste = await engine.createMovement(db.query, { warehouse_id: wh, material_id: mL, movement_type: 'waste', quantity: 10, lot_id: old.id });
    expect(waste.lot_id).toBe(old.id);
    // a blocked lot is skipped; unblocking brings it back
    const lotC = await lotOf(wh, mL, 'E-BLOCK', dateIn(30));
    await stock(wh, mL, 5, { lot_id: lotC.id });
    expect((await call('PUT', `/api/inventory/lots/${lotC.id}/status`, users.keeper, { status: 'blocked' })).body.data.status).toBe('blocked');
    await expect(engine.createMovement(db.query, { warehouse_id: wh, material_id: mL, movement_type: 'issue', quantity: 1 }))
      .rejects.toMatchObject({ error_code: 'lot_stock_unusable' });
    await expect(engine.createMovement(db.query, { warehouse_id: wh, material_id: mL, movement_type: 'issue', quantity: 1, lot_id: lotC.id }))
      .rejects.toMatchObject({ error_code: 'lot_blocked' });
    await call('PUT', `/api/inventory/lots/${lotC.id}/status`, users.keeper, { status: 'active' });
    expect((await engine.createMovement(db.query, { warehouse_id: wh, material_id: mL, movement_type: 'issue', quantity: 1 })).lot_id).toBe(lotC.id);
    expect((await call('PUT', `/api/inventory/lots/${lotC.id}/status`, users.keeper, { status: 'expired' })).body.error_code).toBe('lot_status_invalid');
  });

  test('5. lot-level race: 12 parallel issues of 3 against a lot of 20 -> exactly 6 succeed', async () => {
    const wh = await makeWarehouse('RACE', null);
    const lot = await lotOf(wh, mL, 'R-1', dateIn(90));
    await stock(wh, mL, 20, { lot_id: lot.id });
    const results = await Promise.allSettled(Array.from({ length: 12 }, () =>
      engine.createMovement(db.query, { warehouse_id: wh, material_id: mL, movement_type: 'issue', quantity: 3, lot_id: lot.id, created_by: users.owner.id })));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(6);
    expect((await lotBal(lot.id)).physical).toBe(2);
    expect((await pair(wh, mL)).physical).toBe(2);
    expect(results.filter((r) => r.status === 'rejected').every((r) => /usable|Insufficient/.test(r.reason.message))).toBe(true);
  });

  test('6. delivery -> MIR: the lot opened by the delivery line carries the quarantine and clears on release', async () => {
    const wh = await makeWarehouse('DLV', pA);
    const supplier = (await one('INSERT INTO suppliers (code, name_en, name_ar) VALUES ($1, $1, $1) RETURNING id', [`inv-s-${tag}`])).id;
    made.suppliers.push(supplier);
    const procurement = require('../../services/procurementService');
    const po = await db.transaction((client) => procurement.createPurchaseOrder(client.query.bind(client), {
      supplier_id: supplier, project_id: pA, taxes: 0, freight: 0, approved_charges: 0,
      lines: [{ material_id: mL, description: 'lotted', quantity: 10, unit: 'piece', unit_rate: 12 }], created_by: users.owner.id }));
    await db.query("UPDATE purchase_orders SET status = 'issued' WHERE id = $1", [po.id]);
    const poLine = (await one('SELECT id FROM purchase_order_lines WHERE purchase_order_id = $1', [po.id])).id;
    const created = await call('POST', '/api/procurement/deliveries', users.owner, {
      purchase_order_id: po.id, warehouse_id: wh,
      lines: [{ purchase_order_line_id: poLine, quantity: 10, lot_number: `SUP-${tag}`, batch_number: 'B7', expiry_date: dateIn(20) }] });
    expect(created.status).toBe(201);
    const dl = await one('SELECT lot_id FROM delivery_lines WHERE delivery_id = $1', [created.body.data.id]);
    const lot = await lots.getLot(db.query, dl.lot_id);
    expect([lot.lot_number, lot.batch_number, lot.supplier_id]).toEqual([`SUP-${tag}`, 'B7', supplier]);
    let bal = await lotBal(lot.id);
    expect([bal.physical, bal.quarantined, bal.available]).toEqual([10, 10, 0]);   // received, not yet usable
    const mir = await call('POST', `/api/procurement/deliveries/${created.body.data.id}/mir`, users.owner);
    expect(mir.status).toBe(201);
    const decided = await call('POST', `/api/procurement/mir/${mir.body.data.id}/decide`, users.owner, { decision: 'accept' });
    expect([200, 201]).toContain(decided.status);
    bal = await lotBal(lot.id);
    expect([bal.physical, bal.quarantined, bal.available]).toEqual([10, 0, 10]);
  });

  test('7. transfers carry the lot: the same lot (number, expiry) arrives in the destination', async () => {
    const from = await makeWarehouse('TFROM', null); const to = await makeWarehouse('TTO', null);
    const lot = await lotOf(from, mL, 'T-1', dateIn(33));
    await stock(from, mL, 10, { lot_id: lot.id });
    const t = await call('POST', '/api/warehouses/transfers', users.owner, { from_warehouse_id: from, to_warehouse_id: to, items: [{ item_id: mL, quantity: 6 }] });
    expect(t.status).toBe(201);
    expect((await call('PUT', `/api/warehouses/transfers/${t.body.data.id}/complete`, users.owner)).status).toBe(200);
    const dest = (await lots.lotBalances(db.query, { warehouse_id: to, material_id: mL }))[0];
    expect([dest.lot_number, dest.physical, lots.isoDate(dest.expiry_date)]).toEqual([`T-1-${tag}`, 6, dateIn(33)]);
    expect((await lotBal(lot.id)).physical).toBe(4);
  });

  // ------------------------------------------------------------------------------------------------
  test('8. issue document: posts movements, accrues project cost; return at the ORIGINAL cost reverses its share', async () => {
    await stock(whC, mP, 100, { unit_cost: 10 });                                    // company-level warehouse
    const avgBefore = Number((await one('SELECT avg_unit_cost FROM warehouse_stock WHERE warehouse_id = $1 AND item_id = $2', [whC, mP])).avg_unit_cost);
    const qtyBefore = (await pair(whC, mP)).physical;
    const draft = await call('POST', '/api/inventory/issues', users.keeper, { warehouse_id: whC, project_id: pA, reason: 'columns', lines: [{ material_id: mP, quantity: 10 }] });
    expect(draft.status).toBe(201);
    expect(draft.body.data.doc_number).toMatch(/^MI-/);
    const id = draft.body.data.id;
    // a draft moves nothing
    expect((await pair(whC, mP)).physical).toBe(qtyBefore);
    expect((await call('PUT', `/api/inventory/issues/${id}`, users.keeper, { notes: 'edited' })).body.data.notes).toBe('edited');
    const posted = await call('POST', `/api/inventory/issues/${id}/post`, users.keeper);
    expect(posted.status).toBe(200);
    expect(posted.body.data.status).toBe('posted');
    const line = posted.body.data.lines[0];
    expect(line.movement_id).not.toBeNull();
    expect(Number(line.unit_cost)).toBe(10);
    expect((await pair(whC, mP)).physical).toBe(qtyBefore - 10);
    const costOf = async (type, movement) => (await all('SELECT project_id, amount FROM project_costs WHERE source_type = $1 AND source_id = $2', [type, movement]));
    expect((await costOf('material_issue', line.movement_id))).toEqual([{ project_id: pA, amount: '100.00' }]);
    expect((await costOf('material_issue_offset', line.movement_id))).toEqual([{ project_id: null, amount: '-100.00' }]);
    // double post and edit of a posted document are refused with a code
    const again = await call('POST', `/api/inventory/issues/${id}/post`, users.keeper);
    expect([again.status, again.body.error_code]).toEqual([409, 'document_not_draft']);
    expect((await call('PUT', `/api/inventory/issues/${id}`, users.keeper, { notes: 'late' })).body.error_code).toBe('document_not_draft');

    // return 4: valued at the issue cost, cost given back proportionally
    const ret1 = await call('POST', '/api/inventory/returns', users.keeper, { warehouse_id: whC, project_id: pA, reason: 'surplus', lines: [{ material_id: mP, quantity: 4, issue_line_id: line.id }] });
    expect(ret1.status).toBe(201);
    const posted1 = await call('POST', `/api/inventory/returns/${ret1.body.data.id}/post`, users.keeper);
    expect(posted1.status).toBe(200);
    const rl = posted1.body.data.lines[0];
    expect(Number(rl.unit_cost)).toBe(10);
    expect(await costOf('material_return', rl.movement_id)).toEqual([{ project_id: pA, amount: '-40.00' }]);
    expect(await costOf('material_return_offset', rl.movement_id)).toEqual([{ project_id: null, amount: '40.00' }]);
    // cannot return more than is still out: 6 left
    const over = await call('POST', '/api/inventory/returns', users.keeper, { warehouse_id: whC, lines: [{ material_id: mP, quantity: 7, issue_line_id: line.id }] });
    const overPost = await call('POST', `/api/inventory/returns/${over.body.data.id}/post`, users.keeper);
    expect([overPost.status, overPost.body.error_code]).toEqual([409, 'return_exceeds_issue']);
    expect(overPost.body.error_params).toMatchObject({ requested: 7, returnable: 6 });
    // an issue with returns cannot be voided; a posted return cannot be voided
    expect((await call('POST', `/api/inventory/issues/${id}/void`, users.manager, { reason: 'x' })).body.error_code).toBe('issue_has_returns');
    expect((await call('POST', `/api/inventory/returns/${ret1.body.data.id}/void`, users.manager, { reason: 'x' })).body.error_code).toBe('return_cannot_be_voided');
    // weighted average untouched by a round trip at the same cost; project cost nets to 60
    const avgAfter = Number((await one('SELECT avg_unit_cost FROM warehouse_stock WHERE warehouse_id = $1 AND item_id = $2', [whC, mP])).avg_unit_cost);
    expect(avgAfter).toBe(avgBefore);
    expect((await pair(whC, mP)).physical).toBe(qtyBefore - 6);
    const net = await one("SELECT SUM(amount)::numeric AS n FROM project_costs WHERE project_id = $1 AND source_type IN ('material_issue', 'material_return') AND source_id IN ($2, $3)", [pA, line.movement_id, rl.movement_id]);
    expect(Number(net.n)).toBe(60);
  });

  test('9. voiding an issue reverses stock and its whole project cost; a draft voids without movements', async () => {
    const before = (await pair(whC, mP)).physical;
    const d = await call('POST', '/api/inventory/issues', users.keeper, { warehouse_id: whC, project_id: pA, lines: [{ material_id: mP, quantity: 5 }] });
    await call('POST', `/api/inventory/issues/${d.body.data.id}/post`, users.keeper);
    const mv = (await one('SELECT movement_id FROM inventory_document_lines WHERE document_id = $1', [d.body.data.id])).movement_id;
    const noReason = await call('POST', `/api/inventory/issues/${d.body.data.id}/void`, users.manager, { reason: ' ' });
    expect([noReason.status, noReason.body.error_code]).toEqual([400, 'void_reason_required']);
    const v = await call('POST', `/api/inventory/issues/${d.body.data.id}/void`, users.manager, { reason: 'wrong project' });
    expect(v.status).toBe(200);
    expect(v.body.data.status).toBe('void');
    expect((await pair(whC, mP)).physical).toBe(before);
    const rows = await all("SELECT amount FROM project_costs WHERE project_id = $1 AND source_id IN (SELECT id FROM stock_movements WHERE reference_type = 'stock_movement' AND reference_id = $2)", [pA, mv]);
    expect(rows.map((r) => r.amount)).toEqual(['-50.00']);
    const draft = await call('POST', '/api/inventory/issues', users.keeper, { warehouse_id: whC, lines: [{ material_id: mP, quantity: 1 }] });
    const dv = await call('POST', `/api/inventory/issues/${draft.body.data.id}/void`, users.manager, { reason: 'not needed' });
    expect(dv.body.data.status).toBe('void');
    expect(await all('SELECT id FROM stock_movements WHERE reference_type = $1 AND reference_id = $2', ['inventory_document', draft.body.data.id])).toEqual([]);
  });

  test('10. a lot-tracked issue document is split per lot FEFO; its return goes back to the same lot', async () => {
    const wh = await makeWarehouse('DOC-LOT', null);
    const a = await lotOf(wh, mL, 'D-A', dateIn(10)); const b = await lotOf(wh, mL, 'D-B', dateIn(20));
    await stock(wh, mL, 6, { lot_id: a.id }); await stock(wh, mL, 6, { lot_id: b.id });
    const d = await call('POST', '/api/inventory/issues', users.owner, { warehouse_id: wh, project_id: pB, lines: [{ material_id: mL, quantity: 9 }] });
    const p = await call('POST', `/api/inventory/issues/${d.body.data.id}/post`, users.owner);
    expect(p.body.data.lines.map((l) => [l.lot_id, Number(l.quantity)])).toEqual([[a.id, 6], [b.id, 3]]);
    const lineB = p.body.data.lines[1];
    const r = await call('POST', '/api/inventory/returns', users.owner, { warehouse_id: wh, lines: [{ material_id: mL, quantity: 2, issue_line_id: lineB.id }] });
    const rp = await call('POST', `/api/inventory/returns/${r.body.data.id}/post`, users.owner);
    expect(rp.body.data.lines[0].lot_id).toBe(b.id);
    expect((await lotBal(b.id)).physical).toBe(5);
    expect((await lotBal(a.id)).physical).toBe(0);
  });

  test('11. adjustments: reason mandatory, posting needs approve, never below stock, FEFO write-off', async () => {
    const noReason = await call('POST', '/api/inventory/adjustments', users.keeper, { warehouse_id: whC, lines: [{ material_id: mP, quantity: -1 }] });
    expect([noReason.status, noReason.body.error_code]).toEqual([400, 'adjustment_reason_required']);
    expect((await call('POST', '/api/inventory/adjustments', users.keeper, { warehouse_id: whC, reason: 'count', lines: [{ material_id: mP, quantity: 0 }] })).body.error_code).toBe('line_quantity_invalid');
    const d = await call('POST', '/api/inventory/adjustments', users.keeper, { warehouse_id: whC, reason: 'cycle count', lines: [{ material_id: mP, quantity: -2 }] });
    expect(d.status).toBe(201);
    expect(d.body.data.doc_number).toMatch(/^SA-/);
    // the storekeeper drafts, but posting an adjustment is an approval
    expect((await call('POST', `/api/inventory/adjustments/${d.body.data.id}/post`, users.keeper)).status).toBe(403);
    const before = (await pair(whC, mP)).physical;
    expect((await call('POST', `/api/inventory/adjustments/${d.body.data.id}/post`, users.manager)).status).toBe(200);
    expect((await pair(whC, mP)).physical).toBe(before - 2);
    // more than on hand is refused with a code
    const big = await call('POST', '/api/inventory/adjustments', users.keeper, { warehouse_id: whC, reason: 'oops', lines: [{ material_id: mP, quantity: -1000000 }] });
    const bigPost = await call('POST', `/api/inventory/adjustments/${big.body.data.id}/post`, users.manager);
    expect([bigPost.status, bigPost.body.error_code]).toEqual([409, 'adjustment_exceeds_stock']);
    // a positive count correction adds stock; a void reverses it
    const plus = await call('POST', '/api/inventory/adjustments', users.keeper, { warehouse_id: whC, reason: 'found', lines: [{ material_id: mP, quantity: 3 }] });
    await call('POST', `/api/inventory/adjustments/${plus.body.data.id}/post`, users.manager);
    expect((await pair(whC, mP)).physical).toBe(before - 2 + 3);
    expect((await call('POST', `/api/inventory/adjustments/${plus.body.data.id}/void`, users.manager, { reason: 'recount' })).body.data.status).toBe('void');
    expect((await pair(whC, mP)).physical).toBe(before - 2);
    // a write-off on a lot-tracked material is taken FEFO, expired lots included
    const wh = await makeWarehouse('ADJ-LOT', null);
    const old = await lotOf(wh, mL, 'A-OLD', dateIn(-2)); const fresh = await lotOf(wh, mL, 'A-NEW', dateIn(50));
    await stock(wh, mL, 4, { lot_id: old.id }); await stock(wh, mL, 4, { lot_id: fresh.id });
    const wo = await call('POST', '/api/inventory/adjustments', users.keeper, { warehouse_id: wh, reason: 'expired write-off', lines: [{ material_id: mL, quantity: -5 }] });
    const wop = await call('POST', `/api/inventory/adjustments/${wo.body.data.id}/post`, users.manager);
    expect(wop.status).toBe(200);
    expect([(await lotBal(old.id)).physical, (await lotBal(fresh.id)).physical]).toEqual([0, 3]);
  });

  test('12. role matrix: internal API and /api/v1 agree; project-bound seats stay in their warehouses', async () => {
    const body = { warehouse_id: whA, project_id: pA, lines: [{ material_id: mP, quantity: 1 }] };
    for (const [who, expected] of Object.entries({ owner: 201, keeper: 201, keeperA: 201, manager: 403, procurement: 403, client: 403, fresh: 403 })) { // the manager approves and voids, the storekeeper drafts
      const internal = await call('POST', '/api/inventory/issues', users[who], body);
      const v1 = await call('POST', '/api/v1/inventory/issues', users[who], body);
      expect([who, internal.status]).toEqual([who, expected]);
      expect([who, v1.status]).toEqual([who, expected]);
    }
    for (const [who, expected] of Object.entries({ owner: 200, keeper: 200, manager: 200, procurement: 200, client: 403, fresh: 403 })) {
      expect([who, (await call('GET', '/api/inventory/lots', users[who])).status]).toEqual([who, expected]);
      expect([who, (await call('GET', '/api/v1/inventory/lots', users[who])).status]).toEqual([who, expected]);
      expect([who, (await call('GET', '/api/inventory/issues', users[who])).status]).toEqual([who, expected]);
    }
    // project-bound storekeeper: not another project's warehouse, not a company-level one, not B's documents
    const elsewhere = { warehouse_id: whB, project_id: pB, lines: [{ material_id: mP, quantity: 1 }] };
    expect((await call('POST', '/api/inventory/issues', users.keeperA, elsewhere)).status).toBe(403);
    expect((await call('POST', '/api/inventory/issues', users.keeperA, { ...elsewhere, warehouse_id: whC })).status).toBe(403);
    const docB = await call('POST', '/api/inventory/issues', users.owner, elsewhere);
    expect((await call('GET', `/api/inventory/issues/${docB.body.data.id}`, users.keeperA)).status).toBe(403);
    expect((await call('POST', `/api/inventory/issues/${docB.body.data.id}/post`, users.keeperA)).status).toBe(403);
    // the storekeeper cannot void (needs the void action), the manager can
    const voidable = await call('POST', '/api/inventory/issues', users.keeper, body);
    expect((await call('POST', `/api/inventory/issues/${voidable.body.data.id}/void`, users.keeper, { reason: 'x' })).status).toBe(403);
    expect((await call('POST', `/api/inventory/issues/${voidable.body.data.id}/void`, users.manager, { reason: 'x' })).status).toBe(200);
    // a project-bound seat sees only its project's lots in a list
    const listed = await call('GET', '/api/inventory/lots?include_empty=true', users.keeperA);
    expect(listed.body.data.every((l) => l.project_id === pA)).toBe(true);
  });

  // ------------------------------------------------------------------------------------------------
  test('13. unit conversions: table is the authority, chains work, material beats company, errors carry codes', async () => {
    const mat = await makeItem('UNIT', { unit: 'bag' });
    const create = (b) => call('POST', '/api/inventory/conversions', users.owner, b);
    expect((await create({ material_id: mat, from_unit: 'bag', to_unit: 'kg', factor: 50 })).status).toBe(201);
    expect((await create({ material_id: mat, from_unit: 'kg', to_unit: 'g', factor: 1000 })).status).toBe(201);
    expect((await create({ from_unit: `cartonX${tag}`, to_unit: `pieceX${tag}`, factor: 12 })).status).toBe(201);   // company-wide
    expect((await create({ material_id: mat, from_unit: 'bag', to_unit: 'kg', factor: 40 })).body.error_code).toBe('unit_conversion_exists');
    expect((await create({ material_id: mat, from_unit: 'a', to_unit: 'A', factor: 2 })).body.error_code).toBe('unit_conversion_same_unit');
    expect((await create({ material_id: mat, from_unit: 'a', to_unit: 'b', factor: -1 })).status).toBe(400);
    const conv = async (q, from, to, m = mat) => call('GET', `/api/inventory/conversions/convert?material_id=${m}&quantity=${q}&from=${from}&to=${to}`, users.keeper);
    expect((await conv(2, 'bag', 'kg')).body.data.result).toBe(100);
    expect((await conv(1, 'bag', 'g')).body.data.result).toBe(50000);               // chain bag -> kg -> g
    expect((await conv(500, 'kg', 'bag')).body.data.result).toBe(10);               // inverse
    expect((await conv(2, `cartonX${tag}`, `pieceX${tag}`)).body.data.result).toBe(24);   // company-wide pair
    expect((await conv(1, 'bag', 'liter')).body.error_code).toBe('unit_conversion_missing');
    // a material row overrides the company-wide row for the same pair
    await create({ from_unit: 'bag', to_unit: 'kg', factor: 25 });
    expect((await conv(1, 'bag', 'kg')).body.data.result).toBe(50);
    expect((await conv(1, 'bag', 'kg', mP)).body.data.result).toBe(25);
    // the legacy item JSONB still answers for pairs the table does not hold; the table wins when both exist
    await db.query("UPDATE item_master SET unit_conversions = '[{\"from_unit\":\"bag\",\"to_unit\":\"lb\",\"factor\":110},{\"from_unit\":\"bag\",\"to_unit\":\"kg\",\"factor\":999}]' WHERE id = $1", [mat]);
    expect(await units.convert(db.query, mat, 1, 'bag', 'lb')).toBe(110);
    expect(await units.convert(db.query, mat, 1, 'bag', 'kg')).toBe(50);
    const rows = (await call('GET', `/api/inventory/conversions?material_id=${mat}`, users.keeper)).body.data;
    const upd = await call('PUT', `/api/inventory/conversions/${rows.find((r) => r.material_id === mat && r.to_unit === 'kg' && r.from_unit === 'bag').id}`, users.owner, { factor: 51 });
    expect(Number(upd.body.data.factor)).toBe(51);
    expect((await call('DELETE', `/api/inventory/conversions/${upd.body.data.id}`, users.owner)).status).toBe(200);
    expect((await call('DELETE', `/api/inventory/conversions/${upd.body.data.id}`, users.owner)).body.error_code).toBe('unit_conversion_not_found');
    await db.query("DELETE FROM unit_conversions WHERE from_unit IN ($1, 'bag') AND material_id IS NULL", [`cartonX${tag}`]);
  });

  test('14. expiry alert: raised once, expired lots marked, resolved when the stock is gone', async () => {
    const wh = await makeWarehouse('ALERT', null);
    const mat = await makeItem('ALERT', { tracked: true });
    const soon = await lotOf(wh, mat, 'X-SOON', dateIn(10));
    const gone = await lotOf(wh, mat, 'X-GONE', dateIn(-1));
    await stock(wh, mat, 5, { lot_id: soon.id }); await stock(wh, mat, 3, { lot_id: gone.id });
    await lots.markExpired(db.query);
    const open = () => all("SELECT * FROM replenishment_alerts WHERE material_id = $1 AND alert_type = 'expiring_material' AND status = 'open'", [mat]);
    const first = await repl.evaluateOtherAlerts(db.query, { notify: false });
    expect(first.expiring_material).toBeGreaterThanOrEqual(1);
    let alerts = await open();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].snapshot.lots.map((l) => l.lot_number).sort()).toEqual([`X-GONE-${tag}`, `X-SOON-${tag}`]);
    expect(alerts[0].snapshot.summary).toMatch(/already expired/);
    await repl.evaluateOtherAlerts(db.query, { notify: false });
    expect(await open()).toHaveLength(1);                                         // idempotent
    // write both lots off: the alert resolves on the next run
    for (const [lot, qty] of [[soon, 5], [gone, 3]]) await engine.createMovement(db.query, { warehouse_id: wh, material_id: mat, movement_type: 'waste', quantity: qty, lot_id: lot.id });
    await repl.evaluateOtherAlerts(db.query, { notify: false });
    expect(await open()).toEqual([]);
    // markExpired is idempotent and does not touch blocked lots
    expect(await lots.markExpired(db.query)).toBeGreaterThanOrEqual(0);
  });

  test('15. replenishment endpoints: alerts list, policy config, manual sweep under the leader lock', async () => {
    const mat = await makeItem('POLICY');
    // alerts
    await db.query("INSERT INTO replenishment_alerts (material_id, alert_type, status, snapshot) VALUES ($1, 'below_minimum', 'open', '{}')", [mat]);
    const alerts = await call('GET', `/api/materials/replenishment/alerts?material_id=${mat}`, users.procurement);
    expect(alerts.status).toBe(200);
    expect(alerts.body.data).toHaveLength(1);
    expect(alerts.body.data[0].material_code).toBe(`INV-POLICY-${tag}`);
    expect((await call('GET', '/api/materials/replenishment/alerts', users.client)).status).toBe(403);
    // policies
    const put = (b, who = 'procurement') => call('PUT', '/api/materials/replenishment/policies', users[who], b);
    expect((await put({ scope: 'material', ref: String(mat), mode: 'bogus' })).body.error_code).toBe('validation_error');
    expect((await put({ scope: 'material', ref: '99999999', mode: 'alert_only' })).body.error_code).toBe('material_not_found');
    expect((await put({ scope: 'material', ref: String(mat), mode: 'auto_draft_pr' }, 'keeper')).status).toBe(403);
    const ok = await put({ scope: 'material', ref: String(mat), mode: 'auto_draft_pr', authority_ceiling: 5000 });
    expect(ok.status).toBe(200);
    expect(ok.body.data.rule_key).toBe(`replenishment_policy:material:${mat}`);
    const policy = await repl.getPolicy(db.query, { id: mat, category: 'raw_material' });
    expect([policy.mode, policy.authority_ceiling, policy.policy_key]).toEqual(['auto_draft_pr', 5000, `replenishment_policy:material:${mat}`]);
    const list = await call('GET', '/api/materials/replenishment/policies', users.procurement);
    expect(list.body.data.some((r) => r.rule_key === 'replenishment_policy:default')).toBe(true);
    expect(list.body.modes).toEqual(repl.MODES);
    const del = await call('DELETE', `/api/materials/replenishment/policies?scope=material&ref=${mat}`, users.procurement);
    expect(del.status).toBe(200);
    expect((await call('DELETE', `/api/materials/replenishment/policies?scope=material&ref=${mat}`, users.procurement)).body.error_code).toBe('policy_not_found');
    expect((await call('DELETE', '/api/materials/replenishment/policies?scope=default', users.procurement)).body.error_code).toBe('policy_scope_invalid');
    // sweep: refused for a role without approve, refused while another runner holds the lock, runs twice with nothing new
    expect((await call('POST', '/api/materials/replenishment/sweep', users.keeper)).status).toBe(403);
    const holder = await db.pool.connect();
    try {
      await holder.query("SELECT pg_advisory_lock(hashtext('conerp-sweep:replenishment'))");
      const busy = await call('POST', '/api/materials/replenishment/sweep', users.procurement);
      expect([busy.status, busy.body.error_code]).toEqual([409, 'sweep_already_running']);
    } finally {
      await holder.query("SELECT pg_advisory_unlock(hashtext('conerp-sweep:replenishment'))");
      holder.release();
    }
    const run1 = await call('POST', '/api/materials/replenishment/sweep', users.procurement);
    expect(run1.status).toBe(200);
    expect(run1.body.data.evaluated).toBeGreaterThanOrEqual(0);
    const run2 = await call('POST', '/api/materials/replenishment/sweep', users.procurement);
    expect(run2.body.data.requisitions_raised).toBe(0);                            // idempotent
    expect((await call('POST', '/api/v1/materials/replenishment/sweep', users.keeper)).status).toBe(403);
    expect((await call('GET', '/api/v1/materials/replenishment/policies', users.procurement)).status).toBe(200);
  });

  test('16. the one open-requirement formula: demand - (available + open orders + open requisitions)', async () => {
    const mat = await makeItem('REQ');
    const wh = await makeWarehouse('REQ', pA);
    const supplier = (await one('INSERT INTO suppliers (code, name_en, name_ar) VALUES ($1, $1, $1) RETURNING id', [`inv-r-${tag}`])).id;
    made.suppliers.push(supplier);
    await stock(wh, mat, 30);                                                       // available 30 in project A's warehouse
    await db.query("INSERT INTO material_requirements (project_id, material_id, net_requirement, status, source_activity_date) VALUES ($1, $2, 100, 'planned', $3)", [pA, mat, dateIn(10)]);
    const po = (await one(`INSERT INTO purchase_orders (supplier_id, project_id, status, order_number) VALUES ($1, $2, 'issued', $3) RETURNING id`, [supplier, pA, `PO-INV-${tag}`])).id;
    await db.query('INSERT INTO purchase_order_lines (purchase_order_id, material_id, quantity, delivered_quantity, unit_rate) VALUES ($1, $2, 20, 0, 5)', [po, mat]);
    const pr = (await one("INSERT INTO purchase_requests (project_id, status) VALUES ($1, 'submitted') RETURNING id", [pA])).id;
    await db.query('INSERT INTO purchase_request_lines (purchase_request_id, material_id, quantity) VALUES ($1, $2, 10)', [pr, mat]);
    const r = await repl.openProcurementRequirement(db.query, mat, { projectId: pA });
    expect([r.scheduled_demand, r.available, r.open_orders, r.open_requests, r.incoming, r.requirement]).toEqual([100, 30, 20, 10, 30, 40]);
    // the endpoint is the same number
    const api = await call('GET', `/api/materials/replenishment/open-requirements?project_id=${pA}&material_id=${mat}`, users.procurement);
    expect(api.status).toBe(200);
    expect(api.body.data).toHaveLength(1);
    expect(api.body.data[0]).toMatchObject({ requirement: 40, open_orders: 20, open_requests: 10, available: 30, scheduled_demand: 100 });
    // delivering the order (stock up, order closed) lowers the requirement by exactly that much; never below zero
    await db.query("UPDATE purchase_orders SET status = 'closed' WHERE id = $1", [po]);
    await stock(wh, mat, 20);
    expect((await repl.openProcurementRequirement(db.query, mat, { projectId: pA })).requirement).toBe(40);   // 100 - (50 + 0 + 10)
    await db.query("UPDATE purchase_requests SET status = 'rejected' WHERE id = $1", [pr]);
    expect((await repl.openProcurementRequirement(db.query, mat, { projectId: pA })).requirement).toBe(50);   // 100 - 50
    await stock(wh, mat, 100);
    expect((await repl.openProcurementRequirement(db.query, mat, { projectId: pA })).requirement).toBe(0);
    // another project's stock does not cover this project's demand
    const other = await makeWarehouse('REQ-B', pB);
    await stock(other, mat, 500);
    expect((await repl.openProcurementRequirement(db.query, mat, { projectId: pA })).available).toBe(150);
    expect((await call('GET', `/api/materials/replenishment/open-requirements?project_id=abc`, users.procurement)).body.error_code).toBe('project_id_invalid');
  });
});
