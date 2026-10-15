'use strict';

process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
const bcrypt = require('bcryptjs');
const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('password hash migration (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let userId;
  const password = 'r4 legacy password 123';
  const email = `r4-password-${Date.now()}@example.com`;

  const call = async (method, path, body, token) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let payload = null;
    try { payload = await response.json(); } catch (_) {}
    return { status: response.status, body: payload };
  };

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const legacy = await bcrypt.hash(password, 4);
    userId = (await db.query(
      "INSERT INTO users (name,email,password,role,is_active) VALUES ('R4 password fixture',$1,$2,'owner',true) RETURNING id",
      [email, legacy]
    )).rows[0].id;
    await db.query("INSERT INTO user_project_roles (user_id,project_id,role_id) SELECT $1,NULL,id FROM roles WHERE key='owner'", [userId]);
  });

  afterAll(async () => {
    if (userId) await db.query('UPDATE users SET is_active=false WHERE id=$1', [userId]);
    if (server) await new Promise((resolve) => server.close(resolve));
    if (db) await db.pool.end();
  });

  test('legacy internal login succeeds and transparently replaces bcrypt with tagged scrypt', async () => {
    const response = await call('POST', '/api/auth/login', { email, password });
    expect(response.status).toBe(200);
    expect(response.body.data.token).toBeTruthy();
    const stored = (await db.query('SELECT password FROM users WHERE id=$1', [userId])).rows[0].password;
    expect(stored).toMatch(/^scrypt\$N=32768,r=8,p=3\$/);
    expect(await require('../../services/passwords').verifyPassword(password, stored)).toBe(true);
  });

  test('wrong passwords remain rejected without changing the stored hash', async () => {
    const before = (await db.query('SELECT password FROM users WHERE id=$1', [userId])).rows[0].password;
    const response = await call('POST', '/api/auth/login', { email, password: 'wrong legacy passphrase' });
    const after = (await db.query('SELECT password FROM users WHERE id=$1', [userId])).rows[0].password;
    expect(response.status).toBe(401);
    expect(after).toBe(before);
  });

  test('legacy OAuth password grant upgrades in the same transaction as its audit row', async () => {
    const legacy = await bcrypt.hash(password, 4);
    await db.query('UPDATE users SET password=$1 WHERE id=$2', [legacy, userId]);
    const response = await call('POST', '/api/v1/oauth/token', { grant_type: 'password', username: email, password });
    expect(response.status).toBe(200);
    expect(response.body.data.access_token).toBeTruthy();
    const stored = (await db.query('SELECT password FROM users WHERE id=$1', [userId])).rows[0].password;
    expect(stored).toMatch(/^scrypt\$N=32768,r=8,p=3\$/);
    const audit = await db.query("SELECT 1 FROM audit_events WHERE user_id=$1 AND entity='v1_token' AND action='password'", [userId]);
    expect(audit.rowCount).toBeGreaterThan(0);
  });

  test('password change writes a scrypt hash and the new password can log in', async () => {
    const session = await call('POST', '/api/auth/login', { email, password });
    expect(session.status).toBe(200);
    const nextPassword = 'new r4 password 456';
    const changed = await call('POST', '/api/auth/change-password', { currentPassword: password, newPassword: nextPassword }, session.body.data.token);
    expect(changed.status).toBe(200);
    expect((await db.query('SELECT password FROM users WHERE id=$1', [userId])).rows[0].password).toMatch(/^scrypt\$N=32768,r=8,p=3\$/);
    expect((await call('POST', '/api/auth/login', { email, password: nextPassword })).status).toBe(200);
  });
});
