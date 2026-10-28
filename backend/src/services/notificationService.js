'use strict';

const crypto = require('crypto');
const { query: defaultQuery } = require('../config/database');
const policy = require('./policy');

const CHANNELS = ['in_app', 'email', 'push', 'sms', 'whatsapp'];
const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_SECONDS = 30;

// Loaded lazily/defensively: the smtp path below is only reachable when an
// operator has explicitly set NOTIFICATION_EMAIL_PROVIDER=smtp AND
// NOTIFICATION_LIVE_SEND_ENABLED=true, so a missing module must not crash
// module load for every other deployment that keeps email off (the default).
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch (error) { nodemailer = null; }

function clientFor(opts = {}) {
  return opts.client || { query: opts.query || defaultQuery };
}

function configuredProviderName(channel) {
  if (channel === 'in_app') return 'database';
  return String(process.env[`NOTIFICATION_${channel.toUpperCase()}_PROVIDER`] || 'off').toLowerCase();
}

function defaultChannelsFor() {
  return CHANNELS.filter((channel) => channel === 'in_app'
    || (configuredProviderName(channel) !== 'off' && configuredProviderName(channel) !== ''));
}

// The in-app row and delivery row share a delivery id. If a process stops
// after inserting the inbox row but before marking the delivery sent, retrying
// the same delivery cannot create a duplicate notification.
const inAppProvider = {
  providerName: 'database',
  async send(msg, opts = {}) {
    const client = opts.client || { query: opts.query || defaultQuery };
    const inserted = await client.query(
      `INSERT INTO notifications (user_id, channel, event_type, entity_type, entity_id, action_item_id, title, body, status, delivery_id)
       VALUES ($1, 'in_app', $2, $3, $4, $5, $6, $7, 'unread', $8)
       ON CONFLICT (delivery_id) WHERE delivery_id IS NOT NULL DO NOTHING RETURNING id`,
      [msg.userId, msg.eventType || null, msg.entityType || null, msg.entityId == null ? null : msg.entityId,
        msg.actionItemId == null ? null : msg.actionItemId, msg.title, msg.body || null, msg.deliveryId]
    );
    if (inserted.rows[0]) return { ok: true, notificationId: inserted.rows[0].id };
    const existing = await client.query('SELECT id FROM notifications WHERE delivery_id = $1', [msg.deliveryId]);
    return { ok: true, notificationId: existing.rows[0]?.id || null };
  },
};

// SMTP transport config is read from env vars only; values are never logged.
// Existence checks only (host/from address) — the actual host/user/password
// values never appear in a log line or thrown error message.
function smtpTransportConfig() {
  const port = Number(process.env.SMTP_PORT);
  const auth = process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    : undefined;
  return {
    host: process.env.SMTP_HOST,
    port: Number.isFinite(port) && port > 0 ? port : 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth,
  };
}

// These providers intentionally do not send externally by default. They give
// operators a truthful, visible result until a real provider and credentials
// are approved. Email gains a real SMTP adapter, but it only ever dispatches
// when BOTH NOTIFICATION_EMAIL_PROVIDER=smtp AND NOTIFICATION_LIVE_SEND_ENABLED=true
// are set; any other configuration keeps today's undelivered/stub behavior unchanged.
const emailProvider = {
  async send(msg) {
    const configured = configuredProviderName('email');
    if (configured === 'console') {
      console.log(`[NOTIFY:email:console] delivery_id=${msg.deliveryId} status=undelivered`);
      return { ok: false, status: 'undelivered', errorCode: 'console_only' };
    }
    if (configured === 'smtp' && process.env.NOTIFICATION_LIVE_SEND_ENABLED !== 'true') {
      return { ok: false, status: 'undelivered', errorCode: 'live_delivery_disabled' };
    }
    if (configured === 'smtp' && process.env.NOTIFICATION_LIVE_SEND_ENABLED === 'true') {
      if (!process.env.SMTP_HOST || !process.env.SMTP_FROM_ADDRESS || !nodemailer) {
        return { ok: false, status: 'undelivered', errorCode: 'smtp_not_configured' };
      }
      const to = msg.user?.email;
      if (!to) return { ok: false, status: 'undelivered', errorCode: 'recipient_email_missing' };
      try {
        const transport = nodemailer.createTransport(smtpTransportConfig());
        const fromAddress = process.env.SMTP_FROM_ADDRESS;
        const fromName = process.env.SMTP_FROM_NAME;
        const from = fromName ? `"${fromName}" <${fromAddress}>` : fromAddress;
        await transport.sendMail({ from, to, subject: msg.title, text: msg.body || msg.title });
        return { ok: true, status: 'sent' };
      } catch (error) {
        // Do not log the error: nodemailer rejection messages can include the
        // recipient address or server banner text.
        return { ok: false, status: 'failed', errorCode: 'smtp_send_failed' };
      }
    }
    return { ok: false, status: 'undelivered', errorCode: configured === 'off' ? 'provider_unconfigured' : 'provider_unavailable' };
  },
};

