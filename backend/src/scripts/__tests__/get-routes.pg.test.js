const fs = require('fs');
const path = require('path');
const tokens = require('../../services/tokens');
const describePg = process.env.TEST_PG === '1' ? describe : describe.skip;

describePg('R0.2 owner GET route smoke on migrated PostgreSQL', () => {
  let db; let app; let server; let base; let token; let owner; let project;
  const tag = `${Date.now()}-${process.pid}`;
  const confirmed = ['/api/warehouses/transfers', '/api/warehouses/reservations', '/api/qhse/calibration-records', '/api/qhse/mirs', '/api/quantities/measurements', '/api/expenses', '/api/maintenance'];
  const call = async (route) => {
    const url = new URL(route, base);
    url.searchParams.set('project_id', String(project.id));
    url.searchParams.set('status', 'active');
    url.searchParams.set('limit', '5');
    const result = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
    const responseBody = await result.text();
    if (result.status >= 500) {
      try { console.log(`R0.2 server error ${route}: ${(JSON.parse(responseBody).error || 'internal error').toString()}`); }
      catch (_) { console.log(`R0.2 server error ${route}: response body was not JSON`); }
    }
    return result.status;
  };

  beforeAll(async () => {
    db = require('../../config/database');
    ({ app } = require('../../../server'));
    owner = (await db.query("INSERT INTO users (name, email, password, role) VALUES ('r02-owner', $1, 'unused', 'owner') RETURNING id, token_version", [`r02-${tag}@test.invalid`])).rows[0];
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [owner.id]);
    token = tokens.signSession({ userId: owner.id, tokenVersion: owner.token_version });
    project = (await db.query("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`r02-${tag}`, `R02-${tag}`])).rows[0];
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (owner) {
      await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [owner.id]);
      await db.query('UPDATE users SET is_active = false WHERE id = $1', [owner.id]);
    }
    if (project) await db.query('DELETE FROM projects WHERE id = $1', [project.id]);
    if (db) await db.pool.end();
  });

  test.each(confirmed)('%s accepts typical filters without server failure', async (route) => {
    expect(await call(route)).toBe(200);
  });

  test.each([
    { family: 'clients', table: 'clients', route: '/api/clients', codePrefix: 'R2P-CLI' },
    { family: 'suppliers', table: 'suppliers', route: '/api/suppliers', codePrefix: 'R2P-SUP' },
    { family: 'HR employees', table: 'employees', route: '/api/hr/employees', codePrefix: 'R2P-HR' },
  ])('$family route advances to page 2 with a correct total and no overlap', async ({ table, route, codePrefix }) => {
    const names = [0, 1, 2].map((n) => `r02-page-${tag}-${n}`);
    const codes = names.map((_, n) => `${codePrefix}-${tag}-${n}`);
    if (table === 'clients') {
      for (let n = 0; n < names.length; n += 1) {
        await db.query('INSERT INTO clients (code, name_ar, name_en, client_type) VALUES ($1, $2, $2, $3)', [codes[n], names[n], `pagination-${tag}`]);
      }
    } else if (table === 'suppliers') {
      for (let n = 0; n < names.length; n += 1) {
        await db.query('INSERT INTO suppliers (name_ar, name_en, code) VALUES ($1, $1, $2)', [names[n], codes[n]]);
      }
    } else {
      for (let n = 0; n < names.length; n += 1) {
        await db.query('INSERT INTO employees (code, name, name_en, name_ar) VALUES ($1, $2, $2, $2)', [codes[n], names[n]]);
      }
    }
    try {
      const fetchPage = async (offset) => {
        const url = new URL(route, base);
        url.searchParams.set('search', `r02-page-${tag}`);
        url.searchParams.set('limit', '1');
        url.searchParams.set('offset', String(offset));
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        return { response, body: await response.json() };
      };
      const first = await fetchPage(0);
      const second = await fetchPage(1);
      expect(first.response.status).toBe(200);
      expect(second.response.status).toBe(200);
      expect(first.response.headers.get('x-total-count')).toBe('3');
      expect(second.response.headers.get('x-total-count')).toBe('3');
      expect(first.body.data).toHaveLength(1);
      expect(second.body.data).toHaveLength(1);
      expect(first.body.data[0].id).not.toBe(second.body.data[0].id);
    } finally {
      await db.query(`DELETE FROM ${table} WHERE code = ANY($1)`, [codes]);
    }
  });

  test('notification inbox advances to page 2 with a correct total and no overlap', async () => {
    const titles = [0, 1, 2].map((n) => `r02-page-${tag}-${n}`);
    for (const title of titles) await db.query(
      "INSERT INTO notifications (user_id, title, event_type, status) VALUES ($1, $2, 'pagination-test', 'unread')",
      [owner.id, title]
    );
    try {
      const fetchPage = async (offset) => {
        const url = new URL('/api/notifications', base);
        url.searchParams.set('limit', '1');
        url.searchParams.set('offset', String(offset));
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        return { response, body: await response.json() };
      };
      const first = await fetchPage(0);
      const second = await fetchPage(1);
      expect(first.response.status).toBe(200);
      expect(second.response.status).toBe(200);
      expect(first.response.headers.get('x-total-count')).toBe('3');
      expect(second.response.headers.get('x-total-count')).toBe('3');
      expect(first.body.data).toHaveLength(1);
      expect(second.body.data).toHaveLength(1);
      expect(first.body.data[0].id).not.toBe(second.body.data[0].id);
    } finally {
      await db.query("DELETE FROM notifications WHERE user_id = $1 AND event_type = 'pagination-test'", [owner.id]);
    }
  });

  test('procurement project workspace advances the purchase-order array and reports its total', async () => {
    const material = (await db.query(
      "INSERT INTO item_master (code, category, name_en, name_ar, unit) VALUES ($1, 'pagination-test', $2, $2, 'ea') RETURNING id",
      [`R2P-ITEM-${tag}`, `r02-page-${tag}`]
    )).rows[0].id;
    try {
      for (let n = 0; n < 3; n += 1) await db.query(
        "INSERT INTO purchase_orders (order_number, project_id, material_id, quantity, status) VALUES ($1, $2, $3, 1, 'issued')",
        [`R2P-PO-${tag}-${n}`, project.id, material]
      );
      const fetchPage = async (offset) => {
        const url = new URL(`/api/procurement/project/${project.id}`, base);
        url.searchParams.set('limit', '1');
        url.searchParams.set('offset', String(offset));
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        return { response, body: await response.json() };
      };
      const first = await fetchPage(0);
      const second = await fetchPage(1);
      expect(first.response.status).toBe(200);
      expect(second.response.status).toBe(200);
      expect(first.response.headers.get('x-total-count')).toBe('3');
      expect(second.response.headers.get('x-total-count')).toBe('3');
      expect(first.body.data.purchase_orders).toHaveLength(1);
      expect(second.body.data.purchase_orders).toHaveLength(1);
      expect(first.body.data.purchase_orders[0].id).not.toBe(second.body.data.purchase_orders[0].id);
    } finally {
      await db.query('DELETE FROM purchase_orders WHERE order_number LIKE $1', [`R2P-PO-${tag}-%`]);
      await db.query('DELETE FROM item_master WHERE id = $1', [material]);
    }
  });

  test('asset register advances to page 2 with a correct total and no overlap', async () => {
    for (let n = 0; n < 3; n += 1) await db.query(
      "INSERT INTO assets (code, name, name_en, name_ar, category, equipment_type) VALUES ($1, $2, $2, $2, 'other', 'owned')",
      [`R2P-ASSET-${tag}-${n}`, `r02-page-${tag}-${n}`]
    );
    try {
      const fetchPage = async (offset) => {
        const url = new URL('/api/assets', base);
        url.searchParams.set('search', `r02-page-${tag}`);
        url.searchParams.set('limit', '1');
        url.searchParams.set('offset', String(offset));
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        return { response, body: await response.json() };
      };
      const first = await fetchPage(0);
      const second = await fetchPage(1);
      expect(first.response.status).toBe(200);
      expect(second.response.status).toBe(200);
      expect(first.response.headers.get('x-total-count')).toBe('3');
      expect(second.response.headers.get('x-total-count')).toBe('3');
      expect(first.body.data).toHaveLength(1);
      expect(second.body.data).toHaveLength(1);
      expect(first.body.data[0].id).not.toBe(second.body.data[0].id);
    } finally {
      await db.query('DELETE FROM assets WHERE code LIKE $1', [`R2P-ASSET-${tag}-%`]);
    }
  });

  test('every mounted GET route returns no 500 for an owner with typical params', async () => {
    // Use the server mount declarations to retain literal prefixes, then inspect
    // the actual router stacks so new GET registrations are included automatically.
    const source = fs.readFileSync(path.resolve(__dirname, '../../../server.js'), 'utf8');
    const mounts = [...source.matchAll(/app\.use\('([^']+)', require\('([^']+)'\)(\.buildV1Router\(\))?\);/g)];
    const routes = [];
    const walk = (stack, prefix) => {
      for (const layer of stack) {
        if (layer.route && layer.route.methods.get) {
          for (const route of [layer.route.path].flat()) routes.push(prefix + (route === '/' ? '' : route));
        } else if (layer.handle && layer.handle.stack) {
          if (layer.regexp.fast_slash) { walk(layer.handle.stack, prefix); continue; }
          const mount = layer.regexp.source.match(/^\^\\\/(.*?)\\\/\?\(\?=/);
          if (!mount) throw new Error(`Unsupported nested router mount: ${layer.regexp.source}`);
          walk(layer.handle.stack, prefix + '/' + mount[1].replace(/\\\//g, '/'));
        }
      }
    };
    for (const [, prefix, module, build] of mounts) {
      const exported = require(path.resolve(__dirname, '../../..', module));
      walk((build ? exported.buildV1Router() : exported).stack, prefix);
    }
    routes.push('/api/health');
    expect(routes.length).toBeGreaterThan(300);
    const failures = [];
    for (const route of new Set(routes)) {
      const concrete = route.replace(/:project_?id\b/gi, String(project.id))
        .replace(/:date\b/g, '2026-10-14').replace(/:\w+(?:\([^)]*\))?\??/g, '99999999');
      const status = await call(concrete);
      if (status >= 500) failures.push(`${route}: ${status}`);
    }
    if (failures.length) console.log(`R0.2 failing routes: ${failures.join(', ')}`);
    console.log(`R0.2 GET inventory: ${new Set(routes).size} routes, ${failures.length} server failures`);
    expect(failures).toEqual([]);
  }, 180000);
});
