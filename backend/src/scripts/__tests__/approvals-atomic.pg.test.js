// Real PostgreSQL + real app. Phase 2.8: an approval request and its workflow instance are created together or not at
// all, and a decision on a legacy approval is serialised so a request is decided exactly once.
//
// Reproduced first:
//  - POST /api/approvals/request inserted the approval_requests row, then started the workflow in a try/catch that
//    only logged: when the workflow could not start (for example no matching template or an unknown module) the request
//    existed with no workflow instance, nobody could act on it and verify-approval-parity reported it.
//  - recordLegacyDecision read the request without a lock: N parallel approvals each saw it pending.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('2.8 approvals (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let engine; let owner; let manager;
  const tag = String(Date.now()).slice(-7);
  const made = [];
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const call = async (user, method, path, body) => {
    const res = await fetch(`${base}${path}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` }, body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* empty */ }
    return { status: res.status, body: json };
  };
  const mkUser = async (key, role) => {
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ($1, $2, 'x', $3) RETURNING id, token_version", [`ap-${key}`, `ap-${key}-${tag}@test.io`, role]);
    await db.query('INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = $2', [row.id, role]);
    return { id: row.id, role, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
  };
  const request = async (type) => {
    const r = await call(owner, 'POST', '/api/approvals/request', { module_name: 'expenses', request_type: type, request_id: Number(tag) * 10 + made.length });
    made.push(r.body && r.body.request && r.body.request.id);
    return r;
  };
  const statuses = (results) => results.map((r) => r.status).sort();

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    engine = require('../../services/workflowEngine');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    owner = await mkUser('owner', 'owner');
    manager = await mkUser('manager', 'finance_manager');
  });
  afterAll(async () => {
    for (const u of [owner, manager]) {
      await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [u.id]);
      await db.query('UPDATE users SET is_active = false WHERE id = $1', [u.id]);
    }
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('a request and its workflow instance exist together', async () => {
    const r = await request('atomic-ok');
    expect(r.status).toBe(200);
    const inst = await one('SELECT id, status FROM workflow_instances WHERE legacy_approval_id = $1', [r.body.request.id]);
    expect(inst && inst.status).toBe('active');
  });

  test('when the workflow cannot start, no request row is left behind and the caller is told', async () => {
    const before = (await one("SELECT count(*)::int n FROM approval_requests WHERE request_type = 'atomic-fail'")).n;
    await db.query("UPDATE workflow_templates SET key = 'legacy_module_approval_off' WHERE key = 'legacy_module_approval'");
    try {
      const r = await call(owner, 'POST', '/api/approvals/request', { module_name: 'expenses', request_type: 'atomic-fail', request_id: Number(tag) * 10 + 99 });
      expect(r.status).toBe(500);
      expect((await one("SELECT count(*)::int n FROM approval_requests WHERE request_type = 'atomic-fail'")).n).toBe(before);
    } finally {
      await db.query("UPDATE workflow_templates SET key = 'legacy_module_approval' WHERE key = 'legacy_module_approval_off'");
    }
  });

  test('a module no workflow handles is refused up front', async () => {
    const r = await call(owner, 'POST', '/api/approvals/request', { module_name: `nothing-${tag}`, request_type: 'x', request_id: 1 });
    expect(r.status).toBe(400);
    expect((await one('SELECT count(*)::int n FROM approval_requests WHERE module_name = $1', [`nothing-${tag}`])).n).toBe(0);
  });

  test('parallel approvals decide each stage exactly once and the legacy row matches the engine', async () => {
    const r = await request('race-approve');
    const id = r.body.request.id;
    const inst = await one('SELECT id FROM workflow_instances WHERE legacy_approval_id = $1', [id]);

    const managerRound = await Promise.all(Array.from({ length: 6 }, () => call(manager, 'PUT', `/api/approvals/${id}/approve`, { notes: 'ok' })));
    expect(managerRound.filter((x) => x.status === 200)).toHaveLength(1);
    expect(managerRound.every((x) => x.status < 500)).toBe(true);
    expect((await one("SELECT count(*)::int n FROM workflow_actions WHERE instance_id = $1 AND step_key = 'manager_review'", [inst.id])).n).toBe(1);

    const ownerRound = await Promise.all(Array.from({ length: 6 }, () => call(owner, 'PUT', `/api/approvals/${id}/approve`, { notes: 'final' })));
    expect(ownerRound.filter((x) => x.status === 200)).toHaveLength(1);
    expect(ownerRound.every((x) => x.status < 500)).toBe(true);
    expect((await one("SELECT count(*)::int n FROM workflow_actions WHERE instance_id = $1 AND step_key = 'owner_review'", [inst.id])).n).toBe(1);
    expect((await one('SELECT status FROM approval_requests WHERE id = $1', [id])).status).toBe('approved');
    expect((await one('SELECT status FROM workflow_instances WHERE id = $1', [inst.id])).status).toBe('approved');
  });

  test('an approve and a reject racing for one request: one wins and both records agree', async () => {
    const r = await request('race-mixed');
    const id = r.body.request.id;
    await call(manager, 'PUT', `/api/approvals/${id}/approve`, {});
    const round = await Promise.all([
      ...Array.from({ length: 3 }, () => call(owner, 'PUT', `/api/approvals/${id}/approve`, {})),
      ...Array.from({ length: 3 }, () => call(owner, 'PUT', `/api/approvals/${id}/reject`, { notes: 'no' })),
    ]);
    expect(statuses(round).filter((s) => s === 200)).toHaveLength(1);
    const legacy = await one('SELECT status FROM approval_requests WHERE id = $1', [id]);
    const inst = await one('SELECT status FROM workflow_instances WHERE legacy_approval_id = $1', [id]);
    expect(['approved', 'rejected']).toContain(legacy.status);
    expect(inst.status).toBe(legacy.status);
  });

  describe('migration 0017 links unambiguous orphan instances', () => {
    const sql = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'migrations', '0017_link_approval_workflows.sql'), 'utf8');
    test('links an instance whose context names a request nobody else claims; leaves one that has a decided twin', async () => {
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        const tpl = (await client.query("SELECT id FROM workflow_templates WHERE key = 'legacy_module_approval'")).rows[0].id;
        const mkRequest = async (n) => (await client.query("INSERT INTO approval_requests (module_name, request_type, request_id, status, stage) VALUES ('expenses', $1, $2, 'pending', 'manager_review') RETURNING id", [`m17-${n}`, Number(tag) + n])).rows[0].id;
        const mkInstance = async (legacyContextId, legacyColumn) => (await client.query(
          "INSERT INTO workflow_instances (template_id, template_key, entity_type, entity_id, context, current_step_key, status, legacy_approval_id) VALUES ($1, 'legacy_module_approval', 'expenses', 1, $2, 'manager_review', 'active', $3) RETURNING id",
          [tpl, JSON.stringify({ legacy_approval_id: legacyContextId }), legacyColumn])).rows[0].id;
        const lone = await mkRequest(1);
        const loneInstance = await mkInstance(lone, null);
        const twinned = await mkRequest(2);
        const stale = await mkInstance(twinned, null);
        const healed = await mkInstance(twinned, twinned); // the auto-heal twin that already claims the request
        await client.query(sql);
        const col = async (id) => (await client.query('SELECT legacy_approval_id FROM workflow_instances WHERE id = $1', [id])).rows[0].legacy_approval_id;
        expect(await col(loneInstance)).toBe(lone);
        expect(await col(stale)).toBeNull();
        expect(await col(healed)).toBe(twinned);
        await expect(client.query("INSERT INTO workflow_instances (template_id, template_key, entity_type, entity_id, status, legacy_approval_id) VALUES ($1, 'legacy_module_approval', 'expenses', 1, 'active', $2)", [tpl, lone]))
          .rejects.toMatchObject({ code: '23505' });
      } finally { await client.query('ROLLBACK'); client.release(); }
    });
  });

  test('every request created here has parity between the legacy row and the engine', async () => {
    const { mismatches } = await engine.verifyApprovalParity(db.query);
    const mine = mismatches.filter((m) => made.includes(m.legacy_id));
    expect(mine).toEqual([]);
  });
});
