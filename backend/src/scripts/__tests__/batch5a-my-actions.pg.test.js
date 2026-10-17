const tokens = require('../../services/tokens');
const describePg = process.env.TEST_PG === '1' ? describe : describe.skip;

describePg('S-005 scoped action and notification timestamp serialization', () => {
  let db; let server; let base; let project;
  const tag = `${Date.now()}-${process.pid}`;
  beforeAll(async () => {
    db = require('../../config/database');
    const { app } = require('../../../server');
    project = (await db.query("INSERT INTO projects (name,code,status) VALUES ($1,$1,'active') RETURNING id", [`S005-${tag}`])).rows[0];
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.pool.end();
  });
  test.each(['procurement_officer', 'storekeeper'])('%s returns timestamps as ISO strings, preserving scoped records', async role => {
    const user = (await db.query("INSERT INTO users (name,email,password,role) VALUES ('S005',$1,'unused',$2) RETURNING id,token_version", [`s005-${tag}-${role}@test.invalid`, role])).rows[0];
    await db.query('INSERT INTO user_project_roles (user_id,project_id,role_id) SELECT $1,$2,id FROM roles WHERE key=$3', [user.id, project.id, role]);
    const notification = (await db.query("INSERT INTO notifications (user_id,title,body) VALUES ($1,'S005 notification','Scoped timestamp fixture') RETURNING id", [user.id])).rows[0];
    const action = (await db.query("INSERT INTO action_items (project_id,source_type,title,assigned_user_id,priority,due_date) VALUES ($1,'manual','S005 action',$2,'high',NOW()-INTERVAL '1 day') RETURNING id", [project.id, user.id])).rows[0];
    const headers = { Authorization: `Bearer ${tokens.signSession({ userId: user.id, tokenVersion: user.token_version })}` };
    const response = await fetch(`${base}/api/notifications`, { headers });
    expect(response.status).toBe(200);
    const row = (await response.json()).data.find(item => item.id === notification.id);
    console.log(`S005 ${role} notification created_at type=${typeof row.created_at}; keys=${Object.keys(row.created_at || {}).join(',')}`);
    expect(row.created_at).toEqual(expect.any(String));
    expect(Number.isFinite(Date.parse(row.created_at))).toBe(true);
    const actions = await fetch(`${base}/api/actions/my`, { headers });
    expect(actions.status).toBe(200);
    const item = Object.values((await actions.json()).buckets).flat().find(item => item.id === action.id);
    expect(item.due_date).toEqual(expect.any(String));
    expect(item.project_id).toBe(project.id);
  });
});
