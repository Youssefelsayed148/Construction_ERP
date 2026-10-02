// Phase 26 tests — the versioned /api/v1 external API.
//
// Coverage:
//   - migration DDL: the four external-API tables, idempotent SQL text
//   - OAuth: scope model, client_credentials grant, password grant
//     (user-delegated), refresh for service accounts, verifyToken parity
//     between v1 tokens and internal UI tokens
//   - webhooks: wildcard matching, HMAC signatures, delivery state machine
//     (delivered / retrying backoff / dead_letter), sweep, redrive
//   - v1 middleware: correlation IDs, rate limiting, structured error shape
//     {"error":{"code","message","correlation_id","details"}},
//     pagination/filter/sort, idempotency-key replay and reuse conflict
//   - apiResources: policy-gated v1-only read lists + project scoping +
//     the cross-project ID-guessing guard
//   - the full v1 router builds (every remount op resolves to a real internal
//     route) and the OpenAPI spec is generated from that same router
//   - PARITY: a remounted v1 operation runs the exact same guard chain with
//     the internal mount visible to the policy engine — same user, same
//     decision, including ID-guessing a project the user is not assigned to.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'external-api-test-secret';
process.env.V1_RATE_LIMIT_PER_MIN = process.env.V1_RATE_LIMIT_PER_MIN || '300';

jest.mock('../../config/database', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  pool: {},
  healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' }),
}));

const { query } = require('../../config/database');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const express = require('express');

const oauthService = require('../../services/oauthService');
const webhookService = require('../../services/webhookService');
const v1 = require('../../middleware/v1');
const apiResources = require('../../services/apiResources');
const buildOpenApi = require('../../utils/openapi');
const policy = require('../../services/policy');
const migration = require('../migrate-37-external-api');

const SECRET = process.env.JWT_SECRET;

// ---------------------------------------------------------------------------
// Flexible query stub — one mock shared by every service under test.
// ---------------------------------------------------------------------------

const stub = {
  users: new Map(),            // id -> row
  userPolicy: new Map(),       // id -> [policy rows]
  serviceAccounts: new Map(),  // client_id -> row
  idempotency: new Map(),      // key|subject|method|path -> row
  webhooks: new Map(),
  deliveries: new Map(),
  deliverySeq: 0,
  webhookSeq: 0,
};

function resetStub() {
  stub.users.clear(); stub.userPolicy.clear(); stub.serviceAccounts.clear();
  stub.idempotency.clear(); stub.webhooks.clear(); stub.deliveries.clear();
  stub.deliverySeq = 0; stub.webhookSeq = 0;
}

