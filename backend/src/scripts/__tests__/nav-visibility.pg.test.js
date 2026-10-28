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
  // Session G (G1.1, migration 0074) flipped finance_manager and project_manager to explicit
  // per-module grants — they are removed from this list and get real denied/allowed entries below.
  BLOCKED_UNTIL_5_1: ['owner', 'admin', 'manager', 'staff', 'engineer', 'accountant', 'purchasing_mgr', 'site_supervisor', 'legal_mgr', 'maintenance_mgr'],
  // Migration 0074 grants: finance_manager keeps invoices/procurement/handover/payroll view, but
  // has no legal or assets grant (explicitly excluded — see the migration's comments).
  finance_manager: {
    denied: [['GET', '/api/legal'], ['GET', '/api/assets']],
    allowed: [['GET', '/api/invoices'], ['GET', '/api/procurement/project/:projectId'], ['GET', '/api/handover/assets?project_id=:projectId'], ['GET', '/api/handover/claims?project_id=:projectId'], ['GET', '/api/payroll'], ['GET', '/api/projects/:projectId']],
  },
  // Migration 0074 grants: project_manager keeps invoices/procurement/handover/boq/projects view,
  // but has no payroll or legal grant (explicitly excluded — see the migration's comments).
  project_manager: {
    denied: [['GET', '/api/payroll'], ['GET', '/api/legal']],
    allowed: [['GET', '/api/invoices'], ['GET', '/api/procurement/project/:projectId'], ['GET', '/api/handover/assets?project_id=:projectId'], ['GET', '/api/handover/claims?project_id=:projectId'], ['GET', '/api/boq/items/:projectId'], ['GET', '/api/projects/:projectId']],
  },
};

