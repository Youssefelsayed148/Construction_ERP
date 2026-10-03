// Real PostgreSQL + real app. Phase 5.1 first slice: Site Engineer, Storekeeper, Quantity Surveyor and
// Document Controller get real per-module grants, and every case runs on the internal API, /api/v1 and MCP.
//
// Failing first: the four roles did not exist (so every "allow" case below was denied), site routes were
// judged as module `projects`, delivery/MIR/GRN routes as `procurement`, and approve/decide/issue routes as
// plain `create`. The "mechanism" block uses ad-hoc roles so it proves those three rules independently of
// the seeded matrix.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('role matrix on internal, v1 and MCP (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let mcp;
  const ids = {};
  const users = {};
  const adHocRoles = [];
  const tag = String(Date.now()).slice(-8);
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];

  const call = async (method, path, token, body) => {
    const res = await fetch(`${base}${path}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined,
    });
    return res.status;
  };

  // userRole = users.role (drives the MCP tool allow-list); grantRole = the role whose grants the user holds.
  const makeUser = async (key, userRole, grantRole = userRole, projectId = ids.pA) => {
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ($1, $2, 'x', $3) RETURNING id, name, token_version", [`rm-${key}`, `rm-${key}-${tag}@test.io`, userRole]);
    await db.query('INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, $2, id FROM roles WHERE key = $3', [row.id, projectId, grantRole]);
    users[key] = { id: row.id, name: row.name, role: userRole, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
  };
  // A throwaway role holding exactly the given [module, action] grants.
  const makeRole = async (key, grants) => {
    const roleKey = `rm_${key}_${tag}`;
    const roleId = (await one("INSERT INTO roles (key, name, is_system) VALUES ($1, $1, false) RETURNING id", [roleKey])).id;
    for (const [module, action] of grants) {
      await db.query('INSERT INTO permissions (module, action) VALUES ($1, $2) ON CONFLICT (module, action) DO NOTHING', [module, action]);
      await db.query('INSERT INTO role_permissions (role_id, permission_id) SELECT $1, id FROM permissions WHERE module = $2 AND action = $3', [roleId, module, action]);
    }
    adHocRoles.push(roleKey);
    return roleKey;
  };

  const surfaceResults = async (user, c) => {
    const out = {};
    const [im, ip, ib] = c.i; out.internal = await call(im, ip, user.token, ib);
    const [vm, vp, vb] = c.v; out.v1 = await call(vm, vp, user.token, vb);
    const [tool, args] = c.m;
    out.mcp = (await mcp.executeTool({ toolName: tool, args, user: { id: user.id, name: user.name, role: user.role }, agentSession: 'rm-test' })).status;
    return out;
  };
  const summarize = (r) => Object.entries(r).map(([surface, status]) => `${surface}:${status}`).join(' ');
  const expectAllowed = (r) => expect(summarize(r)).toBe(Object.keys(r).map((surface) => `${surface}:${r[surface] < 400 ? r[surface] : 'ALLOWED(<400)'}`).join(' '));
  const expectDenied = (r) => expect(summarize(r)).toBe(Object.keys(r).map((surface) => `${surface}:403`).join(' '));

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    mcp = require('../../services/mcpService');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    ids.pA = (await one("INSERT INTO projects (name, name_en, code) VALUES ('rm A', 'rm A', $1) RETURNING id", [`RMA${tag}`])).id;
    ids.client = (await one("INSERT INTO clients (name_ar, name_en) VALUES ('rm', 'rm') RETURNING id")).id;
    ids.inv = (await one("INSERT INTO invoices (invoice_number, project_id, client_id, amount, issue_date) VALUES ($1, $2, $3, 10, CURRENT_DATE) RETURNING id", [`RM-INV-${tag}`, ids.pA, ids.client])).id;
    const sub = (await one("INSERT INTO subcontractors (name) VALUES ($1) RETURNING id", [`rm-sub-${tag}`])).id;
    ids.sc = (await one("INSERT INTO sub_contracts (contract_number, project_id, subcontractor_id, contract_value) VALUES ($1, $2, $3, 100) RETURNING id", [`RM-SC-${tag}`, ids.pA, sub])).id;
    ids.cert = (await one("INSERT INTO sub_payment_certificates (certificate_number, sub_contract_id) VALUES ($1, $2) RETURNING id", [`RM-PC-${tag}`, ids.sc])).id;
    ids.doc = (await one("INSERT INTO project_documents (project_id, title, status) VALUES ($1, 'rm doc', 'draft') RETURNING id", [ids.pA])).id;
    ids.supplier = (await one('INSERT INTO suppliers (code, name_en, name_ar) VALUES ($1, $1, $1) RETURNING id', [`RM-SUP-${tag}`])).id;
    // Supplier invoices resolve their project through their PO; a PO in project A keeps them in scope.
    ids.supplierPo = (await one("INSERT INTO purchase_orders (order_number, supplier_id, project_id, status) VALUES ($1, $2, $3, 'issued') RETURNING id", [`RM-SPO-${tag}`, ids.supplier, ids.pA])).id;
    ids.supplierInvoice = await newSupplierInvoice();
    for (const role of ['site_engineer', 'storekeeper', 'quantity_surveyor', 'document_controller', 'viewer']) await makeUser(role, role);
    await makeUser('owner', 'owner');
  });
  afterAll(async () => {
    const uids = Object.values(users).map((u) => u.id);
    await db.query('DELETE FROM agent_tool_calls WHERE user_id = ANY($1)', [uids]);
    await db.query('DELETE FROM agent_action_requests WHERE requesting_user_id = ANY($1) OR approver_user_id = ANY($1)', [uids]);
    await db.query('DELETE FROM supplier_invoice_lines WHERE supplier_invoice_id IN (SELECT id FROM supplier_invoices WHERE supplier_id = (SELECT id FROM suppliers WHERE code = $1))', [`RM-SUP-${tag}`]);
    await db.query('DELETE FROM supplier_invoices WHERE supplier_id = (SELECT id FROM suppliers WHERE code = $1)', [`RM-SUP-${tag}`]);
    await db.query('DELETE FROM purchase_orders WHERE supplier_id = (SELECT id FROM suppliers WHERE code = $1) AND order_number LIKE $2', [`RM-SUP-${tag}`, `RM-SPO-${tag}%`]);
    await db.query('DELETE FROM site_daily_reports WHERE project_id = $1', [ids.pA]);
    await db.query('DELETE FROM project_documents WHERE project_id = $1', [ids.pA]);
    await db.query('DELETE FROM sub_payment_certificates WHERE id = $1', [ids.cert]);
    await db.query('DELETE FROM sub_contracts WHERE id = $1', [ids.sc]);
    await db.query('DELETE FROM material_inspection_requests WHERE purchase_order_id = $1', [ids.po]);
    await db.query('DELETE FROM deliveries WHERE purchase_order_id = $1', [ids.po]);
    await db.query('DELETE FROM purchase_orders WHERE id = $1', [ids.po]);
    // (the mechanism block overwrites ids.supplier; the fixture supplier goes by its code)
    await db.query('DELETE FROM suppliers WHERE id IN (SELECT id FROM suppliers WHERE code IN ($1, $2))', [`RM-SUP-${tag}`, `rm-sup-${tag}`]);
    await db.query('DELETE FROM invoices WHERE id = $1', [ids.inv]);
    await db.query('DELETE FROM user_project_roles WHERE user_id = ANY($1)', [uids]);
    await db.query('UPDATE users SET is_active = false WHERE id = ANY($1)', [uids]);
    for (const key of adHocRoles) {
      await db.query('DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE key = $1)', [key]);
      await db.query('DELETE FROM roles WHERE key = $1', [key]);
    }
    await db.query('DELETE FROM clients WHERE id = $1', [ids.client]);
    // The owner's supplier-invoice approvals accrue project_costs rows on project A (Phase 3.1).
    await db.query('DELETE FROM project_costs WHERE project_id = $1', [ids.pA]);
    await db.query('DELETE FROM projects WHERE id = $1', [ids.pA]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  const newDoc = async () => (await one("INSERT INTO project_documents (project_id, title, status) VALUES ($1, 'rm doc', 'draft') RETURNING id", [ids.pA])).id;
  const newSupplierInvoice = async () => (await one(
    "INSERT INTO supplier_invoices (invoice_number, supplier_id, purchase_order_id, total_amount, status) VALUES ($1, $2, $3, 100, 'received') RETURNING id",
    [`RM-SI-${tag}-${Date.now() % 1000000}-${Math.floor(Math.random() * 10000)}`, ids.supplier, ids.supplierPo]
  )).id;
  const A = () => ids.pA;
  let day = 0;
  const report = () => { day += 1; return { report_date: `2026-02-${String(day).padStart(2, '0')}`, work_summary: 'poured slab' }; };
  const sameReport = () => { const r = report(); return [r, { ...r, report_date: r.report_date.replace('2026-02', '2026-03') }, { ...r, report_date: r.report_date.replace('2026-02', '2026-04') }]; };
  const CASES = {
    site_engineer: [
      ['allow', 'views the project', () => ({ i: ['GET', `/api/projects/${A()}`], v: ['GET', `/api/v1/projects/${A()}`], m: ['get_project', { id: A() }] })],
      ['allow', 'reads the BOQ', () => ({ i: ['GET', `/api/boq/items/${A()}`], v: ['GET', `/api/v1/boq/${A()}/items`], m: ['get_boq', { project_id: A() }] })],
      ['allow', 'writes a site report', () => { const [a, b, c] = sameReport(); return { i: ['POST', `/api/projects/${A()}/site-reports`, a], v: ['POST', `/api/v1/daily-reports/${A()}`, b], m: ['update_daily_report_draft', { project_id: A(), ...c }] }; }],
      ['deny', 'lists invoices', () => ({ i: ['GET', '/api/invoices'], v: ['GET', '/api/v1/invoices'], m: ['list_invoices', {}] })],
      ['deny', 'edits the project', () => ({ i: ['PUT', `/api/projects/${A()}`, { name_en: 'x' }], v: ['PUT', `/api/v1/projects/${A()}`, { name_en: 'x' }], m: ['close_project', { project_id: A(), status: 'completed' }] })],
      ['deny', 'creates a purchase requisition', () => ({ i: ['POST', '/api/procurement/pr', { title: 't', lines: [{ quantity: 1 }] }], v: ['POST', '/api/v1/purchase-requisitions', { title: 't', lines: [{ quantity: 1 }] }], m: ['create_purchase_requisition_draft', { title: 't', lines: [{ quantity: 1 }] }] })],
    ],
    storekeeper: [
      ['allow', 'lists warehouses', () => ({ i: ['GET', '/api/warehouses'], v: ['GET', '/api/v1/inventory/warehouses'], m: ['get_inventory_status', {}] })],
      ['allow', 'reads materials', () => ({ i: ['GET', '/api/items'], v: ['GET', '/api/v1/materials'], m: ['get_material_requirements', {}] })],
      ['deny', 'lists invoices', () => ({ i: ['GET', '/api/invoices'], v: ['GET', '/api/v1/invoices'], m: ['list_invoices', {}] })],
      ['deny', 'creates a purchase requisition', () => ({ i: ['POST', '/api/procurement/pr', { title: 't', lines: [{ quantity: 1 }] }], v: ['POST', '/api/v1/purchase-requisitions', { title: 't', lines: [{ quantity: 1 }] }], m: ['create_purchase_requisition_draft', { title: 't', lines: [{ quantity: 1 }] }] })],
      ['deny', 'reads the BOQ', () => ({ i: ['GET', `/api/boq/items/${A()}`], v: ['GET', `/api/v1/boq/${A()}/items`], m: ['get_boq', { project_id: A() }] })],
    ],
    quantity_surveyor: [
      ['allow', 'reads the BOQ', () => ({ i: ['GET', `/api/boq/items/${A()}`], v: ['GET', `/api/v1/boq/${A()}/items`], m: ['get_boq', { project_id: A() }] })],
      ['allow', 'lists invoices', () => ({ i: ['GET', '/api/invoices'], v: ['GET', '/api/v1/invoices'], m: ['list_invoices', {}] })],
      ['deny', 'issues an invoice', () => ({ i: ['POST', `/api/finance-ledger/invoices/${ids.inv}/transition`, { status: 'issued' }], v: ['POST', `/api/v1/invoices/${ids.inv}/transition`, { status: 'issued' }], m: ['issue_client_invoice', { invoice_id: ids.inv, status: 'issued' }] })],
      ['deny', 'certifies a subcontractor payment', () => ({ i: ['PUT', `/api/subcontractors/certificates/${ids.cert}`, { status: 'certified' }], v: ['PUT', `/api/v1/subcontracts/certificates/${ids.cert}`, { status: 'certified' }], m: ['approve_payment_certificate', { certificate_id: ids.cert, status: 'certified' }] })],
    ],
    document_controller: [
      ['allow', 'lists documents', () => ({ i: ['GET', `/api/docs/documents?project_id=${A()}`], v: ['GET', `/api/v1/documents?project_id=${A()}`], m: ['list_documents', { project_id: A() }] })],
      ['allow', 'submits a document', async () => ({ i: ['POST', `/api/docs/documents/${await newDoc()}/submit`], v: ['POST', `/api/v1/documents/${await newDoc()}/submit`], m: ['search_documents', { q: 'rm' }] })],
      ['deny', 'approves a document', () => ({ i: ['POST', `/api/docs/documents/${ids.doc}/approve`], v: ['POST', `/api/v1/documents/${ids.doc}/approve`], m: ['list_invoices', {}] })],
      ['deny', 'lists invoices', () => ({ i: ['GET', '/api/invoices'], v: ['GET', '/api/v1/invoices'], m: ['list_invoices', {}] })],
    ],
    viewer: [
      ['allow', 'views the project', () => ({ i: ['GET', `/api/projects/${A()}`], v: ['GET', `/api/v1/projects/${A()}`], m: ['get_project', { id: A() }] })],
      ['deny', 'lists invoices', () => ({ i: ['GET', '/api/invoices'], v: ['GET', '/api/v1/invoices'], m: ['list_invoices', {}] })],
      ['deny', 'writes a site report', () => { const [a, b, c] = sameReport(); return { i: ['POST', `/api/projects/${A()}/site-reports`, a], v: ['POST', `/api/v1/daily-reports/${A()}`, b], m: ['update_daily_report_draft', { project_id: A(), ...c }] }; }],
      // Phase 3.1: approving a supplier invoice is the cost accrual point for services.
      ['deny', 'approves a supplier invoice', () => ({ i: ['POST', `/api/procurement/invoices/${ids.supplierInvoice}/approve`], v: ['POST', `/api/v1/supplier-invoices/${ids.supplierInvoice}/approve`], m: ['approve_supplier_invoice', { supplier_invoice_id: ids.supplierInvoice }] })],
    ],
  };

  for (const [role, cases] of Object.entries(CASES)) {
    describe(role, () => {
      for (const [expectation, label, build] of cases) {
        test(`${expectation === 'allow' ? 'can' : 'cannot'}: ${label}`, async () => {
          const results = await surfaceResults(users[role], await build());
          if (expectation === 'allow') expectAllowed(results); else expectDenied(results);
        });
      }
    });
  }

  test('control: an owner can do the same approve and issue actions the roles above are refused', async () => {
    expect(await call('POST', `/api/docs/documents/${ids.doc}/approve`, users.owner.token)).toBe(200);
    expect(await call('POST', `/api/v1/documents/${ids.doc}/approve`, users.owner.token)).toBe(200);
    // Phase 3.1: the owner approves a supplier invoice; the MCP tool proposes it and the gated decision
    // (separate surface, tested in the approval-gate suite) executes it. Each surface gets its own
    // invoice because approval moves the row to 'approved'.
    const a = await newSupplierInvoice();
    const b = await newSupplierInvoice();
    expect(await call('POST', `/api/procurement/invoices/${a}/approve`, users.owner.token)).toBe(200);
    expect(await call('POST', `/api/v1/supplier-invoices/${b}/approve`, users.owner.token)).toBe(200);
    expect((await mcp.executeTool({ toolName: 'approve_supplier_invoice', args: { supplier_invoice_id: await newSupplierInvoice() }, user: users.owner, agentSession: 'rm-test' })).status).toBe(202);
  });

  describe('mechanisms (ad-hoc roles, independent of the seeded matrix)', () => {
    test('site routes are judged as module "site", not "projects"', async () => {
      const role = await makeRole('site_only', [['site', 'create'], ['projects', 'view']]);
      await makeUser('site_only', 'engineer', role);
      const u = users.site_only;
      const [a, b, c] = sameReport();
      expectAllowed(await surfaceResults(u, {
        i: ['POST', `/api/projects/${A()}/site-reports`, a], v: ['POST', `/api/v1/daily-reports/${A()}`, b], m: ['update_daily_report_draft', { project_id: A(), ...c }],
      }));
      // ...and holding only projects.view is not enough to write one.
      const view = await makeRole('projects_view', [['projects', 'view']]);
      await makeUser('projects_view', 'engineer', view);
      const [d, e, f] = sameReport();
      expectDenied(await surfaceResults(users.projects_view, {
        i: ['POST', `/api/projects/${A()}/site-reports`, d], v: ['POST', `/api/v1/daily-reports/${A()}`, e], m: ['update_daily_report_draft', { project_id: A(), ...f }],
      }));
    });

    test('delivery, MIR and GRN routes are judged as module "inventory", not "procurement"', async () => {
      const role = await makeRole('inventory_only', [['inventory', 'create'], ['inventory', 'view']]);
      await makeUser('inventory_only', 'engineer', role);
      // Reaches the handler (which then reports a business error): not a 403.
      const supplier = (await one("INSERT INTO suppliers (name_ar, name_en) VALUES ($1, $1) RETURNING id", [`rm-sup-${tag}`])).id;
      const po = (await one("INSERT INTO purchase_orders (order_number, supplier_id, project_id, status) VALUES ($1, $2, $3, 'issued') RETURNING id", [`RM-PO-${tag}`, supplier, ids.pA])).id;
      const delivery = (await one("INSERT INTO deliveries (purchase_order_id, supplier_id) VALUES ($1, $2) RETURNING id", [po, supplier])).id;
      ids.po = po; ids.supplier = supplier;
      const statuses = [
        await call('POST', '/api/procurement/deliveries', users.inventory_only.token, {}),
        await call('POST', `/api/v1/deliveries/${delivery}/mir`, users.inventory_only.token, {}),
      ];
      for (const s of statuses) expect(s).not.toBe(403);
      // procurement.create alone does not unlock them.
      const proc = await makeRole('procurement_only', [['procurement', 'create']]);
      await makeUser('procurement_only', 'engineer', proc);
      expect(await call('POST', '/api/procurement/deliveries', users.procurement_only.token, {})).toBe(403);
    });

    test('approve, decide and issue routes need the matching action, not just create', async () => {
      const role = await makeRole('creator', [['docs', 'create'], ['docs', 'view'], ['finance-ledger', 'create'], ['subcontractors', 'edit']]);
      await makeUser('creator', 'engineer', role);
      const u = users.creator;
      expectDenied(await surfaceResults(u, {
        i: ['POST', `/api/docs/documents/${ids.doc}/approve`], v: ['POST', `/api/v1/documents/${ids.doc}/approve`], m: ['issue_client_invoice', { invoice_id: ids.inv, status: 'issued' }],
      }));
      expect(await call('PUT', `/api/subcontractors/certificates/${ids.cert}`, u.token, { status: 'certified' })).toBe(403);
      expect(await call('POST', `/api/finance-ledger/invoices/${ids.inv}/transition`, u.token, { status: 'issued' })).toBe(403);
      // with the real action it goes through
      const approver = await makeRole('approver', [['docs', 'approve']]);
      await makeUser('approver', 'engineer', approver);
      expect(await call('POST', `/api/docs/documents/${ids.doc}/approve`, users.approver.token)).toBe(200);
      expect(await call('POST', `/api/v1/documents/${ids.doc}/approve`, users.approver.token)).toBe(200);
    });
  });

  describe('registration', () => {
    const register = async (token, body) => {
      const res = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: 'Reg', password: 'a long enough password 1', ...body }) });
      return { status: res.status, body: await res.json().catch(() => null) };
    };
    const rows = async (userId) => (await db.query('SELECT r.key, upr.project_id FROM user_project_roles upr JOIN roles r ON r.id = upr.role_id WHERE upr.user_id = $1', [userId])).rows;

    test('a new account defaults to the least-privilege role, not staff', async () => {
      const r = await register(users.owner.token, { email: `rm-reg1-${tag}@test.io` });
      expect(r.status).toBe(201);
      expect(r.body.data.role).toBe('viewer');
      expect(await rows(r.body.data.id)).toEqual([{ key: 'viewer', project_id: null }]);
    });

    test('any known role can be chosen; unknown roles and owner-by-admin are refused', async () => {
      const ok = await register(users.owner.token, { email: `rm-reg2-${tag}@test.io`, role: 'storekeeper' });
      expect(ok.status).toBe(201);
      expect((await register(users.owner.token, { email: `rm-reg3-${tag}@test.io`, role: 'galactic_overlord' })).status).toBe(400);
      await makeUser('rm_admin', 'admin');
      expect((await register(users.rm_admin.token, { email: `rm-reg4-${tag}@test.io`, role: 'owner' })).status).toBe(403);
    });

    test('a project-bound external role gets no company-wide row', async () => {
      const r = await register(users.owner.token, { email: `rm-reg5-${tag}@test.io`, role: 'consultant' });
      expect(r.status).toBe(201);
      expect(await rows(r.body.data.id)).toEqual([]);
    });

    afterAll(async () => {
      const regs = (await db.query("SELECT id FROM users WHERE email LIKE $1", [`rm-reg%-${tag}@test.io`])).rows.map((x) => x.id);
      await db.query('DELETE FROM user_project_roles WHERE user_id = ANY($1)', [regs]);
      await db.query('UPDATE users SET is_active = false WHERE id = ANY($1)', [regs]);
    });
  });
});
