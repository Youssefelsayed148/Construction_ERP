// Phase 26 — OAuth 2.0 token service for the versioned /api/v1.
//
// Two access models, both resolving to a REAL user so every downstream
// authorize() decision runs through the exact same Phase 4 policy engine the
// UI/internal API uses (permission parity is enforced by construction):
//
//   grant_type=password            — user-delegated access. A human user
//     exchanges their credentials for a scoped v1 token; the token acts as
//     that user and never exceeds the requested (or granted) scopes.
//
//   grant_type=client_credentials  — machine integrations. A service account
//     (client_id/client_secret) exchanges its secret for a scoped token that
//     acts as the LINKED USER (service_accounts.user_id) for attribution and
//     policy evaluation. project_ids scopes the account to specific projects.
//
// Access tokens are JWTs (HS256, same secret as the internal API) with:
//   { sub, kind: 'v1', scope: 'projects:read procurement:write ...',
//     userId, serviceAccountId?, aud: 'construction-erp:api-v1',
//     iss: 'construction-erp', exp }
//
// Internal UI tokens (no `kind: 'v1'`) are also accepted — those carry full
// internal permissions and skip scope checks, which keeps "same user, same
// permission result" literally true between the UI and v1.

'use strict';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Joi = require('joi');
const { query } = require('../config/database');

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('JWT_SECRET environment variable is required');

const ISSUER = 'construction-erp';
const AUDIENCE = 'construction-erp:api-v1';
const ACCESS_TTL_SECONDS = parseInt(process.env.V1_TOKEN_TTL_SECONDS || '3600', 10);
const REFRESH_TTL_SECONDS = parseInt(process.env.V1_REFRESH_TTL_SECONDS || '30 * 24 * 3600', 10);

// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------

// The resource families v1 exposes; each is readable and/or writable via
// `<family>:read` / `<family>:write`. The wildcard `api` covers everything.
const FAMILIES = [
  'companies', 'users', 'organizations', 'projects', 'work-packages', 'boq',
  'quantities', 'materials', 'inventory', 'purchase-requisitions', 'rfqs',
  'purchase-orders', 'deliveries', 'grns', 'contracts', 'subcontracts',
  'variations', 'payment-certificates', 'invoices', 'payments',
  'daily-reports', 'site-visits', 'observations', 'rfis', 'submittals',
  'inspections', 'ncrs', 'documents', 'transmittals', 'schedule', 'actions',
  'notifications', 'reports',
];

const SCOPE_RE = /^(api|([a-z-]+)):(read|write)$/;

function validScope(scope) {
  if (typeof scope !== 'string') return false;
  const m = SCOPE_RE.exec(scope);
  if (!m) return false;
  return m[1] === 'api' || FAMILIES.includes(m[1]);
}

// scopes: array of strings. Checks `family:read` / `family:write`; a write
// scope does NOT imply read (explicit is better than implicit for third
// parties). `api:read` / `api:write` are full wildcards.
function scopeAllows(scopes, family, action) {
  if (!Array.isArray(scopes)) return false;
  const wanted = `${family}:${action}`;
  return scopes.some((s) => s === wanted || s === `api:${action}`);
}

function intersectScopes(requested, granted) {
  const grantedSet = new Set(granted);
  return (requested || []).filter((s) => grantedSet.has(s) || grantedSet.has(`api:${s.split(':')[1]}`));
}

// ---------------------------------------------------------------------------
// Token issuance
// ---------------------------------------------------------------------------

function signAccessToken({ sub, userId, serviceAccountId = null, scope, ttlSeconds = ACCESS_TTL_SECONDS }) {
  return jwt.sign(
    { sub, kind: 'v1', userId, serviceAccountId, scope: scope.join(' ') },
    SECRET,
    { expiresIn: ttlSeconds, audience: AUDIENCE, issuer: ISSUER }
  );
}

function signRefreshToken({ sub, userId, serviceAccountId, scope }) {
  return jwt.sign(
    { tok: 'refresh', sub, userId, serviceAccountId, scope: scope.join(' ') },
    SECRET,
    { expiresIn: REFRESH_TTL_SECONDS, audience: AUDIENCE, issuer: ISSUER }
  );
}

function randomSecret() {
  return crypto.randomBytes(24).toString('hex');
}

// Grant type validators ------------------------------------------------------

const passwordSchema = Joi.object({
  grant_type: Joi.string().valid('password').required(),
  username: Joi.string().email().required(),
  password: Joi.string().required(),
  scope: Joi.string().allow('', null),
}).unknown(false);

