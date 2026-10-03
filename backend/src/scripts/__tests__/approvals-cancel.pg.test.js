// Real PostgreSQL + real app. Phase 3 (open item): stale approval workflows get a non-destructive
// cancel — status 'cancelled' with cancelled_by, cancelled_at and a reason, audit-logged — plus a
// dry-run report (scripts/cancel-stale-approvals.js) and workflow-instance cancellation so no stale
// workflow keeps ticking next to a cancelled legacy approval.
//
// Reproduced first (on the pre-change code): a stale approval could only be approve/reject/decided;
// cleanup-orphan-approvals.js --apply was the destructive last resort, and a cancelled approval left its
// linked workflow instance active forever.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('approvals: non-destructive cancel (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db;
  const tag = String(Date.now()).slice(-6) + Math.random().toString(36).slice(2, 5);
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const users = {};
  const ids = {};
  const call = async (method, path, body, token) => {
    const res = await fetch(`${base}${path}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || users.owner.token}` }, body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* empty */ }
    return { status: res.status, body: json };
  };

  const makeUser = async (key, userRole, projectId = null) => {
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ($1, $2, 'x', $3) RETURNING id, name, token_version", [`ax-${key}`, `ax-${key}-${tag}@test.io`, userRole]);
    await db.query('INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, $2, id FROM roles WHERE key = $3', [row.id, projectId, userRole]);
    users[key] = { id: row.id, name: row.name, role: userRole, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
    return users[key];
  };

  const makeStaleApproval = async ({ module_name = 'expenses', daysOld = 40 }) => {
    const requester = await makeUser(`req-${Object.keys(users).length}`, 'engineer');
    const requestId = 42000 + Math.floor(Math.random() * 100000); // unique per row: (module, type, request_id) is unique among pending rows (0013)
    const id = (await one(
      `INSERT INTO approval_requests (module_name, request_type, request_id, requester_id, status)
       VALUES ($1, 'create', $3, $2, 'pending') RETURNING id`,
      [module_name, requester.id, requestId]
    )).id;
    await db.query(`UPDATE approval_requests SET created_at = now() - ($1 || ' days')::interval, updated_at = now() - ($1 || ' days')::interval WHERE id = $2`, [String(daysOld), id]);
    return { requester, id };
  };

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    await makeUser('owner', 'owner');
  });

  afterAll(async () => {
    const uids = Object.values(users).map((u) => u.id).concat(users.__extra || []);
    await db.query('DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE key LIKE $1)', [`axr_${tag}%`]);
    await db.query('DELETE FROM roles WHERE key LIKE $1', [`axr_${tag}%`]);
    await db.query('DELETE FROM agent_tool_calls WHERE user_id = ANY($1)', [uids]);
    await db.query('DELETE FROM approval_requests WHERE requester_id = ANY($1)', [uids]);
    await db.query('DELETE FROM user_project_roles WHERE user_id = ANY($1)', [uids]);
    await db.query('UPDATE users SET is_active = false WHERE id = ANY($1)', [uids]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('an owner cancels a stale pending approval: cancelled with actor, timestamp, reason and audit, exactly once', async () => {
    const { id } = await makeStaleApproval({});
    const cancelled = await call('PUT', `/api/approvals/${id}/cancel`, { reason: 'superseded by the procurement flow' });
    expect(cancelled.status).toBe(200);
    const row = await one('SELECT status, cancelled_by, cancelled_at, cancel_reason FROM approval_requests WHERE id = $1', [id]);
    expect(row.status).toBe('cancelled');
    expect(row.cancelled_by).toBe(users.owner.id);
    expect(row.cancelled_at).toBeTruthy();
    expect(row.cancel_reason).toBe('superseded by the procurement flow');
    expect(row.cancel_reason).toMatch(/superseded/);
    const audit = await one("SELECT * FROM activity_log WHERE entity_id = $1 AND action = 'cancel' AND module = 'approvals' ORDER BY id DESC LIMIT 1", [id]);
    expect(audit).toBeTruthy();

    // cancelling again is refused (already decided/cancelled), nothing is overwritten
    const again = await call('PUT', `/api/approvals/${id}/cancel`, { reason: 'twice' });
    expect(again.status).toBe(409);
    const row2 = await one('SELECT cancel_reason FROM approval_requests WHERE id = $1', [id]);
    expect(row2.cancel_reason).toBe('superseded by the procurement flow');
    expect((await one('SELECT count(*)::int n FROM activity_log WHERE entity_id = $1 AND action = $2 AND module = $3', [id, 'cancel', 'approvals'])).n).toBe(1);
  });

  test('a decided approval cannot be cancelled', async () => {
    const { id } = await makeStaleApproval({});
    await db.query("UPDATE approval_requests SET status = 'approved', approver_id = $2 WHERE id = $1", [id, users.owner.id]);
    const refused = await call('PUT', `/api/approvals/${id}/cancel`, { reason: 'late' });
    expect(refused.status).toBe(409);
    expect((await one('SELECT status FROM approval_requests WHERE id = $1', [id])).status).toBe('approved');
  });

  test('a role without approvals authority is refused on the internal and v1 surfaces', async () => {
    // A least-privilege role: ('approvals','view') only, no cancel grant (legacy blanket roles DO hold '*').
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ('ax-viewer', $1, 'x', 'engineer') RETURNING id, token_version", [`ax-viewer-${tag}@test.io`]);
    const roleId = (await one('INSERT INTO roles (key, name, is_system) VALUES ($1, $1, false) RETURNING id', [`axr_${tag}`])).id;
    await db.query("INSERT INTO permissions (module, action) VALUES ('approvals', 'view') ON CONFLICT DO NOTHING");
    await db.query("INSERT INTO role_permissions (role_id, permission_id) SELECT $1, id FROM permissions WHERE module = 'approvals' AND action = 'view'", [roleId]);
    await db.query('INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, $2', [row.id, roleId]);
    const viewer = { token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
    const { id } = await makeStaleApproval({});
    expect((await call('PUT', `/api/approvals/${id}/cancel`, { reason: 'no' }, viewer.token)).status).toBe(403);
    expect((await call('PUT', `/api/v1/approvals/${id}/cancel`, { reason: 'no' }, viewer.token)).status).toBe(403);
    expect((await one('SELECT status FROM approval_requests WHERE id = $1', [id])).status).toBe('pending');
    // cleanup
    await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [row.id]);
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [row.id]);
    users.__extra = users.__extra || [];
    users.__extra.push(row.id);
  });

  test('the linked workflow instance is cancelled with the approval', async () => {
    const { id } = await makeStaleApproval({ module_name: 'purchase_orders' });
    const instance = (await one(
      `INSERT INTO workflow_instances (template_id, template_key, entity_type, entity_id, legacy_approval_id, status, requester_id)
       SELECT t.id, t.key, 'legacy_approval', $1, $1, 'active', $2
         FROM workflow_templates t ORDER BY t.id LIMIT 1 RETURNING id`,
      [id, users.owner.id]
    ));
    await db.query("UPDATE workflow_step_instances SET status = 'pending' WHERE instance_id = $1", [instance.id]);
    await call('PUT', `/api/approvals/${id}/cancel`, { reason: 'stale' });
    expect((await one('SELECT status FROM workflow_instances WHERE id = $1', [instance.id])).status).toBe('cancelled');
    expect((await one('SELECT count(*)::int n FROM workflow_step_instances WHERE instance_id = $1 AND status = $2', [instance.id, 'pending'])).n).toBe(0);
  });

  test('the dry-run report touches nothing and lists exactly the stale pending approvals', async () => {
    const stale = await makeStaleApproval({ module_name: 'legal', daysOld: 40 });
    const fresh = await makeStaleApproval({ module_name: 'legal', daysOld: 1 });
    const report = await call('GET', `/api/approvals/stale?older_than_days=30`, null, users.owner.token);
    expect(report.status).toBe(200);
    const listed = report.body.data.rows.map((r) => r.id);
    expect(listed).toContain(stale.id);
    expect(listed).not.toContain(fresh.id);
    // dry run changed nothing
    expect((await one('SELECT status FROM approval_requests WHERE id = $1', [stale.id])).status).toBe('pending');
    expect((await one('SELECT status FROM approval_requests WHERE id = $1', [fresh.id])).status).toBe('pending');
  });
});
