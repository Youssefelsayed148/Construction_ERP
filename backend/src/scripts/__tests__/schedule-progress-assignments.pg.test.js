process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
const db = require('../../config/database');
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('schedule progress history and resource assignments (real PostgreSQL)', () => {
  const tag = String(Date.now()).slice(-7);
  const created = { projects: [], users: [], organizations: [], participants: [], employees: [], activities: [], assets: [], assignments: [] };
  let app; let server; let base; let owner; let scopedOwner; let project; let otherProject; let employee; let otherEmployee; let asset;

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
    const globalUser = await row("INSERT INTO users (name,email,password,role,is_active) VALUES ($1,$2,'x','owner',true) RETURNING id,token_version", [`schedule-${tag}`, `schedule-${tag}@test.invalid`]);
    const scopedUser = await row("INSERT INTO users (name,email,password,role,is_active) VALUES ($1,$2,'x','owner',true) RETURNING id,token_version", [`schedule-scoped-${tag}`, `schedule-scoped-${tag}@test.invalid`]);
    created.users.push(globalUser.id, scopedUser.id);
    await db.query("INSERT INTO user_project_roles (user_id,project_id,role_id) SELECT $1,NULL,id FROM roles WHERE key='owner'", [globalUser.id]);
    owner = { token: tokens.signSession({ userId: globalUser.id, tokenVersion: globalUser.token_version || 0 }) };
    project = (await row("INSERT INTO projects (name,name_en,code,status) VALUES ($1,$1,$2,'active') RETURNING id", [`Schedule ${tag}`, `SC${tag}A`])).id;
    otherProject = (await row("INSERT INTO projects (name,name_en,code,status) VALUES ($1,$1,$2,'active') RETURNING id", [`Schedule other ${tag}`, `SC${tag}B`])).id;
    created.projects.push(project, otherProject);
    await db.query("INSERT INTO user_project_roles (user_id,project_id,role_id) SELECT $1,$2,id FROM roles WHERE key='owner'", [scopedUser.id, project]);
    scopedOwner = { token: tokens.signSession({ userId: scopedUser.id, tokenVersion: scopedUser.token_version || 0 }) };
    const organization = (await row("INSERT INTO organizations (code,name_en,name_ar,org_type) VALUES ($1,$1,$1,'internal') RETURNING id", [`sc-${tag}`])).id;
    const otherOrganization = (await row("INSERT INTO organizations (code,name_en,name_ar,org_type) VALUES ($1,$1,$1,'internal') RETURNING id", [`scx-${tag}`])).id;
    created.organizations.push(organization, otherOrganization);
    const participant = (await row("INSERT INTO project_participants (project_id,organization_id,participant_type) VALUES ($1,$2,'internal_team_member') RETURNING id", [project, organization])).id;
    const otherParticipant = (await row("INSERT INTO project_participants (project_id,organization_id,participant_type) VALUES ($1,$2,'internal_team_member') RETURNING id", [otherProject, otherOrganization])).id;
    created.participants.push(participant, otherParticipant);
    employee = (await row("INSERT INTO employees (code,name,name_en,status) VALUES ($1,$2,$2,'active') RETURNING id", [`SC-E-${tag}`, 'Project employee'])).id;
    otherEmployee = (await row("INSERT INTO employees (code,name,name_en,status) VALUES ($1,$2,$2,'active') RETURNING id", [`SC-X-${tag}`, 'Other project employee'])).id;
    created.employees.push(employee, otherEmployee);
    await db.query('INSERT INTO project_participant_users (project_participant_id,employee_id) VALUES ($1,$2),($3,$4)', [participant, employee, otherParticipant, otherEmployee]);
    const first = (await row("INSERT INTO schedule_activities (project_id,activity_code,name,planned_start,planned_finish,original_duration,planned_quantity,created_by) VALUES ($1,$2,'Foundation','2026-03-01','2026-03-11',10,100,$3) RETURNING id", [project, `SC-A-${tag}`, globalUser.id])).id;
    const second = (await row("INSERT INTO schedule_activities (project_id,activity_code,name,planned_start,planned_finish,original_duration,planned_quantity,created_by) VALUES ($1,$2,'Structure','2026-03-01','2026-03-11',10,100,$3) RETURNING id", [project, `SC-B-${tag}`, globalUser.id])).id;
    const foreign = (await row("INSERT INTO schedule_activities (project_id,activity_code,name,created_by) VALUES ($1,$2,'Foreign activity',$3) RETURNING id", [otherProject, `SC-X-${tag}`, globalUser.id])).id;
    created.activities.push(first, second, foreign);
    asset = (await row("INSERT INTO asset_register (project_id,asset_code,name,created_by) VALUES ($1,$2,'Tower crane',$3) RETURNING id", [project, `SC-AS-${tag}`, globalUser.id])).id;
    created.assets.push(asset);
  });

  afterAll(async () => {
    if (created.assignments.length) await db.query('DELETE FROM schedule_activity_assignments WHERE id = ANY($1::int[])', [created.assignments]);
    if (created.activities.length) await db.query('DELETE FROM schedule_progress_updates WHERE schedule_activity_id = ANY($1::int[])', [created.activities]);
    if (created.activities.length) await db.query('DELETE FROM schedule_activities WHERE id = ANY($1::int[])', [created.activities]);
    if (created.assets.length) await db.query('DELETE FROM asset_register WHERE id = ANY($1::int[])', [created.assets]);
    if (created.participants.length) await db.query('DELETE FROM project_participant_users WHERE project_participant_id = ANY($1::int[])', [created.participants]);
    if (created.participants.length) await db.query('DELETE FROM project_participants WHERE id = ANY($1::int[])', [created.participants]);
    if (created.projects.length) await db.query('DELETE FROM projects WHERE id = ANY($1::int[])', [created.projects]);
    if (created.users.length) await db.query('DELETE FROM user_project_roles WHERE user_id = ANY($1::int[])', [created.users]);
    if (created.users.length) await db.query('UPDATE users SET is_active = false WHERE id = ANY($1::int[])', [created.users]);
    if (created.employees.length) await db.query('DELETE FROM employees WHERE id = ANY($1::int[])', [created.employees]);
    if (created.organizations.length) await db.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [created.organizations]);
    if (server) await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('records attributed progress updates without overwriting history', async () => {
    const activityId = created.activities[0];
    const first = await call('POST', `/api/schedule/activities/${activityId}/progress`, { percent_complete: 25, data_date: '2026-07-06', notes: 'First measurement' });
    expect(first.status).toBe(200);
    const second = await call('POST', `/api/schedule/activities/${activityId}/progress`, { percent_complete: 40, data_date: '2026-07-13', notes: 'Follow-up' });
    expect(second.status).toBe(200);
    const history = await call('GET', `/api/schedule/activities/${activityId}/progress-history`);
    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(2);
    expect(history.body.data[0]).toMatchObject({ previous_percent_complete: '25.00', percent_complete: '40.00', data_date: '2026-07-13', notes: 'Follow-up', created_by_name: `schedule-${tag}` });
    expect(history.body.data[1]).toMatchObject({ previous_percent_complete: '0.00', percent_complete: '25.00', data_date: '2026-07-06', notes: 'First measurement' });
  });

  test('uses the current baseline for SPI by default, even when the live plan changes', async () => {
    await db.query("UPDATE projects SET earned_value_enabled = false WHERE id = $1", [project]);
    await db.query("UPDATE schedule_activities SET planned_start = '2026-03-01', planned_finish = '2026-03-11' WHERE id = $1", [created.activities[0]]);
    await db.query("UPDATE schedule_activities SET planned_start = '2026-03-01', planned_finish = '2026-03-11' WHERE id = $1", [created.activities[1]]);
    await db.query('UPDATE schedule_activities SET percent_complete = 50 WHERE id = $1', [created.activities[0]]);
    await db.query('UPDATE schedule_activities SET percent_complete = 0 WHERE id = $1', [created.activities[1]]);
    const baseline = [
      { id: created.activities[0], planned_start: '2026-03-01', planned_finish: '2026-03-11', planned_quantity: 100 },
      { id: created.activities[1], planned_start: '2026-03-06', planned_finish: '2026-03-16', planned_quantity: 100 },
    ];
    await db.query('INSERT INTO baselines (project_id,name,data,is_current,created_by) VALUES ($1,$2,$3::jsonb,true,$4)',
      [project, `KPI baseline ${tag}`, JSON.stringify(baseline), owner.userId || null]);

    const response = await call('GET', `/api/schedule/schedule/kpis?project_id=${project}&data_date=2026-03-06`);
    expect(response.status).toBe(200);
    expect(response.body.data.spi_source).toBe('current_baseline');
    // Baseline PV is 50 units and EV is also 50; the changed live plan would yield 0.5.
    expect(response.body.data.spi).toBe(1);
  });

  test('accepts project team and project asset assignments, rejects overlaps and foreign resources', async () => {
    const assignment = await call('POST', `/api/schedule/activities/${created.activities[0]}/assignments`, {
      employee_id: employee, assigned_from: '2026-08-01', assigned_to: '2026-08-10', allocation_percent: 60,
    });
    expect(assignment.status).toBe(201);
    created.assignments.push(assignment.body.data.id);
    const assetAssignment = await call('POST', `/api/schedule/activities/${created.activities[1]}/assignments`, {
      asset_register_id: asset, assigned_from: '2026-08-01', assigned_to: '2026-08-02',
    });
    expect(assetAssignment.status).toBe(201);
    created.assignments.push(assetAssignment.body.data.id);
    const overlap = await call('POST', `/api/schedule/activities/${created.activities[1]}/assignments`, {
      employee_id: employee, assigned_from: '2026-08-10', assigned_to: '2026-08-14',
    });
    expect(overlap.status).toBe(409);
    expect(overlap.body.error_code).toBe('schedule_assignment_date_overlap');
    expect((await call('PUT', `/api/schedule/assignments/${assignment.body.data.id}/status`, { status: 'active' })).status).toBe(200);
    expect((await call('PUT', `/api/schedule/assignments/${assignment.body.data.id}/status`, { status: 'completed' })).status).toBe(200);
    const reallocated = await call('POST', `/api/schedule/activities/${created.activities[1]}/assignments`, {
      employee_id: employee, assigned_from: '2026-08-01', assigned_to: '2026-08-10',
    });
    expect(reallocated.status).toBe(201);
    created.assignments.push(reallocated.body.data.id);
    const invalidTransition = await call('PUT', `/api/schedule/assignments/${assignment.body.data.id}/status`, { status: 'active' });
    expect(invalidTransition.status).toBe(409);
    expect(invalidTransition.body.error_code).toBe('schedule_assignment_transition_invalid');
    const foreign = await call('POST', `/api/schedule/activities/${created.activities[0]}/assignments`, {
      employee_id: otherEmployee, assigned_from: '2026-08-15', assigned_to: '2026-08-16',
    });
    expect(foreign.status).toBe(400);
    expect(foreign.body.error_code).toBe('schedule_assignment_resource_project_mismatch');
    const listed = await call('GET', `/api/schedule/activities/${created.activities[0]}/assignments`);
    expect(listed.body.data[0]).toMatchObject({ employee_id: employee, employee_name: 'Project employee', allocation_percent: '60.00' });
  });

  test('hides progress history and resources from out-of-project callers', async () => {
    const foreignActivity = created.activities[2];
    expect((await callAs(scopedOwner, 'GET', `/api/schedule/activities/${foreignActivity}/progress-history`)).status).toBe(403);
    expect((await callAs(scopedOwner, 'GET', `/api/schedule/activities/${foreignActivity}/assignments`)).status).toBe(403);
    expect((await callAs(scopedOwner, 'GET', `/api/schedule/resources?project_id=${otherProject}`)).status).toBe(403);
  });
});