const clientCredentialsSchema = Joi.object({
  grant_type: Joi.string().valid('client_credentials').required(),
  client_id: Joi.string().required(),
  client_secret: Joi.string().required(),
  scope: Joi.string().allow('', null),
}).unknown(false);

const refreshSchema = Joi.object({
  grant_type: Joi.string().valid('refresh_token').required(),
  refresh_token: Joi.string().required(),
}).unknown(false);

function parseScopeParam(scopeParam) {
  if (!scopeParam) return null;
  const parts = String(scopeParam).split(/\s+/).filter(Boolean);
  return parts;
}

async function issueForPassword(body) {
  const { error, value } = passwordSchema.validate(body);
  if (error) throw Object.assign(new Error(error.details[0].message), { code: 'invalid_request', status: 400 });

  const u = (await query(
    'SELECT id, name, email, password, role, is_active FROM users WHERE email = $1',
    [value.username]
  )).rows[0];
  if (!u || !u.is_active || !(await bcrypt.compare(value.password, u.password))) {
    throw Object.assign(new Error('Invalid user credentials'), { code: 'invalid_grant', status: 401 });
  }

  const requested = parseScopeParam(value.scope);
  if (requested && requested.some((s) => !validScope(s))) {
    throw Object.assign(new Error('Invalid scope requested'), { code: 'invalid_scope', status: 400 });
  }
  // User-delegated tokens default to full read + their project-scoped writes
  // are still gated by the policy engine per request; scope here is a coarse
  // reduction, never an expansion.
  const granted = requested && requested.length ? requested : ['api:read'];
  const token = signAccessToken({ sub: `user:${u.id}`, userId: u.id, scope: granted });
  await auditIssuance({ subject: `user:${u.id}`, kind: 'password', scopes: granted });
  return {
    access_token: token,
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_SECONDS,
    scope: granted.join(' '),
  };
}

async function issueForClientCredentials(body) {
  const { error, value } = clientCredentialsSchema.validate(body);
  if (error) throw Object.assign(new Error(error.details[0].message), { code: 'invalid_request', status: 400 });

  const acct = (await query(
    'SELECT * FROM service_accounts WHERE client_id = $1 AND is_active = true',
    [value.client_id]
  )).rows[0];
  if (!acct || !(await bcrypt.compare(value.client_secret, acct.client_secret_hash))) {
    throw Object.assign(new Error('Invalid client credentials'), { code: 'invalid_grant', status: 401 });
  }

  const granted = acct.scopes || [];
  const requested = parseScopeParam(value.scope);
  let scopes;
  if (requested && requested.length) {
    if (requested.some((s) => !validScope(s))) {
      throw Object.assign(new Error('Invalid scope requested'), { code: 'invalid_scope', status: 400 });
    }
    scopes = intersectScopes(requested, granted);
    if (scopes.length === 0) {
      throw Object.assign(new Error('Requested scope exceeds the service account grant'), { code: 'invalid_scope', status: 403 });
    }
  } else {
    scopes = granted;
  }

  const user = (await query('SELECT id, is_active FROM users WHERE id = $1', [acct.user_id])).rows[0];
  if (!user || !user.is_active) {
    throw Object.assign(new Error('Service account is linked to an inactive user'), { code: 'invalid_grant', status: 401 });
  }

  const token = signAccessToken({
    sub: `service:${acct.id}`, userId: user.id, serviceAccountId: acct.id, scope: scopes,
  });
  await query('UPDATE service_accounts SET last_used_at = NOW() WHERE id = $1', [acct.id]);
  await auditIssuance({ subject: `service:${acct.id}`, kind: 'client_credentials', scopes });
  return {
    access_token: token,
    refresh_token: signRefreshToken({ sub: `service:${acct.id}`, userId: user.id, serviceAccountId: acct.id, scope: scopes }),
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_SECONDS,
    scope: scopes.join(' '),
  };
}

