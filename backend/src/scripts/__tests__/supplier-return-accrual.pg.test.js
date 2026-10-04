// Real PostgreSQL + real app. Closeout A2.1: supplier returns reverse their share of the GRN cost
// (decision 2) and the invoice/GRN accrual pairing rules (decisions 5 and 6).
//
// Reproduced first (these failed on the pre-A2.1 code):
//   * a supplier return reduced stock and the GRN accepted quantity but left the GRN cost row and the
//     ledger entry untouched, so cost and AP stayed overstated;
//   * a stocked invoice with no GRN accrual never accrued at approval (the "legacy GRN-less" rule of
//     decision 5 was documented but the code returned early), and a GRN received later would have
//     accrued the same goods a second time;
//   * a mixed stocked/service invoice posted no input tax at all (decision 6: the full invoice tax goes
//     to vat_input, and the AP credits across the chain equal the invoice total).
//
// Rules under test (services/costAccrual.js COST_ACCRUAL_RULES):
//   * return reversal: source_type 'supplier_return', UNIQUE(source_type, source_id), valued at the
//     original GRN unit cost, proportional for partial returns, never more than was accrued;
//   * a GRN line and an invoice line for the same PO line pair off quantity for quantity: the goods
//     accrue once, whichever event comes first.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('A2.1 supplier-return reversal and accrual pairing (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let owner; let svc; let costAccrual;
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
  const bySide = (rows) => [...rows].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const ids = {};
  const tx = (fn) => db.transaction((client) => fn(client.query.bind(client)));
  const payableCredits = async (refs) => {
    const accountId = await mapped('payable');
    let total = 0;
    for (const [type, id] of refs) {
      for (const entry of await entries(type, id)) {
        for (const l of await shape(entry)) if (l[0] === accountId) total += l[2] - l[1];
      }
    }
    return Math.round(total * 100) / 100;
  };

  const newPo = (lines) => tx((q) => svc.createPurchaseOrder(q, {
    supplier_id: ids.supplier, project_id: ids.project, warehouse_id: ids.warehouse, lines, created_by: owner.id,
  }));
  const receive = async (po, quantity) => {
    const stocked = po.lines.find((l) => l.material_id != null);
    const delivery = await tx((q) => svc.createDelivery(q, {
      purchase_order_id: po.id, warehouse_id: ids.warehouse,
      lines: [{ purchase_order_line_id: stocked.id, material_id: ids.material, quantity }],
      received_by: owner.id,
    }));
    const mir = await tx((q) => svc.createMir(q, { delivery_id: delivery.id, created_by: owner.id }));
    await tx((q) => svc.decideMir(q, mir.id, { id: owner.id }, 'accept'));
    return tx((q) => svc.createGrn(q, { mir_id: mir.id, created_by: owner.id, received_by: owner.id }));
  };
  const invoiceFor = async (po, { lines, total, tax = 0, number }) => {
    const created = await call('POST', '/api/procurement/invoices', {
      supplier_id: ids.supplier, purchase_order_id: po.id, invoice_number: `${number}-${tag}`, total_amount: total, tax_amount: tax, lines,
    });
    expect(created.status).toBe(201);
    const invoice = created.body.data.invoice || created.body.data;
    const approved = await call('POST', `/api/procurement/invoices/${invoice.id}/approve`);
    expect(approved.status).toBe(200);
    return invoice;
  };
  const returnQty = async (grn, quantity) => {
    const r = await call('POST', `/api/procurement/grn/${grn.id}/returns`, { reason: 'damaged', lines: [{ material_id: ids.material, quantity }] });
    expect(r.status).toBe(201);
    return r.body.data;
  };
  const reversedFor = async (grnId) => Number((await one(
    `SELECT COALESCE(SUM(pc.amount), 0) AS s FROM project_costs pc JOIN supplier_returns sr ON sr.id = pc.source_id
      WHERE pc.source_type = 'supplier_return' AND sr.grn_id = $1`, [grnId])).s);

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    svc = require('../../services/procurementService');
    costAccrual = require('../../services/costAccrual');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ('sr-owner', $1, 'x', 'owner') RETURNING id, token_version", [`sr-${tag}@test.io`]);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [row.id]);
    owner = { id: row.id, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
    ids.supplier = (await one('INSERT INTO suppliers (code, name_en, name_ar) VALUES ($1, $1, $1) RETURNING id', [`sr-${tag}`])).id;
    ids.project = (await one("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`sr-${tag}`, `SR${tag}`.slice(0, 20)])).id;
    ids.material = (await one("INSERT INTO item_master (code, category, name_en, name_ar, unit) VALUES ($1, 'test', $1, $1, 'ea') RETURNING id", [`sr-m-${tag}`])).id;
    ids.warehouse = (await one("INSERT INTO warehouses (name, name_en, type) VALUES ($1, $1, 'central') RETURNING id", [`sr-${tag}`])).id;
    await db.query('INSERT INTO supplier_materials (supplier_id, material_id) VALUES ($1, $2)', [ids.supplier, ids.material]);
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

  // ---- decision 2: supplier returns reverse their share of the GRN cost ----

  test('a partial return reverses its share at the original GRN unit cost: one cost row, one balanced entry', async () => {
    const po = await newPo([{ material_id: ids.material, quantity: 10, unit_rate: 100 }]);
    const grn = await receive(po, 10);
    expect(Number((await costRows('grn', grn.id))[0].amount)).toBe(1000);

    const ret = await returnQty(grn, 4);
    const rows = await costRows('supplier_return', ret.id);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount)).toBe(-400);
    expect(rows[0].project_id).toBe(ids.project);

    const [entry] = await entries('supplier_return_cost', ret.id);
    expect(entry).toBeTruthy();
    expect(bySide(await shape(entry))).toEqual(bySide([[await mapped('payable'), 400, 0], [await mapped('material_cost'), 0, 400]]));
    // The GRN's own cost row and entry are untouched; the net cost of the chain is 600.
    expect(Number((await costRows('grn', grn.id))[0].amount)).toBe(1000);
    expect(Number((await one("SELECT SUM(pc.amount) s FROM project_costs pc WHERE (pc.source_type = 'grn' AND pc.source_id = $1) OR (pc.source_type = 'supplier_return' AND pc.source_id = $2)", [grn.id, ret.id])).s)).toBe(600);
  });

  test('returns of the whole GRN reverse exactly what was accrued, in several steps, and never more', async () => {
    const po = await newPo([{ material_id: ids.material, quantity: 3, unit_rate: 33.33 }]);
    const grn = await receive(po, 3);
    const accrued = Number((await costRows('grn', grn.id))[0].amount); // 99.99
    await returnQty(grn, 1);
    await returnQty(grn, 1);
    await returnQty(grn, 1); // the last one closes the books exactly (no rounding crumbs)
    expect(await reversedFor(grn.id)).toBeCloseTo(-accrued, 2);

    // Nothing is left to return: the existing quantity check refuses, and no further reversal appears.
    const again = await call('POST', `/api/procurement/grn/${grn.id}/returns`, { lines: [{ material_id: ids.material, quantity: 1 }] });
    expect(again.status).toBe(400);
    expect(await reversedFor(grn.id)).toBeCloseTo(-accrued, 2);
  });

  test('replaying the reversal of one return posts nothing more, even when two run at once', async () => {
    const po = await newPo([{ material_id: ids.material, quantity: 5, unit_rate: 20 }]);
    const grn = await receive(po, 5);
    const ret = await returnQty(grn, 2);
    const lines = (await db.query('SELECT * FROM grn_lines WHERE grn_id = $1', [grn.id])).rows;
    const allocations = [{ grnLine: lines[0], quantity: 2 }];
    const results = await Promise.allSettled([
      db.transaction((c) => costAccrual.reverseGrnCostForReturn(c.query.bind(c), ret, allocations, { userId: owner.id })),
      db.transaction((c) => costAccrual.reverseGrnCostForReturn(c.query.bind(c), ret, allocations, { userId: owner.id })),
    ]);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(await costRows('supplier_return', ret.id)).toHaveLength(1);
    expect(await entries('supplier_return_cost', ret.id)).toHaveLength(1);
    expect(await reversedFor(grn.id)).toBe(-40);
  });

  test('the database refuses a second journal entry for the same return', async () => {
    const po = await newPo([{ material_id: ids.material, quantity: 2, unit_rate: 50 }]);
    const grn = await receive(po, 2);
    const ret = await returnQty(grn, 1);
    await expect(db.query(
      "INSERT INTO journal_entries (entry_number, date, description, reference_type, reference_id) VALUES ($1, CURRENT_DATE, 'dup', 'supplier_return_cost', $2)",
      [`JE-dup-${tag}`, ret.id]
    )).rejects.toMatchObject({ code: '23505' });
  });

  test('a return against a GRN whose cost was not accrued at the GRN reverses nothing (legacy chain)', async () => {
    const po = await newPo([{ material_id: ids.material, quantity: 4, unit_rate: 25 }]);
    const grn = await receive(po, 4);
    // Make it look like a pre-3.1 GRN: no cost row, no ledger entry, no claim.
    await db.query("DELETE FROM journal_entry_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE reference_type = 'grn_cost' AND reference_id = $1)", [grn.id]);
    await db.query("DELETE FROM journal_entries WHERE reference_type = 'grn_cost' AND reference_id = $1", [grn.id]);
    await db.query("DELETE FROM project_costs WHERE source_type = 'grn' AND source_id = $1", [grn.id]);
    await db.query('DELETE FROM cost_accrual_claims WHERE source_type = $1 AND source_id = $2', ['grn', grn.id]);
    const ret = await returnQty(grn, 1);
    expect(await costRows('supplier_return', ret.id)).toHaveLength(0);
    expect(await entries('supplier_return_cost', ret.id)).toHaveLength(0);
  });

  // ---- decision 5: legacy GRN-less stocked invoices accrue at approval, once ----

  test('a stocked invoice with no GRN accrues at approval, and a GRN received later does not accrue again', async () => {
    const po = await newPo([{ material_id: ids.material, quantity: 10, unit_rate: 100 }]);
    const stocked = po.lines[0];
    const invoice = await invoiceFor(po, {
      number: 'lg', total: 1000, tax: 0,
      lines: [{ purchase_order_line_id: stocked.id, material_id: ids.material, quantity: 10, unit_price: 100 }],
    });
    const invoiceCost = await costRows('supplier_invoice', invoice.id);
    expect(invoiceCost).toHaveLength(1);
    expect(Number(invoiceCost[0].amount)).toBe(1000);
    const [entry] = await entries('supplier_invoice_cost', invoice.id);
    expect(bySide(await shape(entry))).toEqual(bySide([[await mapped('material_cost'), 1000, 0], [await mapped('payable'), 0, 1000]]));

    const grn = await receive(po, 10);
    expect(await costRows('grn', grn.id)).toHaveLength(0);
    expect(await entries('grn_cost', grn.id)).toHaveLength(0);
    // The chain's accrued cost is the invoice's 1000, not 2000.
    const total = Number((await one(
      `SELECT COALESCE(SUM(amount), 0) s FROM project_costs
        WHERE (source_type = 'supplier_invoice' AND source_id = $1) OR (source_type = 'grn' AND source_id = $2)`, [invoice.id, grn.id])).s);
    expect(total).toBe(1000);
  });

  test('a partial GRN after a full stocked invoice, then the rest: the goods accrue once in total', async () => {
    const po = await newPo([{ material_id: ids.material, quantity: 10, unit_rate: 100 }]);
    const invoice = await invoiceFor(po, {
      number: 'lg2', total: 600, tax: 0,
      lines: [{ purchase_order_line_id: po.lines[0].id, material_id: ids.material, quantity: 6, unit_price: 100 }],
    });
    const g1 = await receive(po, 4);   // inside what the invoice covered
    const g2 = await receive(po, 6);   // 2 covered, 4 new
    expect(await costRows('grn', g1.id)).toHaveLength(0);
    expect(Number((await costRows('grn', g2.id))[0].amount)).toBe(400);
    const total = Number((await one(
      `SELECT COALESCE(SUM(amount), 0) s FROM project_costs
        WHERE (source_type = 'supplier_invoice' AND source_id = $1) OR (source_type = 'grn' AND source_id = ANY($2::int[]))`, [invoice.id, [g1.id, g2.id]])).s);
    expect(total).toBe(1000);
  });

  test('a GRN first, then the invoice for the same goods: only one accrual (the earlier behaviour is unchanged)', async () => {
    const po = await newPo([{ material_id: ids.material, quantity: 10, unit_rate: 100 }]);
    const grn = await receive(po, 10);
    const invoice = await invoiceFor(po, {
      number: 'gi', total: 1000, tax: 0,
      lines: [{ purchase_order_line_id: po.lines[0].id, material_id: ids.material, quantity: 10, unit_price: 100 }],
    });
    expect(await costRows('grn', grn.id)).toHaveLength(1);
    expect(await costRows('supplier_invoice', invoice.id)).toHaveLength(0);
  });

  // ---- decision 6: mixed invoices ----

  test('a mixed invoice accrues the service net, books the full tax on vat_input, and AP across the chain equals the invoice total', async () => {
    const po = await newPo([
      { material_id: ids.material, quantity: 10, unit_rate: 100 },
      { material_id: null, description: 'Installation service', quantity: 1, unit_rate: 400 },
    ]);
    const grn = await receive(po, 10);                  // Dr material 1000 / Cr payable 1000
    const [stockedLine, serviceLine] = po.lines;
    // total = 1000 stocked + 400 service + 140 tax
    const invoice = await invoiceFor(po, {
      number: 'mx', total: 1540, tax: 140,
      lines: [
        { purchase_order_line_id: stockedLine.id, material_id: ids.material, quantity: 10, unit_price: 100 },
        { purchase_order_line_id: serviceLine.id, material_id: null, quantity: 1, unit_price: 400 },
      ],
    });
    const rows = await costRows('supplier_invoice', invoice.id);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount)).toBe(400);          // the service portion, net

    const [entry] = await entries('supplier_invoice_cost', invoice.id);
    expect(bySide(await shape(entry))).toEqual(bySide([
      [await mapped('service_cost'), 400, 0],
      [await mapped('vat_input'), 140, 0],            // the FULL invoice tax
      [await mapped('payable'), 0, 540],
    ]));
    // GRN credit (1000) + invoice credit (540) = the invoice total.
    expect(await payableCredits([['grn_cost', grn.id], ['supplier_invoice_cost', invoice.id]])).toBe(1540);
  });

  test('a mixed invoice with no GRN accrues the stocked goods too, and the full tax once', async () => {
    const po = await newPo([
      { material_id: ids.material, quantity: 5, unit_rate: 100 },
      { material_id: null, description: 'Hauling', quantity: 1, unit_rate: 200 },
    ]);
    const invoice = await invoiceFor(po, {
      number: 'mx2', total: 798, tax: 98,
      lines: [
        { purchase_order_line_id: po.lines[0].id, material_id: ids.material, quantity: 5, unit_price: 100 },
        { purchase_order_line_id: po.lines[1].id, material_id: null, quantity: 1, unit_price: 200 },
      ],
    });
    const rows = await costRows('supplier_invoice', invoice.id);
    expect(Number(rows[0].amount)).toBe(700);
    const [entry] = await entries('supplier_invoice_cost', invoice.id);
    expect(bySide(await shape(entry))).toEqual(bySide([
      [await mapped('material_cost'), 500, 0],
      [await mapped('service_cost'), 200, 0],
      [await mapped('vat_input'), 98, 0],
      [await mapped('payable'), 0, 798],
    ]));
  });
});
