const tokens = require('../../services/tokens');
const describePg = process.env.TEST_PG === '1' ? describe : describe.skip;

describePg('S-002 project creation follows the project create grant', () => {
  let db; let server; let base;
  const tag = `${Date.now()}-${process.pid}`;
  beforeAll(async () => {
    db = require('../../config/database');
    const { app } = require('../../../server');
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.pool.end();
  });
  test.each(['owner_ceo', 'coo', 'owner', 'admin', 'storekeeper'])('%s respects its create grant and audits success', async role => {
    const user = (await db.query("INSERT INTO users (name,email,password,role) VALUES ('S002',$1,'unused',$2) RETURNING id,token_version", [`s002-${tag}-${role}@test.invalid`, role])).rows[0];
    await db.query('INSERT INTO user_project_roles (user_id,project_id,role_id) SELECT $1,NULL,id FROM roles WHERE key=$2', [user.id, role]);
    const grant = (await db.query(`SELECT EXISTS (SELECT 1 FROM role_permissions rp JOIN roles r ON r.id=rp.role_id
      JOIN permissions p ON p.id=rp.permission_id WHERE r.key=$1 AND p.module IN ('projects','*') AND p.action IN ('create','*')) AS allowed`, [role])).rows[0].allowed;
    const response = await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json',
      Authorization: `Bearer ${tokens.signSession({ userId: user.id, tokenVersion: user.token_version })}` },
    body: JSON.stringify({ name_en: `S002-${tag}-${role}`, name_ar: 'اختبار', project_type: 'commercial' }) });
    const body = await response.json();
    expect({ role, status: response.status }).toEqual({ role, status: grant ? 201 : 403 });
    if (grant) {
      expect(body.data.id).toBeTruthy();
      const audit = await db.query("SELECT id FROM activity_log WHERE user_id=$1 AND module='projects' AND action='create'", [user.id]);
      expect(audit.rows.length).toBeGreaterThan(0);
    }
  });
});