async function issueForRefresh(body) {
  const { error, value } = refreshSchema.validate(body);
  if (error) throw Object.assign(new Error(error.details[0].message), { code: 'invalid_request', status: 400 });
  let decoded;
  try {
    decoded = jwt.verify(value.refresh_token, SECRET, { issuer: ISSUER });
  } catch (e) {
    throw Object.assign(new Error('Invalid refresh token'), { code: 'invalid_grant', status: 401 });
  }
  if (decoded.tok !== 'refresh') {
    throw Object.assign(new Error('Not a refresh token'), { code: 'invalid_grant', status: 401 });
  }
  // Re-issue directly from the stored service account so a revoked account or
  // disabled linked user stops refreshing immediately. No secret echo — the
  // refresh token only carries the account id.
  if (decoded.serviceAccountId != null) {
    const acct = (await query(
      `SELECT sa.*, u.is_active as user_active FROM service_accounts sa
       JOIN users u ON sa.user_id = u.id WHERE sa.id = $1`,
      [decoded.serviceAccountId]
    )).rows[0];
    if (!acct || !acct.is_active || !acct.user_active) {
      throw Object.assign(new Error('Service account is inactive'), { code: 'invalid_grant', status: 401 });
    }
    const requested = parseScopeParam(decoded.scope);
    const scopes = (requested && requested.length) ? intersectScopes(requested, acct.scopes || []) : (acct.scopes || []);
    if (scopes.length === 0) {
      throw Object.assign(new Error('No active scope for this service account'), { code: 'invalid_grant', status: 401 });
    }
    const token = signAccessToken({
      sub: `service:${acct.id}`, userId: acct.user_id, serviceAccountId: acct.id, scope: scopes,
    });
    await query('UPDATE service_accounts SET last_used_at = NOW() WHERE id = $1', [acct.id]);
    await auditIssuance({ subject: `service:${acct.id}`, kind: 'client_credentials', scopes });
    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: ACCESS_TTL_SECONDS,
      scope: scopes.join(' '),
    };
  }
  // Refresh for user-delegated tokens is intentionally NOT supported: user
  // delegation should re-authenticate. Fail cleanly rather than mint a
  // long-lived ambient user token.
  throw Object.assign(new Error('Refresh is only available for service accounts'), { code: 'invalid_grant', status: 401 });
}

async function auditIssuance({ subject, kind, scopes }) {
  try {
    await query(
      `INSERT INTO audit_events (entity, entity_id, action, after)
       VALUES ('v1_token', NULL, $1, $2)`,
      [kind, JSON.stringify({ subject, scopes, at: new Date().toISOString() })]
    );
  } catch (e) { /* audit failure must not block token issuance */ }
}

// ---------------------------------------------------------------------------
// Verification (middleware-facing)
// ---------------------------------------------------------------------------

// Returns:
//   { type: 'internal', user }        — legacy UI token, full permissions
//   { type: 'v1', user, scopes, serviceAccountId }
// Throws { code, message, status } on any failure.
async function verifyToken(rawToken) {
  let decoded;
  try {
    decoded = jwt.verify(rawToken, SECRET);
  } catch (e) {
    throw Object.assign(new Error('Invalid or expired token'), { code: 'invalid_token', status: 401 });
  }

  if (decoded.kind === 'v1') {
    // v1 access token (service account or user-delegated).
    const u = (await query('SELECT id, email, name, role, department, is_active FROM users WHERE id = $1', [decoded.userId])).rows[0];
    if (!u || !u.is_active) {
      throw Object.assign(new Error('Account is disabled'), { code: 'invalid_grant', status: 401 });
    }
    if (decoded.serviceAccountId != null) {
      const acct = (await query('SELECT id, is_active FROM service_accounts WHERE id = $1', [decoded.serviceAccountId])).rows[0];
      if (!acct || !acct.is_active) {
        throw Object.assign(new Error('Service account is disabled'), { code: 'invalid_grant', status: 401 });
      }
    }
    return {
      type: 'v1',
      user: { id: u.id, email: u.email, name: u.name, role: u.role, department: u.department },
      scopes: String(decoded.scope || '').split(/\s+/).filter(Boolean),
      serviceAccountId: decoded.serviceAccountId || null,
    };
  }

  // Internal (UI) token: resolve the user exactly like middleware/auth.js so
  // the same authorization decision is reachable through v1.
  const u = (await query('SELECT id, email, name, role, department, is_active FROM users WHERE id = $1', [decoded.userId])).rows[0];
  if (!u) throw Object.assign(new Error('User not found'), { code: 'invalid_grant', status: 401 });
  if (!u.is_active) throw Object.assign(new Error('Account is disabled'), { code: 'invalid_grant', status: 401 });
  return {
    type: 'internal',
    user: { id: u.id, email: u.email, name: u.name, role: u.role, department: u.department },
    scopes: null, // unlimited — full internal parity
  };
}

module.exports = {
  FAMILIES,
  ISSUER,
  AUDIENCE,
  ACCESS_TTL_SECONDS,
  validScope,
  scopeAllows,
  intersectScopes,
  signAccessToken,
  signRefreshToken,
  randomSecret,
  issueForPassword,
  issueForClientCredentials,
  issueForRefresh,
  verifyToken,
  passwordSchema,
  clientCredentialsSchema,
  refreshSchema,
};
