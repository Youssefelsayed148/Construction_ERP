// Static coverage check for Phase 1.3. Every internal route that takes a record id (not just a project id)
// must resolve the record's project through policy.RECORD_SCOPE_RULES, otherwise a project-bound user can
// reach another project's record by guessing its id. Routes that are not project records are listed with
// the reason; the list may only shrink. When this fails for a new route, add a rule (preferred) or, if the
// record really is company-level, add it here with the reason.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'coverage-test-secret-xxxxxxxxxxxxxxxx';
const fs = require('fs');
const path = require('path');
const policy = require('../../services/policy');

const serverSource = fs.readFileSync(path.join(__dirname, '../../../server.js'), 'utf8');
const mounts = [...serverSource.matchAll(/app\.use\('(\/api\/[\w/-]+)',\s*(?:[\w.]+,\s*)*require\('\.\/src\/routes\/(\w+)'\)/g)]
  .map((m) => ({ mount: m[1], file: m[2] }));

// Company-level records (no project) and portal routes that scope by the caller's own organisation.
const COMPANY_LEVEL = [
  /^\/api\/users\//, /^\/api\/approvals\//, /^\/api\/items\//, /^\/api\/suppliers\//, /^\/api\/clients\//,
  /^\/api\/assets\//, /^\/api\/hr\//, /^\/api\/payroll\//, /^\/api\/notifications\//, /^\/api\/reports\//,
  /^\/api\/subcontractors\/:id/, /^\/api\/projects\/templates\//, /^\/api\/portal\//,
  /^\/api\/finance-ledger\/audit\//, /^\/api\/procurement\/documents\/:kind/,
  // Phase 5.1 (spec 03, 04): the organization surface is company-level BY DESIGN — departments, job
  // positions, delegations, qualifications, bank accounts and organization records are not project
  // data; policy.ORGANIZATION_MODULES pins the same decision. Team JOINs stay project-scoped through
  // the ?project_id= explicit check (the assignment itself is a project record and IS scoped there).
  /^\/api\/organizations\//, /^\/api\/delegations\//, /^\/api\/team\//,
  // Phase 5.3: unit conversions are item-master data (company-wide), not project records.
  /^\/api\/inventory\/conversions\/:id/,
  // Phase 5.5: a payment batch groups payments of several projects; its routes require a company-wide finance
  // grant (companyOnly in routes/financeLedger.js, covered by commercial-5-5.pg.test.js).
  /^\/api\/finance-ledger\/payment-batches\/:id/,
];
// Project-owned records still without a rule. Reviewed, tracked for a later pass; do not add to this list.
const KNOWN_GAPS = new Set([
  'GET /api/dashboard/project/:id', 'GET /api/finance/project/:id',
  'POST /api/qhse/actions/:id/status', 'GET /api/qhse/actions/:id/pdf',
]);

function recordRoutes() {
  const out = [];
  for (const { mount, file } of mounts) {
    const router = require(`../../routes/${file}`);
    const module = mount.replace('/api/', '').split('/')[0];
    for (const layer of router.stack || []) {
      if (!layer.route || typeof layer.route.path !== 'string') continue;
      const routePath = layer.route.path;
      const params = (routePath.match(/:\w+/g) || []).map((p) => p.slice(1)).filter((p) => p !== 'date' && p !== 'action');
      if (params.length === 0) continue;
      if (params.every((p) => /^project_?[iI]d$/.test(p))) continue;
      // On the /api/projects mount a lone :id is the project id itself.
      if (module === 'projects' && params.length === 1 && params[0] === 'id' && /^\/:id(?:\/|$)/.test(routePath)) continue;
      for (const method of Object.keys(layer.route.methods)) {
        out.push({ method: method.toUpperCase(), module, full: `${mount}${routePath}`, routePath });
      }
    }
  }
  return out;
}

describe('record scope coverage', () => {
  const routes = recordRoutes();

  test('the route scan finds the routers', () => {
    expect(routes.length).toBeGreaterThan(150);
  });

  test('every project record route has a scope rule, is company-level, or is a reviewed known gap', () => {
    const unscoped = routes
      .filter((r) => !policy.recordScopeRule({ policyRoute: r.routePath }, r.module))
      .filter((r) => !COMPANY_LEVEL.some((rx) => rx.test(r.full)))
      .map((r) => `${r.method} ${r.full}`)
      .filter((label) => !KNOWN_GAPS.has(label));
    expect(unscoped).toEqual([]);
  });

  test('the known-gap list has no stale entries', () => {
    const live = new Set(routes
      .filter((r) => !policy.recordScopeRule({ policyRoute: r.routePath }, r.module))
      .map((r) => `${r.method} ${r.full}`));
    expect([...KNOWN_GAPS].filter((g) => !live.has(g))).toEqual([]);
  });

  test('rules resolve from the internal route path, so v1 and MCP requests (no req.route) are scoped too', () => {
    const viaPolicyRoute = policy.recordScopeRule({ policyRoute: '/:id' }, 'invoices');
    expect(viaPolicyRoute && viaPolicyRoute[1]).toBe('invoices');
    expect(policy.recordScopeRule({ route: { path: '/:id' } }, 'invoices')[1]).toBe('invoices');
    expect(policy.recordScopeRule({}, 'invoices')).toBeNull();
  });

  test('the agent request rule matches the /api/agent mount', () => {
    expect(policy.moduleFromRequest({ baseUrl: '/api/agent' })).toBe('agent');
    expect(policy.recordScopeRule({ policyRoute: '/requests/:id/decision' }, 'agent')[1]).toBe('agent_action_requests');
  });
});
