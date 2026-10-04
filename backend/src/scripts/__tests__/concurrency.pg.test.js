// Real PostgreSQL + real app. Closeout B3: the concurrency suite. Every test races real connections.
//   stock issue race, double MIR decision, double approval, numbering collisions, duplicate delivery,
//   idempotent cost posting (replay and parallel), two dispatcher instances, two sweep runners.
//
// Proven to fail without the fix (reverted locally, then restored; the lead's B3 report lists the runs):
//   * stock issue race: the per-(warehouse, material) advisory lock in inventoryEngine.lockPairs;
//   * double approval: the row lock + status claim in routes/approvals.js / workflowEngine.recordLegacyDecision.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('B3 concurrency (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let owner; let svc; let inventory; let outbox; let sweepLeader; let costAccrual;
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
  const tx = (fn) => db.transaction((client) => fn(client.query.bind(client)));
  const settle = (promises) => Promise.allSettled(promises);
  const quiet = async (fn) => { const spy = jest.spyOn(console, 'error').mockImplementation(() => {}); try { return await fn(); } finally { spy.mockRestore(); } };

  const world = async () => {
    seq += 1;
    const key = `${tag}-${seq}`;
    const project = await one("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`cc-${key}`, `CC${key}`.slice(0, 20)]);
    const supplier = await one('INSERT INTO suppliers (code, name_en, name_ar) VALUES ($1, $1, $1) RETURNING id', [`cc-s-${key}`]);
    const material = await one("INSERT INTO item_master (code, category, name_en, name_ar, unit) VALUES ($1, 'cc', $1, $1, 'ea') RETURNING id", [`cc-m-${key}`]);
    const warehouse = await one("INSERT INTO warehouses (name, name_en, type, project_id) VALUES ($1, $1, 'site', $2) RETURNING id", [`cc-w-${key}`, project.id]);
    await db.query('INSERT INTO supplier_materials (supplier_id, material_id) VALUES ($1, $2)', [supplier.id, material.id]);
    return { key, project, supplier, material, warehouse };
  };
  const newPo = (w, quantity, rate = 10) => tx((q) => svc.createPurchaseOrder(q, {
    supplier_id: w.supplier.id, project_id: w.project.id, warehouse_id: w.warehouse.id, lines: [{ material_id: w.material.id, quantity, unit_rate: rate }], created_by: owner.id,
  }));

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    svc = require('../../services/procurementService');
    inventory = require('../../services/inventoryEngine');
    outbox = require('../../services/outboxDispatcher');
    sweepLeader = require('../../services/sweepLeader');
    costAccrual = require('../../services/costAccrual');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ('cc-owner', $1, 'x', 'owner') RETURNING id, token_version", [`cc-${tag}@test.io`]);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [row.id]);
    owner = { id: row.id, role: 'owner', name: 'cc-owner', token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
  });

  afterAll(async () => {
    await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [owner.id]);
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [owner.id]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('stock issue race: 12 parallel issues of 3 against 20 in stock: exactly 6 succeed, stock ends at 2, never negative', async () => {
    const w = await world();
    await inventory.createMovement(db.query, { warehouse_id: w.warehouse.id, material_id: w.material.id, movement_type: 'opening', quantity: 20, unit_cost: 5 });
    const results = await quiet(() => settle(Array.from({ length: 12 }, () => inventory.createMovement(db.query, {
      warehouse_id: w.warehouse.id, material_id: w.material.id, movement_type: 'issue', quantity: 3, created_by: owner.id,
    }))));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(6);
    const stock = await one('SELECT quantity FROM warehouse_stock WHERE warehouse_id = $1 AND item_id = $2', [w.warehouse.id, w.material.id]);
    expect(Number(stock.quantity)).toBe(2);
    const ledger = await one("SELECT COALESCE(SUM(CASE WHEN movement_type = 'issue' THEN -quantity ELSE quantity END), 0) s FROM stock_movements WHERE warehouse_id = $1 AND material_id = $2", [w.warehouse.id, w.material.id]);
    expect(Number(ledger.s)).toBe(2);                                          // ledger and projection agree
  });

  test('double MIR decision: 5 parallel accepts of one MIR decide it once', async () => {
    const w = await world();
    const po = await newPo(w, 10);
    const delivery = await tx((q) => svc.createDelivery(q, { purchase_order_id: po.id, warehouse_id: w.warehouse.id, lines: [{ purchase_order_line_id: po.lines[0].id, material_id: w.material.id, quantity: 10 }], received_by: owner.id }));
    const mir = await tx((q) => svc.createMir(q, { delivery_id: delivery.id, created_by: owner.id }));
    const results = await quiet(() => settle(Array.from({ length: 5 }, () => tx((q) => svc.decideMir(q, mir.id, { id: owner.id, role: 'owner' }, 'accept')))));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const releases = await all("SELECT id FROM stock_movements WHERE movement_type = 'quarantine_release' AND reference_type = 'mir' AND reference_id = $1", [mir.id]);
    expect(releases).toHaveLength(1);                                          // the stock was released once
    const stock = await one('SELECT quantity FROM warehouse_stock WHERE warehouse_id = $1 AND item_id = $2', [w.warehouse.id, w.material.id]);
    expect(Number(stock.quantity)).toBe(10);
  });

  test('double approval: 8 parallel approvals of one request record one decision and one outcome', async () => {
    const requestId = (Number(tag) % 2000000) * 1000 + seq + 700000;           // inside int4, unique per run
    const created = await call('POST', '/api/approvals/request', { module_name: 'expenses', request_type: 'create', request_id: requestId });
    expect(created.status).toBe(200);
    const id = created.body.request.id;
    const results = await quiet(() => Promise.all(Array.from({ length: 8 }, () => call('PUT', `/api/approvals/${id}/approve`, { notes: 'race' }))));
    const row = await one('SELECT stage, status FROM approval_requests WHERE id = $1', [id]);
    // Every request that won a stage moved the request exactly one stage: the number of 200s equals the stages passed.
    const stagesPassed = results.filter((r) => r.status === 200).length;
    const decisions = await all("SELECT wa.id FROM workflow_actions wa JOIN workflow_instances wi ON wi.id = wa.instance_id WHERE wi.legacy_approval_id = $1 AND wa.decision = 'approve'", [id]);
    expect(decisions).toHaveLength(stagesPassed);
    expect(stagesPassed).toBeGreaterThanOrEqual(1);
    expect(stagesPassed).toBeLessThanOrEqual(2);                               // manager review + owner review at most
    expect(['pending', 'approved']).toContain(row.status);
    const instances = await all('SELECT id FROM workflow_instances WHERE legacy_approval_id = $1', [id]);
    expect(instances).toHaveLength(1);
  });

  test('numbering collisions: 40 parallel purchase requisitions and 40 parallel invoices get 80 distinct numbers', async () => {
    const w = await world();
    const prs = await quiet(() => settle(Array.from({ length: 40 }, (_, i) => tx((q) => svc.createPurchaseRequest(q, {
      title: `n${i}`, project_id: w.project.id, lines: [{ material_id: w.material.id, quantity: 1 }], created_by: owner.id,
    })))));
    expect(prs.every((r) => r.status === 'fulfilled')).toBe(true);
    const numbers = prs.map((r) => r.value.request_number);
    expect(new Set(numbers).size).toBe(40);
    const client = await one("INSERT INTO clients (name_ar, name_en, code, is_active) VALUES ($1, $1, $2, true) RETURNING id", [`cc-c-${w.key}`, `CC${w.key}`.slice(0, 20)]);
    const invs = await Promise.all(Array.from({ length: 40 }, () => call('POST', '/api/invoices', { project_id: w.project.id, client_id: client.id, amount: 10, issue_date: '2026-10-01' })));
    expect(invs.every((r) => r.status === 201)).toBe(true);
    expect(new Set(invs.map((r) => r.body.data.invoice_number)).size).toBe(40);
  });

  test('duplicate delivery: 6 parallel deliveries of 5 against a PO of 10 (5% tolerance): the total never exceeds the allowance', async () => {
    const w = await world();
    const po = await newPo(w, 10);
    const results = await quiet(() => settle(Array.from({ length: 6 }, () => tx((q) => svc.createDelivery(q, {
      purchase_order_id: po.id, warehouse_id: w.warehouse.id, lines: [{ purchase_order_line_id: po.lines[0].id, material_id: w.material.id, quantity: 5 }], received_by: owner.id,
    })))));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBe(2);                                                        // 5 + 5 = 10; a third would exceed 10.5
    const line = await one('SELECT delivered_quantity FROM purchase_order_lines WHERE id = $1', [po.lines[0].id]);
    expect(Number(line.delivered_quantity)).toBe(10);
  });

  test('idempotent cost posting: replays and parallel posts of one GRN leave one cost row and one entry', async () => {
    const w = await world();
    const po = await newPo(w, 10, 100);
    const grn = await one(
      "INSERT INTO goods_receipt_notes (grn_number, purchase_order_id, warehouse_id, status) VALUES ($1, $2, $3, 'posted') RETURNING *", [`GRN-cc-${w.key}`, po.id, w.warehouse.id]);
    await db.query('INSERT INTO grn_lines (grn_id, purchase_order_line_id, material_id, quantity) VALUES ($1, $2, $3, 10)', [grn.id, po.lines[0].id, w.material.id]);
    const posts = await settle(Array.from({ length: 6 }, () => db.transaction((c) => costAccrual.accrueGrnCost(c.query.bind(c), grn, { userId: owner.id }))));
    expect(posts.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(await all("SELECT id FROM project_costs WHERE source_type = 'grn' AND source_id = $1", [grn.id])).toHaveLength(1);
    expect(await all("SELECT id FROM journal_entries WHERE reference_type = 'grn_cost' AND reference_id = $1", [grn.id])).toHaveLength(1);
    await tx((q) => costAccrual.accrueGrnCost(q, grn, { userId: owner.id }));  // a later replay too
    expect(await all("SELECT id FROM project_costs WHERE source_type = 'grn' AND source_id = $1", [grn.id])).toHaveLength(1);
  });

  test('two dispatcher instances never deliver one event twice', async () => {
    const type = `cc.test.${tag}.${seq += 1}`;
    for (let i = 0; i < 30; i += 1) {
      await db.query("INSERT INTO event_outbox (event_id, event_type, entity_type, entity_id, payload) VALUES ($1, $2, 'x', $3, '{}'::jsonb)", [`${type}-${i}`, type, i]);
    }
    const seen = [];
    const handlers = { [type]: async (evt) => { seen.push(evt.entityId); await new Promise((r) => setTimeout(r, 5)); } };
    const runner = async () => { let total = 0; for (let i = 0; i < 6; i += 1) { const r = await outbox.dispatchOnce(null, { types: [type], batchSize: 5, handlers }); total += r.delivered; } return total; };
    const [a, b] = await Promise.all([runner(), runner()]);
    expect(a + b).toBe(30);
    expect(seen).toHaveLength(30);
    expect(new Set(seen).size).toBe(30);                                       // each exactly once
    expect(await all("SELECT id FROM event_outbox WHERE event_type = $1 AND status <> 'delivered'", [type])).toHaveLength(0);
  });

  test('two sweep runners: only the leader runs the sweep at a time', async () => {
    const name = `cc_sweep_${tag}_${seq += 1}`;
    let running = 0; let maxRunning = 0; let runs = 0;
    const fn = async () => { running += 1; maxRunning = Math.max(maxRunning, running); runs += 1; await new Promise((r) => setTimeout(r, 150)); running -= 1; };
    await Promise.all(Array.from({ length: 4 }, () => sweepLeader.runSweepAsLeader(name, fn, { query: db.query })));
    expect(maxRunning).toBe(1);
    expect(runs).toBeLessThan(4);                                               // the others saw the lock held and skipped
    expect(runs).toBeGreaterThanOrEqual(1);
  });
});
