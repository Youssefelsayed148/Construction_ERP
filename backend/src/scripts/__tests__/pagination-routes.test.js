'use strict';

const fs = require('fs');
const path = require('path');

const serverFile = path.resolve(__dirname, '../../../server.js');
const serverRoot = path.resolve(__dirname, '../../..');
const finiteReference = new Set([
  '/api/docs/categories',
  '/api/documents/categories',
  '/api/expenses/categories',
  '/api/notifications/preferences',
  '/api/projects/templates',
  '/api/suppliers/specialties',
  '/api/users/preview/roles',
]);
const exportOrScalar = /(?:^|\/)(?:pdf|export|download|health|openapi\.json|summary|dashboard|analytics|metrics|unread-count)(?:\/|$)/i;

function walkRouter(stack, prefix, routes) {
  for (const layer of stack) {
    if (layer.route && layer.route.methods.get) {
      for (const routePath of [layer.route.path].flat()) {
        routes.push({ path: `${prefix}${routePath === '/' ? '' : routePath}`, handlers: layer.route.stack.map((entry) => entry.handle) });
      }
    } else if (layer.handle?.stack) {
      if (layer.regexp.fast_slash) { walkRouter(layer.handle.stack, prefix, routes); continue; }
      const mount = layer.regexp.source.match(/^\^\\\/(.*?)(?:\\\/)?\(\?=/);
      if (!mount) throw new Error(`Unsupported router mount while enumerating GET routes: ${layer.regexp.source}`);
      walkRouter(layer.handle.stack, `${prefix}/${mount[1].replace(/\\\//g, '/')}`, routes);
    }
  }
}

function enumerateMountedGetRoutes() {
  // Router modules instantiate auth helpers at import time. Supply an
  // ephemeral test-only key; this audit never creates or verifies tokens.
  const previousJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'pagination-route-audit-test-key-not-for-auth';
  const source = fs.readFileSync(serverFile, 'utf8');
  const mounts = [...source.matchAll(/app\.use\('([^']+)', require\('([^']+)'\)(\.buildV1Router\(\))?\);/g)];
  const routes = [];
  try {
    for (const [, prefix, modulePath, buildV1] of mounts) {
      const exported = require(path.resolve(serverRoot, modulePath));
      const router = buildV1 ? exported.buildV1Router() : exported;
      walkRouter(router.stack, prefix, routes);
    }
  } finally {
    if (previousJwtSecret == null) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwtSecret;
  }
  return routes;
}

function isCollection(route) {
  const endpoint = route.path.replace(/^\/api\/v1/, '/api');
  if (finiteReference.has(endpoint) || exportOrScalar.test(endpoint)) return false;
  // v1 remounts the same internal handlers. Audit those registered handlers
  // once, except webhooks: its v1 adapter has its own paging contract.
  if (route.path.startsWith('/api/v1/') && endpoint !== '/api/webhooks') return false;
  // A single terminal :id is a record read. Nested children of a record remain
  // collection candidates (for example /:id/revisions).
  if (/\/(?:\:id|\:id\([^)]*\))\/?$/.test(endpoint)) return false;
  const source = route.handlers.map((handler) => handler.toString()).join('\n');
  if (!/res\.(?:json|send)\s*\(/.test(source) || /\bdata\s*:\s*[\w$.]+\s*\.\s*rows\s*\[\s*0\s*\]/.test(source)) return false;
  return /\bdata\s*:\s*[\w$.]+\s*\.\s*(?:rows|map)\b/.test(source)
    || /\bdata\s*:\s*(?:rows|projects|projectIds|contracts|tokens|reviews|activities|alerts|photos|notes|instructions|visits|assignments|records|items|results)\b/i.test(source)
    || /(?:const|let)\s+\w+\s*=\s*\[/.test(source)
    || /(?:const|let)\s+\w+\s*=\s*await\s+[\w.]+(?:list|projects|reviews|photos|notes|instructions|visits)\s*\(/i.test(source);
}

function isPaginated(route) {
  const source = route.handlers.map((handler) => handler.toString()).join('\n');
  return /\b(?:queryPaginated|paginateRows|paginatedReader)\s*\(/.test(source)
    || /X-Total-Count/.test(source)
    || /req\.query\.(?:offset|limit|per_page)/.test(source);
}

function findUnpaginated(routes) {
  return routes.filter(isCollection).filter((route) => !isPaginated(route)).map((route) => route.path).sort();
}

describe('R4.4 mounted GET route pagination coverage', () => {
  test('every mounted collection route is paginated or has a documented finite/export exemption', () => {
    const routes = enumerateMountedGetRoutes();
    const collections = routes.filter(isCollection);
    const unpaginated = findUnpaginated(routes);
    expect(routes.length).toBeGreaterThan(300);
    expect(collections.length).toBeGreaterThanOrEqual(73);
    expect(unpaginated).toEqual([]);
  });

  test('the route-table audit detects an injected unbounded child collection', () => {
    const express = require('express');
    const injectedRouter = express.Router();
    injectedRouter.get('/:id/child-records', async function injectedUnbounded(req, res) {
      const rows = await query('SELECT * FROM child_records WHERE parent_id = $1', [req.params.id]);
      return res.json({ success: true, data: rows.rows });
    });
    const added = [];
    walkRouter(injectedRouter.stack, '/api/inventory', added);
    expect(findUnpaginated(added)).toEqual(['/api/inventory/:id/child-records']);
    injectedRouter.stack.pop(); // Revert the temporary route after proving detection.
    expect(injectedRouter.stack).toHaveLength(0);
  });
});
