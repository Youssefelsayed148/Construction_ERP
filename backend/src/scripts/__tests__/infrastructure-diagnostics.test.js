'use strict';

jest.mock('../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../services/tokens', () => ({ verify: jest.fn(() => ({ userId: 7 })) }));
jest.mock('../../services/oauthService', () => ({}));
const { query } = require('../../config/database');
const { authenticate } = require('../../middleware/auth');
const { createPostgresRateLimit } = require('../../middleware/postgresRateLimit');
const v1 = require('../../middleware/v1');

const response = () => ({ statusCode: 200, headers: {},
  setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; },
  json(body) { this.body = body; return this; } });

describe('redacted infrastructure diagnostics preserve failure responses', () => {
  let log;
  const failure = () => Object.assign(new Error('private parameter and credential data'), {
    code: '55P03', detail: 'private parameters', parameters: ['private value'],
  });
  beforeEach(() => { jest.clearAllMocks(); log = jest.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => log.mockRestore());
  const assertLog = prefix => {
    expect(log).toHaveBeenCalledWith(prefix, { code: '55P03', name: 'Error', messageClass: 'other' });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|credential|parameters/);
  };

  test('shared limiter logs the database error and preserves its exact 503 response', async () => {
    const limiter = createPostgresRateLimit({ scope: 'diag', windowMs: 1000, limit: 1, query: jest.fn().mockRejectedValue(failure()) });
    const res = response(); const next = jest.fn();
    await limiter({ ip: '127.0.0.1' }, res, next);
    expect(res.statusCode).toBe(503); expect(res.headers).toEqual({ 'Retry-After': '5' });
    expect(res.body).toEqual({ success: false, error: 'Rate limit service unavailable. Please retry shortly.',
      error_code: 'rate_limit_unavailable', error_key: 'errors.rateLimitUnavailable', error_params: {} });
    expect(next).not.toHaveBeenCalled(); assertLog('[RATE_LIMIT] unavailable');
  });

  test('authenticated v1 limiter preserves the exact forwarded failure', async () => {
    const next = jest.fn();
    await v1.createAuthenticatedRateLimit(jest.fn().mockRejectedValue(failure()), 1)({ user: { id: 7 } }, response(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 503, code: 'rate_limit_unavailable', message: 'Rate limit service unavailable' }));
    assertLog('[V1_RATE_LIMIT] unavailable');
  });

  test.each([true, false])('idempotency lookup preserves required=%s behavior', async required => {
    query.mockRejectedValue(failure());
    const next = jest.fn();
    await v1.idempotency({ method: 'POST', headers: { 'idempotency-key': 'diag' }, originalUrl: '/api/test', body: {}, requireIdempotencyKey: required }, response(), next);
    if (required) expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 503, code: 'idempotency_unavailable', message: 'Idempotency storage is unavailable' }));
    else expect(next).toHaveBeenCalledWith();
    assertLog('[V1] idempotency lookup failed:');
  });

  test.each([false, true])('authentication logs generic/typed database failures (typed=%s)', async typed => {
    const error = failure();
    if (typed) Object.assign(error, { status: 504, error_code: 'database_timeout', error_key: 'errors.databaseTimeout', retryAfter: 1 });
    query.mockRejectedValue(error);
    const res = response(); const next = jest.fn();
    await authenticate({ headers: { authorization: 'Bearer fixture' } }, res, next);
    expect(res.statusCode).toBe(typed ? 504 : 503);
    expect(res.headers).toEqual({ 'Retry-After': typed ? '1' : '5' });
    expect(res.body).toEqual(typed
      ? { success: false, error: 'Database operation temporarily unavailable', error_code: 'database_timeout', error_key: 'errors.databaseTimeout', error_params: {} }
      : { success: false, error: 'Authentication service temporarily unavailable', error_code: 'authentication_unavailable', error_key: 'errors.authenticationUnavailable', error_params: {} });
    expect(next).not.toHaveBeenCalled(); assertLog('[AUTH] unavailable');
  });

  test('connection timeouts have a fixed message class and unsafe metadata is discarded', async () => {
    query.mockRejectedValue(Object.assign(new Error('timeout exceeded when trying to connect: private detail'), { code: 'private detail', name: 'Error\nprivate detail' }));
    await authenticate({ headers: { authorization: 'Bearer fixture' } }, response(), jest.fn());
    expect(log).toHaveBeenCalledWith('[AUTH] unavailable', { code: 'unknown', name: 'Error', messageClass: 'connection_timeout' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  });
});
