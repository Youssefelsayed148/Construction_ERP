const { test, expect } = require('@playwright/test');

const token = () => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({ exp: Math.floor(Date.now() / 1000) + 3600 })}.test`;
};

// Mocked API; the database behaviour is covered by backend/src/scripts/__tests__/fk-restrict.pg.test.js.
async function setup(page, locale, routes) {
  const requests = [];
  await page.addInitScript(({ jwt, locale }) => {
    localStorage.setItem('token', jwt);
    localStorage.setItem('locale', locale);
    localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Tester', role: 'owner', policy_modules: ['*'] }));
    window.__prompts = 0;
    window.prompt = () => { window.__prompts += 1; return null; };
  }, { jwt: token(), locale });
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    requests.push({ method: req.method(), path: url.pathname, body: req.postData() });
    for (const [match, respond] of routes) {
      const out = match(req.method(), url.pathname) ? respond(req) : null;
      if (out) return route.fulfill({ status: out.status || 200, contentType: 'application/json', body: JSON.stringify(out.body) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
  });
  return requests;
}
const go = (page, path) => page.goto('/').then(() => page.evaluate((p) => { history.pushState({}, '', p); window.dispatchEvent(new PopStateEvent('popstate')); }, path));

test('cancelling a work order opens a dialog, sends the reason, and the cancelled order has no cancel button', async ({ page }) => {
  let cancelled = false;
  const wo = () => ({ id: 3, project_id: 1, title: 'Slab pour', title_en: 'Slab pour', title_ar: 'صب البلاطة', status: cancelled ? 'cancelled' : 'planned', completion_percentage: 0 });
  const requests = await setup(page, 'en', [
    [(m, p) => m === 'GET' && p === '/api/work-orders/project/1', () => ({ body: { success: true, data: [wo()] } })],
    [(m, p) => m === 'DELETE' && p === '/api/work-orders/3', () => { cancelled = true; return { body: { success: true } }; }],
  ]);
  await go(page, '/projects/1/work-orders');
  await expect(page.getByText('Slab pour')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel work order' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Slab pour');
  await dialog.getByLabel('Reason (optional)').fill('scope removed');
  await dialog.getByRole('button', { name: 'Cancel work order' }).click();
  await expect(dialog).toBeHidden();
  expect(JSON.parse(requests.find((r) => r.method === 'DELETE').body)).toEqual({ reason: 'scope removed' });
  expect(await page.evaluate(() => window.__prompts)).toBe(0);
  await expect(page.getByRole('button', { name: 'Cancel work order' })).toHaveCount(0);
});

test('deleting a BOQ item that is in use shows the translated refusal (Arabic)', async ({ page }) => {
  const section = { id: 1, project_id: 1, code: 'S1', name: 'قسم', name_ar: 'قسم الخرسانة', name_en: 'Concrete', sort_order: 1 };
  const item = { id: 9, project_id: 1, section_id: 1, code: 'I1', description_ar: 'بند', description_en: 'Slab', type: 'material', unit: 'm3', quantity: 10, unit_rate: 5, total_price: 50 };
  const requests = await setup(page, 'ar', [
    [(m, p) => m === 'GET' && p === '/api/boq/sections/1', () => ({ body: { success: true, data: [section] } })],
    [(m, p) => m === 'GET' && p === '/api/boq/items/1', () => ({ body: { success: true, data: [item] } })],
    [(m, p) => m === 'DELETE' && p === '/api/boq/items/9', () => ({ status: 409, body: { success: false, code: 'record_in_use', error: 'BOQ item is referenced by other records and cannot be deleted' } })],
  ]);
  await go(page, '/projects/1/boq');
  await page.getByText('S1').locator('xpath=preceding::button[1]').click(); // expand the section
  await page.locator('button.btn-danger').last().click(); // the item's delete button
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'حذف' }).click();
  await expect(page.getByRole('alert')).toContainText('هذا السجل مستخدم في سجلات أخرى');
  expect(requests.some((r) => r.method === 'DELETE' && r.path === '/api/boq/items/9')).toBe(true);
});
