const fs = require('fs');
const path = require('path');
const os = require('os');
const tokens = require('../../services/tokens');
const describePg = process.env.TEST_PG === '1' ? describe : describe.skip;
const stage = process.env.R12_DISCOVERY_STAGE || 'verify';
const targets = ['/api/finance/summary', '/api/dashboard', '/api/dashboard/overview', '/api/dashboard/alerts', '/api/finance-ledger/cash-flow', '/api/finance-ledger/retention', '/api/hse/dashboard', '/api/finance-ledger/company-dashboard'];

describePg('R1.2 project-scoped aggregate isolation', () => {
  let db; let server; let app; let base; let own; let foreign; let scoped; let owner;
  const tag = `${Date.now()}-${process.pid}`;
  const userIds = [];
  const call = async (route, user = scoped) => {
    const res = await fetch(base + route, { headers: { Authorization: `Bearer ${user.token}` }, signal: AbortSignal.timeout(10000) });
    let body = null; try { body = await res.json(); } catch (_) { /* non-JSON responses are not aggregate bodies */ }
    return { status: res.status, body };
  };
  beforeAll(async () => {
    db = require('../../config/database');
    await db.transaction(client => require('../seed-golden-demo').seedGoldenDemo(client));
    const client = (await db.query("INSERT INTO clients (name_ar, name_en) VALUES ('R12 Client', 'R12 Client') RETURNING id")).rows[0];
    const supplier = (await db.query('SELECT id FROM suppliers ORDER BY id LIMIT 1')).rows[0];
    const material = (await db.query('SELECT id FROM item_master ORDER BY id LIMIT 1')).rows[0];
    for (const [suffix, invoice, payment, expense] of [['A', 10, 2, 1], ['B', 90, 20, 7]]) {
      const project = (await db.query("INSERT INTO projects (name, name_en, code, status, client_id, budget) VALUES ($1,$1,$2,'active',$3,$4) RETURNING id", [`R12 ${suffix}`, `R12-${tag}-${suffix}`, client.id, invoice * 100])).rows[0];
      if (suffix === 'A') own = project; else foreign = project;
      await db.query("INSERT INTO invoices (invoice_number, project_id, client_id, amount, issue_date, status) VALUES ($1,$2,$3,$4,CURRENT_DATE,'draft')", [`R12-${tag.slice(-10)}-${suffix}`, project.id, client.id, invoice]);
      await db.query("INSERT INTO payments (project_id, client_id, direction, amount, payment_date) VALUES ($1,$2,'ar',$3,CURRENT_DATE)", [project.id, client.id, payment]);
      await db.query("INSERT INTO expenses (project_id, category, description, amount) VALUES ($1,'materials','R12',$2)", [project.id, expense]);
      const po = (await db.query("INSERT INTO purchase_orders (order_number, project_id, supplier_id, total_amount, status) VALUES ($1,$2,$3,$4,'issued') RETURNING id", [`R12PO-${tag.slice(-10)}-${suffix}`, project.id, supplier.id, invoice])).rows[0];
      await db.query("INSERT INTO purchase_order_lines (purchase_order_id, material_id, quantity, unit, unit_rate) VALUES ($1,$2,1,'unit',$3)", [po.id, material.id, invoice]);
      await db.query("INSERT INTO retention_ledger (project_id, party_type, direction, amount) VALUES ($1,'client','held',$2)", [project.id, suffix === 'A' ? 3 : 30]);
      await db.query("INSERT INTO incidents (project_id, description, severity) VALUES ($1,'R12 incident','minor')", [project.id]);
      if (suffix === 'B') await db.query("INSERT INTO incidents (project_id, description, severity) VALUES ($1,'R12 second incident','minor')", [project.id]);
    }
    for (const [role, project] of [['owner', null], ['project_manager', own.id]]) {
      const user = (await db.query("INSERT INTO users (name, email, password, role) VALUES ('R12', $1, 'unused', $2) RETURNING id, token_version", [`r12-${tag}-${role}@test.invalid`, role])).rows[0];
      userIds.push(user.id);
      await db.query('INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1,$2,id FROM roles WHERE key=$3', [user.id, project, role]);
      user.token = tokens.signSession({ userId: user.id, tokenVersion: user.token_version });
      if (role === 'owner') owner = user; else scoped = user;
    }
    ({ app } = require('../../../server'));
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    for (const id of userIds) {
      await db.query('DELETE FROM user_project_roles WHERE user_id=$1', [id]);
      await db.query('UPDATE users SET is_active=false WHERE id=$1', [id]);
    }
    await db.pool.end();
  });

  test('all parameterless GETs are compared and identical nonempty bodies recorded', async () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../../server.js'), 'utf8');
    const mounts = [...source.matchAll(/app\.use\('([^']+)', require\('([^']+)'\)(\.buildV1Router\(\))?\);/g)];
    const routes = new Set(['/api/health']);
    const walk = (stack, prefix) => {
      for (const layer of stack) {
        if (layer.route && layer.route.methods.get) {
          for (const route of [layer.route.path].flat()) if (!String(route).includes(':')) routes.add(prefix + (route === '/' ? '' : route));
        } else if (layer.handle?.stack) {
          if (layer.regexp.fast_slash) { walk(layer.handle.stack, prefix); continue; }
          const mount = layer.regexp.source.match(/^\^\\\/(.*?)\\\/\?\(\?=/);
          if (!mount) throw new Error(`Unsupported nested mount ${layer.regexp.source}`);
          walk(layer.handle.stack, prefix + '/' + mount[1].replace(/\\\//g, '/'));
        }
      }
    };
    for (const [, prefix, module, build] of mounts) {
      const exported = require(path.resolve(__dirname, '../../..', module));
      walk((build ? exported.buildV1Router() : exported).stack, prefix);
    }
    const identical = []; const serverFailures = []; const identicalData = new Map();
    for (const route of routes) {
      const a = await call(route, owner); const b = await call(route);
      if (a.status >= 500 || b.status >= 500) serverFailures.push(`${route}: owner=${a.status} scoped=${b.status}`);
      const data = a.body?.data;
      const nonempty = data != null && (Array.isArray(data) ? data.length > 0 : typeof data === 'object' ? Object.keys(data).length > 0 : !!data);
      if (a.status === 200 && b.status === 200 && nonempty && JSON.stringify(a.body) === JSON.stringify(b.body)) {
        identical.push(route); identicalData.set(route, data);
      }
    }
    const report = ['# R1.2 aggregate discovery', '', `Stage: ${stage}. Compared ${routes.size} parameterless mounted GET routes as owner and one-project PM on golden seed plus two known-total projects.`, '', 'Byte-identical nonempty 200 bodies:', ...identical.map(route => `- ${route}`), ''];
    if (stage !== 'verify') fs.appendFileSync(path.resolve(__dirname, '../../../../docs/R1_AGGREGATE_DISCOVERY.md'), '\n' + report.join('\n'));
    console.log(`R1.2 discovery: ${routes.size} parameterless GETs, ${identical.length} identical nonempty responses`);
    const allowFile = path.resolve(__dirname, '../../../../docs/R1_AGGREGATE_ALLOWLIST.json');
    const allow = fs.existsSync(allowFile) ? JSON.parse(fs.readFileSync(allowFile, 'utf8')) : {};
    const hasBusinessValues = value => {
      if (typeof value === 'number') return value !== 0;
      if (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)) return Number(value) !== 0;
      if (value && typeof value === 'object') return Object.values(value).some(hasBusinessValues);
      return false;
    };
    const unexplained = identical.filter(route => !allow[route]?.reason
      || (allow[route].kind === 'zero' && hasBusinessValues(identicalData.get(route))));
    console.log(`R1.2 unexplained identical bodies: ${unexplained.length}; server failures: ${serverFailures.length}`);
    expect(serverFailures).toEqual([]);
    expect(unexplained).toEqual([]);
  }, 180000);

  test('scoped financial, project and HSE totals use only authorized projects', async () => {
    const finance = await call('/api/finance/summary');
    expect(finance.body.data).toMatchObject({ total_invoiced: 10, total_revenue_collected: 2, total_expenses: 1 });
    const explicit = await call(`/api/finance/summary?project_id=${own.id}`);
    expect(explicit.body).toEqual(finance.body);
    expect((await call(`/api/finance/summary?project_id=${foreign.id}`)).status).toBe(403);
    expect((await call('/api/dashboard')).body.data.projects).toBe(1);
    const overview = await call('/api/dashboard/overview');
    expect(overview.body.data.health).toMatchObject({ projects_total: 1, portfolio_budget: 1000, revenue_collected: 2, net_profit: 1 });
    expect((await call('/api/hse/dashboard')).body.data.open_incidents).toBe(1);
    expect((await call('/api/finance-ledger/cash-flow')).body.data.retention_receivable).toBe(3);
    expect((await call('/api/finance-ledger/retention')).body.data.balance).toBe(3);
  });

  test('company-wide owner aggregates match pre-fix golden baseline', async () => {
    const snapshot = {};
    for (const route of targets) {
      const result = await call(route, owner);
      expect(result.status).toBe(200);
      snapshot[route] = result.body;
    }
    const file = path.join(os.tmpdir(), 'erp-r01-r12-owner-baseline.json');
    if (stage === 'before') fs.writeFileSync(file, JSON.stringify(snapshot));
    // Only timestamp-generated fixture codes differ across disposable databases;
    // golden entity identifiers and every business figure remain compared.
    const normalizeFixtureCodes = value => JSON.parse(JSON.stringify(value).replace(/R12-\d+-\d+-([AB])/g, 'R12-$1'));
    if (stage === 'after') expect(normalizeFixtureCodes(snapshot)).toEqual(normalizeFixtureCodes(JSON.parse(fs.readFileSync(file, 'utf8'))));
  });
});
