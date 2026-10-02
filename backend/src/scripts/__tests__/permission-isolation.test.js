// Phase 4 mandatory isolation tests.
//
// Definition of done: automated tests prove every external-facing route in
// the 28 route files returns 403 (not empty data) when called by a role that
// should not see it.
//
// The harness loads each real route file, extracts its real authorize()
// middleware from the Express route stack, and simulates requests with
// stubbed policy rows (jest.mock of config/database — no live DB needed).

process.env.JWT_SECRET = process.env.JWT_SECRET || 'isolation-test-secret';

jest.mock('../../config/database', () => ({
  query: jest.fn(),
  pool: {},
  transaction: jest.fn(),
  healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' }),
}));

const { query } = require('../../config/database');

const ROUTE_FILES = [
  'activity', 'approvals', 'assets', 'auth', 'boq', 'clients', 'costing',
  'dashboard', 'doccontrol', 'documents', 'expenses', 'finance', 'hr',
  'invoices', 'items', 'legal', 'maintenance', 'payments', 'payroll',
  'projects', 'qhse', 'site', 'subcontractors', 'suppliers', 'units',
  'users', 'warehouses', 'workorders',
];

// Express mount paths (server.js) — site.js mounts under /api/projects,
// doccontrol under /api/docs, workorders under /api/work-orders,
// units under /api/sales.
const FILE_MOUNT = {
  activity: '/api/activity',
  approvals: '/api/approvals',
  assets: '/api/assets',
  auth: '/api/auth',
  boq: '/api/boq',
  clients: '/api/clients',
  costing: '/api/costing',
  dashboard: '/api/dashboard',
  doccontrol: '/api/docs',
  documents: '/api/documents',
  expenses: '/api/expenses',
  finance: '/api/finance',
  hr: '/api/hr',
  invoices: '/api/invoices',
  items: '/api/items',
  legal: '/api/legal',
  maintenance: '/api/maintenance',
  payments: '/api/payments',
  payroll: '/api/payroll',
  projects: '/api/projects',
  qhse: '/api/qhse',
  site: '/api/projects',
  subcontractors: '/api/subcontractors',
  suppliers: '/api/suppliers',
  units: '/api/sales',
  users: '/api/users',
  warehouses: '/api/warehouses',
  workorders: '/api/work-orders',
};

// External roles and their seeded module view grants (policy-migration.js).
const EXTERNAL_GRANTS = {
  consultant: ['projects', 'boq', 'qhse', 'docs', 'work-orders', 'documents'],
  client: ['projects', 'docs', 'qhse', 'boq'],
  subcontractor: ['subcontractors'],
  supplier: ['items', 'warehouses'],
};

const EXTERNAL_USERS = {
  consultant: { id: 4, email: 'consult@x.com', name: 'Consult', role: 'consultant' },
  client: { id: 5, email: 'client@x.com', name: 'Client', role: 'client' },
  subcontractor: { id: 6, email: 'sub@x.com', name: 'Sub', role: 'subcontractor' },
  supplier: { id: 8, email: 'supplier@x.com', name: 'Supplier Co', role: 'supplier' },
};

// Each external user is bound to exactly one project (rows project-bound,
// no company-wide row) — project 1 for consultant, project 7 for the rest.
const USER_PROJECT = { consultant: 1, client: 7, subcontractor: 7, supplier: 7 };

const UNASSIGNED_PROJECT = 999;

function policyRowsFor(role) {
  const pid = USER_PROJECT[role];
  const rows = [];
  for (const module of EXTERNAL_GRANTS[role]) {
    rows.push({ role_key: role, project_id: pid, organization_id: 100, perm_module: module, perm_action: 'view' });
  }
  const flags = { client: 'see_client_value', subcontractor: 'see_subcontract_value' }[role];
  if (flags) {
    rows.push({ role_key: role, project_id: pid, organization_id: 100, perm_module: '*', perm_action: flags });
  }
  return rows;
}

beforeAll(() => {
  query.mockImplementation(async (sql, params) => {
    if (/FROM\s+user_project_roles/i.test(sql)) {
      // User 3 is an internal site_supervisor with the seeded company-wide grant.
      if (params[0] === 3) return { rows: [{ role_key: 'site_supervisor', project_id: null, organization_id: null, perm_module: '*', perm_action: '*' }] };
      const role = { 4: 'consultant', 5: 'client', 6: 'subcontractor', 8: 'supplier' }[params[0]];
      return { rows: role ? policyRowsFor(role) : [] };
    }
    if (/FROM\s+roles/i.test(sql)) return { rows: [] };
    if (/INSERT INTO\s+audit_events/i.test(sql)) return { rows: [{ id: 1 }] };
    return { rows: [] };
  });
});

