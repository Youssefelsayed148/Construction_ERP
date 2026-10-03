const { test, expect } = require('@playwright/test');

const token = () => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({ exp: Math.floor(Date.now() / 1000) + 3600 })}.test`;
};

// Mocked API (the backend behaviour is covered by backend/src/scripts/__tests__/soft-delete.pg.test.js):
// these journeys check the screens: no prompt(), a dialog with a reason, the right request.
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
    requests.push({ method: req.method(), path: url.pathname, query: url.search, body: req.postData() });
    for (const [match, respond] of routes) {
      if (match(req.method(), url.pathname)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(respond(req, url)) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
  });
  return requests;
}

const itemRow = { id: 7, code: 'MAT-0007', name_en: 'Cement', name_ar: 'أسمنت', category: 'raw_material', unit: 'bag', is_active: true };

test('deleting an item opens a dialog (no prompt), sends the reason, and a deleted item can be restored', async ({ page }) => {
  let deleted = false;
  const requests = await setup(page, 'en', [
    [(m, p) => m === 'GET' && p === '/api/items', () => ({ success: true, data: [deleted ? { ...itemRow, is_active: false, deleted_at: '2026-01-01' } : itemRow] })],
    [(m, p) => m === 'DELETE' && p === '/api/items/7', () => { deleted = true; return { success: true }; }],
    [(m, p) => m === 'POST' && p === '/api/items/7/restore', () => { deleted = false; return { success: true, data: itemRow }; }],
  ]);
  await page.goto('/');
  await page.evaluate(() => { history.pushState({}, '', '/inventory'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.getByText('MAT-0007')).toBeVisible();
  await page.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Delete item');
  await dialog.getByLabel('Reason (optional)').fill('duplicate of MAT-0001');
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(dialog).toBeHidden();
  const del = requests.find((r) => r.method === 'DELETE');
  expect(JSON.parse(del.body)).toEqual({ reason: 'duplicate of MAT-0001' });
  expect(await page.evaluate(() => window.__prompts)).toBe(0);
  await page.getByLabel('Show deleted items').check();
  await expect(page.getByText('Deleted').first()).toBeVisible();
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect.poll(() => requests.some((r) => r.method === 'POST' && r.path === '/api/items/7/restore')).toBe(true);
});

const invoice = { id: 5, invoice_number: 'INV-0005', project_id: 1, client_id: 1, amount: 1000, status: 'sent', issue_date: '2026-01-01', due_date: '2099-01-01', total_paid: 0 };

test('voiding an invoice requires a reason and sends it (Arabic, RTL)', async ({ page }) => {
  const requests = await setup(page, 'ar', [
    [(m, p) => m === 'GET' && p === '/api/invoices', () => ({ success: true, data: [invoice] })],
    [(m, p) => m === 'DELETE' && p === '/api/invoices/5', () => ({ success: true })],
  ]);
  await page.goto('/');
  await page.evaluate(() => { history.pushState({}, '', '/invoices'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.getByText('INV-0005')).toBeVisible();
  await page.locator('tbody').getByRole('button', { name: 'إلغاء' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('إلغاء الفاتورة');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await dialog.getByRole('button', { name: 'إلغاء' }).last().click(); // submit without a reason
  await expect(dialog.getByRole('alert')).toContainText('يرجى إدخال السبب');
  expect(requests.some((r) => r.method === 'DELETE')).toBe(false);
  await dialog.getByLabel('السبب').fill('صدرت بالخطأ');
  await dialog.getByRole('button', { name: 'إلغاء' }).last().click();
  await expect.poll(() => requests.find((r) => r.method === 'DELETE')?.body).toBe(JSON.stringify({ reason: 'صدرت بالخطأ' }));
  expect(await page.evaluate(() => window.__prompts)).toBe(0);
});

test('voiding a payment from the invoice detail needs a reason; the voided payment is struck through', async ({ page }) => {
  let voided = false;
  const payment = () => ({ id: 9, amount: 400, payment_date: '2026-01-02', payment_method: 'cash', ...(voided ? { voided_at: '2026-01-03', void_reason: 'bounced' } : {}) });
  const detail = () => ({ ...invoice, total_paid: voided ? 0 : 400, payments: [payment()] });
  const requests = await setup(page, 'en', [
    [(m, p) => m === 'GET' && p === '/api/invoices', () => ({ success: true, data: [{ ...invoice, total_paid: voided ? 0 : 400 }] })],
    [(m, p) => m === 'GET' && p === '/api/invoices/5', () => ({ success: true, data: detail() })],
    [(m, p) => m === 'DELETE' && p === '/api/payments/9', () => { voided = true; return { success: true }; }],
  ]);
  await page.goto('/');
  await page.evaluate(() => { history.pushState({}, '', '/invoices'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByRole('button', { name: 'View Details' }).click();
  await page.locator('.modal-wide').getByRole('button', { name: 'Void', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Void payment');
  await dialog.getByRole('button', { name: 'Void' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Please enter a reason');
  await dialog.getByLabel('Reason').fill('bounced');
  await dialog.getByRole('button', { name: 'Void' }).click();
  await expect.poll(() => requests.find((r) => r.method === 'DELETE')?.body).toBe(JSON.stringify({ reason: 'bounced' }));
  await expect(page.locator('.modal-wide').getByText('Void', { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => window.__prompts)).toBe(0);
});
