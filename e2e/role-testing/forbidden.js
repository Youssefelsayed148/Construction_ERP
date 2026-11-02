// Forbidden actions: for every role with an account, up to 3 create-style calls on modules where the policy denies create. A 403 is expected;
// the body is empty, so even a (wrongly) allowed call fails validation and creates nothing.
const fs = require('fs'); const path = require('path');
const { sqlJson, call, accounts } = require('./lib');
const policy = require('../../backend/src/services/policy');
const routes = JSON.parse(fs.readFileSync(path.join(__dirname, 'routes.json'), 'utf8'));
const CANDIDATES = [['/api/clients', 'clients'], ['/api/suppliers', 'suppliers'], ['/api/items', 'items'], ['/api/invoices', 'invoices'], ['/api/payments', 'payments'], ['/api/hr/employees', 'hr'], ['/api/assets', 'assets'], ['/api/procurement/pr', 'procurement'], ['/api/boq/items', 'boq'], ['/api/qhse/ncrs', 'qhse'], ['/api/hse/incidents', 'hse'], ['/api/docs/documents', 'docs'], ['/api/schedule/activities', 'schedule'], ['/api/commercial/contracts', 'commercial'], ['/api/warehouses', 'warehouses'], ['/api/projects', 'projects'], ['/api/payroll', 'payroll'], ['/api/legal', 'legal'], ['/api/maintenance', 'maintenance'], ['/api/work-orders', 'work-orders'], ['/api/subcontractors', 'subcontractors'], ['/api/finance-ledger/credit-notes', 'finance-ledger'], ['/api/organizations', 'organizations'], ['/api/users', 'users']];
(async () => {
  const users = await sqlJson('select id, email, role from users');
  const upr = await sqlJson(`select upr.user_id, r.key as role_key, upr.project_id, upr.organization_id, p.module as perm_module, p.action as perm_action from user_project_roles upr join roles r on r.id=upr.role_id left join role_permissions rp on rp.role_id=r.id left join permissions p on p.id=rp.permission_id where (upr.expires_at is null or upr.expires_at >= current_date)`);
  const out = [];
  for (const a of accounts) {
    const u = users.find((x) => x.email === a.email); if (!u || /unassigned|expired/.test(a.email)) continue;
    const rows = upr.filter((x) => x.user_id === u.id);
    let picked = 0;
    for (const [p, mount] of CANDIDATES) {
      if (picked >= 3) break;
      const rt = routes.find((r) => r.mount === '/api/' + mount && r.method === 'POST' && (r.path === '/' || p.endsWith(r.path)));
      const req = { method: 'POST', baseUrl: '/api/' + mount, policyRoute: rt ? rt.path : '/', route: { path: rt ? rt.path : '/' }, body: {}, user: { role: u.role } };
      const eMod = policy.effectiveModule(req, policy.moduleFromRequest(req)); const eAct = policy.effectiveAction(req, policy.moduleFromRequest(req));
      const d = policy.decide({ rows, module: eMod, action: eAct, projectId: null });
      const roleOk = !rt || !rt.roles || rt.roles.length === 0 || rt.roles.includes(u.role);
      if (d.allowed && roleOk) continue; // role may create here: not a forbidden action
      const r = await call(a.email, 'POST', p, {});
      picked++;
      out.push({ role: u.role, account: a.email.split('@')[0].replace('pilot-', ''), module: mount, action: `POST ${p} (forbidden)`, expected: 'HTTP 403', actual: `HTTP ${r.status}`, result: r.status === 403 ? 'PASS' : 'FAIL', evidence: r.status === 403 ? `no ${eMod}.${eAct} grant` : JSON.stringify(r.body).slice(0, 120) });
    }
  }
  fs.writeFileSync(path.join(__dirname, 'out/forbidden-results.json'), JSON.stringify(out, null, 1));
  const f = out.filter((o) => o.result === 'FAIL');
  console.log('forbidden checks', out.length, 'fail', f.length); f.forEach((x) => console.log(x.role, x.action, x.actual, x.evidence));
})();
