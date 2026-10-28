process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
const db = require('../../config/database');
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('controlled document issue and confidentiality fields (real PostgreSQL)', () => {
  const tag = String(Date.now()).slice(-7);
  const created = { projects: [], users: [], documents: [] };
  let app; let server; let base; let owner; let project;

  const row = async (sql, params) => (await db.query(sql, params)).rows[0];
  const call = async (method, path, body) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: body == null ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const user = await row("INSERT INTO users (name,email,password,role,is_active) VALUES ($1,$2,'x','owner',true) RETURNING id,token_version", [`doc-fields-${tag}`, `doc-fields-${tag}@test.invalid`]);
    created.users.push(user.id);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [user.id]);
    owner = { token: tokens.signSession({ userId: user.id, tokenVersion: user.token_version || 0 }) };
    project = (await row("INSERT INTO projects (name,name_en,code,status) VALUES ($1,$1,$2,'active') RETURNING id", [`Doc fields ${tag}`, `DF${tag}`])).id;
    created.projects.push(project);
  });

  afterAll(async () => {
    if (created.documents.length) await db.query('DELETE FROM document_versions WHERE document_id = ANY($1::int[])', [created.documents]);
    if (created.documents.length) await db.query('DELETE FROM project_documents WHERE id = ANY($1::int[])', [created.documents]);
    // Projects are never hard-deleted here (migration 0069 gave audit_events a project_id FK with no
    // delete path - every other PG test file leaves its project rows in the throwaway database and only
    // deactivates users, same as this fix; closeout T1, 2026-10-28).
    if (created.users.length) await db.query('DELETE FROM user_project_roles WHERE user_id = ANY($1::int[])', [created.users]);
    if (created.users.length) await db.query('UPDATE users SET is_active = false WHERE id = ANY($1::int[])', [created.users]);
    if (server) await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('stores issue date and classification in the controlled register', async () => {
    const result = await call('POST', '/api/docs/documents', {
      project_id: project, title: 'Issued structural drawing', document_type: 'drawing', doc_type: 'drawing',
      file_url: `/uploads/doc-fields-${tag}.pdf`, issue_date: '2026-10-12', review_due_date: '2026-11-12',
      confidentiality: 'public', portal_visibility: 'consultant',
    });
    expect(result.status).toBe(201);
    created.documents.push(result.body.data.id);
    expect(result.body.data).toMatchObject({
      issue_date: '2026-10-12', review_due_date: '2026-11-12', confidentiality: 'public', portal_visibility: 'consultant',
    });
    const listed = await call('GET', `/api/docs/registers?project_id=${project}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data.find((doc) => doc.id === result.body.data.id)).toMatchObject({ issue_date: '2026-10-12', confidentiality: 'public' });
  });

  test('rejects external visibility for a non-public document', async () => {
    const result = await call('POST', '/api/docs/documents', {
      project_id: project, title: 'Internal drawing', document_type: 'drawing',
      file_url: `/uploads/doc-fields-private-${tag}.pdf`, confidentiality: 'confidential', portal_visibility: 'consultant',
    });
    expect(result.status).toBe(400);
    expect(result.body.error_code).toBe('external_visibility_requires_public_confidentiality');
  });
});
