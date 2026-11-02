// Part 5: Playwright UI pass. For every account: sign in with the real session, open the app, read the rendered sidebar, compare with the menu the
// DB policy allows (menu definitions parsed from frontend/src/components/layout/Sidebar.js), save a screenshot of the landing page.
const fs = require('fs'); const path = require('path');
const PW = process.env.PW_DIR; const { chromium } = require(PW + '/node_modules/playwright-core');
const { sqlJson, accounts, sessionUser, BASE } = require('./lib');
const policy = require('../../backend/src/services/policy');
const src = fs.readFileSync(path.join(__dirname, '../../frontend/src/components/layout/Sidebar.js'), 'utf8');
const parseMenu = (name) => { const m = src.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\];`)); return [...m[1].matchAll(/\{ path: '([^']+)'[^}]*?(?:module: '([^']+)')?[^}]*?(?:action: '([^']+)')?[^}]*?(?:roles: \[([^\]]*)\])?[^}]*\}/g)].map((x) => ({ path: x[1], module: (x[0].match(/module: '([^']+)'/) || [])[1], action: (x[0].match(/action: '([^']+)'/) || [])[1], roles: (x[0].match(/roles: \[([^\]]*)\]/) || [])[1]?.match(/'([^']+)'/g)?.map((r) => r.replace(/'/g, '')) })); };
const main = parseMenu('mainMenuItems');
const portal = { consultant: '/consultant-portal', client: '/client-portal', subcontractor: '/subcontractor-portal', supplier: '/supplier-portal' };
const FAMILY = { client_executive: 'client', client_reviewer: 'client', pmc_manager: 'client', consultant_coordinator: 'consultant', consultant_reviewer: 'consultant', subcontractor_manager: 'subcontractor', subcontractor_site_engineer: 'subcontractor', supplier_sales: 'supplier', testing_lab: 'supplier', client: 'client', consultant: 'consultant', subcontractor: 'subcontractor', supplier: 'supplier' };
(async () => {
  const users = await sqlJson('select id, email, role from users');
  const upr = await sqlJson(`select upr.user_id, r.key as role_key, upr.project_id, upr.organization_id, p.module as perm_module, p.action as perm_action from user_project_roles upr join roles r on r.id=upr.role_id left join role_permissions rp on rp.role_id=r.id left join permissions p on p.id=rp.permission_id where (upr.expires_at is null or upr.expires_at >= current_date)`);
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
  const results = [];
  fs.mkdirSync(path.join(__dirname, 'screenshots'), { recursive: true });
  for (const a of accounts) {
    const u = users.find((x) => x.email === a.email); if (!u) continue;
    const key = a.email.split('@')[0].replace('pilot-', '');
    const user = await sessionUser(a.email); const token = (require('./lib').tokens)[a.email];
    if (!token || !user) { results.push({ role: u.role, account: key, module: 'ui', action: 'sidebar', expected: '-', actual: 'no session', result: 'FAIL', evidence: 'login failed (rate limit?)' }); continue; }
    const rows = upr.filter((x) => x.user_id === u.id);
    const fam = FAMILY[u.role];
    const expected = new Set((fam ? [portal[fam]] : main.filter((i) => (!i.roles || i.roles.includes(u.role)) && (!i.module || policy.decide({ rows, module: i.module, action: i.action || 'view', projectId: null }).allowed)).map((i) => i.path)));
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
    await ctx.addInitScript(([t, usr]) => { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(usr)); }, [token, user]);
    const page = await ctx.newPage();
    try {
      await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 25000 });
      await page.waitForSelector('nav.sidebar-nav a', { timeout: 15000 });
      const actual = new Set(await page.$$eval('nav.sidebar-nav a', (as) => as.map((a) => new URL(a.href).pathname)));
      const missing = [...expected].filter((p) => !actual.has(p)); const extra = [...actual].filter((p) => !expected.has(p));
      await page.screenshot({ path: path.join(__dirname, 'screenshots', `${key}.png`) });
      results.push({ role: u.role, account: key, module: 'ui', action: 'sidebar shows exactly the allowed modules', expected: [...expected].join(' ') || '(none)', actual: [...actual].join(' ') || '(none)', result: missing.length || extra.length ? 'FAIL' : 'PASS', evidence: `${missing.length ? 'missing: ' + missing.join(',') : ''}${extra.length ? ' extra: ' + extra.join(',') : ''}`.trim(), screenshot: `screenshots/${key}.png` });
    } catch (e) {
      await page.screenshot({ path: path.join(__dirname, 'screenshots', `${key}.png`) }).catch(() => {});
      results.push({ role: u.role, account: key, module: 'ui', action: 'sidebar', expected: [...expected].join(' '), actual: 'error', result: 'FAIL', evidence: String(e.message).split('\n')[0], screenshot: `screenshots/${key}.png` });
    }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(__dirname, 'out/ui-results.json'), JSON.stringify(results, null, 1));
  const f = results.filter((r) => r.result === 'FAIL'); console.log('ui checks', results.length, 'fail', f.length); f.forEach((x) => console.log(x.role, x.account, x.evidence));
})();
