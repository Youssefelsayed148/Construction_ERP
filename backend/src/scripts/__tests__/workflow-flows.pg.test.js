// Real PostgreSQL + real app. Ported from the mock suite workflow-engine.test.js: the engine semantics
// against the real tables — the rework 'return' decision, 'reassign' moving a step (and its action item)
// to another user with the decision logged, getPendingFor's role/user/requester visibility, the
// direct-to-owner module skipping manager_review, the orphan-cleanup backstop over real rows, the
// seeded catalog templates and their escalation rules.
//
// Legacy-template flows run over real tagged expense/purchase-order rows through the real engine inside
// real transactions; the cleanup backstop runs its real dry-run/apply over the real tables.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('workflow flows (real PostgreSQL, real app)', () => {
  let db; let engine; let migration; let cleanup;
  const tag = String(Date.now()).slice(-7);
  let seq = 0;
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const all = async (sql, params) => (await db.query(sql, params)).rows;
  const tx = (fn) => db.transaction((client) => fn((t, p) => client.query(t, p)));
  const decide = (instanceId, userId, decision, comment, opts = {}) => tx((c) => engine.recordDecision(instanceId, null, userId, decision, comment || null, { query: c, role: opts.role, userName: opts.userName, reassignToUserId: opts.reassignToUserId }));

  let fm; let fm2; let owner; let requester; let staffApp;
  const made = { users: [], expenses: [], approvalRequests: [], projects: [], suppliers: [], purchaseOrders: [] };
  const newExpense = async (label, amount) => {
    const e = (await one("INSERT INTO expenses (category, description, amount, status) VALUES ('other', $1, $2, 'pending') RETURNING id", [`b2wf-${tag}-${label}`, amount])).id;
    made.expenses.push(e);
    return e;
  };
  const newLegacyApproval = async (expenseId, requesterId) => {
    const ar = (await one(
      "INSERT INTO approval_requests (module_name, request_type, request_id, requester_id, status, stage) VALUES ('expenses', 'expense', $1, $2, 'pending', 'manager_review') RETURNING id",
      [expenseId, requesterId])).id;
    made.approvalRequests.push(ar);
    return ar;
  };
  const legacyInstance = async (expenseId, requesterId, opts = {}) => {
    const wf = await engine.startWorkflow('legacy_module_approval', 'expenses', expenseId, {
      module_name: 'expenses', request_type: 'expense', request_id: expenseId, requester_id: requesterId,
      ...(opts.legacyApprovalId ? { legacy_approval_id: opts.legacyApprovalId } : {}),
      project_id: null,
    }, { query: db.query });
    return wf.instance;
  };

  beforeAll(async () => {
    db = require('../../config/database');
    engine = require('../../services/workflowEngine');
    migration = require('../workflow-engine-migration');
    cleanup = require('../cleanup-orphan-approvals');
    const mk = async (key, role) => {
      const row = await one("INSERT INTO users (name, email, password, role) VALUES ($1, $2, 'x', $3) RETURNING id, token_version", [`wf-${key}`, `wf-${key}-${tag}@test.io`, role]);
      await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = $2", [row.id, role]);
      made.users.push(row.id);
      return { id: row.id, role, name: `wf-${key}` };
    };
    fm = await mk('fm', 'finance_manager');          // the expenses module manager
    fm2 = await mk('fm2', 'finance_manager');        // the reassign target
    owner = await mk('owner', 'owner');
    requester = await mk('requester', 'staff');
    staffApp = await mk('staffer', 'engineer');      // sees nothing for expenses
  });

  afterAll(async () => {
    for (const u of made.users) {
      await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [u]);
      await db.query('UPDATE users SET is_active = false WHERE id = $1', [u]);
    }
    await db.pool.end();
  });

  test('1. a return decision hands the instance back to the previous step', async () => {
    seq += 1;
    const expense = await newExpense('return', 100);
    const instance = await legacyInstance(expense, requester.id);
    const fwd = await decide(instance.id, fm.id, 'approve', 'ok', { role: 'finance_manager', userName: fm.name });
    expect(fwd.ok).toBe(true);
    expect(fwd.outcome).toBe('forwarded');
    expect(fwd.workflow.instance.current_step_key).toBe('owner_review');

    const back = await decide(instance.id, owner.id, 'return', 'needs more detail', { role: 'owner', userName: owner.name });
    expect(back.ok).toBe(true);
    expect(back.outcome).toBe('returned');
    expect(back.stage).toBe('manager_review');
    const mgr = back.workflow.steps.find((s) => s.step_key === 'manager_review');
    expect(mgr.status).toBe('pending');
    expect((await one('SELECT current_step_key FROM workflow_instances WHERE id = $1', [instance.id])).current_step_key).toBe('manager_review');
    // The rework is logged: an owner-return action after the manager approval.
    const actions = await all('SELECT step_key, decision FROM workflow_actions WHERE instance_id = $1 ORDER BY id', [instance.id]);
    expect(actions.map((a) => a.decision)).toEqual(['approve', 'return']);
    // The returned step became decidable again for the module manager.
    const again = await decide(instance.id, fm.id, 'approve', 'fixed', { role: 'finance_manager', userName: fm.name });
    expect(again.ok).toBe(true);
    expect(again.workflow.instance.current_step_key).toBe('owner_review');
  });

  test('2. a reassign moves the pending step to another user and is logged', async () => {
    seq += 1;
    const expense = await newExpense('reassign', 50);
    const instance = await legacyInstance(expense, requester.id);
    const r = await decide(instance.id, fm.id, 'reassign', 'delegating', { role: 'finance_manager', userName: fm.name, reassignToUserId: fm2.id });
    expect(r.ok).toBe(true);
    expect(r.outcome).toBe('reassigned');
    expect(r.stage).toBe('manager_review');
    expect(Number(r.workflow.steps.find((s) => s.step_key === 'manager_review').assigned_user_id)).toBe(fm2.id);
    // Logged in the append-only decision log…
    const actions = await all("SELECT user_id FROM workflow_actions WHERE instance_id = $1 AND decision = 'reassign'", [instance.id]);
    expect(actions).toHaveLength(1);
    expect(Number(actions[0].user_id)).toBe(fm.id);
    // …and the step's open action item now points at the new assignee.
    const item = await one(
      "SELECT assigned_user_id FROM action_items WHERE workflow_step_instance_id = $1 AND status IN ('open','in_progress')",
      [(await one("SELECT id FROM workflow_step_instances WHERE instance_id = $1 AND step_key = 'manager_review'", [instance.id])).id]);
    expect(item).toBeTruthy();
    expect(Number(item.assigned_user_id)).toBe(fm2.id);
    // The reassigned user can now act on the step.
    const decided = await decide(instance.id, fm2.id, 'approve', 'from delegate', { role: 'finance_manager', userName: fm2.name });
    expect(decided.ok).toBe(true);
  });

  test('3. getPendingFor: module manager sees their pending item decidable, owner sees all, requester sees their own read-only, others see nothing', async () => {
    seq += 1;
    const expense = await newExpense('pending', 400);
    await legacyInstance(expense, requester.id);

    const manager = await engine.getPendingFor(fm.id, { query: db.query, role: 'finance_manager' });
    let hit = manager.find((p) => p.instance.entity_id === expense);
    expect(hit).toBeDefined();
    expect(hit.can_decide).toBe(true);

    const ownerPending = await engine.getPendingFor(owner.id, { query: db.query, role: 'owner' });
    hit = ownerPending.find((p) => p.instance.entity_id === expense);
    expect(hit).toBeDefined();
    expect(ownerPending.length).toBeGreaterThanOrEqual(1);

    const requesterPending = await engine.getPendingFor(requester.id, { query: db.query, role: 'staff' });
    hit = requesterPending.find((p) => p.instance.entity_id === expense);
    expect(hit).toBeDefined();
    expect(hit.can_decide).toBe(false);

    const staffPending = await engine.getPendingFor(staffApp.id, { query: db.query, role: 'engineer' });
    expect(staffPending.find((p) => p.instance.entity_id === expense)).toBeUndefined();
  });

  test('4. a direct-to-owner module (purchase_orders) starts at owner_review, skipping manager_review', async () => {
    seq += 1;
    const project = (await one("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`wf-${tag}-${seq}`, `WP${tag}${seq}`.slice(0, 20)])).id;
    made.projects.push(project);
    const supplier = (await one('INSERT INTO suppliers (code, name_en, name_ar) VALUES ($1, $1, $1) RETURNING id', [`wf-s-${tag}-${seq}`])).id;
    made.suppliers.push(supplier);
    const po = await db.transaction((client) => require('../../services/procurementService').createPurchaseOrder(client.query.bind(client), {
      supplier_id: supplier, project_id: project,
      lines: [{ description: `wf-${tag}`, quantity: 1, unit_rate: 10 }],
      created_by: owner.id,
    }));
    made.purchaseOrders.push(po.id);

    const wf = await engine.startWorkflow('legacy_module_approval', 'purchase_orders', po.id, {
      module_name: 'purchase_orders', request_type: 'purchase_order', request_id: po.id, requester_id: requester.id,
    }, { query: db.query });
    expect(wf.instance.current_step_key).toBe('owner_review');
    const steps = await all('SELECT step_key, status, assigned_role FROM workflow_step_instances WHERE instance_id = $1', [wf.instance.id]);
    const manager = steps.find((s) => s.step_key === 'manager_review');
    const own = steps.find((s) => s.step_key === 'owner_review');
    expect(manager.status).toBe('skipped');
    expect(own.status).toBe('pending');
    expect(own.assigned_role).toBe('owner');
  });

  test('5. the orphan-cleanup backstop: dry run finds a dead- expense orphan, apply deletes the instance and its legacy twin', async () => {
    seq += 1;
    // Healthy pair: expense + legacy twin, instance active (survives cleanup).
    const healthy = await newExpense('healthy', 5);
    const healthyAr = await newLegacyApproval(healthy, requester.id);
    await engine.startWorkflow('legacy_module_approval', 'expenses', healthy, {
      module_name: 'expenses', request_type: 'healthy', request_id: healthy, requester_id: requester.id, legacy_approval_id: healthyAr,
    }, { query: db.query });
    // Orphan: the same chain, but its expense row is deleted afterwards.
    const doomed = await newExpense('orphan', 6);
    const doomedAr = await newLegacyApproval(doomed, requester.id);
    const doomedInstance = (await engine.startWorkflow('legacy_module_approval', 'expenses', doomed, {
      module_name: 'expenses', request_type: 'orphan', request_id: doomed, requester_id: requester.id, legacy_approval_id: doomedAr,
    }, { query: db.query })).instance;
    await db.query('DELETE FROM expenses WHERE id = $1', [doomed]);

    const dry = await cleanup.cleanOrphanWorkflows(db.query, { apply: false, log: () => {} });
    const mine = dry.orphans.find((o) => Number(o.entity_id) === doomed);
    expect(mine).toBeDefined();
    expect(dry.deleted).toBe(0);
    // The healthy instance is not reported as an orphan.
    expect(dry.orphans.some((o) => Number(o.entity_id) === healthy)).toBe(false);

    const applied = await cleanup.cleanOrphanWorkflows(db.query, { apply: true, log: () => {} });
    expect(applied.deleted).toBeGreaterThanOrEqual(1);
    expect(await one('SELECT id FROM workflow_instances WHERE id = $1', [doomedInstance.id])).toBeUndefined();
    expect(await one('SELECT id FROM approval_requests WHERE id = $1', [doomedAr])).toBeUndefined();
    // The healthy instance and its legacy twin survived.
    expect(await all('SELECT id FROM workflow_instances WHERE entity_id = $1 AND entity_type = $2', [healthy, 'expenses'])).toHaveLength(1);
    expect(await one('SELECT id FROM approval_requests WHERE id = $1', [healthyAr])).toBeTruthy();

    // A second apply has nothing left to do (idempotent).
    const again = await cleanup.cleanOrphanWorkflows(db.query, { apply: true, log: () => {} });
    expect(again.orphans.filter((o) => Number(o.entity_id) === doomed)).toHaveLength(0);
    void again;
  });

  test('6. every catalog workflow template is seeded with its exact state names; RFI carries the parallel reviewer step', async () => {
    for (const catalog of migration.WORKFLOW_CATALOG) {
      const tpl = await one('SELECT * FROM workflow_templates WHERE key = $1', [catalog.key]);
      expect(tpl).toBeTruthy();
      const steps = await all('SELECT name, step_key, mode, resolver_type FROM workflow_steps WHERE template_id = $1 ORDER BY sort_order, id', [tpl.id]);
      expect(steps.map((s) => s.name)).toEqual(catalog.steps.map((s) => s.name));
      for (let i = 0; i < catalog.steps.length; i += 1) {
        expect(steps[i].step_key).toBe(catalog.steps[i].step_key);
        if (catalog.steps[i].mode) expect(steps[i].mode).toBe(catalog.steps[i].mode);
        expect(steps[i].resolver_type).toBe(catalog.steps[i].resolver);
      }
    }
    // The parallel reviewer steps of the catalog are recorded as parallel organization-type steps.
    const templates = await all('SELECT id, key FROM workflow_templates');
    const templateIdByKey = new Map(templates.map((t) => [t.key, t.id]));
    const reviewers = await all('SELECT step_key, name, mode FROM workflow_steps WHERE template_id = $1 ORDER BY sort_order', [templateIdByKey.get('rfi')]);
    const parallel = reviewers.find((s) => s.step_key === 'discipline_review');
    expect(parallel).toEqual(expect.objectContaining({ name: 'Discipline Reviewer(s)', mode: 'parallel' }));
    const rfiStep = await one('SELECT resolver_type FROM workflow_steps WHERE template_id = $1 AND step_key = $2', [templateIdByKey.get('rfi'), 'discipline_review']);
    expect(rfiStep.resolver_type).toBe('organization_type');
    // And the legacy template is there next to the catalog.
    expect(templates.map((t) => t.key)).toContain('legacy_module_approval');
  });

  test('7. escalation rules exist for the manager review step and none dangles on an undefined step', async () => {
    const rules = await all('SELECT template_id, step_key, id FROM escalation_rules');
    expect(rules.length).toBeGreaterThan(0);
    // Every rule points at a step its template actually defines.
    const bound = await all(
      `SELECT er.id FROM escalation_rules er
         JOIN workflow_steps ws ON ws.template_id = er.template_id AND ws.step_key = er.step_key`);
    expect(bound.length).toBe(rules.length);
    expect(rules.every((r) => r.step_key === 'manager_review')).toBe(true);
    expect(await one('SELECT id FROM workflow_templates WHERE key = $1', ['legacy_module_approval'])).toBeTruthy();
  });
});
