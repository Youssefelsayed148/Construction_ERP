// Real PostgreSQL + real app. Phase 1.4: MCP and v1 agent-safety controls.
// Reproduced first (each of these failed on the old code):
//   * v1 token scopes were never checked by MCP, on the v1-only lists or on /api/v1/assistants;
//   * tool arguments were not validated (additionalProperties: true, nothing required);
//   * /api/mcp had no rate limit and no batch cap, and the client chose the session id;
//   * tool output did not say that record text is untrusted;
//   * assign_action / complete_action_with_evidence executed immediately and needed no evidence;
//   * the tool-call log stored the UNREDACTED response;
//   * the gated tool names did not match the catalog.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('MCP / v1 agent safety (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let projectId; let clientId; let noFlagsRole;
  const users = {};
  const tag = String(Date.now()).slice(-8);
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];

  // rowRole: the role whose grants the user gets (defaults to their users.role).
  const makeUser = async (key, role, rowRole = role) => {
    const row = await one(
      "INSERT INTO users (name, email, password, role) VALUES ($1, $2, 'x', $3) RETURNING id, token_version", [`ms-${key}`, `ms-${key}-${tag}@test.io`, role]
    );
    await db.query('INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = $2', [row.id, rowRole]);
    users[key] = { id: row.id, session: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
  };
  const v1Token = (key, scope) => tokens.signV1Access({ sub: `user:${users[key].id}`, userId: users[key].id, scope, tokenVersion: 0, ttlSeconds: 600 });

  const post = async (path, token, body, headers = {}) => {
    const res = await fetch(`${base}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...headers }, body: JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* empty */ }
    return { status: res.status, body: json, headers: res.headers };
  };
  let rpcId = 0;
  const rpc = (token, method, params, headers) => post('/api/mcp', token, { jsonrpc: '2.0', id: ++rpcId, method, params }, headers);
  const tool = async (token, name, args, headers) => {
    const r = await rpc(token, 'tools/call', { name, arguments: args }, headers);
    return { ...r, result: r.body && r.body.result, data: r.body && r.body.result && r.body.result.structuredContent };
  };
  const get = async (path, token) => {
    const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    let json = null;
    try { json = await res.json(); } catch (e) { /* empty */ }
    return { status: res.status, body: json };
  };

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    projectId = (await one("INSERT INTO projects (name, name_en, code) VALUES ('ms p', 'ms p', $1) RETURNING id", [`MS${tag}`])).id;
    clientId = (await one("INSERT INTO clients (name_ar, name_en) VALUES ('ms', 'ms') RETURNING id")).id;
    await one("INSERT INTO invoices (invoice_number, project_id, client_id, amount, issue_date) VALUES ($1, $2, $3, 777, CURRENT_DATE) RETURNING id", [`MS-INV-${tag}`, projectId, clientId]);
    // A role with full access but none of the see_* money-visibility grants.
    noFlagsRole = `ms_noflags_${tag}`;
    const roleId = (await one("INSERT INTO roles (key, name, is_system) VALUES ($1, 'ms no flags', false) RETURNING id", [noFlagsRole])).id;
    await db.query("INSERT INTO role_permissions (role_id, permission_id) SELECT $1, id FROM permissions WHERE module = '*' AND action = '*'", [roleId]);
    for (const [k, r] of [['owner', 'owner'], ['rate', 'owner'], ['batch', 'owner']]) await makeUser(k, r);
    await makeUser('eng', 'engineer', noFlagsRole);
  });
  afterAll(async () => {
    const ids = Object.values(users).map((u) => u.id);
    await db.query('DELETE FROM agent_tool_calls WHERE user_id = ANY($1)', [ids]);
    await db.query('DELETE FROM agent_action_requests WHERE requesting_user_id = ANY($1)', [ids]);
    await db.query('DELETE FROM action_items WHERE title LIKE $1', [`ms-${tag}%`]);
    await db.query('DELETE FROM invoices WHERE invoice_number = $1', [`MS-INV-${tag}`]);
    await db.query('DELETE FROM user_project_roles WHERE user_id = ANY($1)', [ids]);
    await db.query('UPDATE users SET is_active = false WHERE id = ANY($1)', [ids]);
    await db.query('DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE key = $1)', [noFlagsRole]);
    await db.query('DELETE FROM roles WHERE key = $1', [noFlagsRole]);
    await db.query('DELETE FROM clients WHERE id = $1', [clientId]);
    await db.query('DELETE FROM projects WHERE id = $1', [projectId]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  describe('token scopes', () => {
    test('MCP enforces v1 scopes per tool family and per read/write', async () => {
      const projectsRead = v1Token('owner', ['projects:read']);
      const ok = await tool(projectsRead, 'get_project', { id: projectId });
      expect(ok.data.success).toBe(true);
      const wrongFamily = await tool(projectsRead, 'list_invoices', {});
      expect(wrongFamily.data.success).toBe(false);
      expect(wrongFamily.data.error).toMatch(/scope/i);
      const readOnlyWrite = await tool(v1Token('owner', ['api:read']), 'create_rfi', { project_id: projectId, subject: 'x' });
      expect(readOnlyWrite.data.success).toBe(false);
      expect(readOnlyWrite.data.error).toMatch(/scope/i);
      const writeOnlyRead = await tool(v1Token('owner', ['api:write']), 'get_project', { id: projectId });
      expect(writeOnlyRead.data.success).toBe(false);
      // A full-session (UI) token is not scope-limited.
      expect((await tool(users.owner.session, 'list_invoices', {})).data.success).toBe(true);
    });

    test('v1-only lists need their family scope', async () => {
      expect((await get('/api/v1/purchase-orders', v1Token('owner', ['projects:read']))).status).toBe(403);
      expect((await get('/api/v1/purchase-orders', v1Token('owner', ['purchase-orders:read']))).status).toBe(200);
      expect((await get('/api/v1/organizations', v1Token('owner', ['projects:read']))).status).toBe(403);
    });

    test('assistants need the assistants scope', async () => {
      expect((await get('/api/v1/assistants/pm/summary', v1Token('owner', ['projects:read']))).status).toBe(403);
      expect((await get('/api/v1/assistants/pm/summary', v1Token('owner', ['assistants:read']))).status).toBe(200);
      const draftDenied = await post('/api/v1/assistants/pm/draft', v1Token('owner', ['assistants:read']), {});
      expect(draftDenied.status).toBe(403);
    });
  });

  describe('argument validation', () => {
    test('unknown properties and missing required fields are refused', async () => {
      const extra = await tool(users.owner.session, 'create_rfi', { project_id: projectId, subject: 's', hack: 1 });
      expect(extra.data.success).toBe(false);
      expect(extra.data.error).toMatch(/hack/);
      const missing = await tool(users.owner.session, 'create_rfi', { project_id: projectId });
      expect(missing.data.success).toBe(false);
      expect(missing.data.error).toMatch(/subject/);
      expect((await tool(users.owner.session, 'get_project', {})).data.success).toBe(false);
      expect((await tool(users.owner.session, 'get_project', { id: 'abc' })).data.success).toBe(false);
      expect((await tool(users.owner.session, 'list_projects', { unexpected: 1 })).data.success).toBe(false);
    });

    test('valid arguments, including a reason, still work', async () => {
      const r = await tool(users.owner.session, 'get_project', { id: projectId, reason: 'checking status' });
      expect(r.data.success).toBe(true);
    });
  });

  describe('transport limits', () => {
    test('rate limit per user', async () => {
      process.env.MCP_RATE_LIMIT_PER_MIN = '5';
      try {
        const statuses = [];
        for (let i = 0; i < 8; i += 1) statuses.push((await rpc(users.rate.session, 'ping', {})).status);
        expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
        expect(statuses.slice(5)).toEqual([429, 429, 429]);
      } finally { delete process.env.MCP_RATE_LIMIT_PER_MIN; }
    });

    test('batch size is capped', async () => {
      const mk = (n) => Array.from({ length: n }, (_, i) => ({ jsonrpc: '2.0', id: i + 1, method: 'ping' }));
      const big = await post('/api/mcp', users.batch.session, mk(21));
      expect(big.status).toBe(400);
      const small = await post('/api/mcp', users.batch.session, mk(3));
      expect(small.status).toBe(200);
      expect(small.body.length).toBe(3);
    });

    test('the session id is server-assigned, not taken from the client', async () => {
      const r = await tool(users.owner.session, 'get_project', { id: projectId }, { 'Mcp-Session-Id': 'attacker-chosen-session' });
      expect(r.headers.get('mcp-session-id')).not.toBe('attacker-chosen-session');
      const logged = await one("SELECT agent_session FROM agent_tool_calls WHERE user_id = $1 AND tool = 'get_project' ORDER BY id DESC LIMIT 1", [users.owner.id]);
      expect(logged.agent_session).not.toBe('attacker-chosen-session');
      expect(logged.agent_session).toBeTruthy();
    });
  });

  describe('tool output and logging', () => {
    test('record text is marked as untrusted data', async () => {
      const r = await tool(users.owner.session, 'get_project', { id: projectId });
      expect(r.result._meta).toMatchObject({ untrusted_record_text: true });
      expect(JSON.stringify(r.result.content.slice(1))).toMatch(/untrusted/i);
    });

    test('the tool-call log stores the redacted response, not the raw one', async () => {
      const flags = await require('../../services/policy').visibilityFlags({ id: users.eng.id, role: 'engineer' });
      expect(flags.see_client_price).toBe(false);
      const r = await tool(users.eng.session, 'list_invoices', {});
      expect(r.data.success).toBe(true);
      expect(JSON.stringify(r.data)).not.toMatch(/"amount"/);
      const logged = await one("SELECT response_summary FROM agent_tool_calls WHERE user_id = $1 AND tool = 'list_invoices' ORDER BY id DESC LIMIT 1", [users.eng.id]);
      expect(logged.response_summary).toBeTruthy();
      expect(logged.response_summary).not.toMatch(/"amount"/);
      expect(logged.response_summary).not.toMatch(/777/);
    });
  });

  describe('actions that notify or complete work', () => {
    test('assign_action and complete_action_with_evidence need approval and evidence', async () => {
      const before = (await one('SELECT count(*)::int AS n FROM action_items')).n;
      const assign = await tool(users.owner.session, 'assign_action', { title: `ms-${tag} assign`, project_id: projectId, assigned_user_id: users.eng.id });
      expect(assign.data.success).toBe(true);
      expect(assign.data.data.status).toBe('pending_approval');
      expect((await one('SELECT count(*)::int AS n FROM action_items')).n).toBe(before);

      const action = await one("INSERT INTO action_items (source_type, title, project_id) VALUES ('manual', $1, $2) RETURNING id", [`ms-${tag} complete`, projectId]);
      const noEvidence = await tool(users.owner.session, 'complete_action_with_evidence', { action_id: action.id });
      expect(noEvidence.data.success).toBe(false);
      expect(noEvidence.data.error).toMatch(/evidence/);
      const withEvidence = await tool(users.owner.session, 'complete_action_with_evidence', { action_id: action.id, evidence: 'Photo IMG_2041 shows the slab poured and cured' });
      expect(withEvidence.data.data.status).toBe('pending_approval');
      expect((await one('SELECT status FROM action_items WHERE id = $1', [action.id])).status).not.toBe('completed');
    });
  });

  describe('tool catalog', () => {
    test('gated tool names match the catalog', async () => {
      const list = await rpc(users.owner.session, 'tools/list', {});
      const names = list.body.result.tools.map((t) => t.name);
      expect(names).toEqual(expect.arrayContaining(['void_financial_record', 'change_authority_rules']));
      expect(names).not.toContain('void_controlled_financial_record');
      expect(names).not.toContain('change_permission_rules');
    });
  });
});
