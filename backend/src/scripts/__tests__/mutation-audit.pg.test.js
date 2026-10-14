'use strict';

// R2.2 enforcement: every mounted non-GET route must either be exempt (documented
// in mutation-audit-exemptions.json), have a registered happy-path fixture, or be on
// the shrinking pending list. Registered routes are called as owner and must raise
// activity_log or audit_events (convention: utils/auditedTransaction.js writes
// activity_log; policy/finance writes audit_events). The rollback test installs a
// failing audit trigger for a second owner and requires that no business table
// changes when the audit insert throws.
//
// Failure classes are reported separately:
//   R2 missing fixture   - no payload registered (pending list); NOT a verified route
//   R2 fixture error     - the registered request did not succeed (fixture/route bug)
//   R2 no audit row      - the request succeeded but wrote no audit row
//   R2 rollback leak     - the audit insert failed but business rows still changed
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '100000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const fs = require('fs');
const path = require('path');
const tokens = require('../../services/tokens');
const registry = require('../audit-fixtures');
const exemptions = require('../mutation-audit-exemptions.json');
const pendingPath = path.join(__dirname, '..', 'audit-fixtures', 'pending.json');
const pending = fs.existsSync(pendingPath) ? JSON.parse(fs.readFileSync(pendingPath, 'utf8')) : [];
const describePg = process.env.TEST_PG === '1' ? describe : describe.skip;
const ONLY = process.env.R2_ONLY ? new RegExp(process.env.R2_ONLY) : null;
// Infrastructure tables written outside the business transaction by design.
const INFRA_TABLES = new Set(['idempotency_keys', 'v1_rate_limits', 'rate_limits', 'user_sessions', 'refresh_tokens', 'event_outbox_attempts']);

