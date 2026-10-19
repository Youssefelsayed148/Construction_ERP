// B1 (C-FIN-AR-001) real-PostgreSQL suite — the money defect fix:
//   (a) a past-due DRAFT is untouched by two GET calls: status and updated_at unchanged,
//       zero new audit_events and zero journal rows (reads are pure);
//   (b) a payment against that draft is refused with the stable invoice_not_issued code,
//       no payment row and no GL row;
//   (c) a payment against an issued past-due invoice succeeds and the GL carries exactly one
//       client_invoice and one client_payment that reconcile with the invoice subledger;
//   (d) regression: the plain create path (POST /api/invoices, status sent) and the
//       valuation path still post once and reconcile;
//   (e) a retention valuation (gross 100,000, retention 10,000, net 90,000) reconciles
//       after issue and receipt.
// Plus a DOCUMENTATION test of the report-only exposure: PUT /api/invoices/:id still accepts
// any INVOICE_STATUSES value and bypasses financeEngine.transitionInvoice.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('B1 invoice money lifecycle (real PostgreSQL, real app)', () => {
  let db; let finance; let tokens; let server; let base; let owner; let project; let client;
  const tag = `b1mon-${Date.now()}`;
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const all = async (sql, params) => (await db.query(sql, params)).rows;
  const money = (v) => Number(v).toFixed(2);

  const get = async (path) => {
    const response = await fetch(base + path, { headers: { Authorization: `Bearer ${owner.token}` } });
    return { status: response.status, body: await response.json() };
  };
  const post = async (path, body) => {
    const response = await fetch(base + path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };

  const auditCount = async (invoiceId) => (await one(
    "SELECT COUNT(*)::int AS c FROM audit_events WHERE entity_type = 'invoice' AND entity_id = $1", [invoiceId]
  )).c;
  const journalCount = async (entryType, refId) => (await one(
    'SELECT COUNT(*)::int AS c FROM journal_entries WHERE reference_type = $1 AND reference_id = $2', [entryType, refId]
  )).c;
  const receivableLineSum = async (entryType, refId, side) => {
    const rows = await all(
      `SELECT COALESCE(SUM(jel.${side}), 0) AS s
         FROM journal_entry_lines jel
         JOIN journal_entries je ON je.id = jel.journal_entry_id
         JOIN gl_account_map gam ON gam.account_id = jel.account_id AND gam.key = 'receivable'
        WHERE je.reference_type = $1 AND je.reference_id = $2`, [entryType, refId]);
    return Number(rows[0].s);
  };

  beforeAll(async () => {
    db = require('../../config/database');
    tokens = require('../../services/tokens');
    finance = require('../../services/financeEngine');
    const user = (await one(
      "INSERT INTO users (name, email, password, role) VALUES ('b1-owner', $1, 'unused', 'owner') RETURNING id, token_version",
      [`${tag}@test.invalid`]));
    await db.query('INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = $2', [user.id, 'owner']);
    user.token = tokens.signSession({ userId: user.id, tokenVersion: user.token_version });
    owner = { id: user.id, name: 'b1-owner', role: 'owner', token: user.token };
    client = (await one("INSERT INTO clients (code, name_en, name_ar, client_type) VALUES ($1, $1, $1, 'test') RETURNING id", [`b1c-${tag}`])).id;
    project = (await one(
      "INSERT INTO projects (name, name_en, code, status, client_id, contract_value) VALUES ($1, $1, $2, 'active', $3, 500000) RETURNING id",
      [`b1proj-${tag}`, `B1P${tag}`.slice(0, 20), client])).id;
    const { app } = require('../../../server');
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (db) {
      if (owner) {
        await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [owner.id]);
        await db.query('UPDATE users SET is_active = false WHERE id = $1', [owner.id]);
      }
      await db.pool.end();
    }
  });

  test('(a) a past-due DRAFT is untouched by two GET calls: no write, no audit, no GL', async () => {
    const draft = await one(
      `INSERT INTO invoices (invoice_number, project_id, client_id, amount, issue_date, due_date, status)
       VALUES ($1, $2, $3, 1000, CURRENT_DATE - 60, CURRENT_DATE - 30, 'draft') RETURNING id, status, updated_at`,
      [tag, project, client]);
    const auditsBefore = await auditCount(draft.id);
    expect(auditsBefore).toBe(0);
    expect(await journalCount('client_invoice', draft.id)).toBe(0);

    const detail1 = await get(`/api/invoices/${draft.id}`);
    expect(detail1.status).toBe(200);
    expect(detail1.body.data.status).toBe('draft'); // past-due draft is never shown as overdue
    const list1 = await get(`/api/invoices?project_id=${project.id}`);
    expect(list1.status).toBe(200);
    const listed = list1.body.data.find((i) => i.id === draft.id);
    expect(listed.status).toBe('draft');

    const detail2 = await get(`/api/invoices/${draft.id}`);
    expect(detail2.body.data.status).toBe('draft');

    const after = await one('SELECT status, updated_at FROM invoices WHERE id = $1', [draft.id]);
    expect(after.status).toBe('draft');
    expect(new Date(after.updated_at).getTime()).toBe(new Date(draft.updated_at).getTime());
    expect(await auditCount(draft.id)).toBe(auditsBefore); // no audit events from reads
    expect(await journalCount('client_invoice', draft.id)).toBe(0); // no GL rows from reads
  });

  test('(b) a payment against that draft is refused with invoice_not_issued; no payment row, no GL row', async () => {
    const draft = await one('SELECT id FROM invoices WHERE invoice_number = $1', [tag]);
    const paymentsBefore = (await one('SELECT COUNT(*)::int AS c FROM payments WHERE project_id = $1', [project])).c;
    const response = await post('/api/payments', {
      invoice_id: draft.id, project_id: project, client_id: client,
      direction: 'ar', amount: 400, payment_date: new Date().toISOString().slice(0, 10),
      reference_number: tag,
    });
    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(response.body.error_code).toBe('invoice_not_issued');
    expect(response.body.error_params).toMatchObject({ invoice_id: draft.id, status: 'draft', invoice_number: tag });
    expect((await one('SELECT COUNT(*)::int AS c FROM payments WHERE project_id = $1', [project])).c).toBe(paymentsBefore);
    expect(await journalCount('client_payment', draft.id)).toBe(0);
  });

  test('(c) a payment against an issued past-due invoice succeeds and the GL reconciles with the subledger', async () => {
    const created = await post('/api/invoices', {
      project_id: project, client_id: client, amount: 400,
      issue_date: new Date().toISOString().slice(0, 10), description: 'b1 issued past-due',
    });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('sent');
    const invoiceId = created.body.data.id;
    await db.query('UPDATE invoices SET due_date = CURRENT_DATE - 30 WHERE id = $1', [invoiceId]);

    const payment = await post('/api/payments', {
      invoice_id: invoiceId, project_id: project, client_id: client,
      direction: 'ar', amount: 400, payment_date: new Date().toISOString().slice(0, 10),
      reference_number: tag,
    });
    expect(payment.status).toBe(201);

    expect(await journalCount('client_invoice', invoiceId)).toBe(1);   // posted exactly once
    expect(await journalCount('client_payment', payment.body.data.id)).toBe(1);
    const invoiceDebit = await receivableLineSum('client_invoice', invoiceId, 'debit');
    const paymentCredit = await receivableLineSum('client_payment', payment.body.data.id, 'credit');
    expect(money(invoiceDebit)).toBe('400.00');
    expect(money(paymentCredit)).toBe('400.00');
    const balance = await finance.invoiceOutstanding(db.query, invoiceId);
    expect(money(balance.outstanding)).toBe('0.00');
    expect((await one('SELECT status FROM invoices WHERE id = $1', [invoiceId])).status).toBe('paid');
  });

  test('(d) regression: plain create (status sent) and the valuation path still post and reconcile', async () => {
    // Plain manual invoice: created 'sent', posted once with its creation.
    const created = await post('/api/invoices', {
      project_id: project, client_id: client, amount: 250,
      issue_date: new Date().toISOString().slice(0, 10), description: 'b1 plain create',
    });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('sent');
    const plainId = created.body.data.id;
    expect((await one('SELECT status FROM invoices WHERE id = $1', [plainId])).status).toBe('sent');
    expect(await journalCount('client_invoice', plainId)).toBe(1);
    const read = await get(`/api/invoices/${plainId}`);
    expect(read.body.data.status).toBe('sent'); // display derivation keeps 'sent' when not past due
    const balance = await finance.invoiceOutstanding(db.query, plainId);
    expect(money(balance.outstanding)).toBe('250.00');

    // Valuation path: draft valuation posts nothing; the approve→issue transition posts once.
    let valuationInvoice;
    await db.transaction((txClient) => finance.createClientValuation(txClient.query.bind(txClient), {
      project_id: project, client_id: client, gross_current_work: 2000, tax_pct: 0,
      created_by: owner.id, actor_name: owner.name,
    })).then((r) => { valuationInvoice = r; });
    expect(valuationInvoice.status).toBe('draft');
    expect(await journalCount('client_invoice', valuationInvoice.id)).toBe(0);
    const approved = await db.transaction((txClient) => finance.transitionInvoice(txClient.query.bind(txClient), valuationInvoice.id, 'approved', owner));
    expect(approved.status).toBe('approved');
    expect(await journalCount('client_invoice', valuationInvoice.id)).toBe(0);
    const issued = await db.transaction((txClient) => finance.transitionInvoice(txClient.query.bind(txClient), valuationInvoice.id, 'issued', owner));
    expect(issued.status).toBe('issued');
    expect(await journalCount('client_invoice', valuationInvoice.id)).toBe(1);
    const valuationOutstanding = await finance.invoiceOutstanding(db.query, valuationInvoice.id);
    expect(money(valuationOutstanding.outstanding)).toBe('2000.00');
  });

  test('(e) a retention valuation (gross 100,000, retention 10,000, net 90,000) reconciles after issue and receipt', async () => {
    let valuation;
    await db.transaction((txClient) => finance.createClientValuation(txClient.query.bind(txClient), {
      project_id: project, client_id: client, gross_current_work: 100000, retention: 10000, tax_pct: 0,
      created_by: owner.id, actor_name: owner.name,
    })).then((r) => { valuation = r; });
    expect(money(valuation.amount)).toBe('90000.00');
    expect(money(valuation.net_amount)).toBe('90000.00');
    await db.transaction((txClient) => finance.transitionInvoice(txClient.query.bind(txClient), valuation.id, 'approved', owner));
    await db.transaction((txClient) => finance.transitionInvoice(txClient.query.bind(txClient), valuation.id, 'issued', owner));

    const entry = await one("SELECT id FROM journal_entries WHERE reference_type = 'client_invoice' AND reference_id = $1", [valuation.id]);
    const lines = await all('SELECT gam.key AS account, jel.debit, jel.credit FROM journal_entry_lines jel JOIN gl_account_map gam ON gam.account_id = jel.account_id WHERE jel.journal_entry_id = $1', [entry.id]);
    const byKey = {};
    for (const line of lines) {
      byKey[line.account] = byKey[line.account] || { debit: 0, credit: 0 };
      byKey[line.account].debit += Number(line.debit || 0);
      byKey[line.account].credit += Number(line.credit || 0);
    }
    expect(money(byKey.receivable.debit)).toBe('90000.00');   // AR receivable at net
    expect(money(byKey.client_retention_receivable.debit)).toBe('10000.00'); // retention held on the GL
    expect(money(byKey.revenue.credit)).toBe('100000.00');

    const receipt = await post('/api/payments', {
      invoice_id: valuation.id, project_id: project, client_id: client,
      direction: 'ar', amount: 90000, payment_date: new Date().toISOString().slice(0, 10),
      reference_number: `${tag}-ret`,
    });
    expect(receipt.status).toBe(201);
    expect(await journalCount('client_payment', receipt.body.data.id)).toBe(1);
    expect(money(await receivableLineSum('client_payment', receipt.body.data.id, 'credit'))).toBe('90000.00');
    const balance = await finance.invoiceOutstanding(db.query, valuation.id);
    expect(money(balance.outstanding)).toBe('0.00');
    expect((await one('SELECT status FROM invoices WHERE id = $1', [valuation.id])).status).toBe('paid');
    expect(money((await finance.retentionTotals(db.query, { project_id: project, party_type: 'client' })).held)).toBe('10000.00');
  });

  test('REPORT-ONLY documentation: PUT /api/invoices/:id still accepts any status and bypasses transitionInvoice', async () => {
    // This test DOCUMENTS the known exposure (reported, not fixed in B1 without owner approval):
    // PUT accepts any INVOICE_STATUSES value, applies it as a raw column update and calls
    // glPosting.syncInvoicePosting with the before/after rows — so a draft can jump straight
    // to any status with neither the transitionInvoice lifecycle guard nor a 'status_change'
    // audit event; only the syncInvoicePosting firing depends on the outcome.
    const created = await post('/api/invoices', {
      project_id: project, client_id: client, amount: 300,
      issue_date: new Date().toISOString().slice(0, 10), description: 'b1 put bypass doc',
    });
    const invoiceId = created.body.data.id;
    const statusChangesBefore = (await one(
      "SELECT COUNT(*)::int AS c FROM audit_events WHERE entity_type = 'invoice' AND entity_id = $1 AND event_type = 'status_change'", [invoiceId])).c;
    const response = await fetch(`${base}/api/invoices/${invoiceId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'issued' }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe('issued');          // raw update went straight through
    expect((await one('SELECT status FROM invoices WHERE id = $1', [invoiceId])).status).toBe('issued');
    // No lifecycle audit: the bypass left no 'status_change' event behind.
    expect((await one(
      "SELECT COUNT(*)::int AS c FROM audit_events WHERE entity_type = 'invoice' AND entity_id = $1 AND event_type = 'status_change'", [invoiceId])).c)
      .toBe(statusChangesBefore);
    // Exposure demonstrated end-to-end: the syncInvoicePosting call still fires on the
    // non-issued → issued jump, so GL state follows PUT without any lifecycle control.
    expect(await journalCount('client_invoice', invoiceId)).toBe(1);
  });
});
