// Seed helpers: every write goes through the real HTTP API as a named account; SQL is read-only (idempotency lookups + verification).
const fs = require('fs'); const path = require('path');
const lib = require('./lib');
const { call, sql, num } = lib;
const STATE_FILE = path.join(__dirname, 'out/demo-state.json');
const S = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};
const save = () => fs.writeFileSync(STATE_FILE, JSON.stringify(S, null, 1));
const log = [];
const q = (s) => String(s).replace(/'/g, "''");
const idOf = (table, col, val, extra = '') => { const v = sql(`select id from ${table} where ${col}='${q(val)}' ${extra} order by id limit 1`); return v ? Number(v) : null; };
let current = 'setup';
const section = (n) => { current = n; console.log(`\n=== ${n}`); };
// act: perform one API call as `role`, record expected-vs-actual
function record(role, method, p, o, r) {
  const expect = [].concat(o.expect || [200, 201]);
  const ok = expect.includes(r.status);
  const entry = { role: o.asRole || role, module: o.module || p.split('/')[2], action: o.label || `${method} ${p.replace(/\/\d+/g, '/:id')}`, expected: `HTTP ${expect.join('/')}`, actual: `HTTP ${r.status}${r.code ? ' ' + r.code : ''}`, result: ok ? 'PASS' : 'FAIL', evidence: ok ? (o.evidence || '') : JSON.stringify(r.body).slice(0, 220), section: current, forbidden: !!o.forbidden };
  log.push(entry); console.log(`${ok ? 'PASS' : 'FAIL'}  [${role}] ${entry.action} -> ${entry.actual}${ok ? '' : ' ' + entry.evidence}`);
  return r;
}
async function act(role, method, p, body, o = {}) { return record(role, method, p, o, await call(role, method, p, body, o.headers || {})); }
// actAs: try the logical role first; on 403 record a FINDING and retry with the next closest account-holding role
async function actAs(roles, method, p, body, o = {}) {
  let r;
  for (let i = 0; i < roles.length; i++) {
    const last = i === roles.length - 1;
    r = await call(roles[i], method, p, body, o.headers || {});
    if (r.status === 403 && !last) {
      const e = { role: roles[i], module: o.module || p.split('/')[2], action: o.label || `${method} ${p}`, expected: 'HTTP 2xx (logical owner of this step)', actual: 'HTTP 403', result: 'FINDING', evidence: `logical role cannot perform step; used ${roles[i + 1]} instead`, section: current };
      log.push(e); console.log(`FIND  [${roles[i]}] ${e.action} -> 403, falling back to ${roles[i + 1]}`); continue;
    }
    return record(roles[i], method, p, o, r);
  }
  return r;
}
// approveUntil: drive an approval chain; each round the first candidate role the workflow accepts advances it (the workflow decides who is next)
async function approveUntil(path, statusSql, targets, candidates, body = { decision: 'approve' }, label = path, max = 8) {
  const want = [].concat(targets);
  let st = sql(statusSql); const trail = [];
  for (let i = 0; i < max && !want.includes(st); i++) {
    let moved = false;
    for (const c of candidates) {
      const r = await call(c, 'POST', path, body);
      const st2 = sql(statusSql);
      if (r.status < 300 && st2 !== st) { trail.push(`${c}:${st}->${st2}`); st = st2; moved = true; break; }
      if (r.status < 300) { trail.push(`${c}:${st}(no change)`); }
    }
    if (!moved) break;
  }
  const ok = want.includes(st);
  log.push({ role: trail.length ? trail[trail.length - 1].split(':')[0] : candidates[0], module: path.split('/')[2], action: `${label} (${body.decision})`, expected: `status in [${want}]`, actual: `status=${st}`, result: ok ? 'PASS' : 'FAIL', evidence: trail.join(' | '), section: current });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} (${body.decision}) -> status=${st}  ${trail.join(' | ')}`);
  return ok;
}
// check: an assertion that is not an HTTP call (read-back, totals, notification, activity log)
function check(name, ok, evidence = '', role = '-', module = '-') {
  const entry = { role, module, action: 'VERIFY ' + name, expected: 'true', actual: String(!!ok), result: ok ? 'PASS' : 'FAIL', evidence: String(evidence).slice(0, 220), section: current };
  log.push(entry); console.log(`${ok ? 'PASS' : 'FAIL'}  VERIFY ${name}${ok ? '' : ' -> ' + evidence}`); return ok;
}
// read-back through the API as `role`: the record must exist, with the expected field values
async function readBack(role, p, expectFields = {}, name) {
  const r = await call(role, 'GET', p);
  const d = r.data && !Array.isArray(r.data) ? (r.data.rows ? r.data.rows[0] : r.data) : (Array.isArray(r.data) ? r.data[0] : null);
  let ok = r.status === 200 && !!d; const bad = [];
  for (const [k, v] of Object.entries(expectFields)) { if (d && String(d[k]) !== String(v)) { ok = false; bad.push(`${k}=${d && d[k]} want ${v}`); } }
  check(name || `read back ${p}`, ok, ok ? '' : `HTTP ${r.status} ${bad.join('; ')}`, role, p.split('/')[2]);
  return d;
}
// activity/audit/notification evidence since a snapshot
const snap = () => ({ audit: Number(sql('select count(*) from audit_events')), act: Number(sql('select count(*) from activity_log')), notif: Number(sql('select count(*) from notifications')) });
function evidenceSince(s0, name, { notif = false } = {}) {
  const s1 = snap();
  check(`${name}: audit/activity entry written`, s1.audit > s0.audit || s1.act > s0.act, `audit +${s1.audit - s0.audit}, activity_log +${s1.act - s0.act}`);
  if (notif) check(`${name}: notification created`, s1.notif > s0.notif, `notifications +${s1.notif - s0.notif}`);
  return s1;
}
const finish = () => {
  const stamp = new Date().toISOString();
  fs.appendFileSync(path.join(__dirname, 'out/seed-log.jsonl'), log.map((l) => JSON.stringify({ ...l, run: stamp, script: path.basename(process.argv[1]) })).join('\n') + (log.length ? '\n' : ''));
  save(); const f = log.filter((l) => l.result === 'FAIL');
  console.log(`\n${log.length - f.length}/${log.length} passed (FINDING rows: ${log.filter((l) => l.result === 'FINDING').length})`); f.forEach((x) => console.log('  FAILED:', x.section, '|', x.action, x.actual, x.evidence.slice(0, 120)));
};
module.exports = { ...lib, S, save, log, act, actAs, approveUntil, check, readBack, snap, evidenceSince, idOf, q, section, finish };
