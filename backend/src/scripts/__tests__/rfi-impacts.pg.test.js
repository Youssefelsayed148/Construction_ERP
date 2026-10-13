process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
const db = require('../../config/database');
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('project RFI location, package and impact fields (real PostgreSQL)', () => {
  const tag = String(Date.now()).slice(-7);
  const created = { projects: [], users: [], rfis: [], locations: [], packages: [] };
  let app; let server; let base; let owner; let project; let otherProject; let location; let workPackage; let otherWorkPackage;

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
    const user = await row("INSERT INTO users (name,email,password,role,is_active) VALUES ($1,$2,'x','owner',true) RETURNING id,token_version", [`rfi-impact-${tag}`, `rfi-impact-${tag}@test.invalid`]);
    created.users.push(user.id);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [user.id]);
    owner = { id: user.id, token: tokens.signSession({ userId: user.id, tokenVersion: user.token_version || 0 }) };
    project = (await row("INSERT INTO projects (name,name_en,code,status) VALUES ($1,$1,$2,'active') RETURNING id", [`RFI impact ${tag}`, `RI${tag}A`])).id;
    otherProject = (await row("INSERT INTO projects (name,name_en,code,status) VALUES ($1,$1,$2,'active') RETURNING id", [`RFI impact other ${tag}`, `RI${tag}B`])).id;
    created.projects.push(project, otherProject);
    location = (await row("INSERT INTO project_locations (project_id,code,name,name_en) VALUES ($1,$2,$3,$3) RETURNING id", [project, `LOC-${tag}`, 'East tower'])).id;
    created.locations.push(location);
    workPackage = (await row("INSERT INTO work_packages (project_id,code,name) VALUES ($1,$2,$3) RETURNING id", [project, `WP-${tag}`, 'Concrete frame'])).id;
    otherWorkPackage = (await row("INSERT INTO work_packages (project_id,code,name) VALUES ($1,$2,$3) RETURNING id", [otherProject, `WP-X-${tag}`, 'Foreign package'])).id;
    created.packages.push(workPackage, otherWorkPackage);
  });

  afterAll(async () => {
    if (created.rfis.length) await db.query('DELETE FROM project_rfis WHERE id = ANY($1::int[])', [created.rfis]);
    if (created.locations.length) await db.query('DELETE FROM project_locations WHERE id = ANY($1::int[])', [created.locations]);
    if (created.packages.length) await db.query('DELETE FROM work_packages WHERE id = ANY($1::int[])', [created.packages]);
    if (created.projects.length) await db.query('DELETE FROM projects WHERE id = ANY($1::int[])', [created.projects]);
    if (created.users.length) await db.query('DELETE FROM user_project_roles WHERE user_id = ANY($1::int[])', [created.users]);
    if (created.users.length) await db.query('UPDATE users SET is_active = false WHERE id = ANY($1::int[])', [created.users]);
    if (server) await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('creates and reads scoped RFI context and both impact values', async () => {
    const result = await call('POST', '/api/docs/rfis', {
      project_id: project, subject: 'Beam penetration coordination', question: 'Confirm sleeve location.',
      project_location_id: location, work_package_id: workPackage, cost_impact: 1250.75, schedule_impact_days: 4,
    });
    expect(result.status).toBe(201);
    created.rfis.push(result.body.data.id);
    expect(result.body.data).toMatchObject({
      project_location_id: location, work_package_id: workPackage,
      cost_impact: '1250.75', schedule_impact_days: 4,
    });
    const listed = await call('GET', `/api/docs/rfis?project_id=${project}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data.find((item) => item.id === result.body.data.id)).toMatchObject({
      project_location_name: 'East tower', work_package_code: `WP-${tag}`,
      cost_impact: '1250.75', schedule_impact_days: 4,
    });
  });

  test('rejects a location or work package owned by a different project before insert', async () => {
    const before = Number((await row('SELECT count(*)::int AS count FROM project_rfis WHERE project_id = $1', [project])).count);
    const badLocation = await call('POST', '/api/docs/rfis', { project_id: project, subject: 'Bad location', project_location_id: 999999999 });
    expect(badLocation.status).toBe(400);
    expect(badLocation.body.error_code).toBe('rfi_location_project_mismatch');
    const badPackage = await call('POST', '/api/docs/rfis', { project_id: project, subject: 'Bad package', work_package_id: otherWorkPackage });
    expect(badPackage.status).toBe(400);
    expect(badPackage.body.error_code).toBe('rfi_work_package_project_mismatch');
    expect(Number((await row('SELECT count(*)::int AS count FROM project_rfis WHERE project_id = $1', [project])).count)).toBe(before);
  });
});
