// Enumerate GET handlers that read commercial commitment/aging projections and fail on any SQL mutation.
const tokens = require('../../services/tokens');
const describePg = process.env.TEST_PG === '1' ? describe : describe.skip;

describePg('commitment and finance projection GET routes are read-only (real PostgreSQL)', () => {
  let db; let app; let server; let base; let owner; let ownerId; let projectId; let poId; let supplierId;
  const tag = `R33GET${Date.now()}`;
  const mutations = [];
  const routes = [
    ['/api/commercial', () => require('../../routes/commercial')],
    ['/api/costing', () => require('../../routes/costing')],
    ['/api/dashboard', () => require('../../routes/dashboard')],
    ['/api/finance', () => require('../../routes/finance')],
    ['/api/finance-ledger', () => require('../../routes/financeLedger')],
  ];

  const discoverReadRoutes = () => routes.flatMap(([prefix, load]) => load().stack.flatMap((layer) => {
    const route = layer.route;
    if (!route || !route.methods.get) return [];
    const handler = route.stack.map((item) => item.handle.toString()).join('\n');
    if (!/\b(projectCommercial|listCommitments|companyFinanceDashboard|arAging|apAging)\s*\(/.test(handler)) return [];
    return [String(route.path).split('/').map((part) => part.startsWith(':') ? String(projectId) : part).join('/').replace(/\/\//g, '/')]
      .map((path) => `${prefix}${path.startsWith('/') ? path : `/${path}`}`);
  }));

  const trackQuery = (original, receiver) => function trackedQuery(text, ...args) {
    if (typeof text === 'string' && /\b(INSERT\s+INTO|UPDATE\s+[\w".]+|DELETE\s+FROM|TRUNCATE\s+TABLE)\b/i.test(text)) {
      mutations.push(text.replace(/\s+/g, ' ').slice(0, 180));
    }
    return original.call(receiver, text, ...args);
  };

  beforeAll(async () => {
    db = require('../../config/database');
    const user = (await db.query(
      "INSERT INTO users (name, email, password, role) VALUES ($1,$2,'unused','owner') RETURNING id, token_version",
      [`${tag} owner`, `${tag.toLowerCase()}@example.com`]
    )).rows[0];
    ownerId = user.id;
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [ownerId]);
    owner = { token: tokens.signSession({ userId: user.id, tokenVersion: user.token_version }) };
    const project = (await db.query(
      "INSERT INTO projects (name, name_en, code, status, budget, contract_value) VALUES ($1,$1,$2,'active',10000,10000) RETURNING id",
      [`${tag} project`, tag]
    )).rows[0];
    projectId = project.id;
    supplierId = (await db.query(
      'INSERT INTO suppliers (code, name_en, name_ar) VALUES ($1,$1,$1) RETURNING id', [`${tag}-SUP`]
    )).rows[0].id;
    poId = (await db.query(
      "INSERT INTO purchase_orders (order_number, project_id, supplier_id, total_amount, status) VALUES ($1,$2,$3,1000,'issued') RETURNING id",
      [`${tag}-PO`, projectId, supplierId]
    )).rows[0].id;

    ({ app } = require('../../../server'));
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (projectId) {
      await db.query('DELETE FROM commitments WHERE project_id = $1', [projectId]);
      await db.query('DELETE FROM purchase_orders WHERE id = $1', [poId]);
      await db.query('DELETE FROM suppliers WHERE id = $1', [supplierId]);
      await db.query('DELETE FROM projects WHERE id = $1', [projectId]);
    }
    await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [ownerId]);
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [ownerId]);
    await db.pool.end();
  });

  test('every enumerated commercial/finance projection GET succeeds without a table mutation', async () => {
    const discovered = discoverReadRoutes();
    expect(discovered.length).toBeGreaterThanOrEqual(7);
    const originalPoolQuery = db.pool.query;
    const originalConnect = db.pool.connect;
    db.pool.query = trackQuery(originalPoolQuery, db.pool);
    const trackClient = (client) => {
      if (client && !client.__r3ReadonlyTracked) {
        client.query = trackQuery(client.query, client);
        client.__r3ReadonlyTracked = true;
      }
      return client;
    };
    db.pool.connect = function trackedConnect(...args) {
      const callbackIndex = args.findIndex((argument) => typeof argument === 'function');
      if (callbackIndex >= 0) {
        const callback = args[callbackIndex];
        args[callbackIndex] = (error, client, release) => {
          if (!error) trackClient(client);
          return callback(error, client, release);
        };
        return originalConnect.apply(db.pool, args);
      }
      const connected = originalConnect.apply(db.pool, args);
      return connected && typeof connected.then === 'function' ? connected.then(trackClient) : trackClient(connected);
    };
    const results = [];
    try {
      for (const route of discovered) {
        const response = await fetch(base + route, { headers: { Authorization: `Bearer ${owner.token}` } });
        results.push({ route, status: response.status });
      }
    } finally {
      db.pool.query = originalPoolQuery;
      db.pool.connect = originalConnect;
    }
    expect(results).toHaveLength(discovered.length);
    expect(results.filter((result) => result.status !== 200)).toEqual([]);
    expect(mutations).toEqual([]);
    expect(await db.query("SELECT count(*)::int AS n FROM commitments WHERE source_type = 'purchase_order' AND source_id = $1", [poId]).then((r) => r.rows[0].n)).toBe(0);
  });
});
