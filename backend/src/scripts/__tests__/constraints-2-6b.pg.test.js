// Real PostgreSQL + real app. Phase 2.6b: one money standard, one pending approval per record, one current
// revision per document.
//
// Reproduced first (all fail on the schema and routes before migration 0013):
//  - invoices.amount and payments.amount were NUMERIC(14,2), supplier_materials.unit_price and
//    units.price_per_m2 NUMERIC(12,2), while the other 125 money columns are NUMERIC(15,2).
//  - nothing stopped two pending approval requests for the same record (the route checked, then inserted).
//  - POST /api/docs/documents/:id/versions inserted the new version as current and then superseded every
//    current version, including the one it had just inserted: after an upload no version was current.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('2.6b constraints (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let owner;
  const tag = String(Date.now()).slice(-7);
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const code = async (sql, params) => {
    const client = await db.pool.connect();
    try { await client.query('BEGIN'); await client.query(sql, params); return 'ok'; } catch (e) { return e.code; } finally { await client.query('ROLLBACK'); client.release(); }
  };
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
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ('c26b-owner', $1, 'x', 'owner') RETURNING id, token_version", [`c26b-${tag}@test.io`]);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [row.id]);
    owner = { id: row.id, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
  });
  afterAll(async () => {
    await db.query("DELETE FROM approval_requests WHERE module_name = $1", [`c26b${tag}`]);
    await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [owner.id]);
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [owner.id]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  describe('money columns share one standard', () => {
    test('every money column with two decimals holds at least NUMERIC(15,2)', async () => {
      const rows = (await db.query(
        `SELECT table_name, column_name, numeric_precision p FROM information_schema.columns
          WHERE table_schema = 'public' AND data_type = 'numeric' AND numeric_scale = 2 AND numeric_precision < 15
            AND column_name ~ '(amount|cost|price|budget|salary|balance|value|wage)'`)).rows;
      expect(rows.map((r) => `${r.table_name}.${r.column_name} (${r.p},2)`)).toEqual([]);
    });
  });

  describe('one pending approval per record', () => {
    const mod = () => `c26b${tag}`;
    const insert = (status) => ["INSERT INTO approval_requests (module_name, request_type, request_id, status) VALUES ($1, 'x', 1, $2)", [mod(), status]];

    test('the database refuses a second pending request for the same record, allows resolved ones', async () => {
      await db.query(...insert('pending'));
      expect(await code(...insert('pending'))).toBe('23505');
      expect(await code(...insert('approved'))).toBe('ok');
      expect(await code("INSERT INTO approval_requests (module_name, request_type, request_id, status) VALUES ($1, 'x', 2, 'pending')", [mod()])).toBe('ok');
      expect(await code("INSERT INTO approval_requests (module_name, request_type, request_id, status) VALUES ($1, 'y', 1, 'pending')", [mod()])).toBe('ok');
      await db.query('DELETE FROM approval_requests WHERE module_name = $1', [mod()]);
    });

    test('ten concurrent requests for the same record create one pending row and all answer success', async () => {
      const body = { module_name: mod(), request_type: 'budget', request_id: 77, notes: 'race' };
      const results = await Promise.all(Array.from({ length: 10 }, () => call('POST', '/api/approvals/request', body)));
      expect(results.map((r) => r.status)).toEqual(Array(10).fill(200));
      const rows = (await db.query("SELECT id FROM approval_requests WHERE module_name = $1 AND request_id = 77 AND status = 'pending'", [mod()])).rows;
      expect(rows).toHaveLength(1);
      expect(new Set(results.map((r) => r.body.request.id)).size).toBe(1);
    });
  });

  describe('one current revision per document', () => {
    let project; let doc;
    beforeAll(async () => {
      project = (await one("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`c26b-${tag}`, `C26B${tag}`.slice(0, 20)])).id;
      doc = (await one("INSERT INTO project_documents (project_id, title, document_type, file_url, version, uploaded_by) VALUES ($1, 'rev doc', 'drawing', '/v1.pdf', 1, $2) RETURNING id", [project, owner.id])).id;
      await db.query("INSERT INTO document_versions (document_id, version_no, file_url, is_current, status) VALUES ($1, 1, '/v1.pdf', true, 'current')", [doc]);
    });

    test('the database refuses two current versions of one document', async () => {
      expect(await code("INSERT INTO document_versions (document_id, version_no, file_url, is_current, status) VALUES ($1, 99, '/x.pdf', true, 'current')", [doc])).toBe('23505');
      expect(await code("INSERT INTO document_versions (document_id, version_no, file_url, is_current, status) VALUES ($1, 99, '/x.pdf', false, 'superseded')", [doc])).toBe('ok');
    });

    test('uploading a revision makes the new version, and only it, current', async () => {
      const r = await call('POST', `/api/docs/documents/${doc}/versions`, { file_url: '/v2.pdf' });
      expect(r.status).toBe(201);
      const cur = (await db.query('SELECT version_no, status FROM document_versions WHERE document_id = $1 AND is_current', [doc])).rows;
      expect(cur).toEqual([{ version_no: 2, status: 'current' }]);
      const old = await one('SELECT status, is_current FROM document_versions WHERE document_id = $1 AND version_no = 1', [doc]);
      expect(old).toEqual({ status: 'superseded', is_current: false });
    });

    test('eight concurrent uploads: distinct version numbers, exactly one current', async () => {
      const before = (await one('SELECT count(*)::int n FROM document_versions WHERE document_id = $1', [doc])).n;
      const results = await Promise.all(Array.from({ length: 8 }, (_, i) => call('POST', `/api/docs/documents/${doc}/versions`, { file_url: `/c${i}.pdf` })));
      expect(results.map((r) => r.status)).toEqual(Array(8).fill(201));
      const all = (await db.query('SELECT version_no, is_current FROM document_versions WHERE document_id = $1', [doc])).rows;
      expect(all).toHaveLength(before + 8);
      expect(new Set(all.map((v) => v.version_no)).size).toBe(all.length);
      expect(all.filter((v) => v.is_current)).toHaveLength(1);
    });
  });
});
