const { securityHeaders, requestId, fixedWindowRateLimit, validateRuntimeConfig } = require('../../middleware/security');

function response() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

describe('production security middleware', () => {
  test('sets browser hardening headers', () => {
    const res = response(); const next = jest.fn();
    securityHeaders({}, res, next);
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(res.headers['X-Frame-Options']).toBe('DENY');
    expect(res.headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(next).toHaveBeenCalled();
  });

  test('honors valid request ids and replaces unsafe values', () => {
    const valid = response();
    const req = { headers: { 'x-request-id': 'manual-test-123' } };
    requestId(req, valid, () => {});
    expect(req.requestId).toBe('manual-test-123');

    const unsafe = { headers: { 'x-request-id': '<script>' } };
    requestId(unsafe, response(), () => {});
    expect(unsafe.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('rate limiter blocks only after its configured allowance', () => {
    const middleware = fixedWindowRateLimit({ windowMs: 60000, limit: 2 });
    const req = { ip: '127.0.0.1' };
    for (let i = 0; i < 2; i++) {
      const next = jest.fn(); middleware(req, response(), next); expect(next).toHaveBeenCalled();
    }
    const blocked = response(); const next = jest.fn();
    middleware(req, blocked, next);
    expect(blocked.statusCode).toBe(429);
    expect(next).not.toHaveBeenCalled();
  });

  test('production requires strong secrets and database credentials', () => {
    expect(() => validateRuntimeConfig({ NODE_ENV: 'production', JWT_SECRET: 'short', DB_PASSWORD: 'db-secret' })).toThrow('32 characters');
    expect(() => validateRuntimeConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32), DB_PASSWORD: '' })).toThrow('DB_PASSWORD');
    expect(() => validateRuntimeConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32), DB_PASSWORD: 'db-secret' })).not.toThrow();
  });
});