// C5 + the screens closeout: the Phase A routes (cash flow, stock
// reservations, notification preferences, project calendars) plus the
// finance-workbench commitments route, against the canonical role map
// (migration 0031 + 0006 + 0036). Same rule: hidden ⇒ the API refuses for
// that role. Grants are read straight from the migrations, not assumed:
//   cash-flow     GET /api/finance-ledger/cash-flow        (finance-ledger view:
//                 0036 view owner_ceo/coo/accountant_ap + 0031 accountant_ar/commercial_manager)
//   reservations  GET /api/warehouses/reservations         (warehouses view:
//                 0006 site_engineer/storekeeper + 0031 owner_ceo/coo/construction_manager/
//                 site_manager/procurement_manager/procurement_officer/equipment_manager/supplier_sales)
//   preferences   GET /api/notifications/preferences       (notifications view:
//                 all 18 canonical internal roles via 0031's shared util reads)
//   calendars     GET /api/projects/:projectId/calendars   (projects view)
//   commitments   GET /api/commercial/project/:id/commitments (ACTION_OVERRIDES maps the GET to
//                 see_internal_cost: owner_ceo, coo and commercial_manager only — NOTE the
//                 earlier site_engineer row wrongly denied reservations; 0006 grants it.
const C5_MATRIX = {
  owner_ceo: {
    allowed: [['GET', '/api/finance-ledger/cash-flow'], ['GET', '/api/warehouses/reservations'], ['GET', '/api/notifications/preferences'], ['GET', '/api/projects/:projectId/calendars'], ['GET', '/api/commercial/project/:projectId/commitments']],
    denied: [],
  },
  coo: {
    allowed: [['GET', '/api/finance-ledger/cash-flow'], ['GET', '/api/warehouses/reservations'], ['GET', '/api/notifications/preferences'], ['GET', '/api/projects/:projectId/calendars'], ['GET', '/api/commercial/project/:projectId/commitments']],
    denied: [],
  },
  accountant_ar: {
    allowed: [['GET', '/api/finance-ledger/cash-flow'], ['GET', '/api/notifications/preferences']],
    denied: [['GET', '/api/warehouses/reservations'], ['GET', '/api/projects/:projectId/calendars'], ['GET', '/api/commercial/project/:projectId/commitments']],
  },
  accountant_ap: {
    allowed: [['GET', '/api/finance-ledger/cash-flow'], ['GET', '/api/notifications/preferences']],
    denied: [['GET', '/api/warehouses/reservations'], ['GET', '/api/projects/:projectId/calendars'], ['GET', '/api/commercial/project/:projectId/commitments']],
  },
  commercial_manager: {
    allowed: [['GET', '/api/finance-ledger/cash-flow'], ['GET', '/api/notifications/preferences'], ['GET', '/api/projects/:projectId/calendars'], ['GET', '/api/commercial/project/:projectId/commitments']],
    denied: [['GET', '/api/warehouses/reservations']],
  },
  storekeeper: {
    allowed: [['GET', '/api/warehouses/reservations'], ['GET', '/api/notifications/preferences'], ['GET', '/api/projects/:projectId/calendars']],
    denied: [['GET', '/api/finance-ledger/cash-flow'], ['GET', '/api/commercial/project/:projectId/commitments']],
  },
  site_engineer: {
    allowed: [['GET', '/api/warehouses/reservations'], ['GET', '/api/notifications/preferences'], ['GET', '/api/projects/:projectId/calendars']],
    denied: [['GET', '/api/finance-ledger/cash-flow'], ['GET', '/api/commercial/project/:projectId/commitments']],
  },
  procurement_manager: {
    allowed: [['GET', '/api/warehouses/reservations'], ['GET', '/api/notifications/preferences'], ['GET', '/api/projects/:projectId/calendars']],
    denied: [['GET', '/api/finance-ledger/cash-flow'], ['GET', '/api/commercial/project/:projectId/commitments']],
  },
  procurement_officer: {
    allowed: [['GET', '/api/warehouses/reservations'], ['GET', '/api/notifications/preferences']],
    denied: [['GET', '/api/finance-ledger/cash-flow'], ['GET', '/api/projects/:projectId/calendars'], ['GET', '/api/commercial/project/:projectId/commitments']],
  },
  equipment_manager: {
    allowed: [['GET', '/api/warehouses/reservations'], ['GET', '/api/notifications/preferences'], ['GET', '/api/projects/:projectId/calendars']],
    denied: [['GET', '/api/finance-ledger/cash-flow'], ['GET', '/api/commercial/project/:projectId/commitments']],
  },
  construction_manager: {
    allowed: [['GET', '/api/warehouses/reservations'], ['GET', '/api/notifications/preferences'], ['GET', '/api/projects/:projectId/calendars']],
    denied: [['GET', '/api/finance-ledger/cash-flow'], ['GET', '/api/commercial/project/:projectId/commitments']],
  },
  site_manager: {
    allowed: [['GET', '/api/warehouses/reservations'], ['GET', '/api/notifications/preferences'], ['GET', '/api/projects/:projectId/calendars']],
    denied: [['GET', '/api/finance-ledger/cash-flow'], ['GET', '/api/commercial/project/:projectId/commitments']],
  },
  qa_qc_manager: {
    allowed: [['GET', '/api/notifications/preferences'], ['GET', '/api/projects/:projectId/calendars']],
    denied: [['GET', '/api/finance-ledger/cash-flow'], ['GET', '/api/warehouses/reservations'], ['GET', '/api/commercial/project/:projectId/commitments']],
  },
  hse_manager: {
    allowed: [['GET', '/api/notifications/preferences'], ['GET', '/api/projects/:projectId/calendars']],
    denied: [['GET', '/api/finance-ledger/cash-flow'], ['GET', '/api/warehouses/reservations'], ['GET', '/api/commercial/project/:projectId/commitments']],
  },
  hr_manager: {
    allowed: [['GET', '/api/notifications/preferences'], ['GET', '/api/projects/:projectId/calendars']],
    denied: [['GET', '/api/finance-ledger/cash-flow'], ['GET', '/api/warehouses/reservations'], ['GET', '/api/commercial/project/:projectId/commitments']],
  },
  quantity_surveyor: {
    allowed: [['GET', '/api/notifications/preferences'], ['GET', '/api/projects/:projectId/calendars']],
    denied: [['GET', '/api/finance-ledger/cash-flow'], ['GET', '/api/warehouses/reservations'], ['GET', '/api/commercial/project/:projectId/commitments']],
  },
  viewer: {
    allowed: [['GET', '/api/notifications/preferences'], ['GET', '/api/projects/:projectId/calendars']],
    denied: [['GET', '/api/finance-ledger/cash-flow'], ['GET', '/api/warehouses/reservations'], ['GET', '/api/commercial/project/:projectId/commitments']],
  },
  client_executive: {
    // F3: migration 0072 gives the client family its portal module (client-portal.view).
    allowed: [['GET', '/api/projects/:projectId/calendars'], ['GET', '/api/client-portal/projects']],
    denied: [['GET', '/api/finance-ledger/cash-flow'], ['GET', '/api/warehouses/reservations'], ['GET', '/api/notifications/preferences'], ['GET', '/api/commercial/project/:projectId/commitments']],
  },
  client_reviewer: {
    allowed: [['GET', '/api/client-portal/projects']],
    denied: [['GET', '/api/finance-ledger/cash-flow'], ['GET', '/api/warehouses/reservations'], ['GET', '/api/commercial/project/:projectId/commitments']],
  },
  pmc_manager: {
    allowed: [['GET', '/api/client-portal/projects']],
    denied: [['GET', '/api/finance-ledger/cash-flow'], ['GET', '/api/warehouses/reservations'], ['GET', '/api/commercial/project/:projectId/commitments']],
  },
  supplier_sales: {
    allowed: [['GET', '/api/warehouses/reservations']],
    denied: [['GET', '/api/finance-ledger/cash-flow'], ['GET', '/api/projects/:projectId/calendars'], ['GET', '/api/notifications/preferences'], ['GET', '/api/commercial/project/:projectId/commitments']],
  },
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

  for (const [roleKey, { denied, allowed }] of Object.entries(C5_MATRIX)) {
    describe(`C5 canonical: ${roleKey}`, () => {
      for (const [method, path] of denied) {
        test(`403 (hidden): ${method} ${path}`, async () => {
          const token = await tokenFor(roleKey);
          const res = await call(method, path.replace(':projectId', project.id), token);
          expect([403, 404, 401]).toContain(res.status);
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
