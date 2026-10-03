// Real PostgreSQL + real app. Phase 3.5: progress is derived from schedule tasks and measured
// quantities — never a free-typed number.
//
// Reproduced first (on the pre-3.5 code):
//   * projects.completion_percentage and project_phases.completion_percentage were hand-typed through
//     PUT with no permission beyond the generic edit, no audit and no link to measurements;
//   * a measurement approval did NOT move any activity or the project (schedule percent only recomputed
//     through an explicit PUT to /progress).
//
// The rule (docs/PROGRESS_DERIVATION.md, simplest defensible per the owner's brief):
//   quantity-weighted by BOQ value where quantities exist, otherwise duration-weighted from schedule
//   tasks; no source at all -> the stored value is left readable and untouched.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('3.5 derived progress (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let progressEngine; let engine;
  const tag = String(Date.now()).slice(-6) + Math.random().toString(36).slice(2, 5);
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const users = {};
  const ids = {};
  const call = async (method, path, body, token) => {
    const res = await fetch(`${base}${path}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || users.owner.token}` }, body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* empty */ }
    return { status: res.status, body: json };
  };

  const makeUser = async (key, userRole, grants = null) => {
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ($1, $2, 'x', $3) RETURNING id, name, token_version", [`pg-${key}`, `pg-${key}-${tag}@test.io`, userRole]);
    let roleId = (await one("SELECT id FROM roles WHERE key = $1", [userRole])).id;
    if (grants) {
      roleId = (await one('INSERT INTO roles (key, name, is_system) VALUES ($1, $1, false) RETURNING id', [`pgr_${key}_${tag}`])).id;
      for (const [module, action] of grants) {
        await db.query('INSERT INTO permissions (module, action) VALUES ($1, $2) ON CONFLICT (module, action) DO NOTHING', [module, action]);
        await db.query('INSERT INTO role_permissions (role_id, permission_id) SELECT $1, id FROM permissions WHERE module = $2 AND action = $3', [roleId, module, action]);
      }
    }
    await db.query('INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, $2', [row.id, roleId]);
    users[key] = { id: row.id, name: row.name, role: userRole, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
    return users[key];
  };

  // A project with two BOQ items and approved measurements. Values chosen so the quantity-weighted
  // result is exactly 30% (item A: 100 x 10 weight, 30% done; item B: 200 x 10 weight, 30% done).
  const makeProjectWithQuantities = async ({ executed = 30, planned = 100 }) => {
    const suffix = `${Math.random().toString(36).slice(2, 8)}`;
    const project = (await one("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`pg-p-${tag}`, `PGP${suffix}`])).id;
    const loc = (await one('INSERT INTO project_locations (project_id, name) VALUES ($1, $2) RETURNING id', [project, `pg-loc-${tag}`])).id;
    const itemA = (await one(
      "INSERT INTO boq_items (project_id, code, description, unit, quantity, unit_rate) VALUES ($1, 'A', 'a', 'm2', $2, 10) RETURNING id",
      [project, planned]
    )).id;
    const itemB = (await one(
      "INSERT INTO boq_items (project_id, code, description, unit, quantity, unit_rate) VALUES ($1, 'B', 'b', 'm2', $2, 10) RETURNING id",
      [project, planned]
    )).id;
    for (const boqItemId of [itemA, itemB]) {
      const r = await call('POST', '/api/quantities/measurements', {
        project_id: project, project_location_id: loc, boq_item_id: boqItemId,
        measured_date: '2026-06-01', quantity: executed, unit: 'm2',
      });
      await call('POST', `/api/quantities/measurements/${r.body.data.id}/review`, { state: 'approved' });
    }
    return { project, loc, itemA, itemB };
  };

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    progressEngine = require('../../services/progressEngine');
    engine = require('../../services/quantityEngine');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    await makeUser('owner', 'owner');
    // ('projects','edit') WITHOUT the override permission.
    await makeUser('editor', 'engineer', [['projects', 'edit'], ['projects', 'view']]);
    await makeUser('viewer', 'engineer', [['projects', 'view']]);
  });

  afterAll(async () => {
    const uids = Object.values(users).map((u) => u.id);
    await db.query('DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE key LIKE $1)', [`pgr_%_${tag}`]);
    await db.query('DELETE FROM roles WHERE key LIKE $1', [`pgr_%_${tag}`]);
    await db.query('DELETE FROM user_project_roles WHERE user_id = ANY($1)', [uids]);
    await db.query('UPDATE users SET is_active = false WHERE id = ANY($1)', [uids]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('a project with no quantities and no schedule tasks keeps its stored value (readable old data)', async () => {
    const project = (await one("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id, completion_percentage", [`pg-none-${tag}`, `PGN${tag}`.slice(0, 20)])).id;
    await db.query('UPDATE projects SET completion_percentage = 37 WHERE id = $1', [project]);
    const derived = await progressEngine.deriveProjectProgress(db.query, project);
    expect(derived.source).toBe('none');
    expect(derived.progress).toBeNull(); // nothing to derive from
    await progressEngine.syncProjectProgress(db.query, project);
    expect(Number((await one('SELECT completion_percentage FROM projects WHERE id = $1', [project])).completion_percentage)).toBe(37); // untouched, still readable
  });

  test('partial measured tasks give the quantity-weighted progress (BOQ value weights)', async () => {
    const { project } = await makeProjectWithQuantities({ executed: 30, planned: 100 });
    const derived = await progressEngine.deriveProjectProgress(db.query, project);
    expect(derived.source).toBe('quantities');
    expect(Number(derived.progress)).toBeCloseTo(30, 5); // both items 30% done, equal weights
    await progressEngine.syncProjectProgress(db.query, project);
    expect(Number((await one('SELECT completion_percentage FROM projects WHERE id = $1', [project])).completion_percentage)).toBeCloseTo(30, 5);
  });

  test('overrun quantities are capped at 100', async () => {
    const { project } = await makeProjectWithQuantities({ executed: 150, planned: 100 });
    const derived = await progressEngine.deriveProjectProgress(db.query, project);
    expect(Number(derived.progress)).toBe(100);
    await progressEngine.syncProjectProgress(db.query, project);
    expect(Number((await one('SELECT completion_percentage FROM projects WHERE id = $1', [project])).completion_percentage)).toBe(100);
  });

  test('a project with no quantities derives duration-weighted progress from its schedule tasks', async () => {
    const project = (await one("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`pg-sched-${tag}`, `PGS${tag}`.slice(0, 20)])).id;
    // durations 10 at 0%, 10 at 50%, 10 at 100% -> 50% duration-weighted; milestone (0 days) excluded.
    for (const [dur, pct] of [[10, 0], [10, 50], [10, 100]]) {
      await db.query(
        `INSERT INTO schedule_activities (project_id, activity_code, name, original_duration, percent_complete, status)
         VALUES ($1, $2, $3, $4, $5, 'planned')`,
        [project, `sw-${tag}-${pct}`, `sw-${tag}-${pct}`, dur, pct]
      );
    }
    await db.query(
      `INSERT INTO schedule_activities (project_id, activity_code, name, original_duration, percent_complete, is_milestone, status)
       VALUES ($1, $2, $3, 0, 100, true, 'planned')`,
      [project, `sw-milestone-${tag}`, `sw-milestone-${tag}`]
    );
    const derived = await progressEngine.deriveProjectProgress(db.query, project);
    expect(derived.source).toBe('schedule');
    expect(Number(derived.progress)).toBeCloseTo(50, 5);
    await progressEngine.syncProjectProgress(db.query, project);
    expect(Number((await one('SELECT completion_percentage FROM projects WHERE id = $1', [project])).completion_percentage)).toBeCloseTo(50, 5);
  });

  test('approving a measurement recomputes the quantity-driven schedule percent without any explicit PUT', async () => {
    const { project, itemA, loc } = await makeProjectWithQuantities({ executed: 10, planned: 100 });
    const activity = (await one(
      `INSERT INTO schedule_activities (project_id, activity_code, name, original_duration, planned_quantity, progress_source, boq_item_id, project_location_id, status)
       VALUES ($1, 'sw-act', 'sw act', 10, 100, 'quantity', $2, $3, 'planned') RETURNING id`,
      [project, itemA, loc]
    )).id;
    // 30% more approved on the linked BOQ item -> the activity recomputes from quantities.
    const r = await call('POST', '/api/quantities/measurements', {
      project_id: project, project_location_id: loc, boq_item_id: itemA,
      measured_date: '2026-06-02', quantity: 20, unit: 'm2',
    });
    expect(r.status).toBe(201);
    await call('POST', `/api/quantities/measurements/${r.body.data.id}/review`, { state: 'approved' });
    const activityRow = await one('SELECT percent_complete FROM schedule_activities WHERE id = $1', [activity]);
    expect(Number(activityRow.percent_complete)).toBeCloseTo(30, 5); // 30 of planned 100 approved, no PUT happened
    // ...and the project progress followed.
    expect(Number((await one('SELECT completion_percentage FROM projects WHERE id = $1', [project])).completion_percentage)).toBeGreaterThan(0);
  });

  test('the project-page payload exposes the derived progress after a measurement', async () => {
    const { project } = await makeProjectWithQuantities({ executed: 60, planned: 100 });
    await progressEngine.syncProjectProgress(db.query, project);
    const detail = await call('GET', `/api/projects/${project}`);
    expect(detail.status).toBe(200);
    expect(Number(detail.body.data.completion_percentage)).toBeCloseTo(60, 5);
  });

  test('manual overrides are blocked without the explicit permission, audited with it', async () => {
    const project = (await one("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`pg-ov-${tag}`, `PGO${tag}`.slice(0, 20)])).id;
    // editor holds ('projects','edit') but NOT override_progress.
    const denied = await call('PUT', `/api/projects/${project}`, { completion_percentage: 80 }, users.editor.token);
    expect(denied.status).toBe(403);
    // ...and the internal and v1 surfaces refuse identically.
    const deniedV1 = await call('PUT', `/api/v1/projects/${project}`, { completion_percentage: 80 }, users.editor.token);
    expect(deniedV1.status).toBe(403);
    // owner overrides, with an audit record
    const allowed = await call('PUT', `/api/projects/${project}`, { completion_percentage: 80 });
    expect(allowed.status).toBe(200);
    const audit = await one("SELECT description FROM activity_log WHERE entity_id = $1 AND action = 'override_progress' ORDER BY id DESC LIMIT 1", [project]);
    expect(audit).toBeTruthy();
    // the phase surface is gated the same way
    const phase = (await one('INSERT INTO project_phases (project_id, code, name, sort_order) VALUES ($1, $2, $2, 1) RETURNING id', [project, `PH-${tag}`])).id;
    const phaseDenied = await call('PUT', `/api/projects/${project}/phases/${phase}`, { completion_percentage: 50 }, users.editor.token);
    expect(phaseDenied.status).toBe(403);
    const phaseAllowed = await call('PUT', `/api/projects/${project}/phases/${phase}`, { completion_percentage: 50 });
    expect(phaseAllowed.status).toBe(200);
  });

  test('phase progress derives from its schedule activities (duration-weighted) and manual phase override is gated', async () => {
    const project = (await one("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`pg-ph-${tag}`, `PGPH${tag}`.slice(0, 20)])).id;
    const phase = (await one('INSERT INTO project_phases (project_id, code, name, sort_order) VALUES ($1, $2, $2, 1) RETURNING id', [project, `PH2-${tag}`])).id;
    for (const [dur, pct] of [[20, 25], [20, 75]]) {
      await db.query(
        `INSERT INTO schedule_activities (project_id, phase_id, activity_code, name, original_duration, percent_complete, status)
         VALUES ($1, $2, $3, $3, $4, $5, 'planned')`,
        [project, phase, `sw-ph-${tag}-${pct}`, dur, pct]
      );
    }
    await progressEngine.syncProjectProgress(db.query, project);
    const phaseRow = await one('SELECT completion_percentage FROM project_phases WHERE id = $1', [phase]);
    expect(Number(phaseRow.completion_percentage)).toBeCloseTo(50, 5);
  });
});
