const fs = require('fs');
const path = require('path');
const tokens = require('../../services/tokens');
const describePg = process.env.TEST_PG === '1' ? describe : describe.skip;

describePg('R1.1 project id mismatch and destination authorization', () => {
  let db; let server; let base; let own; let foreign; let client; let scoped; let owner;
  const tag = `${Date.now()}-${process.pid}`;
  const userIds = [];
  const call = async (method, route, body, actor = scoped) => {
    const res = await fetch(base + route, { method, headers: { Authorization: `Bearer ${actor.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const makeUser = async (role, projectId) => {
    const row = (await db.query("INSERT INTO users (name, email, password, role) VALUES ('r11', $1, 'unused', $2) RETURNING id, token_version", [`r11-${tag}-${role}@test.invalid`, role])).rows[0];
    userIds.push(row.id);
    await db.query('INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, $2, id FROM roles WHERE key = $3', [row.id, projectId, role]);
    return { ...row, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
  };
  beforeAll(async () => {
    db = require('../../config/database');
    for (const suffix of ['A', 'B']) {
      const row = (await db.query("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`r11-${tag}-${suffix}`, `R11-${tag}-${suffix}`])).rows[0];
      if (suffix === 'A') own = row; else foreign = row;
    }
    client = (await db.query("INSERT INTO clients (name_en, name_ar) VALUES ($1,$1) RETURNING id", [`r11-${tag}`])).rows[0];
    scoped = await makeUser('project_manager', own.id);
    owner = await makeUser('owner', null);
    const { app } = require('../../../server');
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    for (const id of userIds) {
      await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [id]);
      await db.query('UPDATE users SET is_active = false WHERE id = $1', [id]);
    }
    await db.pool.end();
  });

  test.each([
    ['expenses', 'expenses', 'description'], ['invoices', 'invoices', 'description'],
    ['legal', 'legal_documents', 'title'], ['payments', 'payments', 'notes'], ['boq/sections', 'boq_sections', 'name_ar'],
  ])('%s mismatch rejects before any row is written', async (route, table, field) => {
    const marker = `r11-${tag}-${route}`;
    const payloads = {
      expenses: { category: 'materials', amount: 1, description: marker },
      invoices: { client_id: client.id, amount: 5, issue_date: '2026-10-14', description: marker },
      legal: { title: marker },
      payments: { client_id: client.id, amount: 1, payment_date: '2026-10-14', notes: marker },
      'boq/sections': { name_ar: marker, name_en: marker },
    };
    const result = await call('POST', `/api/${route}?project_id=${own.id}`, { ...payloads[route], project_id: foreign.id });
    const rows = (await db.query(`SELECT id FROM ${table} WHERE ${field} = $1 AND project_id = $2`, [marker, foreign.id])).rows;
    expect({ status: result.status, code: result.body.error_code, rows: rows.length }).toEqual({ status: 400, code: 'project_id_mismatch', rows: 0 });
  });

  test('every inventory mutation rejects mismatched query/body project ids', async () => {
    const inventory = fs.readFileSync(path.resolve(__dirname, '../../../../docs/R1_PROJECT_ID_INVENTORY.md'), 'utf8');
    const routes = [...inventory.matchAll(/^\| (POST|PUT|PATCH|DELETE) \| `([^`]+)`/gm)];
    expect(routes.length).toBeGreaterThanOrEqual(80);
    const failures = [];
    for (const [, method, template] of routes) {
      const route = template.replace(/:project_?id\b/gi, String(own.id)).replace(/:\w+(?:\([^)]*\))?\??/g, '99999999');
      const result = await call(method, `${route}?project_id=${own.id}`, { project_id: foreign.id });
      if (result.status !== 400 || result.body.error_code !== 'project_id_mismatch') failures.push(`${method} ${template}: ${result.status}/${result.body.error_code || 'untyped'}`);
    }
    console.log(`R1.1 inventory mismatch sweep: ${routes.length} handlers, ${failures.length} failures`);
    expect(failures).toEqual([]);
  }, 60000);

  test('single-source calls still succeed for scoped and company-wide users', async () => {
    for (const [actor, project] of [[scoped, own], [owner, foreign]]) {
      const result = await call('POST', '/api/legal', { project_id: project.id, title: `r11-legit-${tag}-${actor.id}` }, actor);
      expect(result.status).toBe(201);
      expect(result.body.data.project_id).toBe(project.id);
    }
  });

  test('moving a record requires source and destination access, with no update on denial', async () => {
    const incident = (await db.query("INSERT INTO incidents (project_id, description, severity) VALUES ($1, $2, 'minor') RETURNING id", [own.id, `r11-move-${tag}`])).rows[0];
    const denied = await call('PUT', `/api/hse/incidents/${incident.id}`, { project_id: foreign.id });
    expect(denied.status).toBe(403);
    expect((await db.query('SELECT project_id FROM incidents WHERE id = $1', [incident.id])).rows[0].project_id).toBe(own.id);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, $2, id FROM roles WHERE key = 'project_manager'", [scoped.id, foreign.id]);
    const permitted = await call('PUT', `/api/hse/incidents/${incident.id}`, { project_id: foreign.id });
    expect(permitted.status).toBe(200);
    expect((await db.query('SELECT project_id FROM incidents WHERE id = $1', [incident.id])).rows[0].project_id).toBe(foreign.id);
    // Owner retains both-project authority via the existing company-wide seat.
    const returned = await call('PUT', `/api/hse/incidents/${incident.id}`, { project_id: own.id }, owner);
    expect(returned.status).toBe(200);
  });

  test('asset placement changes also require the original project authority', async () => {
    const asset = (await db.query("INSERT INTO assets (name, name_en, current_project_id) VALUES ($1, $1, $2) RETURNING id", [`r11-asset-${tag}`, own.id])).rows[0];
    const destinationOnly = await makeUser('engineer', foreign.id);
    const denied = await call('PUT', `/api/assets/${asset.id}`, { current_project_id: foreign.id }, destinationOnly);
    expect(denied.status).toBe(403);
    expect((await db.query('SELECT current_project_id FROM assets WHERE id = $1', [asset.id])).rows[0].current_project_id).toBe(own.id);
    const moved = await call('PUT', `/api/assets/${asset.id}`, { current_project_id: foreign.id }, owner);
    expect(moved.status).toBe(200);
  });
});
