const { securityHeaders, requestId, sanitizeServerError, validateRuntimeConfig, validateCorsOrigins, parseTrustProxy } = require('../../middleware/security');
const { createPostgresRateLimit } = require('../../middleware/postgresRateLimit');
const express = require('express');
const proxyaddr = require('proxy-addr');

function proxyRequest(trustProxy, forwardedFor) {
  const app = express();
  app.set('trust proxy', trustProxy);
  const req = Object.create(app.request);
  req.app = app;
  req.socket = { remoteAddress: '203.0.113.7' };
  req.headers = forwardedFor ? { 'x-forwarded-for': forwardedFor } : {};
  return req;
}

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

  test('PostgreSQL rate limiter blocks only after its configured allowance', async () => {
    let count = 0;
    const middleware = createPostgresRateLimit({ scope: 'test', windowMs: 60000, limit: 2, query: async () => ({ rows: [{ hit_count: ++count }] }) });
    const req = { ip: '127.0.0.1' };
    for (let i = 0; i < 2; i++) {
      const next = jest.fn(); await middleware(req, response(), next); expect(next).toHaveBeenCalled();
    }
    const blocked = response(); const next = jest.fn();
    await middleware(req, blocked, next);
    expect(blocked.statusCode).toBe(429);
    expect(next).not.toHaveBeenCalled();
  });

  test('production requires strong secrets and database credentials', () => {
    expect(() => validateRuntimeConfig({ NODE_ENV: 'production', JWT_SECRET: 'short', DB_PASSWORD: 'db-secret' })).toThrow('32 characters');
    expect(() => validateRuntimeConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32), DB_PASSWORD: '', WEBHOOK_ENCRYPTION_KEY: 'w'.repeat(48) })).toThrow('DB_PASSWORD');
    expect(() => validateRuntimeConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32), DB_PASSWORD: 'db-secret', WEBHOOK_ENCRYPTION_KEY: 'w'.repeat(48) })).not.toThrow();
  });

  test('staging and production require a dedicated webhook encryption key', () => {
    const base = { JWT_SECRET: 'j'.repeat(48), DB_PASSWORD: 'db-password' };
    expect(() => validateRuntimeConfig({ ...base, APP_ENV: 'staging', NODE_ENV: 'production' }))
      .toThrow('WEBHOOK_ENCRYPTION_KEY environment variable is required');
    expect(() => validateRuntimeConfig({ ...base, APP_ENV: 'production', NODE_ENV: 'production' }))
      .toThrow('WEBHOOK_ENCRYPTION_KEY environment variable is required');
    expect(() => validateRuntimeConfig({ ...base, APP_ENV: 'staging', NODE_ENV: 'production', WEBHOOK_ENCRYPTION_KEY: 'w'.repeat(48) }))
      .not.toThrow();
  });

  test('TRUST_PROXY accepts explicit booleans or hop counts and rejects ambiguous values', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('2')).toBe(2);
    expect(() => parseTrustProxy('all')).toThrow('TRUST_PROXY');
  });

  test('one trusted hop uses the nearest forwarded client, ignoring spoofed earlier hops', () => {
    const req = proxyRequest(parseTrustProxy('1'), '198.51.100.99, 198.51.100.23');
    expect(req.ip).toBe('198.51.100.23');
    expect(req.ips).toEqual(['198.51.100.23']);
  });

  test('with no trusted proxy spoofed X-Forwarded-For cannot change the database rate-limit key', async () => {
    const q = jest.fn().mockResolvedValueOnce({ rows: [{ hit_count: 1 }] }).mockResolvedValueOnce({ rows: [{ hit_count: 2 }] });
    const limiter = createPostgresRateLimit({ scope: 'test', windowMs: 60000, limit: 1, query: q });
    const first = proxyRequest(parseTrustProxy(undefined));
    const spoofed = proxyRequest(parseTrustProxy('false'), '198.51.100.99');
    expect(first.ip).toBe('203.0.113.7');
    expect(spoofed.ip).toBe(first.ip);
    expect(spoofed.ips).toEqual([]);
    const allowed = jest.fn();
    await limiter(first, response(), allowed);
    expect(allowed).toHaveBeenCalledTimes(1);
    const blocked = response();
    const next = jest.fn();
    await limiter(spoofed, blocked, next);
    expect(blocked.statusCode).toBe(429);
    expect(next).not.toHaveBeenCalled();
  });

  test('GHSA-jqcg-44mw-7w3h: short IPv4-mapped IPv6 subnet does not trust arbitrary IPv4 peers', () => {
    const req = proxyRequest(proxyaddr.compile('::ffff:10.0.0.0/8'), '198.51.100.99');
    expect(req.ip).toBe('203.0.113.7');
    expect(req.ips).toEqual([]);
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
