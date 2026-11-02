// Parts 1+2: build the expected role x module matrix from the live roles/grants + route code, then hit every module as every role with an account.
const fs = require('fs'); const path = require('path');
const { sqlJson, call, accounts } = require('./lib');
const policy = require('../../backend/src/services/policy');
const { externalPortalAllowed } = require('../../backend/src/middleware/auth');
const routes = JSON.parse(fs.readFileSync(path.join(__dirname, 'routes.json'), 'utf8'));
const LEGACY = ['admin','owner','accountant','manager','engineer','staff','viewer','client','consultant','subcontractor','supplier','site_supervisor','purchasing_mgr','legal_mgr','maintenance_mgr'];
const EXTERNAL = ['client_executive','client_reviewer','pmc_manager','consultant_coordinator','consultant_reviewer','subcontractor_manager','subcontractor_site_engineer','supplier_sales','testing_lab'];
const PROJECT = Number(process.env.DEMO_PROJECT || 1);
// one representative GET per mounted module (path relative to /api)
const REP = {
  users: '/users', approvals: '/approvals/pending', 'workflow-templates': '/workflow-templates', 'approval-limits': '/approval-limits', activity: '/activity',
  dashboard: '/dashboard', items: '/items', suppliers: '/suppliers', clients: '/clients', legal: '/legal', expenses: '/expenses', invoices: '/invoices',
  payments: '/payments', finance: '/finance/summary', assets: '/assets', maintenance: '/maintenance', hr: '/hr/employees', payroll: '/payroll', projects: '/projects',
  warehouses: '/warehouses', inventory: '/inventory/lots', boq: `/boq/summary/${PROJECT}`, 'work-orders': `/work-orders/project/${PROJECT}`, subcontractors: '/subcontractors',
  costing: '/costing/codes', documents: null, qhse: '/qhse/ncrs', hse: '/hse/incidents', schedule: '/schedule/activities', reports: '/reports/catalog',
  handover: '/handover/assets', docs: '/docs/documents', sales: '/sales/summary', actions: '/actions/my', notifications: '/notifications', locations: `/locations/project/${PROJECT}`,
  quantities: '/quantities/measurements', materials: '/materials/requirements', procurement: '/procurement/rfq', commercial: '/commercial/guarantees',
  'finance-ledger': '/finance-ledger/retention', consultant: '/consultant/projects', 'client-portal': '/client-portal/projects', portal: '/portal/supplier/dashboard',
  organizations: '/organizations', delegations: '/delegations', team: '/team',
};
// routing pattern used for policy module/action resolution (matches the router path)
function routePattern(mod, p) {
  const rel = p.replace(/^\/[^/]+/, '').split('?')[0] || '/';
  const hit = routes.filter((r) => r.mount === '/api/' + mod && r.method === 'GET').find((r) => {
    const re = new RegExp('^' + (r.path || '/').replace(/:[A-Za-z]+/g, '[^/]+') + '/?$');
    return re.test(rel);
  });
  return hit || { path: rel, roles: [] };
}
function expectedFor(userRow, rows, mod) {
  const p = REP[mod]; if (!p) return null;
  const rt = routePattern(mod, p);
  const req = { method: 'GET', baseUrl: '/api/' + mod, policyRoute: rt.path, route: { path: rt.path }, originalUrl: '/api' + p, user: { role: userRow.role } };
  const eMod = policy.effectiveModule(req, policy.moduleFromRequest(req));
  const eAct = policy.effectiveAction(req, policy.moduleFromRequest(req));
  const d = policy.decide({ rows, module: eMod, action: eAct, projectId: null });
  const coarse = rt.roles || [];
  const portalOk = externalPortalAllowed(req);
  const roleOk = coarse.length === 0 || coarse.includes(userRow.role);
  let why = d.allowed ? 'policy grant' : 'no grant for ' + eMod + '.' + eAct;
  if (d.allowed && !roleOk) why = 'route restricted to roles [' + coarse.join(',') + ']';
  if (d.allowed && !portalOk) why = 'external account limited to its portal';
  return { allowed: d.allowed && roleOk && portalOk, module: eMod, action: eAct, why, flags: d.flags, route: rt.path };
}
(async () => {
  const roles = await sqlJson('select r.key, r.name from roles r order by r.key');
  const grants = await sqlJson('select r.key as role_key, p.module as perm_module, p.action as perm_action from roles r join role_permissions rp on rp.role_id=r.id join permissions p on p.id=rp.permission_id');
  const users = await sqlJson('select u.id, u.email, u.role from users u');
  const upr = await sqlJson(`select upr.user_id, r.key as role_key, upr.project_id, upr.organization_id, p.module as perm_module, p.action as perm_action from user_project_roles upr join roles r on r.id=upr.role_id left join role_permissions rp on rp.role_id=r.id left join permissions p on p.id=rp.permission_id where (upr.expires_at is null or upr.expires_at >= current_date)`);
  const kind = (k) => (LEGACY.includes(k) ? 'legacy' : EXTERNAL.includes(k) ? 'external' : 'internal');
  const mods = Object.keys(REP);
  // account per role: canonical pilot-<role>; legacy roles found through the workflow_* / unassigned accounts
  const acctOf = {};
  for (const r of roles) {
    const email = `pilot-${r.key}@pilot.example.com`;
    let a = accounts.find((x) => x.email === email && users.find((u) => u.email === email && u.role === r.key));
    if (!a) { const u = users.find((x) => x.role === r.key && accounts.find((y) => y.email === x.email)); if (u) a = accounts.find((y) => y.email === u.email); }
    if (a) acctOf[r.key] = a.email;
  }
  const expectedMatrix = {}; // all 48 roles, company-wide assumption for roles w/o account (internal) - informational
  for (const r of roles) {
    const rows = grants.filter((g) => g.role_key === r.key).map((g) => ({ ...g, project_id: null }));
    expectedMatrix[r.key] = {};
    const fake = { role: r.key };
    for (const m of mods) { const e = expectedFor(fake, rows, m); expectedMatrix[r.key][m] = e ? (e.allowed ? 'Y' : 'N') : '-'; }
  }
  const results = [];
  const extra = accounts.filter((a) => /unassigned|expired_assignment/.test(a.email)).map((a) => a.email);
  const targets = [...new Set([...Object.values(acctOf), ...extra])];
  for (const email of targets) {
    const u = users.find((x) => x.email === email);
    const rows = upr.filter((x) => x.user_id === u.id);
    const roleKey = u.role;
    for (const m of mods) {
      const p = REP[m]; const e = expectedFor(u, rows, m);
      if (!e) { results.push({ role: roleKey, account: email.split('@')[0], module: m, action: 'GET (no list route)', expected: 'n/a', actual: 'n/a', result: 'N/A', evidence: 'module has no parameter-free GET (upload-only)' }); continue; }
      const r = await call(email, 'GET', '/api' + p);
      const denied = r.status === 403 || r.status === 401;
      const pass = r.status < 500 && (e.allowed ? !denied : r.status === 403);
      results.push({ role: roleKey, account: email.split('@')[0].replace('pilot-', ''), module: m, action: 'GET /api' + p, expected: e.allowed ? 'allow' : 'deny (403)', actual: String(r.status), result: pass ? 'PASS' : 'FAIL', evidence: `${e.why}; policy ${e.module}.${e.action}${pass ? '' : '; body=' + JSON.stringify(r.body).slice(0, 140)}` });
    }
  }
  fs.writeFileSync(path.join(__dirname, 'out/access-results.json'), JSON.stringify({ roles: roles.map((r) => ({ key: r.key, kind: kind(r.key), account: acctOf[r.key] || null })), mods, expectedMatrix, results }, null, 1));
  const fails = results.filter((r) => r.result === 'FAIL');
  console.log('roles', roles.length, 'with account', Object.keys(acctOf).length, 'modules', mods.length, 'accounts tested', targets.length, 'checks', results.length, 'fail', fails.length);
  for (const f of fails.slice(0, 40)) console.log(f.role, f.module, f.expected, f.actual, f.evidence.slice(0, 120));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