query.mockImplementation(async (sql, params = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (/FROM users WHERE id = \$1/i.test(s)) return { rows: stub.users.get(params[0]) ? [stub.users.get(params[0])] : [] };
  if (/FROM users WHERE email/i.test(s)) {
    const found = [...stub.users.values()].filter((u) => u.email === params[0]);
    return { rows: found };
  }
  if (/FROM user_project_roles/i.test(s)) return { rows: stub.userPolicy.get(params[0]) || [] };
  if (/FROM roles WHERE/i.test(s)) return { rows: stub.userPolicy.get(params[0]) || [] };
  if (/INSERT INTO audit_events/i.test(s)) return { rows: [{ id: 1 }] };
  if (/FROM service_accounts/i.test(s)) {
    const acct = [...stub.serviceAccounts.values()].find((a) => a.id === params[0] || a.client_id === params[0]);
    if (acct && /user_active/.test(s)) acct.user_active = acct.is_active !== false;
    const inactiveOnly = /is_active = true/.test(s);
    if (inactiveOnly && acct && acct.is_active === false) return { rows: [] };
    return { rows: acct ? [acct] : [] };
  }
  if (/DELETE FROM idempotency_keys/i.test(s)) return { rows: [] };
  if (/SELECT \* FROM idempotency_keys/i.test(s)) {
    const key = params.join('|');
    const row = [...stub.idempotency.values()].find((r) => r.key === params[0] && r.subject === params[1] && r.method === params[2] && r.path === params[3]);
    return { rows: row ? [row] : [] };
  }
  if (/INSERT INTO idempotency_keys/i.test(s)) {
    const row = { key: params[0], subject: params[1], method: params[2], path: params[3], request_hash: params[4], status: 'in_flight' };
    stub.idempotency.set(params.join('|'), row);
    return { rows: [row] };
  }
  if (/UPDATE idempotency_keys/i.test(s)) {
    // UPDATE ... SET status=$2, response_status=$3, response_body=$4, request_hash=$5 WHERE key=$6 ...
    // (statement order: response_status, response_body, request_hash, key, subject, method, path)
    const row = [...stub.idempotency.values()].find((r) => r.key === params[3] && r.subject === params[4] && r.method === params[5] && r.path === params[6]);
    if (row) Object.assign(row, {
      status: 'completed',
      response_status: params[0],
      response_body: params[1] == null ? null : JSON.parse(params[1]),
      request_hash: params[2],
    });
    return { rows: [] };
  }
  if (/UPDATE service_accounts SET last_used_at/i.test(s)) return { rows: [] };
  if (/INSERT INTO webhooks/i.test(s)) {
    const id = ++stub.webhookSeq;
    const row = { id, url: params[0], secret: params[1], events: JSON.parse(params[2]), description: params[3], is_active: true, created_by: params[4] };
    stub.webhooks.set(id, row);
    return { rows: [row] };
  }
  if (/SELECT \* FROM webhooks WHERE id = \$1/i.test(s)) {
    const hook = [...stub.webhooks.values()].find((h) => h.id === params[0]);
    return { rows: hook ? [hook] : [] };
  }
  if (/SELECT id, url, events, description, is_active, created_by, created_at FROM webhooks/i.test(s)) {
    return { rows: [...stub.webhooks.values()].filter((h) => h.is_active) };
  }
  if (/SELECT \* FROM webhooks WHERE is_active = true/i.test(s)) {
    return { rows: [...stub.webhooks.values()].filter((h) => h.is_active) };
  }
  if (/DELETE FROM webhooks/i.test(s)) {
    const hook = [...stub.webhooks.values()].find((h) => h.id === params[0]);
    if (hook) { stub.webhooks.delete(hook.id); return { rows: [{ id: hook.id }] }; }
    return { rows: [] };
  }
  if (/INSERT INTO webhook_deliveries/i.test(s)) {
    const id = ++stub.deliverySeq;
    const row = {
      id, webhook_id: params[0], event_type: params[1], event_log_id: params[2],
      entity_type: params[3], entity_id: params[4], payload: params[5],
      attempt_count: 0, max_attempts: 6, status: 'pending', next_attempt_at: new Date(),
      last_status_code: null, last_error: null, created_at: new Date(),
    };
    stub.deliveries.set(id, row);
    return { rows: [row] };
  }
  if (/SELECT \* FROM webhook_deliveries WHERE id = \$1/i.test(s)) {
    const row = stub.deliveries.get(params[0]);
    return { rows: row ? [row] : [] };
  }
  if (/SELECT id FROM webhook_deliveries/i.test(s)) {
    return { rows: [...stub.deliveries.values()].filter((d) => d.status === 'pending' || d.status === 'retrying').map((d) => ({ id: d.id })) };
  }
  if (/UPDATE webhook_deliveries SET status = 'delivered'/i.test(s)) {
    const row = stub.deliveries.get(params[0]);
    if (row) Object.assign(row, { status: 'delivered', attempt_count: params[1], last_status_code: params[2] });
    return { rows: [] };
  }
  if (/UPDATE webhook_deliveries SET status = 'dead_letter'/i.test(s)) {
    const row = stub.deliveries.get(params[0]);
    if (row) Object.assign(row, { status: 'dead_letter', attempt_count: params[1], last_status_code: params[2], last_error: params[3] });
    return { rows: [] };
  }
  if (/UPDATE webhook_deliveries SET status = 'retrying'/i.test(s)) {
    const row = stub.deliveries.get(params[0]);
    if (row) Object.assign(row, { status: 'retrying', attempt_count: params[1], last_status_code: params[2], last_error: params[3] });
    return { rows: [] };
  }
  if (/UPDATE webhook_deliveries\s+SET status = 'pending'/i.test(s)) {
    const row = [...stub.deliveries.values()].find((d) => d.id === params[0] && (d.status === 'dead_letter' || d.status === 'retrying'));
    if (row) Object.assign(row, { status: 'pending', attempt_count: 0, last_error: null });
    return { rows: row ? [{ id: row.id }] : [] };
  }
  // apiResources read models
  if (/SELECT \* FROM organizations/i.test(s)) return { rows: stub._organizations || [] };
  if (/SELECT \* FROM purchase_requests/i.test(s)) return { rows: stub._purchase_requests || [] };
  throw new Error(`external-api stub: unexpected SQL: ${s.slice(0, 90)}`);
});

// Policy rows helpers --------------------------------------------------------

