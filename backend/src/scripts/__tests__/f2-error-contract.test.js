'use strict';

// F2 error contract: the route groups converted off `error: e.message` answer an unexpected failure with
// 500 / internal_error / { request_id } and never leak the underlying message. Auth is stubbed and the database
// fails; one representative db-backed GET per route group (not one test per route). 4xx business errors keep
// their message under their own stable code: covered for the shared helper in c2-error-contract.test.js and
// for the service errors in f1-typed-service-errors.test.js.
jest.mock('dotenv', () => ({ config: jest.fn() }));
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f2-fixture-only-secret-longer-than-32';

jest.mock('../../config/database', () => {
  const query = jest.fn(() => Promise.reject(new Error('db fixture unavailable')));
  return { query, pool: { query, on: jest.fn() }, healthCheck: jest.fn(), transaction: query };
});
jest.mock('../../middleware/auth', () => {
  const user = { id: 1, name: 'Fixture', role: 'owner' };
  const scope = (req) => { req.user = user; req.policy = { allowed: true, company_wide: true, project_id: null }; req.accessScope = { companyWide: true, projectIds: [] }; };
  return {
    authenticate: (req, _res, next) => { scope(req); next(); },
    authorize: () => (_req, _res, next) => next(),
    authorizeSelfSession: (_req, _res, next) => next(),
    authenticateToken: (req, _res, next) => { scope(req); next(); },
  };
});

const express = require('express');

// [route module, mount, db-backed GET path]
// client, consultant and portal are deliberately absent: their read engines (clientPortalEngine, consultantEngine,
// portalEngine) swallow db errors into empty 200 payloads (pre-existing, tracked by the catch-to-zero lint ratchet),
// so a failing db never reaches the converted catch blocks from a GET.
const GROUPS = [
  ['actions', '/api/actions', '/my'],
  ['assets', '/api/assets', '/'],
  ['boq', '/api/boq', '/sections/1'],
  ['clients', '/api/clients', '/'],
  ['costing', '/api/costing', '/codes'],
  ['doccontrol', '/api/docs', '/categories'],
  ['expenses', '/api/expenses', '/1'],
  ['finance', '/api/finance', '/project/1'],
  ['financeLedger', '/api/finance-ledger', '/retention'],
  ['handover', '/api/handover', '/process/1'],
  ['hse', '/api/hse', '/incidents'],
  ['items', '/api/items', '/'],
  ['legal', '/api/legal', '/'],
  ['locations', '/api/locations', '/project/1'],
  ['maintenance', '/api/maintenance', '/'],
  ['materials', '/api/materials', '/recipes'],
  ['payroll', '/api/payroll', '/'],
  ['qhse', '/api/qhse', '/quality-tests'],
  ['quantities', '/api/quantities', '/allocations/1'],
  ['reports', '/api/reports', '/saved-views'],
  ['schedule', '/api/schedule', '/calendars'],
  ['site', '/api/projects', '/1/site-reports'],
  ['subcontractors', '/api/subcontractors', '/'],
  ['suppliers', '/api/suppliers', '/'],
  ['units', '/api/sales', '/buildings'],
  ['users', '/api/users', '/'],
  ['workorders', '/api/work-orders', '/project/1'],
];

const app = express();
app.use(express.json());
for (const [name, mount] of GROUPS) app.use(mount, require(`../../routes/${name}`));
const server = require('http').createServer(app);
let base;
beforeAll(async () => { await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`; });
afterAll(async () => { await new Promise((r) => server.close(r)); });

describe.each(GROUPS)('F2 error contract: %s', (name, mount, path) => {
  test('an unexpected db failure is a 500 internal_error with a request id and no leaked message', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await fetch(`${base}${mount}${path}`);
    const body = await res.json();
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error_code).toBe('internal_error');
    expect(body.error_params.request_id).toBeTruthy();
    expect(JSON.stringify(body)).not.toMatch(/db fixture unavailable/);
  });
});
