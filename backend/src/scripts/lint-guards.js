// Grep-based regression guards (Phase 0). Counts may only go down.
//
//   node src/scripts/lint-guards.js            check against lint-guards.baseline.json
//   node src/scripts/lint-guards.js --update   lower the baseline after removing violations
//
// Rules
//   silent-catch  empty .catch(() => {}) in migration scripts (a failed migration step must be fatal)
//   count-numbering  COUNT(*)+1 / MAX(..)+1 document numbering (use the numbering service, Phase 2.4)
//
// The baseline is per file. A file may not exceed its recorded count, and a file
// with no entry may not have any. A site is a COUNT(/MAX( line with "+ 1" in the same
// line or the next 3. The Phase 2.4 replacement list is the authority for what must go.
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..');
const baselinePath = path.join(__dirname, '..', '..', 'lint-guards.baseline.json');

const SILENT_CATCH = /\.catch\(\s*\(\s*\w*\s*\)\s*=>\s*\{\s*\}\s*\)/g;
// A COUNT(*)/MAX( query with a "+ 1" on the same line or within the next 3 lines.
const NUMBER_SOURCE = /\b(?:COUNT|MAX)\(/i;
const PLUS_ONE = /\+\s*1\b/;
const WINDOW = 3;

const isMigration = (rel) =>
  /^scripts\/(migrate-[^/]+|[^/]+-migration|setupDb)\.js$/.test(rel);
const isExcluded = (rel) =>
  /(^|\/)(__tests__|test-helpers)\//.test(rel) ||
  /^scripts\/(seed-|reconcile-|review-|create-|cleanup-|verify-)/.test(rel) ||
  rel === 'scripts/lint-guards.js';

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function scan() {
  const result = { 'silent-catch': {}, 'count-numbering': {} };
  for (const file of walk(srcDir)) {
    const rel = path.relative(srcDir, file).split(path.sep).join('/');
    if (isExcluded(rel)) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    let silent = 0;
    let numbering = 0;
    for (const line of lines) {
      if (isMigration(rel)) silent += (line.match(SILENT_CATCH) || []).length;
    }
    for (let i = 0; i < lines.length; i += 1) {
      if (!NUMBER_SOURCE.test(lines[i])) continue;
      if (PLUS_ONE.test(lines.slice(i, i + WINDOW + 1).join(' '))) numbering += 1;
    }
    if (silent) result['silent-catch'][rel] = silent;
    if (numbering) result['count-numbering'][rel] = numbering;
  }
  return result;
}

function compare(current, baseline) {
  const failures = [];
  const improvements = [];
  for (const rule of Object.keys(current)) {
    const base = baseline[rule] || {};
    const files = new Set([...Object.keys(current[rule]), ...Object.keys(base)]);
    for (const f of files) {
      const now = current[rule][f] || 0;
      const was = base[f] || 0;
      if (now > was) failures.push(`${rule}: ${f} has ${now}, baseline allows ${was}`);
      else if (now < was) improvements.push(`${rule}: ${f} dropped ${was} -> ${now}`);
    }
  }
  return { failures, improvements };
}

function main() {
  const current = scan();
  if (process.argv.includes('--update')) {
    fs.writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`);
    console.log(`baseline written: ${baselinePath}`);
    return 0;
  }
  const baseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : {};
  const { failures, improvements } = compare(current, baseline);
  improvements.forEach((m) => console.log(`improved  ${m} (run with --update to lock it in)`));
  if (failures.length) {
    failures.forEach((m) => console.error(`FAIL  ${m}`));
    console.error('New silent migration catches or COUNT/MAX numbering are not allowed. See docs/ERP_CLOSEOUT_PLAN.md Phase 0 / 2.4.');
    return 1;
  }
  console.log('lint-guards: ok');
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { scan, compare };
