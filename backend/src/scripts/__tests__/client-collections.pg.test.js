const tokens = require('../../services/tokens');
const describePg = process.env.TEST_PG === '1' ? describe : describe.skip;

describePg('Batch 5A client collections exclude supplier cash outflows', () => {
  let db; let server; let base; let project; let owner; let scoped;
  const tag = `b5c-${Date.now()}`;
  const call = async (path, user = scoped) => {
    const response = await fetch(base + path, { headers: { Authorization: `Bearer ${user.token}` } });
    expect(response.status).toBe(200);
    return (await response.json()).data;
  };
  beforeAll(async () => {
    db = require('../../config/database');
    const client = (await db.query("INSERT INTO clients (name_en, name_ar) VALUES ($1,$1) RETURNING id", [tag])).rows[0];
    const supplier = (await db.query("INSERT INTO suppliers (name_en, name_ar) VALUES ($1,$1) RETURNING id", [tag])).rows[0];
    project = (await db.query("INSERT INTO projects (name, code, status, client_id) VALUES ($1,$2,'active',$3) RETURNING id", [tag, tag.slice(-20), client.id])).rows[0];
    await db.query("INSERT INTO invoices (invoice_number, project_id, client_id, amount, issue_date, status) VALUES ($1,$2,$3,1000,CURRENT_DATE,'sent')", [tag, project.id, client.id]);
    // Both legacy invoice-linked receipts and unallocated client advances count.
    const invoice = (await db.query('SELECT id FROM invoices WHERE project_id=$1', [project.id])).rows[0];
    await db.query(`INSERT INTO payments (project_id,client_id,invoice_id,amount,payment_date)
      VALUES ($1,$2,$3,200,CURRENT_DATE),($1,$2,NULL,100,CURRENT_DATE)`, [project.id, client.id, invoice.id]);
    await db.query("INSERT INTO payments (project_id,supplier_id,direction,amount,payment_date) VALUES ($1,$2,'ap',9130,CURRENT_DATE)", [project.id, supplier.id]);
    await db.query("INSERT INTO expenses (project_id,category,description,amount) VALUES ($1,'materials','batch5a',40)", [project.id]);
    for (const role of ['owner', 'project_manager']) {
      const user = (await db.query('INSERT INTO users (name,email,password,role) VALUES ($1,$2,\'unused\',$3) RETURNING id,token_version', [tag, `${tag}-${role}@test.invalid`, role])).rows[0];
      await db.query('INSERT INTO user_project_roles (user_id,project_id,role_id) SELECT $1,$2,id FROM roles WHERE key=$3', [user.id, role === 'owner' ? null : project.id, role]);
      user.token = tokens.signSession({ userId: user.id, tokenVersion: user.token_version });
      if (role === 'owner') owner = user; else scoped = user;
    }
    // 0009 requires a real actor and a nonblank reason for every void.
    await db.query("INSERT INTO payments (project_id,client_id,direction,amount,payment_date,voided_at,voided_by,void_reason) VALUES ($1,$2,'ar',50,CURRENT_DATE,NOW(),$3,'fixture void')", [project.id, client.id, owner.id]);
    const { app } = require('../../../server');
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.pool.end();
  });
  test('scoped summary and overview agree on AR collections, outstanding and cash profit', async () => {
    expect(await call('/api/finance/summary')).toMatchObject({ total_revenue_collected: 300, total_outstanding: 700, net_profit: 260 });
    expect((await call('/api/dashboard/overview')).health).toMatchObject({ revenue_collected: 300, total_outstanding: 700, net_profit: 260 });
    expect((await call('/api/dashboard/overview')).modules.finance).toMatchObject({ revenue_collected: 300, outstanding: 700, net_profit: 260 });
    expect(await call(`/api/finance/project/${project.id}`)).toMatchObject({ total_paid: 300, outstanding_balance: 700 });
  });
  test('company-wide summary and dashboard equal client-only database figures', async () => {
    const expected = (await db.query("SELECT COALESCE(SUM(amount),0)::float AS total FROM payments WHERE direction='ar' AND voided_at IS NULL")).rows[0].total;
    const summary = await call('/api/finance/summary', owner);
    const dashboard = await call('/api/dashboard/overview', owner);
    expect(summary.total_revenue_collected).toBe(expected);
    expect(dashboard.health.revenue_collected).toBe(expected);
    expect(dashboard.health.total_outstanding).toBe(summary.total_outstanding);
    expect(dashboard.health.net_profit).toBe(summary.net_profit);
  });
  test('finance receivables and owner widgets exclude AP and voided receipts', async () => {
    const widgets = require('../../services/dashboardWidgets');
    const q = (sql, params) => db.query(sql, params);
    const finance = await widgets.roleDashboard(q, { id: owner.id, role: 'finance_manager' }, { projectId: project.id });
    expect(finance.widgets.find(row => row.key === 'receivables').data).toEqual({ invoiced: 1000, collected: 300, outstanding: 700 });
    const dashboard = await widgets.roleDashboard(q, { id: owner.id, role: 'owner' });
    const expected = (await db.query("SELECT COALESCE(SUM(amount),0)::float AS total FROM payments WHERE direction='ar' AND voided_at IS NULL")).rows[0].total;
    expect(dashboard.widgets.find(row => row.key === 'financial_position').data.collected).toBe(expected);
  });
});
