// Real PostgreSQL + real app. Phase 2.5c: users are deactivated, never deleted, and no foreign key to users
// cascades or detaches. Reproduced first: `DELETE FROM users` succeeded for any user without references and
// cascaded into user_project_roles, organization_users and saved_views; 33 foreign keys to users were SET NULL
// (created_by / approved_by on financial documents silently became NULL).
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('users are deactivated, never deleted (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let owner;
  const tag = String(Date.now()).slice(-7);
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ('up-owner', $1, 'x', 'owner') RETURNING id, token_version", [`up-${tag}@test.io`]);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [row.id]);
    owner = { id: row.id, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
  });
  afterAll(async () => {
    await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [owner.id]);
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [owner.id]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('a user cannot be deleted, referenced or not, and the answer names the policy', async () => {
    const fresh = await one("INSERT INTO users (name, email, password, role) VALUES ('up-fresh', $1, 'x', 'staff') RETURNING id", [`up-fresh-${tag}@test.io`]);
    await expect(db.query('DELETE FROM users WHERE id = $1', [fresh.id])).rejects.toMatchObject({ code: '23001', message: expect.stringMatching(/deactivat/i) });
    expect((await one('SELECT count(*)::int AS n FROM users WHERE id = $1', [fresh.id])).n).toBe(1);
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [fresh.id]);
  });

  test('no foreign key to users cascades or sets null', async () => {
    const rows = (await db.query(
      `SELECT conrelid::regclass::text AS child, conname, confdeltype FROM pg_constraint
        WHERE contype = 'f' AND confrelid = 'users'::regclass AND confdeltype IN ('c', 'n') ORDER BY 1, 2`)).rows;
    expect(rows).toEqual([]);
  });

  test('access links cannot be removed by deleting the user either', async () => {
    const u = await one("INSERT INTO users (name, email, password, role) VALUES ('up-link', $1, 'x', 'staff') RETURNING id", [`up-link-${tag}@test.io`]);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'viewer'", [u.id]);
    await expect(db.query('DELETE FROM users WHERE id = $1', [u.id])).rejects.toMatchObject({ code: '23001' });
    expect((await one('SELECT count(*)::int AS n FROM user_project_roles WHERE user_id = $1', [u.id])).n).toBe(1);
    await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [u.id]);
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [u.id]);
  });

  test('DELETE /api/users/:id deactivates: the row, its authored records and its history stay', async () => {
    const u = await one("INSERT INTO users (name, email, password, role) VALUES ('up-target', $1, 'x', 'staff') RETURNING id", [`up-target-${tag}@test.io`]);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'staff'", [u.id]);
    const res = await fetch(`${base}/api/users/${u.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${owner.token}` } });
    expect(res.status).toBe(200);
    const row = await one('SELECT is_active FROM users WHERE id = $1', [u.id]);
    expect(row.is_active).toBe(false);
    await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [u.id]);
  });
});
