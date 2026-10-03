// Real PostgreSQL + real app. Phase 2.7b: client invoices and client payments reach the ledger.
//
// Reproduced first: nothing posted an invoice or a payment; the ledger held only expenses and payroll.
// Rules under test (services/glPosting.js POSTING_RULES, one map to change):
//   invoice becomes issued (or is created issued/sent):  Dr receivable amount | Cr revenue (amount - tax) | Cr vat_output tax
//   payment recorded:                                    Dr cash amount       | Cr receivable amount
//   invoice void/cancel, payment void:                   the same entry reversed, once
// Only the transition into an issued state posts: invoices issued before this change get no entry when a payment later
// flips them to paid (no backfill; the stock ledger is treated the same way).
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('2.7b client invoice and payment postings (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let owner;
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
  // a reversal lists the original's lines in the original order with the sides swapped; compare by account
  const bySide = (rows) => [...rows].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const ids = {};

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ('lp-owner', $1, 'x', 'owner') RETURNING id, token_version", [`lp-${tag}@test.io`]);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [row.id]);
    owner = { id: row.id, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
    ids.client = (await one('INSERT INTO clients (name_en, name_ar) VALUES ($1, $1) RETURNING id', [`lp-${tag}`])).id;
    ids.project = (await one("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`lp-${tag}`, `LP${tag}`.slice(0, 20)])).id;
  });
  afterAll(async () => {
    await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [owner.id]);
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [owner.id]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  const newInvoice = (amount = 1000) => call('POST', '/api/invoices', { project_id: ids.project, client_id: ids.client, amount, issue_date: '2026-01-01', due_date: '2099-01-01' });
  const pay = (invoiceId, amount) => call('POST', '/api/payments', { invoice_id: invoiceId, project_id: ids.project, client_id: ids.client, amount, payment_date: '2026-01-02' });

  test('an invoice created issued posts receivable against revenue, once, by the real user', async () => {
    const r = await newInvoice('1234.56');
    expect(r.status).toBe(201);
    const [entry] = await entries('client_invoice', r.body.data.id);
    expect(entry).toBeTruthy();
    expect(entry.created_by).toBe(owner.id);
    expect(await shape(entry)).toEqual([[await mapped('receivable'), 1234.56, 0], [await mapped('revenue'), 0, 1234.56]]);
    expect(await entries('client_invoice', r.body.data.id)).toHaveLength(1);
  });

  test('a draft valuation posts when it is issued, not before, and tax goes to vat_output', async () => {
    const created = await call('POST', '/api/finance-ledger/valuations', {
      project_id: ids.project, client_id: ids.client, gross_current_work: 1000, tax_pct: 14, issue_date: '2026-01-01',
    });
    expect(created.status).toBe(201);
    const inv = created.body.data;
    expect(Number(inv.amount)).toBe(1140);
    expect(Number(inv.tax_amount)).toBe(140);
    expect(await entries('client_invoice', inv.id)).toHaveLength(0);
    expect((await call('POST', `/api/finance-ledger/invoices/${inv.id}/transition`, { status: 'approved' })).status).toBe(200);
    expect(await entries('client_invoice', inv.id)).toHaveLength(0);

    // vat_output is not configured: issuing fails as a whole, the invoice stays approved
    const vat = await mapped('vat_output'); // seeded by migration 0016 (account 2100)
    expect(vat).toBeTruthy();
    await db.query("DELETE FROM gl_account_map WHERE key = 'vat_output'");
    try {
      const refused = await call('POST', `/api/finance-ledger/invoices/${inv.id}/transition`, { status: 'issued' });
      expect(refused.status).toBe(400);
      expect(String(refused.body.error)).toMatch(/vat_output/);
      expect((await one('SELECT status FROM invoices WHERE id = $1', [inv.id])).status).toBe('approved');
    } finally {
      await db.query("INSERT INTO gl_account_map (key, account_id) VALUES ('vat_output', $1)", [vat]);
    }
    const issued = await call('POST', `/api/finance-ledger/invoices/${inv.id}/transition`, { status: 'issued' });
    expect(issued.status).toBe(200);
    const list = await entries('client_invoice', inv.id);
    expect(list).toHaveLength(1);
    expect(await shape(list[0])).toEqual([[await mapped('receivable'), 1140, 0], [await mapped('revenue'), 0, 1000], [vat, 0, 140]]);
  });

  test('a payment posts cash against receivable and its void posts the reverse once, even under concurrent voids', async () => {
    const inv = (await newInvoice(500)).body.data;
    const p = await pay(inv.id, 200.1);
    expect(p.status).toBe(201);
    const [entry] = await entries('client_payment', p.body.data.id);
    expect(entry.created_by).toBe(owner.id);
    expect(await shape(entry)).toEqual([[await mapped('cash'), 200.1, 0], [await mapped('receivable'), 0, 200.1]]);

    const voids = await Promise.all(Array.from({ length: 5 }, () => call('DELETE', `/api/payments/${p.body.data.id}`, { reason: 'duplicate' })));
    expect(voids.filter((v) => v.status === 200)).toHaveLength(1);
    const reversal = await entries('client_payment_void', p.body.data.id);
    expect(reversal).toHaveLength(1);
    expect(bySide(await shape(reversal[0]))).toEqual(bySide([[await mapped('receivable'), 200.1, 0], [await mapped('cash'), 0, 200.1]]));
  });

  test('voiding an invoice reverses its posting once; a second void is refused', async () => {
    const inv = (await newInvoice(300)).body.data;
    expect((await call('DELETE', `/api/invoices/${inv.id}`, { reason: 'wrong client' })).status).toBe(200);
    const rev = await entries('client_invoice_void', inv.id);
    expect(rev).toHaveLength(1);
    expect(bySide(await shape(rev[0]))).toEqual(bySide([[await mapped('revenue'), 300, 0], [await mapped('receivable'), 0, 300]]));
    expect((await call('DELETE', `/api/invoices/${inv.id}`, { reason: 'again' })).status).toBe(409);
    expect(await entries('client_invoice_void', inv.id)).toHaveLength(1);
  });

  test('a posted invoice amount cannot be edited; a status change through PUT follows the same posting rules', async () => {
    const inv = (await newInvoice(100)).body.data;
    const edit = await call('PUT', `/api/invoices/${inv.id}`, { amount: 999 });
    expect(edit.status).toBe(409);
    expect(Number((await one('SELECT amount FROM invoices WHERE id = $1', [inv.id])).amount)).toBe(100);
    const voided = await call('PUT', `/api/invoices/${inv.id}`, { status: 'void' });
    expect(voided.status).toBe(200);
    expect(await entries('client_invoice_void', inv.id)).toHaveLength(1);
  });

  test('an invoice issued before this change gets no entry when a payment later makes it paid', async () => {
    const legacy = await one(
      "INSERT INTO invoices (invoice_number, project_id, client_id, amount, issue_date, status) VALUES ($1, $2, $3, 80, '2025-01-01', 'issued') RETURNING id",
      [`LP-${tag}-L`, ids.project, ids.client]);
    const p = await pay(legacy.id, 80);
    expect(p.status).toBe(201);
    expect((await one('SELECT status FROM invoices WHERE id = $1', [legacy.id])).status).toBe('paid');
    expect(await entries('client_invoice', legacy.id)).toHaveLength(0);
    expect(await entries('client_payment', p.body.data.id)).toHaveLength(1);
  });

  test('when posting fails nothing else is saved: no invoice, no payment', async () => {
    const original = await mapped('receivable');
    const invoicesBefore = (await one('SELECT count(*)::int n FROM invoices WHERE project_id = $1', [ids.project])).n;
    const keep = (await newInvoice(40)).body.data; // posted while the mapping still exists
    await db.query("DELETE FROM gl_account_map WHERE key = 'receivable'");
    try {
      const inv = await newInvoice(55);
      expect(inv.status).toBe(500);
      expect(String(inv.body.error)).toMatch(/receivable/);
      expect((await one('SELECT count(*)::int n FROM invoices WHERE project_id = $1', [ids.project])).n).toBe(invoicesBefore + 1);
      const paymentsBefore = (await one('SELECT count(*)::int n FROM payments WHERE project_id = $1', [ids.project])).n;
      const p = await pay(keep.id, 10);
      expect(p.status).toBe(400);
      expect((await one('SELECT count(*)::int n FROM payments WHERE project_id = $1', [ids.project])).n).toBe(paymentsBefore);
    } finally {
      await db.query("INSERT INTO gl_account_map (key, account_id) VALUES ('receivable', $1)", [original]);
    }
  });

  test('the database allows one posting per document and kind', async () => {
    const inv = (await newInvoice(10)).body.data;
    const [entry] = await entries('client_invoice', inv.id);
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await expect(client.query("INSERT INTO journal_entries (entry_number, date, reference_type, reference_id) VALUES ($1, '2026-01-01', 'client_invoice', $2)", [`JE-DUP-${tag}`, inv.id]))
        .rejects.toMatchObject({ code: '23505' });
    } finally { await client.query('ROLLBACK'); client.release(); }
    expect(entry).toBeTruthy();
  });
});
