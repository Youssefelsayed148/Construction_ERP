// Phase 7: smoke the major internal and portal routes at a narrow viewport.
// Empty API responses keep this journey deterministic and avoid pilot credentials.
const { test, expect } = require('@playwright/test');

function token() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({ exp: Math.floor(Date.now() / 1000) + 3600 })}.test`;
}

const routes = [
  ['/login', null], ['/dashboard', 'owner'], ['/projects', 'owner'],
  ['/projects/1', 'owner'], ['/projects/1/operations', 'owner'],
  ['/projects/1/site', 'site_engineer'], ['/projects/1/qhse', 'owner'],
  ['/projects/1/hse', 'owner'], ['/projects/1/schedule', 'owner'],
  ['/projects/1/boq', 'owner'], ['/invoices', 'finance_manager'],
  ['/procurement/comparison', 'procurement_manager'], ['/approvals', 'owner'],
  ['/consultant-portal', 'consultant'], ['/client-portal', 'client'],
  ['/subcontractor-portal', 'subcontractor'], ['/supplier-portal', 'supplier'],
];

for (const [route, role] of routes) {
  test(`mobile route renders without page-level horizontal overflow: ${route}`, async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('mobile'), 'mobile viewport only');
    await page.addInitScript(({ jwt, currentRole }) => {
      localStorage.setItem('locale', 'en');
      if (currentRole) {
        localStorage.setItem('token', jwt);
        localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Mobile Test', role: currentRole, policy_modules: ['*'] }));
      }
    }, { jwt: token(), currentRole: role });
    await page.route('**/api/**', (request) => request.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }),
    }));
    await page.goto(route);
    await expect(page.locator('body')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
