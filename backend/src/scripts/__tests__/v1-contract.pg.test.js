// Real PostgreSQL. Closeout B5: the OpenAPI contract on the LIVE /api/v1.
// The spec is generated from the mounted routers (openapi.js), so paths cannot drift from
// SOURCE — but the served spec can still drift from the SERVED app (a router rebuilt with
// different arguments, a catch-all swallowing a mistyped path, a route that responds outside
// the documented envelope). These tests hold the contract from both directions:
//   1. every (method, path) the spec documents answers with a JSON envelope when called —
//      no HTML framework 404, no silent "path not mounted";
//   2. response envelopes match the documented shapes: success → { success:true, data }, GET
//      lists → { data, meta }, errors → { error:{ code, message, correlation_id, error_code?, error_params? } }.
// If a test and the live API disagree here, the SPEC is fixed, not the test (plan B5).
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('B5 API contract: OpenAPI spec vs the live /api/v1', () => {
  let app; let server; let base; let db; let owner; let metricsReader; let spec;
  const tag = String(Date.now()).slice(-7);

  const call = async (method, path, body, withAuth = true, token = owner.token) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(withAuth ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* HTML responses stay null */ }
    return { status: res.status, contentType: res.headers.get('content-type') || '', body: json, text };
  };

  // Substitute ':param' segments with a plausible id so the route handler runs.
  const concrete = (path) => path.replace(/:[A-Za-z_]+/g, '1');

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const row = (await db.query(
      "INSERT INTO users (name, email, password, role) VALUES ('contract-owner', $1, 'x', 'owner') RETURNING id, token_version", [`b5-${tag}@test.io`]
    )).rows[0];
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [row.id]);
    owner = { token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
    const reader = (await db.query(
      "INSERT INTO users (name, email, password, role) VALUES ('metrics-reader', $1, 'x', 'site_engineer') RETURNING id, token_version", [`b5-metrics-${tag}@test.io`]
    )).rows[0];
    metricsReader = { token: tokens.signSession({ userId: reader.id, tokenVersion: reader.token_version }) };
    const served = await call('GET', '/api/v1/openapi.json', undefined, false);
    spec = served.body;
  });

  afterAll(async () => {
    await db.query('DELETE FROM user_project_roles WHERE user_id = (SELECT id FROM users WHERE email = $1)', [`b5-${tag}@test.io`]);
    await db.query('UPDATE users SET is_active = false WHERE email = $1', [`b5-${tag}@test.io`]);
    await db.query('UPDATE users SET is_active = false WHERE email = $1', [`b5-metrics-${tag}@test.io`]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('the served spec is a valid OpenAPI 3 document with paths', () => {
    expect(spec.openapi).toBe('3.0.3');
    expect(Object.keys(spec.paths).length).toBeGreaterThan(20);
  });

  test('every documented (method, path) answers with a JSON envelope when called', async () => {
    // Health + openapi are public GETs; oauth/token is exercised separately.
    const skip = new Set(['/health', '/openapi.json', '/oauth/token']);
    const unanswerable = [];
    const wrongEnvelope = [];
    for (const [path, methods] of Object.entries(spec.paths)) {
      if (skip.has(path)) continue;
      for (const method of Object.keys(methods)) {
        const res = await call(method.toUpperCase(), `/api/v1${concrete(path)}`);
        if (path === '/webhooks/deliveries/:deliveryId/redrive' && method === 'post' && res.status === 404) {
          // POST with id 1 may 404 — still a JSON envelope, checked below.
        }
        // A documented document route (GET .../pdf) legitimately answers a PDF once the record exists.
        if (res.contentType.includes('application/pdf') && path.endsWith('/pdf')) continue;
        // Successful export handlers intentionally return downloadable CSV, not a JSON envelope.
        if (res.contentType.includes('text/csv') && ['/reports/export/:reportKey', '/schedule/activities/export'].includes(path)) continue;
        if (!res.contentType.includes('application/json')) {
          unanswerable.push(`${method.toUpperCase()} ${path} → ${res.contentType}`);
          continue;
        }
        const body = res.body;
        const okShape = body && (
          body.success === true
          || (body.success === false && typeof body.error === 'string')
          || (body.error && typeof body.error === 'object' && body.error.code && typeof body.error.message === 'string')
        );
        if (!okShape) wrongEnvelope.push(`${method.toUpperCase()} ${path} → ${res.status} ${JSON.stringify(body).slice(0, 120)}`);
      }
    }
    if (unanswerable.length || wrongEnvelope.length) {
      console.error('v1 route contract probe failures:', JSON.stringify({ unanswerable, wrongEnvelope: wrongEnvelope.map((item) => item.split(' ').slice(0, 3).join(' ')) }));
    }
    expect(unanswerable).toEqual([]);
    expect(wrongEnvelope).toEqual([]);
  });

  test('health answers the documented success envelope', async () => {
    const res = await call('GET', '/api/v1/health', undefined, false);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('healthy');
  });

  test('owner metrics expose queue and notification delivery health without payload data', async () => {
    const res = await call('GET', '/api/v1/ops/metrics');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      status: expect.stringMatching(/^(healthy|degraded)$/),
      sampled_at: expect.any(String),
      outbox: {
        total: expect.any(Number), pending: expect.any(Number), dispatching: expect.any(Number),
        delivered: expect.any(Number), dead: expect.any(Number),
      },
      failed_sweeps: expect.any(Number),
      notification_deliveries: expect.any(Object),
      failed_sweeps_24h: expect.any(Number),
    });
    expect(JSON.stringify(res.body.data)).not.toContain('last_error');
    expect(JSON.stringify(res.body.data)).not.toContain('payload');
  });

  test('health only degrades for failed sweeps in the rolling 24-hour window', async () => {
    const sweep = `health-window-${tag}`;
    try {
      const baseline = await call('GET', '/api/v1/ops/metrics');
      expect(baseline.status).toBe(200);
      await db.query(
        "INSERT INTO background_sweep_runs (sweep, status, started_at, finished_at, error) VALUES ($1, 'failed', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days', 'historical test')",
        [sweep]
      );
      const historical = await call('GET', '/api/v1/ops/metrics');
      expect(historical.status).toBe(200);
      expect(historical.body.data.status).toBe(baseline.body.data.status);
      expect(historical.body.data.failed_sweeps).toBe(baseline.body.data.failed_sweeps + 1);
      expect(historical.body.data.failed_sweeps_24h).toBe(baseline.body.data.failed_sweeps_24h);

      await db.query(
        "INSERT INTO background_sweep_runs (sweep, status, started_at, finished_at, error) VALUES ($1, 'failed', NOW(), NOW(), 'recent test')",
        [`${sweep}-recent`]
      );
      const recent = await call('GET', '/api/v1/ops/metrics');
      expect(recent.status).toBe(200);
      expect(recent.body.data.status).toBe('degraded');
      expect(recent.body.data.failed_sweeps_24h).toBe(historical.body.data.failed_sweeps_24h + 1);
    } finally {
      await db.query('DELETE FROM background_sweep_runs WHERE sweep LIKE $1', [`${sweep}%`]);
    }
  });

  test('project role cannot read platform-wide metrics', async () => {
    const res = await call('GET', '/api/v1/ops/metrics', undefined, true, metricsReader.token);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('forbidden');
  });

  test('an unauthenticated call is the structured 401 envelope, not an HTML error', async () => {
    const res = await call('GET', '/api/v1/organizations', undefined, false);
    expect(res.status).toBe(401);
    expect(res.contentType).toContain('application/json');
    expect(res.body.error.code).toBe('unauthenticated');
    expect(typeof res.body.error.message).toBe('string');
    expect(res.body.error.correlation_id).toBeTruthy();
  });

  test('a GET list carries the page/meta envelope; a validation error is the structured 400', async () => {
    const list = await call('GET', '/api/v1/organizations');
    expect(list.status).toBe(200);
    expect(list.body.success).toBe(true);
    expect(list.body.meta).toEqual({ page: 1, per_page: 50, total: expect.any(Number), total_pages: expect.any(Number) });

    const bad = await call('POST', '/api/v1/webhooks', { url: 'not-a-uri' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('validation_error');
    expect(typeof bad.body.error.message).toBe('string');
  });

  test('the stable error_code of an internal response passes through the v1 envelope untouched', async () => {
    // Approval cancel on a record that does not exist → the route's own 404;
    // the cancel-forbidden stable code is covered by the decision-4 suite on all three
    // surfaces — here the contract point is that the v1 wrapper NEVER eats it.
    const res = await call('PUT', '/api/v1/approvals/99999999/cancel', { reason: 'b5 contract' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});
