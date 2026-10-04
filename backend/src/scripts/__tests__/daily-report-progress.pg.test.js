// Real PostgreSQL + real app. Closeout A2.6 (plan 3.4): measurements reach progress from every source, and the
// dashboards show the weighted figure.
//
// Reproduced first (these failed on the pre-A2.6 code):
//   * a site daily report carried no measurements at all: `source_type: 'daily_report'` was an allowed value
//     with nothing producing it, so quantities reported on site never reached measurements, schedule activities
//     or the project's progress;
//   * verifying a work completion approved its measurements and re-synced the allocations but never recomputed
//     the quantity-driven schedule activities or the project's derived progress (only the measurement routes did);
//   * the PM dashboard's progress was the plain mean of activity percents, and the portfolio and overview
//     averages were plain means of project percents: a one-day task counted like a one-year task, a small
//     contract like the main one.
//
// Rules: a daily report's measurements enter as `pending` (executed progress counts approved/certified
// quantities only, same as every other measurement source), in the report's transaction, validated against the
// report's project. Reviewing them (existing route) moves the activity and the project.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('A2.6 daily-report measurements and weighted progress (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let owner; let progressEngine; let widgets;
  const tag = String(Date.now()).slice(-7);
  let seq = 0;
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const all = async (sql, params) => (await db.query(sql, params)).rows;
  const call = async (method, path, body) => {
    const res = await fetch(`${base}${path}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` }, body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* empty */ }
    return { status: res.status, body: json };
  };

  // A project with a location, two BOQ items (A: 100 x 10, B: 900 x 10 => weights 1000 and 9000) and one
  // quantity-driven schedule activity on each (durations 10 and 90).
  const world = async () => {
    seq += 1;
    const key = `${tag}-${seq}`;
    const project = await one("INSERT INTO projects (name, name_en, code, status, contract_value) VALUES ($1, $1, $2, 'active', 10000) RETURNING *", [`dp-${key}`, `DP${key}`.slice(0, 20)]);
    const other = await one("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`dpo-${key}`, `DO${key}`.slice(0, 20)]);
    const location = await one('INSERT INTO project_locations (project_id, name) VALUES ($1, $2) RETURNING id', [project.id, `loc-${key}`]);
    const otherLocation = await one('INSERT INTO project_locations (project_id, name) VALUES ($1, $2) RETURNING id', [other.id, `oloc-${key}`]);
    const item = (code, qty) => one("INSERT INTO boq_items (project_id, code, description, unit, quantity, unit_rate) VALUES ($1, $2, $2, 'm2', $3, 10) RETURNING id", [project.id, code, qty]);
    const itemA = await item('A', 100);
    const itemB = await item('B', 900);
    const otherItem = await one("INSERT INTO boq_items (project_id, code, description, unit, quantity, unit_rate) VALUES ($1, 'X', 'x', 'm2', 50, 10) RETURNING id", [other.id]);
    const activity = (boq, qty, duration, code) => one(
      `INSERT INTO schedule_activities (project_id, activity_code, name, original_duration, planned_quantity, progress_source, boq_item_id, project_location_id, status)
       VALUES ($1, $2, $2, $3, $4, 'quantity', $5, $6, 'planned') RETURNING id`, [project.id, code, duration, qty, boq.id, location.id]);
    const actA = await activity(itemA, 100, 10, `A-${key}`);
    const actB = await activity(itemB, 900, 90, `B-${key}`);
    return { key, project, other, location, otherLocation, itemA, itemB, otherItem, actA, actB };
  };
  const percent = async (table, id) => Number((await one(`SELECT ${table === 'projects' ? 'completion_percentage' : 'percent_complete'} AS p FROM ${table} WHERE id = $1`, [id])).p);
  const report = (w, body) => call('POST', `/api/projects/${w.project.id}/site-reports`, { report_date: '2026-10-02', work_summary: 'Slab poured', ...body });

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    progressEngine = require('../../services/progressEngine');
    widgets = require('../../services/dashboardWidgets');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ('dp-owner', $1, 'x', 'owner') RETURNING id, token_version", [`dp-${tag}@test.io`]);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [row.id]);
    owner = { id: row.id, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
  });

  afterAll(async () => {
    await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [owner.id]);
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [owner.id]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  // ---------------- daily report -> measurements -> activities -> project ----------------

  test('a daily report with quantities creates pending daily_report measurements, in the report\'s transaction', async () => {
    const w = await world();
    const created = await report(w, { measurements: [
      { project_location_id: w.location.id, boq_item_id: w.itemA.id, quantity: 40, unit: 'm2' },
      { project_location_id: w.location.id, boq_item_id: w.itemB.id, quantity: 90, unit: 'm2' },
    ] });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    const rows = await all("SELECT * FROM quantity_measurements WHERE source_type = 'daily_report' AND source_id = $1 ORDER BY boq_item_id", [id]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => [r.boq_item_id, Number(r.quantity), r.approval_state, r.project_id, r.measured_by])).toEqual([
      [w.itemA.id, 40, 'pending', w.project.id, owner.id], [w.itemB.id, 90, 'pending', w.project.id, owner.id]]);
    expect((await one('SELECT measured_date::text d FROM quantity_measurements WHERE id = $1', [rows[0].id])).d).toBe('2026-10-02');
    expect(rows[0].boq_location_allocation_id).not.toBeNull();
    // Same transaction as the report row.
    const xmin = async (sql, p) => (await one(sql, p)).x;
    expect(await xmin('SELECT xmin::text x FROM quantity_measurements WHERE id = $1', [rows[0].id])).toBe(await xmin('SELECT xmin::text x FROM site_daily_reports WHERE id = $1', [id]));
    // Pending quantities do not count as executed yet.
    expect(await percent('schedule_activities', w.actA.id)).toBe(0);
  });

  test('reviewing the daily-report measurements moves the quantity-driven activities and the project (no explicit PUT)', async () => {
    const w = await world();
    const created = await report(w, { measurements: [
      { project_location_id: w.location.id, boq_item_id: w.itemA.id, quantity: 100, unit: 'm2' },     // A complete
    ] });
    const [m] = await all("SELECT id FROM quantity_measurements WHERE source_type = 'daily_report' AND source_id = $1", [created.body.data.id]);
    expect((await call('POST', `/api/quantities/measurements/${m.id}/review`, { state: 'approved' })).status).toBe(200);
    expect(await percent('schedule_activities', w.actA.id)).toBe(100);
    expect(await percent('schedule_activities', w.actB.id)).toBe(0);
    // A is 1000 of the 10000 BOQ value: the project is 10%, not the 50% mean of its two activities.
    expect(await percent('projects', w.project.id)).toBe(10);
  });

  test('a measurement naming another project\'s BOQ item or location is refused and the report is not created', async () => {
    const w = await world();
    const before = Number((await one('SELECT count(*)::int n FROM site_daily_reports WHERE project_id = $1', [w.project.id])).n);
    for (const bad of [
      { project_location_id: w.location.id, boq_item_id: w.otherItem.id, quantity: 1 },
      { project_location_id: w.otherLocation.id, boq_item_id: w.itemA.id, quantity: 1 },
    ]) {
      const refused = await report(w, { measurements: [bad] });
      expect(refused.status).toBe(400);
      expect(refused.body.error_code).toBe('measurement_wrong_project');
    }
    expect(Number((await one('SELECT count(*)::int n FROM site_daily_reports WHERE project_id = $1', [w.project.id])).n)).toBe(before);
    expect(await all('SELECT id FROM quantity_measurements WHERE project_id = $1', [w.project.id])).toHaveLength(0);
  });

  test('editing a report replaces its pending measurements; reviewed ones lock them (409)', async () => {
    const w = await world();
    const created = await report(w, { measurements: [{ project_location_id: w.location.id, boq_item_id: w.itemA.id, quantity: 10 }] });
    const id = created.body.data.id;
    const edited = await call('PUT', `/api/projects/${w.project.id}/site-reports/${id}`, { measurements: [{ project_location_id: w.location.id, boq_item_id: w.itemA.id, quantity: 25 }] });
    expect(edited.status).toBe(200);
    const rows = await all("SELECT quantity, approval_state FROM quantity_measurements WHERE source_type = 'daily_report' AND source_id = $1", [id]);
    expect(rows.map((r) => Number(r.quantity))).toEqual([25]);
    // Once a reviewer has acted on one, the report's quantities are fixed.
    const [m] = await all("SELECT id FROM quantity_measurements WHERE source_type = 'daily_report' AND source_id = $1", [id]);
    await call('POST', `/api/quantities/measurements/${m.id}/review`, { state: 'approved' });
    const locked = await call('PUT', `/api/projects/${w.project.id}/site-reports/${id}`, { measurements: [{ project_location_id: w.location.id, boq_item_id: w.itemA.id, quantity: 99 }] });
    expect(locked.status).toBe(409);
    expect(locked.body.error_code).toBe('measurements_already_reviewed');
    expect((await all("SELECT quantity FROM quantity_measurements WHERE source_type = 'daily_report' AND source_id = $1", [id])).map((r) => Number(r.quantity))).toEqual([25]);
  });

  // ---------------- work completion path ----------------

  test('verifying a work completion moves the quantity-driven activity and the project, like the measurement routes', async () => {
    const w = await world();
    const wo = await one("INSERT INTO work_orders (project_id, title, status) VALUES ($1, 'dp wo', 'in_progress') RETURNING id", [w.project.id]);
    const completion = await one("INSERT INTO work_completions (work_order_id, boq_item_id, quantity_completed, status, project_location_id) VALUES ($1, $2, 100, 'pending', $3) RETURNING id", [wo.id, w.itemA.id, w.location.id]);
    const measured = await call('POST', '/api/quantities/measurements', {
      project_id: w.project.id, project_location_id: w.location.id, boq_item_id: w.itemA.id, measured_date: '2026-10-02', quantity: 100, unit: 'm2',
      source_type: 'work_completion', source_id: completion.id,
    });
    expect(measured.status).toBe(201);
    expect(await percent('schedule_activities', w.actA.id)).toBe(0);           // still pending
    expect((await call('PUT', `/api/work-orders/${wo.id}/completions/${completion.id}/verify`, { status: 'verified' })).status).toBe(200);
    expect(await percent('schedule_activities', w.actA.id)).toBe(100);
    expect(await percent('projects', w.project.id)).toBe(10);
  });

  // ---------------- weighted figures on the dashboards ----------------

  test('PM dashboard progress for a project is the weighted figure (BOQ value), not the mean of activity percents', async () => {
    const w = await world();
    const created = await report(w, { measurements: [{ project_location_id: w.location.id, boq_item_id: w.itemA.id, quantity: 100 }] });
    const [m] = await all("SELECT id FROM quantity_measurements WHERE source_type = 'daily_report' AND source_id = $1", [created.body.data.id]);
    await call('POST', `/api/quantities/measurements/${m.id}/review`, { state: 'approved' });
    const dash = await widgets.roleDashboard(db.query, { id: owner.id, role: 'project_manager' }, { projectId: w.project.id });
    const progress = dash.widgets.find((x) => x.key === 'progress');
    expect(progress.data.avg_percent).toBe(10);          // the plain mean of the activities (100 and 0) would be 50
    expect(progress.data.source).toBe('quantities');
  });

  test('without a project the PM figure weights schedule activities by duration', async () => {
    const w = await world();
    await db.query('UPDATE schedule_activities SET percent_complete = 100 WHERE id = $1', [w.actA.id]);
    const dash = await widgets.roleDashboard(db.query, { id: owner.id, role: 'project_manager' }, { projectId: null });
    const progress = dash.widgets.find((x) => x.key === 'progress');
    const rows = await all('SELECT original_duration, percent_complete FROM schedule_activities');
    const weighted = rows.reduce((s, r) => s + Number(r.original_duration || 0) * Number(r.percent_complete || 0), 0) / rows.reduce((s, r) => s + Number(r.original_duration || 0), 0);
    expect(progress.data.avg_percent).toBeCloseTo(Math.round(weighted * 10) / 10, 1);
  });

  test('portfolio progress weights projects by contract value; the widget and the overview agree', async () => {
    expect(progressEngine.weightedPortfolioProgress([
      { completion_percentage: 80, contract_value: 1000 }, { completion_percentage: 10, contract_value: 9000 },
    ])).toBeCloseTo(17, 5);                                                       // the plain mean would be 45
    expect(progressEngine.weightedPortfolioProgress([{ completion_percentage: 50, contract_value: 0, budget: 400 }, { completion_percentage: 100 }])).toBeCloseTo((50 * 400 + 100 * 1) / 401, 5);
    expect(progressEngine.weightedPortfolioProgress([])).toBe(0);

    await world();
    const active = await all("SELECT completion_percentage, contract_value, budget FROM projects WHERE status = 'active'");
    const expected = Math.round(progressEngine.weightedPortfolioProgress(active));
    const overview = (await call('GET', '/api/dashboard/overview')).body.data;
    expect(overview.modules.projects.avg_completion).toBe(expected);
    const everyone = await all('SELECT status, completion_percentage, contract_value, budget FROM projects');
    const dash = await widgets.roleDashboard(db.query, { id: owner.id, role: 'owner' }, {});
    const portfolio = dash.widgets.find((x) => x.key === 'portfolio');
    expect(portfolio.data.avg_completion).toBe(Math.round(progressEngine.weightedPortfolioProgress(everyone)));
  });

  // Closeout answer 3: pending quantities are shown separately, never mixed into the progress figure.
  test('the PM dashboard shows pending (unreviewed) quantities separately from the weighted progress', async () => {
    const w = await world();
    await report(w, { measurements: [
      { project_location_id: w.location.id, boq_item_id: w.itemA.id, quantity: 40 },
      { project_location_id: w.location.id, boq_item_id: w.itemB.id, quantity: 90 },
    ] });
    const dash = await widgets.roleDashboard(db.query, { id: owner.id, role: 'project_manager' }, { projectId: w.project.id });
    const progress = dash.widgets.find((x) => x.key === 'progress').data;
    expect(progress.avg_percent).toBe(0);                      // nothing approved yet
    expect(progress.pending).toEqual({ measurements: 2, quantity: 130 });
    const pendingWidget = dash.widgets.find((x) => x.key === 'pending_quantities');
    expect(pendingWidget.data).toEqual({ measurements: 2, quantity: 130 });
  });
});