const companyWide = (roleKey) => [
  { role_key: roleKey, project_id: null, organization_id: 1, perm_module: '*', perm_action: '*' },
  { role_key: roleKey, project_id: null, organization_id: 1, perm_module: '*', perm_action: 'see_internal_cost' },
];
const projectBoundView = (roleKey, projects, modules) => modules.flatMap((m) => projects.map((pid) => (
  { role_key: roleKey, project_id: pid, organization_id: 9, perm_module: m, perm_action: 'view' })));

const OWNER = { id: 1, email: 'owner@x.com', name: 'Owner', role: 'owner', department: null, is_active: true };
const CONSULTANT = { id: 4, email: 'consultant@x.com', name: 'Consultant', role: 'consultant', department: null, is_active: true };

function seedUsers() {
  stub.users.set(1, OWNER);
  stub.users.set(4, CONSULTANT);
  stub.userPolicy.set(1, companyWide('owner'));
  stub.userPolicy.set(4, projectBoundView('consultant', [1], ['projects', 'docs', 'qhse']));
}

// invoke a middleware chain --------------------------------------------------
function makeRes() {
  const res = {
    statusCode: 200,
    headers: {},
    headersSent: false,
    setHeader: jest.fn(),
    status: jest.fn((code) => { res.statusCode = code; return res; }),
    _body: null,
    json: jest.fn((body) => { res._body = body; return res; }),
  };
  return res;
}

function callChain(handlers, req) {
  return new Promise((resolve) => {
    const res = makeRes();
    res.json = jest.fn((body) => { res._body = body; resolve({ res }); return res; });
    let idx = 0;
    const step = (err) => {
      if (err) return resolve({ res, err });
      if (idx >= handlers.length) return resolve({ res });
      const h = handlers[idx++];
      Promise.resolve(h(req, res, step)).catch((e) => resolve({ res, err: e }));
    };
    step();
  });
}

beforeAll(async () => {
  resetStub();
  seedUsers();
});

