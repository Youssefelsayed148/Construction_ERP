'use strict';

const { createPostgresRateLimit } = require('../../middleware/postgresRateLimit');

function response() {
  return { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; return this; }, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } };
}

describe('PostgreSQL fixed-window rate limiter', () => {
  test('uses an atomic per-scope, hashed-key upsert and admits requests under the limit', async () => {
    const q = jest.fn().mockResolvedValue({ rows: [{ hit_count: 2 }] });
    const middleware = createPostgresRateLimit({ scope: 'login', windowMs: 60_000, limit: 5, query: q });
    const req = { ip: '198.51.100.22', path: '/login' };
    const res = response(); const next = jest.fn();
    await middleware(req, res, next);
    expect(q.mock.calls[0][0]).toContain('ON CONFLICT (scope, subject_hash, window_start) DO UPDATE');
    expect(q.mock.calls[0][0]).toContain('hit_count = distributed_rate_limits.hit_count + 1');
    expect(q.mock.calls[0][1][0]).toBe('login');
    expect(q.mock.calls[0][1][1]).not.toContain(req.ip);
    expect(res.headers).toMatchObject({ 'X-RateLimit-Limit': '5', 'X-RateLimit-Remaining': '3' });
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('returns typed 429 after the shared count exceeds the limit', async () => {
    const q = jest.fn().mockResolvedValue({ rows: [{ hit_count: 6 }] });
    const middleware = createPostgresRateLimit({ scope: 'login', windowMs: 60_000, limit: 5, query: q });
    const res = response(); const next = jest.fn();
    await middleware({ ip: '198.51.100.22', path: '/login' }, res, next);
    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBeDefined();
    expect(res.body).toMatchObject({ success: false, error_code: 'rate_limited', error_key: 'errors.rateLimited' });
    expect(next).not.toHaveBeenCalled();
  });

  test('fails closed with typed 503 when Postgres is unavailable', async () => {
    const q = jest.fn().mockRejectedValue(new Error('private database detail'));
    const middleware = createPostgresRateLimit({ scope: 'login', windowMs: 60_000, limit: 5, query: q });
    const res = response(); const next = jest.fn();
    await middleware({ ip: '198.51.100.22', path: '/login' }, res, next);
    expect(res.statusCode).toBe(503);
    expect(res.headers['Retry-After']).toBe('5');
    expect(res.body).toMatchObject({ success: false, error_code: 'rate_limit_unavailable', error_key: 'errors.rateLimitUnavailable' });
    expect(JSON.stringify(res.body)).not.toContain('private database detail');
    expect(next).not.toHaveBeenCalled();
  });
});
