// Typed JWTs (Phase 1.1). One module signs and verifies every token the API issues.
//
// kind       issued by                      accepted as a bearer on
// session    POST /api/auth/login           /api/*, /api/v1/*, /api/mcp (full parity with the user)
// preview    POST /api/users/preview/:role  same, but read-only
// v1         POST /api/v1/oauth/token       /api/v1/*, /api/mcp (scoped)
// refresh    POST /api/v1/oauth/token       ONLY the refresh grant, never as a bearer
//
// Each kind has its own signing key (HMAC-derived from JWT_SECRET, or JWT_SECRET_<KIND> when set),
// its own audience, and carries `kind`. A verifier names the kinds it accepts; anything else is
// rejected even when the signature is valid for another kind.
'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const BASE_SECRET = process.env.JWT_SECRET;
if (!BASE_SECRET) throw new Error('JWT_SECRET environment variable is required');

const ISSUER = 'construction-erp';
const KINDS = {
  session: { audience: 'construction-erp:session' },
  preview: { audience: 'construction-erp:preview' },
  v1: { audience: 'construction-erp:api-v1' },
  refresh: { audience: 'construction-erp:api-v1-refresh' },
};

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

const TTL_SECONDS = {
  session: positiveInt(process.env.SESSION_TTL_SECONDS, 8 * 3600),
  preview: 30 * 60,
  v1: positiveInt(process.env.V1_TOKEN_TTL_SECONDS, 3600),
  refresh: positiveInt(process.env.V1_REFRESH_TTL_SECONDS, 30 * 24 * 3600),
};

const secretCache = {};
function secretFor(kind) {
  if (!KINDS[kind]) throw new Error(`unknown token kind ${kind}`);
  if (!secretCache[kind]) {
    secretCache[kind] = process.env[`JWT_SECRET_${kind.toUpperCase()}`]
      || crypto.createHmac('sha256', BASE_SECRET).update(`construction-erp/token/${kind}`).digest('hex');
  }
  return secretCache[kind];
}

function sign(kind, claims, ttlSeconds = TTL_SECONDS[kind]) {
  return jwt.sign({ ...claims, kind }, secretFor(kind), {
    algorithm: 'HS256', expiresIn: ttlSeconds, issuer: ISSUER, audience: KINDS[kind].audience,
  });
}

// Returns the verified claims. Throws (jsonwebtoken error or Error) on any failure.
function verify(rawToken, acceptedKinds) {
  const unverified = jwt.decode(rawToken);
  const kind = unverified && unverified.kind;
  if (!kind || !KINDS[kind] || !acceptedKinds.includes(kind)) throw new Error('token kind not accepted here');
  const claims = jwt.verify(rawToken, secretFor(kind), {
    algorithms: ['HS256'], issuer: ISSUER, audience: KINDS[kind].audience,
  });
  if (claims.kind !== kind) throw new Error('token kind mismatch');
  return claims;
}

const signSession = ({ userId, tokenVersion = 0 }, ttlSeconds) => sign('session', { userId, tv: tokenVersion }, ttlSeconds);

const signPreview = ({ user, role, scopedProjectIds = [] }) => sign('preview', {
  userId: user.id, email: user.email, name: user.name, previewRole: role, scopedProjectIds, tv: user.token_version || 0,
});

const signV1Access = ({ sub, userId, serviceAccountId = null, scope, tokenVersion = 0, ttlSeconds }) => sign('v1', {
  sub, userId, serviceAccountId, scope: scope.join(' '), tv: tokenVersion,
}, ttlSeconds);

const signRefresh = ({ sub, userId, serviceAccountId, scope }) => sign('refresh', {
  sub, userId, serviceAccountId, scope: scope.join(' '),
});

module.exports = { ISSUER, KINDS, TTL_SECONDS, sign, verify, signSession, signPreview, signV1Access, signRefresh };
