'use strict';

const crypto = require('crypto');
const { query } = require('../config/database');

const TOKEN_PREFIX = 'erp_pat_';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function verifyApiToken(token, q = query) {
  if (typeof token !== 'string' || !token.startsWith(TOKEN_PREFIX)) {
    throw Object.assign(new Error('Invalid or expired token'), { code: 'invalid_token', status: 401 });
  }
  const result = await q(
    `SELECT t.id AS api_token_id, t.user_id, t.scopes, t.token_version, t.expires_at, t.revoked_at,
            u.id, u.email, u.name, u.role, u.department, u.is_active, u.token_version AS current_token_version
     FROM api_tokens t JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = $1 AND t.audience = 'construction-erp:api-v1'`,
    [hashToken(token)]
  );
  const row = result.rows[0];
  if (!row || row.revoked_at || new Date(row.expires_at).getTime() <= Date.now() || !row.is_active
      || Number(row.token_version) !== Number(row.current_token_version)) {
    throw Object.assign(new Error('Invalid or expired token'), { code: 'invalid_token', status: 401 });
  }
  await q('UPDATE api_tokens SET last_used_at = NOW() WHERE id = $1', [row.api_token_id]);
  return {
    type: 'v1', user: { id: row.user_id, email: row.email, name: row.name, role: row.role,
      department: row.department, token_version: row.current_token_version },
    scopes: row.scopes, serviceAccountId: null, apiTokenId: row.api_token_id,
  };
}

module.exports = { TOKEN_PREFIX, hashToken, verifyApiToken };
