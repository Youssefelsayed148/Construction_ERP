#!/usr/bin/env node
// G2.9 closeout connectivity check. Static (no build, no server, no network):
// for every ADMIN_AREAS screen it asserts (1) the admin/:area route resolves in
// App.js, (2) the area config sets module + roles for permission gating,
// (3) every API path the screen calls resolves to a backend mount, (4) the
// namespace's EN/AR i18n keys resolve in both locale files. Also asserts no
// existing Sidebar entry points at a missing route. Prints a table; exit 1 on
// any gap. Run: node scripts/check-screen-connectivity.js
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const appSrc = read('frontend/src/App.js');
const workspaceSrc = read('frontend/src/pages/AdminWorkspace.js');
const sidebarSrc = read('frontend/src/components/layout/Sidebar.js');
const serverSrc = read('backend/server.js');
const v1Src = read('backend/src/routes/v1.js');
const i18n = {
  en: JSON.parse(read('frontend/src/locales/en/admin.json')),
  ar: JSON.parse(read('frontend/src/locales/ar/admin.json')),
};

function extractAdminAreas(src) {
  const start = src.indexOf('export const ADMIN_AREAS = {');
  const bodyStart = src.indexOf('{', start);
  let depth = 0;
  let end = bodyStart;
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = src.slice(bodyStart + 1, end);
  const areas = {};
  const entryRe = /(?:^|\n)\s{2}(?:'([^']+)'|([A-Za-z0-9-]+)):\s*\{/g;
  const marks = [];
  let m;
  while ((m = entryRe.exec(body)) !== null) marks.push({ key: m[1] || m[2], at: m.index });
  for (let i = 0; i < marks.length; i++) {
    const chunk = body.slice(marks[i].at, i + 1 < marks.length ? marks[i + 1].at : body.length);
    const moduleMatch = chunk.match(/module:\s*'([^']+)'/);
    const rolesMatch = chunk.match(/roles:\s*\[([^\]]*)\]/);
    areas[marks[i].key] = {
      module: moduleMatch ? moduleMatch[1] : null,
      roles: rolesMatch ? rolesMatch[1].split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean) : [],
      title: (chunk.match(/title:\s*'([^']+)'/) || [])[1] || null,
      paths: [...new Set((chunk.match(/'\/[^']*'|`\/[^`]*`/g) || [])
        .map(s => s.slice(1, -1).split('${')[0].replace(/\/$/, ''))
        .filter(Boolean))],
      note: /note:\s*true/.test(chunk),
      columns: (chunk.match(/columns:\s*\[([^\]]*)\]/) || [])[1] || '',
      fields: [...chunk.matchAll(/field\('([^']+)'/g)].map(x => x[1]),
      stepsDetail: /stepsDetail:\s*true/.test(chunk),
      hasCreateForm: /fields:\s*\[\s*\]/.test(chunk) === false,
    };
  }
  return areas;
}

function extractBackendMounts() {
  const mounts = new Set();
  for (const [, m] of [...serverSrc.matchAll(/app\.use\('([^']+)',\s*require\('\.\/src\/routes/g)]) mounts.add(m);
  for (const [, m] of [...v1Src.matchAll(/mount:\s*'([^']+)'/g)]) mounts.add(m);
  return [...mounts];
}

function extractRoutes(src) {
  return [...src.matchAll(/path="([^"]+)"/g)].map(m => m[1]);
}

function pathMatchesRoute(apiPath, routePattern) {
  const apiSegs = apiPath.split('/').filter(Boolean);
  const routeSegs = routePattern.split('/').filter(Boolean);
  if (apiSegs.length !== routeSegs.length) return false;
  return routeSegs.every((seg, i) => seg.startsWith(':') || seg === apiSegs[i]);
}

function apiPathIsMounted(apiPath, mounts) {
  const segs = apiPath.split('/').filter(Boolean);
  if (apiPath.startsWith('/v1/')) return mounts.includes('/api/v1');
  return mounts.includes(`/api/${segs[0]}`);
}

function lookupKey(catalog, dotted) {
  // admin.json is the `admin` namespace itself; strip the prefix before resolving.
  const parts = (dotted.startsWith('admin.') ? dotted.slice('admin.'.length) : dotted).split('.');
  return parts.reduce((node, part) => (node == null ? undefined : node[part]), catalog);
}

const areas = extractAdminAreas(workspaceSrc);
const mounts = extractBackendMounts();
const routes = extractRoutes(appSrc);
const adminRouteOk = routes.some(r => r === 'admin/:area');

