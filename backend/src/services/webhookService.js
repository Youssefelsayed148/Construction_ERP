// Phase 26 — Webhooks with delivery retry and a dead-letter path.
//
// Subscribers register a URL + secret + event list (wildcards allowed, e.g.
// 'rfi.*'). Events are the Phase 2 architecture event list, emitted through
// the existing event system (utils/activity.fireEvent → event_log row +
// global.eventBus). webhookService subscribes to the bus the same way the
// Phase 7 dispatcher and the Phase 13 cost listener do.
//
// Delivery state machine (webhook_deliveries.status):
//   pending    — queued, not yet attempted
//   retrying   — attempt failed; next_attempt_at holds the backoff slot
//   delivered  — 2xx received
//   dead_letter— max attempts exhausted; redrive via API
//
// Each POST carries:
//   X-Osiris-Event:     event type
//   X-Osiris-Delivery:  delivery id
//   X-Osiris-Signature: HMAC-SHA256(timestamp + '.' + rawBody, secret)
//   X-Osiris-Timestamp: unix seconds (signature freshness window 5 min)

'use strict';

const crypto = require('crypto');
const dns = require('dns').promises;
const http = require('http');
const https = require('https');
const net = require('net');
const { query: defaultQuery } = require('../config/database');
const sweepLeader = require('./sweepLeader');

// Canonical subscribable events (Phase 2 architecture list + the internal
// events that carry the same meaning). '*' matches any prefix; an exact
// event type matches itself.
const EVENT_CATALOG = [
  'project.created',
  'rfi.*',
  'submittal.*',
  'observation.*',
  'inventory.low',
  'purchase_order.issued',
  'delivery.received',
  'mir.*',
  'invoice.*',
  'payment.received',
  'variation.approved',
  'action.overdue',
  // Additional internal events v1 consumers may subscribe to:
  'approval.requested',
  'work_completion.verified',
  'schedule.activity.changed',
  'allocation.quantity_changed',
  'transmittal.acknowledged',
  'handover.advanced',
  'report.generated',
];

const BACKOFF_MINUTES = [1, 5, 30, 120, 480]; // attempt n+1 waits BACKOFF[n-1]
const DELIVERY_TIMEOUT_MS = 10000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const SWEEP_INTERVAL_MS = 60 * 1000;

class WebhookUrlError extends Error {
  constructor(message, code = 'webhook_url_rejected') {
    super(message);
    this.name = 'WebhookUrlError';
    this.error_code = code;
    this.status = 400;
  }
}

function ipv4ToNumber(address) {
  return address.split('.').reduce((value, octet) => ((value << 8) | Number(octet)) >>> 0, 0);
}

function inIpv4Cidr(address, base, bits) {
  const shift = 32 - bits;
  return (ipv4ToNumber(address) >>> shift) === (ipv4ToNumber(base) >>> shift);
}

