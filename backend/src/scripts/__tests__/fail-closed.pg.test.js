// Real PostgreSQL + real app. Phase 1.2: no role assignment means no access.
// Reproduced first: a user with zero user_project_roles rows fell back to a flat role check and
// was let through (hr, payroll, suppliers, ... for any role with no endpoint role list), v1
// single-record reads skipped the project check for them, and an unknown role got read+draft tools.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('fail-closed authorization (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db;
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
  const makeUser = async (key, role, { rows = [] } = {}) => {
    const id = (await db.query(
      "INSERT INTO users (name, email, password, role) VALUES ($1, $2, 'x', $3) RETURNING id", [`fc-${key}`, `fc-${key}-${tag}@test.io`, role]
    )).rows[0].id;
    for (const r of rows) {
      await db.query('INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, $2, id FROM roles WHERE key = $3', [id, r.project_id ?? null, r.role]);
    }
    users[key] = { id, token: tokens.signSession({ userId: id }) };
  };

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    await makeUser('orphan_staff', 'staff');
    await makeUser('orphan_owner', 'owner');
    await makeUser('orphan_manager', 'manager');
    await makeUser('assigned_owner', 'owner', { rows: [{ role: 'owner' }] });
  });

  afterAll(async () => {
    const ids = (await db.query('SELECT id FROM users WHERE email LIKE $1', [`fc-%-${tag}@test.io`])).rows.map((r) => r.id);
    await db.query('DELETE FROM activity_log WHERE user_id = ANY($1)', [ids]);
    await db.query('DELETE FROM audit_events WHERE user_id = ANY($1)', [ids]);
    await db.query('DELETE FROM user_project_roles WHERE user_id = ANY($1) OR granted_by = ANY($1)', [ids]);
    await db.query("DELETE FROM users WHERE email LIKE $1", [`fc-%-${tag}@test.io`]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  const MODULES = ['/api/hr/employees', '/api/payroll', '/api/suppliers', '/api/items', '/api/legal', '/api/expenses', '/api/projects', '/api/schedule/activities'];

  test.each(['orphan_staff', 'orphan_owner', 'orphan_manager'])('%s (no role rows) is denied on every module', async (key) => {
    for (const path of MODULES) {
      const r = await call('GET', path, users[key].token);
      expect([path, r.status]).toEqual([path, 403]);
    }
  });

  test('a user with a role assignment is still allowed', async () => {
    for (const path of ['/api/suppliers', '/api/items', '/api/projects']) {
      const r = await call('GET', path, users.assigned_owner.token);
      expect([path, r.status]).toEqual([path, 200]);
    }
  });

  test('v1 single-record reads deny a user with no role rows', async () => {
    const r = await call('GET', '/api/v1/purchase-orders/1', users.orphan_staff.token);
    expect([401, 403]).toContain(r.status);
    const list = await call('GET', '/api/v1/purchase-orders', users.orphan_staff.token);
    expect([401, 403]).toContain(list.status);
  });

  test('a user with no role rows cannot see approvals or their visibility flags', async () => {
    const policy = require('../../services/policy');
    expect(await policy.hasPermission({ id: users.orphan_owner.id, role: 'owner' }, 'approvals', 'approve')).toBe(false);
    expect(await policy.visibilityFlags({ id: users.orphan_staff.id, role: 'staff' })).toEqual({
      see_internal_cost: false, see_client_price: false, see_subcontractor_price: false,
    });
  });

  test('an unknown role gets no MCP tools', () => {
    const agentPolicy = require('../../services/agentPolicy');
    expect(agentPolicy.toolsForRole('some_new_role').size).toBe(0);
    expect(agentPolicy.toolsForRole(undefined).size).toBe(0);
    expect(agentPolicy.toolsForRole('owner').size).toBeGreaterThan(0);
  });

  test('register gives the new user a role assignment so they are not locked out', async () => {
    const reg = await call('POST', '/api/auth/register', users.assigned_owner.token, {
      name: 'Reg User', email: `fc-reg-${tag}@test.io`, password: 'a long enough password 1', role: 'staff',
    });
    expect(reg.status).toBe(201);
    const rows = (await db.query('SELECT 1 FROM user_project_roles WHERE user_id = $1', [reg.body.data.id])).rows;
    expect(rows.length).toBe(1);
  });
});
