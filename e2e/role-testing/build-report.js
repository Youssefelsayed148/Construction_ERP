// Merges every result file into /root/construction-erp/results.json and TEST_REPORT.md
const fs = require('fs'); const path = require('path');
const O = (f) => path.join(__dirname, 'out', f);
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(O(f), 'utf8')); } catch { return d; } };
const access = read('access-results.json', { roles: [], mods: [], expectedMatrix: {}, results: [] });
const forb = read('forbidden-results.json', []); const vis = read('visibility-results.json', []); const ui = read('ui-results.json', []);
const seedLines = fs.existsSync(O('seed-log.jsonl')) ? fs.readFileSync(O('seed-log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
// the seed log has one row per run; keep the LAST outcome per (script, section, action) so a fixed-and-rerun step counts once
const last = new Map(); for (const l of seedLines) last.set(`${l.script}|${l.section}|${l.action}|${l.role}`, l);
// a failure that a later run of the same step superseded is history, not a current result
const seed = [...last.values()].filter((l) => !/^FAIL$/.test(l.result) || true);
const rows = [];
const push = (r) => rows.push({ role: r.role, module: r.module, action: r.action, expected: r.expected, actual: r.actual, result: r.result, evidence: r.evidence || '' });
// the one access run returned 401 for every call (login/session failure, not a policy result): record as NOT RUN, never as pass/fail
for (const r of access.results) push(r.actual === '401' ? { ...r, actual: '401 (no session)', result: 'NOT RUN', evidence: 'access run invalid: every call answered 401 (login/rate-limit); expectation kept from DB grants: ' + (r.expected || '') } : r);
for (const r of forb) push({ ...r, action: r.action });
for (const r of vis) push(r);
for (const r of seed) push({ role: r.role, module: r.module, action: r.action, expected: r.expected, actual: r.actual, result: r.result, evidence: `[${r.section}] ${r.evidence || ''}` });
for (const r of ui) push({ ...r, evidence: `${r.evidence || ''} ${r.screenshot || ''}`.trim() });
for (const r of access.roles.filter((x) => !x.account)) for (const m of access.mods) rows.push({ role: r.key, module: m, action: 'GET (module list)', expected: access.expectedMatrix[r.key]?.[m] === 'Y' ? 'allow' : 'deny', actual: '-', result: 'SKIPPED: ACCOUNT NOT FOUND', evidence: `${r.kind} role has no seeded account; expected value derived from DB grants only` });
const count = (f) => rows.filter(f).length;
const summary = { total: rows.length, pass: count((r) => r.result === 'PASS'), fail: count((r) => r.result === 'FAIL'), finding: count((r) => r.result === 'FINDING'), skipped: count((r) => r.result.startsWith('SKIPPED')), na: count((r) => r.result === 'N/A'), not_run: count((r) => r.result === 'NOT RUN') };
fs.writeFileSync(path.join(__dirname, '../../results.json'), JSON.stringify({ generated_at: new Date().toISOString(), summary, results: rows }, null, 1));
console.log(summary);
module.exports = { rows, summary, access, forb, vis, ui, seed };
