'use strict';

const { decorateDatabaseError, pgPoolOptions, httpServerTimeouts } = require('../../utils/databaseResilience');
const { createShutdownHandler } = require('../../utils/serverShutdown');
const { poolMetrics } = require('../../utils/poolMetrics');

describe('R4.3 database and shutdown resilience', () => {
  test('maps query cancellation and infrastructure failures to typed retryable HTTP errors', () => {
    expect(decorateDatabaseError(Object.assign(new Error('cancel'), { code: '57014' }))).toMatchObject({
      status: 504, error_code: 'database_timeout', error_key: 'errors.databaseTimeout',
    });
    expect(decorateDatabaseError(Object.assign(new Error('idle transaction timeout'), { code: '25P03' }))).toMatchObject({ status: 504, error_code: 'database_timeout' });
    expect(decorateDatabaseError(Object.assign(new Error('pool full'), { code: '53300' }))).toMatchObject({
      status: 503, error_code: 'database_unavailable', error_key: 'errors.databaseUnavailable', retryAfter: 5,
    });
  });

  test('uses bounded session timeouts and rejects unsafe timeout configuration', () => {
    expect(pgPoolOptions({ DB_STATEMENT_TIMEOUT_MS: '25000', DB_IDLE_TX_TIMEOUT_MS: '60000', DB_LOCK_TIMEOUT_MS: '5000' }).options)
      .toContain('statement_timeout=25000');
    expect(pgPoolOptions({}).options).toContain('idle_in_transaction_session_timeout=60000');
    expect(() => pgPoolOptions({ DB_STATEMENT_TIMEOUT_MS: '-1' })).toThrow('DB_STATEMENT_TIMEOUT_MS');
    expect(httpServerTimeouts({})).toMatchObject({ headersTimeout: 15000, requestTimeout: 120000, keepAliveTimeout: 5000, timeout: 120000 });
    expect(() => httpServerTimeouts({ HTTP_HEADERS_TIMEOUT_MS: '20000', HTTP_REQUEST_TIMEOUT_MS: '10000' })).toThrow('must be less than');
  });

  test('pool metrics expose only bounded counts and capacity', () => {
    const metrics = poolMetrics({ totalCount: 4, idleCount: 2, waitingCount: 3, options: { max: 20 }, password: 'never expose' });
    expect(metrics).toEqual({ total: 4, idle: 2, waiting: 3, max: 20 });
    expect(JSON.stringify(metrics)).not.toContain('password');
  });

  test('shutdown stops background work, drains HTTP, closes the pool, and exits cleanly', async () => {
    const calls = [];
    const server = { close(callback) { calls.push('close'); callback(); }, closeAllConnections() { calls.push('force-close'); } };
    const shutdown = createShutdownHandler({
      server, stopBackground: async () => calls.push('background'), pool: { end: async () => calls.push('pool') },
      timeoutMs: 100, exit: (code) => calls.push(`exit:${code}`),
    });
    await shutdown('SIGTERM');
    expect(calls).toEqual(['close', 'background', 'pool', 'exit:0']);
  });

  test('shutdown force-closes HTTP at its deadline and still bounds pool close', async () => {
    const calls = [];
    const shutdown = createShutdownHandler({
      server: { close() {}, closeAllConnections() { calls.push('force-close'); } },
      stopBackground: async () => {}, pool: { end: async () => calls.push('pool') },
      timeoutMs: 10, exit: (code) => calls.push(`exit:${code}`), logger: {},
    });
    await shutdown('SIGINT');
    expect(calls).toEqual(['force-close', 'pool', 'exit:1']);
  });

  test('a pool that does not drain cannot hold shutdown open indefinitely', async () => {
    const calls = [];
    const shutdown = createShutdownHandler({
      server: { close(callback) { callback(); } }, stopBackground: async () => {}, pool: { end: () => new Promise(() => {}) },
      timeoutMs: 10, exit: (code) => calls.push(`exit:${code}`), logger: {},
    });
    await shutdown('SIGTERM');
    expect(calls).toEqual(['exit:1']);
  });
});
