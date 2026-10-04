// Real PostgreSQL. Closeout B7 — the API half of the navigation-visibility tests, ACTIVE now.
//
// Phase 6 rule: hiding a tab is presentation only; the backend policy is the enforcement point.
// This suite pins the enforcement half for every role the seed can already express: a group the
// Phase 6 matrix hides for a role is dead at the API for that role (403 / scoped out), for every
// representative endpoint of the group, on the internal surface.
//
// PENDING (activated in Part D after 5.1): the RENDERING half — the six-group project page shows
// exactly each role's groups (Phase 6 reference) — and the FULL role → group matrix for the
// remaining internal roles, whose blanket ('*','*') grants 5.1 will replace with real per-module
// grants. Note for whoever flips this after 5.1: the BLOCKET_ROLE list below is exactly "roles
// with a wildcard grant today"; when the wildcard migration lands, remove entries from it and add
// the deny assertions with the new grant set.
const tokens = require('../../services/tokens');

process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

// Per the Phase 6 matrix (project-page roles), with today's seed:
//   finance group  (invoices / finance-ledger / payments)
//   procurement group (procurement PRs, commercial, costing)
//   handover group (handover process, assets, warranty claims)
//   documents group for the roles whose grants keep it inside Documents & Reports
const MATRIX = {
  // Explicit-grant internal roles (migration 0006): the API-403 half is provable today.
  site_engineer: {
    denied: [['GET', '/api/invoices'], ['GET', '/api/procurement/pr'], ['GET', '/api/handover/assets'], ['GET', '/api/handover/claims']],
    allowed: [['GET', '/api/projects/:projectId'], ['GET', '/api/boq/items/:projectId'], ['GET', '/api/locations/project/:projectId']],
  },
  storekeeper: {
    denied: [['GET', '/api/invoices'], ['GET', '/api/procurement/pr'], ['GET', '/api/handover/assets'], ['GET', '/api/handover/claims']],
    allowed: [['GET', '/api/projects/:projectId'], ['GET', '/api/warehouses'], ['GET', '/api/items']],
  },
  document_controller: {
    denied: [['GET', '/api/invoices'], ['GET', '/api/procurement/pr'], ['GET', '/api/handover/assets']],
    allowed: [['GET', '/api/projects/:projectId'], ['GET', '/api/docs/documents?project_id=:projectId']],
  },
  quantity_surveyor: {
    denied: [['GET', '/api/handover/assets'], ['GET', '/api/handover/claims']],
    allowed: [['GET', '/api/projects/:projectId'], ['GET', '/api/boq/items/:projectId'], ['GET', '/api/invoices']],
  },
  viewer: {
    denied: [['GET', '/api/invoices'], ['GET', '/api/procurement/pr'], ['GET', '/api/handover/assets'], ['GET', '/api/handover/claims']],
    allowed: [['GET', '/api/projects/:projectId']],
  },
  // External roles: portal only — the project page itself is not in their scope either
  // (decision 7, middleware/auth.js externalPortalAllowed), so it counts as hidden.
  client: {
    denied: [['GET', '/api/projects/:projectId'], ['GET', '/api/invoices'], ['GET', '/api/procurement/pr'], ['GET', '/api/handover/assets'], ['GET', '/api/handover/claims']],
    allowed: [],
  },
  consultant: {
    denied: [['GET', '/api/projects/:projectId'], ['GET', '/api/invoices'], ['GET', '/api/procurement/pr'], ['GET', '/api/handover/assets']],
    allowed: [],
  },
  subcontractor: {
    denied: [['GET', '/api/invoices'], ['GET', '/api/procurement/pr'], ['GET', '/api/handover/assets'], ['GET', '/api/handover/claims']],
    allowed: [],
  },
  // Blanket ('*','*') roles until 5.1 replaces their grants: currently NOT hidden. Pinned as a
  // fixture so the 5.1 switch cannot silently change what these roles see.
  BLOCKED_UNTIL_5_1: ['owner', 'admin', 'manager', 'staff', 'engineer', 'accountant', 'finance_manager', 'purchasing_mgr', 'project_manager', 'site_supervisor', 'legal_mgr', 'maintenance_mgr'],
};

describePg('B7 navigation visibility: hidden group ⇒ API 403 for that role (internal surface)', () => {
  let app; let server; let base; let db; let project;
  const tag = String(Date.now()).slice(-7);
  const created = [];
  let day = 0;

  const call = async (method, path, token) => {
    const res = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
    let json = null;
    try { json = await res.json(); } catch (e) { /* empty */ }
    return { status: res.status, body: json };
  };

  const tokenFor = async (roleKey) => {
    const email = `b7-nav-${roleKey}-${++day}-${tag}@test.io`;
    const row = (await db.query(
      "INSERT INTO users (name, email, password, role) VALUES ($1, $2, 'x', $3) RETURNING id, token_version",
      [`b7-${roleKey}`, email, roleKey]
    )).rows[0];
    created.push(email);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, $2, id FROM roles WHERE key = $3", [row.id, project.id, roleKey]);
    return tokens.signSession({ userId: row.id, tokenVersion: row.token_version });
  };

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    project = (await db.query("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`b7-nav-${tag}`, `B7${tag}`.slice(0, 20)])).rows[0];
  });

  afterAll(async () => {
    await db.query('UPDATE users SET is_active = false WHERE email = ANY($1)', [created]);
    await db.query("DELETE FROM user_project_roles WHERE project_id = $1", [project.id]);
    await db.query('DELETE FROM projects WHERE id = $1', [project.id]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('blanket-role fixture: until 5.1 removes the wildcard grants, these roles are NOT 403 on the finance endpoints', async () => {
    const wrong = [];
    for (const roleKey of MATRIX.BLOCKED_UNTIL_5_1) {
      const token = await tokenFor(roleKey);
      const res = await call('GET', '/api/invoices', token);
      if (res.status >= 400) wrong.push(`${roleKey} → ${res.status}`);
    }
    expect(wrong).toEqual([]);
  });

  for (const [roleKey, { denied, allowed }] of Object.entries(MATRIX)) {
    if (typeof denied !== 'object') continue;
    describe(roleKey, () => {
      for (const [method, path] of denied) {
        test(`403 (hidden): ${method} ${path}`, async () => {
          const token = await tokenFor(roleKey);
          const res = await call(method, path.replace(':projectId', project.id), token);
          expect([403, 404, 401]).toContain(res.status);
          // The record-scope layer may answer 404 (scoped out) rather than 403 — never 2xx.
        });
      }
      for (const [method, path] of allowed) {
        test(`200-3xx (visible): ${method} ${path}`, async () => {
          const token = await tokenFor(roleKey);
          const res = await call(method, path.replace(':projectId', project.id), token);
          expect(res.status).toBeLessThan(400);
        });
      }
    });
  }

  test('rendering half of navigation visibility: PENDING Phase 6 (part D 6.4) — placeholder recorded explicitly', () => {
    expect(true).toBe(true);
  });
});
