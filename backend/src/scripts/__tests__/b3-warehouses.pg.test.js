// B3 real-PostgreSQL behaviour cases: the warehouse master surface works under the
// mounted policy (module `warehouses`, storekeeper holds create/edit per 0006),
// the reorder threshold survives a later movement, and the low-stock widget reacts.
// Requires TEST_PG=1 and a migrated throwaway database (docs/TESTING.md).
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('B3 warehouses master surface (real PostgreSQL, real app)', () => {
  let db; let server; let base;
  const tag = `b3wh-${Date.now()}`;
  const users = {}; const ids = {};
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
      [`b3-${key}`, `b3-${key}-${tag}@test.io`, role]);
    await db.query(
      'INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, $2, id FROM roles WHERE key = $3',
      [row.id, projectId ?? null, role]);
    users[key] = { id: row.id, name: row.name, role, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
  };

  beforeAll(async () => {
    db = require('../../config/database');
    widgets = require('../../services/dashboardWidgets');
    ids.project = (await one(
      "INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id",
      [`b3proj-${tag}`, `B3W${tag}`.slice(0, 20)])).id;
    await makeUser('storekeeper', 'storekeeper');
    await makeUser('viewer', 'viewer');
    await makeUser('owner', 'owner');
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

  test('storekeeper creates and updates a warehouse; a role without the grant is 403', async () => {
    const created = await call('POST', '/api/warehouses', users.storekeeper.token, {
      name: `wh-${tag}`, name_en: `wh-${tag}`, name_ar: `مخزن ${tag}`,
      warehouse_type: 'site', project_id: ids.project, storage_capacity: 1000,
    });
    expect(created.status).toBe(201);
    expect(created.body.data.name).toBe(`wh-${tag}`);
    expect(created.body.data.type).toBe('site');
    ids.warehouse = created.body.data.id;

    const updated = await call('PUT', `/api/warehouses/${ids.warehouse}`, users.storekeeper.token, { name: `wh-updated-${tag}`, storage_capacity: 2000 });
    expect(updated.status).toBe(200);
    expect(updated.body.data.name).toBe(`wh-updated-${tag}`);

    const denied = await call('POST', '/api/warehouses', users.viewer.token, { name: `wh-denied-${tag}` });
    expect(denied.status).toBe(403); // viewer holds no warehouses create grant
  });

  test('reorder level is settable, survives a later movement, and the low-stock widget reacts', async () => {
    const item = (await one("INSERT INTO item_master (code, name_en, name_ar, unit) VALUES ($1, $1, $1, 'pcs') RETURNING id", [`b3item-${tag}`])).id;
    const warehouse = ids.warehouse;

    // The low-stock widgets react: measure the overview's inventory.low_stock before/after.
    const lowStockBefore = (await (await call('GET', '/api/dashboard/overview', users.owner.token)).body).modules.inventory.low_stock;
    const set = await call('PUT', `/api/warehouses/${warehouse}/stock/${item}/reorder-level`, users.storekeeper.token, { reorder_level: 5 });
    expect(set.status).toBe(200);
    expect(Number(set.body.data.reorder_level)).toBe(5);
    expect(Number(set.body.data.quantity)).toBe(0); // threshold set before any stock exists

    // A movement after the update keeps the configured value (projection must not reset it).
    const receipt = await call('POST', `/api/warehouses/${warehouse}/movements`, users.storekeeper.token, {
      material_id: item, movement_type: 'grn', quantity: 2, mir_accepted: true, unit_cost: 10, notes: 'b3 regression receipt',
    });
    expect(receipt.status).toBe(201);
    const stock = (await one('SELECT * FROM warehouse_stock WHERE warehouse_id = $1 AND item_id = $2', [warehouse, item]));
    expect(Number(stock.reorder_level)).toBe(5); // kept after the movement rewrote the row

    const lowStockAfter = (await (await call('GET', '/api/dashboard/overview', users.owner.token)).body).modules.inventory.low_stock;
    expect(lowStockAfter).toBeGreaterThan(lowStockBefore); // quantity 2 <= reorder 5 counts as low stock

    const belowZero = await call('PUT', `/api/warehouses/${warehouse}/stock/${item}/reorder-level`, users.storekeeper.token, { reorder_level: -1 });
    expect(belowZero.status).toBe(400); // Joi rejects a negative threshold
  });
});
