const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const tokens = require('../../services/tokens');
const describePg = process.env.TEST_PG === '1' ? describe : describe.skip;

describePg('R0.2 owner GET route smoke on migrated PostgreSQL', () => {
  let db; let app; let server; let base; let token; let owner; let project;
  const tag = `${Date.now()}-${process.pid}`;
  const confirmed = ['/api/warehouses/transfers', '/api/warehouses/reservations', '/api/qhse/calibration-records', '/api/qhse/mirs', '/api/quantities/measurements', '/api/expenses', '/api/maintenance'];
  const call = async (route) => {
    const url = new URL(route, base);
    url.searchParams.set('project_id', String(project.id));
    url.searchParams.set('status', 'active');
    url.searchParams.set('limit', '5');
    const result = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
    const responseBody = await result.text();
    if (result.status >= 500) {
      try { console.log(`R0.2 server error ${route}: ${(JSON.parse(responseBody).error || 'internal error').toString()}`); }
      catch (_) { console.log(`R0.2 server error ${route}: response body was not JSON`); }
    }
    return result.status;
  };
  const expectPagePair = async (route, filters = {}, idKey = 'id') => {
    const fetchPage = async (offset) => {
      const url = new URL(route, base);
      for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, String(value));
      url.searchParams.set('limit', '1');
      url.searchParams.set('offset', String(offset));
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json();
      if (response.status >= 500) console.log(`pagination route error ${route}: ${String(body.error || 'internal error')}`);
      return { response, body };
    };
    const first = await fetchPage(0);
    const second = await fetchPage(1);
    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(200);
    expect(first.response.headers.get('x-total-count')).toBe('3');
    expect(second.response.headers.get('x-total-count')).toBe('3');
    expect(first.body.data).toHaveLength(1);
    expect(second.body.data).toHaveLength(1);
    expect(first.body.data[0][idKey]).not.toBe(second.body.data[0][idKey]);
  };
  const expectNestedPagePair = async (route, key) => {
    const fetchPage = async (offset) => {
      const url = new URL(route, base);
      url.searchParams.set('limit', '1');
      url.searchParams.set('offset', String(offset));
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      return { response, body: await response.json() };
    };
    const first = await fetchPage(0);
    const second = await fetchPage(1);
    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(200);
    expect(first.response.headers.get('x-total-count')).toBe('3');
    expect(second.response.headers.get('x-total-count')).toBe('3');
    expect(first.body.data[key]).toHaveLength(1);
    expect(second.body.data[key]).toHaveLength(1);
    expect(first.body.data[key][0].id).not.toBe(second.body.data[key][0].id);
  };

  beforeAll(async () => {
    db = require('../../config/database');
    ({ app } = require('../../../server'));
    owner = (await db.query("INSERT INTO users (name, email, password, role) VALUES ('r02-owner', $1, 'unused', 'owner') RETURNING id, token_version", [`r02-${tag}@test.invalid`])).rows[0];
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [owner.id]);
    token = tokens.signSession({ userId: owner.id, tokenVersion: owner.token_version });
    project = (await db.query("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`r02-${tag}`, `R02-${tag}`])).rows[0];
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (owner) {
      await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [owner.id]);
      await db.query('UPDATE users SET is_active = false WHERE id = $1', [owner.id]);
    }
    if (project) await db.query('DELETE FROM projects WHERE id = $1', [project.id]);
    if (db) await db.pool.end();
  });

  test.each(confirmed)('%s accepts typical filters without server failure', async (route) => {
    expect(await call(route)).toBe(200);
  });

  test.each([
    { family: 'clients', table: 'clients', route: '/api/clients', codePrefix: 'R2P-CLI' },
    { family: 'suppliers', table: 'suppliers', route: '/api/suppliers', codePrefix: 'R2P-SUP' },
    { family: 'HR employees', table: 'employees', route: '/api/hr/employees', codePrefix: 'R2P-HR' },
  ])('$family route advances to page 2 with a correct total and no overlap', async ({ table, route, codePrefix }) => {
    const names = [0, 1, 2].map((n) => `r02-page-${tag}-${n}`);
    const codes = names.map((_, n) => `${codePrefix}-${tag}-${n}`);
    if (table === 'clients') {
      for (let n = 0; n < names.length; n += 1) {
        await db.query('INSERT INTO clients (code, name_ar, name_en, client_type) VALUES ($1, $2, $2, $3)', [codes[n], names[n], `pagination-${tag}`]);
      }
    } else if (table === 'suppliers') {
      for (let n = 0; n < names.length; n += 1) {
        await db.query('INSERT INTO suppliers (name_ar, name_en, code) VALUES ($1, $1, $2)', [names[n], codes[n]]);
      }
    } else {
      for (let n = 0; n < names.length; n += 1) {
        await db.query('INSERT INTO employees (code, name, name_en, name_ar) VALUES ($1, $2, $2, $2)', [codes[n], names[n]]);
      }
    }
    try {
      const fetchPage = async (offset) => {
        const url = new URL(route, base);
        url.searchParams.set('search', `r02-page-${tag}`);
        url.searchParams.set('limit', '1');
        url.searchParams.set('offset', String(offset));
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        return { response, body: await response.json() };
      };
      const first = await fetchPage(0);
      const second = await fetchPage(1);
      expect(first.response.status).toBe(200);
      expect(second.response.status).toBe(200);
      expect(first.response.headers.get('x-total-count')).toBe('3');
      expect(second.response.headers.get('x-total-count')).toBe('3');
      expect(first.body.data).toHaveLength(1);
      expect(second.body.data).toHaveLength(1);
      expect(first.body.data[0].id).not.toBe(second.body.data[0].id);
    } finally {
      await db.query(`DELETE FROM ${table} WHERE code = ANY($1)`, [codes]);
    }
  });

  test('notification inbox advances to page 2 with a correct total and no overlap', async () => {
    const titles = [0, 1, 2].map((n) => `r02-page-${tag}-${n}`);
    for (const title of titles) await db.query(
      "INSERT INTO notifications (user_id, title, event_type, status) VALUES ($1, $2, 'pagination-test', 'unread')",
      [owner.id, title]
    );
    try {
      const fetchPage = async (offset) => {
        const url = new URL('/api/notifications', base);
        url.searchParams.set('limit', '1');
        url.searchParams.set('offset', String(offset));
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        return { response, body: await response.json() };
      };
      const first = await fetchPage(0);
      const second = await fetchPage(1);
      expect(first.response.status).toBe(200);
      expect(second.response.status).toBe(200);
      expect(first.response.headers.get('x-total-count')).toBe('3');
      expect(second.response.headers.get('x-total-count')).toBe('3');
      expect(first.body.data).toHaveLength(1);
      expect(second.body.data).toHaveLength(1);
      expect(first.body.data[0].id).not.toBe(second.body.data[0].id);
    } finally {
      await db.query("DELETE FROM notifications WHERE user_id = $1 AND event_type = 'pagination-test'", [owner.id]);
    }
  });

  test('notification delivery history advances to page 2 with correct total and no overlap', async () => {
    try {
      for (let n = 0; n < 3; n += 1) await db.query(
        `INSERT INTO notification_deliveries (user_id, channel, event_type, idempotency_key, provider, status, payload)
         VALUES ($1, 'email', $2, md5($3)::char(64), 'pagination-test', 'sent', '{}'::jsonb)`,
        [owner.id, `pagination-${tag}`, `delivery-${tag}-${n}`]
      );
      await expectPagePair('/api/notifications/deliveries');
    } finally {
      await db.query('DELETE FROM notification_deliveries WHERE user_id = $1 AND event_type = $2', [owner.id, `pagination-${tag}`]);
    }
  });

  test('procurement project workspace advances the purchase-order array and reports its total', async () => {
    const material = (await db.query(
      "INSERT INTO item_master (code, category, name_en, name_ar, unit) VALUES ($1, 'pagination-test', $2, $2, 'ea') RETURNING id",
      [`R2P-ITEM-${tag}`, `r02-page-${tag}`]
    )).rows[0].id;
    try {
      for (let n = 0; n < 3; n += 1) await db.query(
        "INSERT INTO purchase_orders (order_number, project_id, material_id, quantity, status) VALUES ($1, $2, $3, 1, 'issued')",
        [`R2P-PO-${tag}-${n}`, project.id, material]
      );
      const fetchPage = async (offset) => {
        const url = new URL(`/api/procurement/project/${project.id}`, base);
        url.searchParams.set('limit', '1');
        url.searchParams.set('offset', String(offset));
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        return { response, body: await response.json() };
      };
      const first = await fetchPage(0);
      const second = await fetchPage(1);
      expect(first.response.status).toBe(200);
      expect(second.response.status).toBe(200);
      expect(first.response.headers.get('x-total-count')).toBe('3');
      expect(second.response.headers.get('x-total-count')).toBe('3');
      expect(first.body.data.purchase_orders).toHaveLength(1);
      expect(second.body.data.purchase_orders).toHaveLength(1);
      expect(first.body.data.purchase_orders[0].id).not.toBe(second.body.data.purchase_orders[0].id);
    } finally {
      await db.query('DELETE FROM purchase_orders WHERE order_number LIKE $1', [`R2P-PO-${tag}-%`]);
      await db.query('DELETE FROM item_master WHERE id = $1', [material]);
    }
  });

  test('procurement supplier invoice register advances to page 2 with correct total and no overlap', async () => {
    const supplier = (await db.query(
      'INSERT INTO suppliers (name_ar, name_en, code) VALUES ($1, $1, $2) RETURNING id',
      [`r02-proc-invoice-${tag}`, `R2P-PROC-SUP-${tag}`]
    )).rows[0].id;
    const material = (await db.query(
      "INSERT INTO item_master (code, category, name_en, name_ar, unit) VALUES ($1, 'pagination-test', $2, $2, 'ea') RETURNING id",
      [`R2P-PROC-ITEM-${tag}`, `procurement invoice ${tag}`]
    )).rows[0].id;
    const orderNumbers = [0, 1, 2].map((n) => `R2P-PI-${tag}-${n}`);
    try {
      for (let n = 0; n < 3; n += 1) {
        const order = (await db.query(
          "INSERT INTO purchase_orders (order_number, project_id, material_id, quantity, status) VALUES ($1, $2, $3, 1, 'issued') RETURNING id",
          [orderNumbers[n], project.id, material]
        )).rows[0].id;
        await db.query(
          'INSERT INTO supplier_invoices (invoice_number, supplier_id, purchase_order_id, total_amount, created_by) VALUES ($1, $2, $3, 1, $4)',
          [`R2P-PI-${tag}-${n}`, supplier, order, owner.id]
        );
      }
      await expectPagePair('/api/procurement/invoices', { project_id: project.id });
    } finally {
      await db.query('DELETE FROM supplier_invoices WHERE supplier_id = $1', [supplier]);
      await db.query('DELETE FROM purchase_orders WHERE order_number = ANY($1)', [orderNumbers]);
      await db.query('DELETE FROM suppliers WHERE id = $1', [supplier]);
      await db.query('DELETE FROM item_master WHERE id = $1', [material]);
    }
  });

  test('asset register advances to page 2 with a correct total and no overlap', async () => {
    for (let n = 0; n < 3; n += 1) await db.query(
      "INSERT INTO assets (code, name, name_en, name_ar, category, equipment_type) VALUES ($1, $2, $2, $2, 'other', 'owned')",
      [`R2P-ASSET-${tag}-${n}`, `r02-page-${tag}-${n}`]
    );
    try {
      const fetchPage = async (offset) => {
        const url = new URL('/api/assets', base);
        url.searchParams.set('search', `r02-page-${tag}`);
        url.searchParams.set('limit', '1');
        url.searchParams.set('offset', String(offset));
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        return { response, body: await response.json() };
      };
      const first = await fetchPage(0);
      const second = await fetchPage(1);
      expect(first.response.status).toBe(200);
      expect(second.response.status).toBe(200);
      expect(first.response.headers.get('x-total-count')).toBe('3');
      expect(second.response.headers.get('x-total-count')).toBe('3');
      expect(first.body.data).toHaveLength(1);
      expect(second.body.data).toHaveLength(1);
      expect(first.body.data[0].id).not.toBe(second.body.data[0].id);
    } finally {
      await db.query('DELETE FROM assets WHERE code LIKE $1', [`R2P-ASSET-${tag}-%`]);
    }
  });

  test('expense register advances to page 2 with a correct total and no overlap', async () => {
    const notes = `R2P-EXP-${tag}`;
    for (let n = 0; n < 3; n += 1) await db.query(
      `INSERT INTO expenses (category, amount, date, project_id, created_by, notes)
       VALUES ('other', 1, CURRENT_DATE, $1, $2, $3)`, [project.id, owner.id, `${notes}-${n}`]
    );
    try { await expectPagePair('/api/expenses', { project_id: project.id }); }
    finally { await db.query('DELETE FROM expenses WHERE notes LIKE $1', [`${notes}-%`]); }
  });

  test('item register advances to page 2 with a correct total and no overlap', async () => {
    const codePrefix = `R2P-ITEM-${tag}`;
    for (let n = 0; n < 3; n += 1) await db.query(
      "INSERT INTO item_master (code, category, name_en, name_ar, unit) VALUES ($1, 'pagination-test', $2, $2, 'ea')",
      [`${codePrefix}-${n}`, `r02-page-${tag}-${n}`]
    );
    try { await expectPagePair('/api/items', { search: `r02-page-${tag}` }); }
    finally { await db.query('DELETE FROM item_master WHERE code LIKE $1', [`${codePrefix}-%`]); }
  });

  test('legal document register advances to page 2 with a correct total and no overlap', async () => {
    const titlePrefix = `R2P-LEGAL-${tag}`;
    for (let n = 0; n < 3; n += 1) await db.query(
      "INSERT INTO legal_documents (title, document_type, status) VALUES ($1, 'pagination-test', $2)",
      [`${titlePrefix}-${n}`, `pagination-${tag}`]
    );
    try { await expectPagePair('/api/legal', { document_type: 'pagination-test' }); }
    finally { await db.query('DELETE FROM legal_documents WHERE title LIKE $1', [`${titlePrefix}-%`]); }
  });

  test('maintenance reminder register advances to page 2 with a correct total and no overlap', async () => {
    const status = `pagination-${tag}`;
    for (let n = 0; n < 3; n += 1) await db.query(
      'INSERT INTO maintenance_reminders (title, scheduled_date, status) VALUES ($1, CURRENT_DATE, $2)',
      [`R2P-MAINT-${tag}-${n}`, status]
    );
    try { await expectPagePair('/api/maintenance', { status }); }
    finally { await db.query('DELETE FROM maintenance_reminders WHERE status = $1', [status]); }
  });

  test('payroll period register advances to page 2 with a correct total and no overlap', async () => {
    const status = `pagination-${tag}`;
    for (let n = 1; n <= 3; n += 1) await db.query(
      'INSERT INTO payroll_periods (period_name, month, year, status, created_by) VALUES ($1, $2, 2099, $3, $4)',
      [`R2P-PAYROLL-${tag}-${n}`, n, status, owner.id]
    );
    try { await expectPagePair('/api/payroll', { year: 2099, status }); }
    finally { await db.query('DELETE FROM payroll_periods WHERE status = $1 AND created_by = $2', [status, owner.id]); }
  });

  test('invoice and payment registers each advance to page 2 with correct totals and no overlap', async () => {
    const client = (await db.query(
      'INSERT INTO clients (code, name_ar, name_en, client_type) VALUES ($1, $2, $2, $3) RETURNING id',
      [`R2P-FIN-${tag}`, `r02-fin-${tag}`, `pagination-${tag}`]
    )).rows[0].id;
    const compactTag = tag.replace(/\D/g, '').slice(-8);
    const invoiceNumbers = [0, 1, 2].map((n) => `I${compactTag}${n}`);
    const paymentNotes = [0, 1, 2].map((n) => `R2P-P-${tag}-${n}`);
    try {
      for (const invoiceNumber of invoiceNumbers) await db.query(
        `INSERT INTO invoices (invoice_number, project_id, client_id, amount, issue_date, status, description)
         VALUES ($1, $2, $3, 1, CURRENT_DATE, 'draft', 'pagination test')`, [invoiceNumber, project.id, client]
      );
      for (const notes of paymentNotes) await db.query(
        `INSERT INTO payments (project_id, client_id, amount, payment_date, notes)
         VALUES ($1, $2, 1, CURRENT_DATE, $3)`, [project.id, client, notes]
      );
      await expectPagePair('/api/invoices', { project_id: project.id, client_id: client });
      await expectPagePair('/api/payments', { project_id: project.id, client_id: client });
    } finally {
      await db.query('DELETE FROM payments WHERE client_id = $1', [client]);
      await db.query('DELETE FROM invoices WHERE invoice_number = ANY($1)', [invoiceNumbers]);
      await db.query('DELETE FROM clients WHERE id = $1', [client]);
    }
  });

  test('document-control register advances to page 2 with a correct total and no overlap', async () => {
    const titlePrefix = `R2P-DOC-${tag}`;
    for (let n = 0; n < 3; n += 1) await db.query(
      `INSERT INTO project_documents (project_id, title, document_type, uploaded_by)
       VALUES ($1, $2, 'pagination-test', $3)`, [project.id, `${titlePrefix}-${n}`, owner.id]
    );
    try { await expectPagePair('/api/docs/documents', { project_id: project.id }); }
    finally { await db.query('DELETE FROM project_documents WHERE title LIKE $1', [`${titlePrefix}-%`]); }
  });

  test('agent session register advances to page 2 with a correct total and no overlap', async () => {
    const clientName = `r02-pagination-${tag}`;
    for (let n = 0; n < 3; n += 1) await db.query(
      `INSERT INTO agent_sessions (id, user_id, client_name, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 day')`, [crypto.randomUUID(), owner.id, `${clientName}-${n}`]
    );
    try { await expectPagePair('/api/agent/sessions'); }
    finally { await db.query('DELETE FROM agent_sessions WHERE client_name LIKE $1', [`${clientName}-%`]); }
  });

  test('subcontractor register advances to page 2 with a correct total and no overlap', async () => {
    const codePrefix = `R2P-SUB-${tag}`;
    for (let n = 0; n < 3; n += 1) await db.query(
      'INSERT INTO subcontractors (code, name, name_en, name_ar) VALUES ($1, $2, $2, $2)',
      [`${codePrefix}-${n}`, `r02-page-${tag}-${n}`]
    );
    try { await expectPagePair('/api/subcontractors', { search: `r02-page-${tag}` }); }
    finally { await db.query('DELETE FROM subcontractors WHERE code LIKE $1', [`${codePrefix}-%`]); }
  });

  test('commercial variations advance to page 2 with a correct total and no overlap', async () => {
    const numberPrefix = `R2P-VAR-${tag}`;
    for (let n = 0; n < 3; n += 1) await db.query(
      `INSERT INTO variations (variation_number, project_id, title, created_by)
       VALUES ($1, $2, $3, $4)`, [`${numberPrefix}-${n}`, project.id, `pagination ${tag} ${n}`, owner.id]
    );
    try { await expectPagePair(`/api/commercial/variations/${project.id}`); }
    finally { await db.query('DELETE FROM variations WHERE variation_number LIKE $1', [`${numberPrefix}-%`]); }
  });

  test('commercial legacy snapshots advance to page 2 with correct total and no overlap', async () => {
    const snapshots = ['cost_code_summary', 'commitment_summary', 'cashflow_summary'];
    try {
      for (const snapshotType of snapshots) await db.query(
        'INSERT INTO commercial_snapshots (project_id, snapshot_type, figures) VALUES ($1, $2, $3::jsonb)',
        [project.id, snapshotType, JSON.stringify({ tag, snapshotType })]
      );
      await expectPagePair(`/api/commercial/project/${project.id}/legacy-snapshots`);
    } finally {
      await db.query('DELETE FROM commercial_snapshots WHERE project_id = $1 AND snapshot_type = ANY($2)', [project.id, snapshots]);
    }
  });

  test('pending approval queue advances to page 2 with exact total and no overlap', async () => {
    const expenseIds = [];
    try {
      for (let n = 0; n < 3; n += 1) {
        const expense = (await db.query(
          "INSERT INTO expenses (category, amount, date, project_id, created_by, description, status) VALUES ('other', 1, CURRENT_DATE, $1, $2, $3, 'pending') RETURNING id",
          [project.id, owner.id, `approval pagination ${tag} ${n}`]
        )).rows[0].id;
        expenseIds.push(expense);
        await db.query(
          "INSERT INTO approval_requests (module_name, request_type, request_id, requester_id, status, stage) VALUES ('expenses', $1, $2, $3, 'pending', 'manager_review')",
          [`pagination-${tag}-${n}`, expense, owner.id]
        );
      }
      const fetchPage = async (offset) => {
        const url = new URL('/api/approvals/pending', base);
        url.searchParams.set('limit', '1');
        url.searchParams.set('offset', String(offset));
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        return { response, body: await response.json() };
      };
      const first = await fetchPage(0);
      const second = await fetchPage(1);
      expect(first.response.status).toBe(200);
      expect(second.response.status).toBe(200);
      expect(first.response.headers.get('x-total-count')).toBe('3');
      expect(second.response.headers.get('x-total-count')).toBe('3');
      expect(first.body.requests).toHaveLength(1);
      expect(second.body.requests).toHaveLength(1);
      expect(first.body.requests[0].id).not.toBe(second.body.requests[0].id);
    } finally {
      await db.query('DELETE FROM approval_requests WHERE request_type LIKE $1', [`pagination-${tag}-%`]);
      await db.query('DELETE FROM expenses WHERE id = ANY($1)', [expenseIds]);
    }
  });

  test('vendor RFQ quotation collection advances to page 2 with correct total and no overlap', async () => {
    const supplier = (await db.query(
      'INSERT INTO suppliers (name_ar, name_en, code) VALUES ($1, $1, $2) RETURNING id',
      [`r02-rfq-supplier-${tag}`, `R2P-RFQ-SUP-${tag}`]
    )).rows[0].id;
    const rfq = (await db.query(
      'INSERT INTO rfqs (rfq_number, project_id, title, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
      [`R2P-RFQ-${tag}`, project.id, `Pagination RFQ ${tag}`, owner.id]
    )).rows[0].id;
    try {
      for (let n = 0; n < 3; n += 1) await db.query(
        'INSERT INTO supplier_quotations (quotation_number, rfq_id, supplier_id, total_price, created_by) VALUES ($1, $2, $3, 1, $4)',
        [`R2P-RFQ-Q-${tag}-${n}`, rfq, supplier, owner.id]
      );
      await expectNestedPagePair(`/api/procurement/rfq/${rfq}/quotations/vendor/${supplier}`, 'quotations');
    } finally {
      await db.query('DELETE FROM supplier_quotations WHERE rfq_id = $1', [rfq]);
      await db.query('DELETE FROM rfqs WHERE id = $1', [rfq]);
      await db.query('DELETE FROM suppliers WHERE id = $1', [supplier]);
    }
  });

  test('agent activity and action requests advance to page 2 with correct totals', async () => {
    try {
      for (let n = 0; n < 3; n += 1) {
        await db.query(
          "INSERT INTO agent_tool_calls (tool, risk, user_id, user_role, response_summary) VALUES ($1, 'read', $2, 'owner', $3)",
          [`pagination-${tag}`, owner.id, `activity ${n}`]
        );
        await db.query(
          "INSERT INTO agent_action_requests (tool, operation, payload, requesting_user_id, required_approver_role, execution_status, reason) VALUES ($1, '{}'::jsonb, '{}'::jsonb, $2, 'owner', 'draft', $3)",
          [`pagination-${tag}`, owner.id, `request ${n}`]
        );
      }
      await expectPagePair('/api/agent/activity');
      await expectPagePair('/api/agent/requests', { status: 'draft' });
    } finally {
      await db.query('DELETE FROM agent_action_requests WHERE requesting_user_id = $1 AND tool = $2', [owner.id, `pagination-${tag}`]);
      await db.query('DELETE FROM agent_tool_calls WHERE user_id = $1 AND tool = $2', [owner.id, `pagination-${tag}`]);
    }
  });

  test('inventory expiring lots and warehouse movement lists advance to page 2', async () => {
    // The stock movement ledger rejects UPDATE/DELETE by design. These fixture
    // rows live only in the disposable gate database; its warehouse is not
    // project-owned so normal project cleanup remains independent.
    const warehouse = (await db.query(
      "INSERT INTO warehouses (name, type) VALUES ($1, 'site') RETURNING id",
      [`R2P-IMMUTABLE-WH-${tag}`]
    )).rows[0].id;
    const material = (await db.query(
      "INSERT INTO item_master (code, category, name_en, name_ar, unit) VALUES ($1, 'pagination-test', $2, $2, 'ea') RETURNING id",
      [`R2P-IMMUTABLE-ITEM-${tag}`, `immutable inventory ${tag}`]
    )).rows[0].id;
    const lotIds = [];
    for (let n = 0; n < 3; n += 1) {
      const lot = (await db.query(
        'INSERT INTO stock_lots (warehouse_id, material_id, lot_number, expiry_date, created_by) VALUES ($1, $2, $3, CURRENT_DATE + 10, $4) RETURNING id',
        [warehouse, material, `R2P-EXP-${tag}-${n}`, owner.id]
      )).rows[0].id;
      lotIds.push(lot);
      await db.query(
        "INSERT INTO stock_movements (warehouse_id, material_id, movement_type, quantity, lot_id, created_by) VALUES ($1, $2, 'opening', 1, $3, $4)",
        [warehouse, material, lot, owner.id]
      );
    }
    await expectPagePair('/api/inventory/lots/expiring', { warehouse_id: warehouse, within_days: 30 }, 'lot_id');
    await expectPagePair(`/api/warehouses/${warehouse}/movements`, { material_id: material });
  });

  test('site report register advances to page 2 with a correct total and no overlap', async () => {
    const reportDates = ['2099-01-01', '2099-01-02', '2099-01-03'];
    for (const reportDate of reportDates) await db.query(
      `INSERT INTO site_daily_reports (project_id, report_date, work_summary, created_by)
       VALUES ($1, $2, $3, $4)`, [project.id, reportDate, `R2P-SITE-${tag}`, owner.id]
    );
    try { await expectPagePair(`/api/projects/${project.id}/site-reports`); }
    finally { await db.query('DELETE FROM site_daily_reports WHERE project_id = $1 AND work_summary = $2', [project.id, `R2P-SITE-${tag}`]); }
  });

  test('warehouse transfer register advances to page 2 with a correct total and no overlap', async () => {
    const status = `pagination-${tag}`;
    const warehouseIds = [];
    for (let n = 0; n < 2; n += 1) warehouseIds.push((await db.query(
      "INSERT INTO warehouses (name, type, project_id) VALUES ($1, 'site', $2) RETURNING id",
      [`R2P-WH-${tag}-${n}`, project.id]
    )).rows[0].id);
    try {
      for (let n = 0; n < 3; n += 1) await db.query(
        `INSERT INTO inventory_transfers (from_warehouse_id, to_warehouse_id, status, requested_by)
         VALUES ($1, $2, $3, $4)`, [warehouseIds[0], warehouseIds[1], status, owner.id]
      );
      await expectPagePair('/api/warehouses/transfers', { status });
    } finally {
      await db.query('DELETE FROM inventory_transfers WHERE status = $1 AND requested_by = $2', [status, owner.id]);
      await db.query('DELETE FROM warehouses WHERE id = ANY($1)', [warehouseIds]);
    }
  });

  test('consultant RFI responses and submittal revisions advance with stable page totals', async () => {
    const rfiNumber = `R2P-RFI-${tag}`;
    const submittalNumber = `R2P-SUBM-${tag}`;
    const rfi = (await db.query(
      'INSERT INTO project_rfis (rfi_number, project_id, subject) VALUES ($1, $2, $3) RETURNING id',
      [rfiNumber, project.id, `Pagination ${tag}`]
    )).rows[0].id;
    const submittal = (await db.query(
      'INSERT INTO project_submittals (submittal_number, project_id, title) VALUES ($1, $2, $3) RETURNING id',
      [submittalNumber, project.id, `Pagination ${tag}`]
    )).rows[0].id;
    try {
      for (let n = 1; n <= 3; n += 1) {
        await db.query('INSERT INTO rfi_responses (rfi_id, revision, stage, body) VALUES ($1, $2, $3, $4)', [rfi, n, 'coordinator', `response ${n}`]);
        await db.query('INSERT INTO submittal_revisions (submittal_id, revision_number, stage, comments) VALUES ($1, $2, $3, $4)', [submittal, n, 'reviewer', `revision ${n}`]);
      }
      await expectNestedPagePair(`/api/consultant/rfis/${rfi}/responses`, 'history');
      await expectNestedPagePair(`/api/consultant/submittals/${submittal}/revisions`, 'history');
    } finally {
      await db.query('DELETE FROM project_rfis WHERE id = $1', [rfi]);
      await db.query('DELETE FROM project_submittals WHERE id = $1', [submittal]);
    }
  });

  test('document revision history advances to page 2 with the correct total and no overlap', async () => {
    const title = `R2P-DOCREV-${tag}`;
    const document = (await db.query(
      'INSERT INTO project_documents (project_id, title, document_type, uploaded_by) VALUES ($1, $2, $3, $4) RETURNING id',
      [project.id, title, 'pagination-test', owner.id]
    )).rows[0].id;
    try {
      for (let n = 1; n <= 3; n += 1) await db.query(
        'INSERT INTO document_versions (document_id, version_no, file_url, uploaded_by, is_current) VALUES ($1, $2, $3, $4, $5)',
        [document, n, `/r02-${tag}-${n}.pdf`, owner.id, n === 3]
      );
      await expectNestedPagePair(`/api/docs/documents/${document}/revisions`, 'revisions');
    } finally {
      await db.query('DELETE FROM project_documents WHERE id = $1', [document]);
    }
  });

  test('inventory lot list advances to page 2 with correct total and no overlap', async () => {
    const warehouseIds = [];
    for (let n = 0; n < 1; n += 1) warehouseIds.push((await db.query(
      "INSERT INTO warehouses (name, type, project_id) VALUES ($1, 'site', $2) RETURNING id",
      [`R2P-LOT-WH-${tag}-${n}`, project.id]
    )).rows[0].id);
    const itemIds = [];
    for (let n = 0; n < 3; n += 1) itemIds.push((await db.query(
      "INSERT INTO item_master (code, category, name_en, name_ar, unit) VALUES ($1, 'pagination-test', $2, $2, 'ea') RETURNING id",
      [`R2P-LOT-ITEM-${tag}-${n}`, `lot item ${tag} ${n}`]
    )).rows[0].id);
    try {
      for (let n = 0; n < 3; n += 1) await db.query(
        'INSERT INTO stock_lots (warehouse_id, material_id, lot_number, expiry_date, created_by) VALUES ($1, $2, $3, CURRENT_DATE + 10, $4) RETURNING id',
        [warehouseIds[n % warehouseIds.length], itemIds[n], `R2P-LOT-${tag}-${n}`, owner.id]
      );
      await expectPagePair('/api/inventory/lots', { warehouse_id: warehouseIds[0], include_empty: true }, 'lot_id');
    } finally {
      await db.query('DELETE FROM stock_lots WHERE lot_number LIKE $1', [`R2P-LOT-${tag}-%`]);
      await db.query('DELETE FROM item_master WHERE id = ANY($1)', [itemIds]);
      await db.query('DELETE FROM warehouses WHERE id = ANY($1)', [warehouseIds]);
    }
  });

  test('asset assignment and usage-log child lists advance without overlap', async () => {
    const asset = (await db.query(
      "INSERT INTO assets (code, name, name_en, name_ar, category, equipment_type) VALUES ($1, $2, $2, $2, 'other', 'owned') RETURNING id",
      [`R2P-ASSET-CHILD-${tag}`, `r02-asset-child-${tag}`]
    )).rows[0].id;
    try {
      for (let n = 0; n < 3; n += 1) {
        await db.query('INSERT INTO equipment_assignments (equipment_id, project_id, assigned_from) VALUES ($1, $2, CURRENT_DATE + $3::int)', [asset, project.id, n]);
        await db.query('INSERT INTO equipment_usage_logs (equipment_id, project_id, log_date, notes) VALUES ($1, $2, CURRENT_DATE + $3::int, $4)', [asset, project.id, n, `usage ${n}`]);
      }
      await expectPagePair(`/api/assets/${asset}/assignments`);
      await expectPagePair(`/api/assets/${asset}/usage-logs`);
    } finally {
      await db.query('DELETE FROM equipment_assignments WHERE equipment_id = $1', [asset]);
      await db.query('DELETE FROM equipment_usage_logs WHERE equipment_id = $1', [asset]);
      await db.query('DELETE FROM assets WHERE id = $1', [asset]);
    }
  });

  test('HR laborers, attendance, leaves, and labor-payments advance to page 2', async () => {
    const employee = (await db.query(
      'INSERT INTO employees (code, name, name_en, name_ar) VALUES ($1, $2, $2, $2) RETURNING id',
      [`R2P-HR-CHILD-${tag}`, `r02-hr-child-${tag}`]
    )).rows[0].id;
    const laborerIds = [];
    try {
      for (let n = 0; n < 3; n += 1) {
        const laborer = (await db.query(
          'INSERT INTO daily_laborers (code, full_name) VALUES ($1, $2) RETURNING id',
          [`R2P-LAB-${tag}-${n}`, `r02-laborer-${tag}-${n}`]
        )).rows[0].id;
        laborerIds.push(laborer);
        await db.query('INSERT INTO attendance (employee_id, date, status) VALUES ($1, CURRENT_DATE + $2::int, $3)', [employee, n, `pagination-${tag}`]);
        await db.query('INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, reason) VALUES ($1, $2, CURRENT_DATE + $3::int, CURRENT_DATE + $3::int, $4)', [employee, `pagination-${tag}`, n, `leave-${n}`]);
        await db.query('INSERT INTO labor_payments (project_id, laborer_id, payment_date, total_amount) VALUES ($1, $2, CURRENT_DATE + $3::int, 1)', [project.id, laborer, n]);
      }
      await expectPagePair('/api/hr/laborers', { search: `r02-laborer-${tag}` });
      await expectPagePair('/api/hr/attendance', { employee_id: employee });
      await expectPagePair('/api/hr/leaves', { employee_id: employee });
      await expectPagePair('/api/hr/labor-payments', { project_id: project.id });
    } finally {
      await db.query('DELETE FROM labor_payments WHERE laborer_id = ANY($1)', [laborerIds]);
      await db.query('DELETE FROM leave_requests WHERE employee_id = $1', [employee]);
      await db.query('DELETE FROM attendance WHERE employee_id = $1', [employee]);
      await db.query('DELETE FROM daily_laborers WHERE id = ANY($1)', [laborerIds]);
      await db.query('DELETE FROM employees WHERE id = $1', [employee]);
    }
  });

  test('BOQ allocation list advances to page 2 with correct total and no overlap', async () => {
    const item = (await db.query(
      'INSERT INTO boq_items (project_id, code, description, quantity) VALUES ($1, $2, $3, 10) RETURNING id',
      [project.id, `R2P-BOQ-${tag}`, `pagination allocations ${tag}`]
    )).rows[0].id;
    const locations = [];
    try {
      for (let n = 0; n < 3; n += 1) {
        const location = (await db.query(
          'INSERT INTO project_locations (project_id, code, name) VALUES ($1, $2, $3) RETURNING id',
          [project.id, `R2P-LOC-${tag}-${n}`, `allocation ${tag} ${n}`]
        )).rows[0].id;
        locations.push(location);
        await db.query('INSERT INTO boq_location_allocations (boq_item_id, project_location_id, planned_quantity) VALUES ($1, $2, 1)', [item, location]);
      }
      await expectPagePair(`/api/quantities/allocations/${item}`);
    } finally {
      await db.query('DELETE FROM boq_location_allocations WHERE boq_item_id = $1', [item]);
      await db.query('DELETE FROM project_locations WHERE id = ANY($1)', [locations]);
      await db.query('DELETE FROM boq_items WHERE id = $1', [item]);
    }
  });

  test('item suppliers and supplier materials child lists advance to page 2', async () => {
    const supplierIds = [];
    const materialIds = [];
    for (let n = 0; n < 3; n += 1) {
      supplierIds.push((await db.query(
        'INSERT INTO suppliers (name_ar, name_en, code) VALUES ($1, $1, $2) RETURNING id',
        [`r02-link-supplier-${tag}-${n}`, `R2P-LINK-SUP-${tag}-${n}`]
      )).rows[0].id);
      materialIds.push((await db.query(
        "INSERT INTO item_master (code, category, name_en, name_ar, unit) VALUES ($1, 'pagination-test', $2, $2, 'ea') RETURNING id",
        [`R2P-LINK-ITEM-${tag}-${n}`, `link material ${tag} ${n}`]
      )).rows[0].id);
    }
    try {
      for (let n = 0; n < 3; n += 1) {
        await db.query('INSERT INTO supplier_materials (supplier_id, material_id, unit_price) VALUES ($1, $2, 1)', [supplierIds[0], materialIds[n]]);
        if (n > 0) await db.query('INSERT INTO supplier_materials (supplier_id, material_id, unit_price) VALUES ($1, $2, 1)', [supplierIds[n], materialIds[0]]);
      }
      await expectPagePair(`/api/items/${materialIds[0]}/suppliers`);
      await expectPagePair(`/api/suppliers/${supplierIds[0]}/materials`);
    } finally {
      await db.query('DELETE FROM supplier_materials WHERE supplier_id = ANY($1) OR material_id = ANY($2)', [supplierIds, materialIds]);
      await db.query('DELETE FROM suppliers WHERE id = ANY($1)', [supplierIds]);
      await db.query('DELETE FROM item_master WHERE id = ANY($1)', [materialIds]);
    }
  });

  test('quantity measurement register advances to page 2 with correct total and no overlap', async () => {
    const item = (await db.query(
      'INSERT INTO boq_items (project_id, code, description, quantity) VALUES ($1, $2, $3, 10) RETURNING id',
      [project.id, `R2P-MEAS-${tag}`, `pagination measurement ${tag}`]
    )).rows[0].id;
    const location = (await db.query(
      'INSERT INTO project_locations (project_id, code, name) VALUES ($1, $2, $3) RETURNING id',
      [project.id, `R2P-MEAS-LOC-${tag}`, `measurement ${tag}`]
    )).rows[0].id;
    try {
      for (let n = 0; n < 3; n += 1) await db.query(
        'INSERT INTO quantity_measurements (project_id, project_location_id, boq_item_id, measured_date, quantity, measured_by) VALUES ($1, $2, $3, CURRENT_DATE + $4::int, 1, $5)',
        [project.id, location, item, n, owner.id]
      );
      await expectPagePair('/api/quantities/measurements', { project_id: project.id, boq_item_id: item });
    } finally {
      await db.query('DELETE FROM quantity_measurements WHERE boq_item_id = $1', [item]);
      await db.query('DELETE FROM project_locations WHERE id = $1', [location]);
      await db.query('DELETE FROM boq_items WHERE id = $1', [item]);
    }
  });

  test('warehouse reservation list advances to page 2 with correct total and no overlap', async () => {
    const material = (await db.query(
      "INSERT INTO item_master (code, category, name_en, name_ar, unit) VALUES ($1, 'pagination-test', $2, $2, 'ea') RETURNING id",
      [`R2P-RES-${tag}`, `reservation ${tag}`]
    )).rows[0].id;
    try {
      for (let n = 0; n < 3; n += 1) await db.query(
        "INSERT INTO stock_reservations (material_id, project_id, quantity, status) VALUES ($1, $2, 1, $3)",
        [material, project.id, `pagination-${tag}`]
      );
      await expectPagePair('/api/warehouses/reservations', { project_id: project.id, status: `pagination-${tag}` });
    } finally {
      await db.query('DELETE FROM stock_reservations WHERE material_id = $1 AND project_id = $2', [material, project.id]);
      await db.query('DELETE FROM item_master WHERE id = $1', [material]);
    }
  });

  test('every mounted GET route returns no 500 for an owner with typical params', async () => {
    // Use the server mount declarations to retain literal prefixes, then inspect
    // the actual router stacks so new GET registrations are included automatically.
    const source = fs.readFileSync(path.resolve(__dirname, '../../../server.js'), 'utf8');
    const mounts = [...source.matchAll(/app\.use\('([^']+)', require\('([^']+)'\)(\.buildV1Router\(\))?\);/g)];
    const routes = [];
    const walk = (stack, prefix) => {
      for (const layer of stack) {
        if (layer.route && layer.route.methods.get) {
          for (const route of [layer.route.path].flat()) routes.push(prefix + (route === '/' ? '' : route));
        } else if (layer.handle && layer.handle.stack) {
          if (layer.regexp.fast_slash) { walk(layer.handle.stack, prefix); continue; }
          const mount = layer.regexp.source.match(/^\^\\\/(.*?)\\\/\?\(\?=/);
          if (!mount) throw new Error(`Unsupported nested router mount: ${layer.regexp.source}`);
          walk(layer.handle.stack, prefix + '/' + mount[1].replace(/\\\//g, '/'));
        }
      }
    };
    for (const [, prefix, module, build] of mounts) {
      const exported = require(path.resolve(__dirname, '../../..', module));
      walk((build ? exported.buildV1Router() : exported).stack, prefix);
    }
    routes.push('/api/health');
    expect(routes.length).toBeGreaterThan(300);
    const failures = [];
    for (const route of new Set(routes)) {
      const concrete = route.replace(/:project_?id\b/gi, String(project.id))
        .replace(/:date\b/g, '2026-10-14').replace(/:\w+(?:\([^)]*\))?\??/g, '99999999');
      const status = await call(concrete);
      if (status >= 500) failures.push(`${route}: ${status}`);
    }
    if (failures.length) console.log(`R0.2 failing routes: ${failures.join(', ')}`);
    console.log(`R0.2 GET inventory: ${new Set(routes).size} routes, ${failures.length} server failures`);
    expect(failures).toEqual([]);
  }, 180000);
});
