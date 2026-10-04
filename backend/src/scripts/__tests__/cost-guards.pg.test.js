// Real PostgreSQL + real app. Closeout A2.4 (plan 3.1): no query turns a failure into a zero, and project cost
// totals have ONE definition (the v_project_cost_* views behind services/costView.js).
//
// Reproduced first (these failed on the pre-A2.4 code):
//   * every dashboard section, the commercial engine's commitment sync, the widget dashboards and the location
//     dashboard wrapped their queries in `.catch(() => ({ rows: [] }))` / `try { } catch { x = [] }`: a failing
//     query returned 200 with zeros, an empty list or a missing figure;
//   * dashboards, costing and the commercial engine each summed project_costs themselves.
//
// Each guard has a test: the query is forced to fail (the real query function is wrapped; a regex on the SQL
// decides which statement throws) and the endpoint must answer an error that names the failing part, never 200.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';

jest.mock('../../config/database', () => {
  const real = jest.requireActual('../../config/database');
  return {
    ...real,
    query: (sql, params) => {
      if (global.__forceFail && global.__forceFail.test(String(sql))) return Promise.reject(new Error('forced query failure'));
      return real.query(sql, params);
    },
  };
});

const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('A2.4 no catch-to-zero, one cost view (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let owner; let project; let location;
  const tag = String(Date.now()).slice(-7);
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const call = async (path) => {
    const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${owner.token}` } });
    let json = null;
    try { json = await res.json(); } catch (e) { /* empty */ }
    return { status: res.status, body: json };
  };
  const withFailure = async (pattern, fn) => {
    global.__forceFail = pattern;
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    try { return await fn(); } finally { global.__forceFail = null; errors.mockRestore(); }
  };

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ('cg-owner', $1, 'x', 'owner') RETURNING id, token_version", [`cg-${tag}@test.io`]);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [row.id]);
    owner = { id: row.id, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
    project = await one("INSERT INTO projects (name, name_en, code, status, budget, contract_value) VALUES ($1, $1, $2, 'active', 1000, 5000) RETURNING *", [`cg-${tag}`, `CG${tag}`.slice(0, 20)]);
    location = await one("INSERT INTO project_locations (project_id, code, name, name_en) VALUES ($1, $2, 'L', 'L') RETURNING id", [project.id, `L${tag}`]);
    // Cost rows from several sources, with and without a cost code.
    const code = await one("SELECT id FROM cost_codes WHERE code = '03'");
    const code2 = await one("SELECT id FROM cost_codes WHERE code = '11'");
    for (const [type, amount, cc] of [['grn', 400, code.id], ['expense', 75.5, null], ['labor_payment', 200, code2.id], ['material_issue', 50, code.id]]) {
      await db.query('INSERT INTO project_costs (project_id, cost_code_id, source_type, source_id, amount) VALUES ($1, $2, $3, $4, $5)',
        [project.id, cc, type, Number(String(Date.now()).slice(-6)) + Math.floor(Math.random() * 1000), amount]);
    }
  });

  afterAll(async () => {
    await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [owner.id]);
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [owner.id]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  // ---- one test per removed guard: a forced failure is an error, not a zero ----

  const DASHBOARD = [
    ['/api/dashboard', 'projects', /SELECT COUNT\(\*\) as cnt FROM projects/],
    ['/api/dashboard', 'clients', /SELECT COUNT\(\*\) as cnt FROM clients/],
    ['/api/dashboard', 'items', /SELECT COUNT\(\*\) as cnt FROM item_master/],
    ['/api/dashboard', 'assets', /SELECT COUNT\(\*\) as cnt FROM assets/],
    ['/api/dashboard', 'employees', /SELECT COUNT\(\*\) as cnt FROM employees/],
    ['/api/dashboard', 'subcontractors', /SELECT COUNT\(\*\) as cnt FROM subcontractors/],
    ['/api/dashboard/alerts', 'low_stock', /FROM warehouse_stock ws JOIN warehouses w/],
    ['/api/dashboard/alerts', 'overdue_milestones', /FROM project_milestones pm JOIN projects p/],
    ['/api/dashboard/alerts', 'budget_overruns', /SELECT p\.id, p\.name, p\.budget, p\.completion_percentage/],
    ['/api/dashboard/alerts', 'stale_site_reports', /as last_report_date/],
    ['/api/dashboard/alerts', 'overdue_rfis', /FROM project_rfis r JOIN projects p/],
    ['/api/dashboard/overview', 'projects', /COUNT\(\*\) FILTER \(WHERE status = 'planning'\)/],
    ['/api/dashboard/overview', 'projects_progress', /SELECT completion_percentage, contract_value, budget FROM projects/],
    ['/api/dashboard/overview', 'projects_at_risk', /AS at_risk/],
    ['/api/dashboard/overview', 'portfolio', /AS budget_total/],
    ['/api/dashboard/overview', 'finance', /AS collected/],
    ['/api/dashboard/overview', 'invoices', /COUNT\(\*\) FILTER \(WHERE status = 'sent'\)/],
    ['/api/dashboard/overview', 'expenses', /AS month_total/],
    ['/api/dashboard/overview', 'inventory', /AS low_stock/],
    ['/api/dashboard/overview', 'hr', /AS present_today/],
    ['/api/dashboard/overview', 'assets', /AS down/],
    ['/api/dashboard/overview', 'maintenance_due', /FROM maintenance_reminders/],
    ['/api/dashboard/overview', 'approvals', /AS awaiting_owner/],
    ['/api/dashboard/overview', 'directory', /AS legal_total/],
    ['/api/dashboard/portfolio', 'portfolio', /LEFT JOIN clients c ON p\.client_id/],
  ];
  test.each(DASHBOARD)('%s: a failing %s query answers 500 naming the section, never zeros', async (path, name, pattern) => {
    const healthy = await call(path);
    expect(healthy.status).toBe(200);
    const failed = await withFailure(pattern, () => call(path));
    expect(failed.status).toBe(500);
    expect(failed.body.success).toBe(false);
    expect(failed.body.error_code).toBe('dashboard_section_failed');
    expect(failed.body.error_params).toEqual({ section: name });
    expect(failed.body.data).toBeUndefined();
  });

  test('project dashboard: failing phases, milestones, costs and commercial reads each answer 500', async () => {
    const path = `/api/dashboard/project/${project.id}`;
    expect((await call(path)).status).toBe(200);
    for (const [name, pattern] of [['phases', /FROM project_phases/], ['milestones', /FROM project_milestones WHERE project_id/],
      ['costs', /FROM (project_costs|v_project_cost_totals)/], ['commercial', /FROM budget_changes/]]) {
      const failed = await withFailure(pattern, () => call(path));
      expect([name, failed.status]).toEqual([name, 500]);
      expect(failed.body.error_code).toBe('dashboard_section_failed');
    }
  });

  test('role dashboard: a failing widget query answers an error, not an empty widget', async () => {
    const path = '/api/dashboard/role';
    expect((await call(path)).status).toBe(200);
    const failed = await withFailure(/^SELECT \* FROM /, () => call(path));
    expect(failed.status).toBe(500);
    expect(failed.body.success).toBe(false);
  });

  test('commercial engine: failing purchase-order or sub-contract reads fail the profitability report', async () => {
    const path = `/api/costing/project/${project.id}/profitability`;
    expect((await call(path)).status).toBe(200);
    for (const pattern of [/FROM purchase_orders WHERE project_id/, /FROM sub_contracts WHERE project_id/]) {
      const failed = await withFailure(pattern, () => call(path));
      expect(failed.status).toBe(500);
      expect(failed.body.success).toBe(false);
    }
  });

  // The section queries used to name tables that do not exist (documents, qhse_records): the swallow hid that those
  // sections were permanently empty. They now read project_documents, ncrs and observations.
  test.each([
    ['measurements', /FROM quantity_measurements qm/], ['documents', /FROM project_documents/], ['ncrs', /FROM ncrs/],
    ['observations', /FROM observations/], ['cost', /FROM v_project_cost_totals/], ['labour', /FROM labor_payments lp/],
  ])('location dashboard: a failing %s query answers an error, not an empty section', async (name, pattern) => {
    const path = `/api/quantities/locations/${location.id}/dashboard`;
    const healthy = await call(path);
    expect(healthy.status).toBe(200);
    expect(healthy.body.data.documents).toEqual({ count: 0 });
    expect(healthy.body.data.qhse).toEqual({ ncr: 0, observations: 0 });
    const failed = await withFailure(pattern, () => call(path));
    expect([name, failed.status]).toEqual([name, 500]);
    expect(failed.body.success).toBe(false);
  });

  // ---- one cost view ----

  test('dashboards, costing and the commercial engine report the same project cost, from the cost view', async () => {
    const expected = 400 + 75.5 + 200 + 50;
    const view = await one('SELECT total_cost FROM v_project_cost_totals WHERE project_id = $1', [project.id]);
    expect(Number(view.total_cost)).toBe(expected);

    const portfolio = (await call('/api/dashboard/portfolio')).body.data.find((p) => p.id === project.id);
    expect(Number(portfolio.total_actual_cost)).toBe(expected);
    const dash = (await call(`/api/dashboard/project/${project.id}`)).body.data;
    expect(Number(dash.total_spent)).toBe(expected);
    const costing = (await call(`/api/costing/project/${project.id}`)).body.data;
    expect(costing.grand_total).toBe(expected);
    expect(costing.costs.reduce((s, r) => s + Number(r.amount), 0)).toBe(expected);
    expect(costing.summary_by_type.reduce((s, r) => s + Number(r.total), 0)).toBe(expected);
    const summary = (await call(`/api/costing/project/${project.id}/summary`)).body.data;
    expect(summary.reduce((s, r) => s + Number(r.actual), 0)).toBeLessThanOrEqual(expected); // rows without a cost code have no summary line
    expect(Number(summary.find((r) => r.code === '03').actual)).toBe(450);
    const profit = (await call(`/api/costing/project/${project.id}/profitability`)).body.data;
    expect(Number(profit.actual_cost)).toBe(expected);
    const locationDash = (await call(`/api/quantities/locations/${location.id}/dashboard`)).body.data;
    expect(Number(locationDash.cost.spent)).toBe(expected);
    // The overview's portfolio actual includes this project's cost too (and the unassigned bucket).
    const overview = (await call('/api/dashboard/overview')).body.data;
    expect(overview.health.portfolio_actual).toBeGreaterThanOrEqual(expected);
  });

  test('a project with no cost rows has zero cost (a fact, not a swallowed failure)', async () => {
    const empty = await one("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`cg-e-${tag}`, `CE${tag}`.slice(0, 20)]);
    const costing = (await call(`/api/costing/project/${empty.id}`)).body.data;
    expect(costing.grand_total).toBe(0);
    expect((await call(`/api/dashboard/project/${empty.id}`)).body.data.total_spent).toBe(0);
  });
});
