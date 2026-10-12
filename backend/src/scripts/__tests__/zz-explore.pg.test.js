process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');
const fs = require('fs');
test('explore', async () => {
  const { app } = require('../../../server');
  const db = require('../../config/database');
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const row = (await db.query("INSERT INTO users (name, email, password, role) VALUES ('x-owner', $1, 'x', 'owner') RETURNING id, token_version", [`x-${Date.now()}@t.io`])).rows[0];
  await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [row.id]);
  const token = tokens.signSession({ userId: row.id, tokenVersion: row.token_version });
  const spec = await (await fetch(`${base}/api/v1/openapi.json`)).json();
  const out = [];
  for (const [p, ops] of Object.entries(spec.paths)) {
    for (const m of Object.keys(ops)) {
      const url = p.replace(/:[A-Za-z]+/g, '999999');
      let r; let body;
      try {
        r = await fetch(`${base}/api/v1${url}`, { method: m.toUpperCase(), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: ['post', 'put'].includes(m) ? '{}' : undefined });
        body = await r.text();
      } catch (e) { body = 'ERR ' + e.message; r = { status: 0 }; }
      out.push(`${m.toUpperCase()} ${p} -> ${r.status} ${body.slice(0, 110)}`);
    }
  }
  fs.writeFileSync(process.env.OUTF, out.join('\n'));
  await new Promise((r) => server.close(r));
  await db.pool.end();
}, 300000);
