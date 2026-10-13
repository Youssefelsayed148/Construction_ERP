process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
const db = require('../../config/database');
const tokens = require('../../services/tokens');
const notifications = require('../../services/notificationService');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('notification delivery status and retry (real PostgreSQL)', () => {
  const tag = String(Date.now()).slice(-7);
  let app; let server; let base; let owner; let userId;

  const row = async (sql, params) => (await db.query(sql, params)).rows[0];
  const call = async (method, path, body) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: body == null ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const user = await row("INSERT INTO users (name,email,password,role,is_active) VALUES ($1,$2,'x','owner',true) RETURNING id,token_version", [`notify-${tag}`, `notify-${tag}@test.invalid`]);
    userId = user.id;
    await db.query("INSERT INTO user_project_roles (user_id,project_id,role_id) SELECT $1,NULL,id FROM roles WHERE key='owner'", [userId]);
    owner = { id: userId, token: tokens.signSession({ userId, tokenVersion: user.token_version || 0 }) };
  });

  afterAll(async () => {
    await db.query('DELETE FROM notifications WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM notification_deliveries WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM notification_preferences WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [userId]);
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [userId]);
    if (server) await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('creates one in-app row per idempotency key and exposes only safe delivery status fields', async () => {
    const msg = { userId, title: 'Delivery idempotency', body: 'Status note', eventType: `delivery.${tag}`, idempotencyKey: `idem-${tag}` };
    const first = await notifications.notify(msg, { channels: ['in_app'] });
    const replay = await notifications.notify(msg, { channels: ['in_app'] });
    expect(first.results[0].status).toBe('sent');
    expect(replay.results[0].status).toBe('sent');
    expect((await db.query('SELECT * FROM notifications WHERE user_id = $1', [userId])).rows).toHaveLength(1);
    const status = await call('GET', '/api/notifications/deliveries?limit=20');
    expect(status.status).toBe(200);
    const delivery = status.body.data.find((item) => item.channel === 'in_app');
    expect(delivery).toMatchObject({ status: 'sent', attempts: 1, provider: 'database' });
    expect(JSON.stringify(delivery)).not.toContain('Status note');
  });

  test('records preference suppression and reports unconfigured email as undelivered', async () => {
    const eventType = `delivery-suppressed.${tag}`;
    await notifications.setPreference(userId, eventType, 'in_app', false);
    const suppressed = await notifications.notify({ userId, title: 'Suppressed', eventType }, { channels: ['in_app'] });
    expect(suppressed.results[0].status).toBe('suppressed');
    expect((await db.query('SELECT * FROM notifications WHERE user_id = $1 AND title = $2', [userId, 'Suppressed'])).rows).toHaveLength(0);

    const emailEvent = `delivery-email.${tag}`;
    await notifications.setPreference(userId, emailEvent, 'email', true);
    const email = await notifications.notify({ userId, title: 'Email status', eventType: emailEvent }, { channels: ['email'] });
    expect(email.ok).toBe(false);
    expect(email.results[0]).toMatchObject({ status: 'undelivered', errorCode: 'provider_unconfigured' });
  });

  test('retries the same failed delivery idempotently through an injected provider', async () => {
    const eventType = `delivery-retry.${tag}`;
    await notifications.setPreference(userId, eventType, 'email', true);
    const send = jest.fn()
      .mockRejectedValueOnce(new Error('provider details must not be exposed'))
      .mockResolvedValueOnce({ ok: true, detail: 'provider message id' });
    const providers = { email: { providerName: 'test-provider', send } };
    const msg = { userId, title: 'Retry message', body: 'Sensitive content', eventType, idempotencyKey: `retry-${tag}` };
    const first = await notifications.notify(msg, { channels: ['email'], providers });
    expect(first.results[0].status).toBe('failed');
    const listed = await notifications.getDeliveries(userId);
    const delivery = listed.find((item) => item.event_type === eventType);
    expect(delivery).toMatchObject({ attempts: 1, last_error_code: 'provider_error', provider: 'test-provider' });
    const retried = await notifications.retryDelivery(delivery.id, userId, { providers });
    expect(retried).toMatchObject({ status: 'sent', attempts: 2 });
    const replay = await notifications.notify(msg, { channels: ['email'], providers });
    expect(replay.results[0].status).toBe('sent');
    expect(send).toHaveBeenCalledTimes(2);
    const status = await call('GET', '/api/notifications/deliveries');
    expect(status.status).toBe(200);
    expect(JSON.stringify(status.body)).not.toContain('Sensitive content');
  });
});