beforeEach(() => {
  // deliver state stays; policy/user stubs persist
  stub.deliveries.clear(); stub.deliverySeq = 0;
});

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------
describe('Phase 26 migration DDL', () => {
  test('creates service_accounts, idempotency_keys, webhooks, webhook_deliveries idempotently', () => {
    const { DDL } = require('../migrate-37-external-api');
    const text = DDL.join('\n');
    for (const table of ['service_accounts', 'idempotency_keys', 'webhooks', 'webhook_deliveries']) {
      expect(text).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    // service accounts are linked to real users (audit attribution)
    expect(text).toMatch(/user_id INTEGER NOT NULL REFERENCES users\(id\)/);
    // idempotency uniqueness on (key, subject, method, path)
    expect(text).toMatch(/CONSTRAINT uq_idempotency UNIQUE \(key, subject, method, path\)/);
  });
});

// ---------------------------------------------------------------------------
// OAuth scopes + grants
// ---------------------------------------------------------------------------
describe('oauth scope model', () => {
  test('validScope accepts family and wildcard scopes only', () => {
    expect(oauthService.validScope('projects:read')).toBe(true);
    expect(oauthService.validScope('api:write')).toBe(true);
    expect(oauthService.validScope('api:delete')).toBe(false);
    expect(oauthService.validScope('unknownfamily:read')).toBe(false);
    expect(oauthService.validScope('projects:admin')).toBe(false);
  });

  test('scopeAllows: read/write are separate; api:* is a wildcard', () => {
    expect(oauthService.scopeAllows(['api:read'], 'projects', 'read')).toBe(true);
    expect(oauthService.scopeAllows(['api:read'], 'projects', 'write')).toBe(false);
    expect(oauthService.scopeAllows(['projects:write'], 'projects', 'write')).toBe(true);
    expect(oauthService.scopeAllows(['projects:write'], 'projects', 'read')).toBe(false);
    expect(oauthService.scopeAllows(['projects:read'], 'invoices', 'read')).toBe(false);
  });

  test('FAMILIES covers the prompt resource list', () => {
    for (const f of ['projects', 'boq', 'quantities', 'materials', 'inventory',
      'purchase-requisitions', 'rfqs', 'purchase-orders', 'deliveries', 'grns',
      'contracts', 'subcontracts', 'variations', 'payment-certificates', 'invoices',
      'payments', 'daily-reports', 'site-visits', 'observations', 'rfis', 'submittals',
      'inspections', 'ncrs', 'documents', 'transmittals', 'schedule', 'actions',
      'notifications', 'reports', 'companies', 'users', 'organizations']) {
      expect(oauthService.FAMILIES).toContain(f);
    }
  });
});

describe('oauth client_credentials (service accounts)', () => {
  test('valid secret issues a scoped access token + refresh token', async () => {
    const secretHash = await bcrypt.hash('super-secret', 10);
    stub.serviceAccounts.set('ci-bot', {
      id: 1, client_id: 'ci-bot', client_secret_hash: secretHash, user_id: 1,
      scopes: ['projects:read', 'procurement:write'], is_active: true,
    });
    const result = await oauthService.issueForClientCredentials({
      grant_type: 'client_credentials', client_id: 'ci-bot', client_secret: 'super-secret',
      scope: 'projects:read',
    });
    expect(result.token_type).toBe('Bearer');
    expect(result.scope).toBe('projects:read');
    const decoded = jwt.verify(result.access_token, SECRET);
    expect(decoded.kind).toBe('v1');
    expect(decoded.userId).toBe(1);
    expect(decoded.serviceAccountId).toBe(1);
    expect(result.refresh_token).toBeTruthy();
  });

  test('wrong secret is rejected with invalid_grant', async () => {
    await expect(oauthService.issueForClientCredentials({
      grant_type: 'client_credentials', client_id: 'ci-bot', client_secret: 'wrong',
    })).rejects.toMatchObject({ code: 'invalid_grant' });
  });

  test('a scope beyond the service account grant is rejected', async () => {
    await expect(oauthService.issueForClientCredentials({
      grant_type: 'client_credentials', client_id: 'ci-bot', client_secret: 'super-secret',
      scope: 'api:write',
    })).rejects.toMatchObject({ code: 'invalid_scope' });
  });

  test('verifyToken resolves a v1 token to its linked user with scopes', async () => {
    const token = oauthService.signAccessToken({ sub: 'service:1', userId: 1, serviceAccountId: 1, scope: ['projects:read'] });
    const auth = await oauthService.verifyToken(token);
    expect(auth.type).toBe('v1');
    expect(auth.user.id).toBe(1);
    expect(auth.scopes).toEqual(['projects:read']);
  });

  test('verifyToken treats an INTERNAL (UI) token as full parity', async () => {
    const token = jwt.sign({ userId: 1 }, SECRET);
    const auth = await oauthService.verifyToken(token);
    expect(auth.type).toBe('internal');
    expect(auth.scopes).toBeNull();
    expect(auth.user.id).toBe(1);
  });

  test('a disabled service account stops issuing and verifying tokens', async () => {
    stub.serviceAccounts.get('ci-bot').is_active = false;
    await expect(oauthService.issueForClientCredentials({
      grant_type: 'client_credentials', client_id: 'ci-bot', client_secret: 'super-secret',
    })).rejects.toMatchObject({ code: 'invalid_grant' });
    const token = oauthService.signAccessToken({ sub: 'service:1', userId: 1, serviceAccountId: 1, scope: ['projects:read'] });
    await expect(oauthService.verifyToken(token)).rejects.toMatchObject({ code: 'invalid_grant' });
    stub.serviceAccounts.get('ci-bot').is_active = true;
  });

  test('refresh token re-issues from the stored account without the secret', async () => {
    const refresh = oauthService.signRefreshToken({ sub: 'service:1', userId: 1, serviceAccountId: 1, scope: ['projects:read'] });
    const result = await oauthService.issueForRefresh({ grant_type: 'refresh_token', refresh_token: refresh });
    expect(result.access_token).toBeTruthy();
    const decoded = jwt.verify(result.access_token, SECRET);
    expect(decoded.scope).toBe('projects:read');
  });

  test('user-delegated (password) grant issues a scoped user token', async () => {
    const passwordHash = await bcrypt.hash('user-password', 10);
    stub.users.set(7, { id: 7, email: 'delegated@x.com', name: 'Delegate', role: 'staff', password: passwordHash, is_active: true });
    stub.userPolicy.set(7, companyWide('owner'));
    const result = await oauthService.issueForPassword({
      grant_type: 'password', username: 'delegated@x.com', password: 'user-password', scope: 'projects:read',
    });
    const decoded = jwt.verify(result.access_token, SECRET);
    expect(decoded.kind).toBe('v1');
    expect(decoded.userId).toBe(7);
    expect(decoded.serviceAccountId).toBeNull();

    await expect(oauthService.issueForPassword({
      grant_type: 'password', username: 'delegated@x.com', password: 'wrong',
    })).rejects.toMatchObject({ code: 'invalid_grant' });
    stub.users.delete(7);
  });
});

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------
describe('webhook matching + signing', () => {
  test('matches: exact and prefix wildcards', () => {
    expect(webhookService.matches(['rfi.*'], 'rfi.submitted')).toBe(true);
    expect(webhookService.matches(['rfi.*'], 'rfi.closed')).toBe(true);
    expect(webhookService.matches(['rfi.*'], 'submittal.approved')).toBe(false);
    expect(webhookService.matches(['inventory.low'], 'inventory.low')).toBe(true);
    expect(webhookService.matches(['inventory.low'], 'inventory.high')).toBe(false);
    expect(webhookService.matches(['*'], 'anything.at.all')).toBe(true);
  });

  test('signPayload is a verifiable HMAC over timestamp + body', () => {
    const crypto = require('crypto');
    const body = '{"a":1}';
    const ts = 1700000000;
    const sig = webhookService.signPayload('hook-secret', ts, body);
    const expected = crypto.createHmac('sha256', 'hook-secret').update(`${ts}.${body}`).digest('hex');
    expect(sig).toBe(expected);
  });

  test('EVENT_CATALOG contains the prompt event list', () => {
    for (const evt of ['project.created', 'rfi.*', 'submittal.*', 'observation.*', 'inventory.low',
      'purchase_order.issued', 'delivery.received', 'mir.*', 'invoice.*', 'payment.received',
      'variation.approved', 'action.overdue']) {
      expect(webhookService.EVENT_CATALOG).toContain(evt);
    }
  });
});

describe('webhook delivery state machine', () => {
  test('dispatchEvent queues deliveries for matching subscribers only and delivers on 2xx', async () => {
    resetStub();
    seedUsers();
    await webhookService.createWebhook({ url: 'https://a.example/hook', secret: 's1', events: ['rfi.*'], userId: 1 });
    await webhookService.createWebhook({ url: 'https://b.example/hook', secret: 's2', events: ['payment.received'], userId: 1 });

    const fetchMock = jest.fn().mockResolvedValue({ status: 200 });
    global.fetch = fetchMock;

    await webhookService.dispatchEvent({ eventType: 'rfi.created', entityType: 'project_rfi', entityId: 3, payload: { project_id: 1 } });
    expect(stub.deliveries.size).toBe(1); // only the rfi.* subscriber

    const delivery = [...stub.deliveries.values()][0];
    await webhookService.attemptDelivery(delivery.id);
    expect(delivery.status).toBe('delivered');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://a.example/hook');
    expect(init.headers['X-Osiris-Event']).toBe('rfi.created');
    expect(init.headers['X-Osiris-Signature']).toBeTruthy();
    // signature verifies
    const crypto = require('crypto');
    const expectedSig = crypto.createHmac('sha256', 's1')
      .update(`${init.headers['X-Osiris-Timestamp']}.${init.body}`).digest('hex');
    expect(init.headers['X-Osiris-Signature']).toBe(expectedSig);
  });

  test('failed attempts back off, then dead-letter; redrive retries them', async () => {
    resetStub(); seedUsers();
    global.fetch = jest.fn().mockResolvedValue({ status: 500 });
    await webhookService.createWebhook({ url: 'https://flaky.example/hook', secret: 's3', events: ['*'], userId: 1 });

    // dispatchEvent queues AND makes the first attempt in the background.
    await webhookService.dispatchEvent({ eventType: 'project.created', entityType: 'project', entityId: 9, payload: {} });
    await new Promise((r) => setImmediate(r));
    const delivery = [...stub.deliveries.values()][0];
    expect(delivery.status).toBe('retrying');
    expect(delivery.attempt_count).toBe(1);

    // exhaust attempts
    for (let i = 0; i < 9; i++) {
      await webhookService.attemptDelivery(delivery.id);
      if (delivery.status === 'dead_letter') break;
    }
    expect(delivery.status).toBe('dead_letter');

    // redrive with a healthy endpoint delivers it
    global.fetch = jest.fn().mockResolvedValue({ status: 200 });
    const result = await webhookService.redriveDelivery(delivery.id);
    expect(result.delivered).toBe(true);
    expect(delivery.status).toBe('delivered');
  });
});

// ---------------------------------------------------------------------------
// v1 middleware
// ---------------------------------------------------------------------------
describe('v1 correlation ids', () => {
  test('honors a provided X-Request-ID and echoes it', () => {
    const req = { headers: { 'x-request-id': 'my-correlation-id-123' } };
    const res = makeRes();
    v1.correlationId(req, res, () => {});
    expect(req.correlationId).toBe('my-correlation-id-123');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'my-correlation-id-123');
  });

  test('generates one when absent', () => {
    const req = { headers: {} };
    const res = makeRes();
    v1.correlationId(req, res, () => {});
    expect(req.correlationId).toMatch(/[0-9a-f-]{30,}/);
  });
});

