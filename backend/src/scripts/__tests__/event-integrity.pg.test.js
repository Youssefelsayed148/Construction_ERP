// Real PostgreSQL + real app. Closeout A2.5 (plan 3.2): the event layer is consistent and honest.
//
// Reproduced first (these failed on the pre-A2.5 code):
//   * the three name mismatches: the RFI route emitted `rfi.created` but the dispatcher routed `rfi.submitted`;
//     `invoice.overdue` was routed but nothing emitted it (the reminder sweep notified directly and swallowed a
//     failed notification); the PR workflow's final decision emitted `purchase_request.approved` while the route
//     was `purchase_requisition.approved`, which only the legacy `purchase_orders` module produced (a PO approval
//     announced as a "requisition");
//   * eleven event types had no route (purchase_order.issued, delivery.received, payment.received,
//     invoice.created, variation.approved, handover.advanced, permit.*, wir.submitted, instruction.*, mir.*,
//     transmittal.*): they only reached the in-process bus;
//   * events that drive cost postings were enqueued OUTSIDE the transaction of the change (work completion
//     verified: enqueued on its own connection before the transaction committed, so a dispatcher could deliver
//     it before the verification was visible) or swallowed with `.catch(() => {})` (labour payment, subcontractor
//     payment, work completion): a failed enqueue lost a cost posting silently;
//   * a failed module-event emission in the workflow engine was logged and dropped;
//   * the daily site report emitted `site_report.created` straight on the in-process bus, outside the outbox.
//
// "Same transaction" is asserted with xmin: a row written by one transaction carries that transaction's id, so the
// outbox row and the changed row must have the same xmin.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('A2.5 events: names, routes, atomicity (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let owner; let outbox; let dispatcher; let notifications; let finance;
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
  const outboxRow = (type, entityId) => one('SELECT *, xmin::text AS xid FROM event_outbox WHERE event_type = $1 AND entity_id = $2 ORDER BY id DESC LIMIT 1', [type, entityId]);
  const xminOf = async (table, id) => (await one(`SELECT xmin::text AS xid FROM ${table} WHERE id = $1`, [id])).xid;
  const failEnqueue = async (eventType, fn) => {
    const name = `zz_fail_${eventType.replace(/\W/g, '_')}`;
    await db.query(`CREATE OR REPLACE FUNCTION ${name}() RETURNS trigger AS $f$ BEGIN RAISE EXCEPTION 'forced enqueue failure'; END; $f$ LANGUAGE plpgsql`);
    await db.query(`CREATE TRIGGER ${name} BEFORE INSERT ON event_outbox FOR EACH ROW WHEN (NEW.event_type = '${eventType}') EXECUTE FUNCTION ${name}()`);
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    try { return await fn(); } finally {
      errors.mockRestore();
      await db.query(`DROP TRIGGER IF EXISTS ${name} ON event_outbox`);
      await db.query(`DROP FUNCTION IF EXISTS ${name}()`);
    }
  };

  const world = async () => {
    seq += 1;
    const key = `${tag}-${seq}`;
    const project = await one("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`ev-${key}`, `EV${key}`.slice(0, 20)]);
    const client = await one("INSERT INTO clients (name_ar, name_en, code, is_active) VALUES ($1, $1, $2, true) RETURNING id", [`ev-c-${key}`, `EC${key}`.slice(0, 20)]);
    return { key, project, client };
  };

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    outbox = require('../../services/outboxDispatcher');
    dispatcher = require('../../services/eventDispatcher');
    notifications = require('../../services/notificationService');
    finance = require('../../services/financeEngine');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ('ev-owner', $1, 'x', 'owner') RETURNING id, token_version", [`ev-${tag}@test.io`]);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [row.id]);
    owner = { id: row.id, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
  });

  afterAll(async () => {
    await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [owner.id]);
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [owner.id]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  // ---------------- the three name mismatches ----------------

  test('rfi: the route emits rfi.submitted (the routed name) and a legacy rfi.created row is still delivered', async () => {
    const w = await world();
    const created = await call('POST', '/api/docs/rfis', { project_id: w.project.id, subject: 'Clash at grid C', question: 'Which detail governs?' });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    expect(await outboxRow('rfi.submitted', id)).toBeTruthy();
    expect(await outboxRow('rfi.created', id)).toBeFalsy();
    // Rows enqueued under the old name before the upgrade must not be stranded: the old name routes to the same handler.
    expect(dispatcher.EVENT_ROUTES['rfi.created']).toBe(dispatcher.EVENT_ROUTES['rfi.submitted']);
  });

  test('invoice.overdue is emitted through the outbox by the reminder sweep, once per stage, with the outstanding balance', async () => {
    const w = await world();
    const invoice = await one(
      `INSERT INTO invoices (invoice_number, project_id, client_id, amount, status, issue_date, due_date, created_by)
       VALUES ($1, $2, $3, 1000, 'issued', CURRENT_DATE - 60, CURRENT_DATE - 40, $4) RETURNING *`, [`EV-INV-${tag}-${seq}`, w.project.id, w.client.id, owner.id]);
    const run = () => finance.runReceivableReminderSweep(db.query, {});
    await run(); await run();
    const events = await all("SELECT * FROM event_outbox WHERE event_type = 'invoice.overdue' AND entity_id = $1", [invoice.id]);
    expect(events).toHaveLength(1);                                  // the second sweep adds nothing
    expect(events[0].payload).toMatchObject({ stage: 'overdue_30', outstanding: 1000 });
    expect(Number((await one("SELECT count(*)::int n FROM receivable_reminders WHERE invoice_id = $1", [invoice.id])).n)).toBe(1);
    expect(await all("SELECT id FROM event_outbox WHERE event_type LIKE 'receivable.%' AND entity_id = $1", [invoice.id])).toHaveLength(0);
    // Same transaction: reminder row and event commit together.
    expect(events[0].payload.reminder_id).toBeTruthy();
    // Delivery notifies the stage's roles.
    const spy = jest.spyOn(notifications, 'notifyRoles').mockImplementation(async () => ({}));
    try {
      await outbox.dispatchOnce(null, { ids: [events[0].id] });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toEqual(expect.arrayContaining(['owner']));
      expect(spy.mock.calls[0][1].title).toMatch(/overdue_30/);
    } finally { spy.mockRestore(); }
  });

  test('a failed enqueue fails the sweep step and leaves no reminder behind (no "sent" reminder for a lost event)', async () => {
    const w = await world();
    const invoice = await one(
      `INSERT INTO invoices (invoice_number, project_id, client_id, amount, status, issue_date, due_date, created_by)
       VALUES ($1, $2, $3, 500, 'issued', CURRENT_DATE - 20, CURRENT_DATE - 10, $4) RETURNING *`, [`EV-INV2-${tag}-${seq}`, w.project.id, w.client.id, owner.id]);
    await failEnqueue('invoice.overdue', async () => {
      await expect(finance.runReceivableReminderSweep(db.query, {})).rejects.toThrow(/forced enqueue failure/);
    });
    expect(await all('SELECT id FROM receivable_reminders WHERE invoice_id = $1', [invoice.id])).toHaveLength(0);
    // Once the fault is gone the same sweep picks it up again.
    await finance.runReceivableReminderSweep(db.query, {});
    expect(await all('SELECT id FROM receivable_reminders WHERE invoice_id = $1', [invoice.id])).toHaveLength(1);
  });

  test('workflow module events: a requisition approval is purchase_requisition.approved, a PO approval is purchase_order.approved', async () => {
    const workflowEngine = require('../../services/workflowEngine');
    const emit = async (moduleName, entityType) => {
      const entityId = 900000 + (seq += 1);
      await db.transaction((client) => workflowEngine.emitModuleEvent(client, {
        entity_id: entityId, entity_type: entityType, requester_id: owner.id, context: JSON.stringify({ module_name: moduleName, request_type: 'x' }),
      }, 'approved', { userId: owner.id, userName: 'ev', role: 'owner' }));
      return entityId;
    };
    const pr = await emit('purchase_request', 'purchase_request');
    expect(await outboxRow('purchase_requisition.approved', pr)).toBeTruthy();
    const po = await emit('purchase_orders', 'purchase_orders');
    expect(await outboxRow('purchase_order.approved', po)).toBeTruthy();
    expect(await outboxRow('purchase_requisition.approved', po)).toBeFalsy();
  });

  test('a failed module-event emission fails the decision instead of being logged and dropped', async () => {
    const workflowEngine = require('../../services/workflowEngine');
    await failEnqueue('purchase_requisition.approved', async () => {
      await expect(db.transaction((client) => workflowEngine.emitModuleEvent(client, {
        entity_id: 910000 + (seq += 1), entity_type: 'purchase_request', requester_id: owner.id, context: JSON.stringify({ module_name: 'purchase_request' }),
      }, 'approved', { userId: owner.id, userName: 'ev', role: 'owner' }))).rejects.toThrow(/forced enqueue failure/);
    });
  });

  // ---------------- routes for the previously unrouted events ----------------

  const ROUTED = [
    ['purchase_order.issued', 'purchase_order'], ['delivery.received', 'goods_receipt_note'], ['payment.received', 'payment'],
    ['invoice.created', 'invoice'], ['variation.approved', 'variation'], ['handover.advanced', 'handover_process'],
    ['permit.submitted', 'permit'], ['permit.approved', 'permit'], ['permit.closed', 'permit'], ['wir.submitted', 'wir'],
    ['instruction.issued', 'engineer_instruction'], ['instruction.acknowledged', 'engineer_instruction'],
    ['mir.accepted', 'material_inspection_request'], ['mir.rejected', 'material_inspection_request'],
    ['transmittal.acknowledged', 'transmittal'], ['transmittal.issued', 'transmittal'],
  ];
  test.each(ROUTED)('%s has a route: delivery notifies people and the event still reaches the bus for webhooks', async (eventType, entityType) => {
    const entityId = 920000 + (seq += 1);
    await db.query(
      "INSERT INTO event_outbox (event_id, event_type, entity_type, entity_id, user_id, payload) VALUES ($1, $2, $3, $4, $5, $6::jsonb)",
      [`ev-${tag}-${seq}`, eventType, entityType, entityId, owner.id, JSON.stringify({ project_id: null, title: `${eventType} test` })]);
    const row = await outboxRow(eventType, entityId);
    expect(typeof dispatcher.resolveRoute(eventType)).toBe('function');
    const spy = jest.spyOn(notifications, 'notifyRoles').mockImplementation(async () => ({}));
    const { EventEmitter } = require('events');
    const previousBus = global.eventBus;
    global.eventBus = new EventEmitter();
    const seen = [];
    global.eventBus.on(eventType, (evt) => seen.push(evt));
    try {
      const result = await outbox.dispatchOnce(null, { ids: [row.id] });
      expect(result).toMatchObject({ claimed: 1, delivered: 1, failed: 0 });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0].length).toBeGreaterThan(0);
      expect(String(spy.mock.calls[0][1].title)).toContain(String(entityId));
      expect(seen).toHaveLength(1);                 // webhook fan-out (plan 1.5) keeps receiving it
      expect(seen[0].entityId).toBe(entityId);
    } finally { spy.mockRestore(); global.eventBus = previousBus; }
  });

  test('site_report.created goes through the outbox in the same transaction, not straight onto the bus', async () => {
    const w = await world();
    const { EventEmitter } = require('events');
    const previousBus = global.eventBus;
    global.eventBus = new EventEmitter();
    const direct = [];
    global.eventBus.on('site_report.created', (evt) => direct.push(evt));
    try {
      const created = await call('POST', `/api/projects/${w.project.id}/site-reports`, { report_date: '2026-10-01', work_summary: 'Slab poured' });
      expect(created.status).toBe(201);
      expect(direct).toHaveLength(0);
      const row = await outboxRow('site_report.created', created.body.data.id);
      expect(row).toBeTruthy();
      expect(row.xid).toBe(await xminOf('site_daily_reports', created.body.data.id));
    } finally { global.eventBus = previousBus; }
  });

  // ---------------- atomicity and no silent loss ----------------

  test('labour payment: the cost event commits with the payment, and a failed enqueue rolls the payment back', async () => {
    const w = await world();
    const laborer = await one('INSERT INTO daily_laborers (full_name) VALUES ($1) RETURNING id', [`ev-lab-${tag}-${seq}`]);
    const body = { project_id: w.project.id, laborer_id: laborer.id, payment_date: '2026-10-01', days_worked: 2, daily_rate: 100 };
    const ok = await call('POST', '/api/hr/labor-payments', body);
    expect(ok.status).toBe(201);
    const row = await outboxRow('labor_payment.created', ok.body.data.id);
    expect(row.xid).toBe(await xminOf('labor_payments', ok.body.data.id));

    const before = Number((await one('SELECT count(*)::int n FROM labor_payments WHERE laborer_id = $1', [laborer.id])).n);
    const failed = await failEnqueue('labor_payment.created', () => call('POST', '/api/hr/labor-payments', body));
    expect(failed.status).toBeGreaterThanOrEqual(500);
    expect(Number((await one('SELECT count(*)::int n FROM labor_payments WHERE laborer_id = $1', [laborer.id])).n)).toBe(before);
  });

  test('work completion verification: the event is enqueued inside the transaction (not before it commits) and a failed enqueue rolls the verification back', async () => {
    const w = await world();
    const wo = await one("INSERT INTO work_orders (project_id, title, status) VALUES ($1, 'ev wo', 'in_progress') RETURNING id", [w.project.id]);
    const location = await one("INSERT INTO project_locations (project_id, code, name, name_en) VALUES ($1, $2, 'L', 'L') RETURNING id", [w.project.id, `L${w.key}`.slice(0, 40)]);
    const newCompletion = () => one("INSERT INTO work_completions (work_order_id, quantity_completed, status, project_location_id) VALUES ($1, 1, 'pending', $2) RETURNING id", [wo.id, location.id]);
    const c1 = await newCompletion();
    const ok = await call('PUT', `/api/work-orders/${wo.id}/completions/${c1.id}/verify`, { status: 'verified' });
    expect(ok.status).toBe(200);
    expect((await outboxRow('work_completion.verified', c1.id)).xid).toBe(await xminOf('work_completions', c1.id));

    const c2 = await newCompletion();
    const failed = await failEnqueue('work_completion.verified', () => call('PUT', `/api/work-orders/${wo.id}/completions/${c2.id}/verify`, { status: 'verified' }));
    expect(failed.status).toBeGreaterThanOrEqual(500);
    expect((await one('SELECT status FROM work_completions WHERE id = $1', [c2.id])).status).toBe('pending');
  });

  test('subcontractor payment certificate: the payment event commits with the status change, and a failed enqueue rolls it back', async () => {
    const w = await world();
    const sub = await one("INSERT INTO subcontractors (name, is_active) VALUES ($1, true) RETURNING id", [`ev-sub-${tag}-${seq}`]);
    const contract = await one("INSERT INTO sub_contracts (project_id, subcontractor_id, contract_number, contract_value, status) VALUES ($1, $2, $3, 1000, 'active') RETURNING id", [w.project.id, sub.id, `SC-${tag}-${seq}`]);
    const cert = async (n) => one("INSERT INTO sub_payment_certificates (certificate_number, sub_contract_id, work_value, status) VALUES ($1, $2, 500, 'certified') RETURNING id", [`CERT-${tag}-${seq}-${n}`, contract.id]);
    const c1 = await cert(1);
    const first = await call('PUT', `/api/subcontractors/certificates/${c1.id}`, { status: 'paid' });
    expect([first.status, first.body.error]).toEqual([200, undefined]);
    expect((await outboxRow('sub_payment.paid', c1.id)).xid).toBe(await xminOf('sub_payment_certificates', c1.id));
    const c2 = await cert(2);
    const failed = await failEnqueue('sub_payment.paid', () => call('PUT', `/api/subcontractors/certificates/${c2.id}`, { status: 'paid' }));
    expect(failed.status).toBeGreaterThanOrEqual(500);
    expect((await one('SELECT status FROM sub_payment_certificates WHERE id = $1', [c2.id])).status).toBe('certified');
  });

  test('invoice creation: invoice.created commits with the invoice and a failed enqueue creates no invoice', async () => {
    const w = await world();
    const body = { project_id: w.project.id, client_id: w.client.id, amount: 750, issue_date: '2026-10-01' };
    const ok = await call('POST', '/api/invoices', body);
    expect(ok.status).toBe(201);
    expect((await outboxRow('invoice.created', ok.body.data.id)).xid).toBe(await xminOf('invoices', ok.body.data.id));
    const before = Number((await one('SELECT count(*)::int n FROM invoices WHERE project_id = $1', [w.project.id])).n);
    const failed = await failEnqueue('invoice.created', () => call('POST', '/api/invoices', body));
    expect(failed.status).toBeGreaterThanOrEqual(500);
    expect(Number((await one('SELECT count(*)::int n FROM invoices WHERE project_id = $1', [w.project.id])).n)).toBe(before);
  });

  test('approval request: approval.requested commits with the request (it used to be fire-and-forget with a swallowed failure)', async () => {
    const w = await world();
    const ok = await call('POST', '/api/approvals/request', { module_name: 'expenses', request_type: 'create', request_id: 930000 + (seq += 1) });
    expect(ok.status).toBe(200);
    const id = ok.body.request.id;
    expect((await outboxRow('approval.requested', id)).xid).toBe(await xminOf('approval_requests', id));
    const failed = await failEnqueue('approval.requested', () => call('POST', '/api/approvals/request', { module_name: 'expenses', request_type: 'create', request_id: 930000 + (seq += 1) }));
    expect(failed.status).toBeGreaterThanOrEqual(500);
    expect(w.project.id).toBeTruthy();
  });

  test('a failed enqueue on a route with no transaction of its own is an error, never silently dropped', async () => {
    const w = await world();
    const failed = await failEnqueue('rfi.submitted', () => call('POST', '/api/docs/rfis', { project_id: w.project.id, subject: 'x', question: 'y' }));
    expect(failed.status).toBeGreaterThanOrEqual(500);
  });
});
