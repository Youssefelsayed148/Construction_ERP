'use strict';
// Contract: for every account (its real visibility flags and role keys) and every masked mount's real full-access response, the masked response keeps
// the SAME key structure; only primitive money leaves may be withheld, and every value that remains is unchanged. A withheld section (object/array)
// would crash screens that read into it (the dashboard `modules.expenses` regression), so structure loss is a failure.
// Fixtures: e2e/role-testing/capture-contract-fixtures.js (read-only capture of the live full-access responses).
const fs = require('fs');
const path = require('path');
const { maskPayload, RULES } = require('../valueMasking');

const FIXTURE = path.join(__dirname, 'fixtures', 'masking-contract.json');
const fx = fs.existsSync(FIXTURE) ? JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) : null;
const describeIf = fx ? describe : describe.skip;
const isNode = (v) => v !== null && typeof v === 'object';

// every path of the document; array elements share the path `[]` so a row-by-row comparison is not needed
function walk(v, p, out) {
  if (Array.isArray(v)) { out.set(p, 'array'); v.forEach((x) => walk(x, `${p}[]`, out)); } else if (isNode(v)) { out.set(p, 'object'); for (const k of Object.keys(v)) walk(v[k], `${p}.${k}`, out); } else if (!out.has(p)) out.set(p, 'leaf');
  return out;
}
function compare(full, masked, p, problems) {
  if (Array.isArray(full)) {
    if (!Array.isArray(masked)) { problems.push(`${p}: array became ${typeof masked}`); return; }
    if (masked.length !== full.length) problems.push(`${p}: array length ${full.length} -> ${masked.length}`);
    full.forEach((x, i) => compare(x, masked[i], `${p}[${i}]`, problems));
    return;
  }
  if (isNode(full)) {
    if (!isNode(masked) || Array.isArray(masked)) { problems.push(`${p}: section removed or changed type`); return; }
    for (const k of Object.keys(full)) {
      if (!(k in masked)) { if (isNode(full[k])) problems.push(`${p}.${k}: section removed (only primitive leaves may be withheld)`); continue; }
      compare(full[k], masked[k], `${p}.${k}`, problems);
    }
    for (const k of Object.keys(masked)) if (!(k in full)) problems.push(`${p}.${k}: key appeared`);
    return;
  }
  if (masked !== full) problems.push(`${p}: value changed ${JSON.stringify(full)} -> ${JSON.stringify(masked)}`);
}

describeIf('value masking contract: same structure, values withheld only', () => {
  test('fixture covers the masked mounts and every account', () => {
    const mounts = new Set(fx.payloads.map((x) => x.mount));
    expect(fx.roles.length).toBeGreaterThanOrEqual(30);
    for (const m of ['dashboard', 'invoices', 'boq', 'hr', 'finance']) expect(mounts.has(m)).toBe(true);
    for (const m of mounts) expect(Object.keys(RULES)).toContain(m);
  });

  test.each((fx ? fx.roles : []).map((r) => [r.account, r]))('%s: masked payloads keep the full-access structure', (_name, role) => {
    const problems = [];
    for (const pl of fx.payloads) {
      const masked = maskPayload(pl.body, pl.mount, role.flags, role.role_keys);
      compare(pl.body, masked, `${pl.endpoint}`, problems);
    }
    expect(problems).toEqual([]);
  });

  test('a role with no flag and no allowed role loses values but never structure (worst case)', () => {
    const problems = [];
    for (const pl of fx.payloads) {
      const masked = maskPayload(pl.body, pl.mount, {}, []);
      compare(pl.body, masked, pl.endpoint, problems);
      const before = walk(pl.body, '', new Map()); const after = walk(masked, '', new Map());
      for (const [p, kind] of after) if (kind !== 'leaf') expect(before.get(p)).toBe(kind); // no node appears or changes kind
    }
    expect(problems).toEqual([]);
  });
});
