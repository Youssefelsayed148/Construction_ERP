// Phase 1 security closeout (Batch 3): AV-scan queue stub. Real PostgreSQL + real app. Proves every
// upload through POST /api/documents/upload is queued (scan_status defaults to 'pending',
// scanned_at stays null) without blocking or slowing the upload response — see services/avScanQueue.js
// for why nothing here marks a file 'clean' (there is no real AV provider configured).
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('B3 AV-scan queue stub (real PostgreSQL, real app)', () => {
  let db; let server; let base; let owner;
  const tag = `b3av-${Date.now()}`;
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];

  beforeAll(async () => {
    db = require('../../config/database');
    const { app } = require('../../../server');
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const row = await one(
      "INSERT INTO users (name, email, password, role) VALUES ('b3-av', $1, 'x', 'owner') RETURNING id, token_version",
      [`${tag}@test.invalid`]
    );
    await db.query('INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = $2', [row.id, 'owner']);
    owner = { id: row.id, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
  });

  afterAll(async () => {
    await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [owner.id]);
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [owner.id]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('a valid upload is queued for an AV scan: scan_status pending, scanned_at null, upload itself unaffected', async () => {
    const form = new FormData();
    form.append('files', new Blob([`hello from ${tag}`], { type: 'text/plain' }), `${tag}.txt`);
    const response = await fetch(`${base}/api/documents/upload`, {
      method: 'POST', headers: { Authorization: `Bearer ${owner.token}` }, body: form,
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    const fileName = body.data[0].file_url.split('/').pop();
    const row = await one('SELECT scan_status, scanned_at FROM uploaded_files WHERE file_name = $1', [fileName]);
    expect(row.scan_status).toBe('pending');
    expect(row.scanned_at).toBeNull();
  });
});
