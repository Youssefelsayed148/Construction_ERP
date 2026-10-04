// Real PostgreSQL + real app. Closeout A2.3 (plan 3.1): cost posting from material issue, expenses and
// payroll allocation, through the one COST_ACCRUAL_RULES map (services/costAccrual.js), idempotent on
// UNIQUE (source_type, source_id), in the caller's transaction, with a no-double-count test per accrual pair.
//
// Reproduced first (these failed on the pre-A2.3 code):
//   * a material issue, an expense and a payroll run never reached project_costs, so a project's cost
//     missed them even though the ledger carried them;
//   * work completions accrued the labour payments of the work order AND each labour payment accrued
//     itself, so labour was counted twice; a second completion of the same order counted the whole
//     order again (labour and equipment);
//   * an expense could be edited (amount, project) or deleted after it was posted, leaving the ledger and
//     the cost row describing something that no longer existed.
//
// The pairs and their rules (each is tested below):
//   GRN <-> material issue    the GRN is the accrual point, to the PO's project. An issue accrues only when
//                             the stock was NOT already charged to the project it goes to (company or other
//                             project's warehouse): +project, and an offsetting row against the warehouse's
//                             own project, so the company total never moves. The ledger is untouched.
//   PO chain <-> expense      an expense that names a PO (expenses.po_id) is owned by the GRN/invoice.
//   labour payment <-> work completion   a completion accrues the order's EQUIPMENT lines, once each;
//                             labour is accrued by its own payment rows.
//   payroll <-> labour / expense   payroll is allocated by attendance days per project (new table
//                             payroll_cost_allocations); the ledger entry for the payroll is unchanged.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('A2.3 cost posting: material issue, expenses, payroll (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let owner; let svc; let costAccrual; let listener;
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
  const mapped = async (key) => (await one('SELECT account_id FROM gl_account_map WHERE key = $1', [key]) || {}).account_id;
  const costs = (type, id) => all('SELECT * FROM project_costs WHERE source_type = $1 AND source_id = $2 ORDER BY id', [type, id]);
  const total = async (projectId) => Number((await one(
    projectId == null ? 'SELECT COALESCE(SUM(amount), 0) s FROM project_costs WHERE project_id IS NULL AND source_type = ANY($1)'
      : 'SELECT COALESCE(SUM(amount), 0) s FROM project_costs WHERE project_id = $2 AND source_type = ANY($1)',
    projectId == null ? [[...TYPES]] : [[...TYPES], projectId])).s);
  const TYPES = ['grn', 'material_issue', 'material_issue_offset', 'expense', 'payroll_allocation', 'labor_payment', 'work_completion', 'wo_equipment'];
  const entriesOf = async (type, id) => all('SELECT * FROM journal_entries WHERE reference_type = $1 AND reference_id = $2', [type, id]);

  const world = async () => {
    seq += 1;
    const key = `${tag}-${seq}`;
    const P = await one("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`cp-p-${key}`, `CP${key}`.slice(0, 20)]);
    const Q = await one("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`cp-q-${key}`, `CQ${key}`.slice(0, 20)]);
    const material = await one("INSERT INTO item_master (code, category, name_en, name_ar, unit) VALUES ($1, 'test', $1, $1, 'ea') RETURNING id", [`cp-m-${key}`]);
    const supplier = await one('INSERT INTO suppliers (code, name_en, name_ar) VALUES ($1, $1, $1) RETURNING id', [`cp-s-${key}`]);
    const whCompany = await one("INSERT INTO warehouses (name, name_en, type) VALUES ($1, $1, 'central') RETURNING id", [`cp-wc-${key}`]);
    const whP = await one("INSERT INTO warehouses (name, name_en, type, project_id) VALUES ($1, $1, 'site', $2) RETURNING id", [`cp-wp-${key}`, P.id]);
    const whQ = await one("INSERT INTO warehouses (name, name_en, type, project_id) VALUES ($1, $1, 'site', $2) RETURNING id", [`cp-wq-${key}`, Q.id]);
    const wo = await one("INSERT INTO work_orders (project_id, title, status) VALUES ($1, $2, 'in_progress') RETURNING id", [P.id, `wo-${key}`]);
    await db.query('INSERT INTO supplier_materials (supplier_id, material_id) VALUES ($1, $2)', [supplier.id, material.id]);
    return { key, P, Q, material, supplier, whCompany, whP, whQ, wo };
  };
  // Receive `quantity` of the material at rate 100 into a warehouse on a PO of `projectId` (null = company stock).
  const receive = async (w, { warehouse, projectId, quantity = 10 }) => {
    const po = await tx((q) => svc.createPurchaseOrder(q, {
      supplier_id: w.supplier.id, project_id: projectId, warehouse_id: warehouse.id,
      lines: [{ material_id: w.material.id, quantity, unit_rate: 100 }], created_by: owner.id,
    }));
    const delivery = await tx((q) => svc.createDelivery(q, {
      purchase_order_id: po.id, warehouse_id: warehouse.id,
      lines: [{ purchase_order_line_id: po.lines[0].id, material_id: w.material.id, quantity }], received_by: owner.id,
    }));
    const mir = await tx((q) => svc.createMir(q, { delivery_id: delivery.id, created_by: owner.id }));
    await tx((q) => svc.decideMir(q, mir.id, { id: owner.id }, 'accept'));
    return tx((q) => svc.createGrn(q, { mir_id: mir.id, created_by: owner.id, received_by: owner.id }));
  };
  const issue = (w, { warehouse, quantity }) => tx((q) => svc.issueMaterialToWorkPackage(q, {
    work_order_id: w.wo.id, material_id: w.material.id, quantity, warehouse_id: warehouse.id, created_by: owner.id,
  }));

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    svc = require('../../services/procurementService');
    costAccrual = require('../../services/costAccrual');
    listener = require('../../services/costEventListener');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ('cp-owner', $1, 'x', 'owner') RETURNING id, token_version", [`cp-${tag}@test.io`]);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [row.id]);
    owner = { id: row.id, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
    for (const [key, code] of [['material_cost', '5100'], ['payable', '2000'], ['cash', '1000'], ['other_expense', '5900'], ['salary_expense', '5200']]) {
      await db.query(
        `INSERT INTO gl_account_map (key, account_id) SELECT $1, id FROM accounts WHERE code = $2
         ON CONFLICT (key) DO NOTHING`, [key, code]);
    }
  });

  afterAll(async () => {
    await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [owner.id]);
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [owner.id]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  // ---------------- material issue <-> GRN ----------------

  test('stock received through the delivery path is valued at the PO rate, so an issue carries a cost', async () => {
    const w = await world();
    await receive(w, { warehouse: w.whCompany, projectId: null });
    const stock = await one('SELECT avg_unit_cost FROM warehouse_stock WHERE warehouse_id = $1 AND item_id = $2', [w.whCompany.id, w.material.id]);
    expect(Number(stock.avg_unit_cost)).toBe(100);
    const { movement } = await issue(w, { warehouse: w.whCompany, quantity: 2 });
    expect(Number(movement.unit_cost)).toBe(100);
    expect(Number(movement.total_cost)).toBe(200);
  });

  test('GRN <-> issue: stock the GRN already charged to the project is not charged again at issue', async () => {
    const w = await world();
    const grn = await receive(w, { warehouse: w.whP, projectId: w.P.id });
    expect(await total(w.P.id)).toBe(1000);
    const { movement } = await issue(w, { warehouse: w.whP, quantity: 4 });
    expect(await costs('material_issue', movement.id)).toHaveLength(0);
    expect(await costs('material_issue_offset', movement.id)).toHaveLength(0);
    expect(await total(w.P.id)).toBe(1000);
    expect(await costs('grn', grn.id)).toHaveLength(1);
  });

  test('GRN <-> issue: company stock issued to a project moves the cost to the project, the company total does not change', async () => {
    const w = await world();
    await receive(w, { warehouse: w.whCompany, projectId: null });
    const before = (await total(null));
    const { movement } = await issue(w, { warehouse: w.whCompany, quantity: 4 });   // 4 x 100 weighted average
    const charge = await costs('material_issue', movement.id);
    const offset = await costs('material_issue_offset', movement.id);
    expect(charge).toHaveLength(1);
    expect(offset).toHaveLength(1);
    expect(Number(charge[0].amount)).toBe(400);
    expect(charge[0].project_id).toBe(w.P.id);
    expect(Number(offset[0].amount)).toBe(-400);
    expect(offset[0].project_id).toBeNull();
    expect(await total(w.P.id)).toBe(400);
    expect(await total(null)).toBe(before - 400);          // moved out of the unassigned bucket
    // The ledger is untouched: the cost stays in material_cost, only its project changed.
    expect(await entriesOf('material_issue', movement.id)).toHaveLength(0);
  });

  test('GRN <-> issue: another project\'s stock issued to this project moves the cost between the two projects', async () => {
    const w = await world();
    await receive(w, { warehouse: w.whQ, projectId: w.Q.id });
    const { movement } = await issue(w, { warehouse: w.whQ, quantity: 3 });
    expect(Number((await costs('material_issue', movement.id))[0].amount)).toBe(300);
    expect((await costs('material_issue', movement.id))[0].project_id).toBe(w.P.id);
    expect((await costs('material_issue_offset', movement.id))[0].project_id).toBe(w.Q.id);
    expect(await total(w.P.id)).toBe(300);
    expect(await total(w.Q.id)).toBe(1000 - 300);
  });

  test('a replayed issue posts nothing more, even when two replays run at once', async () => {
    const w = await world();
    await receive(w, { warehouse: w.whCompany, projectId: null });
    const { movement } = await issue(w, { warehouse: w.whCompany, quantity: 2 });
    const replays = await Promise.allSettled([
      db.transaction((c) => costAccrual.accrueMaterialIssue(c.query.bind(c), movement, { userId: owner.id })),
      db.transaction((c) => costAccrual.accrueMaterialIssue(c.query.bind(c), movement, { userId: owner.id })),
    ]);
    expect(replays.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(await costs('material_issue', movement.id)).toHaveLength(1);
    expect(await costs('material_issue_offset', movement.id)).toHaveLength(1);
  });

  test('an issue that fails after accruing rolls the cost back with it', async () => {
    const w = await world();
    await receive(w, { warehouse: w.whCompany, projectId: null });
    const before = await total(w.P.id);
    await expect(tx(async (q) => {
      await svc.issueMaterialToWorkPackage(q, { work_order_id: w.wo.id, material_id: w.material.id, quantity: 1, warehouse_id: w.whCompany.id, created_by: owner.id });
      throw new Error('later step failed');
    })).rejects.toThrow('later step failed');
    expect(await total(w.P.id)).toBe(before);
  });

  test('an issue with no resolvable project accrues nothing (and says so by not guessing)', async () => {
    const w = await world();
    await receive(w, { warehouse: w.whCompany, projectId: null });
    const movement = await tx((q) => require('../../services/inventoryEngine').createMovement(q, {
      warehouse_id: w.whCompany.id, material_id: w.material.id, movement_type: 'issue', quantity: 1,
      reference_type: 'manual', reference_id: null, created_by: owner.id,
    }));
    expect(await costs('material_issue', movement.id)).toHaveLength(0);
  });

  // ---------------- expenses ----------------

  test('an expense with a project accrues a cost row with the ledger entry, in one transaction', async () => {
    const w = await world();
    const created = await call('POST', '/api/expenses', { category: 'fuel', description: 'Diesel', amount: 250, project_id: w.P.id });
    expect(created.status).toBe(201);
    const rows = await costs('expense', created.body.data.id);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount)).toBe(250);
    expect(rows[0].project_id).toBe(w.P.id);
    expect(await entriesOf('expense', created.body.data.id)).toHaveLength(1);
    // No project: a company overhead, ledger only.
    const overhead = await call('POST', '/api/expenses', { category: 'office', description: 'Paper', amount: 40 });
    expect(await costs('expense', overhead.body.data.id)).toHaveLength(0);
    expect(await entriesOf('expense', overhead.body.data.id)).toHaveLength(1);
  });

  test('PO chain <-> expense: an expense that names a PO is owned by the GRN/invoice and accrues nothing', async () => {
    const w = await world();
    const po = await tx((q) => svc.createPurchaseOrder(q, {
      supplier_id: w.supplier.id, project_id: w.P.id, warehouse_id: w.whP.id, lines: [{ material_id: w.material.id, quantity: 1, unit_rate: 50 }], created_by: owner.id,
    }));
    const expense = await one("INSERT INTO expenses (category, amount, project_id, po_id, created_by) VALUES ('materials', 50, $1, $2, $3) RETURNING *", [w.P.id, po.id, owner.id]);
    const result = await tx((q) => costAccrual.accrueExpenseCost(q, expense, { userId: owner.id }));
    expect(result).toBeNull();
    expect(await costs('expense', expense.id)).toHaveLength(0);
  });

  test('a replayed expense accrual posts nothing more', async () => {
    const w = await world();
    const created = await call('POST', '/api/expenses', { category: 'transport', description: 'Truck', amount: 90, project_id: w.P.id });
    const expense = await one('SELECT * FROM expenses WHERE id = $1', [created.body.data.id]);
    expect(await tx((q) => costAccrual.accrueExpenseCost(q, expense, { userId: owner.id }))).toBeNull();
    expect(await costs('expense', expense.id)).toHaveLength(1);
  });

  test('a posted expense cannot change amount or project, or be deleted (409 expense_posted)', async () => {
    const w = await world();
    const created = await call('POST', '/api/expenses', { category: 'fuel', description: 'Diesel', amount: 100, project_id: w.P.id });
    const id = created.body.data.id;
    const edit = await call('PUT', `/api/expenses/${id}`, { amount: 999 });
    expect(edit.status).toBe(409);
    expect(edit.body.error_code).toBe('expense_posted');
    // Moving it to another project is refused too (the record-scope policy answers 403 before the handler's 409).
    const moved = await call('PUT', `/api/expenses/${id}`, { project_id: w.Q.id });
    expect([403, 409]).toContain(moved.status);
    expect((await call('DELETE', `/api/expenses/${id}`)).status).toBe(409);
    expect(Number((await one('SELECT amount FROM expenses WHERE id = $1', [id])).amount)).toBe(100);
    // Status and notes stay editable.
    expect((await call('PUT', `/api/expenses/${id}`, { notes: 'checked', status: 'approved' })).status).toBe(200);
  });

  // ---------------- payroll ----------------

  const payrollWorld = async () => {
    const w = await world();
    seq += 1;
    const month = 1 + (seq % 12); const year = 2200 + seq;               // a month nobody else uses
    const a = await one("INSERT INTO employees (name, salary, status) VALUES ($1, 3000, 'active') RETURNING id", [`cp-a-${tag}-${seq}`]);
    const b = await one("INSERT INTO employees (name, salary, status) VALUES ($1, 1500, 'active') RETURNING id", [`cp-b-${tag}-${seq}`]);
    const period = await one(
      `INSERT INTO payroll_periods (period_name, month, year, total_employees, total_basic_salary, total_net_salary, status, posted_to_finance, created_by)
       VALUES ($1, $2, $3, 2, 4500, 4500, 'draft', false, $4) RETURNING *`, [`cp-pay-${tag}-${seq}`, month, year, owner.id]);
    await db.query('INSERT INTO payroll_details (payroll_id, employee_id, basic_salary, net_salary) VALUES ($1, $2, 3000, 3000), ($1, $3, 1500, 1500)', [period.id, a.id, b.id]);
    const day = (n) => `${year}-${String(month).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
    // Employee A: 10 days on P, 5 days on Q. Employee B: no attendance at all (stays overhead).
    for (let n = 1; n <= 10; n += 1) await db.query("INSERT INTO attendance (employee_id, date, status, project_id) VALUES ($1, $2, 'present', $3)", [a.id, day(n), w.P.id]);
    for (let n = 11; n <= 15; n += 1) await db.query("INSERT INTO attendance (employee_id, date, status, project_id) VALUES ($1, $2, 'present', $3)", [a.id, day(n), w.Q.id]);
    await db.query("INSERT INTO attendance (employee_id, date, status, project_id) VALUES ($1, $2, 'absent', $3)", [a.id, day(16), w.P.id]);
    return { ...w, period, a, b };
  };

  test('payroll <-> labour/expense: posting a payroll allocates each employee by attendance days per project, once', async () => {
    const w = await payrollWorld();
    const posted = await call('PUT', `/api/payroll/${w.period.id}`, { posted_to_finance: true });
    expect(posted.status).toBe(200);
    const alloc = await all('SELECT * FROM payroll_cost_allocations WHERE payroll_id = $1 ORDER BY project_id', [w.period.id]);
    expect(alloc.map((a) => [a.project_id, Number(a.amount)])).toEqual([[w.P.id, 2000], [w.Q.id, 1000]].sort((x, y) => x[0] - y[0]));
    for (const a of alloc) {
      const rows = await costs('payroll_allocation', a.id);
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].amount)).toBe(Number(a.amount));
      expect(rows[0].project_id).toBe(a.project_id);
    }
    // The ledger entry still carries the whole payroll (4500): the 1500 with no attendance stays overhead.
    const [entry] = await entriesOf('payroll', w.period.id);
    expect(Number(entry.total_amount)).toBe(4500);
    // Posting again (the flag is already true) allocates nothing more.
    await call('PUT', `/api/payroll/${w.period.id}`, { posted_to_finance: true, status: 'paid' });
    expect(await all('SELECT id FROM payroll_cost_allocations WHERE payroll_id = $1', [w.period.id])).toHaveLength(2);
  });

  test('payroll allocation is atomic with the post and refuses a second run at the database', async () => {
    const w = await payrollWorld();
    await call('PUT', `/api/payroll/${w.period.id}`, { posted_to_finance: true });
    await expect(db.query('INSERT INTO payroll_cost_allocations (payroll_id, project_id, amount) VALUES ($1, $2, 1)', [w.period.id, w.P.id]))
      .rejects.toMatchObject({ code: '23505' });
  });

  // ---------------- labour payment <-> work completion ----------------

  const labourWorld = async () => {
    const w = await world();
    const laborer = await one("INSERT INTO daily_laborers (full_name) VALUES ($1) RETURNING id", [`cp-lab-${tag}-${seq}`]);
    const asset = await one("INSERT INTO assets (name) VALUES ($1) RETURNING id", [`cp-asset-${tag}-${seq}`]);
    const equipment = await one('INSERT INTO work_order_equipment (work_order_id, equipment_id, hours, hourly_cost, total_cost) VALUES ($1, $2, 10, 10, 100) RETURNING *', [w.wo.id, asset.id]);
    const payment = await one(
      'INSERT INTO labor_payments (project_id, laborer_id, work_order_id, days_worked, daily_rate, total_amount) VALUES ($1, $2, $3, 2, 100, 200) RETURNING *', [w.P.id, laborer.id, w.wo.id]);
    const location = await one("INSERT INTO project_locations (project_id, code, name, name_en) VALUES ($1, $2, 'L', 'L') RETURNING id", [w.P.id, `L${w.key}`.slice(0, 40)]);
    const completion = (n) => one("INSERT INTO work_completions (work_order_id, quantity_completed, status, project_location_id) VALUES ($1, $2, 'verified', $3) RETURNING id", [w.wo.id, n, location.id]);
    return { ...w, equipment, payment, completion };
  };
  const sumFor = async (w) => Number((await one(
    "SELECT COALESCE(SUM(amount), 0) s FROM project_costs WHERE project_id = $1 AND source_type = ANY($2)", [w.P.id, ['labor_payment', 'work_completion', 'wo_equipment']])).s);

  test('labour payment <-> work completion: labour is counted once (by its payment), equipment once (by the completion)', async () => {
    const w = await labourWorld();
    await listener.onLaborPaymentCreated({ entityId: w.payment.id, payload: { project_id: w.P.id, amount: 200 } }, { query: db.query });
    const c1 = await w.completion(5);
    await listener.onWorkCompletionVerified({ entityId: c1.id }, { query: db.query });
    expect(await sumFor(w)).toBe(300);                       // 200 labour + 100 equipment, not 500
    // A second verified completion of the same order does not count the order again.
    const c2 = await w.completion(3);
    await listener.onWorkCompletionVerified({ entityId: c2.id }, { query: db.query });
    expect(await sumFor(w)).toBe(300);
    // Redelivery of the first completion changes nothing either.
    await listener.onWorkCompletionVerified({ entityId: c1.id }, { query: db.query });
    expect(await sumFor(w)).toBe(300);
    expect(await costs('wo_equipment', w.equipment.id)).toHaveLength(1);
  });

  test('an order whose equipment was already accrued by a legacy work_completion row is not accrued a second time', async () => {
    const w = await labourWorld();
    const legacy = await w.completion(1);
    await db.query("INSERT INTO project_costs (project_id, source_type, source_id, amount) VALUES ($1, 'work_completion', $2, 100)", [w.P.id, legacy.id]);
    const c = await w.completion(2);
    await listener.onWorkCompletionVerified({ entityId: c.id }, { query: db.query });
    expect(await costs('wo_equipment', w.equipment.id)).toHaveLength(0);
    expect(await sumFor(w)).toBe(100);
  });
});
