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
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections?.();
    });
    await db.pool.end();
  });

  test('a user cannot be deleted, referenced or not, and the answer names the policy', async () => {
    const fresh = await one("INSERT INTO users (name, email, password, role) VALUES ('up-fresh', $1, 'x', 'staff') RETURNING id", [`up-fresh-${tag}@test.io`]);
    await expect(db.query('DELETE FROM users WHERE id = $1', [fresh.id])).rejects.toMatchObject({ code: '23001', message: expect.stringMatching(/deactivat/i) });
    expect((await one('SELECT count(*)::int AS n FROM users WHERE id = $1', [fresh.id])).n).toBe(1);
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [fresh.id]);
  });

  test('user-owned rows cascade and optional attribution references detach only for approved tables', async () => {
    const rows = (await db.query(
      `SELECT conrelid::regclass::text AS child, conname, confdeltype AS delete_action FROM pg_constraint
        WHERE contype = 'f' AND confrelid = 'users'::regclass AND confdeltype IN ('c', 'n') ORDER BY 1, 2`)).rows;
    // User-owned credentials/session/delivery rows may cascade. Optional author
    // attribution becomes null on these non-financial history/register rows.
    expect(rows).toEqual([
      { child: 'action_comments', conname: 'action_comments_author_id_fkey', delete_action: 'n' },
      { child: 'agent_sessions', conname: 'agent_sessions_user_id_fkey', delete_action: 'c' },
      { child: 'api_tokens', conname: 'api_tokens_user_id_fkey', delete_action: 'c' },
      { child: 'asset_documents', conname: 'asset_documents_linked_by_fkey', delete_action: 'n' },
      { child: 'notification_deliveries', conname: 'notification_deliveries_user_id_fkey', delete_action: 'c' },
      { child: 'qaqc_certificates', conname: 'qaqc_certificates_created_by_fkey', delete_action: 'n' },
      { child: 'schedule_activity_assignments', conname: 'schedule_activity_assignments_created_by_fkey', delete_action: 'n' },
      { child: 'schedule_progress_updates', conname: 'schedule_progress_updates_created_by_fkey', delete_action: 'n' },
      { child: 'warranties', conname: 'warranties_created_by_fkey', delete_action: 'n' },
    ]);
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
    const res = await fetch(`${base}/api/users/${u.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${owner.token}`, Connection: 'close' } });
    expect(res.status).toBe(200);
    const row = await one('SELECT is_active FROM users WHERE id = $1', [u.id]);
    expect(row.is_active).toBe(false);
    await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [u.id]);
  });
});
