const { test, expect } = require('@playwright/test');

test('daily report with a photo and measurement queues offline and syncs once after reconnect', async ({ page, context }) => {
  let reportPosts = 0;
  let uploadPosts = 0;
  const reportKeys = [];
  const reportBodies = [];

  await page.addInitScript(() => {
    const encode = (value) => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    localStorage.setItem('token', `${encode({ alg: 'none' })}.${encode({ exp: Math.floor(Date.now() / 1000) + 3600 })}.test`);
    localStorage.setItem('locale', 'en');
    localStorage.setItem('user', JSON.stringify({ id: 7, name: 'Offline Tester', role: 'owner', policy_modules: ['*'], policy_permissions: [{ module: '*', action: '*', project_id: null }] }));
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/documents/upload') && request.method() === 'POST') {
      uploadPosts += 1;
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, data: [{ file_url: '/uploads/daily-report.png', original_name: 'daily-report.png' }] }) });
      return;
    }
    if (/\/projects\/1\/site-reports$/.test(url.pathname) && request.method() === 'POST') {
      reportPosts += 1;
      reportKeys.push(request.headers()['idempotency-key']);
      reportBodies.push(request.postDataJSON());
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, data: { id: 91 } }) });
      return;
    }
    if (/\/projects\/1\/site-reports/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
      return;
    }
    if (url.pathname.endsWith('/locations/project/1')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [{ id: 11, name_en: 'Tower A' }] }) });
      return;
    }
    if (url.pathname.endsWith('/boq/items/1')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [{ id: 21, code: 'CON-01', description_en: 'Concrete', unit: 'm3' }] }) });
      return;
    }
    const project = { id: 1, code: 'P-001', name: 'Tower', name_en: 'Tower', status: 'active', project_type: 'residential', contract_value: 1000, budget: 800, completion_percentage: 10, phases: [], team: [], milestones: [] };
    const data = /\/api\/projects\/1(?:\?|$)/.test(url.pathname + url.search) ? project : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });

  await page.goto('/');
  await page.evaluate(() => {
    history.pushState({}, '', '/projects/1/site');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.getByRole('button', { name: "File Today's Report" }).click();
  await page.locator('.form-textarea').first().fill('Offline slab pour');
  await page.getByRole('button', { name: 'Add quantity' }).click();
  await page.locator('select').nth(0).selectOption('11');
  await page.locator('select').nth(1).selectOption('21');
  await page.locator('input[type="number"]').last().fill('4.5');
  await page.locator('#site-report-photos').setInputFiles({ name: 'daily-report.png', mimeType: 'image/png', buffer: Buffer.from('test-image') });

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Daily reports waiting to sync')).toBeVisible();
  await expect(page.getByText('Offline slab pour')).toBeVisible();
  expect(reportPosts).toBe(0);
  expect(uploadPosts).toBe(0);

  await context.setOffline(false);
  await expect.poll(() => reportPosts, { timeout: 10000 }).toBe(1);
  await expect.poll(() => uploadPosts, { timeout: 10000 }).toBe(1);
  await expect(page.getByText('Daily reports waiting to sync')).toHaveCount(0);
  expect(reportKeys).toHaveLength(1);
  expect(reportKeys[0]).toBeTruthy();
  expect(reportBodies[0]).toMatchObject({
    work_summary: 'Offline slab pour',
    measurements: [{ project_location_id: 11, boq_item_id: 21, quantity: 4.5, unit: 'm3' }],
    photos: [{ file_url: '/uploads/daily-report.png' }],
  });
});
