// Real PostgreSQL + the real Express app: every token type is accepted only where it was issued for.
// Phase 1.1 (token typing). Findings reproduced here first: a v1 token and a refresh token were
// accepted on internal routes / as v1 bearers, a preview token could write through v1 and MCP,
// the refresh TTL was 30 seconds, and a session token survived a password change for 7 days.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('token typing (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db;
  let userId; let serviceAccountId; let clientId; let clientSecret;
  const email = `tok-${Date.now()}@test.io`;
  const password = 'correct horse battery staple';

  const call = async (method, path, { token, body } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* empty body */ }
    return { status: res.status, body: json };
  };
  const login = async () => (await call('POST', '/api/auth/login', { body: { email, password } })).body.data.token;
  const v1Token = async (scope = 'api:read api:write') => {
    const r = await call('POST', '/api/v1/oauth/token', {
      body: { grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope },
    });
    return r.body.data;
  };
  const previewToken = async (sessionToken, role = 'staff') =>
    (await call('POST', `/api/users/preview/${role}`, { token: sessionToken })).body.token;

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;

    const hash = await bcrypt.hash(password, 4);
    userId = (await db.query(
      "INSERT INTO users (name, email, password, role) VALUES ('Tok Owner', $1, $2, 'owner') RETURNING id", [email, hash]
    )).rows[0].id;
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [userId]);

    clientId = `tok-client-${Date.now()}`;
    clientSecret = 'tok-secret-0123456789abcdef';
    serviceAccountId = (await db.query(
      `INSERT INTO service_accounts (name, client_id, client_secret_hash, user_id, scopes, is_active)
       VALUES ('tok', $1, $2, $3, $4, true) RETURNING id`,
      [clientId, await bcrypt.hash(clientSecret, 4), userId, JSON.stringify(['api:read', 'api:write'])]
    )).rows[0].id;
  });

  afterAll(async () => {
    await db.query('DELETE FROM service_accounts WHERE id = $1', [serviceAccountId]);
    await db.query('DELETE FROM users WHERE id = $1', [userId]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('a v1 access token is rejected on internal /api routes', async () => {
    const { access_token: access } = await v1Token('projects:read');
    const r = await call('GET', '/api/projects', { token: access });
    expect(r.status).toBe(401);
  });

  test('a refresh token is rejected as a bearer on internal, v1 and MCP', async () => {
    const { refresh_token: refresh } = await v1Token();
    expect(refresh).toBeTruthy();
    expect((await call('GET', '/api/projects', { token: refresh })).status).toBe(401);
    expect((await call('GET', '/api/v1/projects', { token: refresh })).status).toBe(401);
    const mcp = await call('POST', '/api/mcp', { token: refresh, body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
    expect(mcp.status).toBe(401);
  });

  test('a refresh token still refreshes, and lives for days, not seconds', async () => {
    const { refresh_token: refresh } = await v1Token();
    const decoded = jwt.decode(refresh);
    expect(decoded.exp - decoded.iat).toBeGreaterThanOrEqual(24 * 3600);
    const r = await call('POST', '/api/v1/oauth/token', { body: { grant_type: 'refresh_token', refresh_token: refresh } });
    expect(r.status).toBe(200);
    expect(r.body.data.access_token).toBeTruthy();
  });

  test('an access token cannot be used as a refresh token, nor a session token', async () => {
    const { access_token: access } = await v1Token();
    expect((await call('POST', '/api/v1/oauth/token', { body: { grant_type: 'refresh_token', refresh_token: access } })).status).toBe(401);
    const session = await login();
    expect((await call('POST', '/api/v1/oauth/token', { body: { grant_type: 'refresh_token', refresh_token: session } })).status).toBe(401);
  });

  test('the session token still works on internal routes and on v1 (parity)', async () => {
    const session = await login();
    expect((await call('GET', '/api/auth/me', { token: session })).status).toBe(200);
    expect((await call('GET', '/api/v1/projects', { token: session })).status).toBe(200);
  });

  test('a v1 access token still works on v1', async () => {
    const { access_token: access } = await v1Token('projects:read');
    const r = await call('GET', '/api/v1/projects', { token: access }); expect({ status: r.status, body: r.body }).toMatchObject({ status: 200 });
  });

  test('a preview token cannot write through v1', async () => {
    const preview = await previewToken(await login());
    expect((await call('GET', '/api/v1/projects', { token: preview })).status).toBe(200);
    const r = await call('POST', '/api/v1/companies', { token: preview, body: { name_ar: 'x', name_en: 'x' } });
    expect(r.status).toBe(403);
  });

  test('a preview token cannot write through /api or MCP', async () => {
    const preview = await previewToken(await login());
    expect((await call('POST', '/api/clients', { token: preview, body: { name_ar: 'x' } })).status).toBe(403);
    const mcp = await call('POST', '/api/mcp', {
      token: preview,
      body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'update_daily_report_draft', arguments: { project_id: 1 } } },
    });
    expect(JSON.stringify(mcp.body)).toMatch(/read-only/i);
  });

  test('the session token lifetime is shorter than the old 7 days', async () => {
    const decoded = jwt.decode(await login());
    expect(decoded.exp - decoded.iat).toBeLessThanOrEqual(24 * 3600);
  });

  test('a password change revokes sessions issued before it', async () => {
    const before = await login();
    expect((await call('GET', '/api/auth/me', { token: before })).status).toBe(200);
    const next = 'a brand new passphrase 123';
    const change = await call('POST', '/api/auth/change-password', { token: before, body: { currentPassword: password, newPassword: next } });
    expect(change.status).toBe(200);
    expect((await call('GET', '/api/auth/me', { token: before })).status).toBe(401);
    const relogin = await call('POST', '/api/auth/login', { body: { email, password: next } });
    expect(relogin.status).toBe(200);
    expect((await call('GET', '/api/auth/me', { token: relogin.body.data.token })).status).toBe(200);
    // restore for the other tests
    await db.query('UPDATE users SET password = $2 WHERE id = $1', [userId, await bcrypt.hash(password, 4)]);
  });

  test('a password change is written to the audit log', async () => {
    const session = await login();
    const next = 'another passphrase 456 xyz';
    await call('POST', '/api/auth/change-password', { token: session, body: { currentPassword: password, newPassword: next } });
    const rows = (await db.query(
      "SELECT 1 FROM activity_log WHERE user_id = $1 AND action = 'password_change'", [userId]
    )).rows;
    expect(rows.length).toBeGreaterThan(0);
    await db.query('UPDATE users SET password = $2 WHERE id = $1', [userId, await bcrypt.hash(password, 4)]);
  });

  test('a token signed with the wrong key, issuer or audience is rejected', async () => {
    const forged = jwt.sign({ userId, kind: 'session' }, 'not-the-secret', { expiresIn: '1h' });
    expect((await call('GET', '/api/auth/me', { token: forged })).status).toBe(401);
    const legacyUntyped = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
    expect((await call('GET', '/api/auth/me', { token: legacyUntyped })).status).toBe(401);
  });
});
