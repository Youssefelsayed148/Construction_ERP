const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const enabled = process.env.E2E_PILOT_ROLE_MATRIX === '1';
const credentialsPath = path.resolve(__dirname, '..', '..', '.staging-users.json');
// Credentials are read only inside this browser spec and are never logged,
// written to results, embedded in screenshot names, or included in failures.
const accounts = enabled ? JSON.parse(fs.readFileSync(credentialsPath, 'utf8')).accounts : [];
const restrictedUrls = [
  '/admin/organizations', '/invoices', '/hr', '/settings',
];

function hasData(value) {
  if (Array.isArray(value)) return value.some(hasData);
  if (value && typeof value === 'object') return Object.values(value).some(hasData);
  return value !== null && value !== undefined && value !== '';
}

function visibleDataMatch(value, text) {
  if (Array.isArray(value)) return value.some(item => visibleDataMatch(item, text));
  if (value && typeof value === 'object') return Object.values(value).some(item => visibleDataMatch(item, text));
  if (typeof value === 'string' && value.trim().length >= 4) return text.includes(value.trim());
  return false;
}

function collectProjectIds(value, ids = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectProjectIds(item, ids);
  } else if (value && typeof value === 'object') {
    // This helper only receives /api/projects payloads, so any numeric id in
    // that response belongs to a project, regardless of the server's wrapper.
    if (Number.isFinite(Number(value.id))) ids.add(Number(value.id));
    for (const item of Object.values(value)) collectProjectIds(item, ids);
  }
  return ids;
}

async function openReadOnlyRoute(page, route, allowedRoutes, restrictedSet, rows, accountLabel, language, flags) {
  let currentRoute = route;
  const apiEvents = [];
  const listener = async response => {
    const request = response.request();
    const url = new URL(response.url());
    if (!url.pathname.startsWith('/api/')) return;
    const method = request.method().toUpperCase();
    if (method !== 'GET' && !(method === 'POST' && url.pathname.endsWith('/auth/login'))) flags.unexpectedMethods.push(`${method} ${url.pathname}`);
    let body = null;
    try { body = await response.json(); } catch { /* file or empty response */ }
    const data = body?.data ?? body?.rows ?? null;
    const pageText = await page.locator('body').innerText().catch(() => '');
    apiEvents.push({
      endpoint: url.pathname.replace(/^\/api/, ''), status: response.status(), method,
      hasData: hasData(data), displayed: hasData(data) && visibleDataMatch(data, pageText),
      requestRoute: currentRoute,
    });
  };
  page.on('response', listener);
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(150);
  page.off('response', listener);
  const deniedExpected = restrictedSet.has(route) && !allowedRoutes.has(route);
  const dataShown = deniedExpected && apiEvents.some(event => event.status === 200 && event.hasData && event.displayed);
  if (deniedExpected && apiEvents.some(event => event.status === 200 && event.hasData)) {
    flags.surprises.push({ account: accountLabel, language, route, status: apiEvents.filter(event => event.status === 200).map(event => event.status).join(', '), dataShown });
  }
  rows.push({
    account: accountLabel,
    sidebar: [...allowedRoutes].sort().join(', '),
    route,
    status: apiEvents.map(event => `${event.endpoint}=${event.status}`).join('; ') || 'no API response',
    dataShown: deniedExpected ? (dataShown ? 'YES' : 'no') : 'n/a',
    language,
  });
}

