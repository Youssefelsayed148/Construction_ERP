// Real PostgreSQL + real app. Phase 1.3: a project-bound user (assigned to project A only) must not read,
// change, delete or transition project B's records on any surface: internal API, /api/v1 and MCP.
// Reproduced first (all of the "denied" rows below were 200 before the fix):
//   * policy.recordScopeRule keyed on req.route.path, which the v1 remount and MCP synthetic requests never set,
//     so every record-id route skipped record scoping there;
//   * projects.js phase/milestone UPDATE/DELETE and subcontractors certificate/verification routes had no project filter;
//   * the `agents` scope rule did not match the /api/agent mount;
//   * the project list returned every project (budget and contract value included) to project-bound users.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('record scoping across surfaces (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let mcp;
  const tag = String(Date.now()).slice(-8);
  const ids = {};
  const users = {};

  const call = async (method, path, token, body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* empty */ }
    return { status: res.status, body: json };
  };
  const denied = (r) => [401, 403, 404].includes(r.status);
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];

  const makeUser = async (key, role, projectId) => {
    const id = (await one(
      "INSERT INTO users (name, email, password, role) VALUES ($1, $2, 'x', $3) RETURNING id", [`rsc-${key}`, `rsc-${key}-${tag}@test.io`, role]
    )).id;
    await db.query('INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, $2, id FROM roles WHERE key = $3', [id, projectId, role]);
    users[key] = { id, name: `rsc-${key}`, role, token: tokens.signSession({ userId: id }) };
  };

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    mcp = require('../../services/mcpService');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;

    for (const k of ['A', 'B']) {
      ids[`p${k}`] = (await one("INSERT INTO projects (name, name_en, code, budget) VALUES ($1, $1, $2, 1000000) RETURNING id", [`Scope ${k}`, `SC${k}${tag}`])).id;
    }
    const client = (await one("INSERT INTO clients (name_ar, name_en) VALUES ('c', 'c') RETURNING id")).id;
    ids.client = client;
    for (const k of ['A', 'B']) {
      const p = ids[`p${k}`];
      ids[`inv${k}`] = (await one(
        "INSERT INTO invoices (invoice_number, project_id, client_id, amount, issue_date) VALUES ($1, $2, $3, 100, CURRENT_DATE) RETURNING id", [`SC-INV-${k}-${tag}`, p, client]
      )).id;
      ids[`phase${k}`] = (await one("INSERT INTO project_phases (project_id, name, name_ar) VALUES ($1, 'ph', 'ph') RETURNING id", [p])).id;
      ids[`ms${k}`] = (await one("INSERT INTO project_milestones (project_id, title) VALUES ($1, 'ms') RETURNING id", [p])).id;
      const sub = (await one("INSERT INTO subcontractors (name) VALUES ($1) RETURNING id", [`sub-${k}-${tag}`])).id;
      ids[`sc${k}`] = (await one("INSERT INTO sub_contracts (contract_number, project_id, subcontractor_id, contract_value) VALUES ($1, $2, $3, 1000) RETURNING id", [`SC-${k}-${tag}`, p, sub])).id;
      ids[`cert${k}`] = (await one("INSERT INTO sub_payment_certificates (certificate_number, sub_contract_id) VALUES ($1, $2) RETURNING id", [`SCPC-${k}-${tag}`, ids[`sc${k}`]])).id;
      ids[`ver${k}`] = (await one("INSERT INTO sub_work_verifications (sub_contract_id) VALUES ($1) RETURNING id", [ids[`sc${k}`]])).id;
      ids[`rfq${k}`] = (await one("INSERT INTO rfqs (title, project_id) VALUES ('rfq', $1) RETURNING id", [p])).id;
    }
    await makeUser('engA', 'engineer', ids.pA);
    await makeUser('finA', 'finance_manager', ids.pA);
    await makeUser('owner', 'owner', null);
    ids.actB = (await one("INSERT INTO action_items (source_type, title, project_id) VALUES ('manual', 'scope action', $1) RETURNING id", [ids.pB])).id;
    ids.reqB = (await one(
      "INSERT INTO agent_action_requests (tool, operation, requesting_user_id, project_id, execution_status, payload, required_approver_role) VALUES ('close_project', '{}', $1, $2, 'awaiting_approval', '{}', 'finance_manager') RETURNING id", [users.owner.id, ids.pB]
    )).id;
  });

  afterAll(async () => {
    const uids = Object.values(users).map((u) => u.id);
    await db.query('DELETE FROM agent_action_requests WHERE id = $1', [ids.reqB]);
    await db.query('DELETE FROM action_items WHERE id = $1', [ids.actB]);
    await db.query('DELETE FROM user_project_roles WHERE user_id = ANY($1) OR granted_by = ANY($1)', [uids]);
    await db.query('UPDATE users SET is_active = false WHERE id = ANY($1)', [uids]);
    for (const k of ['A', 'B']) {
      await db.query('DELETE FROM rfqs WHERE id = $1', [ids[`rfq${k}`]]);
      await db.query('DELETE FROM sub_work_verifications WHERE id = $1', [ids[`ver${k}`]]);
      await db.query('DELETE FROM sub_payment_certificates WHERE id = $1', [ids[`cert${k}`]]);
      await db.query('DELETE FROM sub_contracts WHERE id = $1', [ids[`sc${k}`]]);
      await db.query('DELETE FROM project_milestones WHERE id = $1', [ids[`ms${k}`]]);
      await db.query('DELETE FROM project_phases WHERE id = $1', [ids[`phase${k}`]]);
      await db.query('DELETE FROM invoices WHERE id = $1', [ids[`inv${k}`]]);
    }
    await db.query('DELETE FROM projects WHERE id = ANY($1)', [[ids.pA, ids.pB]]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  describe.each([['internal', '/api'], ['v1', '/api/v1']])('%s API', (surface, prefix) => {
    const isV1 = surface === 'v1';
    const path = (internal, v1) => (isV1 ? `${prefix}${v1}` : `${prefix}${internal}`);

    test('control: the user can use their own project\'s records', async () => {
      const r = await call('GET', path(`/invoices/${ids.invA}`, `/invoices/${ids.invA}`), users.engA.token);
      expect(r.status).toBe(200);
      const ph = await call('PUT', path(`/projects/${ids.pA}/phases/${ids.phaseA}`, `/projects/${ids.pA}/phases/${ids.phaseA}`), users.engA.token, { status: 'active' });
      expect(ph.status).toBe(200);
    });

    test('another project\'s invoice cannot be read, changed or transitioned', async () => {
      const rd = await call('GET', path(`/invoices/${ids.invB}`, `/invoices/${ids.invB}`), users.engA.token);
      expect(denied(rd)).toBe(true);
      const up = await call('PUT', path(`/invoices/${ids.invB}`, `/invoices/${ids.invB}`), users.engA.token, { description: 'hijacked' });
      expect(denied(up)).toBe(true);
      const tr = await call('POST', path(`/finance-ledger/invoices/${ids.invB}/transition`, `/invoices/${ids.invB}/transition`), users.engA.token, { to: 'approved' });
      expect(denied(tr)).toBe(true);
      expect((await one('SELECT description, status FROM invoices WHERE id = $1', [ids.invB]))).toMatchObject({ description: null });
    });

    test('a phase or milestone of another project cannot be changed or deleted through your own project id', async () => {
      const upPhase = await call('PUT', path(`/projects/${ids.pA}/phases/${ids.phaseB}`, `/projects/${ids.pA}/phases/${ids.phaseB}`), users.engA.token, { status: 'completed' });
      expect([404, 403]).toContain(upPhase.status);
      const upMs = await call('PUT', path(`/projects/${ids.pA}/milestones/${ids.msB}`, `/projects/${ids.pA}/milestones/${ids.msB}`), users.engA.token, { status: 'achieved' });
      expect([404, 403]).toContain(upMs.status);
      await call('DELETE', path(`/projects/${ids.pA}/phases/${ids.phaseB}`, `/projects/${ids.pA}/phases/${ids.phaseB}`), users.engA.token);
      await call('DELETE', path(`/projects/${ids.pA}/milestones/${ids.msB}`, `/projects/${ids.pA}/milestones/${ids.msB}`), users.engA.token);
      expect((await one('SELECT status FROM project_phases WHERE id = $1', [ids.phaseB])).status).not.toBe('completed');
      expect((await one('SELECT count(*)::int AS n FROM project_phases WHERE id = $1', [ids.phaseB])).n).toBe(1);
      expect((await one('SELECT status FROM project_milestones WHERE id = $1', [ids.msB])).status).not.toBe('achieved');
      expect((await one('SELECT count(*)::int AS n FROM project_milestones WHERE id = $1', [ids.msB])).n).toBe(1);
    });

    test('another project\'s subcontractor certificates and verifications are out of reach', async () => {
      const cert = await call('PUT', path(`/subcontractors/certificates/${ids.certB}`, `/subcontracts/certificates/${ids.certB}`), users.engA.token, { status: 'certified' });
      expect(denied(cert)).toBe(true);
      const ver = await call('PUT', path(`/subcontractors/verifications/${ids.verB}`, `/subcontracts/verifications/${ids.verB}`), users.engA.token, { status: 'approved' });
      expect(denied(ver)).toBe(true);
      const listCerts = await call('GET', path(`/subcontractors/certificates/${ids.scB}`, `/subcontracts/${ids.scB}/certificates`), users.engA.token);
      expect(denied(listCerts)).toBe(true);
      const listVers = await call('GET', path(`/subcontractors/verifications/${ids.scB}`, `/subcontracts/${ids.scB}/verifications`), users.engA.token);
      expect(denied(listVers)).toBe(true);
      expect((await one('SELECT status FROM sub_payment_certificates WHERE id = $1', [ids.certB])).status).not.toBe('certified');
      expect((await one('SELECT status FROM sub_work_verifications WHERE id = $1', [ids.verB])).status).not.toBe('approved');
    });

    test('the project list shows only the user\'s own projects, with no other project\'s budget', async () => {
      const list = await call('GET', path('/projects', '/projects'), users.engA.token);
      expect(list.status).toBe(200);
      const rows = Array.isArray(list.body.data) ? list.body.data : list.body;
      const seen = rows.map((p) => p.id);
      expect(seen).toContain(ids.pA);
      expect(seen).not.toContain(ids.pB);
      if (!isV1) {
        const portfolio = await call('GET', '/api/projects/portfolio', users.engA.token);
        expect(portfolio.body.data.map((p) => p.id)).not.toContain(ids.pB);
      }
      const direct = await call('GET', path(`/projects/${ids.pB}`, `/projects/${ids.pB}`), users.engA.token);
      expect(denied(direct)).toBe(true);
      const owner = await call('GET', path('/projects', '/projects'), users.owner.token);
      expect((Array.isArray(owner.body.data) ? owner.body.data : owner.body).map((p) => p.id)).toEqual(expect.arrayContaining([ids.pA, ids.pB]));
    });
  });

  describe('agent requests (/api/agent)', () => {
    test('a project-bound approver cannot decide another project\'s request', async () => {
      const r = await call('POST', `/api/agent/requests/${ids.reqB}/decision`, users.finA.token, { decision: 'reject' });
      expect(denied(r)).toBe(true);
      expect((await one('SELECT decision FROM agent_action_requests WHERE id = $1', [ids.reqB])).decision).toBeNull();
    });
  });

  describe('MCP', () => {
    const run = (toolName, args, user = users.engA) => mcp.executeTool({ toolName, args, user: { id: user.id, name: user.name, role: user.role }, agentSession: 'rsc-test' });

    test('reads of another project\'s records are refused, and lists are filtered', async () => {
      const proj = await run('get_project', { id: ids.pB });
      expect(denied(proj)).toBe(true);
      const quotes = await run('compare_quotes', { rfq_id: ids.rfqB });
      expect(denied(quotes)).toBe(true);
      const list = await run('list_projects', {});
      const rows = (list.body && list.body.data) || [];
      expect(rows.map((p) => p.id)).not.toContain(ids.pB);
      // Completing work is a proposal now; when it is approved it still executes as the requester, who is
      // bound to project A, so project B's action stays untouched.
      const complete = await run('complete_action_with_evidence', { action_id: ids.actB, evidence: 'photo of the finished slab' });
      expect(complete.status).toBe(202);
      const decided = await mcp.decideRequest(complete.request.id, { id: users.owner.id, role: 'owner' }, 'approve');
      expect(decided.execution.status).toBe(403);
      expect((await one('SELECT status FROM action_items WHERE id = $1', [ids.actB])).status).not.toBe('completed');
      const own = await run('get_project', { id: ids.pA });
      expect(own.status).toBe(200);
    });
  });
});
