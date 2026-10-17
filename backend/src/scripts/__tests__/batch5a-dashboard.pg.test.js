const tokens = require('../../services/tokens');
const policy = require('../../services/policy');
const resources = require('../../services/apiResources');
const describePg = process.env.TEST_PG === '1' ? describe : describe.skip;

describePg('S-004 dashboard role/project matrix and delivery read model', () => {
  let db; let server; let base; let own; let foreign; let procurement; let ownDelivery; let foreignDelivery;
  const tag = `${Date.now()}-${process.pid}`;
  const call = async (route, user) => {
    const response = await fetch(base + route, { headers: { Authorization: `Bearer ${user.token}` }, signal: AbortSignal.timeout(10000) });
    return { status: response.status, body: await response.json() };
  };
  const userFor = async (role, projectId) => {
    const user = (await db.query("INSERT INTO users (name,email,password,role) VALUES ('S004',$1,'unused',$2) RETURNING id,role,token_version", [`s004-${tag}-${role}-${projectId ?? 'all'}@test.invalid`, role])).rows[0];
    await db.query('INSERT INTO user_project_roles (user_id,project_id,role_id) SELECT $1,$2,id FROM roles WHERE key=$3', [user.id, projectId, role]);
    user.token = tokens.signSession({ userId: user.id, tokenVersion: user.token_version });
    return user;
  };
  beforeAll(async () => {
    db = require('../../config/database');
    const { app } = require('../../../server');
    for (const suffix of ['own', 'foreign']) {
      const project = (await db.query("INSERT INTO projects (name,code,status) VALUES ($1,$1,'active') RETURNING id", [`S004-${tag}-${suffix}`])).rows[0];
      if (suffix === 'own') own = project; else foreign = project;
      const po = (await db.query("INSERT INTO purchase_orders (order_number,project_id,status) VALUES ($1,$2,'issued') RETURNING id", [`S004-${tag}-${suffix}`, project.id])).rows[0];
      for (let index = 0; index < (suffix === 'own' ? 1 : 3); index++) {
        const delivery = (await db.query("INSERT INTO deliveries (purchase_order_id,status) VALUES ($1,'pending') RETURNING id", [po.id])).rows[0];
        if (suffix === 'own') ownDelivery = delivery; else foreignDelivery = delivery;
        await db.query("INSERT INTO goods_receipt_notes (purchase_order_id,delivery_id,status) VALUES ($1,$2,'posted')", [po.id, delivery.id]);
      }
    }
    procurement = await userFor('procurement_manager', own.id);
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.pool.end();
  });
  test('procurement pending deliveries inherit project ownership from their PO', async () => {
    const result = await call(`/api/dashboard/role?project_id=${own.id}`, procurement);
    expect(result.status).toBe(200);
    expect(result.body.data.widgets.find(row => row.key === 'deliveries').data.pending).toBe(1);
  });
  test('every seeded role is checked with company, implicit own, explicit own and foreign project scopes', async () => {
    const roles = (await db.query('SELECT key FROM roles ORDER BY key')).rows.map(row => row.key);
    const failures = [];
    for (const role of roles) {
      for (const seat of ['company', 'project']) {
        const user = role === 'procurement_manager' && seat === 'project' ? procurement : await userFor(role, seat === 'project' ? own.id : null);
        for (const projectId of seat === 'project' ? [null, own.id, foreign.id] : [own.id]) {
          const allowed = (await policy.evaluate({ user, module: 'dashboard', action: 'view', projectId })).allowed
            && !['client', 'consultant', 'subcontractor', 'supplier'].includes(role);
          const result = await call('/api/dashboard/role' + (projectId == null ? '' : `?project_id=${projectId}`), user);
          const expected = allowed ? 200 : 403;
          if (result.status !== expected) failures.push(`${role}/${seat}/${projectId ?? 'implicit'}: expected=${expected} received=${result.status}`);
        }
      }
    }
    console.log(`S004 matrix: ${roles.length} roles x 4 scopes; failures=${JSON.stringify(failures)}`);
    expect(failures).toEqual([]);
  }, 120000);
  test('deliveries resource lists and records enforce the PO project expression', async () => {
    const responses = [];
    const res = { status(code) { this.code = code; return this; }, json(body) { responses.push({ status: this.code || 200, body }); this.code = null; return body; } };
    await resources.listFamily('deliveries', { user: procurement }, res);
    expect(responses.pop().body.data.map(row => row.id)).toEqual([ownDelivery.id]);
    await resources.getFamilyRecord('deliveries', { user: procurement, params: { id: ownDelivery.id } }, res);
    expect(responses.pop().status).toBe(200);
    await resources.getFamilyRecord('deliveries', { user: procurement, params: { id: foreignDelivery.id } }, res);
    expect(responses.pop().status).toBe(403);
  });
});