test('read-only pilot role matrix (English and Arabic)', async ({ browser }) => {
  test.skip(!enabled, 'Set E2E_PILOT_ROLE_MATRIX=1 to run against the already-running pilot.');
  test.setTimeout(60 * 60 * 1000);
  expect(accounts).toHaveLength(38);

  const artifactDir = path.resolve(__dirname, '..', 'e2e-artifacts');
  fs.mkdirSync(artifactDir, { recursive: true });
  const rows = [];
  const flags = { surprises: [], unexpectedMethods: [], missingOtherProjectTarget: [], discoveredProjectCount: 0 };
  const ownerAccount = accounts.find(account => ['owner_ceo', 'owner'].includes(account.role));
  let allProjectIds = [];
  if (ownerAccount) {
    const discoveryContext = await browser.newContext();
    const discoveryPage = await discoveryContext.newPage();
    await discoveryPage.goto('/login', { waitUntil: 'domcontentloaded' });
    await discoveryPage.locator('#login-email').fill(ownerAccount.email);
    await discoveryPage.locator('#login-password').fill(ownerAccount.password);
    const ownerLogin = discoveryPage.waitForResponse(response => new URL(response.url()).pathname.endsWith('/api/auth/login'));
    await discoveryPage.locator('form button[type="submit"]').click();
    expect((await ownerLogin).status()).toBe(200);
    const projectsResponse = discoveryPage.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/projects');
    await discoveryPage.goto('/projects', { waitUntil: 'domcontentloaded' });
    const projectsBody = await (await projectsResponse).json().catch(() => ({}));
    allProjectIds = [...collectProjectIds(projectsBody)];
    const projectLinks = await discoveryPage.locator('a[href^="/projects/"]').evaluateAll(links => links.map(link => link.getAttribute('href')));
    for (const href of projectLinks) {
      const match = /^\/projects\/(\d+)(?:\/|$)/.exec(href || '');
      if (match) allProjectIds.push(Number(match[1]));
    }
    allProjectIds = [...new Set(allProjectIds)];
    flags.discoveredProjectCount = allProjectIds.length;
    await discoveryContext.close();
  }

  for (let accountIndex = 0; accountIndex < accounts.length; accountIndex += 1) {
    const account = accounts[accountIndex];
    const accountLabel = `Pilot ${String(accountIndex + 1).padStart(2, '0')} (${account.role || 'role unknown'})`;
    for (const language of ['en', 'ar']) {
      const context = await browser.newContext({ locale: language === 'ar' ? 'ar-EG' : 'en-US' });
      const page = await context.newPage();
      await page.addInitScript(locale => localStorage.setItem('locale', locale), language);
      await page.goto('/login', { waitUntil: 'domcontentloaded' });
      await page.locator('#login-email').fill(account.email);
      await page.locator('#login-password').fill(account.password);
      const loginResponse = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/api/auth/login'));
      await page.locator('form button[type="submit"]').click();
      expect((await loginResponse).status()).toBe(200);
      await expect(page).not.toHaveURL(/\/login$/);

      const sidebar = await page.locator('aside a:visible, nav a:visible, [role="navigation"] a:visible').evaluateAll(links => links
        .map(link => ({ label: (link.innerText || '').trim().replace(/\s+/g, ' '), href: link.getAttribute('href') }))
        .filter(link => link.label && link.href && link.href.startsWith('/')));
      const allowedRoutes = new Set(sidebar.map(link => link.href.split('#')[0]));
      const assignedProjectIds = await page.evaluate(() => {
        try {
          const user = JSON.parse(localStorage.getItem('user') || 'null');
          const ids = [user?.project_id, ...(user?.project_ids || []), ...(user?.policy_permissions || []).map(grant => grant.project_id)];
          return [...new Set(ids.map(Number).filter(Number.isFinite))];
        } catch { return []; }
      });
      const otherProjectId = allProjectIds.find(id => !assignedProjectIds.includes(id));
      const otherProjectRoute = otherProjectId ? `/projects/${otherProjectId}/boq` : null;
      if (!otherProjectRoute) flags.missingOtherProjectTarget.push(`${accountLabel} (${language})`);
      const restrictedSet = new Set([...restrictedUrls, ...(otherProjectRoute ? [otherProjectRoute] : [])]);
      rows.push({ account: accountLabel, sidebar: sidebar.map(link => link.label).join(', ') || '(none)', route: '(sidebar)', status: 'captured', dataShown: 'n/a', language });

      const screenshotBase = `pilot-${String(accountIndex + 1).padStart(2, '0')}-${language}`;
      await page.screenshot({ path: path.join(artifactDir, `${screenshotBase}-sidebar.png`) });
      const routeSet = new Set([...sidebar.map(link => link.href), ...restrictedSet]);
      for (const route of routeSet) await openReadOnlyRoute(page, route, allowedRoutes, restrictedSet, rows, accountLabel, language, flags);
      await context.close();
    }
  }

  expect(flags.unexpectedMethods).toEqual([]);
  const surprises = flags.surprises.length
    ? flags.surprises.map(item => `- HIGH: ${item.account}, ${item.language}, ${item.route}; API 200 with data; visible data: ${item.dataShown}`).join('\n')
    : '- No denied URL returned visible data in the captured API responses.';
  const matrix = [
    '# Pilot role matrix results', '',
    'Read-only browser run against the already-running local pilot. Login is the only POST; every page request was navigation or GET.',
    'Account identifiers are ordinal and role only. Credentials, tokens, and cookies are not included.', '',
    '| account | sidebar entries | denied URL / page | API status | data shown? | language |',
    '|---|---|---|---|---|---|',
    ...rows.map(row => `| ${row.account} | ${row.sidebar.replaceAll('|', '\\|')} | ${row.route} | ${row.status} | ${row.dataShown} | ${row.language} |`),
    '', '## Surprises', '', surprises, '',
    '## Decisions waiting', '',
    ...flags.surprises.map(item => `- **HIGH** - Review possible cross-role data exposure at ${item.route} for ${item.account} (${item.language}). No access changes were made.`),
    `- Project discovery returned ${flags.discoveredProjectCount} real project ID(s). **NOT VERIFIED** - No project ID outside the account's recorded project scope was available for ${flags.missingOtherProjectTarget.length} account/language checks; no synthetic ID was substituted.`,
    ...(flags.unexpectedMethods.length ? flags.unexpectedMethods.map(item => `- **HIGH** - Unexpected non-read-only method observed: ${item}. No follow-up action was taken.`) : ['- None.']),
  ].join('\n');
  fs.writeFileSync(path.resolve(__dirname, '..', '..', 'docs', 'ROLE_MATRIX_RESULTS.md'), `${matrix}\n`, 'utf8');
});
