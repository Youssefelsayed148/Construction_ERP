// Phase 1 security closeout (Batch 3): logActivity/audit coverage item - "log denials". Real
// PostgreSQL + real app. A 403 from authorize() (middleware/auth.js) now writes an audit_events row
// (entity 'authorization', action 'denied') carrying the request's IP and request id (migration
// 0069_audit_event_request_context.sql adds those two nullable columns), without ever blocking or
// slowing the denial response itself (the audit write is best-effort; see logDenial in auth.js).
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('B3 denial audit logging (real PostgreSQL, real app)', () => {
  let db; let server; let base; let noGrantUser;
  const tag = `b3deny-${Date.now()}`;
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];

  beforeAll(async () => {
    db = require('../../config/database');
    const { app } = require('../../../server');
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const row = await one(
      "INSERT INTO users (name, email, password, role) VALUES ('b3-nogrant', $1, 'x', 'staff') RETURNING id, token_version",
      [`${tag}@test.invalid`]
    );
    // Deliberately no user_project_roles row: policy.evaluateRequest denies with no_assignment (auth.js
    // comment: "No fallback: a user with NO user_project_roles rows is denied").
    noGrantUser = { id: row.id, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
  });

  afterAll(async () => {
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [noGrantUser.id]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('a policy 403 writes an audit_events denial row with ip_address and request_id, and still answers 403 immediately', async () => {
    const before = (await one(
      "SELECT COUNT(*)::int AS c FROM audit_events WHERE entity = 'authorization' AND action = 'denied' AND user_id = $1", [noGrantUser.id]
    )).c;
    const response = await fetch(`${base}/api/warehouses`, { headers: { Authorization: `Bearer ${noGrantUser.token}` } });
    expect(response.status).toBe(403);
    const requestIdHeader = response.headers.get('x-request-id');
    expect(requestIdHeader).toBeTruthy();

    const row = await one(
      "SELECT * FROM audit_events WHERE entity = 'authorization' AND action = 'denied' AND user_id = $1 ORDER BY id DESC LIMIT 1",
      [noGrantUser.id]
    );
    expect(row).toBeTruthy();
    expect(row.request_id).toBe(requestIdHeader);
    expect(row.ip_address).toBeTruthy();
    expect(row.after.module).toBe('warehouses');
    expect(row.after.reason).toBe('policy_denied');

    const after = (await one(
      "SELECT COUNT(*)::int AS c FROM audit_events WHERE entity = 'authorization' AND action = 'denied' AND user_id = $1", [noGrantUser.id]
    )).c;
    expect(after).toBe(before + 1); // exactly one denial row per denied request
  });
});
