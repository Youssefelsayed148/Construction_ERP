// Captures the fixtures for services/__tests__/valueMasking.contract.test.js: real FULL-ACCESS responses of every masked mount (read-only GETs as the
// full-access workflow_owner account) and the real visibility flags + role keys of every account. Serial, one login, ~20 GETs.
const fs = require('fs'); const path = require('path');
const { sqlJson, call, accounts } = require('./lib');
const policy = require('../../backend/src/services/policy');
const P = 6;
const ENDPOINTS = ['/api/dashboard/overview', '/api/dashboard/role', '/api/dashboard/alerts', '/api/dashboard/stats', '/api/finance/summary', `/api/invoices?project_id=${P}`,
  `/api/commercial/payment-applications?project_id=${P}`, `/api/commercial/contracts?project_id=${P}`, `/api/boq/items/${P}`, `/api/boq/summary/${P}`, `/api/subcontractors/contracts/${P}`,
  `/api/work-orders/project/${P}`, '/api/costing/codes', '/api/hr/employees', '/api/payroll', '/api/finance-ledger/retention', '/api/payments', '/api/expenses', '/api/projects', `/api/projects/${P}`];
(async () => {
  const payloads = [];
  for (const ep of ENDPOINTS) {
    const r = await call('workflow_owner', 'GET', ep);
    if (r.status === 200 && r.body) payloads.push({ endpoint: ep.split('?')[0], mount: ep.split('?')[0].split('/')[2], body: r.body });
    else console.log('skipped', ep, r.status);
    await new Promise((ok) => setTimeout(ok, 150));
  }
  const users = await sqlJson('select id, email, role from users');
  const upr = await sqlJson(`select upr.user_id, r.key as role_key, upr.project_id, upr.organization_id, p.module as perm_module, p.action as perm_action from user_project_roles upr join roles r on r.id=upr.role_id left join role_permissions rp on rp.role_id=r.id left join permissions p on p.id=rp.permission_id where (upr.expires_at is null or upr.expires_at >= current_date)`);
  const roles = [];
  for (const a of accounts) {
    const u = users.find((x) => x.email === a.email); if (!u) continue;
    const rows = upr.filter((x) => x.user_id === u.id);
    const d = policy.decide({ rows, module: 'projects', action: 'view', projectId: null });
    roles.push({ account: a.email.split('@')[0].replace('pilot-', ''), flags: d.flags, role_keys: [...new Set(rows.map((x) => x.role_key))] });
  }
  const out = path.join(__dirname, '../../backend/src/services/__tests__/fixtures/masking-contract.json');
  fs.writeFileSync(out, JSON.stringify({ captured_at: new Date().toISOString(), payloads, roles }, null, 1));
  console.log('payloads', payloads.length, 'accounts', roles.length, '->', path.relative(process.cwd(), out));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
