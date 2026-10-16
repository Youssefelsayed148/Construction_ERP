'use strict';

const crypto = require('crypto');

function validateCorsOrigins(frontendOrigin, extraOrigins = [], production = process.env.NODE_ENV === 'production', allowHttpLocal = false) {
  const values = [frontendOrigin, ...extraOrigins].filter(Boolean);
  return [...new Set(values.map((value) => {
    let parsed;
    try { parsed = new URL(value); } catch (_) { throw new Error('CORS origins must be absolute http(s) origins'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password
      || parsed.pathname !== '/' || parsed.search || parsed.hash || value.includes('*')) {
      throw new Error('CORS origins must contain only a scheme and host (wildcards are not allowed)');
    }
    const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (production && parsed.protocol !== 'https:' && !(allowHttpLocal && localHost)) {
      throw new Error('CORS origins must use HTTPS in production (except explicitly allowed localhost origins)');
    }
    return parsed.origin;
  }))];
}

function parseTrustProxy(value) {
  if (value == null || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(String(value))) return Number(value);
  throw new Error('TRUST_PROXY must be true, false, or a non-negative hop count');
}

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(), microphone=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

function requestId(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const valid = typeof incoming === 'string' && /^[A-Za-z0-9._:-]{8,120}$/.test(incoming);
  req.requestId = valid ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  next();
}

function sanitizeServerError(log = console.error) {
  return function sanitizeServerErrorMiddleware(req, res, next) {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 500 && body && typeof body === 'object' && typeof body.error === 'string' && !body.error_code) {
        const requestIdValue = req.requestId || req.correlationId || 'unavailable';
        log(`[API] request_id=${requestIdValue}`, body.error);
        return originalJson({
          success: false,
          error: 'The request could not be completed',
          error_code: 'internal_error',
          request_id: requestIdValue,
        });
      }
      return originalJson(body);
    };
    next();
  };
}

function validateRuntimeConfig(env = process.env) {
  if (!env.JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');
  if (env.NODE_ENV === 'production' && env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }
  if (env.NODE_ENV === 'production' && !env.DB_PASSWORD) {
    throw new Error('DB_PASSWORD environment variable is required in production');
  }
  const productionLike = env.NODE_ENV === 'production' || ['staging', 'production'].includes(env.APP_ENV);
  if (productionLike && (!env.WEBHOOK_ENCRYPTION_KEY || env.WEBHOOK_ENCRYPTION_KEY.length < 32)) {
    throw new Error('WEBHOOK_ENCRYPTION_KEY environment variable is required and must be at least 32 characters in staging/production');
  }
}

module.exports = { securityHeaders, requestId, sanitizeServerError, validateRuntimeConfig, validateCorsOrigins, parseTrustProxy };
