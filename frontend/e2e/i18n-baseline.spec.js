// Phase 10 L0: baseline screenshots of the principal routes in both languages.
// Skipped in the normal run; `npm run i18n:screenshots` sets I18N_SCREENSHOTS=1 and runs the i18n-screenshots project.
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
  // C3 demo-path screens
  { name: 'items', path: '/inventory' },
  { name: 'hr', path: '/hr' },
  { name: 'payroll', path: '/hr/payroll' },
  { name: 'my-actions', path: '/my-actions' },
  { name: 'site-workspace', path: '/projects/1/site-workspace' },
  { name: 'admin-workspace', path: '/admin/organizations' },
  // Closeout screens: cash flow, stock reservations, notification preferences
  // and the finance-workbench commitments tab. The commitments tab needs a
  // permissions fixture so see_internal_cost and the commercial approve grant
  // resolve for the owner baseline user.
  { name: 'cash-flow', path: '/cash-flow' },
  { name: 'reservations', path: '/reservations' },
  { name: 'notification-preferences', path: '/notification-preferences' },
  { name: 'finance-commitments', path: '/projects/1/operations', financeTab: 'Commitments|الالتزامات', role: 'owner', policyPermissions: [{ module: '*', action: '*' }] },
];

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1280, height: 800 } },
  { name: 'mobile', viewport: { width: 390, height: 844 } },
];

for (const locale of ['en', 'ar']) {
  for (const route of ROUTES) {
    for (const { name: vpName, viewport } of VIEWPORTS) {
      test(`baseline ${route.name} ${locale} ${vpName}`, async ({ page }) => {
        test.skip(!process.env.I18N_SCREENSHOTS, 'on demand: npm run i18n:screenshots');
        await page.setViewportSize(viewport);
        await page.addInitScript(({ jwt, loc, role, anon, policyPermissions }) => {
          localStorage.setItem('locale', loc);
          if (!anon) {
            localStorage.setItem('token', jwt);
            localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Baseline User', role: role || 'owner', policy_modules: ['*'], policy_permissions: policyPermissions || undefined }));
          }
        }, { jwt: token(), loc: locale, role: route.role, anon: route.anon, policyPermissions: route.policyPermissions });
        await page.route('**/api/**', (r) => r.fulfill({
          status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }),
        }));
        await page.goto(route.path);
        await page.waitForTimeout(800);
        if (route.financeTab) {
          const tab = page.getByRole('tab', { name: new RegExp(route.financeTab) });
          await tab.waitFor({ timeout: 5000 });
          await tab.click();
          await page.waitForTimeout(400);
        }
        await page.screenshot({ path: path.join(outDir, `${route.name}.${locale}.${vpName}.png`), fullPage: false });
      });
    }
  }
}