const EXPECTED_SCREENS = ['materials-recipes', 'maintenance', 'cost-codes', 'commercial-contracts', 'subcontractor-contracts', 'subcontractor-verifications', 'notification-rules', 'roles-matrix', 'workflow-templates'];
const EXTRA_KEYS = {
  'workflow-templates': ['admin.workflowTemplates.stepsTitle', 'admin.workflowTemplates.newInstancesNote', 'admin.actions.viewSteps', 'admin.actions.activate'],
};

const rows = [];
let gaps = 0;
const note = msg => { gaps++; return msg; };

for (const [key, area] of Object.entries(areas)) {
  const row = { screen: key, checks: [] };
  // 1. Route resolution
  row.checks.push(['route', adminRouteOk ? 'ok' : note('MISSING admin/:area route')]);
  // 2. Permission gating config
  row.checks.push(['gating', area.module && area.roles.length ? `ok (${area.module}: ${area.roles.join('/')})` : note('MISSING module/roles')]);
  // 3. Backend mounts for every called API path
  const unmounted = area.paths.filter(p => !apiPathIsMounted(p, mounts));
  row.checks.push(['api', unmounted.length ? note(`UNMOUNTED: ${unmounted.join(', ')}`) : `ok (${area.paths.join(', ') || 'none'})`]);
  // 4. i18n keys in both locales
  const missing = [];
  for (const locale of ['en', 'ar']) {
    const cat = i18n[locale];
    if (!area.title || !lookupKey(cat, `admin.${area.title}.title`)) missing.push(`${locale}:admin.${area.title}.title`);
    if (area.note && !lookupKey(cat, `admin.${area.title}.note`)) missing.push(`${locale}:admin.${area.title}.note`);
    for (const col of area.columns.split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean)) {
      if (!lookupKey(cat, `admin.fields.${col}`)) missing.push(`${locale}:admin.fields.${col}`);
    }
    for (const f of area.fields) {
      if (!lookupKey(cat, `admin.fields.${f}`)) missing.push(`${locale}:admin.fields.${f}`);
    }
    for (const dotted of EXTRA_KEYS[key] || []) {
      if (!lookupKey(cat, dotted)) missing.push(`${locale}:${dotted}`);
    }
  }
  row.checks.push(['i18n', missing.length ? note(`MISSING: ${missing.join(', ')}`) : 'ok']);
  rows.push(row);
}

const missingScreens = EXPECTED_SCREENS.filter(s => !areas[s]);
if (missingScreens.length) note(`MISSING SCREENS in ADMIN_AREAS: ${missingScreens.join(', ')}`);

// Sidebar entries must resolve to a real route.
const sidebarPaths = [...sidebarSrc.matchAll(/\{\s*path:\s*'([^']+)'/g)].map(m => m[1]);
const deadEntries = sidebarPaths.filter(p => !routes.some(r => pathMatchesRoute(p, r)));
if (deadEntries.length) note(`SIDEBAR entries with no route: ${deadEntries.join(', ')}`);

// Print report.
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('SCREEN', 30) + pad('ROUTE', 8) + pad('GATING', 8) + pad('API MOUNTS', 12) + pad('I18N', 6) + 'RESULT');
for (const row of rows) {
  const byName = Object.fromEntries(row.checks);
  const failed = row.checks.some(([, v]) => v !== 'ok' && !v.startsWith('ok '));
  console.log(
    pad(row.screen, 30) + pad(byName.route === 'ok' ? 'yes' : 'NO', 8)
    + pad(byName.gating === 'ok' || byName.gating.startsWith('ok ') ? 'yes' : 'NO', 8)
    + pad(byName.api === 'ok' || byName.api.startsWith('ok ') ? 'yes' : 'NO', 12)
    + pad(byName.i18n === 'ok' ? 'both' : 'NO', 6)
    + (failed ? 'GAP' : 'OK')
  );
  const problems = row.checks.filter(([, v]) => v !== 'ok' && !v.startsWith('ok '));
  for (const [name, v] of problems) console.log(`    [${name}] ${v}`);
}
if (missingScreens.length) console.log(`\nMissing expected screens: ${missingScreens.join(', ')}`);
if (deadEntries.length) console.log(`\nDead sidebar entries: ${deadEntries.join(', ')}`);
console.log(`\n${gaps === 0 ? 'ALL CONNECTIVITY CHECKS PASSED' : `${gaps} gap(s) found`} — ${rows.length} screens checked, ${mounts.length} backend mounts, ${routes.length} app routes, ${sidebarPaths.length} sidebar entries.`);
process.exit(gaps === 0 ? 0 : 1);
