'use strict';

process.env.AUTH_RATE_LIMIT_PER_15_MIN = '100000';
const tokens = require('../../services/tokens');
const describePg = process.env.TEST_PG === '1' ? describe : describe.skip;

describePg('R2b labour-payment delete protection (real PostgreSQL)', () => {
  let db; let server; let base; let token; let project; let laborer; let owner;
  const tag = `${Date.now()}-${process.pid}`;
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const payment = () => one('INSERT INTO labor_payments (project_id, laborer_id, days_worked, daily_rate, total_amount) VALUES ($1, $2, 2, 100, 200) RETURNING *', [project.id, laborer.id]);
  const remove = async (id, bearer = token) => {
    const response = await fetch(`${base}/api/hr/labor-payments/${id}`, { method: 'DELETE', headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} });
    return { status: response.status, body: await response.json() };
  };
  const assertProtected = async (row) => {
    const result = await remove(row.id);
    expect(result).toMatchObject({ status: 409, body: { success: false, error_code: 'labor_payment_posted', error_params: {} } });
    expect(await one('SELECT * FROM labor_payments WHERE id = $1', [row.id])).toEqual(row);
    expect(await one("SELECT id FROM audit_events WHERE entity = 'labor_payment' AND entity_id = $1 AND action = 'delete'", [row.id])).toBeUndefined();
  };

  beforeAll(async () => {
    db = require('../../config/database');
    const { app } = require('../../../server');
    await new Promise(resolve => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    owner = await one("INSERT INTO users (name, email, password, role) VALUES ('lp-owner', $1, 'unused', 'owner') RETURNING id, token_version", [`lp-${tag}@test.invalid`]);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [owner.id]);
    token = tokens.signSession({ userId: owner.id, tokenVersion: owner.token_version });
    project = await one("INSERT INTO projects (name, code, status) VALUES ('lp-delete', $1, 'active') RETURNING id", [`LP${tag}`]);
    laborer = await one("INSERT INTO daily_laborers (full_name) VALUES ('lp-delete') RETURNING id");
  });
  afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
    await db.pool.end();
  });

  test('costed payment is refused and its cost is preserved', async () => {
    const row = await payment();
    const cost = await one("INSERT INTO project_costs (project_id, source_type, source_id, amount) VALUES ($1, 'labor_payment', $2, 200) RETURNING *", [project.id, row.id]);
    await assertProtected(row);
    expect(await one('SELECT * FROM project_costs WHERE id = $1', [cost.id])).toEqual(cost);
  });

  test.each(['pending', 'dispatching', 'delivered', 'dead'])('%s posting event prevents deletion before or after cost delivery', async status => {
    const row = await payment();
    const event = await one("INSERT INTO event_outbox (event_type, entity_type, entity_id, payload, status) VALUES ('labor_payment.created', 'labor_payment', $1, $2, $3) RETURNING *", [row.id, JSON.stringify({ project_id: project.id, amount: 200 }), status]);
    await assertProtected(row);
    expect(await one('SELECT * FROM event_outbox WHERE id = $1', [event.id])).toEqual(event);
  });

  test('unposted payment is deleted with an attributed before snapshot', async () => {
    const row = await payment();
    expect((await remove(row.id)).status).toBe(200);
    expect(await one('SELECT id FROM labor_payments WHERE id = $1', [row.id])).toBeUndefined();
    const audit = await one("SELECT * FROM audit_events WHERE entity = 'labor_payment' AND entity_id = $1 AND action = 'delete'", [row.id]);
    expect(audit).toMatchObject({ user_id: owner.id, project_id: project.id, before: { id: row.id, total_amount: '200.00' }, after: null });
    expect(await one("SELECT id FROM activity_log WHERE entity_type = 'labor_payment' AND entity_id = $1 AND action = 'delete' AND user_id = $2", [row.id, owner.id])).toBeTruthy();
  });

  test('unauthenticated delete cannot remove an unposted payment', async () => {
    const row = await payment();
    expect((await remove(row.id, null)).status).toBe(401);
    expect(await one('SELECT id FROM labor_payments WHERE id = $1', [row.id])).toBeTruthy();
  });

  test('project-scoped delete grant permits its project and denies another project', async () => {
    const role = await one('INSERT INTO roles (key, name, is_system) VALUES ($1, $1, false) RETURNING id', [`lp_${tag}`]);
    await db.query("INSERT INTO permissions (module, action) VALUES ('hr', 'delete') ON CONFLICT (module, action) DO NOTHING");
    await db.query("INSERT INTO role_permissions (role_id, permission_id) SELECT $1, id FROM permissions WHERE module = 'hr' AND action = 'delete'", [role.id]);
    const user = await one("INSERT INTO users (name, email, password, role) VALUES ('lp-scoped', $1, 'unused', 'engineer') RETURNING id, token_version", [`lp-scoped-${tag}@test.invalid`]);
    await db.query('INSERT INTO user_project_roles (user_id, project_id, role_id) VALUES ($1, $2, $3)', [user.id, project.id, role.id]);
    const bearer = tokens.signSession({ userId: user.id, tokenVersion: user.token_version });
    const own = await payment();
    expect((await remove(own.id, bearer)).status).toBe(200);
    const other = await one("INSERT INTO projects (name, code) VALUES ('lp-other', $1) RETURNING id", [`LO${tag}`]);
    const row = await one('INSERT INTO labor_payments (project_id, laborer_id, total_amount) VALUES ($1, $2, 200) RETURNING *', [other.id, laborer.id]);
    expect((await remove(row.id, bearer)).status).toBe(403);
    expect(await one('SELECT id FROM labor_payments WHERE id = $1', [row.id])).toBeTruthy();
  });

  test('conflict code has paired English and Arabic keys', () => {
    for (const lang of ['en', 'ar']) {
      expect(require(`../../../../frontend/src/locales/${lang}/errors.json`).labor_payment_posted).toEqual(expect.any(String));
    }
  });
});