function placeholderProvider(channel) {
  return {
    async send() {
      const configured = configuredProviderName(channel);
      return { ok: false, status: 'undelivered', errorCode: configured === 'off' ? 'provider_unconfigured' : 'provider_unavailable' };
    },
  };
}

const PROVIDERS = {
  in_app: inAppProvider,
  email: emailProvider,
  push: placeholderProvider('push'),
  sms: placeholderProvider('sms'),
  whatsapp: placeholderProvider('whatsapp'),
};

function getChannelProvider(channel) {
  return PROVIDERS[channel] || null;
}

function providerFor(channel, opts = {}) {
  return (opts.providers && opts.providers[channel]) || getChannelProvider(channel);
}

function scopeKey(message, userId, channel, opts) {
  const supplied = message.idempotencyKey || opts.deliveryIdempotencyKey;
  const seed = supplied
    ? `${supplied}:${userId}:${channel}:${message.eventType || ''}:${message.entityType || ''}:${message.entityId ?? ''}:${message.actionItemId ?? ''}`
    : crypto.randomUUID();
  return crypto.createHash('sha256').update(seed).digest('hex');
}

async function resolveChannels(userId, eventType, opts = {}) {
  const client = clientFor(opts);
  const requested = opts.channels || defaultChannelsFor();
  const prefs = await client.query(
    'SELECT channel, enabled FROM notification_preferences WHERE user_id = $1 AND event_type = $2',
    [userId, eventType]
  );
  const prefMap = new Map(prefs.rows.map((row) => [row.channel, row.enabled]));
  return requested.filter((channel) => prefMap.has(channel) ? prefMap.get(channel) === true : channel === 'in_app');
}

async function createOrGetDelivery(message, channel, status, errorCode, opts = {}) {
  const client = clientFor(opts);
  const key = scopeKey(message, message.userId, channel, opts);
  const provider = providerFor(channel, opts);
  const providerName = provider?.providerName || configuredProviderName(channel);
  const payload = {
    title: message.title,
    body: message.body || null,
    eventType: message.eventType || null,
    entityType: message.entityType || null,
    entityId: message.entityId == null ? null : message.entityId,
    actionItemId: message.actionItemId == null ? null : message.actionItemId,
  };
  const inserted = await client.query(
    `INSERT INTO notification_deliveries (user_id, channel, event_type, entity_type, entity_id, action_item_id,
       idempotency_key, provider, status, max_attempts, last_error_code, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
     ON CONFLICT (user_id, channel, idempotency_key) DO NOTHING RETURNING *`,
    [message.userId, channel, message.eventType || null, message.entityType || null,
      message.entityId == null ? null : message.entityId, message.actionItemId == null ? null : message.actionItemId,
      key, providerName, status || 'queued', MAX_ATTEMPTS, errorCode || null, JSON.stringify(payload)]
  );
  if (inserted.rows[0]) return inserted.rows[0];
  const existing = await client.query(
    'SELECT * FROM notification_deliveries WHERE user_id = $1 AND channel = $2 AND idempotency_key = $3',
    [message.userId, channel, key]
  );
  return existing.rows[0] || null;
}

