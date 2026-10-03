// Real PostgreSQL. Phase 1.4: the approval gate for gated agent actions.
// Reproduced first:
//   * two concurrent approvals of one request both executed the stored action (check-then-act on `decision`);
//   * a requester could approve their own request;
//   * an approver bound to project A could approve (and so execute) a request that belongs to project B.
const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('agent approval gate (real PostgreSQL)', () => {
  let db; let mcp; let projectA; let projectB; let clientId;
  const users = {};
  const tag = String(Date.now()).slice(-8);
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];

  const makeUser = async (key, role, projectId = null) => {
    const row = await one(
      "INSERT INTO users (name, email, password, role) VALUES ($1, $2, 'x', $3) RETURNING id, name, email, role, is_active", [`aa-${key}`, `aa-${key}-${tag}@test.io`, role]
    );
    await db.query('INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, $2, id FROM roles WHERE key = $3', [row.id, projectId, role]);
    users[key] = row;
  };
  const paymentArgs = (projectId) => ({ project_id: projectId, client_id: clientId, amount: 250, payment_date: '2026-01-15', reference_number: `aa-${tag}` });
  const propose = async (requester, projectId) => {
    const res = await mcp.executeTool({ toolName: 'record_payment', args: paymentArgs(projectId), user: requester, agentSession: 'aa-test' });
    expect(res.status).toBe(202);
    return res.request.id;
  };
  const paymentCount = async (projectId) => (await one('SELECT count(*)::int AS n FROM payments WHERE project_id = $1', [projectId])).n;

  beforeAll(async () => {
    db = require('../../config/database');
    mcp = require('../../services/mcpService');
    projectA = (await one("INSERT INTO projects (name, name_en, code) VALUES ('aa A', 'aa A', $1) RETURNING id", [`AAA${tag}`])).id;
    projectB = (await one("INSERT INTO projects (name, name_en, code) VALUES ('aa B', 'aa B', $1) RETURNING id", [`AAB${tag}`])).id;
    clientId = (await one("INSERT INTO clients (name_ar, name_en) VALUES ('aa', 'aa') RETURNING id")).id;
    await makeUser('fin', 'finance_manager');
    await makeUser('owner1', 'owner');
    await makeUser('owner2', 'owner');
    await makeUser('finA', 'finance_manager', projectA);
  });
  afterAll(async () => {
    const ids = Object.values(users).map((u) => u.id);
    await db.query('DELETE FROM agent_tool_calls WHERE user_id = ANY($1)', [ids]);
    await db.query('DELETE FROM agent_action_requests WHERE requesting_user_id = ANY($1)', [ids]);
    await db.query('DELETE FROM payments WHERE reference_number = $1', [`aa-${tag}`]);
    await db.query('DELETE FROM user_project_roles WHERE user_id = ANY($1)', [ids]);
    await db.query('UPDATE users SET is_active = false WHERE id = ANY($1)', [ids]);
    await db.query('DELETE FROM clients WHERE id = $1', [clientId]);
    await db.query('DELETE FROM projects WHERE id = ANY($1)', [[projectA, projectB]]);
    await db.pool.end();
  });

  test('two concurrent approvals execute the action once', async () => {
    const id = await propose(users.fin, projectA);
    const before = await paymentCount(projectA);
    const results = await Promise.allSettled([
      mcp.decideRequest(id, users.owner1, 'approve', 'a'),
      mcp.decideRequest(id, users.owner2, 'approve', 'b'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1);
    const lost = results.find((r) => r.status === 'rejected');
    expect(lost.reason.status).toBe(409);
    expect(await paymentCount(projectA)).toBe(before + 1);
    const row = await one('SELECT decision, execution_status FROM agent_action_requests WHERE id = $1', [id]);
    expect(row).toMatchObject({ decision: 'approved', execution_status: 'executed' });
  });

  test('an approve and a reject racing leave one outcome and run the action at most once', async () => {
    const id = await propose(users.fin, projectA);
    const before = await paymentCount(projectA);
    const results = await Promise.allSettled([
      mcp.decideRequest(id, users.owner1, 'approve'),
      mcp.decideRequest(id, users.owner2, 'reject'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1);
    const row = await one('SELECT decision FROM agent_action_requests WHERE id = $1', [id]);
    const executed = (await paymentCount(projectA)) - before;
    expect(executed).toBe(row.decision === 'approved' ? 1 : 0);
  });

  test('a requester cannot approve their own request', async () => {
    const id = await propose(users.fin, projectA);
    const before = await paymentCount(projectA);
    await expect(mcp.decideRequest(id, users.fin, 'approve')).rejects.toMatchObject({ status: 403 });
    expect(await paymentCount(projectA)).toBe(before);
    expect((await one('SELECT decision FROM agent_action_requests WHERE id = $1', [id])).decision).toBeNull();
    // ...but another approver can.
    await expect(mcp.decideRequest(id, users.owner1, 'approve')).resolves.toBeTruthy();
  });

  test('an approver bound to another project cannot decide the request', async () => {
    const id = await propose(users.fin, projectB);
    const before = await paymentCount(projectB);
    await expect(mcp.decideRequest(id, users.finA, 'approve')).rejects.toMatchObject({ status: 403 });
    expect(await paymentCount(projectB)).toBe(before);
    expect((await one('SELECT decision FROM agent_action_requests WHERE id = $1', [id])).decision).toBeNull();
    await expect(mcp.decideRequest(id, users.owner1, 'reject')).resolves.toBeTruthy();
  });
});
