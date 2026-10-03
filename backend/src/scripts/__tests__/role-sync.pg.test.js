// Real PostgreSQL + real app. Phase 1.2 follow-up: changing users.role through PUT /api/users/:id
// must change what the user can do.
// Reproduced first: the route updated users.role only, so a demoted manager kept every manager grant
// (their user_project_roles rows still pointed at the manager role) and kept their old session token.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('PUT /api/users/:id role changes (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let projectId;
  const users = {};
  const tag = Date.now();

  const call = async (method, path, token, body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* empty */ }
    return { status: res.status, body: json };
  };
  const addRow = (userId, role, project = null) => db.query(
    'INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, $2, id FROM roles WHERE key = $3', [userId, project, role]
  );
  const makeUser = async (key, role, rows = [{ role }]) => {
    const row = (await db.query(
      "INSERT INTO users (name, email, password, role) VALUES ($1, $2, 'x', $3) RETURNING id, token_version", [`rs-${key}`, `rs-${key}-${tag}@test.io`, role]
    )).rows[0];
    for (const r of rows) await addRow(row.id, r.role, r.project_id ?? null);
    users[key] = { id: row.id, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
  };
  const roleRows = async (userId) => (await db.query(
    'SELECT r.key AS role, upr.project_id FROM user_project_roles upr JOIN roles r ON r.id = upr.role_id WHERE upr.user_id = $1 ORDER BY r.key, upr.project_id NULLS FIRST', [userId]
  )).rows;
  const freshToken = async (userId) => tokens.signSession({ userId, tokenVersion: (await db.query('SELECT token_version FROM users WHERE id = $1', [userId])).rows[0].token_version });

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    projectId = (await db.query("INSERT INTO projects (name, code) VALUES ('role sync', $1) RETURNING id", [`RS${String(tag).slice(-8)}`])).rows[0].id;
    await makeUser('owner', 'owner');
    await makeUser('admin', 'admin');
    await makeUser('ref_manager', 'manager');
    await makeUser('ref_staff', 'staff');
  });

  afterAll(async () => {
    const ids = (await db.query('SELECT id FROM users WHERE email LIKE $1', [`rs-%-${tag}@test.io`])).rows.map((r) => r.id);
    await db.query('DELETE FROM user_project_roles WHERE user_id = ANY($1) OR granted_by = ANY($1)', [ids]);
    await db.query('UPDATE users SET is_active = false WHERE id = ANY($1)', [ids]);   // audit_events is append-only
    await db.query('DELETE FROM projects WHERE id = $1', [projectId]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('demoting a manager removes the manager grants, installs the staff grants and signs them out', async () => {
    await makeUser('demote', 'manager', [{ role: 'manager' }, { role: 'manager', project_id: projectId }, { role: 'consultant', project_id: projectId }]);
    const res = await call('PUT', `/api/users/${users.demote.id}`, users.owner.token, { role: 'staff' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('staff');

    // Old grants gone (company-wide and project-specific), new company-wide staff row, unrelated explicit grant kept.
    expect(await roleRows(users.demote.id)).toEqual([
      { role: 'consultant', project_id: projectId },
      { role: 'staff', project_id: null },
    ]);

    // The session issued before the change is revoked.
    expect((await call('GET', '/api/projects', users.demote.token)).status).toBe(401);
  });

  test('a manager moved to a project-bound role loses company-wide access', async () => {
    await makeUser('lose_access', 'manager');
    expect((await call('GET', '/api/suppliers', users.lose_access.token)).status).toBe(200);
    expect((await call('PUT', `/api/users/${users.lose_access.id}`, users.owner.token, { role: 'consultant' })).status).toBe(200);
    expect((await call('GET', '/api/suppliers', await freshToken(users.lose_access.id))).status).toBe(403);
  });

  test('promoting grants the new role and drops the old one', async () => {
    await makeUser('promote', 'staff');
    const res = await call('PUT', `/api/users/${users.promote.id}`, users.owner.token, { role: 'accountant' });
    expect(res.status).toBe(200);
    expect(await roleRows(users.promote.id)).toEqual([{ role: 'accountant', project_id: null }]);
  });

  test('the full role set is accepted, and an unknown role is rejected', async () => {
    await makeUser('wide', 'staff');
    const roles = (await db.query("SELECT key FROM roles WHERE key <> 'owner' ORDER BY key")).rows.map((r) => r.key);
    expect(roles.length).toBeGreaterThan(10);
    for (const role of roles) {
      const ok = await call('PUT', `/api/users/${users.wide.id}`, users.owner.token, { role });
      expect([role, ok.status]).toEqual([role, 200]);
    }
    const bad = await call('PUT', `/api/users/${users.wide.id}`, users.owner.token, { role: 'galactic_overlord' });
    expect(bad.status).toBe(400);
  });

  test('only an owner can grant the owner role', async () => {
    await makeUser('climber', 'staff');
    const byAdmin = await call('PUT', `/api/users/${users.climber.id}`, users.admin.token, { role: 'owner' });
    expect(byAdmin.status).toBe(403);
    expect((await roleRows(users.climber.id)).map((r) => r.role)).toEqual(['staff']);
    const byOwner = await call('PUT', `/api/users/${users.climber.id}`, users.owner.token, { role: 'owner' });
    expect(byOwner.status).toBe(200);
    expect((await roleRows(users.climber.id)).map((r) => r.role)).toEqual(['owner']);
  });

  test('moving to a project-bound external role gives no company-wide access', async () => {
    await makeUser('external', 'staff');
    const res = await call('PUT', `/api/users/${users.external.id}`, users.owner.token, { role: 'consultant' });
    expect(res.status).toBe(200);
    expect(await roleRows(users.external.id)).toEqual([]);
  });

  test('a change that does not touch the role leaves grants and the session alone', async () => {
    await makeUser('rename', 'engineer');
    const before = await roleRows(users.rename.id);
    const res = await call('PUT', `/api/users/${users.rename.id}`, users.owner.token, { department: 'Site' });
    expect(res.status).toBe(200);
    expect(await roleRows(users.rename.id)).toEqual(before);
    expect((await call('GET', '/api/projects', users.rename.token)).status).toBe(200);
  });

  test('the change is written to the audit trail', async () => {
    await makeUser('audited', 'manager');
    await call('PUT', `/api/users/${users.audited.id}`, users.owner.token, { role: 'staff' });
    const ev = (await db.query(
      "SELECT \"before\", \"after\", user_id FROM audit_events WHERE entity = 'user' AND entity_id = $1 AND action = 'role_change'", [users.audited.id]
    )).rows;
    expect(ev.length).toBe(1);
    expect(ev[0].before.role).toBe('manager');
    expect(ev[0].after.role).toBe('staff');
    expect(ev[0].user_id).toBe(users.owner.id);
  });

  // Runs fn with `keepIds` as the only active owners, then restores the others.
  const withOwners = async (keepIds, fn) => {
    const others = (await db.query("SELECT id FROM users WHERE role = 'owner' AND is_active = true AND id <> ALL($1)", [keepIds])).rows.map((r) => r.id);
    await db.query('UPDATE users SET is_active = false WHERE id = ANY($1)', [others]);
    try { await fn(); } finally { await db.query('UPDATE users SET is_active = true WHERE id = ANY($1)', [others]); }
  };

  test('a user cannot change their own role', async () => {
    await makeUser('self_admin', 'admin');
    const r1 = await call('PUT', `/api/users/${users.self_admin.id}`, users.self_admin.token, { role: 'staff' });
    expect(r1.status).toBe(403);
    await makeUser('self_owner', 'owner');
    const r2 = await call('PUT', `/api/users/${users.self_owner.id}`, users.self_owner.token, { role: 'admin' });
    expect(r2.status).toBe(403);
    expect((await roleRows(users.self_admin.id)).map((r) => r.role)).toEqual(['admin']);
  });

  test('only an owner can change an admin\'s role', async () => {
    await makeUser('target_admin', 'admin');
    const byAdmin = await call('PUT', `/api/users/${users.target_admin.id}`, users.admin.token, { role: 'staff' });
    expect(byAdmin.status).toBe(403);
    expect((await roleRows(users.target_admin.id)).map((r) => r.role)).toEqual(['admin']);
    const byOwner = await call('PUT', `/api/users/${users.target_admin.id}`, users.owner.token, { role: 'staff' });
    expect(byOwner.status).toBe(200);
  });

  test('an admin cannot deactivate an owner', async () => {
    await makeUser('owner_b', 'owner');
    expect((await call('DELETE', `/api/users/${users.owner_b.id}`, users.admin.token)).status).toBe(403);
    expect((await call('PUT', `/api/users/${users.owner_b.id}`, users.admin.token, { is_active: false })).status).toBe(403);
  });

  test('the last active owner cannot be deactivated or demoted', async () => {
    await makeUser('last_owner', 'owner');
    await makeUser('second_owner', 'owner');
    await withOwners([users.last_owner.id], async () => {
      expect((await call('DELETE', `/api/users/${users.last_owner.id}`, users.last_owner.token)).status).toBe(409);
      expect((await call('PUT', `/api/users/${users.last_owner.id}`, users.last_owner.token, { is_active: false })).status).toBe(409);
      expect((await db.query('SELECT is_active FROM users WHERE id = $1', [users.last_owner.id])).rows[0].is_active).toBe(true);
    });
    // With a second owner around, an owner can demote or deactivate the other one; the last one is then protected.
    await withOwners([users.last_owner.id, users.second_owner.id], async () => {
      expect((await call('PUT', `/api/users/${users.second_owner.id}`, users.last_owner.token, { role: 'admin' })).status).toBe(200);
      expect((await call('PUT', `/api/users/${users.last_owner.id}`, users.last_owner.token, { is_active: false })).status).toBe(409);
    });
  });
});
