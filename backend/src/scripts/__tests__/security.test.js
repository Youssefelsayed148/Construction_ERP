const { securityHeaders, requestId, sanitizeServerError, fixedWindowRateLimit, validateRuntimeConfig, validateCorsOrigins, parseTrustProxy } = require('../../middleware/security');

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

  test('TRUST_PROXY accepts explicit booleans or hop counts and rejects ambiguous values', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('2')).toBe(2);
    expect(() => parseTrustProxy('all')).toThrow('TRUST_PROXY');
  });

  test('CORS allowlist accepts exact origins and rejects wildcard/path/cleartext production origins', () => {
    expect(validateCorsOrigins('https://app.example.com', ['https://partner.example.com'], true)).toEqual([
      'https://app.example.com', 'https://partner.example.com',
    ]);
    expect(() => validateCorsOrigins('https://app.example.com', ['https://*.example.com'], true)).toThrow('wildcards');
    expect(() => validateCorsOrigins('https://app.example.com/path', [], true)).toThrow('scheme and host');
    expect(() => validateCorsOrigins('http://app.example.com', [], true)).toThrow('HTTPS');
    expect(validateCorsOrigins('http://localhost:8090', [], true, true)).toEqual(['http://localhost:8090']);
    expect(() => validateCorsOrigins('http://app.example.com', [], true, true)).toThrow('HTTPS');
  });

  test('genericizes untyped 500 responses, logs details, and retains typed error envelopes', () => {
    const log = jest.fn();
    const req = { requestId: 'request-123' };
    const res = response();
    res.statusCode = 500;
    const next = jest.fn();
    sanitizeServerError(log)(req, res, next);
    res.json({ success: false, error: 'password database connection detail' });
    expect(res.body).toEqual({ success: false, error: 'The request could not be completed', error_code: 'internal_error', request_id: 'request-123' });
    expect(log).toHaveBeenCalledWith('[API] request_id=request-123', 'password database connection detail');
    const typed = response(); typed.statusCode = 500;
    sanitizeServerError(log)(req, typed, next);
    typed.json({ success: false, error: 'Account is not mapped', error_code: 'ledger_account_not_mapped' });
    expect(typed.body.error).toBe('Account is not mapped');
  });
});
