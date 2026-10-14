const { test, expect } = require('@playwright/test');

test('Arabic UI font is served locally and renders with external requests blocked', async ({ page }) => {
  const fontRequests = [];
  const failedRequests = [];
  page.on('requestfailed', (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    const parsed = new URL(url);
    const localApp = ['localhost', '127.0.0.1'].includes(parsed.hostname) && parsed.port === '3000';
    if (localApp || url.startsWith('data:') || url.startsWith('blob:')) {
      if (/\.(?:woff2?|ttf)(?:\?|$)/i.test(url)) fontRequests.push(url);
      return route.continue();
    }
    return route.abort();
  });

  await page.goto('/login');
  const fontState = await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('400 16px "IBM Plex Sans Arabic"', 'العربية'),
      document.fonts.load('400 16px "IBM Plex Sans"', 'Construction ERP'),
    ]);
    await document.fonts.ready;
    return {
      arabicLoaded: document.fonts.check('400 16px "IBM Plex Sans Arabic"', 'العربية'),
      latinLoaded: document.fonts.check('400 16px "IBM Plex Sans"', 'Construction ERP'),
      direction: document.documentElement.dir,
      bodyFont: getComputedStyle(document.body).fontFamily,
      faces: [...document.fonts].map((face) => ({ family: face.family, weight: face.weight, status: face.status })),
    };
  });
  const appOrigin = new URL(page.url()).origin;

  expect(fontState.arabicLoaded, JSON.stringify({ fontState, fontRequests, failedRequests })).toBe(true);
  expect(fontState.latinLoaded, JSON.stringify({ fontState, fontRequests, failedRequests })).toBe(true);
  expect(fontState.direction).toBe('rtl');
  expect(fontRequests.length).toBeGreaterThan(0);
  expect(fontRequests.every((url) => new URL(url).origin === appOrigin && new URL(url).pathname.startsWith('/static/'))).toBe(true);
});