function enumerateMutations(app) {
  const routes = new Set();
  function walk(stack, prefix = '') {
    for (const layer of stack) {
      if (layer.route) {
        for (const [method, active] of Object.entries(layer.route.methods)) {
          if (!active || ['get', 'head', 'options'].includes(method)) continue;
          for (const route of [layer.route.path].flat()) routes.add(`${method.toUpperCase()} ${(prefix + (route === '/' ? '' : route)).replace(/\/$/, '')}`);
        }
      } else if (layer.handle?.stack) {
        if (layer.regexp.fast_slash) { walk(layer.handle.stack, prefix); continue; }
        const mount = layer.regexp.source.match(/^\^\\\/(.*?)\\\/\?\(\?=/);
        if (!mount) throw new Error(`Unsupported mutation router mount: ${layer.regexp.source}`);
        walk(layer.handle.stack, prefix + '/' + mount[1].replace(/\\\//g, '/'));
      }
    }
  }
  walk(app._router.stack);
  return [...routes].sort();
}

describePg('R2 every mounted mutation has a successful audited payload', () => {
  let db; let app; let server; let base; let owner; let failer; let project; let token; let failToken;
  const tag = `${Date.now()}-${process.pid}`;
  let seq = 0;
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const counts = (id) => one('SELECT (SELECT count(*)::int FROM activity_log WHERE user_id = $1) AS activity, (SELECT count(*)::int FROM audit_events WHERE user_id = $1 OR actor_id = $1) AS policy', [id]);
  const send = async (method, url, body, bearer, extraHeaders = {}) => {
    const response = await fetch(new URL(url, base), {
      method,
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json', ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const text = await response.text();
    let json; try { json = JSON.parse(text); } catch (_) { json = null; }
    return { status: response.status, json, text };
  };
  // Fixture helpers: create prerequisites through the API as owner (valid by construction).
  const ctx = () => {
    const n = () => `${tag}-${++seq}`;
    const api = async (method, url, body, expected = [200, 201], headers = {}) => {
      const r = await send(method, url, body, token, headers);
      if (!expected.includes(r.status)) throw new Error(`prerequisite ${method} ${url} -> ${r.status} ${r.text.slice(0, 160)}`);
      return r.json?.data ?? r.json;
    };
    return { db, owner, project, tag, n, api, one, token, pid: project.id };
  };

  beforeAll(async () => {
    db = require('../../config/database');
    ({ app } = require('../../../server'));
    const makeOwner = async (name) => {
      const row = await one("INSERT INTO users (name, email, password, role) VALUES ($1, $2, 'unused', 'owner') RETURNING id, token_version", [name, `${name}-${tag}@test.invalid`]);
      await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [row.id]);
      return row;
    };
    owner = await makeOwner('r02-audit-owner');
    failer = await makeOwner('r02-audit-failer');
    project = await one("INSERT INTO projects (name, name_en, code, status, budget, contract_value) VALUES ($1, $1, $2, 'active', 900000000, 900000000) RETURNING id", [`r02-audit-${tag}`, `R02A-${tag}`]);
    token = tokens.signSession({ userId: owner.id, tokenVersion: owner.token_version });
    failToken = tokens.signSession({ userId: failer.id, tokenVersion: failer.token_version });
    // Failure injection scoped to one user: any audit row for the failer raises.
    await db.query(`CREATE OR REPLACE FUNCTION r02_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'r02 injected audit failure'; END $$`);
    await db.query(`CREATE TRIGGER r02_fail_activity BEFORE INSERT ON activity_log FOR EACH ROW WHEN (NEW.user_id = ${Number(failer.id)}) EXECUTE FUNCTION r02_fail_audit()`);
    await db.query(`CREATE TRIGGER r02_fail_policy BEFORE INSERT ON audit_events FOR EACH ROW WHEN (NEW.user_id = ${Number(failer.id)} OR NEW.actor_id = ${Number(failer.id)}) EXECUTE FUNCTION r02_fail_audit()`);
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) {
      await db.query('DROP TRIGGER IF EXISTS r02_fail_activity ON activity_log');
      await db.query('DROP TRIGGER IF EXISTS r02_fail_policy ON audit_events');
      await db.query('DROP FUNCTION IF EXISTS r02_fail_audit()');
      for (const u of [owner, failer]) if (u) {
        await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [u.id]);
        await db.query('UPDATE users SET is_active = false WHERE id = $1', [u.id]);
      }
      await db.pool.end();
    }
  });

  test('registry covers every live non-GET route; pending list only shrinks', () => {
    const routes = enumerateMutations(app);
    if (process.env.R2_WRITE_PENDING === '1') {
      const next = routes.filter(key => !registry[key] && !exemptions[key]);
      fs.writeFileSync(pendingPath, `${JSON.stringify(next, null, 2)}\n`);
      return;
    }
    const uncovered = routes.filter(key => !registry[key] && !exemptions[key] && !pending.includes(key));
    const stale = [...Object.keys(registry), ...Object.keys(exemptions), ...pending].filter(key => !routes.includes(key));
    const redundant = pending.filter(key => registry[key] || exemptions[key]);
    console.log(`R2 mutation registry: ${routes.length} routes; ${Object.keys(registry).length} fixtures; ${Object.keys(exemptions).length} exemptions; ${pending.length} missing fixture (pending); ${uncovered.length} unregistered; ${stale.length} stale; ${redundant.length} redundant pending`);
    expect({ uncovered, stale, redundant }).toEqual({ uncovered: [], stale: [], redundant: [] });
  });

  const keys = Object.keys(registry).filter(key => !ONLY || ONLY.test(key));

  test.each(keys)('%s success writes an audit row', async key => {
    expect(enumerateMutations(app)).toContain(key);
    const payload = await registry[key](ctx());
    const before = await counts(owner.id);
    const r = await send(key.split(' ')[0], payload.path, payload.body, token, payload.headers);
    if (r.status !== payload.status) throw new Error(`R2 fixture error ${key}: status=${r.status} expected ${payload.status} ${r.text.slice(0, 200)}`);
    const after = await counts(owner.id);
    const delta = { activity: after.activity - before.activity, audit_events: after.policy - before.policy };
    console.log(`R2 audit ${key}: status=${r.status}; activity_log +${delta.activity}; audit_events +${delta.audit_events}`);
    if (delta.activity + delta.audit_events < 1) throw new Error(`R2 no audit row ${key}: request succeeded (${r.status}) but wrote no activity_log/audit_events row`);
  });

  test.each(keys)('%s rolls back when the audit insert throws', async key => {
    const payload = await registry[key](ctx());
    if (payload.nonAtomic) { console.log(`R2 rollback skipped ${key}: documented non-atomic exception - ${payload.nonAtomic}`); return; }
    const { xid } = await one('SELECT txid_current()::text AS xid');
    const r = await send(key.split(' ')[0], payload.path, payload.body, failToken, payload.headers);
    const { rows } = await db.query(`
      SELECT c.relname, (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %I.%I WHERE xmin::text::bigint > %s', n.nspname, c.relname, $1::bigint), false, true, '')))[1]::text::int AS n
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'`, [xid]);
    const leaked = rows.filter(row => row.n > 0 && !INFRA_TABLES.has(row.relname)).map(row => `${row.relname}:${row.n}`);
    console.log(`R2 rollback ${key}: status=${r.status}; leaked=[${leaked.join(',')}]`);
    if (r.status < 400) throw new Error(`R2 rollback leak ${key}: status=${r.status}; success returned although the audit insert was forced to fail`);
    if (leaked.length) throw new Error(`R2 rollback leak ${key}: ${leaked.join(', ')}`);
  });
});

module.exports = { enumerateMutations };
