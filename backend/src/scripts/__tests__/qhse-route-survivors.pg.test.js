'use strict';

process.env.AUTH_RATE_LIMIT_PER_15_MIN = '100000';
const tokens = require('../../services/tokens');
const describePg = process.env.TEST_PG === '1' ? describe : describe.skip;

describePg('R2b QHSE PUT survivors (real PostgreSQL)', () => {
  let db; let server; let base; let token; let owner; let project;
  const tag = `${Date.now()}-${process.pid}`;
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const call = async (path, body) => {
    const response = await fetch(`${base}/api/qhse${path}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  beforeAll(async () => {
    db = require('../../config/database');
    const { app } = require('../../../server');
    await new Promise(resolve => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    owner = await one("INSERT INTO users (name, email, password, role) VALUES ('qhse-owner', $1, 'unused', 'owner') RETURNING id, token_version", [`qhse-survivor-${tag}@test.invalid`]);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [owner.id]);
    token = tokens.signSession({ userId: owner.id, tokenVersion: owner.token_version });
    project = await one("INSERT INTO projects (name, code) VALUES ('qhse-survivor', $1) RETURNING id", [`QS${tag}`]);
  });
  afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
    await db.pool.end();
  });

  test.each(['/ncrs/:id', '/quality-tests/:id'])('exactly one registered PUT %s', path => {
    const router = require('../../routes/qhse');
    expect(router.stack.filter(layer => layer.route?.methods.put && layer.route.path === path)).toHaveLength(1);
  });

  test('NCR survivor updates severity with a single attributed before/after audit', async () => {
    const row = await one("INSERT INTO ncrs (ncr_number, project_id, description, severity) VALUES ($1, $2, 'survivor', 'minor') RETURNING *", [`QS-${tag}`, project.id]);
    const response = await call(`/ncrs/${row.id}`, { severity: 'major' });
    expect(response).toMatchObject({ status: 200, body: { data: { id: row.id, severity: 'major' } } });
    const audits = (await db.query("SELECT * FROM audit_events WHERE entity = 'ncr' AND entity_id = $1 AND action = 'update'", [row.id])).rows;
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ user_id: owner.id, before: { severity: 'minor' }, after: { severity: 'major' } });
    // Only the unreachable later handler accepted root_cause.
    expect((await call(`/ncrs/${row.id}`, { root_cause: 'unreachable field' })).status).toBe(400);
    await db.query("UPDATE ncrs SET status = 'closed' WHERE id = $1", [row.id]);
    expect((await call(`/ncrs/${row.id}`, { severity: 'critical' })).status).toBe(400);
    expect((await one('SELECT severity FROM ncrs WHERE id = $1', [row.id])).severity).toBe('major');
  });

  test('quality-test survivor updates result and attachments with a single audit', async () => {
    const row = await one("INSERT INTO quality_tests (project_id, test_type, result) VALUES ($1, 'survivor', 'pending') RETURNING *", [project.id]);
    const attachments = [{ name: 'report.pdf' }];
    expect(await call(`/quality-tests/${row.id}`, { result: 'pass', attachments })).toMatchObject({ status: 200, body: { data: { id: row.id, result: 'pass', attachments } } });
    const audits = (await db.query("SELECT * FROM audit_events WHERE entity = 'quality_test' AND entity_id = $1 AND action = 'update'", [row.id])).rows;
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ user_id: owner.id, before: { result: 'pending' }, after: { result: 'pass', attachments } });
    // Only the unreachable later handler accepted itp_id.
    expect((await call(`/quality-tests/${row.id}`, { itp_id: null })).status).toBe(400);
  });
});
