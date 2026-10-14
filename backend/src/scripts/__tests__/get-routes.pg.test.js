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
    await result.arrayBuffer();
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
    console.log(`R0.2 GET inventory: ${new Set(routes).size} routes, ${failures.length} server failures`);
    expect(failures).toEqual([]);
  }, 180000);
});
