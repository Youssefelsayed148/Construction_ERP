// Real PostgreSQL + real app. Phase 3 exit gate (closeout A2.7): the golden chain
//   requirement -> purchase requisition -> purchase order -> GRN -> supplier invoice -> payment -> cost
// run through the real routes and the real replenishment sweep, with the totals reconciled at EVERY step:
//   requisition amount = PO total = GRN valued total = invoice net, project cost rows = ledger entries =
//   cost view = stock valuation, AP balance zero after payment.
//
// Variant 2 puts a supplier return in the middle (decision 2): the reversal takes its share of the cost and of the
// AP, and the chain still reconciles on the smaller quantity.
//
// Every number below is derived from two inputs the test controls: the supplier's price (100) and the quantity.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('golden chain: requirement -> PR -> PO -> GRN -> invoice -> payment -> cost (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let owner; let replenishment;
  const tag = String(Date.now()).slice(-7);
  let seq = 0;
  const PRICE = 100;
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
  const num = (v) => Math.round(Number(v) * 100) / 100;

  // ---- reconciliation queries: every figure is read from the database, never from a response ----
  const costRowsFor = async (w) => num((await one(
    `SELECT COALESCE(SUM(amount), 0) s FROM project_costs
      WHERE project_id = $1 AND source_type IN ('grn', 'supplier_return', 'supplier_invoice')`, [w.project.id])).s);
  const costViewFor = async (w) => num((await one('SELECT COALESCE(total_cost, 0) s FROM v_project_cost_totals WHERE project_id = $1', [w.project.id]) || { s: 0 }).s);
  // The chain's own ledger entries: (reference type, reference id) pairs, because ids of different documents collide.
  const refTypes = (w) => w.refs.map((r) => r[0]);
  const refIds = (w) => w.refs.map((r) => r[1]);
  const ledger = async (w, key, kinds) => {
    const row = await one(
      `SELECT COALESCE(SUM(l.debit), 0) d, COALESCE(SUM(l.credit), 0) c
         FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.journal_entry_id
         JOIN gl_account_map m ON m.account_id = l.account_id AND m.key = $1
        WHERE e.reference_type = ANY($2)
          AND (e.reference_type, e.reference_id) IN (SELECT * FROM unnest($3::text[], $4::int[]))`, [key, kinds, refTypes(w), refIds(w)]);
    return { debit: num(row.d), credit: num(row.c) };
  };
  const apBalance = async (w) => { const p = await ledger(w, 'payable', ['grn_cost', 'supplier_return_cost', 'supplier_invoice_cost', 'supplier_payment']); return num(p.credit - p.debit); };
  const materialCostNet = async (w) => { const m = await ledger(w, 'material_cost', ['grn_cost', 'supplier_return_cost', 'supplier_invoice_cost']); return num(m.debit - m.credit); };
  const stock = async (w) => {
    const r = await one('SELECT quantity, avg_unit_cost FROM warehouse_stock WHERE warehouse_id = $1 AND item_id = $2', [w.warehouse.id, w.material.id]);
    return { quantity: Number(r.quantity), value: num(Number(r.quantity) * Number(r.avg_unit_cost)) };
  };

  const buildWorld = async () => {
    seq += 1;
    const key = `${tag}-${seq}`;
    const project = await one("INSERT INTO projects (name, name_en, code, status, budget, contract_value) VALUES ($1, $1, $2, 'active', 100000, 200000) RETURNING id", [`gc-${key}`, `GC${key}`.slice(0, 20)]);
    const supplier = await one('INSERT INTO suppliers (code, name_en, name_ar) VALUES ($1, $1, $1) RETURNING id', [`gc-s-${key}`]);
    const material = await one("INSERT INTO item_master (code, category, name_en, name_ar, unit, order_multiple, moq) VALUES ($1, 'gc-test', $1, $1, 'bag', 5, 0) RETURNING id", [`gc-m-${key}`]);
    await db.query('INSERT INTO supplier_materials (supplier_id, material_id, unit_price) VALUES ($1, $2, $3)', [supplier.id, material.id, PRICE]);
    const warehouse = await one("INSERT INTO warehouses (name, name_en, type, project_id) VALUES ($1, $1, 'site', $2) RETURNING id", [`gc-w-${key}`, project.id]);
    await db.query('INSERT INTO warehouse_stock (warehouse_id, item_id, quantity, available_quantity, reorder_level) VALUES ($1, $2, 0, 0, 0)', [warehouse.id, material.id]);
    const location = await one("INSERT INTO project_locations (project_id, code, name, name_en) VALUES ($1, $2, 'Floor 3', 'Floor 3') RETURNING id", [project.id, `L${key}`.slice(0, 40)]);
    await db.query('INSERT INTO business_rules (rule_key, rule_value) VALUES ($1, $2)', [`replenishment_policy:material:${material.id}`, JSON.stringify({ mode: 'auto_draft_pr' })]);
    return { key, project, supplier, material, warehouse, location, refs: [] };
  };

  // Steps 1-3: requirement -> sweep -> approved PR -> PO (issued).
  const toIssuedPo = async (w, quantity) => {
    // 1. REQUIREMENT: planned demand of `quantity` for the project, 7 days out.
    await db.query(
      `INSERT INTO material_requirements (project_id, project_location_id, material_id, unit, gross_requirement, net_requirement, source_type, source_activity_date, status)
       VALUES ($1, $2, $3, 'bag', $4, $4, 'location_allocation', (CURRENT_DATE + 7), 'planned')`, [w.project.id, w.location.id, w.material.id, quantity]);
    // 2. PR: the replenishment sweep raises it through the PR workflow.
    const item = await one('SELECT * FROM item_master WHERE id = $1', [w.material.id]);
    await replenishment.evaluateMaterial(db.query, item, { notify: false });
    const pr = await one('SELECT * FROM purchase_requests WHERE project_id = $1 AND source_type = $2', [w.project.id, 'replenishment']);
    w.pr = pr;
    return pr;
  };

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    replenishment = require('../../services/replenishment');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ('gc-owner', $1, 'x', 'owner') RETURNING id, token_version", [`gc-${tag}@test.io`]);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [row.id]);
    owner = { id: row.id, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
    for (const [key, code] of [['material_cost', '5100'], ['payable', '2000'], ['cash', '1000']]) {
      await db.query(
        `INSERT INTO gl_account_map (key, account_id) SELECT $1, id FROM accounts WHERE code = $2 ON CONFLICT (key) DO NOTHING`, [key, code]);
    }
  });

  afterAll(async () => {
    await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [owner.id]);
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [owner.id]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  // The whole chain, parameterised by an optional return. Returns the world for the closing assertions.
  const runChain = async ({ ordered, returned = 0 }) => {
    const w = await buildWorld();
    const kept = ordered - returned;

    // ---- 1-2. requirement -> requisition (through the PR workflow) ----
    const pr = await toIssuedPo(w, ordered);
    expect(pr.status).toBe('budget_check');
    expect(pr.workflow_instance_id).not.toBeNull();
    expect(num(pr.amount)).toBe(ordered * PRICE);                                  // RECONCILE: PR amount = need x supplier price
    const prLines = await all('SELECT * FROM purchase_request_lines WHERE purchase_request_id = $1', [pr.id]);
    expect(prLines.map((l) => Number(l.quantity))).toEqual([ordered]);
    expect(pr.budget_check.status).toBe('ok');

    // PR approvals: budget check -> authority -> procurement.
    for (let i = 0; i < 3 && (await one('SELECT status FROM purchase_requests WHERE id = $1', [pr.id])).status !== 'procurement'; i += 1) {
      expect((await call('POST', `/api/procurement/pr/${pr.id}/decide`, { decision: 'approve' })).status).toBe(200);
    }
    expect((await one('SELECT status FROM purchase_requests WHERE id = $1', [pr.id])).status).toBe('procurement');

    // ---- 3. purchase order from the requisition, issued through its workflow ----
    const created = await call('POST', '/api/procurement/po', {
      supplier_id: w.supplier.id, purchase_request_id: pr.id, project_id: w.project.id,
      lines: prLines.map((l) => ({ material_id: l.material_id, quantity: Number(l.quantity), unit: l.unit, unit_rate: PRICE })),
    });
    expect(created.status).toBe(201);
    const po = created.body.data;
    expect(num(po.total_amount)).toBe(num(pr.amount));                              // RECONCILE: PO total = PR amount
    expect((await call('POST', `/api/procurement/po/${po.id}/issue`)).status).toBe(200);
    for (let i = 0; i < 6 && (await one('SELECT status FROM purchase_orders WHERE id = $1', [po.id])).status !== 'issued'; i += 1) {
      const step = await call('POST', `/api/procurement/po/${po.id}/decide`, { decision: 'approve' });
      expect([step.status, step.body.error, (await one('SELECT status FROM purchase_orders WHERE id = $1', [po.id])).status]).toEqual([200, undefined, expect.any(String)]);
    }
    expect((await one('SELECT status FROM purchase_orders WHERE id = $1', [po.id])).status).toBe('issued');
    const poLine = (await all('SELECT * FROM purchase_order_lines WHERE purchase_order_id = $1', [po.id]))[0];

    // ---- 4. delivery -> MIR -> GRN ----
    const delivery = await call('POST', '/api/procurement/deliveries', { purchase_order_id: po.id, warehouse_id: w.warehouse.id, lines: [{ purchase_order_line_id: poLine.id, quantity: ordered }] });
    expect(delivery.status).toBe(201);
    const mir = await call('POST', `/api/procurement/deliveries/${delivery.body.data.id}/mir`);
    expect(mir.status).toBe(201);
    expect(Number(mir.body.data.project_id)).toBe(w.project.id);                 // MIR approval retains the PO's project scope
    expect((await call('POST', `/api/procurement/mir/${mir.body.data.id}/decide`, { decision: 'accept' })).status).toBe(200);
    const grnRes = await call('POST', `/api/procurement/mir/${mir.body.data.id}/grn`);
    expect(grnRes.status).toBe(201);
    const grn = grnRes.body.data;
    w.refs.push(['grn_cost', grn.id]);

    const grnValue = num((await one('SELECT SUM(gl.quantity * pol.unit_rate) v FROM grn_lines gl JOIN purchase_order_lines pol ON pol.id = gl.purchase_order_line_id WHERE gl.grn_id = $1', [grn.id])).v);
    expect(grnValue).toBe(num(po.total_amount));                                    // RECONCILE: GRN valued total = PO total
    expect(await costRowsFor(w)).toBe(grnValue);                                    // cost row = GRN value
    expect(await costViewFor(w)).toBe(grnValue);                                    // ... as the cost view reads it
    expect(await materialCostNet(w)).toBe(grnValue);                                // ledger = cost rows
    expect(await apBalance(w)).toBe(grnValue);                                      // AP carries the goods received
    expect(await stock(w)).toEqual({ quantity: ordered, value: grnValue });         // stock valuation = cost (the valuation fix of A2.3)

    // ---- 4b. optional supplier return (decision 2) ----
    let ret = null;
    if (returned > 0) {
      const r = await call('POST', `/api/procurement/grn/${grn.id}/returns`, { reason: 'damaged', lines: [{ material_id: w.material.id, quantity: returned }] });
      expect(r.status).toBe(201);
      ret = r.body.data;
      w.refs.push(['supplier_return_cost', ret.id]);                                // return entries reference the return id
      const reversal = returned * PRICE;
      expect(num((await one("SELECT amount FROM project_costs WHERE source_type = 'supplier_return' AND source_id = $1", [ret.id])).amount)).toBe(-reversal);
      expect(await costRowsFor(w)).toBe(grnValue - reversal);                       // RECONCILE: cost net of the return
      expect(await costViewFor(w)).toBe(grnValue - reversal);
      expect(await materialCostNet(w)).toBe(grnValue - reversal);                   // ledger follows
      expect(await apBalance(w)).toBe(grnValue - reversal);                         // AP follows
      expect(await stock(w)).toEqual({ quantity: kept, value: grnValue - reversal });
    }
    const netCost = kept * PRICE;

    // ---- 5. supplier invoice for what was kept: three-way matched, approved ----
    const invoiceNumber = `GC-INV-${tag}-${seq}`;
    const inv = await call('POST', '/api/procurement/invoices', {
      supplier_id: w.supplier.id, purchase_order_id: po.id, invoice_number: invoiceNumber, total_amount: netCost, tax_amount: 0,
      lines: [{ purchase_order_line_id: poLine.id, material_id: w.material.id, quantity: kept, unit_price: PRICE }],
    });
    expect(inv.status).toBe(201);
    const invoice = inv.body.data.invoice || inv.body.data;
    const exceptions = (inv.body.data.match && inv.body.data.match.exceptions) || (inv.body.data.exceptions) || [];
    expect(exceptions).toEqual([]);                                                 // three-way match: clean
    expect((await call('POST', `/api/procurement/invoices/${invoice.id}/approve`)).status).toBe(200);
    expect(num(invoice.total_amount) - num(invoice.tax_amount || 0)).toBe(netCost); // RECONCILE: invoice net = kept goods at the PO rate
    // The GRN already owns the cost: approving the invoice adds NO second cost row and no second accrual.
    expect(await all("SELECT id FROM project_costs WHERE source_type = 'supplier_invoice' AND source_id = $1", [invoice.id])).toHaveLength(0);
    expect(await costRowsFor(w)).toBe(netCost);
    expect(await apBalance(w)).toBe(netCost);                                       // AP = what the invoice asks for

    // ---- 6. payment, allocated to the invoice ----
    const payment = await call('POST', '/api/payments', { direction: 'ap', supplier_id: w.supplier.id, project_id: w.project.id, amount: netCost, payment_date: '2026-10-04' });
    expect(payment.status).toBe(201);
    w.refs.push(['supplier_payment', payment.body.data.id]);
    const allocation = await call('POST', `/api/finance-ledger/payments/${payment.body.data.id}/allocate`, { allocations: [{ target_type: 'supplier_invoice', supplier_invoice_id: invoice.id, amount: netCost }] });
    expect(allocation.status).toBe(201);
    expect((await one('SELECT status FROM supplier_invoices WHERE id = $1', [invoice.id])).status).toBe('paid');
    expect(await apBalance(w)).toBe(0);                                             // RECONCILE: AP is zero after payment
    expect((await ledger(w, 'cash', ['supplier_payment'])).credit).toBe(netCost);   // the cash left once

    // ---- 7. cost, everywhere it is read ----
    expect(await costRowsFor(w)).toBe(netCost);
    expect(await costViewFor(w)).toBe(netCost);
    expect(await materialCostNet(w)).toBe(netCost);
    expect(await stock(w)).toEqual({ quantity: kept, value: netCost });
    const dash = (await call('GET', `/api/dashboard/project/${w.project.id}`)).body.data;
    expect(num(dash.total_spent)).toBe(netCost);
    const costing = (await call('GET', `/api/costing/project/${w.project.id}`)).body.data;
    expect(num(costing.grand_total)).toBe(netCost);
    // Every ledger entry of the chain is balanced.
    const unbalanced = await all(
      `SELECT e.id FROM journal_entries e JOIN journal_entry_lines l ON l.journal_entry_id = e.id
        WHERE (e.reference_type, e.reference_id) IN (SELECT * FROM unnest($1::text[], $2::int[])) GROUP BY e.id HAVING SUM(l.debit) <> SUM(l.credit)`,
      [refTypes(w), refIds(w)]);
    expect(unbalanced).toEqual([]);
    return { w, po, grn, ret, invoice };
  };

  // Found by the chain: purchase_orders.status was VARCHAR(30) and the PO workflow's first step key is 31 characters, so the
  // first decision on any PO failed on PostgreSQL (mock-db does not enforce lengths). Pin that every workflow step key
  // fits the status column of the document it is mirrored into.
  test.each([['po', 'purchase_orders'], ['purchase_requisition', 'purchase_requests'], ['wir', 'wirs'], ['mir', 'material_inspection_requests']])(
    'workflow %s: every step key fits %s.status', async (template, table) => {
      const steps = await one('SELECT max(length(s.step_key))::int m FROM workflow_templates t JOIN workflow_steps s ON s.template_id = t.id WHERE t.key = $1', [template]);
      const col = await one("SELECT character_maximum_length m FROM information_schema.columns WHERE table_name = $1 AND column_name = 'status'", [table]);
      expect(steps.m).toBeLessThanOrEqual(col.m);
    });

  test('the chain reconciles at every step: 50 bags ordered, received, invoiced, paid', async () => {
    const { w } = await runChain({ ordered: 50 });
    // The requirement is satisfied in the open requirement formula: a second sweep raises nothing.
    const item = await one('SELECT * FROM item_master WHERE id = $1', [w.material.id]);
    await replenishment.evaluateMaterial(db.query, item, { notify: false });
    expect(await all('SELECT id FROM purchase_requests WHERE project_id = $1', [w.project.id])).toHaveLength(1);
  });

  test('the same chain with a supplier return reconciles on the kept quantity (50 received, 10 returned, 40 invoiced and paid)', async () => {
    const { ret } = await runChain({ ordered: 50, returned: 10 });
    expect(ret).toBeTruthy();
  });

  test('Phase 9 residential fixture provisions 96 units and derives C35 demand from its recipe', async () => {
    const provisioning = require('../../services/projectProvisioning');
    const materialDemand = require('../../services/materialDemand');
    const code = `OSIRIS-GOLD-${tag}-${seq + 1}`.slice(0, 50);
    const seeded = await db.transaction(async (client) => {
      const { project } = await provisioning.provisionProject({
        code,
        name_en: 'Osiris Residential Towers',
        name_ar: 'Ø£Ø¨Ø±Ø§Ø¬ Ø£ÙˆØ³ÙŠØ±ÙŠØ³ Ø§Ù„Ø³ÙƒÙ†ÙŠØ©',
        project_type: 'residential',
        status: 'planning',
        budget: 1500000,
        contract_value: 1600000,
      }, { client, templateKey: 'residential_tower' });
      const unit = (await client.query(
        "SELECT id FROM project_locations WHERE project_id = $1 AND code = 'T-A-F01-U1'", [project.id]
      )).rows[0];
      const unitCount = (await client.query(
        `SELECT COUNT(*)::int AS count FROM project_locations pl
          JOIN location_types lt ON lt.id = pl.location_type_id
         WHERE pl.project_id = $1 AND lt.code = 'unit'`, [project.id]
      )).rows[0].count;
      const section = (await client.query(
        `INSERT INTO boq_sections (project_id, code, name, name_en, name_ar)
         VALUES ($1, $2, 'Structure', 'Structure', 'Ø§Ù„Ù‡ÙŠÙƒÙ„') RETURNING id`, [project.id, `${code}-BOQ`]
      )).rows[0];
      const c35 = (await client.query('SELECT id FROM item_master WHERE code = $1', ['RM-CONC-C35'])).rows[0];
      const boq = (await client.query(
        `INSERT INTO boq_items (project_id, section_id, code, description, description_en, description_ar,
           unit, quantity, unit_rate, item_master_id, type)
         VALUES ($1, $2, $3, 'C35 structural concrete', 'C35 structural concrete', 'Ø®Ø±Ø³Ø§Ù†Ø© Ø¥Ù†Ø´Ø§Ø¦ÙŠØ© C35',
           'm3', 120, 4200, $4, 'material') RETURNING id`,
        [project.id, section.id, `${code}-C35`, c35.id]
      )).rows[0];
      const recipe = (await client.query(
        `INSERT INTO material_recipes
           (project_id, boq_item_id, code, name, name_en, name_ar, output_description, output_unit)
         VALUES ($1, $2, $3, 'C35 concrete mix', 'C35 concrete mix', 'Ø®Ù„Ø·Ø© Ø®Ø±Ø³Ø§Ù†Ø© C35',
           '1 m3 concrete', 'm3') RETURNING id`, [project.id, boq.id, `${code}-RECIPE`]
      )).rows[0];
      const line = (await client.query(
        `INSERT INTO recipe_lines (recipe_id, material_id, factor_per_unit, wastage_pct, unit)
         VALUES ($1, $2, 1, 2, 'm3') RETURNING id`, [recipe.id, c35.id]
      )).rows[0];
      const allocation = (await client.query(
        `INSERT INTO boq_location_allocations (boq_item_id, project_location_id, planned_quantity, unit_cost, activity_type)
         VALUES ($1, $2, 120, 4200, 'concrete_pour') RETURNING id`, [boq.id, unit.id]
      )).rows[0];
      const schedule = (await client.query(
        `INSERT INTO schedule_activities (project_id, activity_code, name, project_location_id, boq_item_id,
           planned_quantity, planned_start, planned_finish, original_duration)
         VALUES ($1, $2, 'Tower A C35 pours', $3, $4, 120, CURRENT_DATE, CURRENT_DATE + 30, 30) RETURNING id`,
        [project.id, `${code}-ACT`, unit.id, boq.id]
      )).rows[0];
      const q = (sql, params) => client.query(sql, params);
      const demand = await materialDemand.recomputeAllocation(q, allocation.id);
      const requirement = (await client.query(
        'SELECT gross_requirement, net_requirement, recipe_id, recipe_line_id FROM material_requirements WHERE source_id = $1',
        [allocation.id]
      )).rows[0];
      return { projectId: project.id, unitCount, boqId: boq.id, scheduleId: schedule.id, recipe, line, demand, requirement };
    });

    expect(seeded.unitCount).toBe(96);
    expect(seeded.demand.rows).toBe(1);
    expect(seeded.requirement).toMatchObject({
      gross_requirement: '120.0000',
      net_requirement: '122.4000',
      recipe_id: seeded.recipe.id,
      recipe_line_id: seeded.line.id,
    });
    expect(await one('SELECT COUNT(*)::int AS count FROM schedule_activities WHERE id = $1 AND project_id = $2',
      [seeded.scheduleId, seeded.projectId])).toMatchObject({ count: 1 });
    expect(num((await one('SELECT quantity * unit_rate AS total FROM boq_items WHERE id = $1', [seeded.boqId])).total))
      .toBe(504000);
  });
});
