// Real PostgreSQL + real app. Phase 5.2 - project setup (spec 05, 06):
//   1. migration 0033: tables/columns, one default calendar per project, the preflight stops with counts
//      and changes nothing, the exact backfill (code first, unique name second, ambiguity never guessed);
//   2. settings / calendars / WBS / work-package routes, error_code on every refusal;
//   3. registers (ITP, WIR, schedule activity, BOQ item) point at work_packages by FK;
//   4. role matrix on the internal API and /api/v1 (project-bound role stays in its project, external
//      roles and role-less users are denied);
//   5. wizard: advance percentage is not stored as an amount, team members get real role-template seats,
//      default reports are scheduled, provisioned workflows are real engine templates.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const fs = require('fs');
const path = require('path');
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('5.2 project setup (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db;
  const tag = String(Date.now()).slice(-8);
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const all = async (sql, params) => (await db.query(sql, params)).rows;
  const call = async (method, p, user, body) => {
    const res = await fetch(`${base}${p}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user && user.token ? user.token : ''}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* empty */ }
    return { status: res.status, body: json };
  };
  const users = {};
  const made = { projects: [] };
  let day = 0;
  const makeUser = async (key, userRole, grantRole = userRole, projectId = null) => {
    const row = await one(
      "INSERT INTO users (name, email, password, role) VALUES ($1, $2, 'x', $3) RETURNING id, token_version",
      [`ps-${key}`, `ps-${key}-${++day}-${tag}@test.io`, userRole]);
    if (grantRole) {
      await db.query('INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, $2, id FROM roles WHERE key = $3',
        [row.id, projectId, grantRole]);
    }
    users[key] = { id: row.id, role: userRole, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
    return users[key];
  };
  const makeProject = async (suffix) => {
    const id = (await one("INSERT INTO projects (name, name_en, code, status, budget) VALUES ($1, $1, $2, 'active', 1000) RETURNING id",
      [`ps ${suffix}`, `PS${tag}${suffix}`.slice(0, 20)])).id;
    made.projects.push(id);
    return id;
  };
  const migrationSql = fs.readFileSync(path.join(__dirname, '..', '..', 'migrations', '0033_project_setup.sql'), 'utf8');

  let pA; let pB;
  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    pA = await makeProject('A');
    pB = await makeProject('B');
    await makeUser('owner', 'owner');
    await makeUser('pmA', 'project_manager', 'project_manager', pA);   // project-bound seat
    await makeUser('storekeeper', 'storekeeper');                      // explicit grants, no projects.edit
    await makeUser('client', 'client', 'client', pA);                  // external
    await makeUser('fresh', 'staff', null);                            // no role rows at all
  });

  afterAll(async () => {
    const uids = [...new Set(Object.values(users).map((u) => u.id))];
    for (const pid of made.projects) {
      await db.query('DELETE FROM scheduled_reports WHERE project_id = $1', [pid]);
      await db.query('DELETE FROM project_costs WHERE project_id = $1', [pid]);
    }
    await db.query('DELETE FROM user_project_roles WHERE user_id = ANY($1)', [uids]);
    await db.query('UPDATE users SET is_active = false WHERE id = ANY($1)', [uids]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('1. migration: tables, columns, one default calendar per project, valid off days', async () => {
    for (const t of ['project_settings', 'project_calendars']) {
      expect((await one('SELECT count(*)::int n FROM information_schema.tables WHERE table_name = $1', [t])).n).toBe(1);
    }
    for (const [table, col] of [['itps', 'work_package_id'], ['wirs', 'work_package_id'], ['schedule_activities', 'work_package_id'],
      ['boq_items', 'work_package_id'], ['project_team', 'work_package_id'], ['work_packages', 'project_location_id']]) {
      expect((await one('SELECT count(*)::int n FROM information_schema.columns WHERE table_name = $1 AND column_name = $2', [table, col])).n).toBe(1);
    }
    await db.query("INSERT INTO project_calendars (project_id, name, is_default) VALUES ($1, 'c1', true)", [pA]);
    await expect(db.query("INSERT INTO project_calendars (project_id, name, is_default) VALUES ($1, 'c2', true)", [pA]))
      .rejects.toThrow(/uq_project_calendars_one_default/);
    await expect(db.query("INSERT INTO project_calendars (project_id, name, weekly_off_days) VALUES ($1, 'bad', '{9}')", [pA]))
      .rejects.toThrow(/project_calendars_off_days_valid/);
    await db.query('DELETE FROM project_calendars WHERE project_id = $1', [pA]);
  });

  test('2. migration preflight stops with counts and changes nothing; backfill is exact and never guesses', async () => {
    const c = await db.pool.connect();
    try {
      await c.query('BEGIN');
      const wpCode = (await c.query("INSERT INTO work_packages (project_id, code, name) VALUES ($1, 'WP-C', 'Concrete works') RETURNING id", [pA])).rows[0].id;
      const wpUnique = (await c.query("INSERT INTO work_packages (project_id, code, name) VALUES ($1, 'WP-U', 'Unique name pkg') RETURNING id", [pA])).rows[0].id;
      await c.query("INSERT INTO work_packages (project_id, code, name) VALUES ($1, 'WP-D1', 'Twin name')", [pA]);
      await c.query("INSERT INTO work_packages (project_id, code, name) VALUES ($1, 'WP-D2', 'Twin name')", [pA]);
      const itp = async (text) => (await c.query(
        "INSERT INTO itps (project_id, title, itp_number, work_package) VALUES ($1, 't', $2, $3) RETURNING id",
        [pA, `ITP-${tag}-${Math.random().toString(36).slice(2, 8)}`, text])).rows[0].id;
      const byCode = await itp('WP-C');
      const byName = await itp('Unique name pkg');
      const blank = await itp('   ');
      // clean data: backfill resolves code and unique name, leaves blanks alone
      await c.query(migrationSql);
      const rows = (await c.query('SELECT id, work_package_id FROM itps WHERE id = ANY($1)', [[byCode, byName, blank]])).rows;
      const idOf = (id) => rows.find((r) => r.id === id).work_package_id;
      expect(idOf(byCode)).toBe(wpCode);
      expect(idOf(byName)).toBe(wpUnique);
      expect(idOf(blank)).toBeNull();
      // dirty data: an ambiguous name and an unknown value stop the migration with counts
      await itp('Twin name');
      await itp('No such package');
      await c.query('SAVEPOINT pre');
      await expect(c.query(migrationSql)).rejects.toThrow(/preflight UNSAFE: 2 ITP\/WIR\/schedule row\(s\)/);
      await c.query('ROLLBACK TO SAVEPOINT pre');
      // nothing was changed by the refused run
      expect(idOf(byCode)).toBe(wpCode);
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });

  test('3. settings: read/write, key and size validation, error_code', async () => {
    const put = await call('PUT', `/api/projects/${pA}/settings`, users.owner, { settings: { 'advance.recovery_percent': 20, notes: { a: 1 } } });
    expect(put.status).toBe(200);
    expect(put.body.data['advance.recovery_percent']).toBe(20);
    const get = await call('GET', `/api/projects/${pA}/settings`, users.owner);
    expect(get.body.data.notes).toEqual({ a: 1 });
    const upd = await call('PUT', `/api/projects/${pA}/settings`, users.owner, { settings: { 'advance.recovery_percent': 25 } });
    expect(upd.body.data['advance.recovery_percent']).toBe(25);
    const badKey = await call('PUT', `/api/projects/${pA}/settings`, users.owner, { settings: { 'Bad Key': 1 } });
    expect(badKey.status).toBe(400);
    expect(badKey.body.error_code).toBe('setting_key_invalid');
    const big = await call('PUT', `/api/projects/${pA}/settings`, users.owner, { settings: { big: 'x'.repeat(9000) } });
    expect(big.body.error_code).toBe('setting_value_too_large');
    expect((await call('GET', '/api/projects/999999/settings', users.owner)).body.error_code).toBe('project_not_found');
  });

  test('4. calendars: first is the default, switching keeps exactly one, the default cannot be orphaned', async () => {
    const a = await call('POST', `/api/projects/${pB}/calendars`, users.owner, { name: 'Site 6-day', weekly_off_days: [5] });
    expect(a.status).toBe(201);
    expect(a.body.data.is_default).toBe(true);
    const b = await call('POST', `/api/projects/${pB}/calendars`, users.owner, { name: 'Office', is_default: true, holidays: [{ date: '2026-12-25', name: 'x' }] });
    expect(b.body.data.is_default).toBe(true);
    const list = await call('GET', `/api/projects/${pB}/calendars`, users.owner);
    expect(list.body.data.filter((c) => c.is_default)).toHaveLength(1);
    expect(list.body.data[0].id).toBe(b.body.data.id);
    const unset = await call('PUT', `/api/projects/${pB}/calendars/${b.body.data.id}`, users.owner, { is_default: false });
    expect(unset.status).toBe(409);
    expect(unset.body.error_code).toBe('calendar_default_required');
    const delDefault = await call('DELETE', `/api/projects/${pB}/calendars/${b.body.data.id}`, users.owner);
    expect(delDefault.body.error_code).toBe('calendar_default_required');
    const badDays = await call('POST', `/api/projects/${pB}/calendars`, users.owner, { name: 'x', weekly_off_days: [7] });
    expect(badDays.status).toBe(400);
    // a calendar of another project is not reachable through this one
    const foreign = await call('PUT', `/api/projects/${pA}/calendars/${a.body.data.id}`, users.owner, { name: 'hijack' });
    expect(foreign.body.error_code).toBe('calendar_not_found');
    expect((await call('DELETE', `/api/projects/${pB}/calendars/${a.body.data.id}`, users.owner)).status).toBe(200);
  });

  test('5. WBS and work packages: tree levels, duplicate codes, scoped refs, in-use refusal with counts', async () => {
    const root = await call('POST', `/api/projects/${pA}/wbs`, users.owner, { code: 'R', name: 'Root' });
    expect(root.status).toBe(201);
    expect(root.body.data.wbs_level).toBe(1);
    const child = await call('POST', `/api/projects/${pA}/wbs`, users.owner, { code: 'R.1', name: 'Structure', parent_id: root.body.data.id });
    expect(child.body.data.wbs_level).toBe(2);
    const dup = await call('POST', `/api/projects/${pA}/wbs`, users.owner, { code: 'R.1', name: 'again', parent_id: root.body.data.id });
    expect(dup.status).toBe(409);
    expect(dup.body.error_code).toBe('wbs_code_exists');
    // a node of another project cannot be a parent
    const otherNode = await call('POST', `/api/projects/${pB}/wbs`, users.owner, { code: 'X', name: 'B root' });
    const cross = await call('POST', `/api/projects/${pA}/wbs`, users.owner, { code: 'Y', name: 'bad', parent_id: otherNode.body.data.id });
    expect(cross.body.error_code).toBe('wbs_node_not_found');

    const wp = await call('POST', `/api/projects/${pA}/work-packages`, users.owner, { code: 'WP-1', name: 'Columns', wbs_node_id: child.body.data.id });
    expect(wp.status).toBe(201);
    expect((await call('POST', `/api/projects/${pA}/work-packages`, users.owner, { code: 'WP-1', name: 'dup' })).body.error_code).toBe('work_package_code_exists');
    expect((await call('POST', `/api/projects/${pA}/work-packages`, users.owner, { code: 'WP-2', name: 'x', wbs_node_id: otherNode.body.data.id })).body.error_code).toBe('wbs_node_not_found');
    expect((await call('POST', `/api/projects/${pA}/work-packages`, users.owner, { code: 'WP-3', name: 'x', project_location_id: 99999999 })).body.error_code).toBe('location_not_found');

    const inUseNode = await call('DELETE', `/api/projects/${pA}/wbs/${child.body.data.id}`, users.owner);
    expect(inUseNode.status).toBe(409);
    expect(inUseNode.body.error_params).toMatchObject({ children: 0, work_packages: 1 });
    // a schedule activity pointing at the package blocks its deletion
    const act = await call('POST', '/api/schedule/activities', users.owner, { project_id: pA, name: `act ${tag}`, work_package_id: wp.body.data.id });
    expect(act.status).toBe(201);
    const inUse = await call('DELETE', `/api/projects/${pA}/work-packages/${wp.body.data.id}`, users.owner);
    expect(inUse.status).toBe(409);
    expect(inUse.body.error_code).toBe('work_package_in_use');
    expect(inUse.body.error_params.links.schedule_activities).toBe(1);
    const listed = (await call('GET', `/api/projects/${pA}/work-packages`, users.owner)).body.data.find((w) => w.id === wp.body.data.id);
    expect(listed.activity_count).toBe(1);
    await db.query('DELETE FROM schedule_activities WHERE id = $1', [act.body.data.id]);
    expect((await call('DELETE', `/api/projects/${pA}/work-packages/${wp.body.data.id}`, users.owner)).status).toBe(200);
    expect((await call('DELETE', `/api/projects/${pA}/wbs/${child.body.data.id}`, users.owner)).status).toBe(200);
  });

  test('6. ITP, WIR, schedule activity and BOQ item point at work packages by FK', async () => {
    const wp = (await call('POST', `/api/projects/${pA}/work-packages`, users.owner, { code: `WP-L-${tag}`, name: `Linked ${tag}` })).body.data;
    const other = (await call('POST', `/api/projects/${pB}/work-packages`, users.owner, { code: `WP-O-${tag}`, name: `Other ${tag}` })).body.data;

    const itp = await call('POST', '/api/qhse/itps', users.owner, { project_id: pA, title: 'itp', work_package_id: wp.id });
    expect(itp.status).toBe(201);
    expect(itp.body.data.work_package_id).toBe(wp.id);
    expect(itp.body.data.work_package).toBe(wp.code);
    // free text still works when it names a real package (exact code or unique name), and it resolves to the FK
    const itpText = await call('POST', '/api/qhse/itps', users.owner, { project_id: pA, title: 'itp2', work_package: wp.name });
    expect(itpText.body.data.work_package_id).toBe(wp.id);
    // text that names nothing is refused, so no new row can bypass the FK
    const unmatched = await call('POST', '/api/qhse/itps', users.owner, { project_id: pA, title: 'itp3', work_package: 'no such package' });
    expect(unmatched.status).toBe(400);
    expect(unmatched.body.error_code).toBe('work_package_unmatched');
    // a package of another project is not reachable
    const foreign = await call('POST', '/api/qhse/itps', users.owner, { project_id: pA, title: 'itp4', work_package_id: other.id });
    expect(foreign.body.error_code).toBe('work_package_not_found');
    const upd = await call('PUT', `/api/qhse/itps/${itp.body.data.id}`, users.owner, { work_package_id: null, work_package: null });
    expect([upd.status, upd.body]).toMatchObject([200, { data: { work_package_id: null } }]);

    const wir = await call('POST', '/api/qhse/wirs', users.owner, { project_id: pA, work_package_id: wp.id });
    expect(wir.status).toBe(201);
    expect(wir.body.data.work_package_id).toBe(wp.id);

    const act = await call('POST', '/api/schedule/activities', users.owner, { project_id: pA, name: 'a1', work_package: wp.code });
    expect(act.body.data.work_package_id).toBe(wp.id);
    const moved = await call('PUT', `/api/schedule/activities/${act.body.data.id}`, users.owner, { work_package_id: null });
    expect(moved.body.data.work_package_id).toBeNull();

    const section = (await call('POST', '/api/boq/sections', users.owner, { project_id: pA, name_ar: 'قسم', name_en: 'Sec' })).body.data;
    const boq = await call('POST', '/api/boq/items', users.owner, { project_id: pA, section_id: section.id, description_ar: 'بند', work_package_id: wp.id });
    expect(boq.status).toBe(201);
    expect(boq.body.data.work_package_id).toBe(wp.id);
    expect((await call('PUT', `/api/boq/items/${boq.body.data.id}`, users.owner, { work_package_id: null })).body.data.work_package_id).toBeNull();

    await db.query('DELETE FROM wirs WHERE project_id = $1', [pA]);
    await db.query('DELETE FROM itps WHERE project_id = $1', [pA]);
    await db.query('DELETE FROM schedule_activities WHERE project_id = $1', [pA]);
    await db.query('DELETE FROM boq_items WHERE project_id = $1', [pA]);
    await db.query('DELETE FROM boq_sections WHERE project_id = $1', [pA]);
  });

  test('6b. a schedule CSV naming an unknown work package is refused before anything is deleted or written', async () => {
    const wp = (await call('POST', `/api/projects/${pB}/work-packages`, users.owner, { code: `WP-I-${tag}`, name: `Import ${tag}` })).body.data;
    const keep = (await call('POST', '/api/schedule/activities', users.owner, { project_id: pB, name: 'keep me', work_package_id: wp.id })).body.data;
    const header = 'activity_code,name,wbs_path,work_package,planned_start,planned_finish,original_duration,planned_quantity,percent_complete,is_milestone';
    const bad = await call('POST', '/api/schedule/activities/import', users.owner,
      { project_id: pB, replace: true, csv: `${header}
I1,fine,,${wp.code},,,3,,0,false
I2,broken,,NOPE-${tag},,,3,,0,false` });
    expect(bad.status).toBe(400);
    expect(bad.body.error_code).toBe('work_package_unmatched');
    const rows = await all('SELECT id, name FROM schedule_activities WHERE project_id = $1', [pB]);
    expect(rows).toEqual([{ id: keep.id, name: 'keep me' }]);   // replace=true did not wipe the schedule
    const good = await call('POST', '/api/schedule/activities/import', users.owner,
      { project_id: pB, replace: true, csv: `${header}
I1,fine,,${wp.code},,,3,,0,false` });
    expect(good.status).toBe(200);
    expect((await one('SELECT work_package_id FROM schedule_activities WHERE project_id = $1 AND activity_code = $2', [pB, 'I1'])).work_package_id).toBe(wp.id);
    await db.query('DELETE FROM schedule_activities WHERE project_id = $1', [pB]);
  });

  test('7. role matrix: internal API and /api/v1 agree', async () => {
    const targets = [
      ['GET', `/api/projects/${pA}/settings`, `/api/v1/projects/${pA}/settings`],
      ['GET', `/api/projects/${pA}/calendars`, `/api/v1/projects/${pA}/calendars`],
      ['GET', `/api/projects/${pA}/wbs`, `/api/v1/projects/${pA}/wbs`],
      ['GET', `/api/projects/${pA}/work-packages`, `/api/v1/projects/${pA}/work-packages`],
    ];
    // storekeeper holds projects.view in the seed (reads work), but no projects.create/edit (writes below are 403)
    const expectStatus = { owner: 200, pmA: 200, storekeeper: 200, client: 403, fresh: 403 };
    for (const [who, status] of Object.entries(expectStatus)) {
      for (const [method, internal, v1] of targets) {
        const a = await call(method, internal, users[who]);
        const b = await call(method, v1, users[who]);
        expect([who, internal, a.status]).toEqual([who, internal, status]);
        expect([who, v1, b.status === 401 ? 401 : b.status]).toEqual([who, v1, status]);
      }
    }
    // the project-bound seat stays inside its project, for reads and writes
    expect((await call('GET', `/api/projects/${pB}/work-packages`, users.pmA)).status).toBe(403);
    expect((await call('POST', `/api/projects/${pB}/work-packages`, users.pmA, { code: 'Z', name: 'z' })).status).toBe(403);
    expect((await call('PUT', `/api/projects/${pB}/settings`, users.pmA, { settings: { a: 1 } })).status).toBe(403);
    expect((await call('POST', `/api/projects/${pA}/work-packages`, users.storekeeper, { code: 'Z', name: 'z' })).status).toBe(403);
    expect((await call('POST', `/api/projects/${pA}/calendars`, users.client, { name: 'x' })).status).toBe(403);
  });

  test('8. wizard: advance percentage is not an amount, team seats are real, default reports exist, workflows are engine templates', async () => {
    const member = await makeUser('wizmember', 'site_engineer', 'site_engineer', null);
    const emp = (await one("INSERT INTO employees (code, name, email) VALUES ($1, 'Wiz Member', $2) RETURNING id",
      [`E${tag}`, `wizmember-${tag}@test.io`])).id;
    const res = await call('POST', '/api/projects/wizard', users.owner, {
      name_ar: `مشروع ${tag}`, name_en: `Wizard ${tag}`, contract_value: 1000000, advance_payment_percentage: 15,
      team: [{ employee_id: emp, user_id: member.id, role: 'site_engineer' }],
    });
    expect(res.status).toBe(201);
    const pid = res.body.data.id;
    made.projects.push(pid);
    const project = await one('SELECT advance_payment_amount, advance_payment_percentage FROM projects WHERE id = $1', [pid]);
    expect(Number(project.advance_payment_percentage)).toBe(15);
    expect(project.advance_payment_amount).toBeNull();
    // role assignment: a seat on THIS project for the template role, inheriting the role grants
    const seat = await one(`SELECT upr.project_id, r.key FROM user_project_roles upr JOIN roles r ON r.id = upr.role_id
                             WHERE upr.user_id = $1 AND upr.project_id = $2`, [member.id, pid]);
    expect(seat).toMatchObject({ project_id: pid, key: 'site_engineer' });
    expect(res.body.counts.role_assignments).toBeGreaterThanOrEqual(1);
    // default reports
    const reports = await all('SELECT report_key, frequency FROM scheduled_reports WHERE project_id = $1', [pid]);
    expect(reports.length).toBeGreaterThanOrEqual(2);
    expect(res.body.counts.default_reports).toBe(reports.length);
    // workflows: every provisioned code is an active engine template with steps
    const workflows = await all('SELECT workflow_code FROM project_workflows WHERE project_id = $1', [pid]);
    expect(workflows.length).toBeGreaterThanOrEqual(5);
    for (const w of workflows) {
      const t = await one(`SELECT t.id, (SELECT count(*)::int FROM workflow_steps s WHERE s.template_id = t.id) AS steps
                             FROM workflow_templates t WHERE t.key = $1 AND t.is_active`, [w.workflow_code]);
      expect([w.workflow_code, Boolean(t)]).toEqual([w.workflow_code, true]);
      expect(t.steps).toBeGreaterThan(0);
    }
  });
});
