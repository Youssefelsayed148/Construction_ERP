const { test, expect } = require('@playwright/test');

function token() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({ exp: Math.floor(Date.now() / 1000) + 3600 })}.test`;
}

test('project procurement creates and submits a purchase request', async ({ page }) => {
  const purchaseRequests = [];
  let createdRequest;
  let requestSubmitted = false;
  await page.addInitScript(({ jwt }) => {
    localStorage.setItem('token', jwt);
    localStorage.setItem('locale', 'en');
    localStorage.setItem('user', JSON.stringify({
      id: 1, name: 'Procurement Tester', role: 'owner',
      policy_modules: ['*'], policy_permissions: [{ module: '*', action: '*' }],
    }));
  }, { jwt: token() });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(/^\/api/, '');
    let data = [];
    if (pathname === '/procurement/project/1' && request.method() === 'GET') {
      data = { purchase_requests: purchaseRequests, rfqs: [], purchase_orders: [], deliveries: [],
        material_inspection_requests: [], goods_receipt_notes: [] };
    } else if (pathname === '/procurement/invoices' && request.method() === 'GET') {
      data = [];
    } else if (pathname === '/procurement/pr' && request.method() === 'POST') {
      createdRequest = request.postDataJSON();
      const row = { id: 7, request_number: 'PR-0007', title: createdRequest.title, status: 'draft', amount: 25 };
      purchaseRequests.push(row);
      data = row;
    } else if (pathname === '/procurement/pr/7/submit' && request.method() === 'POST') {
      requestSubmitted = true;
      purchaseRequests[0].status = 'submitted';
      data = purchaseRequests[0];
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });

  await page.goto('/projects/1/operations');
  await page.getByRole('tab', { name: 'Procurement' }).click();
  await expect(page.getByRole('heading', { name: 'New purchase request' })).toBeVisible();
  await page.locator('#pr-title').fill('Cement for foundation');
  await page.locator('#pr-description').fill('Supply cement for the first foundation pour');
  await page.locator('#pr-qty').fill('5');
  await page.locator('#pr-unit').fill('bag');
  await page.locator('#pr-price').fill('5');
  await page.locator('#pr-priority').selectOption('high');
  await page.getByRole('button', { name: 'Create request' }).click();

  await expect(page.getByRole('cell', { name: 'PR-0007' })).toBeVisible();
  expect(createdRequest).toMatchObject({
    project_id: 1,
    title: 'Cement for foundation',
    priority: 'high',
    lines: [{ description: 'Supply cement for the first foundation pour', quantity: 5, unit: 'bag', estimated_unit_price: 5 }],
  });

  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('cell', { name: 'submitted' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit' })).toHaveCount(0);
  expect(requestSubmitted).toBe(true);
  expect(page.url()).toMatch(/\/projects\/1\/operations$/);
});
