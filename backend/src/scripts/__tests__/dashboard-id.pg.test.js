// Real PostgreSQL. Closeout B11: the dashboard id contract.
// Found by the load run: a non-integer project id reached SQL and answered 500
// dashboard_section_failed. It is a client error and must be a 400 before any query runs;
// a real section failure keeps the A2.4 behaviour (error_code dashboard_section_failed).
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('B11 dashboard id contract', () => {
  let app; let server; let base; let db; let owner; let project;
  const tag = String(Date.now()).slice(-7);

  const call = async (path) => {
    const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${owner.token}` } });
    let json = null;
    try { json = await res.json(); } catch (e) { /* empty */ }
    return { status: res.status, body: json };
  };

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const row = (await db.query("INSERT INTO users (name, email, password, role) VALUES ('b11-owner', $1, 'x', 'owner') RETURNING id, token_version", [`b11-${tag}@test.io`])).rows[0];
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [row.id]);
    owner = { id: row.id, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
    project = (await db.query("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`b11-${tag}`, `B11${tag}`.slice(0, 20)])).rows[0];
  });

  afterAll(async () => {
    await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [owner.id]);
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [owner.id]);
    await db.query('DELETE FROM projects WHERE id = $1', [project.id]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('a non-integer id is a 400, never a dashboard-section 500', async () => {
    const res = await call('/api/dashboard/project/undefined');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('a valid project id answers the dashboard (200) on real PostgreSQL', async () => {
    const res = await call(`/api/dashboard/project/${project.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(project.id);
  });

  test('an unknown id is a 404, not a section failure', async () => {
    const res = await call('/api/dashboard/project/99999999');
    expect(res.status).toBe(404);
  });
});
