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
// Limits (owner instruction): one process, one Chromium, one context, one role at a time; 1.5 s between roles; memory check at start and every 5 roles
// (stop below MIN_AVAILABLE_MB); a hard per-role timeout that kills only that browser and records NOT RUN; no retries.
const MIN_AVAILABLE_MB = Number(process.env.MIN_AVAILABLE_MB || 500);
const ROLE_TIMEOUT_MS = Number(process.env.ROLE_TIMEOUT_MS || 45000);
const GAP_MS = 1500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const availableMb = () => { try { return Math.round(Number(/MemAvailable:\s+(\d+)/.exec(fs.readFileSync('/proc/meminfo', 'utf8'))[1]) / 1024); } catch { return -1; } };
const memLog = [];
(async () => {
  const users = await sqlJson('select id, email, role from users'); // two read-only queries in total, none per role
  const upr = await sqlJson(`select upr.user_id, r.key as role_key, upr.project_id, upr.organization_id, p.module as perm_module, p.action as perm_action from user_project_roles upr join roles r on r.id=upr.role_id left join role_permissions rp on rp.role_id=r.id left join permissions p on p.id=rp.permission_id where (upr.expires_at is null or upr.expires_at >= current_date)`);
  const launch = () => chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  let browser = null;
  const results = [];
  fs.mkdirSync(path.join(__dirname, 'screenshots'), { recursive: true });
  const targets = accounts.filter((a) => users.find((x) => x.email === a.email));
  let stopped = null; let done = 0;
  const m0 = availableMb(); memLog.push({ before: 'start', available_mb: m0 }); console.log('MemAvailable at start:', m0, 'MB');
  if (m0 >= 0 && m0 < MIN_AVAILABLE_MB) stopped = `MemAvailable ${m0} MB below ${MIN_AVAILABLE_MB} MB at start`;
  try {
    for (const a of targets) {
      const u = users.find((x) => x.email === a.email); const key = a.email.split('@')[0].replace('pilot-', '');
      if (!stopped && done > 0 && done % 5 === 0) { const m = availableMb(); memLog.push({ after_roles: done, available_mb: m }); console.log(`MemAvailable after ${done} roles:`, m, 'MB'); if (m >= 0 && m < MIN_AVAILABLE_MB) stopped = `MemAvailable ${m} MB below ${MIN_AVAILABLE_MB} MB after ${done} roles`; }
      if (stopped) { results.push({ role: u.role, account: key, module: 'ui', action: 'sidebar', expected: '-', actual: 'not run', result: 'NOT RUN', evidence: stopped }); continue; }
      const user = await sessionUser(a.email); const token = (require('./lib').tokens)[a.email];
      if (!token || !user) { results.push({ role: u.role, account: key, module: 'ui', action: 'sidebar', expected: '-', actual: 'no session', result: 'NOT RUN', evidence: 'login failed (rate limit?); not retried' }); done++; await sleep(GAP_MS); continue; }
      const rows = upr.filter((x) => x.user_id === u.id);
      const fam = FAMILY[u.role];
      const expected = new Set((fam ? [portal[fam]] : main.filter((i) => (!i.roles || i.roles.includes(u.role)) && (!i.module || policy.decide({ rows, module: i.module, action: i.action || 'view', projectId: null }).allowed)).map((i) => i.path)));
      let ctx = null;
      const work = async () => {
        if (!browser) browser = await launch();
        ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
        await ctx.addInitScript(([t, usr]) => { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(usr)); }, [token, user]);
        const page = await ctx.newPage();
        const jsErrors = []; page.on('pageerror', (e) => jsErrors.push(String(e.message).split('\n')[0]));
        try {
        await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 25000 });
        if (expected.size === 0) await page.waitForSelector('.page-container', { timeout: 15000 }); else await page.waitForSelector('nav.sidebar-nav a', { timeout: 15000 });
        const actual = new Set(await page.$$eval('nav.sidebar-nav a', (as) => as.map((x) => new URL(x.href).pathname)));
        const missing = [...expected].filter((p) => !actual.has(p)); const extra = [...actual].filter((p) => !expected.has(p));
        await page.screenshot({ path: path.join(__dirname, 'screenshots', `${key}.png`) });
        return { role: u.role, account: key, module: 'ui', action: 'sidebar shows exactly the allowed modules', expected: [...expected].join(' ') || '(none)', actual: [...actual].join(' ') || '(none)', result: missing.length || extra.length ? 'FAIL' : 'PASS', evidence: `${missing.length ? 'missing: ' + missing.join(',') : ''}${extra.length ? ' extra: ' + extra.join(',') : ''}`.trim(), screenshot: `screenshots/${key}.png` };
        } catch (err) { await page.screenshot({ path: path.join(__dirname, 'screenshots', `${key}.png`) }).catch(() => {}); throw Object.assign(err, { message: String(err.message).split('\n')[0] + (jsErrors.length ? ' | page error: ' + jsErrors[0] : '') }); }
      };
      let timer; let hung = false;
      try {
        const r = await Promise.race([work(), new Promise((_, rej) => { timer = setTimeout(() => { hung = true; rej(new Error(`hard timeout ${ROLE_TIMEOUT_MS} ms`)); }, ROLE_TIMEOUT_MS); })]);
        results.push(r);
      } catch (e) {
        if (hung) { // kill only this browser; the next role launches a fresh one; no retry
          try { const pr = browser && browser.process && browser.process(); if (pr) pr.kill('SIGKILL'); } catch { /* already gone */ }
          browser = null; ctx = null;
          results.push({ role: u.role, account: key, module: 'ui', action: 'sidebar', expected: [...expected].join(' '), actual: 'hung', result: 'NOT RUN', evidence: String(e.message) });
        } else results.push({ role: u.role, account: key, module: 'ui', action: 'sidebar', expected: [...expected].join(' '), actual: 'error', result: 'FAIL', evidence: String(e.message).split('\n')[0] });
      } finally {
        clearTimeout(timer);
        if (ctx) await ctx.close().catch(() => {}); // one context at a time: closed after every role
      }
      done++; await sleep(GAP_MS);
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  const mEnd = availableMb(); memLog.push({ after: 'end', available_mb: mEnd }); console.log('MemAvailable at end:', mEnd, 'MB');
  fs.writeFileSync(path.join(__dirname, 'out/ui-results.json'), JSON.stringify(results, null, 1));
  fs.writeFileSync(path.join(__dirname, 'out/ui-memory.json'), JSON.stringify({ min_available_mb_threshold: MIN_AVAILABLE_MB, memLog, stopped }, null, 1));
  const f = results.filter((r) => r.result === 'FAIL'); const nr = results.filter((r) => r.result === 'NOT RUN');
  console.log('ui checks', results.length, 'pass', results.filter((r) => r.result === 'PASS').length, 'fail', f.length, 'not run', nr.length);
  f.forEach((x) => console.log('FAIL', x.role, x.account, x.evidence)); nr.forEach((x) => console.log('NOT RUN', x.role, x.account, x.evidence));
  process.exit(0);
})();
