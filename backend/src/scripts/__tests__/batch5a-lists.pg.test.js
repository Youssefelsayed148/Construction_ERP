const fs = require('fs');
const path = require('path');
const tokens = require('../../services/tokens');
const policy = require('../../services/policy');
const { mountedRoutes } = require('../batch5a-route-inventory');
const describePg = process.env.TEST_PG === '1' ? describe : describe.skip;

describePg('S-006 RFQ pagination and complete GET route inventory', () => {
  let db; let server; let base; let project; let owner; let scoped;
  const tag = `${Date.now()}-${process.pid}`;
  async function call(route, user = owner) {
    const response = await fetch(base + route, { headers: { Authorization: `Bearer ${user.token}` }, signal: AbortSignal.timeout(10000) });
    const text = await response.text(); let body;
    try { body = JSON.parse(text); } catch (_) { body = null; }
    return { status: response.status, total: response.headers.get('x-total-count'), body };
  }
  beforeAll(async () => {
    db = require('../../config/database');
    const { app } = require('../../../server');
    for (const suffix of ['own', 'foreign']) {
      const row = (await db.query("INSERT INTO projects (name,code,status) VALUES ($1,$1,'active') RETURNING id", [`S006-${tag}-${suffix}`])).rows[0];
      if (suffix === 'own') project = row;
      for (let index = 0; index < 3; index++) await db.query("INSERT INTO rfqs (rfq_number,project_id,title,status) VALUES ($1,$2,$1,'draft')", [`S006-${tag}-${suffix}-${index}`, row.id]);
    }
    for (const role of ['owner', 'procurement_manager']) {
      const user = (await db.query("INSERT INTO users (name,email,password,role) VALUES ('S006',$1,'unused',$2) RETURNING id,token_version", [`s006-${tag}-${role}@test.invalid`, role])).rows[0];
      await db.query('INSERT INTO user_project_roles (user_id,project_id,role_id) SELECT $1,$2,id FROM roles WHERE key=$3', [user.id, role === 'owner' ? null : project.id, role]);
      user.token = tokens.signSession({ userId: user.id, tokenVersion: user.token_version });
      if (role === 'owner') owner = user; else scoped = user;
    }
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (db) await db.pool.end(); });
  test.each(['owner', 'project seat'])('%s RFQs carry exact scoped totals, no overlap, empty-page totals and status filters', async seat => {
    const user = seat === 'owner' ? owner : scoped;
    const route = `/api/procurement/rfq?project_id=${project.id}`;
    const first = await call(`${route}&limit=1&offset=0`, user);
    const second = await call(`${route}&limit=1&offset=1`, user);
    expect(first.status).toBe(200); expect(second.status).toBe(200);
    expect(first.total).toBe('3'); expect(second.total).toBe('3');
    expect(first.body.data).toHaveLength(1); expect(second.body.data).toHaveLength(1);
    expect(first.body.data[0].id).not.toBe(second.body.data[0].id);
    const empty = await call(`${route}&limit=1&offset=99`, user);
    expect(empty.body.data).toEqual([]); expect(empty.total).toBe('3');
    const filtered = await call(`${route}&status=issued`, user);
    expect(filtered.body.data).toEqual([]); expect(filtered.total).toBe('0');
    if (seat !== 'owner') {
      const implicit = await call('/api/procurement/rfq?limit=1000', user);
      expect(implicit.total).toBe('3');
      expect(implicit.body.data.every(row => row.project_id === project.id)).toBe(true);
    }
  });
  test('inventories every mounted GET, including all observed list responses and absent headers', async () => {
    const routes = mountedRoutes().filter(row => row.method === 'GET');
    routes.push({ method: 'GET', path: '/api/health', prefix: '/api', route: '/health', handlers: [], file: './server' });
    const rows = []; const failures = [];
    for (const route of routes) {
      const concrete = route.path.replace(/:project_?id\b/gi, String(project.id))
        .replace(/:reportKey\b/g, 'projects').replace(/:date\b/g, '2026-10-17').replace(/:\w+(?:\([^)]*\))?\??/g, '99999999');
      const result = await call(`${concrete}?project_id=${project.id}&limit=1&offset=0`);
      if (result.status >= 500) failures.push(`${route.path}: ${result.status}`);
      const source = route.handlers.map(handler => handler.toString()).join('\n');
      const data = result.body?.data;
      const arrays = Array.isArray(data) ? 'data[]' : data && typeof data === 'object'
        ? Object.entries(data).filter(([, value]) => Array.isArray(value)).map(([key]) => `data.${key}[]`).join(', ') : '';
      const declared = /queryPaginated|paginateRows/.test(source) ? 'shared pagination' : /listFamily|normalizeResponses/.test(source) || route.prefix === '/api/v1' ? 'v1 envelope' : /list[A-Z]/.test(source) ? 'service list; inspect service' : 'handler-specific';
      const req = { baseUrl: route.prefix, route: { path: route.route }, method: 'GET' };
      const module = policy.effectiveModule(req, policy.moduleFromRequest(req));
      rows.push(`| ${route.path} | ${module} | ${declared} | ${result.status} | ${arrays || 'no array observed'} | ${result.total ?? 'ABSENT'} |`);
    }
    console.log(`S006 full GET table: ${routes.length} routes; server failures=${failures.length}`);
    expect(routes.length).toBeGreaterThan(400); expect(failures).toEqual([]);
    if (process.env.BATCH5A_WRITE_REPORTS === '1') fs.writeFileSync(path.resolve(__dirname, '../../../../docs/BATCH_5A_LIST_ROUTE_TABLE.md'),
      '# Batch 5A complete list-route inspection table\n\nEvery mounted GET is included (including non-list, missing-record, denied, aggregate and file responses) so the collection inventory cannot silently omit a route. Fresh throwaway DB, owner seat, explicit fixture project, limit=1/offset=0; unknown record IDs use a missing sentinel. Effective module is shown; regular authenticated GETs use request-local projectReadScope before aggregation, and v1 resources use their policy expression. This table records actual response shape and X-Total-Count, not assumed completeness from samples. ABSENT on an observed array is an open pagination-contract gap outside the RFQ fix; ABSENT on non-lists does not imply a defect. Missing-record/denied rows require endpoint fixtures for list behavior. Exact offset/no-overlap/SQL total verification for RFQs is in batch5a-lists.pg.test.js; existing get-routes.pg.test.js covers the earlier families.\n\n| GET route | Effective module | Pagination declaration | HTTP | Observed array fields | X-Total-Count |\n|---|---|---|---|---|---|\n' + rows.join('\n') + '\n');
  }, 180000);
});
