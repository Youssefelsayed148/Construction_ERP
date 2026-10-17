const tokens = require('../../services/tokens');
const describePg = process.env.TEST_PG === '1' ? describe : describe.skip;
const routes = ['/api/suppliers', '/api/clients', '/api/organizations/team', '/api/team', '/api/v1/companies/'];
const roles = ['project_manager', 'unassigned', 'client_reviewer', 'owner_ceo'];

describePg('Batch 5A last blocker: exact directory and team visibility', () => {
  let db; let server; let base; let own; let foreign; let ownClient; let ownSupplier;
  const actors = {}; const userIds = []; const seats = [];
  const companyIds = {};
  const tag = `${Date.now()}-${process.pid}`;
  const sorted = ids => [...ids].sort((a, b) => a - b);
  const isTeam = route => route.endsWith('/team');
  const call = async (route, role) => {
    const response = await fetch(base + route, {
      headers: { Authorization: `Bearer ${actors[role].token}` }, signal: AbortSignal.timeout(10000),
    });
    const body = await response.json();
    return { status: response.status, ids: Array.isArray(body.data) ? body.data.map(row => row.id) : [],
      total: response.headers.has('x-total-count') ? Number(response.headers.get('x-total-count')) : null,
      metaTotal: body.meta?.total ?? null };
  };
  beforeAll(async () => {
    db = require('../../config/database');
    const one = async (sql, params) => (await db.query(sql, params)).rows[0];
    for (const suffix of ['own', 'foreign']) {
      const client = await one('INSERT INTO clients (code,name_ar,name_en) VALUES ($1,$1,$1) RETURNING id', [`B5LAST-C-${tag}-${suffix}`]);
      const supplier = await one('INSERT INTO suppliers (code,name_ar,name_en) VALUES ($1,$1,$1) RETURNING id', [`B5LAST-S-${tag}-${suffix}`]);
      const project = await one("INSERT INTO projects (code,name,client_id,status) VALUES ($1,$1,$2,'active') RETURNING id", [`B5LAST-P-${tag}-${suffix}`, client.id]);
      await one("INSERT INTO purchase_orders (order_number,project_id,supplier_id,status) VALUES ($1,$2,$3,'issued') RETURNING id", [`B5LAST-PO-${tag}-${suffix}`, project.id, supplier.id]);
      if (suffix === 'own') { own = project.id; ownClient = client.id; ownSupplier = supplier.id; } else foreign = project.id;
    }
    for (const role of [...roles, 'foreign_member', 'own_member']) {
      const key = ['unassigned', 'foreign_member', 'own_member'].includes(role) ? 'project_manager' : role;
      const user = await one("INSERT INTO users (name,email,password,role) VALUES ($1,$2,'unused',$3) RETURNING id,token_version", [`B5LAST ${role}`, `b5last-${tag}-${role}@test.invalid`, key]);
      userIds.push(user.id);
      actors[role] = { ...user, token: tokens.signSession({ userId: user.id, tokenVersion: user.token_version }) };
      if (role === 'unassigned') continue;
      const project = role === 'owner_ceo' ? null : role === 'foreign_member' ? foreign : own;
      const seat = await one('INSERT INTO user_project_roles (user_id,project_id,role_id) SELECT $1,$2,id FROM roles WHERE key=$3 RETURNING id,project_id', [user.id, project, key]);
      if (!seat) throw new Error(`Missing migrated role ${key}`);
      seats.push(seat);
    }
    companyIds.suppliers = (await db.query('SELECT id FROM suppliers WHERE deleted_at IS NULL ORDER BY name_en,id')).rows.map(row => row.id);
    companyIds.clients = (await db.query('SELECT id FROM clients ORDER BY name_en,id')).rows.map(row => row.id);
    companyIds.team = (await db.query('SELECT id FROM user_project_roles ORDER BY id')).rows.map(row => row.id);
    const { app } = require('../../../server');
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) {
      for (const id of userIds) {
        await db.query('DELETE FROM user_project_roles WHERE user_id=$1', [id]);
        await db.query('UPDATE users SET is_active=false WHERE id=$1', [id]);
      }
      await db.pool.end();
    }
  });

  test.each(roles.flatMap(role => routes.map(route => [role, route])))('%s GET %s returns exact ids and total', async (role, route) => {
    const result = await call(route, role);
    const denied = ['unassigned', 'client_reviewer'].includes(role);
    const expectedIds = denied ? [] : role === 'owner_ceo'
      ? companyIds[isTeam(route) ? 'team' : route === '/api/suppliers' ? 'suppliers' : 'clients']
      : isTeam(route) ? seats.filter(seat => seat.project_id === own).map(seat => seat.id)
        : [route === '/api/suppliers' ? ownSupplier : ownClient];
    // The default page is 200; owner totals also include prior suites' rows.
    // Derive its exact page independently from raw SQL, never from the API.
    const expected = { status: denied ? 403 : 200, ids: sorted(expectedIds.slice(0, 200)), total: denied ? null : expectedIds.length,
      metaTotal: !denied && route.startsWith('/api/v1/') ? expectedIds.length : null };
    const actual = { ...result, ids: sorted(result.ids) };
    console.log('B5LAST exact visibility', JSON.stringify({ role, route, own, foreign, expected, actual }));
    expect(actual).toEqual(expected);
  });

  test.each(['/api/organizations/team', '/api/team'])('%s scopes SQL totals before pagination and denies foreign project filters', async route => {
    const ids = sorted(seats.filter(seat => seat.project_id === own).map(seat => seat.id));
    const first = await call(`${route}?limit=1&offset=0`, 'project_manager');
    const second = await call(`${route}?limit=1&offset=1`, 'project_manager');
    const third = await call(`${route}?limit=1&offset=2`, 'project_manager');
    const empty = await call(`${route}?limit=1&offset=3`, 'project_manager');
    expect(first).toEqual({ status: 200, ids: [ids[0]], total: ids.length, metaTotal: null });
    expect(second).toEqual({ status: 200, ids: [ids[1]], total: ids.length, metaTotal: null });
    expect(third).toEqual({ status: 200, ids: [ids[2]], total: ids.length, metaTotal: null });
    expect(empty).toEqual({ status: 200, ids: [], total: ids.length, metaTotal: null });
    expect((await call(`${route}?project_id=${own}`, 'project_manager')).ids).toEqual(ids);
    expect((await call(`${route}?project_id=${foreign}`, 'project_manager')).status).toBe(403);
    expect((await call(`${route}?project_id=${foreign}`, 'owner_ceo')).ids).toEqual(seats.filter(seat => seat.project_id === foreign).map(seat => seat.id));
  });
});