function deliveryResponse(row) {
  if (!row) return { ok: false, status: 'failed', errorCode: 'delivery_record_missing' };
  return {
    ok: row.status === 'sent', channel: row.channel, status: row.status,
    deliveryId: row.id, notificationId: row.notification_id || null,
    errorCode: row.last_error_code || undefined, attempts: Number(row.attempts || 0),
  };
}

async function finishDelivery(id, status, errorCode, nextRetryAt, opts = {}, notificationId = null) {
  const client = clientFor(opts);
  const updated = await client.query(
    `UPDATE notification_deliveries SET status = $1, last_error_code = $2, next_retry_at = $3,
       notification_id = $5, updated_at = $4
     WHERE id = $6 RETURNING *`,
    [status, errorCode || null, nextRetryAt || null, new Date(), notificationId, id]
  );
  return updated.rows[0] || null;
}

async function attemptDelivery(delivery, message, opts = {}) {
  if (!delivery) return deliveryResponse(null);
  if (['sent', 'suppressed', 'sending'].includes(delivery.status)) return deliveryResponse(delivery);
  if (delivery.status === 'undelivered' && opts.force !== true) return deliveryResponse(delivery);
  if (delivery.status === 'failed' && opts.force !== true && delivery.next_retry_at
      && new Date(delivery.next_retry_at).getTime() > Date.now()) return deliveryResponse(delivery);
  const attempts = Number(delivery.attempts || 0);
  const maxAttempts = Number(delivery.max_attempts || MAX_ATTEMPTS);
  if (attempts >= maxAttempts) return deliveryResponse(delivery);

  const client = clientFor(opts);
  const provider = providerFor(delivery.channel, opts);
  if (!provider || typeof provider.send !== 'function') {
    const failed = await finishDelivery(delivery.id, 'undelivered', 'provider_unavailable', null, opts);
    return deliveryResponse(failed);
  }
  const providerName = provider.providerName || configuredProviderName(delivery.channel);
  const claimed = await client.query(
    `UPDATE notification_deliveries SET status = $1, attempts = $2, provider = $3, updated_at = $4
     WHERE id = $5 AND status = $6 RETURNING *`,
    ['sending', attempts + 1, providerName, new Date(), delivery.id, delivery.status]
  );
  if (!claimed.rows[0]) {
    const current = await client.query('SELECT * FROM notification_deliveries WHERE id = $1', [delivery.id]);
    return deliveryResponse(current.rows[0]);
  }

  let result;
  try {
    result = await provider.send({ ...message, deliveryId: delivery.id, idempotencyKey: delivery.idempotency_key }, { client });
  } catch (error) {
    // Do not log provider exception text: adapters may include secrets or recipient data.
    console.error(`[NOTIFY] provider failed for delivery_id=${delivery.id}`);
    result = { ok: false, errorCode: 'provider_error' };
  }
  const sent = result?.ok === true;
  const status = sent ? 'sent' : (result?.status === 'undelivered' ? 'undelivered' : 'failed');
  const errorCode = sent ? null : (result?.errorCode || 'provider_error');
  const retrySeconds = status === 'failed' && attempts + 1 < maxAttempts
    ? Math.min(3600, BACKOFF_BASE_SECONDS * (2 ** attempts)) : null;
  const nextRetryAt = retrySeconds == null ? null : new Date(Date.now() + retrySeconds * 1000);
  const finished = await finishDelivery(delivery.id, status, errorCode, nextRetryAt, opts, result.notificationId);
  // A genuine send attempt happened above (this path is never reached for a
  // 'suppressed' preference-disabled delivery). Record the failure in the
  // same transaction/client as the delivery-row update so it is atomic with it.
  if (!sent) {
    await policy.recordAuditEvent({
      entity: 'notification_delivery',
      entityId: delivery.id,
      action: 'dispatch_failed',
      after: { channel: delivery.channel, errorCode, attempts: finished ? finished.attempts : attempts + 1 },
      userId: delivery.user_id,
    }, { query: client.query.bind(client) });
  }
  return deliveryResponse(finished);
}