function parseIpv6(address) {
  let value = address.toLowerCase().split('%')[0];
  if (value.includes('.')) {
    const lastColon = value.lastIndexOf(':');
    const ipv4 = ipv4ToNumber(value.slice(lastColon + 1));
    value = `${value.slice(0, lastColon)}:${(ipv4 >>> 16).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }
  const halves = value.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = [...left, ...Array(missing).fill('0'), ...right];
  if (groups.length !== 8 || groups.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return groups.reduce((result, part) => (result << 16n) | BigInt(`0x${part}`), 0n);
}

function isBlockedAddress(address) {
  const family = net.isIP(address);
  if (family === 4) {
    return [
      ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
      ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
      ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
      ['224.0.0.0', 4], ['240.0.0.0', 4],
    ].some(([base, bits]) => inIpv4Cidr(address, base, bits));
  }
  if (family !== 6) return true;
  const value = parseIpv6(address);
  if (value == null) return true;
  const mappedPrefix = value >> 32n;
  if (mappedPrefix === 0xffffn) {
    const embedded = Number(value & 0xffffffffn);
    return isBlockedAddress(`${embedded >>> 24}.${(embedded >>> 16) & 255}.${(embedded >>> 8) & 255}.${embedded & 255}`);
  }
  // Accept only global-unicast 2000::/3. This rejects unspecified, loopback,
  // link-local, unique-local, multicast and IPv4-compatible addresses.
  if ((value >> 125n) !== 1n) return true;
  // 6to4 can tunnel an embedded private IPv4 address through a global IPv6
  // target. Reject the entire transition prefix, including public embeddings.
  if ((value >> 112n) === 0x2002n) return true;
  const documentation = parseIpv6('2001:db8::');
  return (value >> 96n) === (documentation >> 96n);
}

async function resolveWebhookTarget(rawUrl, { lookup = dns.lookup } = {}) {
  let url;
  try { url = new URL(rawUrl); } catch { throw new WebhookUrlError('Webhook URL is invalid'); }
  const allowHttp = process.env.WEBHOOK_ALLOW_HTTP_LOCAL === 'true';
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
    throw new WebhookUrlError('Webhook URLs must use HTTPS');
  }
  if (url.username || url.password || !url.hostname) throw new WebhookUrlError('Webhook URL credentials are not allowed');
  let addresses;
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const literalFamily = net.isIP(hostname);
  try {
    addresses = literalFamily
      ? [{ address: hostname, family: literalFamily }]
      : await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new WebhookUrlError('Webhook hostname could not be resolved', 'webhook_dns_failed');
  }
  if (!Array.isArray(addresses) || addresses.length === 0) throw new WebhookUrlError('Webhook hostname has no addresses', 'webhook_dns_failed');
  if (addresses.some((entry) => isBlockedAddress(entry.address))) {
    throw new WebhookUrlError('Webhook hostname resolves to a prohibited network');
  }
  return { url, address: addresses[0].address, family: addresses[0].family };
}

function postWebhook(target, body, headers, { requestImpl, timeoutMs = DELIVERY_TIMEOUT_MS, maxResponseBytes = MAX_RESPONSE_BYTES } = {}) {
  const transport = requestImpl || (target.url.protocol === 'https:' ? https.request : http.request);
  return new Promise((resolve, reject) => {
    let settled = false;
    let responseBytes = 0;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      req.destroy();
      reject(error);
    };
    const req = transport(target.url, {
      method: 'POST', headers, timeout: timeoutMs,
      // Keep TLS SNI/certificate validation bound to the URL hostname while
      // forcing the socket to the address resolved and checked above.
      lookup: (hostname, options, callback) => (options && options.all
        ? callback(null, [{ address: target.address, family: target.family }])
        : callback(null, target.address, target.family)),
    }, (res) => {
      res.on('data', (chunk) => {
        responseBytes += chunk.length;
        if (responseBytes > maxResponseBytes) fail(new Error('Webhook response exceeded size limit'));
      });
      res.on('end', () => {
        if (settled) return;
        settled = true;
        resolve({ statusCode: res.statusCode });
      });
      res.on('error', fail);
    });
    req.on('timeout', () => fail(new Error('Webhook request timed out')));
    req.on('error', fail);
    req.end(body);
  });
}

function matches(events, eventType) {
  return (events || []).some((pattern) => {
    if (pattern === eventType) return true;
    if (typeof pattern !== 'string') return false;
    if (pattern.endsWith('.*')) return eventType.startsWith(pattern.slice(0, -1));
    if (pattern === '*') return true;
    return false;
  });
}

function signPayload(secret, timestamp, body) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

function eventProjectId(evt) {
  const id = evt && evt.payload && (evt.payload.project_id ?? evt.payload.projectId);
  if (id != null && Number.isSafeInteger(Number(id))) return Number(id);
  if (evt && evt.entityType === 'project' && Number.isSafeInteger(Number(evt.entityId))) return Number(evt.entityId);
  return null;
}

function matchesHookProject(hook, evt) {
  if (hook.project_ids == null) return true;
  const projectIds = Array.isArray(hook.project_ids) ? hook.project_ids.map(Number) : [];
  const projectId = eventProjectId(evt);
  return projectId != null && projectIds.includes(projectId);
}

function webhookEncryptionKey() {
  const master = process.env.WEBHOOK_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (typeof master !== 'string' || master.length < 32) {
    const error = new Error('Webhook secret encryption is not configured');
    error.error_code = 'webhook_secret_key_missing';
    error.status = 503;
    throw error;
  }
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(master), 'osiris-webhook-secret-v1', 'construction-erp', 32));
}

function encryptWebhookSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', webhookEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(secret), 'utf8'), cipher.final()]);
  return `enc:v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
}

function decryptWebhookSecret(secret) {
  if (typeof secret !== 'string') throw new Error('Webhook secret is unavailable');
  if (!secret.startsWith('enc:v1:')) return secret; // legacy rows are encrypted on first delivery
  const [, , ivText, tagText, encryptedText] = secret.split(':');
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', webhookEncryptionKey(), Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    const error = new Error('Webhook secret could not be decrypted');
    error.error_code = 'webhook_secret_decryption_failed';
    error.status = 503;
    throw error;
  }
}

