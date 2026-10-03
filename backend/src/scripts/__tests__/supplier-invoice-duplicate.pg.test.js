// Real PostgreSQL + real app. Phase 3.2: duplicate supplier invoices are refused by the DATABASE, not
// only by a check-then-act read.
//
// Reproduced first (on the pre-3.2 code):
//   * the duplicate rejection answered 400 with no error_code — no stable, localizable user-facing code;
//   * two concurrent creates of the same (supplier, invoice_number) could BOTH succeed: the API's
//     SELECT-then-INSERT window raced; there was no unique index to stop the second one.
const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('3.2 supplier invoice duplicate protection (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db;
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
  let owner;
  let supplierId;
  const invoiceBody = (n) => ({
    supplier_id: supplierId, invoice_number: `dup-${tag}-${n}`,
    total_amount: 100, tax_amount: 0,
    lines: [{ material_id: null, quantity: 1, unit_price: 100 }],
  });

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ('dd-owner', $1, 'x', 'owner') RETURNING id, token_version", [`dd-${tag}@test.io`]);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [row.id]);
    const tokens = require('../../services/tokens');
    owner = { id: row.id, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
    supplierId = (await one('INSERT INTO suppliers (code, name_en, name_ar) VALUES ($1, $1, $1) RETURNING id', [`dd-${tag}`])).id;
  });

  afterAll(async () => {
    await db.query('DELETE FROM supplier_invoice_lines WHERE supplier_invoice_id IN (SELECT id FROM supplier_invoices WHERE supplier_id = $1)', [supplierId]);
    await db.query('DELETE FROM supplier_invoices WHERE supplier_id = $1', [supplierId]);
    await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [owner.id]);
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [owner.id]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('the second create of the same supplier invoice number is refused with the user-facing error code', async () => {
    const first = await call('POST', '/api/procurement/invoices', invoiceBody(1));
    expect(first.status).toBe(201);
    const second = await call('POST', '/api/procurement/invoices', invoiceBody(1));
    expect(second.status).toBe(409);
    expect(second.body.error_code).toBe('supplier_invoice_duplicate');
    expect(second.body.error_params).toEqual({ supplier_id: supplierId, invoice_number: `dup-${tag}-1` });
    expect(String(second.body.error)).toMatch(/duplicate/i);
    expect((await one('SELECT count(*)::int n FROM supplier_invoices WHERE supplier_id = $1 AND invoice_number = $2', [supplierId, `dup-${tag}-1`])).n).toBe(1);
  });

  test('two concurrent creates of the same invoice leave exactly one row', async () => {
    const results = await Promise.allSettled([
      call('POST', '/api/procurement/invoices', invoiceBody(2)),
      call('POST', '/api/procurement/invoices', invoiceBody(2)),
    ]);
    const statuses = results.map((r) => (r.status === 'fulfilled' ? r.value.status : r.reason));
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(1);
    expect((await one('SELECT count(*)::int n FROM supplier_invoices WHERE supplier_id = $1 AND invoice_number = $2', [supplierId, `dup-${tag}-2`])).n).toBe(1);
  });

  test('a different supplier may reuse the same invoice number', async () => {
    const other = (await one('INSERT INTO suppliers (code, name_en, name_ar) VALUES ($1, $1, $1) RETURNING id', [`dd-o-${tag}`])).id;
    const body = { ...invoiceBody(3), supplier_id: other };
    const mine = await call('POST', '/api/procurement/invoices', invoiceBody(3));
    const theirs = await call('POST', '/api/procurement/invoices', body);
    expect(mine.status).toBe(201);
    expect(theirs.status).toBe(201);
    await db.query('DELETE FROM supplier_invoice_lines WHERE supplier_invoice_id IN (SELECT id FROM supplier_invoices WHERE supplier_id = $1)', [other]);
    await db.query('DELETE FROM supplier_invoices WHERE supplier_id = $1', [other]);
    await db.query('UPDATE suppliers SET is_active = false WHERE id = $1', [other]);
  });

  test('the database itself refuses the duplicate (unique index), whoever writes', async () => {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await expect(client.query(
        'INSERT INTO supplier_invoices (invoice_number, supplier_id, total_amount, status) VALUES ($1, $2, 100, $3)',
        [`dup-${tag}-1`, supplierId, 'received'],
      )).rejects.toMatchObject({ code: '23505' });
    } finally { await client.query('ROLLBACK'); client.release(); }
  });
});
