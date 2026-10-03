// Real PostgreSQL + real app. Phase 2.7a: the journal posts inside the caller's transaction, throws on failure,
// takes its accounts from configuration, records the real user, and refuses unbalanced entries.
//
// Reproduced first (all fail on the old code):
//  - utils/journal.js caught every error, returned null and the routes ran it fire-and-forget: an expense whose
//    entry failed was still created and nothing was posted.
//  - account ids 1, 8, 9, 10 were hard-coded and created_by defaulted to 1.
//  - posting payroll twice posted two entries.
//  - nothing refused an unbalanced entry.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');
const money = require('../../utils/money');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('2.7a journal (real PostgreSQL, real app)', () => {
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
  const mapped = async (key) => (await one('SELECT account_id FROM gl_account_map WHERE key = $1', [key])).account_id;
  const entriesFor = async (type, id) => (await db.query('SELECT * FROM journal_entries WHERE reference_type = $1 AND reference_id = $2 ORDER BY id', [type, id])).rows;
  const linesOf = async (entryId) => (await db.query('SELECT account_id, debit, credit FROM journal_entry_lines WHERE journal_entry_id = $1 ORDER BY line_order', [entryId])).rows;

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ('j-owner', $1, 'x', 'owner') RETURNING id, token_version", [`j-${tag}@test.io`]);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [row.id]);
    owner = { id: row.id, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
  });
  afterAll(async () => {
    await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [owner.id]);
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [owner.id]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  const newExpense = (amount = '125.50') => call('POST', '/api/expenses', { category: 'other', description: `j ${tag}`, amount: Number(amount) });

  test('an expense is posted in the same transaction: balanced, configured accounts, the real user', async () => {
    const r = await newExpense('125.50');
    expect(r.status).toBe(201);
    const [entry] = await entriesFor('expense', r.body.data.id);
    expect(entry).toBeTruthy();
    expect(entry.created_by).toBe(owner.id);
    expect(Number(entry.total_amount)).toBe(125.5);
    const lines = await linesOf(entry.id);
    expect(lines.map((l) => [l.account_id, Number(l.debit), Number(l.credit)])).toEqual([
      [await mapped('other_expense'), 125.5, 0],
      [await mapped('cash'), 0, 125.5],
    ]);
  });

  test('account ids come from configuration: remapping a key moves the posting', async () => {
    const original = await mapped('other_expense');
    const material = await mapped('material_cost');
    await db.query("UPDATE gl_account_map SET account_id = $1 WHERE key = 'other_expense'", [material]);
    try {
      const r = await newExpense('10');
      const [entry] = await entriesFor('expense', r.body.data.id);
      expect((await linesOf(entry.id))[0].account_id).toBe(material);
    } finally {
      await db.query("UPDATE gl_account_map SET account_id = $1 WHERE key = 'other_expense'", [original]);
    }
  });

  test('when posting fails the expense is not created and the caller is told', async () => {
    const original = await mapped('other_expense');
    const before = (await one("SELECT count(*)::int n FROM expenses WHERE description = $1", [`j ${tag}`])).n;
    await db.query("DELETE FROM gl_account_map WHERE key = 'other_expense'");
    try {
      const r = await newExpense('20');
      expect(r.status).toBe(500);
      expect(String(r.body.error)).toMatch(/other_expense/);
      expect((await one("SELECT count(*)::int n FROM expenses WHERE description = $1", [`j ${tag}`])).n).toBe(before);
    } finally {
      await db.query("INSERT INTO gl_account_map (key, account_id) VALUES ('other_expense', $1)", [original]);
    }
  });

  test('posting payroll to finance twice posts one entry', async () => {
    const period = await one("INSERT INTO payroll_periods (period_name, month, year, total_net_salary, status) VALUES ($1, 1, 2090, 1000.10, 'approved') RETURNING id", [`j ${tag}`]);
    const first = await call('PUT', `/api/payroll/${period.id}`, { posted_to_finance: true });
    const second = await call('PUT', `/api/payroll/${period.id}`, { posted_to_finance: true });
    expect([first.status, second.status]).toEqual([200, 200]);
    const entries = await entriesFor('payroll', period.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].created_by).toBe(owner.id);
    expect((await linesOf(entries[0].id)).map((l) => [l.account_id, Number(l.debit), Number(l.credit)])).toEqual([
      [await mapped('salary_expense'), 1000.1, 0], [await mapped('cash'), 0, 1000.1],
    ]);
  });

  describe('balanced entries', () => {
    const { postJournalEntry } = require('../../utils/journal');
    const run = async (fn) => {
      const client = await db.pool.connect();
      try { await client.query('BEGIN'); const out = await fn((s, p) => client.query(s, p)); await client.query('COMMIT'); return out; } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    };
    const base = (lines) => ({ date: '2026-01-01', description: 'x', reference_type: 'test', reference_id: 1, created_by: owner.id, lines });

    test('the service refuses an unbalanced entry and posts nothing', async () => {
      await expect(run((q) => postJournalEntry(q, base([{ account: 'cash', debit: '10.00' }, { account: 'revenue', credit: '9.99' }])))).rejects.toThrow(/balance/i);
    });
    test('decimal arithmetic: 0.10 + 0.20 against 0.30 balances (floats would not)', async () => {
      expect(0.1 + 0.2).not.toBe(0.3);
      const out = await run((q) => postJournalEntry(q, base([{ account: 'cash', debit: '0.10' }, { account: 'cash', debit: '0.20' }, { account: 'revenue', credit: '0.30' }])));
      expect(out.entryNumber).toMatch(/^JE-/);
      await db.query('DELETE FROM journal_entry_lines WHERE journal_entry_id = $1', [out.entryId]);
      await db.query('DELETE FROM journal_entries WHERE id = $1', [out.entryId]);
    });
    test('an entry needs two lines, one side per line, positive amounts and a known account', async () => {
      await expect(run((q) => postJournalEntry(q, base([{ account: 'cash', debit: '5' }])))).rejects.toThrow(/at least two/i);
      await expect(run((q) => postJournalEntry(q, base([{ account: 'cash', debit: '5', credit: '5' }, { account: 'revenue', credit: '0' }])))).rejects.toThrow(/one side/i);
      await expect(run((q) => postJournalEntry(q, base([{ account: 'cash', debit: '-5' }, { account: 'revenue', credit: '-5' }])))).rejects.toThrow(/negative|positive/i);
      await expect(run((q) => postJournalEntry(q, base([{ account: 'nope', debit: '5' }, { account: 'revenue', credit: '5' }])))).rejects.toThrow(/nope/);
    });
    test('the database refuses an unbalanced entry at commit, whoever writes it', async () => {
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        const e = (await client.query("INSERT INTO journal_entries (entry_number, date, total_amount) VALUES ($1, '2026-01-01', 5) RETURNING id", [`JE-T-${tag}`])).rows[0];
        await client.query('INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, line_order) VALUES ($1, $2, 5, 0, 1), ($1, $3, 0, 4, 2)',
          [e.id, await mapped('cash'), await mapped('revenue')]);
        await expect(client.query('COMMIT')).rejects.toThrow(/balance/i);
      } finally { await client.query('ROLLBACK').catch(() => {}); client.release(); }
    });
    test('a line cannot carry both a debit and a credit, or a negative amount', async () => {
      const probe = async (debit, credit) => {
        const client = await db.pool.connect();
        try {
          await client.query('BEGIN');
          const e = (await client.query("INSERT INTO journal_entries (entry_number, date) VALUES ($1, '2026-01-01') RETURNING id", [`JE-P-${tag}-${debit}-${credit}`])).rows[0];
          await client.query('INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, $4)', [e.id, await mapped('cash'), debit, credit]);
          return 'ok';
        } catch (err) { return err.code; } finally { await client.query('ROLLBACK'); client.release(); }
      };
      expect(await probe(5, 5)).toBe('23514');
      expect(await probe(-5, 0)).toBe('23514');
      expect(await probe(5, 0)).toBe('ok');
    });
  });

  describe('money helper', () => {
    test('parses and formats exactly and rounds half up at two decimals', () => {
      expect(money.toMinor('1234.56')).toBe(123456n);
      expect(money.toMinor(0.1) + money.toMinor(0.2)).toBe(money.toMinor('0.30'));
      expect(money.format(money.toMinor('10'))).toBe('10.00');
      expect(money.percentOf(money.toMinor('100.00'), '14')).toBe(money.toMinor('14.00'));
      expect(money.percentOf(money.toMinor('0.05'), '50')).toBe(money.toMinor('0.03')); // 0.025 rounds half up
      expect(() => money.toMinor('1.234')).toThrow(/decimal/i);
    });
  });
});
