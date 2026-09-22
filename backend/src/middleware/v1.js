// Phase 26 — middleware for the versioned /api/v1.
//
// Layers applied to every v1 request (order matters):
//   1. correlationId      — X-Request-ID generated or honored; echoed on every
//                           response and in the structured error body.
//   2. rateLimit          — fixed-window limiter per token subject (or IP
//                           before auth), env V1_RATE_LIMIT_PER_MIN (default 300).
//   3. authenticateV1     — OAuth bearer tokens via services/oauthService:
//                           v1 tokens (scopes) OR internal UI tokens (full
//                           parity). Attaches req.user like the internal
//                           middleware so the SAME authorize() chain runs.
//   4. requireScope       — enforced for v1 tokens only; internal tokens skip
//                           it (they carry the user's full permission set).
//   5. idempotency        — POST replay support via Idempotency-Key.
//   6. normalizeResponses — success passthrough; errors reshaped to
//                           {"error":{"code","message","correlation_id","details"}};
//                           GET list responses paginated/filtered/sorted.
//
// The reused internal handler chains expect req.baseUrl to be the INTERNAL
// mount (services/policy.moduleFromRequest derives the policy module from
// it), so v1's remount wrapper sets req.baseUrl = internal mount before
// invoking them and restores it afterwards. That is what guarantees "the v1
// endpoint enforces the exact same permission result as the equivalent
// internal call for the same user".

'use strict';

const crypto = require('crypto');
const oauthService = require('../services/oauthService');

// ---------------------------------------------------------------------------
// 1. Correlation IDs
// ---------------------------------------------------------------------------

function correlationId(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const id = (typeof incoming === 'string' && incoming.length >= 8 && incoming.length <= 120)
    ? incoming
    : crypto.randomUUID();
  req.correlationId = id;
  res.setHeader('X-Request-ID', id);
  next();
}

// ---------------------------------------------------------------------------
// 2. Rate limiting (fixed window, in-memory — no new deps)
// ---------------------------------------------------------------------------

const buckets = new Map();
const RATE_LIMIT_PER_MIN = parseInt(process.env.V1_RATE_LIMIT_PER_MIN || '300', 10);

function rateLimit(req, res, next) {
  const subject = req.v1Subject || req.user?.id || req.ip || 'anonymous';
  const now = Date.now();
  const windowStart = Math.floor(now / 60000);
  let bucket = buckets.get(subject);
  if (!bucket || bucket.window !== windowStart) {
    bucket = { window: windowStart, count: 0 };
    buckets.set(subject, bucket);
  }
  bucket.count += 1;
  // Opportunistic cleanup so the map cannot grow unbounded.
  if (buckets.size > 5000) {
    for (const [key, b] of buckets) if (b.window !== windowStart) buckets.delete(key);
  }
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_PER_MIN);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT_PER_MIN - bucket.count));
  if (bucket.count > RATE_LIMIT_PER_MIN) {
    res.setHeader('Retry-After', 60);
    const err = new Error('Rate limit exceeded');
    err.status = 429; err.code = 'rate_limited';
    return next(err);
  }
  next();
}

// ---------------------------------------------------------------------------
// 3. Authentication + scopes
// ---------------------------------------------------------------------------

// Maps an oauthService failure into the structured error pipeline.
function authenticateV1(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    const err = new Error('Authentication required');
    err.status = 401; err.code = 'unauthenticated';
    return next(err);
  }
  oauthService.verifyToken(header.slice(7)).then((auth) => {
    req.user = auth.user;           // same shape the internal API produces
    req.authType = auth.type;       // 'internal' | 'v1'
    req.v1Scopes = auth.scopes;     // null for internal tokens
    req.v1ServiceAccountId = auth.serviceAccountId;
    next();
  }).catch((e) => {
    e.status = e.status || 401; e.code = e.code || 'invalid_token';
    next(e);
  });
}

// req.family is set by the route registration (see routes/v1.js).
function requireScope(req, res, next) {
  if (req.authType !== 'v1') return next(); // internal parity — full permissions
  const action = req.method === 'GET' || req.method === 'HEAD' ? 'read' : 'write';
  if (!oauthService.scopeAllows(req.v1Scopes, req.family, action)) {
    const err = new Error(`Token is missing scope '${req.family}:${action}'`);
    err.status = 403; err.code = 'insufficient_scope';
    return next(err);
  }
  next();
}

// ---------------------------------------------------------------------------
// 4. Idempotency (POST)
// ---------------------------------------------------------------------------

const IDEMPOTENCY_TTL_HOURS = 24;

function requestFingerprint(body) {
  return crypto.createHash('sha256').update(JSON.stringify(body || {})).digest('hex');
}

const poolQuery = (text, params) => require('../config/database').query(text, params);

