'use strict';

const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, '../../routes');

// Reference collections are intentionally finite and small. Keep the reason
// beside each exemption so a growing business list cannot silently enter here.
const referenceAllowlist = {
  'doccontrol.js:/categories': 'Admin-managed document taxonomy used as a selector.',
  'expenses.js:/categories': 'Static expense category codes.',
  'notifications.js:/preferences': 'Per-user event/channel preferences are drawn from finite application registries.',
  'projects.js:/templates': 'Versioned project starter templates, bounded by product configuration.',
  'suppliers.js:/specialties': 'Static supplier specialty codes.',
  'users.js:/preview/roles': 'The finite system role catalogue.',
};

function matchingBrace(source, open) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; index += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (char === '\'' || char === '"' || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return index;
  }
  return -1;
}

function listRouteKeys(source, file) {
  const found = [];
  const route = /router\.get\(\s*(['"`])([^'"`]+)\1\s*,/g;
  let match;
  while ((match = route.exec(source))) {
    const arrow = source.indexOf('=>', route.lastIndex);
    const open = source.indexOf('{', arrow);
    if (arrow < 0 || open < 0) continue;
    const close = matchingBrace(source, open);
    if (close < 0) continue;
    const body = source.slice(open, close + 1);
    const endpoint = match[2];
    if (/\/:id(?:\/|$)|\/(?:pdf|export|download|health|openapi\.json|summary|dashboard|analytics|metrics)(?:\/|$)/i.test(endpoint)) continue;
    if (!/res\.(?:json|send)\s*\(/.test(body)) continue;
    if (/\bdata\s*:\s*\w+\s*\.\s*rows\s*\[\s*0\s*\]/.test(body)) continue;
    const dataValue = body.match(/\bdata\s*:\s*([\w$.]+(?:\s*\.\s*rows)?)/)?.[1]?.replace(/\s/g, '');
    if (!dataValue || dataValue.startsWith('data.')) continue;
    const variable = dataValue.split('.').at(-1);
    const collection = /\.rows$|\.map$/.test(dataValue)
      || /^(?:rows|projects|projectIds|contracts|tokens|reviews|activities|alerts|photos|notes|instructions|visits|assignments|records|items|results)$/i.test(variable)
      || new RegExp(`(?:const|let)\\s+${variable}\\s*=\\s*\\[`).test(body)
      || new RegExp(`(?:const|let)\\s+${variable}\\s*=\\s*await\\s+[\\w.]+(?:list|projects|reviews|photos|notes|instructions|visits)\\s*\\(`, 'i').test(body);
    if (!collection) continue;
    found.push({ key: `${file}:${endpoint}`, body });
  }
  return found;
}

describe('R4.4 route-enumerated pagination coverage', () => {
  test('every collection GET is paginated or has a documented finite-reference exemption', () => {
    const candidates = [];
    for (const file of fs.readdirSync(routesDir).filter((name) => name.endsWith('.js'))) {
      const source = fs.readFileSync(path.join(routesDir, file), 'utf8');
      for (const route of listRouteKeys(source, file)) candidates.push(route);
    }
    const unbounded = candidates
      .filter(({ key, body }) => !/(?:queryPaginated|paginateRows|paginatedReader|listQuery)\s*\(/.test(body) && !/\bLIMIT\b/i.test(body) && !referenceAllowlist[key])
      .map(({ key }) => key)
      .sort();

    expect({ count: candidates.length, unbounded }).toEqual({
      count: expect.any(Number),
      unbounded: [],
    });
    expect(candidates.length).toBeGreaterThanOrEqual(73);
  });
});
