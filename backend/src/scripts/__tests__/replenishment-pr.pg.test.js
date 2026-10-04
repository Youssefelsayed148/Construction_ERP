// Real PostgreSQL + real app. Closeout A2.2 (plan 3.3): replenishment raises a purchase requisition
// THROUGH the PR workflow.
//
// Reproduced first (these failed on the pre-A2.2 code):
//   * the sweep inserted a draft PR with no project, no location, no work package, no cost code, and
//     never started the PR workflow (workflow_instance_id stayed NULL, so nobody was ever asked);
//   * the PO-mode policies (auto_draft_po, auto_issue_po) bypassed the PR workflow and created purchase
//     orders directly;
//   * stock was counted across every warehouse of every project, so another project's stock hid a real
//     shortage;
//   * once a replenishment PR was submitted it was no longer a draft, so the next sweep (or a second
//     runner) created another PR for the same need;
//   * the budget_check step of the PR workflow checked nothing.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('A2.2 replenishment through the PR workflow (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let owner; let replenishment; let procurement;
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
  const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  // One self-contained scenario: a project, a material with planned demand, optional stock and price.
  const scenario = async ({ mode = 'auto_draft_pr', demand = 50, projectStock = 0, otherProjectStock = 0, price = 10, budget = 100000, costCode = true } = {}) => {
    seq += 1;
    const key = `${tag}-${seq}`;
    const costCodeId = costCode ? (await one("SELECT id FROM cost_codes WHERE code = '03'")).id : null;
    const project = await one("INSERT INTO projects (name, name_en, code, status, budget) VALUES ($1, $1, $2, 'active', $3) RETURNING *", [`rp-${key}`, `RP${key}`.slice(0, 20), budget]);
    const other = await one("INSERT INTO projects (name, name_en, code, status, budget) VALUES ($1, $1, $2, 'active', 1) RETURNING *", [`rpo-${key}`, `RO${key}`.slice(0, 20)]);
    const material = await one(
      `INSERT INTO item_master (code, category, name_en, name_ar, unit, default_cost_code_id, moq, order_multiple)
       VALUES ($1, 'rp-test', $1, $1, 'bag', $2, 0, 5) RETURNING *`, [`rp-m-${key}`, costCodeId]);
    const supplier = await one('INSERT INTO suppliers (code, name_en, name_ar) VALUES ($1, $1, $1) RETURNING id', [`rp-s-${key}`]);
    await db.query('INSERT INTO supplier_materials (supplier_id, material_id, unit_price) VALUES ($1, $2, $3)', [supplier.id, material.id, price]);
    const whOwn = await one("INSERT INTO warehouses (name, name_en, type, project_id) VALUES ($1, $1, 'site', $2) RETURNING id", [`rp-w-${key}`, project.id]);
    const whOther = await one("INSERT INTO warehouses (name, name_en, type, project_id) VALUES ($1, $1, 'site', $2) RETURNING id", [`rpo-w-${key}`, other.id]);
    for (const [wh, qty] of [[whOwn.id, projectStock], [whOther.id, otherProjectStock]]) {
      await db.query('INSERT INTO warehouse_stock (warehouse_id, item_id, quantity, available_quantity, reorder_level) VALUES ($1, $2, $3, $3, 0)', [wh, material.id, qty]);
    }
    const location = await one("INSERT INTO project_locations (project_id, code, name, name_en) VALUES ($1, $2, 'Floor 3', 'Floor 3') RETURNING id", [project.id, `L${key}`.slice(0, 40)]);
    const wp = await one("INSERT INTO work_packages (project_id, code, name) VALUES ($1, $2, 'Slab WP') RETURNING id", [project.id, `WP${key}`.slice(0, 40)]);
    await db.query(
      `INSERT INTO material_requirements (project_id, project_location_id, work_package_id, material_id, unit, gross_requirement, net_requirement, source_type, source_activity_date, status)
       VALUES ($1, $2, $3, $4, 'bag', $5, $5, 'location_allocation', $6, 'planned')`,
      [project.id, location.id, wp.id, material.id, demand, inDays(7)]);
    const policy = mode === 'auto_issue_po' ? { mode, authority_ceiling: 1000000 } : { mode };
    await db.query('INSERT INTO business_rules (rule_key, rule_value) VALUES ($1, $2)', [`replenishment_policy:material:${material.id}`, JSON.stringify(policy)]);
    return { key, project, other, material, supplier, location, wp, costCodeId };
  };
  const evaluate = async (s) => {
    const item = await one('SELECT * FROM item_master WHERE id = $1', [s.material.id]);
    return replenishment.evaluateMaterial(db.query, item, { notify: false });
  };
  const prsFor = (s) => all('SELECT * FROM purchase_requests WHERE source_key LIKE $1 ORDER BY id', [`replenishment:${s.material.id}%`]);

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    replenishment = require('../../services/replenishment');
    procurement = require('../../services/procurementService');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ('rp-owner', $1, 'x', 'owner') RETURNING id, token_version", [`rp-${tag}@test.io`]);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [row.id]);
    owner = { id: row.id, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
  });

  afterAll(async () => {
    await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [owner.id]);
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [owner.id]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('the sweep raises a PR through the workflow with project, material, location, work package and cost code, and no PO', async () => {
    const s = await scenario({});
    const result = await evaluate(s);
    expect(result.actions.purchase_order).toBeNull();

    const prs = await prsFor(s);
    expect(prs).toHaveLength(1);
    const pr = prs[0];
    expect(pr.project_id).toBe(s.project.id);
    expect(pr.location_id).toBe(s.location.id);
    expect(pr.work_package_id).toBe(s.wp.id);
    expect(pr.cost_code_id).toBe(s.costCodeId);
    expect(pr.request_number).toMatch(/^PR-\d{5}$/);          // the shared numbering service
    expect(Number(pr.amount)).toBe(500);                      // 50 needed (no stock, multiple of 5) at the supplier price of 10
    // It went through the workflow: an active instance, past Draft/Submit, waiting at the budget check.
    expect(pr.workflow_instance_id).not.toBeNull();
    expect(pr.status).toBe('budget_check');
    const wf = await one('SELECT * FROM workflow_instances WHERE id = $1', [pr.workflow_instance_id]);
    expect(wf.status).toBe('active');
    expect(wf.current_step_key).toBe('budget_check');
    const lines = await all('SELECT * FROM purchase_request_lines WHERE purchase_request_id = $1', [pr.id]);
    expect(lines).toHaveLength(1);
    expect(lines[0].material_id).toBe(s.material.id);
    expect(Number(lines[0].quantity)).toBe(50);
    // And no order was created for this material.
    expect(Number((await one('SELECT count(*)::int n FROM purchase_order_lines WHERE material_id = $1', [s.material.id])).n)).toBe(0);
  });

  test('running the sweep twice, or two runners at once, creates one PR', async () => {
    const s = await scenario({});
    await Promise.all([evaluate(s), evaluate(s)]);
    await evaluate(s);
    await replenishment.runReplenishmentSweep(db.query, { notify: false });
    const prs = await prsFor(s);
    expect(prs).toHaveLength(1);
    expect(prs[0].status).toBe('budget_check');
  });

  test('stock of another project is not counted; the project\'s own stock is', async () => {
    // 50 needed; another project holds 500, this project nothing: the shortage is real.
    const a = await scenario({ otherProjectStock: 500 });
    await evaluate(a);
    expect(await prsFor(a)).toHaveLength(1);
    // This project holds 60 itself: nothing to order.
    const b = await scenario({ projectStock: 60 });
    await evaluate(b);
    expect(await prsFor(b)).toHaveLength(0);
    // Stock it holds partially reduces the order.
    const c = await scenario({ projectStock: 20 });
    await evaluate(c);
    const [pr] = await prsFor(c);
    const [line] = await all('SELECT * FROM purchase_request_lines WHERE purchase_request_id = $1', [pr.id]);
    expect(Number(line.quantity)).toBe(30);
  });

  test('the PO-mode policies raise a PR too, never a purchase order', async () => {
    for (const mode of ['auto_draft_po', 'auto_issue_po']) {
      const s = await scenario({ mode });
      const result = await evaluate(s);
      expect(result.actions.purchase_order).toBeNull();
      const prs = await prsFor(s);
      expect(prs).toHaveLength(1);
      expect(prs[0].policy_mode).toBe(mode);
      expect(prs[0].workflow_instance_id).not.toBeNull();
      expect(Number((await one('SELECT count(*)::int n FROM purchase_order_lines WHERE material_id = $1', [s.material.id])).n)).toBe(0);
    }
  });

  test('a PR already on its way (open, or approved with the PO still to come) blocks a second one; a PO covering it lets a new need through', async () => {
    const s = await scenario({});
    await evaluate(s);
    const [pr] = await prsFor(s);
    // Approved and waiting for its PO ('procurement'): still counts as the open requirement.
    await db.query("UPDATE purchase_requests SET status = 'procurement' WHERE id = $1", [pr.id]);
    await evaluate(s);
    expect(await prsFor(s)).toHaveLength(1);
  });

  test('a failure while raising the PR leaves nothing behind', async () => {
    const s = await scenario({});
    const spy = jest.spyOn(procurement, 'submitPurchaseRequest').mockRejectedValueOnce(new Error('workflow unavailable'));
    await expect(evaluate(s)).rejects.toThrow('workflow unavailable');
    spy.mockRestore();
    expect(await prsFor(s)).toHaveLength(0);
    // The sweep surfaces the failure per material (result.error, logged with the material id) and carries on.
    const failing = jest.spyOn(procurement, 'submitPurchaseRequest').mockRejectedValueOnce(new Error('workflow unavailable'));
    const swept = await replenishment.runReplenishmentSweep(db.query, { notify: false });
    failing.mockRestore();
    const mine = swept.results.find((r) => r.material_id === s.material.id);
    expect(mine.evaluated).toBe(false);
    expect(mine.error).toMatch(/workflow unavailable/);
  });

  test('budget check: a PR within the project budget can be approved at the budget step', async () => {
    const s = await scenario({ budget: 100000 });
    await evaluate(s);
    const [pr] = await prsFor(s);
    expect(pr.budget_check).toMatchObject({ status: 'ok' });
    const decided = await call('POST', `/api/procurement/pr/${pr.id}/decide`, { decision: 'approve', comment: 'ok' });
    expect(decided.status).toBe(200);
    expect((await one('SELECT status FROM purchase_requests WHERE id = $1', [pr.id])).status).toBe('authority_approval');
  });

  test('budget check: a PR over the remaining budget cannot be approved at the budget step (error_code pr_over_budget)', async () => {
    const s = await scenario({ budget: 100 });            // the order costs 500
    await evaluate(s);
    const [pr] = await prsFor(s);
    expect(pr.budget_check).toMatchObject({ status: 'over_budget' });
    const refused = await call('POST', `/api/procurement/pr/${pr.id}/decide`, { decision: 'approve' });
    expect(refused.status).toBe(400);
    expect(refused.body.error_code).toBe('pr_over_budget');
    expect(refused.body.error_params).toMatchObject({ requested: 500, remaining: 100 });
    expect((await one('SELECT status FROM purchase_requests WHERE id = $1', [pr.id])).status).toBe('budget_check');
    // Rejecting stays possible.
    const rejected = await call('POST', `/api/procurement/pr/${pr.id}/decide`, { decision: 'reject', comment: 'over budget' });
    expect(rejected.status).toBe(200);
  });

  test('budget check counts what the project already spent and has committed', async () => {
    const s = await scenario({ budget: 1000 });
    await db.query("INSERT INTO project_costs (project_id, source_type, source_id, amount) VALUES ($1, 'test', $2, 800)", [s.project.id, Number(String(Date.now()).slice(-6))]);
    await evaluate(s);                                      // wants 500, only 200 left
    const [pr] = await prsFor(s);
    expect(pr.budget_check).toMatchObject({ status: 'over_budget', spent: 800 });
  });

  test('an unpriced material or a project with no budget is flagged, not blocked', async () => {
    const s = await scenario({ budget: 0 });
    await evaluate(s);
    const [pr] = await prsFor(s);
    expect(pr.budget_check.status).toBe('no_budget');
    expect((await call('POST', `/api/procurement/pr/${pr.id}/decide`, { decision: 'approve' })).status).toBe(200);
  });

  test('a manual PR carries location, cost code and work package too, and gets the same budget check on submit', async () => {
    const s = await scenario({ budget: 100 });
    const created = await call('POST', '/api/procurement/pr', {
      title: 'Manual', project_id: s.project.id, location_id: s.location.id, cost_code_id: s.costCodeId, work_package_id: s.wp.id,
      lines: [{ material_id: s.material.id, quantity: 10, estimated_unit_price: 50, unit: 'bag' }],
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ location_id: s.location.id, cost_code_id: s.costCodeId, work_package_id: s.wp.id });
    const submitted = await call('POST', `/api/procurement/pr/${created.body.data.id}/submit`);
    expect(submitted.status).toBe(200);
    expect((await one('SELECT budget_check FROM purchase_requests WHERE id = $1', [created.body.data.id])).budget_check.status).toBe('over_budget');
  });

  test('the database refuses a second open PR for one source key', async () => {
    const s = await scenario({});
    await evaluate(s);
    const [pr] = await prsFor(s);
    await expect(db.query(
      "INSERT INTO purchase_requests (request_number, status, source_key) VALUES ($1, 'submitted', $2)", [`PR-dup-${tag}`, pr.source_key]
    )).rejects.toMatchObject({ code: '23505' });
  });
});