async function notify({ userId, title, body, eventType, entityType, entityId, actionItemId, idempotencyKey }, opts = {}) {
  const client = clientFor(opts);
  if (userId == null) return { ok: false, error: 'notify requires userId', results: [] };
  if (!title || typeof title !== 'string') return { ok: false, error: 'notify requires title', results: [] };

  let user = opts.user || null;
  if (!user) {
    const result = await client.query('SELECT id, name, email, role FROM users WHERE id = $1', [userId]);
    user = result.rows[0] || null;
  }
  if (!user) return { ok: false, error: 'notification_user_not_found', results: [] };

  const message = { userId, user, title, body, eventType, entityType, entityId, actionItemId, idempotencyKey };
  const requested = opts.channels || defaultChannelsFor();
  const allowed = await resolveChannels(userId, eventType || '*', { ...opts, client, channels: requested });
  const results = [];
  for (const channel of requested) {
    if (!CHANNELS.includes(channel)) continue;
    if (!allowed.includes(channel)) {
      const suppressed = await createOrGetDelivery(message, channel, 'suppressed', 'preference_disabled', opts);
      results.push(deliveryResponse(suppressed));
      continue;
    }
    const delivery = await createOrGetDelivery(message, channel, 'queued', null, opts);
    results.push(await attemptDelivery(delivery, message, { ...opts, client }));
  }
  return { ok: results.some((result) => result.ok), results };
}

async function notifyRoles(roles, message, opts = {}) {
  const client = clientFor(opts);
  const users = await client.query('SELECT id, name, email, role FROM users WHERE is_active = true');
  const roleSet = new Set(Array.isArray(roles) ? roles : [roles]);
  const targets = users.rows.filter((user) => roleSet.has(user.role) && user.id !== message.excludeUserId);
  const results = [];
  for (const user of targets) {
    const result = await notify({ ...message, userId: user.id, user }, { ...opts, client });
    results.push({ userId: user.id, ...result });
  }
  return results;
}

async function getNotifications(userId, opts = {}) {
  const client = clientFor(opts);
  const unreadOnly = opts.unreadOnly === true;
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 50, 1), 200);
  const sql = unreadOnly
    ? `SELECT * FROM notifications WHERE user_id = $1 AND status = 'unread' ORDER BY created_at DESC LIMIT $2`
    : `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`;
  return (await client.query(sql, [userId, limit])).rows;
}

async function unreadCount(userId, opts = {}) {
  const client = clientFor(opts);
  const result = await client.query('SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND status = \'unread\'', [userId]);
  return result.rows[0] ? Number(result.rows[0].count) : 0;
}

async function markRead(notificationId, userId, opts = {}) {
  const client = clientFor(opts);
  const result = await client.query(
    `UPDATE notifications SET status = 'read', read_at = $3 WHERE id = $1 AND user_id = $2`,
    [notificationId, userId, new Date()]
  );
  return { ok: true, updated: result.rowCount != null ? result.rowCount : 0 };
}

async function getPreferences(userId, opts = {}) {
  const client = clientFor(opts);
  return (await client.query('SELECT * FROM notification_preferences WHERE user_id = $1', [userId])).rows;
}

async function setPreference(userId, eventType, channel, enabled, opts = {}) {
  if (!CHANNELS.includes(channel)) throw Object.assign(new Error('invalid_notification_channel'), { error_code: 'invalid_notification_channel', status: 400 });
  const client = clientFor(opts);
  const existing = await client.query(
    'SELECT id FROM notification_preferences WHERE user_id = $1 AND event_type = $2 AND channel = $3',
    [userId, eventType, channel]
  );
  if (existing.rows[0]) {
    await client.query('UPDATE notification_preferences SET enabled = $1 WHERE id = $2', [enabled === true, existing.rows[0].id]);
  } else {
    await client.query(
      `INSERT INTO notification_preferences (user_id, event_type, channel, enabled) VALUES ($1, $2, $3, $4)`,
      [userId, eventType, channel, enabled === true]
    );
  }
  return { ok: true };
}

