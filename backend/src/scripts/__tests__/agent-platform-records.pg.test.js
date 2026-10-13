process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const db = require('../../config/database');
const tokens = require('../../services/tokens');
const oauthService = require('../../services/oauthService');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('agent API tokens, durable MCP sessions, and action comments (real PostgreSQL)', () => {
  const tag = String(Date.now()).slice(-7);
  const created = { users: [], projects: [], actions: [], comments: [], tokens: [], sessions: [] };
  let app; let server; let base; let owner; let scopedOwner; let project; let otherProject; let actionId; let otherActionId;

  const row = async (sql, params) => (await db.query(sql, params)).rows[0];
  const call = async (actor, method, path, body, headers = {}) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${actor.token}`, ...headers },
      body: body == null ? undefined : JSON.stringify(body),
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const globalUser = await row("INSERT INTO users (name,email,password,role,is_active) VALUES ($1,$2,'x','owner',true) RETURNING id,token_version", [`agent-${tag}`, `agent-${tag}@test.invalid`]);
    const scopedUser = await row("INSERT INTO users (name,email,password,role,is_active) VALUES ($1,$2,'x','owner',true) RETURNING id,token_version", [`agent-scope-${tag}`, `agent-scope-${tag}@test.invalid`]);
    created.users.push(globalUser.id, scopedUser.id);
    await db.query("INSERT INTO user_project_roles (user_id,project_id,role_id) SELECT $1,NULL,id FROM roles WHERE key='owner'", [globalUser.id]);
    owner = { token: tokens.signSession({ userId: globalUser.id, tokenVersion: globalUser.token_version || 0 }) };
    project = (await row("INSERT INTO projects (name,name_en,code,status) VALUES ($1,$1,$2,'active') RETURNING id", [`Agent ${tag}`, `AG${tag}A`])).id;
    otherProject = (await row("INSERT INTO projects (name,name_en,code,status) VALUES ($1,$1,$2,'active') RETURNING id", [`Agent other ${tag}`, `AG${tag}B`])).id;
    created.projects.push(project, otherProject);
    await db.query("INSERT INTO user_project_roles (user_id,project_id,role_id) SELECT $1,$2,id FROM roles WHERE key='owner'", [scopedUser.id, project]);
    scopedOwner = { token: tokens.signSession({ userId: scopedUser.id, tokenVersion: scopedUser.token_version || 0 }) };
    actionId = (await row("INSERT INTO action_items (source_type,project_id,title,created_by) VALUES ('manual',$1,$2,$3) RETURNING id", [project, `Scoped action ${tag}`, globalUser.id])).id;
    otherActionId = (await row("INSERT INTO action_items (source_type,project_id,title,created_by) VALUES ('manual',$1,$2,$3) RETURNING id", [otherProject, `Other action ${tag}`, globalUser.id])).id;
    created.actions.push(actionId, otherActionId);
  });

  afterAll(async () => {
    if (created.comments.length) await db.query('DELETE FROM action_comments WHERE id = ANY($1::int[])', [created.comments]);
    if (created.actions.length) await db.query('DELETE FROM action_items WHERE id = ANY($1::int[])', [created.actions]);
    if (created.tokens.length) await db.query('DELETE FROM api_tokens WHERE id = ANY($1::int[])', [created.tokens]);
    if (created.sessions.length) await db.query('DELETE FROM agent_sessions WHERE id = ANY($1::uuid[])', [created.sessions]);
    if (created.projects.length) await db.query('DELETE FROM projects WHERE id = ANY($1::int[])', [created.projects]);
    if (created.users.length) await db.query('DELETE FROM user_project_roles WHERE user_id = ANY($1::int[])', [created.users]);
    if (created.users.length) await db.query('UPDATE users SET is_active = false WHERE id = ANY($1::int[])', [created.users]);
    if (server) await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('shows personal API secrets once, stores hashes, and enforces scopes, expiry, and revocation', async () => {
    const createdToken = await call(owner, 'POST', '/api/agent/tokens', { name: 'Read projects', scopes: ['projects:read', 'actions:write'] });
    expect(createdToken.status).toBe(201);
    const tokenId = createdToken.body.data.id;
    created.tokens.push(tokenId);
    const secret = createdToken.body.data.token;
    expect(secret).toMatch(/^erp_pat_[a-f0-9]{64}$/);
    const stored = await row('SELECT token_hash, token_prefix, scopes FROM api_tokens WHERE id = $1', [tokenId]);
    expect(stored.token_hash).not.toBe(secret);
    expect(stored).toMatchObject({ token_prefix: secret.slice(0, 16), scopes: ['projects:read', 'actions:write'] });
    expect((await oauthService.verifyToken(secret)).scopes).toEqual(['projects:read', 'actions:write']);
    expect((await call({ token: secret }, 'GET', '/api/v1/projects')).status).toBe(200);
    const deniedWrite = await call({ token: secret }, 'POST', '/api/v1/projects', {});
    expect(deniedWrite.status).toBe(403);
    expect(deniedWrite.body.error.code).toBe('insufficient_scope');
    const commentViaToken = await call({ token: secret }, 'POST', `/api/v1/actions/${actionId}/comments`, { body: 'Scoped token action note.' });
    expect(commentViaToken.status).toBe(201);
    created.comments.push(commentViaToken.body.data.id);
    const deniedCommentRead = await call({ token: secret }, 'GET', `/api/v1/actions/${actionId}/comments`);
    expect(deniedCommentRead.status).toBe(403);
    const listed = await call(owner, 'GET', '/api/agent/tokens');
    expect(listed.status).toBe(200);
    expect(JSON.stringify(listed.body)).not.toContain(secret);
    expect(await oauthService.verifyToken(secret)).toBeTruthy();
    const revoked = await call(owner, 'POST', `/api/agent/tokens/${tokenId}/revoke`, {});
    expect(revoked.body.data.revoked).toBe(true);
    await expect(oauthService.verifyToken(secret)).rejects.toMatchObject({ code: 'invalid_token', status: 401 });

    const expiring = await call(owner, 'POST', '/api/agent/tokens', { name: 'Short project read', scopes: ['projects:read'], expires_in_days: 1 });
    expect(expiring.status).toBe(201);
    created.tokens.push(expiring.body.data.id);
    await db.query("UPDATE api_tokens SET expires_at = NOW() - INTERVAL '1 second' WHERE id = $1", [expiring.body.data.id]);
    await expect(oauthService.verifyToken(expiring.body.data.token)).rejects.toMatchObject({ code: 'invalid_token', status: 401 });
    const wildcard = await call(owner, 'POST', '/api/agent/tokens', { name: 'Too broad', scopes: ['api:read'] });
    expect(wildcard.status).toBe(400);
  });

  test('assigns MCP sessions to a user and refuses session reuse by another user', async () => {
    const first = await call(owner, 'POST', '/api/mcp', { jsonrpc: '2.0', id: 1, method: 'ping' });
    expect(first.status).toBe(200);
    const sessionId = first.headers.get('mcp-session-id');
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/i);
    created.sessions.push(sessionId);
    const resumed = await call(owner, 'POST', '/api/mcp', { jsonrpc: '2.0', id: 2, method: 'ping' }, { 'Mcp-Session-Id': sessionId });
    expect(resumed.status).toBe(200);
    expect(resumed.headers.get('mcp-session-id')).toBe(sessionId);
    const stolen = await call(scopedOwner, 'POST', '/api/mcp', { jsonrpc: '2.0', id: 3, method: 'ping' }, { 'Mcp-Session-Id': sessionId });
    expect(stolen.status).toBe(404);
    const listed = await call(owner, 'GET', '/api/agent/sessions');
    expect(listed.body.data.find((session) => session.id === sessionId)).toMatchObject({ user_id: expect.any(Number), status: 'active' });
    const closed = await call(owner, 'POST', `/api/agent/sessions/${sessionId}/status`, { status: 'completed' });
    expect(closed.body.data.status).toBe('completed');
    const reused = await call(owner, 'POST', '/api/mcp', { jsonrpc: '2.0', id: 4, method: 'ping' }, { 'Mcp-Session-Id': sessionId });
    expect(reused.status).toBe(404);
    const expiring = await call(owner, 'POST', '/api/mcp', { jsonrpc: '2.0', id: 5, method: 'ping' });
    const expiringId = expiring.headers.get('mcp-session-id');
    created.sessions.push(expiringId);
    await db.query("UPDATE agent_sessions SET expires_at = NOW() - INTERVAL '1 second' WHERE id = $1", [expiringId]);
    const expired = await call(owner, 'POST', '/api/mcp', { jsonrpc: '2.0', id: 6, method: 'ping' }, { 'Mcp-Session-Id': expiringId });
    expect(expired.status).toBe(404);
    expect((await row('SELECT status FROM agent_sessions WHERE id = $1', [expiringId])).status).toBe('expired');
  });

  test('audits internal action comments and applies the parent action project scope', async () => {
    const posted = await call(scopedOwner, 'POST', `/api/actions/${actionId}/comments`, { body: 'Inspection evidence attached.' });
    expect(posted.status).toBe(201);
    created.comments.push(posted.body.data.id);
    const listed = await call(scopedOwner, 'GET', `/api/actions/${actionId}/comments`);
    expect(listed.body.data).toHaveLength(2);
    expect(listed.body.data).toContainEqual(expect.objectContaining({ body: 'Inspection evidence attached.', project_id: project }));
    const denied = await call(scopedOwner, 'GET', `/api/actions/${otherActionId}/comments`);
    expect(denied.status).toBe(403);
  });
});
