// Unit tests for the SMTP email adapter in services/notificationService.js.
//
// No live database and no real network send: a stub query function stands in
// for the DB client (same technique as scripts/__tests__/policy.test.js), and
// nodemailer itself is mocked so no SMTP connection is ever attempted.

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
const nodemailer = require('nodemailer');
// Required once: nodemailer is captured by reference at notificationService's
// module-load time, so re-requiring the service per test (with jest.resetModules)
// would decouple it from the `nodemailer` mock instance asserted on below.
const notifications = require('../../services/notificationService');

// Build a minimal stand-in for a transaction client that understands only the
// SQL shapes notify()/attemptDelivery()/finishDelivery()/recordAuditEvent use.
function makeClient({ preferenceEnabled = true } = {}) {
  let deliveryRow = null;
  const auditEvents = [];
  const query = async (sql, params) => {
    if (/SELECT channel, enabled FROM notification_preferences/i.test(sql)) {
      return { rows: preferenceEnabled ? [{ channel: 'email', enabled: true }] : [] };
    }
    if (/INSERT INTO notification_deliveries/i.test(sql)) {
      deliveryRow = {
        id: 1, user_id: params[0], channel: params[1], event_type: params[2],
        entity_type: params[3], entity_id: params[4], action_item_id: params[5],
        idempotency_key: params[6], provider: params[7], status: params[8],
        attempts: 0, max_attempts: params[9], last_error_code: params[10] || null,
        payload: params[11], notification_id: null,
      };
      return { rows: [deliveryRow] };
    }
    if (/UPDATE notification_deliveries SET status = \$1, attempts = \$2, provider = \$3/i.test(sql)) {
      const [status, attempts, provider, , id, expectedStatus] = params;
      if (!deliveryRow || deliveryRow.id !== id || deliveryRow.status !== expectedStatus) return { rows: [] };
      deliveryRow = { ...deliveryRow, status, attempts, provider };
      return { rows: [deliveryRow] };
    }
    if (/UPDATE notification_deliveries SET status = \$1, last_error_code = \$2, next_retry_at = \$3/i.test(sql)) {
      const [status, lastErrorCode, nextRetryAt, , notificationId, id] = params;
      if (!deliveryRow || deliveryRow.id !== id) return { rows: [] };
      deliveryRow = { ...deliveryRow, status, last_error_code: lastErrorCode, next_retry_at: nextRetryAt, notification_id: notificationId };
      return { rows: [deliveryRow] };
    }
    if (/INSERT INTO audit_events/i.test(sql)) {
      const [entity, entityId, action, before, after, userId] = params;
      auditEvents.push({ entity, entityId, action, before, after, userId });
      return { rows: [{ id: auditEvents.length }] };
    }
    throw new Error(`notification-smtp.test stub: unexpected SQL: ${sql.slice(0, 120)}`);
  };
  return { query, auditEvents, getDeliveryRow: () => deliveryRow };
}

describe('notificationService SMTP email adapter', () => {
  const ENV_KEYS = [
    'NOTIFICATION_EMAIL_PROVIDER', 'NOTIFICATION_LIVE_SEND_ENABLED', 'SMTP_HOST', 'SMTP_PORT',
    'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM_ADDRESS', 'SMTP_FROM_NAME',
  ];
  let savedEnv;

  beforeEach(() => {
    savedEnv = {};
    for (const key of ENV_KEYS) { savedEnv[key] = process.env[key]; delete process.env[key]; }
    nodemailer.createTransport.mockReset();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key];
    }
  });

  test('email stays undelivered by default (no provider configured) and records a dispatch_failed audit event', async () => {
    const client = makeClient();
    const result = await notifications.notify(
      { userId: 501, title: 'Default behavior', eventType: 'smtp-test.default' },
      { channels: ['email'], client, user: { id: 501, name: 'Default User', email: 'default@example.test' } }
    );
    expect(result.results[0]).toMatchObject({ status: 'undelivered', errorCode: 'provider_unconfigured' });
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(client.auditEvents).toHaveLength(1);
    expect(client.auditEvents[0]).toMatchObject({ entity: 'notification_delivery', action: 'dispatch_failed', userId: 501 });
  });

  test('smtp + live-send-enabled + configured env sends through the fake transport and records status=sent', async () => {
    process.env.NOTIFICATION_EMAIL_PROVIDER = 'smtp';
    process.env.NOTIFICATION_LIVE_SEND_ENABLED = 'true';
    process.env.SMTP_HOST = 'smtp.example.test';
    process.env.SMTP_FROM_ADDRESS = 'noreply@example.test';
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'fake-id' });
    nodemailer.createTransport.mockReturnValue({ sendMail });
    const client = makeClient();
    const result = await notifications.notify(
      { userId: 502, title: 'Live send', body: 'Body text', eventType: 'smtp-test.live' },
      { channels: ['email'], client, user: { id: 502, name: 'Live User', email: 'live@example.test' } }
    );
    expect(result.results[0]).toMatchObject({ status: 'sent' });
    expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'live@example.test', subject: 'Live send' }));
    expect(client.auditEvents).toHaveLength(0); // no audit event on a successful dispatch
  });

  test('smtp + live-send-enabled but missing SMTP_HOST fails closed with smtp_not_configured and audits the failure', async () => {
    process.env.NOTIFICATION_EMAIL_PROVIDER = 'smtp';
    process.env.NOTIFICATION_LIVE_SEND_ENABLED = 'true';
    process.env.SMTP_FROM_ADDRESS = 'noreply@example.test';
    // SMTP_HOST intentionally left unset.
    const client = makeClient();
    const result = await notifications.notify(
      { userId: 503, title: 'Missing config', eventType: 'smtp-test.missing' },
      { channels: ['email'], client, user: { id: 503, name: 'Missing User', email: 'missing@example.test' } }
    );
    expect(result.results[0]).toMatchObject({ status: 'undelivered', errorCode: 'smtp_not_configured' });
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(client.auditEvents).toHaveLength(1);
    expect(client.auditEvents[0]).toMatchObject({ entity: 'notification_delivery', action: 'dispatch_failed', userId: 503 });
    expect(JSON.parse(client.auditEvents[0].after)).toMatchObject({ channel: 'email', errorCode: 'smtp_not_configured' });
  });
});
