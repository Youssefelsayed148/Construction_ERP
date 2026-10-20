'use strict';

// C2 error contract: every converted demo-path route answers failures with a
// stable error_code (+ error_params) while keeping the English `error` string
// for logs and old clients. This suite mounts each converted router with
// authentication stubbed and the database failing, then asserts the response
// shape is stable per route:
//   - a request-validation failure -> 400 / its stable code (+ params)
//   - an unexpected failure        -> 500 / internal_error / { request_id }
//     (no internal message leaks)

jest.mock('dotenv', () => ({ config: jest.fn() }));
process.env.JWT_SECRET = process.env.JWT_SECRET || 'c2-fixture-only-secret-longer-than-32';

jest.mock('../../config/database', () => {
  const query = jest.fn(() => Promise.reject(new Error('db fixture unavailable')));
  return { query, pool: { query, on: jest.fn() }, healthCheck: jest.fn(), transaction: query };
});

jest.mock('../../middleware/auth', () => ({
  authenticate: (req, _res, next) => { req.user = { id: 1, name: 'Fixture', role: 'owner' }; next(); },
  authorize: () => (_req, _res, next) => next(),
  authenticateToken: (req, _res, next) => { req.user = { id: 1, name: 'Fixture', role: 'owner' }; next(); },
}));

const express = require('express');

// Per route: [validation method, path, body, expected error_code, expected status]
// and a db-backed path whose failure must become internal_error.
const ROUTES = {
  invoices: [['POST', '/', { project_id: 1, client_id: 1 }, 'validation_error', 400], '/'],
  payments: [['POST', '/', {}, 'validation_error', 400], '/'],
  procurement: [['POST', '/pr', { project_id: 1, title: 'x' }, 'validation_error', 400], '/project/1'],
  warehouses: [['POST', '/', {}, 'validation_error', 400], '/'],
  hr: [['POST', '/employees', {}, 'validation_error', 400], '/employees'],
  commercial: [['POST', '/contracts', {}, 'validation_error', 400], '/contracts/1'],
  inventory: [['POST', '/conversions', {}, 'validation_error', 400], '/lots'],
  notifications: [['PUT', '/preferences', {}, 'invalid_notification_preference', 400], '/'],
  projects: [['POST', '/', {}, 'validation_error', 400], '/'],
  approvals: [['POST', '/request', { module_name: 'nope' }, 'unknown_approval_module', 400], '/pending'],
};

const app = express();
app.use(express.json());
for (const [name] of Object.entries(ROUTES)) {
  app.use(`/api/${name}`, require(`../../routes/${name}`));
}
const server = require('http').createServer(app);

let base;

beforeAll(async () => {
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });

describe.each(Object.keys(ROUTES))('C2 error contract: %s', (name) => {
  const [[method, path, body, expectedCode, expectedStatus], dbPath] = ROUTES[name];

  test(`validation failure keeps a stable ${expectedCode} code with params`, async () => {
    const result = await fetch(`${base}/api/${name}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(result.status).toBe(expectedStatus);
    const json = await result.json();
    expect(json).toMatchObject({ success: false, error_code: expectedCode });
    expect(json.error_params).toEqual(expect.any(Object));
    expect(typeof json.error).toBe('string');
  });

  test('an unexpected failure answers 500 internal_error with a request id and no leaked message', async () => {
    const result = await fetch(`${base}/api/${name}${dbPath}`);
    const json = await result.json();
    expect(json).toMatchObject({ success: false, error_code: 'internal_error' });
    expect(json.error_params.request_id).toEqual(expect.any(String));
    expect(json.error).not.toContain('db fixture unavailable');
  });
});
