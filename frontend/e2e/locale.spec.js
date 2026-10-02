// Phase 10 L1: the language toggle is reactive (no reload), persistent, and keeps <html lang/dir> right.
const { test, expect } = require('@playwright/test');

function token() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({ exp: Math.floor(Date.now() / 1000) + 3600 })}.test`;
}

async function signIn(page) {
  await page.addInitScript(({ jwt }) => {
    localStorage.setItem('token', jwt);
    localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Locale Tester', role: 'owner', policy_modules: ['*'] }));
  }, { jwt: token() });
  await page.route('**/api/**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }),
  }));
}

const html = (page) => page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir }));

test('the first visit is Arabic / RTL', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('button[type="submit"]')).toHaveText('تسجيل الدخول');
  expect(await html(page)).toEqual({ lang: 'ar', dir: 'rtl' });
});

test('toggling on Login updates Login without a reload', async ({ page }) => {
  await page.goto('/login');
  await page.evaluate(() => { window.__sameDocument = true; });
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(page.locator('button[type="submit"]')).toHaveText('Sign In');
  expect(await html(page)).toEqual({ lang: 'en', dir: 'ltr' });
  expect(await page.evaluate(() => window.__sameDocument)).toBe(true);
  await page.getByRole('button', { name: 'التبديل إلى العربية' }).click();
  await expect(page.locator('button[type="submit"]')).toHaveText('تسجيل الدخول');
  expect(await html(page)).toEqual({ lang: 'ar', dir: 'rtl' });
});

test('toggling in the sidebar updates the mounted page, and the choice survives navigation and refresh', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith('mobile'), 'the sidebar is a drawer on mobile; covered by the desktop run');
  await signIn(page);
  await page.goto('/legal');
  await page.evaluate(() => { window.__sameDocument = true; });
  // A page (not the sidebar) that has its own useLocale() call must follow the sidebar toggle.
  await expect(page.getByRole('heading', { name: 'المستندات القانونية' })).toBeVisible();
  const dashboardLink = page.locator('.sidebar-nav a[href="/dashboard"]');
  await expect(dashboardLink).toHaveText('لوحة التحكم');

  await page.locator('.locale-toggle').click();
  await expect(dashboardLink).toHaveText('Dashboard');
  await expect(page.getByRole('heading', { name: 'Legal Documents' })).toBeVisible();
  expect(await html(page)).toEqual({ lang: 'en', dir: 'ltr' });
  expect(await page.evaluate(() => window.__sameDocument)).toBe(true);

  await page.locator('.sidebar-nav a[href="/projects"]').click();
  await expect(page.locator('.sidebar-nav a[href="/projects"]')).toHaveText('Projects');

  await page.reload();
  await expect(page.locator('.sidebar-nav a[href="/projects"]')).toHaveText('Projects');
  expect(await html(page)).toEqual({ lang: 'en', dir: 'ltr' });
  expect(await page.evaluate(() => localStorage.getItem('locale'))).toBe('en');
});

test('the choice survives logout and login', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith('mobile'), 'the sidebar is a drawer on mobile; covered by the desktop run');
  await signIn(page);
  await page.goto('/dashboard');
  await page.locator('.locale-toggle').click();
  await page.locator('.logout-btn').click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator('button[type="submit"]')).toHaveText('Sign In');
  expect(await html(page)).toEqual({ lang: 'en', dir: 'ltr' });
});
