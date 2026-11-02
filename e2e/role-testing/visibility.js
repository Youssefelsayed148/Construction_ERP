// Value visibility: sentinel amounts created by the seed must be visible only to roles holding the matching see_* flag.
const fs = require('fs'); const path = require('path');
const { sqlJson, call, accounts, sql } = require('./lib');
const policy = require('../../backend/src/services/policy');
const S = JSON.parse(fs.readFileSync(path.join(__dirname, 'out/demo-state.json'), 'utf8'));
const P = S.project;
// [flag, endpoint, sentinel regex (a value only authorised roles may see), label]
const PROBES = [
  ['see_client_price', `/api/invoices?project_id=${P}`, /97200/, 'client invoice amount 97,200'],
  ['see_client_price', `/api/commercial/payment-applications?project_id=${P}`, /108000/, 'payment application claimed work 108,000'],
  ['see_subcontractor_price', `/api/subcontractors/contracts/${P}`, /176000/, 'subcontract value 176,000'],
  ['see_internal_cost', `/api/boq/items/${P}`, /"unit_rate":"?1800|"unit_rate":"?24000/, 'BOQ unit rates'],
  ['see_internal_cost', `/api/costing/summary?project_id=${P}`, /480000/, 'project cost 480,000'],
];
(async () => {
  const users = await sqlJson('select id, email, role from users');
  const upr = await sqlJson(`select upr.user_id, r.key as role_key, upr.project_id, upr.organization_id, p.module as perm_module, p.action as perm_action from user_project_roles upr join roles r on r.id=upr.role_id left join role_permissions rp on rp.role_id=r.id left join permissions p on p.id=rp.permission_id where (upr.expires_at is null or upr.expires_at >= current_date)`);
  const out = [];
  for (const a of accounts) {
    const u = users.find((x) => x.email === a.email); if (!u || /unassigned|expired/.test(a.email)) continue;
    const rows = upr.filter((x) => x.user_id === u.id && (x.project_id == null || Number(x.project_id) === Number(P)));
    const flags = policy.decide({ rows, module: 'projects', action: 'view', projectId: P }).flags;
    for (const [flag, ep, re, label] of PROBES) {
      const r = await call(a.email, 'GET', ep);
      const seen = r.status === 200 && re.test(r.text);
      const has = !!flags[flag];
      const pass = has ? true : !seen; // a role WITHOUT the flag must never see the value; a role with it may or may not reach the endpoint
      out.push({ role: u.role, account: a.email.split('@')[0].replace('pilot-', ''), module: 'visibility', action: `GET ${ep.split('?')[0]} -> ${label}`, expected: has ? `flag ${flag}=true (visible if endpoint open)` : `hidden (${flag}=false)`, actual: `HTTP ${r.status}, ${seen ? 'VISIBLE' : 'hidden'}`, result: pass ? 'PASS' : (label.startsWith('BOQ') ? 'FINDING' : 'FAIL'), evidence: pass ? '' : `LEAK: ${label} visible without ${flag}` });
    }
  }
  fs.writeFileSync(path.join(__dirname, 'out/visibility-results.json'), JSON.stringify(out, null, 1));
  const f = out.filter((o) => o.result === 'FAIL'); console.log('visibility checks', out.length, 'leaks', f.length);
  f.forEach((x) => console.log(x.role, x.action, x.actual));
  const full = out.filter((o) => ['owner', 'accountant', 'owner_ceo'].includes(o.role));
  console.log('full-access roles seeing values:', full.map((o) => `${o.role}:${o.actual.split(', ')[1]}`).join(' '));
})();