async function loadWebhookSecret(hook, q) {
  const rawSecret = decryptWebhookSecret(hook.secret);
  if (!hook.secret.startsWith('enc:v1:')) {
    await q('UPDATE webhooks SET secret = $2 WHERE id = $1 AND secret = $3', [hook.id, encryptWebhookSecret(rawSecret), hook.secret]);
  }
  return rawSecret;
}

// ---------------------------------------------------------------------------
// Registration CRUD
// ---------------------------------------------------------------------------

async function createWebhook({ url, secret, events, description = null, projectIds = null, userId, q = defaultQuery, lookup = dns.lookup }) {
  await resolveWebhookTarget(url, { lookup });
  const r = await q(
    `INSERT INTO webhooks (url, secret, events, description, project_ids, created_by) VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     RETURNING id, url, events, description, project_ids, is_active, created_by, created_at`,
    [url, encryptWebhookSecret(secret), JSON.stringify(events), description, projectIds == null ? null : JSON.stringify(projectIds), userId]
  );
  return r.rows[0];
}

async function listWebhooks(q = defaultQuery) {
  const r = await q('SELECT id, url, events, description, project_ids, is_active, created_by, created_at FROM webhooks ORDER BY id');
  return r.rows;
}

async function getWebhook(id, q = defaultQuery) {
  return (await q('SELECT id, url, events, description, project_ids, is_active, created_by, created_at FROM webhooks WHERE id = $1', [id])).rows[0] || null;
}

async function rotateWebhookSecret(id, secret, q = defaultQuery) {
  const r = await q(
    `UPDATE webhooks SET secret = $2 WHERE id = $1
     RETURNING id, url, events, description, is_active, created_by, created_at`,
    [id, encryptWebhookSecret(secret)]
  );
  return r.rows[0] || null;
}

async function updateWebhook(id, patch, q = defaultQuery, { lookup = dns.lookup } = {}) {
  if (patch.url) await resolveWebhookTarget(patch.url, { lookup });
  const sets = []; const params = []; let i = 1;
  for (const [col, val] of Object.entries(patch)) {
    sets.push(`${col} = $${i++}`);
    params.push(col === 'events' || col === 'project_ids' ? JSON.stringify(val) : val);
    if (col === 'events' || col === 'project_ids') sets[sets.length - 1] += '::jsonb';
  }
  const r = await q(`UPDATE webhooks SET ${sets.join(', ')} WHERE id = $${i} RETURNING id, url, events, description, project_ids, is_active, created_at`, [...params, id]);
  return r.rows[0] || null;
}

async function deleteWebhook(id, q = defaultQuery) {
  const r = await q('DELETE FROM webhooks WHERE id = $1 RETURNING id', [id]);
  return r.rows.length > 0;
}