async function idempotency(req, res, next) {
  if (req.method !== 'POST') return next();
  const key = req.headers['idempotency-key'];
  if (!key || typeof key !== 'string') return next();

  if (key.length > 200) {
    const err = new Error('Idempotency-Key too long (max 200 characters)');
    err.status = 400; err.code = 'validation_error';
    return next(err);
  }
  const subject = `${req.authType}:${req.user?.id ?? 'anon'}`;
  const path = req.originalUrl.split('?')[0];
  const fingerprint = requestFingerprint(req.body);

  try {
    // Purge expired keys opportunistically.
    await poolQuery("DELETE FROM idempotency_keys WHERE expires_at < NOW() - INTERVAL '7 days'").catch(() => {});

    const existing = (await poolQuery(
      'SELECT * FROM idempotency_keys WHERE key = $1 AND subject = $2 AND method = $3 AND path = $4',
      [key, subject, req.method, path]
    )).rows[0];

    if (existing && existing.status === 'completed') {
      if (existing.request_hash && existing.request_hash !== fingerprint) {
        const err = new Error('Idempotency-Key was already used with a different request body');
        err.status = 409; err.code = 'idempotency_key_reuse';
        return next(err);
      }
      res.setHeader('Idempotency-Replayed', 'true');
      return res.status(existing.response_status || 200).json(existing.response_body || { success: true, data: null });
    }

    if (existing && existing.status === 'in_flight') {
      const err = new Error('A request with this Idempotency-Key is still in progress');
      err.status = 409; err.code = 'idempotency_in_progress';
      return next(err);
    }

    await poolQuery(
      `INSERT INTO idempotency_keys (key, subject, method, path, request_hash, status)
       VALUES ($1, $2, $3, $4, $5, 'in_flight')
       ON CONFLICT (key, subject, method, path) DO NOTHING`,
      [key, subject, req.method, path, fingerprint]
    );
  } catch (e) {
    // Storage failure must not block the request; idempotency degrades.
    console.error('[V1] idempotency lookup failed:', e.message);
    return next();
  }

  // Capture the handler's response to persist for replays.
  const originalJson = res.json.bind(res);
  let captured = false;
  res.json = (payload) => {
    if (!captured) {
      captured = true;
      const status = res.statusCode;
      // Only completed (2xx) responses are replayable; a failed request must
      // be re-executable with the same key.
      if (status >= 200 && status < 300) {
        poolQuery(
          `UPDATE idempotency_keys
           SET status = 'completed', response_status = $1, response_body = $2, request_hash = $3
           WHERE key = $4 AND subject = $5 AND method = $6 AND path = $7`,
          [status, JSON.stringify(payload), fingerprint, key, subject, req.method, path]
        ).catch((e) => console.error('[V1] idempotency store failed:', e.message));
      }
    }
    return originalJson(payload);
  };
  next();
}

// ---------------------------------------------------------------------------
// 6. Response normalization (structured errors + list pagination)
// ---------------------------------------------------------------------------

const ERROR_CODES = {
  400: 'validation_error',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  422: 'unprocessable',
  429: 'rate_limited',
  500: 'internal_error',
  503: 'unavailable',
};

// Pagination/filter/sort query: ?page=1&per_page=50&sort=-created_at&filter[status]=open
const LIST_DEFAULTS = { page: 1, per_page: 50 };
const MAX_PER_PAGE = 200;

function parseListQuery(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  let perPage = parseInt(query.per_page, 10);
  if (!Number.isFinite(perPage) || perPage <= 0) perPage = LIST_DEFAULTS.per_page;
  perPage = Math.min(perPage, MAX_PER_PAGE);
  const sort = typeof query.sort === 'string' && query.sort ? query.sort : null;
  const filters = {};
  for (const [k, v] of Object.entries(query)) {
    if (k.startsWith('filter[')) {
      const field = k.slice(7, -1).trim();
      if (field && v != null && String(v).length <= 200) filters[field] = v;
    }
  }
  return { page, per_page: perPage, sort, filters };
}

function applyListQuery(rows, listQuery) {
  let out = rows;
  if (listQuery.filters && Object.keys(listQuery.filters).length) {
    out = out.filter((row) => Object.entries(listQuery.filters).every(([field, value]) => {
      const cell = row[field];
      if (cell == null) return false;
      return String(cell).toLowerCase() === String(value).toLowerCase();
    }));
  }
  if (listQuery.sort) {
    const desc = listQuery.sort.startsWith('-');
    const field = desc ? listQuery.sort.slice(1) : listQuery.sort;
    if (field) {
      out = [...out].sort((a, b) => {
        const av = a[field]; const bv = b[field];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === 'number' && typeof bv === 'number') return desc ? bv - av : av - bv;
        return desc ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
      });
    }
  }
  const total = out.length;
  const start = (listQuery.page - 1) * listQuery.per_page;
  const data = out.slice(start, start + listQuery.per_page);
  return {
    data,
    meta: { page: listQuery.page, per_page: listQuery.per_page, total, total_pages: Math.ceil(total / listQuery.per_page) },
  };
}

// Wraps res.json on the v1 router:
//   - errors (success:false or an Error already handled) → structured shape
//   - GET responses whose data is an array → standard page/meta envelope
function normalizeResponses(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    if (payload && payload.success === false) {
      const status = res.statusCode >= 400 ? res.statusCode : 500;
      const body = {
        error: {
          code: ERROR_CODES[status] || 'internal_error',
          message: typeof payload.error === 'string' ? payload.error : (payload.error?.message || 'Request failed'),
          correlation_id: req.correlationId,
          details: payload.details || payload.error?.details || undefined,
        },
      };
      return originalJson(body);
    }
    if (req.method === 'GET' && payload && payload.success !== false && Array.isArray(payload.data)) {
      const listQuery = parseListQuery(req.query);
      const { data, meta } = applyListQuery(payload.data, listQuery);
      return originalJson({ ...payload, data, meta });
    }
    return originalJson(payload);
  };
  next();
}

// Final error handler: any error reaching the end of the v1 chain becomes the
// structured shape. Mounted with error-handling arity on the v1 router.
function structuredErrorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || (res.statusCode >= 400 ? res.statusCode : 500) || 500;
  const code = err.code || ERROR_CODES[status] || 'internal_error';
  if (res.headersSent) return next(err);
  res.status(status).json({
    error: {
      code,
      message: err.message || 'Request failed',
      correlation_id: req.correlationId,
      details: err.details || undefined,
    },
  });
}

module.exports = {
  correlationId,
  rateLimit,
  authenticateV1,
  requireScope,
  idempotency,
  normalizeResponses,
  structuredErrorHandler,
  parseListQuery,
  applyListQuery,
  ERROR_CODES,
  RATE_LIMIT_PER_MIN,
};