describe('v1 rate limiting', () => {
  test('exceeding the window returns 429 with Retry-After', () => {
    const req = () => ({ headers: {}, user: null, ip: '10.0.0.99', v1Subject: null });
    let blocked = null;
    let calls = 0;
    for (let i = 0; i < v1.RATE_LIMIT_PER_MIN + 5; i++) {
      const r = { setHeader: jest.fn(), statusCode: 200 };
      v1.rateLimit(req(), r, (err) => { if (err) { blocked = { err, r }; } });
      if (blocked) break;
    }
    expect(blocked).toBeTruthy();
    expect(blocked.err.status).toBe(429);
    expect(blocked.err.code).toBe('rate_limited');
    expect(blocked.r.setHeader).toHaveBeenCalledWith('Retry-After', 60);
  });
});

describe('v1 list query: pagination / filter / sort', () => {
  test('parses and clamps page/per_page', () => {
    const lq = v1.parseListQuery({ page: '0', per_page: '9999' });
    expect(lq.page).toBe(1);
    expect(lq.per_page).toBe(200);
    const lq2 = v1.parseListQuery({ page: '3', per_page: '10', sort: '-created_at', 'filter[status]': 'open' });
    expect(lq2).toMatchObject({ page: 3, per_page: 10, sort: '-created_at', filters: { status: 'open' } });
  });

  test('applies pagination, filter and sort with meta', () => {
    const rows = [
      { id: 1, status: 'open', name: 'b' },
      { id: 2, status: 'closed', name: 'a' },
      { id: 3, status: 'open', name: 'c' },
    ];
    const { data, meta } = v1.applyListQuery(rows, v1.parseListQuery({ page: '1', per_page: '1', sort: '-id', 'filter[status]': 'open' }));
    expect(meta).toEqual({ page: 1, per_page: 1, total: 2, total_pages: 2 });
    expect(data).toEqual([{ id: 3, status: 'open', name: 'c' }]);
  });

  test('normalizeResponses reshapes errors into the structured shape', () => {
    const req = { method: 'POST', query: {}, correlationId: 'corr-1', headers: {} };
    const res = makeRes();
    res.statusCode = 404;
    let out = null;
    res.json = (payload) => { out = payload; return res; };
    v1.normalizeResponses(req, res, () => {});
    res.json({ success: false, error: 'Project not found' });
    expect(out).toEqual({
      error: { code: 'not_found', message: 'Project not found', correlation_id: 'corr-1' },
    });
  });

  test('normalizeResponses paginates GET array responses', () => {
    const req = { method: 'GET', query: { per_page: '2', page: '2' }, correlationId: 'c', headers: {} };
    const res = makeRes();
    let out = null;
    res.json = (payload) => { out = payload; return res; };
    v1.normalizeResponses(req, res, () => {});
    res.json({ success: true, data: [1, 2, 3, 4, 5] });
    expect(out.data).toEqual([3, 4]);
    expect(out.meta).toEqual({ page: 2, per_page: 2, total: 5, total_pages: 3 });
  });
});

