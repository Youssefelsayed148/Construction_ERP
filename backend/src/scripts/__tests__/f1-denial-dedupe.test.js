'use strict';

// F1: denial audit is rate capped per user+module+method+path+reason and bounded in memory;
// a logging failure never changes the 403.
jest.mock('dotenv', () => ({ config: jest.fn() }));
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f1-fixture-only-secret-longer-than-32';
jest.mock('../../config/database', () => ({ query: jest.fn(), pool: { query: jest.fn(), on: jest.fn() } }));
jest.mock('../../services/policy', () => ({
  recordAuditEvent: jest.fn().mockResolvedValue({}),
  evaluateRequest: jest.fn().mockResolvedValue({ allowed: false }),
  moduleFromRequest: () => 'finance',
}));

const policy = require('../../services/policy');
const auth = require('../../middleware/auth');

const mkReq = (id, path = '/x') => ({ user: { id, role: 'viewer' }, method: 'GET', path, ip: '1.1.1.1', originalUrl: path });
const after = (path = '/x') => ({ module: 'finance', method: 'GET', path, reason: 'policy_denied' });

beforeEach(() => { auth._resetDenialWindow(); policy.recordAuditEvent.mockClear(); policy.recordAuditEvent.mockResolvedValue({}); });

test('a burst of identical denials writes exactly one audit row', async () => {
  for (let i = 0; i < 50; i++) await auth._logDenial(mkReq(1), after());
  expect(policy.recordAuditEvent).toHaveBeenCalledTimes(1);
});

test('different user or path is logged separately', async () => {
  await auth._logDenial(mkReq(1), after('/a'));
  await auth._logDenial(mkReq(2), after('/a'));
  await auth._logDenial(mkReq(1), after('/b'));
  expect(policy.recordAuditEvent).toHaveBeenCalledTimes(3);
});

test('the map is bounded', async () => {
  for (let i = 0; i < 6000; i++) await auth._logDenial(mkReq(i), after());
  expect(auth._denialMapSize()).toBeLessThanOrEqual(5000);
});

test('the 403 is returned even when the audit write fails', async () => {
  policy.recordAuditEvent.mockRejectedValue(new Error('db down'));
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  await auth.authorize()(mkReq(9), res, next);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(next).not.toHaveBeenCalled();
  spy.mockRestore();
});
