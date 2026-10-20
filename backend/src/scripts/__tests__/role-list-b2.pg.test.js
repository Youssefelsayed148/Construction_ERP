// B2 real-PostgreSQL behaviour cases for the applied role-list fixes. The coarse
// authorize(...) list is ANDed with the scoped policy grant, so each case proves:
//   * the canonical role holding the exact module:action grant now gets success;
//   * a role without that grant still gets 403 (the policy still denies);
//   * hr deletion stays closed to hr_manager (no hr delete grant exists).
// Requires TEST_PG=1 and a migrated throwaway database (docs/TESTING.md).
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('B2 canonical role lists (real PostgreSQL, real app)', () => {
  let db; let server; let base;
  const tag = `b2role-${Date.now()}`;
  const users = {};
  const ids = {};
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];

  const call = async (method, path, token, body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  const makeUser = async (key, role, projectId) => {
    const row = await one(
      "INSERT INTO users (name, email, password, role) VALUES ($1, $2, 'x', $3) RETURNING id, name, token_version",
      [`b2-${key}`, `b2-${key}-${tag}@test.io`, role]);
    await db.query(
      'INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, $2, id FROM roles WHERE key = $3',
      [row.id, projectId ?? null, role]);
    users[key] = { id: row.id, name: row.name, role, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
  };

  beforeAll(async () => {
    db = require('../../config/database');
    ids.project = (await one(
      "INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id",
      [`b2proj-${tag}`, `B2R${tag}`.slice(0, 20)])).id;
    await makeUser('hrManager', 'hr_manager');
    await makeUser('storekeeper', 'storekeeper');
    await makeUser('planningEngineer', 'planning_engineer');
    await makeUser('siteEngineer', 'site_engineer');
    const { app } = require('../../../server');
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (db) {
      for (const user of Object.values(users)) {
        await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [user.id]);
        await db.query('UPDATE users SET is_active = false WHERE id = $1', [user.id]);
      }
      await db.pool.end();
    }
  });

  test('hr POST /employees: hr_manager succeeds (canonical grant now admitted); storekeeper still 403', async () => {
    const created = await call('POST', '/api/hr/employees', users.hrManager.token, {
      name_ar: `موظف ${tag}`, name_en: `emp-${tag}`, project_id: ids.project,
    });
    expect(created.status).toBe(201);
    const denied = await call('POST', '/api/hr/employees', users.storekeeper.token, {
      name_ar: `موظف ${tag}`, name_en: `emp2-${tag}`, project_id: ids.project,
    });
    expect(denied.status).toBe(403); // no hr create grant — the policy denies despite the list change
  });

  test('hr PUT /employees/:id: hr_manager edits; PUT /leaves/:id approves as hr_manager; DELETE stays 403', async () => {
    const employee = (await db.query('SELECT id FROM employees ORDER BY id DESC LIMIT 1')).rows[0];
    const updated = await call('PUT', `/api/hr/employees/${employee.id}`, users.hrManager.token, { name_en: `emp-updated-${tag}` });
    expect(updated.status).toBe(200);
    const deleted = await call('DELETE', `/api/hr/employees/${employee.id}`, users.hrManager.token);
    expect(deleted.status).toBe(403); // no hr delete grant exists for any role in the list

    const leave = await one(
      `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, status, reason)
       VALUES ($1, 'annual', CURRENT_DATE + 30, CURRENT_DATE + 34, 'pending', 'b2 fixture') RETURNING id`,
      [employee.id]);
    const decided = await call('PUT', `/api/hr/leaves/${leave.id}`, users.hrManager.token, { status: 'approved' });
    expect(decided.status).toBe(200);
    expect((await one('SELECT status FROM leave_requests WHERE id = $1', [leave.id])).status).toBe('approved');
  });

  test('schedule POST /activities: planning_engineer succeeds; site_engineer (schedule create missing) 403', async () => {
    const created = await call('POST', '/api/schedule/activities', users.planningEngineer.token, {
      project_id: ids.project, name: `activity-${tag}`,
    });
    expect(created.status).toBe(201);
    const denied = await call('POST', '/api/schedule/activities', users.siteEngineer.token, {
      project_id: ids.project, name: `activity-denied-${tag}`,
    });
    expect(denied.status).toBe(403); // site_engineer holds schedule edit, not create (0006)
  });

  test('schedule PUT /activities/:id (policy-only edit route): site_engineer succeeds', async () => {
    const activity = (await db.query('SELECT id FROM schedule_activities ORDER BY id DESC LIMIT 1')).rows[0];
    const updated = await call('PUT', `/api/schedule/activities/${activity.id}`, users.siteEngineer.token, { name: `activity-updated-${tag}` });
    expect(updated.status).toBe(200);
  });
});