async function getDeliveries(userId, opts = {}) {
  const client = clientFor(opts);
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 50, 1), 200);
  return (await client.query(
    `SELECT id, user_id, channel, event_type, entity_type, entity_id, action_item_id, provider, status,
            attempts, max_attempts, last_error_code, next_retry_at, created_at, updated_at
     FROM notification_deliveries WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`, [userId, limit]
  )).rows;
}

async function retryDelivery(deliveryId, userId, opts = {}) {
  const client = clientFor(opts);
  const result = await client.query('SELECT * FROM notification_deliveries WHERE id = $1 AND user_id = $2', [deliveryId, userId]);
  const delivery = result.rows[0];
  if (!delivery) throw Object.assign(new Error('notification_delivery_not_found'), { error_code: 'notification_delivery_not_found', status: 404 });
  if (['sent', 'suppressed', 'sending'].includes(delivery.status)) return deliveryResponse(delivery);
  if (Number(delivery.attempts || 0) >= Number(delivery.max_attempts || MAX_ATTEMPTS)) {
    throw Object.assign(new Error('notification_retry_limit_reached'), { error_code: 'notification_retry_limit_reached', status: 409 });
  }
  const allowed = await resolveChannels(userId, delivery.event_type || '*', { ...opts, client, channels: [delivery.channel] });
  if (!allowed.includes(delivery.channel)) {
    return deliveryResponse(await finishDelivery(delivery.id, 'suppressed', 'preference_disabled', null, { ...opts, client }));
  }
  const payload = typeof delivery.payload === 'string' ? JSON.parse(delivery.payload) : (delivery.payload || {});
  const userResult = await client.query('SELECT id, name, email, role FROM users WHERE id = $1 AND is_active = true', [userId]);
  if (!userResult.rows[0]) throw Object.assign(new Error('notification_user_not_found'), { error_code: 'notification_user_not_found', status: 404 });
  return attemptDelivery(delivery, { ...payload, userId, user: userResult.rows[0] }, { ...opts, client, force: opts.force !== false });
}

async function reapStuckDeliveries(opts = {}) {
  const client = clientFor(opts);
  const result = await client.query(
    `UPDATE notification_deliveries
     SET status = 'failed', last_error_code = 'delivery_interrupted', next_retry_at = NOW(), updated_at = NOW()
     WHERE status = 'sending' AND updated_at < NOW() - INTERVAL '5 minutes'
     RETURNING id`
  );
  return { reaped: result.rows.length };
}

async function retryDueDeliveries(opts = {}) {
  const client = clientFor(opts);
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
  await reapStuckDeliveries({ ...opts, client });
  const due = await client.query(
    `SELECT id, user_id FROM notification_deliveries
     WHERE status = 'failed' AND next_retry_at <= NOW() AND attempts < max_attempts
     ORDER BY next_retry_at, id LIMIT $1`, [limit]
  );
  let retried = 0;
  for (const row of due.rows) {
    try { await retryDelivery(row.id, row.user_id, { ...opts, client, force: false }); retried += 1; }
    catch (error) { console.error(`[NOTIFY] retry failed for delivery_id=${row.id}`); }
  }
  return { considered: due.rows.length, retried };
}

module.exports = {
  CHANNELS,
  MAX_ATTEMPTS,
  PROVIDERS,
  getChannelProvider,
  defaultChannelsFor,
  resolveChannels,
  notify,
  notifyRoles,
  getNotifications,
  unreadCount,
  markRead,
  getPreferences,
  setPreference,
  getDeliveries,
  retryDelivery,
  reapStuckDeliveries,
  retryDueDeliveries,
};
