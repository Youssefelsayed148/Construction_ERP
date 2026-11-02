// Real PostgreSQL + real app. Adding a participant to an EXISTING project (owner decision 2026-11-02): typed errors, project-scoped
// authorization (team policy module), audit in the same transaction, and the portal legacy ids created/linked for an API-created organization.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const describePg = process.env.TEST_PG === '1' ? describe : describe.skip;

describePg('project participants (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; const users = {}; let project; let otherProject;
  const tag = String(Date.now()).slice(-7);
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const call = async (who, method, path, body) => {
    const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${users[who].token}` }, body: body ? JSON.stringify(body) : undefined });
    let json = null; try { json = await res.json(); } catch (e) { /* empty */ }
    return { status: res.status, body: json };
  };
  const mkUser = async (key, role, projectId) => {
    const row = await one('INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, token_version', [`pp-${key}`, `pp-${key}-${tag}@test.io`, 'x', role]);
    await db.query('INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, $2, id FROM roles WHERE key = $3', [row.id, projectId, role]);
    users[key] = { id: row.id, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
  };
  const org = (type, n) => one("INSERT INTO organizations (code, name_ar, name_en, org_type, status) VALUES ($1, $2, $2, $3, 'active') RETURNING id, code", [`PP-${tag}-${n}`, `PP org ${n}`, type]);

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    project = await one("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`pp-${tag}`, `PP${tag}`]);
    otherProject = await one("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`ppo-${tag}`, `PO${tag}`]);
    await mkUser('pm', 'project_manager', project.id);
    await mkUser('site', 'site_engineer', project.id);
  });
  afterAll(async () => {
    await db.query('UPDATE users SET is_active = false WHERE id = ANY($1)', [Object.values(users).map((u) => u.id)]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('project_manager adds a supplier: participant row, legacy supplier created + linked, audit written', async () => {
    const o = await org('supplier', 1);
    const r = await call('pm', 'POST', `/api/projects/${project.id}/participants`, { organization_id: o.id, participant_type: 'supplier' });
    expect(r.status).toBe(201);
    expect(r.body.data.legacy_supplier_id).not.toBeNull();
    const linked = await one('SELECT legacy_supplier_id FROM organizations WHERE id = $1', [o.id]);
    expect(linked.legacy_supplier_id).toBe(r.body.data.legacy_supplier_id);
    const sup = await one('SELECT organization_id, code FROM suppliers WHERE id = $1', [linked.legacy_supplier_id]);
    expect(sup.organization_id).toBe(o.id);
    expect(Number((await one("SELECT count(*)::int n FROM audit_events WHERE entity = 'project_participant' AND entity_id = $1", [r.body.data.id])).n)).toBe(1);
  });

  test('a client gets its legacy client id; a duplicate is 409 participant_exists; an unknown organization is 404', async () => {
    const o = await org('client', 2);
    const path = `/api/projects/${project.id}/participants`;
    const first = await call('pm', 'POST', path, { organization_id: o.id, participant_type: 'client' });
    expect(first.status).toBe(201);
    expect(first.body.data.legacy_client_id).not.toBeNull();
    const dup = await call('pm', 'POST', path, { organization_id: o.id, participant_type: 'client' });
    expect(dup.status).toBe(409);
    expect(dup.body.error_code).toBe('participant_exists');
    expect((await call('pm', 'POST', path, { organization_id: 99999999, participant_type: 'client' })).status).toBe(404);
    expect((await call('pm', 'POST', path, { organization_id: o.id, participant_type: 'nonsense' })).status).toBe(400);
  });

  test('forbidden: a site engineer cannot add participants, and a project manager cannot add them to another project', async () => {
    const o = await org('subcontractor', 3);
    expect((await call('site', 'POST', `/api/projects/${project.id}/participants`, { organization_id: o.id, participant_type: 'subcontractor' })).status).toBe(403);
    expect((await call('pm', 'POST', `/api/projects/${otherProject.id}/participants`, { organization_id: o.id, participant_type: 'subcontractor' })).status).toBe(403);
    expect(Number((await one('SELECT count(*)::int n FROM project_participants WHERE organization_id = $1', [o.id])).n)).toBe(0);
  });
});