describe('v1 idempotency keys', () => {
  test('stores the response on first POST, replays it, rejects body mismatch', async () => {
    resetStub(); seedUsers();
    const makeReq = (body, key) => ({
      method: 'POST', headers: { 'idempotency-key': key }, body,
      authType: 'internal', user: { id: 1 }, originalUrl: '/api/v1/payments', query: {},
    });

    // First call: the "handler" responds 201 → capture wrapper stores it.
    const req1 = makeReq({ amount: 10 }, 'key-A');
    const res1 = makeRes();
    const next1 = jest.fn(() => {
      res1.statusCode = 201;
      res1.json({ success: true, data: { id: 42 } });
    });
    await v1.idempotency(req1, res1, next1);
    expect(next1).toHaveBeenCalled();
    const row = [...stub.idempotency.values()].find((r) => r.key === 'key-A');
    expect(row.status).toBe('completed');
    expect(row.response_status).toBe(201);
    expect(row.response_body).toEqual({ success: true, data: { id: 42 } });

    // Second call with same key + same body → replay, handler NOT re-run.
    const req2 = makeReq({ amount: 10 }, 'key-A');
    const res2 = makeRes();
    const next2 = jest.fn();
    await v1.idempotency(req2, res2, next2);
    expect(next2).not.toHaveBeenCalled();
    expect(res2.setHeader).toHaveBeenCalledWith('Idempotency-Replayed', 'true');
    expect(res2.statusCode).toBe(201);
    expect(res2._body).toEqual({ success: true, data: { id: 42 } });

    // Same key, different body → conflict.
    const req3 = makeReq({ amount: 999 }, 'key-A');
    const res3 = makeRes();
    const nextErr = jest.fn();
    await v1.idempotency(req3, res3, nextErr);
    expect(nextErr).toHaveBeenCalledWith(expect.objectContaining({ status: 409, code: 'idempotency_key_reuse' }));

    // No Idempotency-Key header → pass-through.
    const res4 = makeRes();
    const next4 = jest.fn();
    await v1.idempotency({ ...makeReq({ amount: 1 }), headers: {} }, res4, next4);
    expect(next4).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// apiResources: v1-only read models
// ---------------------------------------------------------------------------
describe('apiResources — v1-only lists with project scoping', () => {
  test('applyProjectFilter injects a parameterized IN list', () => {
    const r1 = apiResources.applyProjectFilter('SELECT * FROM t', [], null);
    expect(r1).toEqual({ sql: 'SELECT * FROM t', params: [] });
    const r2 = apiResources.applyProjectFilter('SELECT * FROM t', [], [1, 2]);
    expect(r2.sql).toBe('SELECT * FROM t WHERE project_id IN ($1,$2)');
    expect(r2.params).toEqual([1, 2]);
    const r3 = apiResources.applyProjectFilter('SELECT * FROM t WHERE status = $1', ['x'], [5]);
    expect(r3.sql).toContain('AND project_id IN ($2)');
  });

  test('legacy users: owner sees everything, others nothing (same as internal)', async () => {
    resetStub(); seedUsers();
    stub.userPolicy.set(1, []); // no policy rows → legacy
    const accessOwner = await apiResources.listAccess({ user: { id: 1, role: 'owner' } }, 'procurement');
    expect(accessOwner.allowed).toBe(true);
    const accessStaff = await apiResources.listAccess({ user: { id: 1, role: 'staff' } }, 'procurement');
    expect(accessStaff.allowed).toBe(false);
    seedUsers();
  });

  test('policy users: project-bound rows scope the list to their projects', async () => {
    resetStub(); seedUsers();
    // consultant bound to project 1 with view on procurement? Consultant has no procurement view — denied.
    const denied = await apiResources.listAccess({ user: CONSULTANT }, 'procurement');
    expect(denied.allowed).toBe(false);

    // consultant with view on 'procurement' bound to project 1 only
    stub.userPolicy.set(4, projectBoundView('consultant', [1], ['procurement']));
    const scoped = await apiResources.listAccess({ user: CONSULTANT }, 'procurement');
    expect(scoped.allowed).toBe(true);
    expect(scoped.projectFilter).toEqual([1]);
    seedUsers();
  });

  test('getFamilyRecord blocks ID-guessing across projects', async () => {
    resetStub(); seedUsers();
    stub.userPolicy.set(4, projectBoundView('consultant', [1], ['procurement']));
    stub._purchase_requests = [{ id: 55, project_id: 2, request_number: 'PR-00055' }];
    const req = { params: { id: '55' }, user: CONSULTANT };
    const res = makeRes();
    await apiResources.getFamilyRecord('purchase-requisitions', req, res);
    expect(res.statusCode).toBe(403);

    // same record visible on the assigned project
    stub._purchase_requests = [{ id: 55, project_id: 1, request_number: 'PR-00055' }];
    const res2 = makeRes();
    await apiResources.getFamilyRecord('purchase-requisitions', req, res2);
    expect(res2.statusCode).toBe(200);
    expect(res2._body.data.request_number).toBe('PR-00055');
    seedUsers();
  });
});

// ---------------------------------------------------------------------------
// OpenAPI generated from source
// ---------------------------------------------------------------------------
describe('OpenAPI spec generation', () => {
  test('introspects a router into paths with the structured error schema', () => {
    const router = express.Router();
    router.get('/projects', (req, res) => res.json({}));
    router.post('/purchase-requisitions', (req, res) => res.json({}));
    router.post('/purchase-requisitions/:id/submit', (req, res) => res.json({}));
    const spec = buildOpenApi({ v1Router: router });
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.paths['/projects']).toBeTruthy();
    expect(spec.paths['/projects'].get).toBeTruthy();
    expect(spec.paths['/purchase-requisitions/:id/submit'].post.tags).toEqual(['purchase-requisitions']);
    expect(spec.components.schemas.ErrorEnvelope.properties.error.required).toContain('correlation_id');
    expect(spec.paths['/purchase-requisitions'].post['x-idempotency']).toBeTruthy();
  });

  test('the REAL v1 router builds without a single broken remount entry', () => {
    const { buildV1Router } = require('../../routes/v1');
    const router = buildV1Router();
    const apiLayer = router.stack.find((l) => l.name === 'router' && !l.route);
    expect(apiLayer).toBeTruthy();
    const routeCount = router.stack.filter((l) => l.route).length
      + apiLayer.handle.stack.filter((l) => l.route).length;
    expect(routeCount).toBeGreaterThan(150);
  });

  test('the real v1 OpenAPI spec covers oauth, webhooks and the families', () => {
    const { buildV1Router } = require('../../routes/v1');
    const router = buildV1Router();
    const apiLayer = router.stack.find((l) => l.name === 'router' && !l.route);
    const spec = buildOpenApi({ v1Routers: [router, apiLayer.handle] });
    for (const p of ['/oauth/token', '/webhooks', '/openapi.json', '/projects', '/purchase-requisitions',
      '/purchase-orders', '/deliveries', '/grns', '/organizations', '/payment-certificates',
      '/observations', '/schedule/activities', '/rfis', '/submittals', '/inspections', '/ncrs',
      '/documents', '/transmittals', '/actions/my', '/notifications', '/reports/catalog']) {
      expect(spec.paths[p]).toBeTruthy();
    }
    expect(spec['x-webhook-events']).toContain('project.created');
  });
});

// ---------------------------------------------------------------------------
// PARITY — same user, same permission result on internal and v1
// ---------------------------------------------------------------------------
describe('v1 ↔ internal permission parity', () => {
  function makeInternalRouter() {
    const { authenticate, authorize } = require('../../middleware/auth');
    const router = express.Router();
    const echo = async (req, res) => {
      const decision = await policy.evaluateRequest(req);
      res.json({ success: true, data: { baseUrl: req.baseUrl, module: require('../../services/policy').moduleFromRequest ? 'policy-ok' : 'policy-ok', allowed: decision.allowed, source: decision.source } });
    };
    router.post('/pr/:id/decide', authenticate, authorize(), echo);
    return router;
  }

  function tokenFor(userId) {
    return jwt.sign({ userId }, SECRET, { expiresIn: '10m' });
  }

  test('the remounted chain resolves the same policy module and decision', async () => {
    resetStub(); seedUsers();
    const { remountFrom } = require('../../routes/v1');
    const internal = makeInternalRouter();

    // owner with company-wide grants → allowed, same baseUrl as internal
    const v1Handler = remountFrom({ router: internal, internalMount: '/api/procurement', method: 'POST', path: '/pr/:id/decide' });
    const req = {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenFor(1)}` },
      params: { id: '5' }, query: {}, body: { decision: 'approve' },
      originalUrl: '/api/v1/purchase-requisitions/5/decide',
      baseUrl: '/api/v1/purchase-requisitions',
    };
    const { res } = await callChain([v1Handler], req);
    expect(res._body.success).toBe(true);
    expect(res._body.data.baseUrl).toBe('/api/procurement');
    expect(res._body.data.allowed).toBe(true);
  });

  test('ID-guessing fails identically on the remounted chain', async () => {
    resetStub(); seedUsers();
    // A project-bound INTERNAL user: supervisor assigned to project 1 only.
    const SUPERVISOR = { id: 3, email: 'super@x.com', name: 'Supervisor', role: 'site_supervisor', department: null, is_active: true };
    stub.users.set(3, SUPERVISOR);
    stub.userPolicy.set(3, projectBoundView('site_supervisor', [1], ['handover', 'projects']));

    const { remountFrom } = require('../../routes/v1');
    const internal = express.Router();
    internal.get('/process/:projectId', require('../../middleware/auth').authenticate,
      require('../../middleware/auth').authorize(), async (req, res) => {
        const decision = await policy.evaluateRequest(req);
        if (!decision.allowed) return res.status(403).json({ success: false, error: 'Insufficient permissions' });
        return res.json({ success: true, data: { project: req.params.projectId } });
      });
    const v1Handler = remountFrom({ router: internal, internalMount: '/api/handover', method: 'GET', path: '/process/:projectId' });

    const run = async (projectId) => {
      const req = {
        method: 'GET',
        headers: { authorization: `Bearer ${tokenFor(3)}` },
        params: { projectId: String(projectId) }, query: {},
        originalUrl: `/api/v1/handover/process/${projectId}`,
        baseUrl: '/api/v1/handover',
      };
      const { res } = await callChain([v1Handler], req);
      return { status: res.statusCode, body: res._body };
    };

    expect((await run(1)).status).toBe(200);
    const denied = await run(2);
    expect(denied.status).toBe(403);
    seedUsers();
  });
});