async function listDeliveries(webhookId, q = defaultQuery) {
  const r = await q(
    'SELECT * FROM webhook_deliveries WHERE webhook_id = $1 ORDER BY created_at DESC LIMIT 100', [webhookId]);
  return r.rows;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

// Queue the event for every matching active webhook and start the first
// delivery attempt in the background. Never throws — webhook failures must
// not break the emitting transaction.
// opts: { query } — transaction-bound callers may inject their own executor;
// production uses the default pool.
async function dispatchEvent(evt, opts = {}) {
  const q = opts.query || defaultQuery;
  try {
    const hooks = (await q('SELECT * FROM webhooks WHERE is_active = true')).rows;
    const targets = hooks.filter((h) => matches(h.events, evt.eventType) && matchesHookProject(h, evt));
    if (targets.length === 0) return 0;
    // Store the RAW event data only — attemptDelivery builds the delivery
    // envelope once (event/entity fields come from the delivery row itself).
    const payload = JSON.stringify(evt.payload || {});
    for (const hook of targets) {
      const d = (await q(
        `INSERT INTO webhook_deliveries (webhook_id, event_type, event_log_id, entity_type, entity_id, payload)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [hook.id, evt.eventType, evt.eventId || null, evt.entityType, evt.entityId, payload]
      )).rows[0];
      // Fire-and-forget; each attempt is fully recorded in the delivery row.
      attemptDelivery(d.id, { ...opts, query: q }).catch(() => {});
    }
    return targets.length;
  } catch (e) {
    console.error('[WEBHOOKS] dispatch failed:', e.message);
    if (opts.strict) throw e;
    return 0;
  }
}

async function attemptDelivery(deliveryId, opts = {}) {
  const q = opts.query || defaultQuery;
  const d = (await q('SELECT * FROM webhook_deliveries WHERE id = $1', [deliveryId])).rows[0];
  if (!d || ['delivered', 'dead_letter'].includes(d.status)) return { skipped: true };
  const hook = (await q('SELECT * FROM webhooks WHERE id = $1', [d.webhook_id])).rows[0];
  if (!hook) return { skipped: true };
  const deliveryPayload = typeof d.payload === 'string' ? JSON.parse(d.payload) : d.payload;
  if (!matchesHookProject(hook, { entityType: d.entity_type, entityId: d.entity_id, payload: deliveryPayload })) {
    await q("UPDATE webhook_deliveries SET status = 'dead_letter', last_error = 'webhook_project_scope_changed' WHERE id = $1", [d.id]);
    return { skipped: true, reason: 'project_scope_changed' };
  }

  const body = JSON.stringify({
    id: d.id, event: d.event_type, entity_type: d.entity_type, entity_id: d.entity_id,
    data: typeof d.payload === 'string' ? JSON.parse(d.payload) : (d.payload || {}),
    occurred_at: d.created_at,
  });
  const timestamp = Math.floor(Date.now() / 1000);

  let ok = false; let statusCode = null; let errorText = null;
  try {
    const target = await resolveWebhookTarget(hook.url, { lookup: opts.lookup || dns.lookup });
    const res = await postWebhook(target, body, {
      'Content-Type': 'application/json',
      'X-Osiris-Event': d.event_type,
      'X-Osiris-Delivery': String(d.id),
      'X-Osiris-Timestamp': String(timestamp),
      'X-Osiris-Signature': signPayload(await loadWebhookSecret(hook, q), timestamp, body),
    }, { requestImpl: opts.requestImpl, timeoutMs: DELIVERY_TIMEOUT_MS, maxResponseBytes: MAX_RESPONSE_BYTES });
    statusCode = res.statusCode;
    ok = res.statusCode >= 200 && res.statusCode < 300;
    if (!ok) errorText = `HTTP ${res.statusCode}`;
  } catch (e) {
    errorText = e.message;
  }

  const attempt = d.attempt_count + 1;
  if (ok) {
    await q(
      `UPDATE webhook_deliveries SET status = 'delivered', attempt_count = $2, last_status_code = $3,
       last_error = NULL, delivered_at = NOW() WHERE id = $1`,
      [d.id, attempt, statusCode]
    );
    return { delivered: true, attempt };
  }

  if (attempt >= d.max_attempts) {
    await q(
      `UPDATE webhook_deliveries SET status = 'dead_letter', attempt_count = $2, last_status_code = $3,
       last_error = $4 WHERE id = $1`,
      [d.id, attempt, statusCode, errorText]
    );
    return { dead_letter: true, attempt };
  }

  const backoffMin = BACKOFF_MINUTES[Math.min(attempt - 1, BACKOFF_MINUTES.length - 1)];
  await q(
    `UPDATE webhook_deliveries SET status = 'retrying', attempt_count = $2, last_status_code = $3,
     last_error = $4, next_attempt_at = NOW() + ($5 || ' minutes')::interval WHERE id = $1`,
    [d.id, attempt, statusCode, errorText, String(backoffMin)]
  );
  return { retrying: true, attempt, backoff_minutes: backoffMin };
}

// Redrive a dead-letter (or stuck retrying) delivery: reset attempt count and
// retry immediately.
async function redriveDelivery(deliveryId, opts = {}) {
  const q = opts.query || defaultQuery;
  const d = (await q(
    `UPDATE webhook_deliveries
     SET status = 'pending', attempt_count = 0, next_attempt_at = NOW(), last_error = NULL
     WHERE id = $1 AND status IN ('dead_letter', 'retrying') RETURNING id`,
    [deliveryId]
  )).rows[0];
  if (!d) return null;
  const result = await attemptDelivery(d.id, opts);
  return result;
}

// Sweep: attempts that are due (pending never attempted, retrying backoff
// elapsed). Runs on an interval when initialized; also safe to call manually.
async function sweepDueDeliveries(opts = {}) {
  const q = opts.query || defaultQuery;
  const due = (await q(
    `SELECT id FROM webhook_deliveries
     WHERE status IN ('pending', 'retrying') AND next_attempt_at <= NOW()
     ORDER BY next_attempt_at LIMIT 50`
  )).rows;
  let delivered = 0; let dead = 0; let retried = 0;
  for (const row of due) {
    const r = await attemptDelivery(row.id, opts);
    if (r.delivered) delivered++;
    else if (r.dead_letter) dead++;
    else if (r.retrying) retried++;
  }
  return { checked: due.length, delivered, dead_letter: dead, retrying: retried };
}

// Subscribe to the in-process event bus for every event type a webhook might
// want. Wildcard patterns can't be subscribed directly, so subscribe to the
// concrete types seen in the catalog plus any type seen at dispatch time.
function initWebhookDeliveryScheduler() {
  if (!global.eventBus || typeof global.eventBus.on !== 'function') {
    console.error('[WEBHOOKS] global.eventBus unavailable — other in-process observers unavailable');
  }
  // The durable outbox dispatches every concrete event directly to
  // dispatchEvent; this leader-locked timer only drains delivery retries.
  // Phase 3.4: one leader across backend instances (sweepLeader).
  const { timer, execute } = sweepLeader.leaderInterval('webhook_deliveries', SWEEP_INTERVAL_MS, () => sweepDueDeliveries());
  execute().catch((e) => console.error('[WEBHOOKS] initial sweep failed:', e.message));
  console.log('[WEBHOOKS] delivery retry sweep initialized — every 60s (leader-locked)');
  return timer;
}

module.exports = {
  EVENT_CATALOG,
  BACKOFF_MINUTES,
  MAX_RESPONSE_BYTES,
  matches,
  eventProjectId,
  matchesHookProject,
  signPayload,
  encryptWebhookSecret,
  decryptWebhookSecret,
  isBlockedAddress,
  resolveWebhookTarget,
  postWebhook,
  createWebhook,
  listWebhooks,
  getWebhook,
  rotateWebhookSecret,
  updateWebhook,
  deleteWebhook,
  listDeliveries,
  dispatchEvent,
  attemptDelivery,
  redriveDelivery,
  sweepDueDeliveries,
  initWebhookDeliveryScheduler,
};
