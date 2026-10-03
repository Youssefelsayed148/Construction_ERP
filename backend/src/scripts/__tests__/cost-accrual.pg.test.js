// Real PostgreSQL + real app. Phase 3.1: cost accrual and ledger posting.
//
// Reproduced first (these tests failed on the pre-3.1 code):
//   * replaying the same GRN event twice inserted two project_costs rows and two ledger entries
//     (costEventListener-style inserts were not idempotent);
//   * two parallel posts of the same source could both insert (check-then-act, no unique index);
//   * approving a supplier invoice for a GRN-accrued stocked PO would have accrued the cost a second time;
//   * service invoices had no approval step, so nothing accrued on approval;
//   * an unmapped ledger account failed without naming the key in a stable error code.
//
// The accrual rule lives in ONE map (services/costAccrual.js COST_ACCRUAL_RULES):
//   stocked_material: accrues at GRN acceptance        -> Dr material_cost | Cr payable (kind grn_cost)
//   service:          accrues at supplier invoice approval -> Dr service_cost (+ Dr vat_input on tax)
//                                                       | Cr payable        (kind supplier_invoice_cost)
//   supplier payment: Dr payable | Cr cash (kind supplier_payment); void reverses it exactly once.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('3.1 cost accrual and postings (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let owner; let costAccrual; let svc;
  const tag = String(Date.now()).slice(-7);
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const call = async (method, path, body) => {
    const res = await fetch(`${base}${path}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` }, body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* empty */ }
    return { status: res.status, body: json };
  };
  const mapped = async (key) => (await one('SELECT account_id FROM gl_account_map WHERE key = $1', [key]) || {}).account_id;
  const entries = async (type, id) => (await db.query('SELECT * FROM journal_entries WHERE reference_type = $1 AND reference_id = $2 ORDER BY id', [type, id])).rows;
  const shape = async (entry) => (await db.query('SELECT account_id, debit, credit FROM journal_entry_lines WHERE journal_entry_id = $1 ORDER BY line_order', [entry.id]))
    .rows.map((l) => [l.account_id, Number(l.debit), Number(l.credit)]);
  const costRows = async (type, id) => (await db.query('SELECT * FROM project_costs WHERE source_type = $1 AND source_id = $2 ORDER BY id', [type, id])).rows;
  const bySide = (rows) => [...rows].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const ids = {};

  const tx = (fn) => db.transaction((client) => fn(client.query.bind(client)));

  // Builds a PO (one stocked line + one service line) and takes it through delivery -> MIR accept -> GRN.
  const buildGrnFixture = async () => {
    const po = await tx((q) => svc.createPurchaseOrder(q, {
      supplier_id: ids.supplier, project_id: ids.project, warehouse_id: ids.warehouse,
      lines: [
        { material_id: ids.material, quantity: 10, unit_rate: 100 },
        { material_id: null, description: 'Installation service', quantity: 1, unit_rate: 400 },
      ],
      created_by: owner.id,
    }));
    const delivery = await tx((q) => svc.createDelivery(q, {
      purchase_order_id: po.id, warehouse_id: ids.warehouse,
      // Only the stocked line is delivered to the warehouse; services are not stock movements.
      lines: [
        { purchase_order_line_id: po.lines[0].id, material_id: ids.material, quantity: 10 },
      ],
      received_by: owner.id,
    }));
    const mir = await tx((q) => svc.createMir(q, { delivery_id: delivery.id, created_by: owner.id }));
    await tx((q) => svc.decideMir(q, mir.id, { id: owner.id }, 'accept'));
    const grn = await tx((q) => svc.createGrn(q, { mir_id: mir.id, created_by: owner.id, received_by: owner.id }));
    return { po, grn };
  };

  // A GRN row written directly (no accrual yet): lets a test exercise the accrual function itself
  // (concurrency, rollback) without going through svc.createGrn, which accrues internally.
  const insertBareGrn = async ({ po, quantity = 10 }) => {
    const stockedLine = po.lines.find((l) => l.material_id != null);
    const grn = await one(
      `INSERT INTO goods_receipt_notes (grn_number, purchase_order_id, warehouse_id, status)
       VALUES ($1, $2, $3, 'posted') RETURNING *`,
      [`GRN-${tag}-bare-${(await one('SELECT count(*)::int n FROM goods_receipt_notes')).n}`, po.id, ids.warehouse]
    );
    await db.query('INSERT INTO grn_lines (grn_id, purchase_order_line_id, material_id, quantity) VALUES ($1, $2, $3, $4)',
      [grn.id, stockedLine.id, ids.material, quantity]);
    return grn;
  };

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    costAccrual = require('../../services/costAccrual');
    svc = require('../../services/procurementService');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ('ca-owner', $1, 'x', 'owner') RETURNING id, token_version", [`ca-${tag}@test.io`]);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [row.id]);
    owner = { id: row.id, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
    ids.supplier = (await one('INSERT INTO suppliers (code, name_en, name_ar) VALUES ($1, $1, $1) RETURNING id', [`ca-${tag}`])).id;
    ids.project = (await one("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`ca-${tag}`, `CA${tag}`.slice(0, 20)])).id;
    ids.material = (await one("INSERT INTO item_master (code, category, name_en, name_ar, unit) VALUES ($1, 'test', $1, $1, 'ea') RETURNING id", [`ca-m-${tag}`])).id;
    ids.warehouse = (await one("INSERT INTO warehouses (name, name_en, type) VALUES ($1, $1, 'central') RETURNING id", [`ca-${tag}`])).id;
    await db.query('INSERT INTO supplier_materials (supplier_id, material_id) VALUES ($1, $2)', [ids.supplier, ids.material]);
    // Repair the five mappings this suite exercises (an earlier failed run may have deleted one).
    for (const [key, code] of [['material_cost', '5100'], ['payable', '2000'], ['cash', '1000'], ['service_cost', '5150'], ['vat_input', '1400']]) {
      await db.query(
        `INSERT INTO gl_account_map (key, account_id) SELECT $1, id FROM accounts WHERE code = $2
         ON CONFLICT (key) DO UPDATE SET account_id = (SELECT id FROM accounts WHERE code = $2)`,
        [key, code]
      );
    }
  });

  afterAll(async () => {
    await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [owner.id]);
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [owner.id]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('a GRN accrues its stocked cost once, balanced, and a replay posts nothing more', async () => {
    const { grn } = await buildGrnFixture();
    const rows = await costRows('grn', grn.id);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount)).toBe(1000); // 10 accepted x 100 unit rate, stocked line only
    expect(rows[0].project_id).toBe(ids.project);

    const [entry] = await entries('grn_cost', grn.id);
    expect(entry).toBeTruthy();
    expect(await shape(entry)).toEqual([[await mapped('material_cost'), 1000, 0], [await mapped('payable'), 0, 1000]]);

    // Replay the same event: no second cost row, no second ledger entry.
    const replayed = await tx((q) => costAccrual.accrueGrnCost(q, grn, { userId: owner.id }));
    expect(replayed).toBeNull();
    expect(await costRows('grn', grn.id)).toHaveLength(1);
    expect(await entries('grn_cost', grn.id)).toHaveLength(1);
  });

  test('two parallel posts of the same GRN source produce one cost row and one ledger entry', async () => {
    const { po } = await buildGrnFixture();
    const grn = await insertBareGrn({ po });
    // Simulate the event delivered twice at once (two dispatcher instances, two transactions).
    const results = await Promise.allSettled([
      db.transaction((client) => costAccrual.accrueGrnCost(client.query.bind(client), grn, { userId: owner.id })),
      db.transaction((client) => costAccrual.accrueGrnCost(client.query.bind(client), grn, { userId: owner.id })),
    ]);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    const settled = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    expect(settled.filter(Boolean)).toHaveLength(1); // exactly one did the work
    expect(await costRows('grn', grn.id)).toHaveLength(1);
    expect(await entries('grn_cost', grn.id)).toHaveLength(1);
  });

  test('approving the supplier invoice of a GRN-accrued stocked PO accrues nothing more', async () => {
    const { po, grn } = await buildGrnFixture();
    const stockedLine = po.lines.find((l) => l.material_id != null);
    const created = await call('POST', '/api/procurement/invoices', {
      supplier_id: ids.supplier, purchase_order_id: po.id, invoice_number: `ca-st-${tag}`,
      total_amount: 1000, tax_amount: 0,
      lines: [{ purchase_order_line_id: stockedLine.id, material_id: ids.material, quantity: 10, unit_price: 100 }],
    });
    expect(created.status).toBe(201);
    const invoice = created.body.data.invoice || created.body.data;
    expect(await costRows('supplier_invoice', invoice.id)).toHaveLength(0);

    const approved = await call('POST', `/api/procurement/invoices/${invoice.id}/approve`);
    expect(approved.status).toBe(200);
    // The GRN already owns this cost: no second cost row, no second ledger entry.
    expect(await costRows('supplier_invoice', invoice.id)).toHaveLength(0);
    expect(await costRows('grn', grn.id)).toHaveLength(1);
    expect(await entries('grn_cost', grn.id)).toHaveLength(1);
    expect(await entries('supplier_invoice_cost', invoice.id)).toHaveLength(0);
    expect(await entries('supplier_invoice_cost_void', invoice.id)).toHaveLength(0);
  });

  test('a service invoice accrues only on approval, once, with tax on its own line', async () => {
    const created = await call('POST', '/api/procurement/invoices', {
      supplier_id: ids.supplier, invoice_number: `ca-sv-${tag}`,
      total_amount: 570, tax_amount: 70,
      lines: [{ material_id: null, quantity: 1, unit_price: 570 }],
    });
    expect(created.status).toBe(201);
    const invoice = created.body.data.invoice || created.body.data;
    expect(await costRows('supplier_invoice', invoice.id)).toHaveLength(0); // nothing before approval

    const approved = await call('POST', `/api/procurement/invoices/${invoice.id}/approve`);
    expect(approved.status).toBe(200);
    const rows = await costRows('supplier_invoice', invoice.id);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount)).toBe(500); // net of tax

    const [entry] = await entries('supplier_invoice_cost', invoice.id);
    expect(entry).toBeTruthy();
    expect(bySide(await shape(entry))).toEqual(bySide([
      [await mapped('service_cost'), 500, 0],
      [await mapped('vat_input'), 70, 0],
      [await mapped('payable'), 0, 570],
    ]));
    

    // Approving again is refused and posts nothing more.
    const again = await call('POST', `/api/procurement/invoices/${invoice.id}/approve`);
    expect(again.status).toBe(409);
    expect(await costRows('supplier_invoice', invoice.id)).toHaveLength(1);
    expect(await entries('supplier_invoice_cost', invoice.id)).toHaveLength(1);
  });

  test('an unmapped ledger account fails the approval naming the key, and nothing is saved', async () => {
    const original = await mapped('service_cost');
    const created = await call('POST', '/api/procurement/invoices', {
      supplier_id: ids.supplier, invoice_number: `ca-un-${tag}`,
      total_amount: 200, tax_amount: 0,
      lines: [{ material_id: null, quantity: 1, unit_price: 200 }],
    });
    expect(created.status).toBe(201);
    const invoice = created.body.data.invoice || created.body.data;
    await db.query("DELETE FROM gl_account_map WHERE key = 'service_cost'");
    try {
      const refused = await call('POST', `/api/procurement/invoices/${invoice.id}/approve`);
      expect(refused.status).toBe(500);
      expect(String(refused.body.error)).toMatch(/service_cost/);
      expect(refused.body.error_code).toBe('ledger_account_not_mapped');
      expect(refused.body.error_params).toEqual({ key: 'service_cost' });
      expect(await one('SELECT status FROM supplier_invoices WHERE id = $1', [invoice.id]).then((r) => r.status)).toBe('received');
      expect(await costRows('supplier_invoice', invoice.id)).toHaveLength(0);
    } finally {
      await db.query("INSERT INTO gl_account_map (key, account_id) VALUES ('service_cost', $1)", [original]);
    }
    // After the mapping is back, approval works exactly once.
    expect((await call('POST', `/api/procurement/invoices/${invoice.id}/approve`)).status).toBe(200);
    expect(await costRows('supplier_invoice', invoice.id)).toHaveLength(1);
  });

  test('a supplier payment posts payable against cash and its void reverses it exactly once', async () => {
    const p = await call('POST', '/api/payments', {
      direction: 'ap', supplier_id: ids.supplier, project_id: ids.project,
      amount: 350, payment_date: '2026-01-15',
    });
    expect(p.status).toBe(201);
    const [entry] = await entries('supplier_payment', p.body.data.id);
    expect(entry).toBeTruthy();
    expect(await shape(entry)).toEqual([[await mapped('payable'), 350, 0], [await mapped('cash'), 0, 350]]);

    const voids = await Promise.all(Array.from({ length: 3 }, () => call('DELETE', `/api/payments/${p.body.data.id}`, { reason: 'wrong account' })));
    expect(voids.filter((v) => v.status === 200)).toHaveLength(1);
    const reversals = await entries('supplier_payment_void', p.body.data.id);
    expect(reversals).toHaveLength(1);
    expect(bySide(await shape(reversals[0]))).toEqual(bySide([[await mapped('cash'), 350, 0], [await mapped('payable'), 0, 350]]));
  });

  test('a cost accrual that fails rolls back with its caller, leaving no cost row and no entry', async () => {
    const { po } = await buildGrnFixture();
    const grn = await insertBareGrn({ po });
    const materialCostId = await mapped('material_cost');
    expect(materialCostId).toBeTruthy();
    await db.query("DELETE FROM gl_account_map WHERE key = 'material_cost'");
    try {
      await expect(db.transaction((client) => costAccrual.accrueGrnCost(client.query.bind(client), grn, { userId: owner.id })))
        .rejects.toMatchObject({ message: expect.stringMatching(/material_cost/) });
      expect(await costRows('grn', grn.id)).toHaveLength(0);
      expect(await entries('grn_cost', grn.id)).toHaveLength(0);
    } finally {
      await db.query(
        `INSERT INTO gl_account_map (key, account_id) VALUES ('material_cost', $1)
         ON CONFLICT (key) DO UPDATE SET account_id = $1`,
        [materialCostId]
      );
    }
  });

  test('the database itself refuses a duplicate cost row (source_type, source_id)', async () => {
    const { grn } = await buildGrnFixture();
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await expect(client.query(
        "INSERT INTO project_costs (project_id, source_type, source_id, amount) VALUES ($1, 'grn', $2, 1)",
        [ids.project, grn.id],
      )).rejects.toMatchObject({ code: '23505' });
    } finally { await client.query('ROLLBACK'); client.release(); }
  });
});
