// Phase 7 — notification service with pluggable channel adapters.
//
// Channels:
//   in_app    — writes a row into notifications (frontend polls it)
//   email     — SMTP via nodemailer when configured and installed; otherwise
//               a console transport that logs the message (so the adapter
//               surface is real and call sites never change when SMTP lands)
//   push / sms / whatsapp — stubs behind the same provider interface; wiring
//               a real provider later means replacing the stub object only.
//
// Delivery gating: per user × event_type × channel rows in
// notification_preferences. Default: in_app enabled, email disabled unless
// SMTP is configured. A preference row with enabled=false suppresses a
// channel that would otherwise fire; enabled=true forces one on.

'use strict';

const { query: defaultQuery } = require('../config/database');

// ---------------------------------------------------------------------------
// Provider interface: { send({ user, title, body, eventType, entityType,
// entityId, actionItemId }) => Promise<{ ok, detail? }> }
// ---------------------------------------------------------------------------

const inAppProvider = {
  async send(msg, opts = {}) {
    const client = opts.client || { query: opts.query || defaultQuery };
    const res = await client.query(
      `INSERT INTO notifications (user_id, channel, event_type, entity_type, entity_id, action_item_id, title, body, status)
       VALUES ($1, 'in_app', $2, $3, $4, $5, $6, $7, 'unread') RETURNING id`,
      [msg.userId, msg.eventType || null, msg.entityType || null, msg.entityId == null ? null : msg.entityId,
       msg.actionItemId == null ? null : msg.actionItemId, msg.title, msg.body || null]
    );
    return { ok: true, notificationId: res.rows[0] ? res.rows[0].id : null };
  },
};

const emailProvider = {
  async send(msg) {
    const to = (msg.user && msg.user.email) || null;
    if (!process.env.SMTP_HOST) {
      console.log(`[NOTIFY:email:console] to=${to || '<no-email>'} subject="${msg.title}" body="${msg.body}"`);
      return { ok: true, detail: 'logged (SMTP not configured)' };
    }
    let nodemailer;
    try {
      nodemailer = require('nodemailer');
    } catch (e) {
      console.log(`[NOTIFY:email:console] to=${to} subject="${msg.title}" (nodemailer not installed)`);
      return { ok: true, detail: 'logged (nodemailer not installed)' };
    }
    try {
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
      });
      const info = await transport.sendMail({
        from: process.env.SMTP_FROM || 'construction-erp@localhost',
        to,
        subject: msg.title,
        text: msg.body,
      });
      return { ok: true, detail: info.messageId };
    } catch (e) {
      console.error('[NOTIFY:email] send failed:', e.message);
      return { ok: false, detail: e.message };
    }
  },
};

// Stubs — same interface, explicitly not wired yet. Replacing one of these
// with a real provider never touches a call site.
function stubProvider(channel) {
  return {
    async send(msg) {
      console.log(`[NOTIFY:${channel}] (stub, not wired) to=${msg.userId} title="${msg.title}"`);
      return { ok: true, detail: `${channel} stub — provider not wired` };
    },
  };
}

const PROVIDERS = {
  in_app: inAppProvider,
  email: emailProvider,
  push: stubProvider('push'),
  sms: stubProvider('sms'),
  whatsapp: stubProvider('whatsapp'),
};

function getChannelProvider(channel) {
  return PROVIDERS[channel] || null;
}

// Channels a given event would use, honouring user preferences.
// Defaults: in_app always; email when SMTP is configured.
function defaultChannelsFor() {
  return process.env.SMTP_HOST ? ['in_app', 'email'] : ['in_app'];
}

async function resolveChannels(userId, eventType, opts = {}) {
  const client = opts.client || { query: opts.query || defaultQuery };
  const requested = opts.channels || defaultChannelsFor();
  const prefs = await client.query(
    'SELECT channel, enabled FROM notification_preferences WHERE user_id = $1 AND event_type = $2',
    [userId, eventType]
  );
  const prefMap = new Map(prefs.rows.map((r) => [r.channel, r.enabled]));
  return requested.filter((ch) => prefMap.has(ch) ? prefMap.get(ch) === true : ch === 'in_app');
}