// ---------------------------------------------------------------------------
// Harness: load real routers, run their real authorize middleware
// ---------------------------------------------------------------------------

function loadRoutes(file) {
  const router = require(`../../routes/${file}`);
  const layers = router.stack.filter((l) => l.route);
  return layers.map((l) => ({
    file,
    path: l.route.path,
    methods: Object.keys(l.route.methods),
    authorizeMws: l.route.stack
      .map((s) => s.handle)
      .filter((h) => typeof h === 'function' && h.name === 'authorizeMiddleware'),
  }));
}

async function runAuthorize(mw, user, { method = 'GET', baseUrl, params = {}, query: q = {} } = {}) {
  const req = { user, method, baseUrl, params, query: q, headers: {} };
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  const next = jest.fn();
  await mw(req, res, next);
  return { req, res, next };
}

const allRoutes = [];
for (const file of ROUTE_FILES) {
  for (const route of loadRoutes(file)) {
    allRoutes.push({ ...route, file });
  }
}

// ---------------------------------------------------------------------------
// Mandatory isolation tests (requirement 7)
// ---------------------------------------------------------------------------

describe('mandatory isolation: consultant vs /costing and /finance', () => {
  const consultant = EXTERNAL_USERS.consultant;
  const targetRoutes = allRoutes.filter((r) => ['costing', 'finance'].includes(r.file));

  test('costing.js and finance.js expose guarded routes', () => {
    expect(targetRoutes.length).toBe(6); // 4 costing + 2 finance
  });

  test.each(targetRoutes)(
    '$file $methods / $path returns 403, not empty data, for a consultant',
    async (route) => {
      expect(route.authorizeMws.length).toBeGreaterThan(0);
      const { res, next } = await runAuthorize(route.authorizeMws[0], consultant, {
        method: route.methods[0].toUpperCase(),
        baseUrl: FILE_MOUNT[route.file],
        params: { projectId: USER_PROJECT.consultant, id: USER_PROJECT.consultant },
      });
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
      expect(next).not.toHaveBeenCalled();
    }
  );

  test('even a consultant assigned to the project is denied internal cost endpoints', async () => {
    const costingProject = allRoutes.find((r) => r.file === 'costing' && r.path === '/project/:projectId');
    const { res } = await runAuthorize(costingProject.authorizeMws[0], consultant, {
      method: 'GET',
      baseUrl: '/api/costing',
      params: { projectId: 1 },
    });
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('external portal path boundary', () => {
  const { externalPortalAllowed } = require('../../middleware/auth');
  test.each([
    ['consultant', '/api/consultant/dashboard'],
    ['client', '/api/client-portal/dashboard'],
    ['subcontractor', '/api/portal/subcontractor/dashboard'],
    ['supplier', '/api/portal/supplier/dashboard'],
  ])('%s can reach only its portal prefix', (role, path) => {
    expect(externalPortalAllowed({ user: { role }, originalUrl: path, method: 'GET' })).toBe(true);
    expect(externalPortalAllowed({ user: { role }, originalUrl: '/api/projects/1', method: 'GET' })).toBe(false);
    expect(externalPortalAllowed({ user: { role }, originalUrl: path.replace('/dashboard', '') + '-other', method: 'GET' })).toBe(false);
  });
  test('external upload is limited to POST /api/documents/upload', () => {
    const user = { role: 'supplier' };
    expect(externalPortalAllowed({ user, originalUrl: '/api/documents/upload', method: 'POST' })).toBe(true);
    expect(externalPortalAllowed({ user, originalUrl: '/api/documents/upload', method: 'GET' })).toBe(false);
    expect(externalPortalAllowed({ user, originalUrl: '/api/documents/upload/1', method: 'POST' })).toBe(false);
  });
});

describe('mandatory isolation: client vs subcontractor/supplier rates', () => {
  const client = EXTERNAL_USERS.client;
  const targetRoutes = allRoutes.filter((r) => ['subcontractors', 'suppliers'].includes(r.file));

  test.each(targetRoutes)(
    '$file $methods / $path returns 403 for a client-role user',
    async (route) => {
      expect(route.authorizeMws.length).toBeGreaterThan(0);
      const { res, next } = await runAuthorize(route.authorizeMws[0], client, {
        method: route.methods[0].toUpperCase(),
        baseUrl: FILE_MOUNT[route.file],
        params: { projectId: 7, id: 7, contractId: 7 },
      });
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    }
  );
});

describe('mandatory isolation: external user cannot ID-guess unassigned projects', () => {
  test.each(Object.entries(EXTERNAL_USERS))(
    '%s assigned to project %s fails closed on /api/projects/:id for an unassigned project',
    async (role, user) => {
      const getProject = allRoutes.find((r) => r.file === 'projects' && r.path === '/:id');
      const assigned = await runAuthorize(getProject.authorizeMws[0], user, {
        method: 'GET',
        baseUrl: '/api/projects',
        params: { id: USER_PROJECT[role] },
      });
      const guessed = await runAuthorize(getProject.authorizeMws[0], user, {
        method: 'GET',
        baseUrl: '/api/projects',
        params: { id: UNASSIGNED_PROJECT },
      });
      // External identities use their scoped portal, even for an assigned project.
      expect(assigned.res.status).toHaveBeenCalledWith(403);
      expect(guessed.res.status).toHaveBeenCalledWith(403);
      expect(guessed.next).not.toHaveBeenCalled();
    }
  );

  test.each(Object.entries(EXTERNAL_USERS))(
    '%s also fails closed on project-scoped sub-endpoints of another project',
    async (role, user) => {
      const subRoutes = allRoutes.filter((r) => r.file === 'site' && r.path.includes(':projectId'));
      expect(subRoutes.length).toBeGreaterThan(0);
      for (const route of subRoutes) {
        const { res, next } = await runAuthorize(route.authorizeMws[0], user, {
          method: 'GET',
          baseUrl: '/api/projects',
          params: { projectId: UNASSIGNED_PROJECT },
        });
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
      }
    }
  );
});

// ---------------------------------------------------------------------------
// Definition-of-done sweep: every route × every external role
// ---------------------------------------------------------------------------

describe('DoD sweep: external roles get 403 (not empty data) on routes they must not see', () => {
  test('all 28 route files loaded with guarded routes', () => {
    const files = new Set(allRoutes.map((r) => r.file));
    expect(files.size).toBe(ROUTE_FILES.length);
    for (const route of allRoutes) {
      // auth /login is the single public route (no authenticate → no guard).
      if (route.file === 'auth' && route.path === '/login') continue;
      expect(route.authorizeMws.length).toBeGreaterThan(0);
    }
  });

  test.each(allRoutes)('$file $methods / $path', async (route) => {
    if (route.file === 'auth' && route.path === '/login') return;
    for (const [role, user] of Object.entries(EXTERNAL_USERS)) {
      const method = route.methods[0].toUpperCase();
      const mount = FILE_MOUNT[route.file];
      const mustDeny = true; // Raw internal modules are unavailable to external identities.
      // Only pass path params the route actually declares.
      const paramNames = [...route.path.matchAll(/:(\w+)/g)].map((m) => m[1]);
      const params = {};
      for (const name of paramNames) params[name] = UNASSIGNED_PROJECT;
      const { res, next } = await runAuthorize(route.authorizeMws[0], user, {
        method,
        baseUrl: mount,
        params,
      });
      if (mustDeny) {
        expect(`${role} ${method} ${route.path} => ${res.status.mock.calls[0]}`).toEqual(
          `${role} ${method} ${route.path} => 403`
        );
        expect(next).not.toHaveBeenCalled();
      } else {
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Positive controls: internal roles keep their access (parity)
// ---------------------------------------------------------------------------

describe('positive controls: internal roles are unaffected', () => {
  const internalUser = { id: 3, email: 'super@x.com', name: 'Super', role: 'site_supervisor' };

  test('site_supervisor with a company-wide row can still view costing (parity)', async () => {
    const route = allRoutes.find((r) => r.file === 'costing' && r.path === '/project/:projectId');
    const { next, res } = await runAuthorize(route.authorizeMws[0], internalUser, {
      method: 'GET',
      baseUrl: '/api/costing',
      params: { projectId: 5 },
    });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('owner|admin-only call sites still exclude internal non-admin roles (coarse filter)', async () => {
    const route = allRoutes.find((r) => r.file === 'users' && r.path === '/');
    const { res, next } = await runAuthorize(route.authorizeMws[0], internalUser, {
      method: 'GET',
      baseUrl: '/api/users',
    });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('a user without user_project_roles rows is denied (no legacy fallback)', async () => {
    query.mockImplementationOnce(async (sql) => {
      if (/FROM\s+user_project_roles/i.test(sql)) return { rows: [] };
      return { rows: [] };
    });
    const route = allRoutes.find((r) => r.file === 'costing' && r.path === '/project/:projectId');
    const legacyStaff = { id: 77, email: 'old@x.com', name: 'Old', role: 'staff' };
    const { res, next } = await runAuthorize(route.authorizeMws[0], legacyStaff, {
      method: 'GET',
      baseUrl: '/api/costing',
      params: { projectId: 5 },
    });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('a client with no role rows is denied the users endpoint', async () => {
    const route = allRoutes.find((r) => r.file === 'users' && r.path === '/');
    const legacyClient = { id: 78, email: 'oldc@x.com', name: 'OldC', role: 'client' };
    const { res, next } = await runAuthorize(route.authorizeMws[0], legacyClient, {
      method: 'GET',
      baseUrl: '/api/users',
    });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Preview-as-role demo mode
// ---------------------------------------------------------------------------

describe('preview-as-role demo mode', () => {
  const { authenticate, createPreviewToken } = require('../../middleware/auth');
  const jwt = require('jsonwebtoken');

  function runAuth(req) {
    return new Promise((resolve) => {
      let settled = false;
      const out = { req, res: null, next: null };
      out.res = {
        status: jest.fn(() => out.res),
        json: jest.fn(() => { if (!settled) { settled = true; resolve(out); } return out.res; }),
      };
      out.next = jest.fn(() => { if (!settled) { settled = true; resolve(out); } });
      authenticate(req, out.res, out.next).catch((e) => { if (!settled) { settled = true; resolve({ error: e }); } });
    });
  }

  const adminUser = { id: 1, email: 'admin@x.com', name: 'Admin', role: 'owner', department: null, is_active: true };

  beforeAll(() => {
    query.mockImplementation(async (sql) => {
      if (/FROM\s+users/i.test(sql)) return { rows: [adminUser] };
      if (/INSERT INTO\s+audit_events/i.test(sql)) return { rows: [{ id: 1 }] };
      return { rows: [] };
    });
  });

  test('issues a read-only preview token that swaps the effective role on GET', async () => {
    const token = createPreviewToken({ user: adminUser, role: 'consultant' });
    const { req, next } = await runAuth({
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(next).toHaveBeenCalled();
    expect(req.user.role).toBe('consultant');
    expect(req.user.id).toBe(1);
    expect(req.preview).toEqual(expect.objectContaining({ read_only: true, role: 'consultant', actor_id: 1 }));
  });

  test('preview tokens are read-only: writes are rejected before handlers run', async () => {
    const token = createPreviewToken({ user: adminUser, role: 'project_manager' });
    const { res, next } = await runAuth({
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Preview mode is read-only' }));
  });

  test('preview decisions are evaluated as the previewed role', async () => {
    const policy = require('../../services/policy');
    const token = createPreviewToken({ user: adminUser, role: 'consultant' });
    const { req } = await runAuth({
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
      baseUrl: '/api/projects',
      params: { projectId: 1 },
      query: {},
    });
    expect(req.user.role).toBe('consultant');
    // Under the consultant matrix, /costing stays denied even in preview.
    const decision = await policy.evaluateRequest(
      { user: { id: 1, role: 'consultant' }, method: 'GET', baseUrl: '/api/costing', params: {}, query: {} },
      { query: async () => ({ rows: policyRowsFor('consultant').map((r) => ({ ...r, project_id: null })) }) }
    );
    expect(decision.allowed).toBe(false);
  });

  test('tampered preview tokens (missing preview claim) authenticate as the real user', async () => {
    const plain = require('../../services/tokens').signSession({ userId: 1 });
    const { req, res, next } = await runAuth({
      method: 'POST',
      headers: { authorization: `Bearer ${plain}` },
    });
    expect(next).toHaveBeenCalled();
    expect(req.user.role).toBe('owner');
    expect(req.preview).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Audit coverage for previews
// ---------------------------------------------------------------------------

describe('preview audit trail', () => {
  test('the preview endpoint inserts an audit_events row with the actor and role', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', '..', 'routes', 'users.js'), 'utf8');
    expect(content).toMatch(/preview_as_role/);
    expect(content).toMatch(/policy\.recordAuditEvent/);
    expect(content).toMatch(/entity:\s*'user'/);
    expect(content).toMatch(/after:\s*\{\s*preview_role:\s*role/);
  });

  test('audit_events has no update/delete helpers exposed by the policy service', () => {
    const policy = require('../../services/policy');
    const mutationHelpers = Object.keys(policy).filter((k) => /^(update|delete|truncate)Audit/i.test(k));
    expect(mutationHelpers).toEqual([]);
  });
});
