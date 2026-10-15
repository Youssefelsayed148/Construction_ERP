'use strict';

const crypto = require('crypto');
const { query: defaultQuery } = require('../config/database');

let cleanupCounter = 0;

function createPostgresRateLimit({ scope, windowMs, limit, applies = () => true, key = (req) => req.ip || req.socket?.remoteAddress || 'unknown', query = defaultQuery, onExceeded, onUnavailable }) {
  if (!/^[a-z][a-z0-9_-]{0,39}$/.test(scope || '')) throw new TypeError('Rate-limit scope must be a short lowercase identifier');
  if (!Number.isInteger(windowMs) || windowMs < 1000) throw new TypeError('Rate-limit window must be at least one second');

  return async function postgresRateLimit(req, res, next) {
    if (!applies(req)) return next();
    const configuredLimit = Number(typeof limit === 'function' ? limit(req) : limit);
    if (!Number.isInteger(configuredLimit) || configuredLimit < 1) {
      return next(Object.assign(new Error('Rate limit configuration is invalid'), { status: 500, code: 'rate_limit_configuration_error' }));
    }
    const rawKey = String(key(req) || 'unknown');
    const subjectHash = crypto.createHash('sha256').update(`${scope}\0${rawKey}`).digest('hex');
    const now = Date.now();
    const windowStartMs = Math.floor(now / windowMs) * windowMs;
    const windowStart = new Date(windowStartMs);
    const retryAfter = Math.max(1, Math.ceil((windowStartMs + windowMs - now) / 1000));

    try {
      const result = await query(
        `INSERT INTO distributed_rate_limits (scope, subject_hash, window_start, hit_count)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (scope, subject_hash, window_start) DO UPDATE
           SET hit_count = distributed_rate_limits.hit_count + 1
         RETURNING hit_count`,
        [scope, subjectHash, windowStart]
      );
      const count = Number(result.rows[0]?.hit_count);
      if (!Number.isInteger(count) || count < 1) throw new Error('Rate-limit counter returned an invalid count');

      res.setHeader('X-RateLimit-Limit', String(configuredLimit));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, configuredLimit - count)));
      if (++cleanupCounter % 1000 === 0) {
        try {
          await query("DELETE FROM distributed_rate_limits WHERE window_start < NOW() - INTERVAL '1 day'");
        } catch (error) {
          console.error('[RATE_LIMIT] expired counter cleanup failed', { code: error.code || 'unknown' });
        }
      }
      if (count > configuredLimit) {
        res.setHeader('Retry-After', String(retryAfter));
        if (onExceeded) return onExceeded(req, res, next, { limit: configuredLimit, count, retryAfter });
        return res.status(429).json({
          success: false, error: 'Too many requests. Please wait a moment.',
          error_code: 'rate_limited', error_key: 'errors.rateLimited', error_params: {},
        });
      }
      return next();
    } catch (_) {
      res.setHeader('Retry-After', '5');
      if (onUnavailable) return onUnavailable(req, res, next);
      return res.status(503).json({
        success: false, error: 'Rate limit service unavailable. Please retry shortly.',
        error_code: 'rate_limit_unavailable', error_key: 'errors.rateLimitUnavailable', error_params: {},
      });
    }
  };
}

module.exports = { createPostgresRateLimit };