// ---------------------------------------------------------------------------
// notify — the single entry point every caller uses.
// opts: { channels?, client?, query?, user? }
// ---------------------------------------------------------------------------

async function notify({ userId, title, body, eventType, entityType, entityId, actionItemId }, opts = {}) {
  const client = opts.client || { query: opts.query || defaultQuery };
  if (userId == null) return { ok: false, error: 'notify requires userId' };

  let user = opts.user || null;
  if (!user) {
    const u = await client.query('SELECT id, name, email, role FROM users WHERE id = $1', [userId]);
    user = u.rows[0] || null;
  }
  if (!user) return { ok: false, error: `Unknown user ${userId}` };

  const channels = await resolveChannels(userId, eventType || '*', { ...opts, client });
  const results = [];
  for (const channel of channels) {
    const provider = getChannelProvider(channel);
    if (!provider) continue;
    try {
      const r = await provider.send(
        { userId, user, title, body, eventType, entityType, entityId, actionItemId },
        { client }
      );
      results.push({ channel, ...r });
    } catch (e) {
      console.error(`[NOTIFY:${channel}] failed for user ${userId}:`, e.message);
      results.push({ channel, ok: false, detail: e.message });
    }
  }
  return { ok: results.some((r) => r.ok), results };
}

// notifyRoles — fan out to every active user holding one of the roles.
async function notifyRoles(roles, message, opts = {}) {
  const client = opts.client || { query: opts.query || defaultQuery };
  const users = await client.query('SELECT id, name, email, role FROM users WHERE is_active = true');
  const targets = users.rows.filter((u) => (Array.isArray(roles) ? roles : [roles]).includes(u.role) && u.id !== message.excludeUserId);
  const results = [];
  for (const user of targets) {
    const r = await notify({ ...message, userId: user.id, user }, { ...opts, client, channels: message.channels });
    results.push({ userId: user.id, ...r });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Read API for the frontend
// ---------------------------------------------------------------------------

async function getNotifications(userId, opts = {}) {
  const client = opts.client || { query: opts.query || defaultQuery };
  const unreadOnly = opts.unreadOnly === true;
  const limit = opts.limit ? parseInt(opts.limit, 10) : 50;
  const sql = unreadOnly
    ? `SELECT * FROM notifications WHERE user_id = $1 AND status = 'unread' ORDER BY created_at DESC LIMIT $2`
    : `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`;
  const res = await client.query(sql, [userId, limit]);
  return res.rows;
}

async function unreadCount(userId, opts = {}) {
  const client = opts.client || { query: opts.query || defaultQuery };
  const res = await client.query(
    `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND status = 'unread'`,
    [userId]
  );
  return res.rows[0] ? Number(res.rows[0].count) : 0;
}

async function markRead(notificationId, userId, opts = {}) {
  const client = opts.client || { query: opts.query || defaultQuery };
  const res = await client.query(
    `UPDATE notifications SET status = 'read', read_at = $3 WHERE id = $1 AND user_id = $2`,
    [notificationId, userId, new Date()]
  );
  return { ok: true, updated: res.rowCount != null ? res.rowCount : 0 };
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

async function getPreferences(userId, opts = {}) {
  const client = opts.client || { query: opts.query || defaultQuery };
  const res = await client.query('SELECT * FROM notification_preferences WHERE user_id = $1', [userId]);
  return res.rows;
}

async function setPreference(userId, eventType, channel, enabled, opts = {}) {
  const client = opts.client || { query: opts.query || defaultQuery };
  const existing = await client.query(
    'SELECT id, enabled FROM notification_preferences WHERE user_id = $1 AND event_type = $2 AND channel = $3',
    [userId, eventType, channel]
  );
  if (existing.rows[0]) {
    await client.query('UPDATE notification_preferences SET enabled = $1 WHERE id = $2', [enabled, existing.rows[0].id]);
  } else {
    await client.query(
      `INSERT INTO notification_preferences (user_id, event_type, channel, enabled) VALUES ($1, $2, $3, $4)`,
      [userId, eventType, channel, enabled]
    );
  }
  return { ok: true };
}

module.exports = {
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
};
