// Phase 10 L0: baseline screenshots of the principal routes in both languages.
// Not part of the normal run: `npm run i18n:screenshots` (project "i18n-screenshots").
// The API is mocked with empty data, so these show the shell, headings and empty states.
const { test } = require('@playwright/test');
const path = require('path');

const outDir = path.join(__dirname, '..', '..', 'docs', 'i18n', 'baseline', 'screenshots');

function token() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({ exp: Math.floor(Date.now() / 1000) + 3600 })}.test`;
}

const ROUTES = [
  { name: 'login', path: '/login', anon: true },
  { name: 'dashboard', path: '/dashboard' },
  { name: 'projects', path: '/projects' },
  { name: 'project-detail', path: '/projects/1' },
  { name: 'project-operations', path: '/projects/1/operations' },
  { name: 'procurement-comparison', path: '/procurement/comparison' },
  { name: 'approvals', path: '/approvals' },
  { name: 'qhse', path: '/projects/1/qhse' },
  { name: 'hse', path: '/projects/1/hse' },
  { name: 'schedule', path: '/projects/1/schedule' },
  { name: 'invoices', path: '/invoices' },
  { name: 'agent-activity', path: '/agent-activity' },
  { name: 'portal-consultant', path: '/consultant-portal', role: 'consultant' },
  { name: 'portal-client', path: '/client-portal', role: 'client' },
  { name: 'portal-subcontractor', path: '/subcontractor-portal', role: 'subcontractor' },
  { name: 'portal-supplier', path: '/supplier-portal', role: 'supplier' },
];

for (const locale of ['en', 'ar']) {
  for (const route of ROUTES) {
    test(`baseline ${route.name} ${locale}`, async ({ page }) => {
      await page.addInitScript(({ jwt, loc, role, anon }) => {
        localStorage.setItem('locale', loc);
        if (!anon) {
          localStorage.setItem('token', jwt);
          localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Baseline User', role: role || 'owner', policy_modules: ['*'] }));
        }
      }, { jwt: token(), loc: locale, role: route.role, anon: route.anon });
      await page.route('**/api/**', (r) => r.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }),
      }));
      await page.goto(route.path);
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(outDir, `${route.name}.${locale}.png`), fullPage: false });
    });
  }
}
