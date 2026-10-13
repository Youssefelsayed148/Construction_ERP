process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
const db = require('../../config/database');
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('QA/QC certificate register (real PostgreSQL)', () => {
  const tag = String(Date.now()).slice(-7);
  const created = { projects: [], users: [], certificates: [], documents: [], mirs: [] };
  let app; let server; let base; let owner; let scopedOwner; let project; let otherProject; let documentId; let otherDocumentId; let mirId; let otherMirId;

  const row = async (sql, params) => (await db.query(sql, params)).rows[0];
  const call = async (method, path, body) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: body == null ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const callScoped = async (method, path, body) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${scopedOwner.token}` },
      body: body == null ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const user = await row("INSERT INTO users (name,email,password,role,is_active) VALUES ($1,$2,'x','owner',true) RETURNING id,token_version", [`qaqc-cert-${tag}`, `qaqc-cert-${tag}@test.invalid`]);
    created.users.push(user.id);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [user.id]);
    owner = { id: user.id, token: tokens.signSession({ userId: user.id, tokenVersion: user.token_version || 0 }) };
    project = (await row("INSERT INTO projects (name,name_en,code,status) VALUES ($1,$1,$2,'active') RETURNING id", [`QAQC cert ${tag}`, `QC${tag}A`])).id;
    otherProject = (await row("INSERT INTO projects (name,name_en,code,status) VALUES ($1,$1,$2,'active') RETURNING id", [`QAQC cert other ${tag}`, `QC${tag}B`])).id;
    created.projects.push(project, otherProject);
    const scopedUser = await row("INSERT INTO users (name,email,password,role,is_active) VALUES ($1,$2,'x','owner',true) RETURNING id,token_version", [`qaqc-cert-scoped-${tag}`, `qaqc-cert-scoped-${tag}@test.invalid`]);
    created.users.push(scopedUser.id);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, $2, id FROM roles WHERE key = 'owner'", [scopedUser.id, project]);
    scopedOwner = { id: scopedUser.id, token: tokens.signSession({ userId: scopedUser.id, tokenVersion: scopedUser.token_version || 0 }) };
    documentId = (await row('INSERT INTO project_documents (project_id,title,uploaded_by) VALUES ($1,$2,$3) RETURNING id', [project, `Certificate document ${tag}`, user.id])).id;
    otherDocumentId = (await row('INSERT INTO project_documents (project_id,title,uploaded_by) VALUES ($1,$2,$3) RETURNING id', [otherProject, `Foreign certificate document ${tag}`, user.id])).id;
    created.documents.push(documentId, otherDocumentId);
    mirId = (await row('INSERT INTO material_inspection_requests (project_id,mir_number) VALUES ($1,$2) RETURNING id', [project, `MIR-QC-${tag}-A`])).id;
    otherMirId = (await row('INSERT INTO material_inspection_requests (project_id,mir_number) VALUES ($1,$2) RETURNING id', [otherProject, `MIR-QC-${tag}-B`])).id;
    created.mirs.push(mirId, otherMirId);
  });

  afterAll(async () => {
    if (created.certificates.length) await db.query('DELETE FROM qaqc_certificates WHERE id = ANY($1::int[])', [created.certificates]);
    if (created.mirs.length) await db.query('DELETE FROM material_inspection_requests WHERE id = ANY($1::int[])', [created.mirs]);
    if (created.documents.length) await db.query('DELETE FROM project_documents WHERE id = ANY($1::int[])', [created.documents]);
    if (created.projects.length) await db.query('DELETE FROM projects WHERE id = ANY($1::int[])', [created.projects]);
    if (created.users.length) await db.query('DELETE FROM user_project_roles WHERE user_id = ANY($1::int[])', [created.users]);
    if (created.users.length) await db.query('UPDATE users SET is_active = false WHERE id = ANY($1::int[])', [created.users]);
    if (server) await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('registers and lists project-linked certificates and supports controlled status updates', async () => {
    const result = await call('POST', '/api/qhse/certificates', {
      project_id: project, certificate_type: 'material', title: 'Concrete test certificate', issuer: 'Lab A',
      issue_date: '2026-10-01', expiry_date: '2027-10-01', project_document_id: documentId, mir_id: mirId,
    });
    expect(result.status).toBe(201);
    created.certificates.push(result.body.data.id);
    expect(result.body.data.certificate_number).toMatch(/^QC-CERT-\d{5}$/);
    expect(result.body.data).toMatchObject({ project_id: project, project_document_id: documentId, mir_id: mirId, status: 'active', issue_date: '2026-10-01', expiry_date: '2027-10-01' });

    const listed = await call('GET', `/api/qhse/certificates?project_id=${project}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data.find((item) => item.id === result.body.data.id)).toMatchObject({
      document_title: `Certificate document ${tag}`, mir_number: `MIR-QC-${tag}-A`,
    });

    const updated = await call('PUT', `/api/qhse/certificates/${result.body.data.id}`, { status: 'superseded' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.status).toBe('superseded');
  });

  test('refuses links to documents and MIRs in another project', async () => {
    for (const payload of [
      { project_document_id: otherDocumentId },
      { mir_id: otherMirId },
    ]) {
      const result = await call('POST', '/api/qhse/certificates', {
        project_id: project, certificate_type: 'test', title: 'Invalid link', ...payload,
      });
      expect(result.status).toBe(400);
      expect(result.body.error_code).toMatch(/^certificate_(document|mir)_project_mismatch$/);
    }
  });

  test('keeps certificate reads and writes inside the user project assignment', async () => {
    const listed = await callScoped('GET', `/api/qhse/certificates?project_id=${otherProject}`);
    expect(listed.status).toBe(403);
    const createdInOtherProject = await callScoped('POST', '/api/qhse/certificates', {
      project_id: otherProject, certificate_type: 'test', title: 'Outside assignment',
    });
    expect(createdInOtherProject.status).toBe(403);
  });
});
