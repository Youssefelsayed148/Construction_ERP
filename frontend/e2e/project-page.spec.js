const { test, expect } = require('@playwright/test');

const token = () => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({ exp: Math.floor(Date.now() / 1000) + 3600 })}.test`;
};

async function open(page, { role, locale }) {
  await page.addInitScript(({ jwt, role, locale }) => {
    localStorage.setItem('token', jwt);
    localStorage.setItem('locale', locale);
    localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Tester', role, policy_modules: ['*'] }));
  }, { jwt: token(), role, locale });
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const project = { id: 1, code: 'P-001', name: 'Tower', name_en: 'Tower', status: 'active', project_type: 'residential',
      contract_value: 1000, budget: 800, completion_percentage: 10, phases: [], team: [], milestones: [] };
    const data = /\/api\/projects\/1(\?|$)/.test(url) ? project : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });
  await page.goto('/');
  await page.evaluate(() => { history.pushState({}, '', '/projects/1'); window.dispatchEvent(new PopStateEvent('popstate')); });
}

test('owner sees all six groups; the sub-tabs follow the active group', async ({ page }) => {
  await open(page, { role: 'owner', locale: 'en' });
  const nav = page.getByRole('navigation', { name: 'Project sections' });
  for (const name of ['Overview', 'Scope & Planning', 'Site & Quality', 'Procurement & Cost', 'Documents & Reports', 'Handover & Sales']) {
    await expect(nav.getByRole('link', { name })).toBeVisible();
  }
  await nav.getByRole('link', { name: 'Site & Quality' }).click();
  await expect(page).toHaveURL(/\/projects\/1\/site$/);
  await expect(page.getByRole('navigation', { name: 'Site & Quality pages' }).getByRole('link', { name: 'Work Orders' })).toBeVisible();
});

test('a site engineer does not get procurement or handover groups', async ({ page }) => {
  await open(page, { role: 'site_engineer', locale: 'en' });
  const nav = page.getByRole('navigation', { name: 'Project sections' });
  await expect(nav.getByRole('link', { name: 'Site & Quality' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Procurement & Cost' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Handover & Sales' })).toHaveCount(0);
  await expect(page.getByText('Contract Value')).toHaveCount(0);
});

test('Arabic labels and RTL direction', async ({ page }) => {
  await open(page, { role: 'owner', locale: 'ar' });
  const nav = page.getByRole('navigation', { name: 'أقسام المشروع' });
  await expect(nav.getByRole('link', { name: 'النطاق والتخطيط' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});
