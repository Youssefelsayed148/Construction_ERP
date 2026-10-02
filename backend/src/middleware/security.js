'use strict';

const crypto = require('crypto');

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

function fixedWindowRateLimit({ windowMs, limit, applies = () => true, key = (req) => req.ip || 'unknown' }) {
  const buckets = new Map();
  return function rateLimitMiddleware(req, res, next) {
    if (!applies(req)) return next();
    const now = Date.now();
    const window = Math.floor(now / windowMs);
    const bucketKey = key(req);
    let bucket = buckets.get(bucketKey);
    if (!bucket || bucket.window !== window) bucket = { window, count: 0 };
    bucket.count += 1;
    buckets.set(bucketKey, bucket);
    if (buckets.size > 10000) {
      for (const [candidate, value] of buckets) if (value.window !== window) buckets.delete(candidate);
    }
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
    if (bucket.count > limit) {
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ success: false, error: 'Too many requests. Please try again later.' });
    }
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
}

module.exports = { securityHeaders, requestId, fixedWindowRateLimit, validateRuntimeConfig };
