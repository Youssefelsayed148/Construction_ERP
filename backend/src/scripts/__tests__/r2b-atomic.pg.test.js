'use strict';

process.env.AUTH_RATE_LIMIT_PER_15_MIN = '100000';
const bcrypt = require('bcryptjs');
const passwords = require('../../services/passwords');
const crypto = require('crypto');
const tokens = require('../../services/tokens');
const describePg = process.env.TEST_PG === '1' ? describe : describe.skip;

describePg('R2b audit atomicity', () => {
  let db; let mcp; let oauth; let owner; let requester; let project; let client; let account; let server; let base;
  const tag = `${Date.now()}-${process.pid}`;
  const secret = crypto.randomBytes(24).toString('hex');
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const audit = (action) => one("SELECT *, xmin::text AS xid FROM audit_events WHERE user_id = $1 AND action = $2 ORDER BY id DESC LIMIT 1", [owner.id, action]);
  const proposal = () => mcp.executeTool({ toolName: 'record_payment', args: { project_id: project.id, client_id: client.id, amount: 10, payment_date: '2026-10-15' }, user: requester, agentSession: null });
  const failInsert = async (table, work) => {
    // Only fixed test-owned table names enter SQL; triggers live solely on the throwaway DB.
    if (!['audit_events', 'activity_log', 'agent_tool_calls'].includes(table)) throw new Error('Invalid test table');
    await db.query("CREATE OR REPLACE FUNCTION r2b_fail_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'r2b injected audit failure'; END $$");
    await db.query(`CREATE TRIGGER r2b_fail_insert BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION r2b_fail_insert()`);
    try { return await work(); } finally {
      await db.query(`DROP TRIGGER r2b_fail_insert ON ${table}`);
      await db.query('DROP FUNCTION r2b_fail_insert()');
    }
  };

  beforeAll(async () => {
    db = require('../../config/database');
    mcp = require('../../services/mcpService');
    oauth = require('../../services/oauthService');
    const makeOwner = async (name) => {
      const u = await one("INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, 'owner') RETURNING *", [name, `${name}-${tag}@test.io`, await bcrypt.hash(secret, 4)]);
      await db.query("INSERT INTO user_project_roles (user_id, role_id) SELECT $1, id FROM roles WHERE key = 'owner'", [u.id]);
      return u;
    };
    owner = await makeOwner('r2b-owner');
    requester = await makeOwner('r2b-requester');
    project = await one("INSERT INTO projects (name, code, status) VALUES ('r2b atomic', $1, 'active') RETURNING id", [`R2B-${tag}`]);
    client = await one("INSERT INTO clients (name_ar, name_en) VALUES ('r2b', 'r2b') RETURNING id");
    account = await one("INSERT INTO service_accounts (name, client_id, client_secret_hash, user_id, scopes, last_used_at) VALUES ('r2b', $1, $2, $3, $4::jsonb, '2000-01-01') RETURNING *", [`r2b-${tag}`, await passwords.hashPassword(secret), owner.id, JSON.stringify(['api:read'])]);
    const { app } = require('../../../server');
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.pool.end();
  });

  const issue = () => oauth.issueForClientCredentials({ grant_type: 'client_credentials', client_id: account.client_id, client_secret: secret });
  test('OAuth client issuance and attributed audit commit in the same transaction', async () => {
    const result = await issue();
    expect(result.access_token).toBeTruthy();
    const state = await one('SELECT xmin::text AS xid FROM service_accounts WHERE id = $1', [account.id]);
    expect(await audit('client_credentials')).toMatchObject({ xid: state.xid });
  });
  test('OAuth client audit failure leaves last_used_at unchanged and returns no token', async () => {
    const before = await one('SELECT last_used_at FROM service_accounts WHERE id = $1', [account.id]);
    await failInsert('audit_events', async () => {
      await expect(issue()).rejects.toThrow('r2b injected audit failure');
      expect(await one('SELECT last_used_at FROM service_accounts WHERE id = $1', [account.id])).toEqual(before);
    });
  });
  test('OAuth refresh audit failure leaves last_used_at unchanged and returns no token', async () => {
    const issued = await issue();
    const before = await one('SELECT last_used_at FROM service_accounts WHERE id = $1', [account.id]);
    await failInsert('audit_events', async () => {
      await expect(oauth.issueForRefresh({ grant_type: 'refresh_token', refresh_token: issued.refresh_token })).rejects.toThrow('r2b injected audit failure');
      expect(await one('SELECT last_used_at FROM service_accounts WHERE id = $1', [account.id])).toEqual(before);
    });
  });
  test('OAuth password audit failure returns no token', async () => {
    await failInsert('audit_events', async () => {
      await expect(oauth.issueForPassword({ grant_type: 'password', username: owner.email, password: secret })).rejects.toThrow('r2b injected audit failure');
    });
  });
  test('MCP proposal and tool/activity audit commit in the same transaction', async () => {
    const result = await proposal();
    expect(result.status).toBe(202);
    const state = await one('SELECT xmin::text AS xid FROM agent_action_requests WHERE id = $1', [result.request.id]);
    const tool = await one('SELECT xmin::text AS xid FROM agent_tool_calls WHERE request_id = $1', [result.request.id]);
    const activity = await one("SELECT xmin::text AS xid FROM activity_log WHERE user_id = $1 AND action = 'agent_tool' ORDER BY id DESC LIMIT 1", [requester.id]);
    expect(tool.xid).toBe(state.xid);
    expect(activity.xid).toBe(state.xid);
  });
  test('MCP draft-only proposals have an owner approver and an audit row', async () => {
    const result = await mcp.executeTool({ toolName: 'create_invoice_draft', args: { project_id: project.id, amount: 10 }, user: requester });
    expect(result.status).toBe(201);
    expect(result.request.required_approver_role).toBe('owner');
    expect(await one('SELECT id FROM agent_tool_calls WHERE request_id = $1', [result.request.id])).toBeTruthy();
  });
  test.each(['activity_log', 'agent_tool_calls'])('MCP proposal rolls back when %s insert fails', async table => {
    const before = await one('SELECT count(*)::int AS n FROM agent_action_requests WHERE requesting_user_id = $1', [requester.id]);
    await failInsert(table, async () => {
      await expect(proposal()).rejects.toThrow('r2b injected audit failure');
      expect(await one('SELECT count(*)::int AS n FROM agent_action_requests WHERE requesting_user_id = $1', [requester.id])).toEqual(before);
    });
  });
  test('agent rejection rolls back the decision when tool audit fails', async () => {
    const result = await proposal();
    await failInsert('agent_tool_calls', async () => {
      await expect(mcp.decideRequest(result.request.id, owner, 'reject', 'test')).rejects.toThrow('r2b injected audit failure');
      expect(await one('SELECT decision FROM agent_action_requests WHERE id = $1', [result.request.id])).toEqual({ decision: null });
    });
  });
  test('agent approval completion and approver activity commit in the same transaction', async () => {
    const result = await proposal();
    await mcp.decideRequest(result.request.id, owner, 'approve', 'test');
    const state = await one('SELECT xmin::text AS xid FROM agent_action_requests WHERE id = $1', [result.request.id]);
    const activity = await one("SELECT xmin::text AS xid FROM activity_log WHERE user_id = $1 AND entity_id = $2 ORDER BY id DESC LIMIT 1", [owner.id, result.request.id]);
    expect(activity.xid).toBe(state.xid);
    // Execution has its own guarded handler transaction. If completion logging
    // fails, the committed claim remains auditable and cannot be executed twice.
    const next = await proposal();
    await failInsert('agent_tool_calls', async () => {
      await expect(mcp.decideRequest(next.request.id, owner, 'approve', 'test')).rejects.toThrow('r2b injected audit failure');
      expect(await one('SELECT decision, execution_status FROM agent_action_requests WHERE id = $1', [next.request.id])).toEqual({ decision: 'approved', execution_status: 'executing' });
      expect(await one("SELECT id FROM activity_log WHERE user_id = $1 AND entity_id = $2 AND action = 'approve'", [owner.id, next.request.id])).toBeTruthy();
    });
  });
  const preview = async () => {
    const res = await fetch(`${base}/api/users/preview/site_engineer`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.signSession({ userId: owner.id, tokenVersion: owner.token_version })}` } });
    return { status: res.status, body: await res.json() };
  };
  test('preview issues a token only with an attributed audit row', async () => {
    const result = await preview();
    expect(result.status).toBe(200);
    expect(result.body.token).toBeTruthy();
    expect(await audit('preview_as_role')).toBeTruthy();
  });
  test('preview audit failure returns no token', async () => {
    await failInsert('audit_events', async () => {
      const result = await preview();
      expect(result.status).toBe(500);
      expect(result.body.token).toBeUndefined();
    });
  });
});
