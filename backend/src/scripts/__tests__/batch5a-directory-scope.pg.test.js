const { scopedQuery } = require('../../services/projectReadScope');
const describePg = process.env.TEST_PG === '1' ? describe : describe.skip;

describePg('Batch 5A date-fix integration: indirect workforce/payroll ownership', () => {
  let db; let client; let q; let scoped; let projects; let laborers; let periods; let alerts;
  const tag = `${Date.now()}-${process.pid}`;
  beforeAll(async () => {
    db = require('../../config/database'); client = await db.pool.connect(); await client.query('BEGIN');
    q = client.query.bind(client);
    const one = async (sql, values) => (await q(sql, values)).rows[0];
    projects = [];
    for (const suffix of ['own', 'foreign']) projects.push((await one("INSERT INTO projects (name,code,status) VALUES ($1,$1,'active') RETURNING id", [`S005DIR-${tag}-${suffix}`])).id);
    laborers = [];
    for (const suffix of ['own', 'foreign', 'unassigned']) laborers.push((await one('INSERT INTO daily_laborers (code,full_name,daily_rate) VALUES ($1,$1,100) RETURNING id', [`S005DIR-${tag}-${suffix}`])).id);
    await q('INSERT INTO labor_payments (project_id,laborer_id,total_amount) VALUES ($1,$2,100),($3,$4,100)', [projects[0], laborers[0], projects[1], laborers[1]]);
    periods = [];
    for (const [suffix, amount] of [['own',100], ['mixed',200], ['company',500]]) periods.push((await one('INSERT INTO payroll_periods (period_name,month,year,total_net_salary) VALUES ($1,1,2099,$2) RETURNING id', [`S005DIR-${tag}-${suffix}`, amount])).id);
    await q('INSERT INTO payroll_cost_allocations (payroll_id,project_id,amount) VALUES ($1,$2,100),($3,$2,100),($3,$4,100)', [periods[0], projects[0], periods[1], projects[1]]);
    for (const suffix of ['partial', 'overhead']) {
      const period = await one('INSERT INTO payroll_periods (period_name,total_net_salary) VALUES ($1,200) RETURNING id', [`S005DIR-${tag}-${suffix}`]);
      periods.push(period.id);
      await q('INSERT INTO payroll_cost_allocations (payroll_id,project_id,amount) VALUES ($1,$2,100)', [period.id, projects[0]]);
      if (suffix === 'overhead') await q('INSERT INTO payroll_cost_allocations (payroll_id,project_id,amount) VALUES ($1,NULL,100)', [period.id]);
    }
    alerts = [];
    const material = await one("SELECT id FROM item_master WHERE code='RM-CONC-C35'");
    for (const project of [...projects, null]) {
      const po = project == null ? null : await one("INSERT INTO purchase_orders (order_number,project_id,status) VALUES ($1,$2,'issued') RETURNING id", [`S005DIR-${tag}-${project}`, project]);
      alerts.push((await one("INSERT INTO replenishment_alerts (material_id,purchase_order_id,alert_type) VALUES ($1,$2,'delayed_po') RETURNING id", [material.id, po?.id ?? null])).id);
    }
    scoped = await scopedQuery({ query: {}, accessScope: { companyWide: false, projectIds: [projects[0]] } }, q);
  });
  afterAll(async () => { if (client) { try { await client.query('ROLLBACK'); } finally { client.release(); } } if (db) await db.pool.end(); });
  test('project seat sees laborers linked through its own project records', async () => {
    const result = await scoped('SELECT id FROM daily_laborers WHERE id=ANY($1::int[]) ORDER BY id', [laborers]);
    expect(result.rows.map(row => row.id)).toEqual([laborers[0]]);
  });
  test('company payroll totals require the complete period to belong to the authorized projects', async () => {
    const result = await scoped('SELECT id FROM payroll_periods WHERE id=ANY($1::int[]) ORDER BY id', [periods]);
    expect(result.rows.map(row => row.id)).toEqual([periods[0]]);
  });
  test('project seats cannot read foreign or unowned company alert snapshots', async () => {
    const result = await scoped('SELECT id FROM replenishment_alerts WHERE id=ANY($1::int[]) ORDER BY id', [alerts]);
    expect(result.rows.map(row => row.id)).toEqual([alerts[0]]);
    expect((await q('SELECT id FROM replenishment_alerts WHERE id=ANY($1::int[])', [alerts])).rows).toHaveLength(3);
  });
});
