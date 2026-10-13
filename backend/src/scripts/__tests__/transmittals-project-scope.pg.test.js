process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
const db = require('../../config/database');
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('transmittal project scope and item links (real PostgreSQL)', () => {
  const tag = String(Date.now()).slice(-7);
  const created = { projects: [], organizations: [], participants: [], users: [], documents: [], transmittals: [] };
  let app; let server; let base; let owner; let scopedOwner; let project; let otherProject; let recipient; let otherRecipient; let document; let otherDocument;

  const row = async (sql, params) => (await db.query(sql, params)).rows[0];
  const callAs = async (actor, method, path, body) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${actor.token}` },
      body: body == null ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const call = (method, path, body) => callAs(owner, method, path, body);

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const globalUser = await row("INSERT INTO users (name,email,password,role,is_active) VALUES ($1,$2,'x','owner',true) RETURNING id,token_version", [`transmittal-${tag}`, `transmittal-${tag}@test.invalid`]);
    const scopedUser = await row("INSERT INTO users (name,email,password,role,is_active) VALUES ($1,$2,'x','owner',true) RETURNING id,token_version", [`transmittal-scoped-${tag}`, `transmittal-scoped-${tag}@test.invalid`]);
    created.users.push(globalUser.id, scopedUser.id);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [globalUser.id]);
    owner = { token: tokens.signSession({ userId: globalUser.id, tokenVersion: globalUser.token_version || 0 }) };
    project = (await row("INSERT INTO projects (name,name_en,code,status) VALUES ($1,$1,$2,'active') RETURNING id", [`Transmittal ${tag}`, `TR${tag}A`])).id;
    otherProject = (await row("INSERT INTO projects (name,name_en,code,status) VALUES ($1,$1,$2,'active') RETURNING id", [`Transmittal other ${tag}`, `TR${tag}B`])).id;
    created.projects.push(project, otherProject);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, $2, id FROM roles WHERE key = 'owner'", [scopedUser.id, project]);
    scopedOwner = { token: tokens.signSession({ userId: scopedUser.id, tokenVersion: scopedUser.token_version || 0 }) };
    recipient = (await row("INSERT INTO organizations (code,name_en,name_ar,org_type) VALUES ($1,$1,$1,'client') RETURNING id", [`tr-${tag}-a`])).id;
    otherRecipient = (await row("INSERT INTO organizations (code,name_en,name_ar,org_type) VALUES ($1,$1,$1,'client') RETURNING id", [`tr-${tag}-b`])).id;
    created.organizations.push(recipient, otherRecipient);
    await db.query("INSERT INTO project_participants (project_id,organization_id,participant_type,portal_access_enabled) VALUES ($1,$2,'client',true),($3,$4,'client',true)", [project, recipient, otherProject, otherRecipient]);
    created.participants = (await db.query('SELECT id FROM project_participants WHERE project_id = ANY($1::int[])', [created.projects])).rows.map((r) => r.id);
    document = (await row("INSERT INTO project_documents (project_id,title,document_type,file_url,confidentiality,portal_visibility) VALUES ($1,'Project A drawing','drawing',$2,'public','internal') RETURNING id", [project, `/uploads/transmittal-${tag}-a.pdf`])).id;
    otherDocument = (await row("INSERT INTO project_documents (project_id,title,document_type,file_url,confidentiality,portal_visibility) VALUES ($1,'Project B drawing','drawing',$2,'public','internal') RETURNING id", [otherProject, `/uploads/transmittal-${tag}-b.pdf`])).id;
    created.documents.push(document, otherDocument);
  });

  afterAll(async () => {
    if (created.transmittals.length) await db.query('DELETE FROM transmittals WHERE id = ANY($1::int[])', [created.transmittals]);
    if (created.documents.length) await db.query('DELETE FROM project_documents WHERE id = ANY($1::int[])', [created.documents]);
    if (created.participants.length) await db.query('DELETE FROM project_participants WHERE id = ANY($1::int[])', [created.participants]);
    if (created.projects.length) await db.query('DELETE FROM projects WHERE id = ANY($1::int[])', [created.projects]);
    if (created.users.length) await db.query('DELETE FROM user_project_roles WHERE user_id = ANY($1::int[])', [created.users]);
    if (created.users.length) await db.query('UPDATE users SET is_active = false WHERE id = ANY($1::int[])', [created.users]);
    if (created.organizations.length) await db.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [created.organizations]);
    if (server) await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('creates and lists a transmittal with its project recipient and document item', async () => {
    const createdTransmittal = await call('POST', '/api/docs/transmittals', {
      project_id: project, purpose: 'For review', recipient_organization_id: recipient, items: [{ document_id: document }],
    });
    expect(createdTransmittal.status).toBe(201);
    const id = createdTransmittal.body.data.id;
    created.transmittals.push(id);
    const listed = await call('GET', `/api/docs/transmittals?project_id=${project}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data.find((t) => t.id === id)).toMatchObject({ recipient_organization_name: `tr-${tag}-a`, item_count: 1 });
    const detail = await call('GET', `/api/docs/transmittals/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.items[0]).toMatchObject({ document_id: document, document_title: 'Project A drawing' });
    const recipients = await call('GET', `/api/docs/transmittal-recipients?project_id=${project}`);
    expect(recipients.body.data.map((organization) => organization.id)).toContain(recipient);
  });

  test('rejects recipients and document items from another project', async () => {
    const badRecipient = await call('POST', '/api/docs/transmittals', { project_id: project, recipient_organization_id: otherRecipient });
    expect(badRecipient.status).toBe(400);
    expect(badRecipient.body.error_code).toBe('transmittal_recipient_project_mismatch');
    const badCreateItem = await call('POST', '/api/docs/transmittals', { project_id: project, items: [{ document_id: otherDocument }] });
    expect(badCreateItem.status).toBe(400);
    expect(badCreateItem.body.error_code).toBe('transmittal_document_project_mismatch');
    const transmittalId = (await row('SELECT id FROM transmittals WHERE project_id = $1 ORDER BY id DESC LIMIT 1', [project])).id;
    const badAddedItem = await call('POST', `/api/docs/transmittals/${transmittalId}/items`, { document_id: otherDocument });
    expect(badAddedItem.status).toBe(400);
    expect(badAddedItem.body.error_code).toBe('transmittal_document_project_mismatch');
  });

  test('restricts project lists and transmittal details to the caller project scope', async () => {
    const globalTransmittal = await call('POST', '/api/docs/transmittals', { project_id: otherProject, purpose: 'Other project' });
    expect(globalTransmittal.status).toBe(201);
    created.transmittals.push(globalTransmittal.body.data.id);
    const list = await callAs(scopedOwner, 'GET', '/api/docs/transmittals');
    expect(list.status).toBe(200);
    expect(list.body.data.every((t) => t.project_id === project)).toBe(true);
    const crossProjectList = await callAs(scopedOwner, 'GET', `/api/docs/transmittals?project_id=${otherProject}`);
    expect(crossProjectList.status).toBe(403);
    const detail = await callAs(scopedOwner, 'GET', `/api/docs/transmittals/${globalTransmittal.body.data.id}`);
    expect(detail.status).toBe(403);
    const create = await callAs(scopedOwner, 'POST', '/api/docs/transmittals', { project_id: otherProject });
    expect(create.status).toBe(403);
  });
});
