// Phase 26 — OpenAPI 3.0 spec GENERATED FROM SOURCE.
//
// The path inventory is introspected from the mounted v1 router's stack —
// the same source of truth the server dispatches on — so the spec can never
// drift from the API. Only documentation metadata (tags, servers, security
// schemes) is added here. Serve at GET /api/v1/openapi.json.

'use strict';

const { FAMILIES, ISSUER, AUDIENCE } = require('../services/oauthService');

function paramsForPath(path) {
  const names = [...path.matchAll(/:([A-Za-z_]+)/g)].map((m) => m[1]);
  return names.map((name) => ({
    name,
    in: 'path',
    required: true,
    schema: { type: 'integer' },
  }));
}

function introspect(v1Routers) {
  const paths = {};
  for (const v1Router of v1Routers) {
    for (const layer of v1Router.stack) {
      if (!layer.route) continue;
      const route = layer.route;
      let path = route.path.replace(/\(approve\|reject\)/, ''); // /:id/:action stays a path param
      if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1); // '/projects/' → '/projects'
      const entry = (paths[path] = paths[path] || {});
      for (const [method, on] of Object.entries(route.methods)) {
        if (!on) continue;
        const m = method.toLowerCase();
        if (entry[m]) continue; // first registration wins (matches dispatch order)
        entry[m] = {
          tags: [path.split('/').filter(Boolean)[0] || 'other'],
          summary: `${method.toUpperCase()} ${path}`,
          parameters: paramsForPath(path),
          responses: {
            '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } } },
            '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
            '401': { description: 'Unauthenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
            '403': { description: 'Forbidden (insufficient permissions or scope)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
            '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
            '429': { description: 'Rate limited', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
          },
          'x-idempotency': method.toLowerCase() === 'post'
            ? 'Honors the Idempotency-Key header; replayed responses are identical to the original.'
            : undefined,
        };
      }
    }
  }
  return paths;
}

function buildOpenApi({ v1Router, v1Routers, servers = ['/api/v1'] }) {
  const paths = introspect(v1Routers || [v1Router]);
  return {
    openapi: '3.0.3',
    info: {
      title: 'Construction ERP External API',
      version: '1.0.0',
      description: [
        'Versioned external API. Internal UI calls and v1 calls share the exact',
        'same handler chains and permission engine, so a token acts with the',
        'same permissions as the equivalent UI session for the same user.',
        '',
        'Auth: POST /oauth/token (grant_type=password for user-delegated access,',
        'grant_type=client_credentials for service accounts). Bearer tokens carry',
        'scopes like "projects:read". Internal UI JWTs are also accepted at full',
        'permission parity.',
        '',
        'Every response carries an X-Request-ID correlation id; errors use the',
        '{"error":{"code","message","correlation_id","details"}} shape. POST',
        'endpoints honor the Idempotency-Key header. List endpoints support',
        '?page, ?per_page, ?sort=-field, ?filter[field]=value.',
      ].join('\n'),
    },
    servers: servers.map((url) => ({ url })),
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        SuccessEnvelope: {
          type: 'object',
          properties: { success: { type: 'boolean' }, data: {}, meta: { type: 'object', nullable: true } },
        },
        ErrorEnvelope: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message', 'correlation_id'],
              properties: {
                code: { type: 'string', example: 'validation_error' },
                message: { type: 'string' },
                correlation_id: { type: 'string', example: 'b8e3c4a2-...' },
                details: {},
              },
            },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: FAMILIES.map((name) => ({ name })),
    paths,
    'x-audience': AUDIENCE,
    'x-issuer': ISSUER,
    'x-webhook-events': require('../services/webhookService').EVENT_CATALOG,
  };
}

module.exports = buildOpenApi;
