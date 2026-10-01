const { test, expect } = require('@playwright/test');

function token() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({ exp: Math.floor(Date.now() / 1000) + 3600 })}.test`;
}

async function authenticate(page) {
  await page.addInitScript(({ jwt }) => {
    localStorage.setItem('token', jwt);
    localStorage.setItem('locale', 'en');
    localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Manual Tester', role: 'owner', policy_modules: ['*'] }));
  }, { jwt: token() });
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    let data = [];
    if (url.includes('/commercial/project/')) data = { project_id: 1, current_budget: 1000, forecast_profit: 100 };
    else if (url.includes('/finance/project/')) data = { contract_value: 1200, total_paid: 500, profit: 100 };
    else if (url.includes('/procurement/project/')) data = { purchase_requests: [], rfqs: [], purchase_orders: [], deliveries: [], material_inspection_requests: [], goods_receipt_notes: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });
}

test('login shell renders without a backend', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading')).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toBeVisible();
});

test('project operations exposes every expanded module', async ({ page }) => {
  await authenticate(page);
  await page.goto('/');
  await page.evaluate(() => {
    history.pushState({}, '', '/projects/1/operations');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { name: 'Project operations' })).toBeVisible();
  for (const name of ['Material planning', 'Inventory', 'Procurement', 'Commercial', 'Valuations', 'Retention', 'Finance']) {
    await expect(page.getByRole('tab', { name })).toBeVisible();
  }
});

test('mobile navigation opens as a drawer', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'mobile-only assertion');
  await authenticate(page);
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Open navigation' });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator('.sidebar')).toHaveClass(/mobile-open/);
});
