process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
const db = require('../../config/database');
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('handover controlled-document links and warranty register (real PostgreSQL)', () => {
  const tag = String(Date.now()).slice(-7);
  const created = { projects: [], users: [], assets: [], documents: [], packageItems: [], assetDocuments: [], warranties: [] };
  let app; let server; let base; let owner; let scopedOwner; let project; let otherProject; let asset; let otherAsset; let document; let otherDocument; let packageItem; let emptyPackageItem;

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
    const globalUser = await row("INSERT INTO users (name,email,password,role,is_active) VALUES ($1,$2,'x','owner',true) RETURNING id,token_version", [`handover-${tag}`, `handover-${tag}@test.invalid`]);
    const scopedUser = await row("INSERT INTO users (name,email,password,role,is_active) VALUES ($1,$2,'x','owner',true) RETURNING id,token_version", [`handover-scoped-${tag}`, `handover-scoped-${tag}@test.invalid`]);
    created.users.push(globalUser.id, scopedUser.id);
    await db.query("INSERT INTO user_project_roles (user_id,project_id,role_id) SELECT $1,NULL,id FROM roles WHERE key='owner'", [globalUser.id]);
    owner = { token: tokens.signSession({ userId: globalUser.id, tokenVersion: globalUser.token_version || 0 }) };
    project = (await row("INSERT INTO projects (name,name_en,code,status) VALUES ($1,$1,$2,'active') RETURNING id", [`Handover ${tag}`, `HO${tag}A`])).id;
    otherProject = (await row("INSERT INTO projects (name,name_en,code,status) VALUES ($1,$1,$2,'active') RETURNING id", [`Handover other ${tag}`, `HO${tag}B`])).id;
    created.projects.push(project, otherProject);
    await db.query("INSERT INTO user_project_roles (user_id,project_id,role_id) SELECT $1,$2,id FROM roles WHERE key='owner'", [scopedUser.id, project]);
    scopedOwner = { token: tokens.signSession({ userId: scopedUser.id, tokenVersion: scopedUser.token_version || 0 }) };
    asset = (await row("INSERT INTO asset_register (project_id,asset_code,name) VALUES ($1,$2,'Chiller 1') RETURNING id", [project, `HO-AS-${tag}`])).id;
    otherAsset = (await row("INSERT INTO asset_register (project_id,asset_code,name) VALUES ($1,$2,'Foreign chiller') RETURNING id", [otherProject, `HO-AX-${tag}`])).id;
    created.assets.push(asset, otherAsset);
    document = (await row("INSERT INTO project_documents (project_id,title,document_type,file_url,portal_visibility,confidentiality) VALUES ($1,'Commissioning manual','other',$2,'internal','internal') RETURNING id", [project, `/uploads/handover-${tag}.pdf`])).id;
    otherDocument = (await row("INSERT INTO project_documents (project_id,title,document_type,file_url,portal_visibility,confidentiality) VALUES ($1,'Foreign manual','other',$2,'internal','internal') RETURNING id", [otherProject, `/uploads/handover-x-${tag}.pdf`])).id;
    created.documents.push(document, otherDocument);
    packageItem = (await row("INSERT INTO handover_package_items (project_id,item_type,title,status) VALUES ($1,'o_m_manuals','Chiller O&M manual','pending') RETURNING id", [project])).id;
    emptyPackageItem = (await row("INSERT INTO handover_package_items (project_id,item_type,title,status) VALUES ($1,'certificates','Unlinked evidence item','pending') RETURNING id", [project])).id;
    created.packageItems.push(packageItem, emptyPackageItem);
  });

  afterAll(async () => {
    if (created.warranties.length) await db.query('DELETE FROM warranties WHERE id = ANY($1::int[])', [created.warranties]);
    if (created.assetDocuments.length) await db.query('DELETE FROM asset_documents WHERE id = ANY($1::int[])', [created.assetDocuments]);
    if (created.packageItems.length) await db.query('DELETE FROM handover_package_items WHERE id = ANY($1::int[])', [created.packageItems]);
    if (created.documents.length) await db.query('DELETE FROM document_versions WHERE document_id = ANY($1::int[])', [created.documents]);
    if (created.documents.length) await db.query('DELETE FROM project_documents WHERE id = ANY($1::int[])', [created.documents]);
    if (created.assets.length) await db.query('DELETE FROM asset_register WHERE id = ANY($1::int[])', [created.assets]);
    if (created.projects.length) await db.query('DELETE FROM projects WHERE id = ANY($1::int[])', [created.projects]);
    if (created.users.length) await db.query('DELETE FROM user_project_roles WHERE user_id = ANY($1::int[])', [created.users]);
    if (created.users.length) await db.query('UPDATE users SET is_active = false WHERE id = ANY($1::int[])', [created.users]);
    if (server) await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('links package evidence and asset documents to controlled project documents', async () => {
    const packageLink = await call('PUT', `/api/handover/package/items/${packageItem}`, { project_document_id: document, status: 'uploaded' });
    expect(packageLink.status).toBe(200);
    expect(packageLink.body.data).toMatchObject({ project_document_id: document, status: 'uploaded', document_url: `/uploads/handover-${tag}.pdf` });
    const packageList = await call('GET', `/api/handover/package/${project}`);
    expect(packageList.body.data.items[0]).toMatchObject({ project_document_title: 'Commissioning manual', project_document_url: `/uploads/handover-${tag}.pdf` });

    const assetLink = await call('POST', `/api/handover/assets/${asset}/documents`, { project_document_id: document, document_type: 'manual' });
    expect(assetLink.status).toBe(201);
    created.assetDocuments.push(assetLink.body.data.id);
    const listed = await call('GET', `/api/handover/assets/${asset}/documents`);
    expect(listed.body.data[0]).toMatchObject({ document_type: 'manual', title: 'Commissioning manual', file_url: `/uploads/handover-${tag}.pdf` });
  });

  test('creates, reads expiry state, voids and reactivates standalone warranty records', async () => {
    const result = await call('POST', '/api/handover/warranties', {
      project_id: project, asset_id: asset, project_document_id: document, title: 'Chiller manufacturer warranty', issuer: 'Cooling Systems Ltd',
      coverage_description: 'Compressor and controls', start_date: '2026-01-01', end_date: '2028-01-01',
    });
    expect(result.status).toBe(201);
    created.warranties.push(result.body.data.id);
    expect(result.body.data).toMatchObject({ warranty_number: expect.stringMatching(/^WAR-/), asset_id: asset, project_document_id: document, start_date: '2026-01-01', end_date: '2028-01-01' });
    const listed = await call('GET', `/api/handover/warranties?project_id=${project}`);
    expect(listed.body.data[0]).toMatchObject({ title: 'Chiller manufacturer warranty', issuer: 'Cooling Systems Ltd', asset_code: `HO-AS-${tag}`, project_document_title: 'Commissioning manual', effective_status: 'active' });
    const expired = await call('POST', '/api/handover/warranties', {
      project_id: project, title: 'Expired pump coverage', issuer: 'Pump Works', start_date: '2020-01-01', end_date: '2021-01-01',
    });
    expect(expired.status).toBe(201);
    created.warranties.push(expired.body.data.id);
    const withExpired = await call('GET', `/api/handover/warranties?project_id=${project}`);
    expect(withExpired.body.data.find((warranty) => warranty.id === expired.body.data.id).effective_status).toBe('expired');
    const voided = await call('PUT', `/api/handover/warranties/${result.body.data.id}/status`, { status: 'void' });
    expect(voided.body.data.status).toBe('void');
    const reactivated = await call('PUT', `/api/handover/warranties/${result.body.data.id}/status`, { status: 'active' });
    expect(reactivated.body.data.status).toBe('active');
  });

  test('rejects cross-project document links and out-of-scope warranty reads', async () => {
    const missingEvidence = await call('PUT', `/api/handover/package/items/${emptyPackageItem}`, { status: 'uploaded' });
    expect(missingEvidence.status).toBe(400);
    expect(missingEvidence.body.error_code).toBe('handover_document_required');
    const badPackage = await call('PUT', `/api/handover/package/items/${packageItem}`, { project_document_id: otherDocument });
    expect(badPackage.status).toBe(400);
    expect(badPackage.body.error_code).toBe('handover_document_project_mismatch');
    const badAsset = await call('POST', `/api/handover/assets/${asset}/documents`, { project_document_id: otherDocument });
    expect(badAsset.status).toBe(400);
    expect(badAsset.body.error_code).toBe('handover_document_project_mismatch');
    const badWarranty = await call('POST', '/api/handover/warranties', {
      project_id: project, asset_id: otherAsset, title: 'Foreign asset coverage', issuer: 'Issuer', start_date: '2026-01-01', end_date: '2027-01-01',
    });
    expect(badWarranty.status).toBe(400);
    expect(badWarranty.body.error_code).toBe('warranty_asset_project_mismatch');
    const outOfScope = await callAs(scopedOwner, 'GET', `/api/handover/warranties?project_id=${otherProject}`);
    expect(outOfScope.status).toBe(403);
  });
});
