// Real PostgreSQL + real app. Phase 2.5a: nothing financial or master is hard-deleted any more.
// Reproduced first: DELETE /api/items/:id, /api/suppliers/:id, /api/payments/:id and /api/invoices/:id ran
// `DELETE FROM ...` (items and suppliers cascaded into POs, lines, quotations, invoices).
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('soft delete and void-with-reason (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let owner;
  const tag = String(Date.now()).slice(-7);
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const made = { items: [], suppliers: [], pos: [], invoices: [], payments: [], projects: [], clients: [] };

  const call = async (method, path, body) => {
    const res = await fetch(`${base}${path}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` }, body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* empty */ }
    return { status: res.status, body: json };
  };

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ('sd-owner', $1, 'x', 'owner') RETURNING id, token_version", [`sd-${tag}@test.io`]);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [row.id]);
    owner = { id: row.id, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
  });
  afterAll(async () => {
    await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [owner.id]);
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [owner.id]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  const newItem = async (label) => {
    const r = await call('POST', '/api/items', { code: `SD-${tag}-${label}`, category: 'other', unit: 'piece', name_en: `sd ${label}`, name_ar: `sd ${label}` });
    made.items.push(r.body.data.id); return r.body.data;
  };
  const newSupplier = async (label) => {
    const r = await call('POST', '/api/suppliers', { name_en: `sd ${tag} ${label}`, name_ar: `sd ${tag} ${label}` });
    made.suppliers.push(r.body.data.id); return r.body.data;
  };
  // project + client + issued invoice + one payment of `paid` against it
  const invoiceWithPayment = async (label, { amount = 1000, paid = 400 } = {}) => {
    const client = (await one('INSERT INTO clients (name_en, name_ar) VALUES ($1, $1) RETURNING id', [`sd-${tag}-${label}`])).id;
    const project = (await one("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`sd-${tag}-${label}`, `SD${tag}${label}`.slice(0, 20)])).id;
    made.clients.push(client); made.projects.push(project);
    const inv = (await call('POST', '/api/invoices', { project_id: project, client_id: client, amount, issue_date: '2026-01-01', due_date: '2099-01-01' })).body.data;
    made.invoices.push(inv.id);
    let payment = null;
    if (paid) {
      const r = await call('POST', '/api/payments', { invoice_id: inv.id, project_id: project, client_id: client, amount: paid, payment_date: '2026-01-02' });
      payment = r.body.data; made.payments.push(payment.id);
    }
    return { inv, payment, project, client };
  };

  describe('items and suppliers', () => {
    test('deleting an item keeps the row, hides it from lists, keeps history readable, and can be restored', async () => {
      const item = await newItem('a');
      const del = await call('DELETE', `/api/items/${item.id}`);
      expect(del.status).toBe(200);
      const row = await one('SELECT deleted_at, deleted_by, is_active FROM item_master WHERE id = $1', [item.id]);
      expect(row.deleted_at).not.toBeNull();
      expect(row.deleted_by).toBe(owner.id);
      expect(row.is_active).toBe(false);
      const list = await call('GET', `/api/items?search=SD-${tag}-a`);
      expect(list.body.data.map((i) => i.id)).not.toContain(item.id);
      const withDeleted = await call('GET', `/api/items?search=SD-${tag}-a&include_deleted=true`);
      expect(withDeleted.body.data.map((i) => i.id)).toContain(item.id);
      expect((await call('GET', `/api/items/${item.id}`)).status).toBe(200); // history still resolves it
      expect((await call('DELETE', `/api/items/${item.id}`)).status).toBe(404); // already deleted
      const restored = await call('POST', `/api/items/${item.id}/restore`);
      expect(restored.status).toBe(200);
      expect((await one('SELECT deleted_at, is_active FROM item_master WHERE id = $1', [item.id]))).toEqual({ deleted_at: null, is_active: true });
    });

    test('a filtered item list works (it returned 500: the count query renumbered its placeholders by -2)', async () => {
      const item = await newItem('f');
      const res = await call('GET', `/api/items?search=SD-${tag}-f&category=other`);
      expect(res.status).toBe(200);
      expect(res.body.data.map((i) => i.id)).toContain(item.id);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    });

    test('an item that purchase orders reference survives deletion with its order lines intact', async () => {
      const item = await newItem('b');
      const supplier = await newSupplier('b');
      const po = (await one("INSERT INTO purchase_orders (order_number, supplier_id, status) VALUES ($1, $2, 'issued') RETURNING id", [`SD-PO-${tag}`, supplier.id])).id;
      made.pos.push(po);
      await db.query('INSERT INTO purchase_order_lines (purchase_order_id, material_id, quantity, unit_rate) VALUES ($1, $2, 5, 10)', [po, item.id]);
      expect((await call('DELETE', `/api/items/${item.id}`)).status).toBe(200);
      expect((await call('DELETE', `/api/suppliers/${supplier.id}`)).status).toBe(200);
      expect((await one('SELECT count(*)::int AS n FROM purchase_order_lines WHERE purchase_order_id = $1', [po])).n).toBe(1);
      expect((await one('SELECT count(*)::int AS n FROM purchase_orders WHERE id = $1', [po])).n).toBe(1);
    });

    test('deleting a supplier keeps the row, hides it from lists and records who and why', async () => {
      const supplier = await newSupplier('c');
      const del = await call('DELETE', `/api/suppliers/${supplier.id}`, { reason: 'duplicate record' });
      expect(del.status).toBe(200);
      const row = await one('SELECT deleted_at, deleted_by, delete_reason, is_active FROM suppliers WHERE id = $1', [supplier.id]);
      expect(row.deleted_by).toBe(owner.id);
      expect(row.delete_reason).toBe('duplicate record');
      expect(row.is_active).toBe(false);
      expect((await call('GET', `/api/suppliers?search=${tag}%20c`)).body.data.map((s) => s.id)).not.toContain(supplier.id);
      expect((await call('POST', `/api/suppliers/${supplier.id}/restore`)).status).toBe(200);
    });
  });

  describe('payments', () => {
    test('a reason is required; voiding keeps the row and puts the invoice back', async () => {
      const f = await invoiceWithPayment('p1');
      expect((await call('DELETE', `/api/payments/${f.payment.id}`)).status).toBe(400);
      expect((await one('SELECT voided_at FROM payments WHERE id = $1', [f.payment.id])).voided_at).toBeNull();
      const res = await call('DELETE', `/api/payments/${f.payment.id}`, { reason: 'bounced cheque' });
      expect(res.status).toBe(200);
      const p = await one('SELECT voided_at, voided_by, void_reason FROM payments WHERE id = $1', [f.payment.id]);
      expect(p.voided_at).not.toBeNull();
      expect(p.voided_by).toBe(owner.id);
      expect(p.void_reason).toBe('bounced cheque');
      expect((await one('SELECT status FROM invoices WHERE id = $1', [f.inv.id])).status).not.toMatch(/paid/);
      const alloc = await one('SELECT count(*)::int AS live FROM payment_allocations WHERE payment_id = $1 AND voided_at IS NULL', [f.payment.id]);
      expect(alloc.live).toBe(0);
      expect((await one('SELECT count(*)::int AS n FROM payment_allocations WHERE payment_id = $1', [f.payment.id])).n).toBe(1); // kept
    });

    test('a voided payment no longer counts toward what the invoice has been paid, and the invoice can be paid in full again', async () => {
      const f = await invoiceWithPayment('p2', { amount: 1000, paid: 1000 });
      expect((await one('SELECT status FROM invoices WHERE id = $1', [f.inv.id])).status).toBe('paid');
      await call('DELETE', `/api/payments/${f.payment.id}`, { reason: 'wrong invoice' });
      const detail = await call('GET', `/api/invoices/${f.inv.id}`);
      expect(Number(detail.body.data.total_paid)).toBe(0);
      const again = await call('POST', '/api/payments', { invoice_id: f.inv.id, project_id: f.project, client_id: f.client, amount: 1000, payment_date: '2026-02-01' });
      expect(again.status).toBe(201);
      made.payments.push(again.body.data.id);
    });

    test('three concurrent voids: exactly one wins', async () => {
      const f = await invoiceWithPayment('p3');
      const rs = await Promise.all([1, 2, 3].map(() => call('DELETE', `/api/payments/${f.payment.id}`, { reason: 'dup' })));
      expect(rs.filter((r) => r.status === 200).length).toBe(1);
      expect(rs.filter((r) => r.status === 409).length).toBe(2);
    });

    test('a voided payment cannot be allocated', async () => {
      const f = await invoiceWithPayment('p4', { amount: 1000, paid: 400 });
      await call('DELETE', `/api/payments/${f.payment.id}`, { reason: 'x' });
      const r = await call('POST', `/api/finance-ledger/payments/${f.payment.id}/allocate`, { allocations: [{ target_type: 'client_invoice', invoice_id: f.inv.id, amount: 100 }] });
      expect(r.status).toBe(400);
    });

    test('project collected totals exclude voided payments', async () => {
      const f = await invoiceWithPayment('p5', { amount: 1000, paid: 700 });
      const before = await call('GET', `/api/finance/project/${f.project}`);
      expect(Number(before.body.data.total_paid)).toBe(700);
      await call('DELETE', `/api/payments/${f.payment.id}`, { reason: 'x' });
      const after = await call('GET', `/api/finance/project/${f.project}`);
      expect(Number(after.body.data.total_paid)).toBe(0);
    });
  });

  describe('invoices', () => {
    test('a reason is required; the invoice becomes void, the row stays', async () => {
      const f = await invoiceWithPayment('i1', { paid: 0 });
      expect((await call('DELETE', `/api/invoices/${f.inv.id}`)).status).toBe(400);
      const res = await call('DELETE', `/api/invoices/${f.inv.id}`, { reason: 'issued in error' });
      expect(res.status).toBe(200);
      const row = await one('SELECT status, voided_at, voided_by, void_reason FROM invoices WHERE id = $1', [f.inv.id]);
      expect(row.status).toBe('void');
      expect(row.voided_at).not.toBeNull();
      expect(row.voided_by).toBe(owner.id);
      expect(row.void_reason).toBe('issued in error');
      expect((await call('DELETE', `/api/invoices/${f.inv.id}`, { reason: 'again' })).status).toBe(409);
      // an overdue-looking voided invoice must not be flipped back to 'overdue' by a read
      await db.query("UPDATE invoices SET due_date = '2020-01-01' WHERE id = $1", [f.inv.id]);
      expect((await call('GET', `/api/invoices/${f.inv.id}`)).body.data.status).toBe('void');
      expect((await call('GET', `/api/invoices?project_id=${f.project}`)).body.data[0].status).toBe('void');
    });

    test('an invoice with live payments cannot be voided until the payments are', async () => {
      const f = await invoiceWithPayment('i2', { paid: 300 });
      const blocked = await call('DELETE', `/api/invoices/${f.inv.id}`, { reason: 'x' });
      expect(blocked.status).toBe(400);
      expect(blocked.body.paymentCount).toBe(1);
      await call('DELETE', `/api/payments/${f.payment.id}`, { reason: 'x' });
      expect((await call('DELETE', `/api/invoices/${f.inv.id}`, { reason: 'x' })).status).toBe(200);
    });
  });

  describe('permissions for the new void action (internal API, /api/v1 and MCP)', () => {
    let probe;
    const probeRoles = [];
    const makeUser = async (roleKey, grants) => {
      const role = (await one("INSERT INTO roles (key, name, is_system) VALUES ($1, $1, false) RETURNING id", [`${roleKey}-${tag}`])).id;
      for (const [module, action] of grants) {
        const perm = (await one('INSERT INTO permissions (module, action) VALUES ($1, $2) ON CONFLICT (module, action) DO UPDATE SET module = EXCLUDED.module RETURNING id', [module, action])).id;
        await db.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [role, perm]);
      }
      const u = await one("INSERT INTO users (name, email, password, role) VALUES ($1, $2, 'x', $3) RETURNING id, token_version", [`sd-${roleKey}`, `sd-${roleKey}-${tag}@test.io`, `${roleKey}-${tag}`]);
      await db.query('INSERT INTO user_project_roles (user_id, project_id, role_id) VALUES ($1, NULL, $2)', [u.id, role]);
      probeRoles.push(role);
      return { id: u.id, role, token: tokens.signSession({ userId: u.id, tokenVersion: u.token_version }) };
    };
    const asUser = async (u, method, path, body) => {
      const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` }, body: body ? JSON.stringify(body) : undefined });
      return res.status;
    };
    afterAll(async () => {
      for (const u of probe ? Object.values(probe) : []) {
        await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [u.id]);
        await db.query('UPDATE users SET is_active = false WHERE id = $1', [u.id]);
      }
      // The probe roles are test fixtures; other suites list every role in the table.
      await db.query('DELETE FROM role_permissions WHERE role_id = ANY($1)', [probeRoles]);
      await db.query('DELETE FROM roles WHERE id = ANY($1)', [probeRoles]);
    });

    test('a role with delete but not void cannot void a payment or an invoice; with void it can', async () => {
      probe = {
        noVoid: await makeUser('sdnovoid', [['payments', 'view'], ['payments', 'delete'], ['invoices', 'view'], ['invoices', 'delete']]),
        voider: await makeUser('sdvoider', [['payments', 'view'], ['payments', 'void'], ['invoices', 'view'], ['invoices', 'void']]),
      };
      const f = await invoiceWithPayment('perm1', { paid: 100 });
      expect(await asUser(probe.noVoid, 'DELETE', `/api/payments/${f.payment.id}`, { reason: 'x' })).toBe(403);
      expect(await asUser(probe.noVoid, 'DELETE', `/api/invoices/${f.inv.id}`, { reason: 'x' })).toBe(403);
      expect((await one('SELECT voided_at FROM payments WHERE id = $1', [f.payment.id])).voided_at).toBeNull();
      expect(await asUser(probe.voider, 'DELETE', `/api/payments/${f.payment.id}`, { reason: 'ok' })).toBe(200);
      expect(await asUser(probe.voider, 'DELETE', `/api/invoices/${f.inv.id}`, { reason: 'ok' })).toBe(200);
    });

    test('restoring a master needs the delete grant', async () => {
      const item = await newItem('perm');
      await call('DELETE', `/api/items/${item.id}`);
      const viewer = await makeUser('sdview', [['items', 'view'], ['items', 'create'], ['items', 'edit']]);
      probe.viewer = viewer;
      expect(await asUser(viewer, 'POST', `/api/items/${item.id}/restore`)).toBe(403);
      expect(await asUser(viewer, 'DELETE', `/api/items/${item.id}`)).toBe(403);
    });

    test('/api/v1 does not route a void or delete for payments or invoices', async () => {
      const f = await invoiceWithPayment('perm2', { paid: 100 });
      for (const path of [`/api/v1/payments/${f.payment.id}`, `/api/v1/invoices/${f.inv.id}`]) {
        expect([404, 405]).toContain((await call('DELETE', path, { reason: 'x' })).status);
      }
      expect((await one('SELECT voided_at FROM payments WHERE id = $1', [f.payment.id])).voided_at).toBeNull();
    });

    test('MCP void_financial_record needs a reason, and carries it into the invoice void', async () => {
      const mcp = require('../../services/mcpService');
      const f = await invoiceWithPayment('perm3', { paid: 0 });
      const user = { id: owner.id, name: 'sd-owner', role: 'owner' };
      const without = await mcp.executeTool({ toolName: 'void_financial_record', args: { record_id: f.inv.id }, user, agentSession: 'sd-test' });
      expect(without.status).toBe(400);
      const withReason = await mcp.executeTool({ toolName: 'void_financial_record', args: { record_id: f.inv.id, reason: 'agent found a duplicate' }, user, agentSession: 'sd-test' });
      expect([200, 202]).toContain(withReason.status);
      // gated: nothing is voided until a human approves
      expect((await one('SELECT status FROM invoices WHERE id = $1', [f.inv.id])).status).not.toBe('void');
      const request = await one("SELECT payload, reason FROM agent_action_requests WHERE tool = 'void_financial_record' AND payload->>'record_id' = $1 ORDER BY id DESC LIMIT 1", [String(f.inv.id)]);
      expect(request.payload.reason || request.reason).toBe('agent found a duplicate');
    });
  });

  test('no route ran DELETE FROM on the financial rows above', async () => {
    const counts = await one(
      'SELECT (SELECT count(*) FROM invoices WHERE id = ANY($1))::int AS invoices, (SELECT count(*) FROM payments WHERE id = ANY($2))::int AS payments',
      [made.invoices, made.payments]);
    expect(counts.invoices).toBe(made.invoices.length);
    expect(counts.payments).toBe(made.payments.length);
  });
});
