// Grep-based regression guards (Phase 0). Counts may only go down.
//
//   node src/scripts/lint-guards.js            check against lint-guards.baseline.json
//   node src/scripts/lint-guards.js --update   lower the baseline after removing violations
//
// Rules
//   silent-catch  empty .catch(() => {}) in migration scripts (a failed migration step must be fatal)
//   count-numbering  COUNT(*)+1 / MAX(..)+1 document numbering (use the numbering service, Phase 2.4)
//   counter-rmw  read-then-write sequence counters: `row.seq + 1` computed in JS, or
//                `UPDATE ... SET seq = $1` with a value the caller read earlier (use bumpCounter/nextNumber)
//   catch-to-zero  `.catch(() => ({ rows: [...] }))` / `.catch(() => zero(...))`: a failed query turned into an
//                  empty or zero result (closeout A2.4; failures surface as errors with context)
//   event-swallow  a fireEvent(...) call that is not awaited or returned, or is followed by .catch(...) (closeout A2.5:
//                  a failed enqueue is an error, never a lost event)
//   cost-view  project_costs read outside the cost accrual code and services/costView.js: totals come from the
//              shared cost view so dashboards, costing and the commercial engine never disagree (closeout A2.4)
//   mutation-without-audit  route SQL/known write helpers without a reachable business audit;
//              AST-based, per-file ratchet. Six endpoint exemptions: mutation-audit-exemptions.json.
//   raw-error-message  `res.status(..).json({ ..., error: e.message })` in routes/: a raw English server
//              string with no stable error_code. Convert to routeFail/typedFail (C2 error contract);
//              per-file ratchet, per-file baseline that may only go down.
//
// The baseline is per file. A file may not exceed its recorded count, and a file
// with no entry may not have any. A site is a COUNT(/MAX( line with "+ 1" in the same
// line or the next 3. The Phase 2.4 replacement list is the authority for what must go.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { mutationAuditViolations } = require('./mutation-audit-guard');

const srcDir = path.join(__dirname, '..');
const baselinePath = path.join(__dirname, '..', '..', 'lint-guards.baseline.json');
const repoDir = path.resolve(srcDir, '../..');

function countLiteralPasswords(text) {
  return text.split(/\r?\n/).filter((line) => {
    // Environment references/expressions and empty values are safe. Never return
    // the matched value: guard diagnostics must not expose credentials.
    const assignment = line.match(/^\s*(?:\$env:|\$|(?:export|set)\s+"?)?([\w]*password[\w]*)\s*=\s*(.*?)\s*$/i);
    if (!assignment) return false;
    const raw = assignment[2];
    const quoted = /^['"]/.test(raw);
    const value = raw.replace(/^['"]|['"]\s*;?$/g, '').trim();
    return value.length > 0 && !/[$%`]/.test(value)
      && (quoted || /^[^\s()[\]]+;?$/.test(value));
  }).length;
}

const SCRIPT_EXT = /\.(bat|cmd|ps1|sh)$/i;

function walkScripts(dir, root, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkScripts(full, root, out);
    else if (SCRIPT_EXT.test(entry.name)) out.push(path.relative(root, full));
  }
  return out;
}

// Tracked scripts come from git. Inside the Docker image build there is no git binary and no
// repository (the build context is backend/ only), so fall back to walking the backend tree.
function listScripts({ forceFallback = false } = {}) {
  try {
    if (forceFallback) throw new Error('git unavailable');
    const files = execFileSync('git', ['ls-files', '-z', '--', '*.bat', '*.cmd', '*.ps1', '*.sh'], {
      cwd: repoDir, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    }).split('\0').filter(Boolean);
    return { root: repoDir, files };
  } catch (err) {
    const backendDir = path.resolve(srcDir, '..');
    return { root: backendDir, files: walkScripts(backendDir, backendDir) };
  }
}

function scanScriptPasswords(options) {
  const { root, files } = listScripts(options);
  const violations = {};
  for (const file of files) {
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute)) continue;
    const count = countLiteralPasswords(fs.readFileSync(absolute, 'utf8'));
    if (count) violations[file] = count;
  }
  return violations;
}

function containsLegacyDbPassword(text) {
  return /NewStrongPassword\d{5}!/i.test(text);
}

// The backend-only Docker context has no repository above /app; repoDir resolves
// to / there, so anchor the fallback scan to the copied backend tree.
function findLegacyDbPasswordReferences(
  root = repoDir === path.parse(repoDir).root ? path.resolve(srcDir, '..') : repoDir,
  onWarning = (message) => console.warn(message),
) {
  const ignoredDirs = new Set(['.git', '.aws', '.codex', '.agents', 'node_modules', 'build', 'coverage', '.next']);
  const ignoredFiles = new Set(['.staging-users.json']);
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      onWarning(`WARN committed-default-password scan unreadable: ${path.relative(root, dir).split(path.sep).join('/') || '.'}`);
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.isFile() || ignoredFiles.has(entry.name) || /^\.env(?:\.|$)/i.test(entry.name)) continue;
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        onWarning(`WARN committed-default-password scan unreadable: ${path.relative(root, full).split(path.sep).join('/')}`);
        continue;
      }
      if (stat.size > 2 * 1024 * 1024) continue;
      let buffer;
      try {
        buffer = fs.readFileSync(full);
      } catch {
        onWarning(`WARN committed-default-password scan unreadable: ${path.relative(root, full).split(path.sep).join('/')}`);
        continue;
      }
      if (buffer.includes(0)) continue;
      const lines = buffer.toString('utf8').split(/\r?\n/);
      lines.forEach((line, index) => {
        if (containsLegacyDbPassword(line)) found.push(`${path.relative(root, full).split(path.sep).join('/')}:${index + 1}`);
      });
    }
  };
  walk(root);
  return found;
}

const SILENT_CATCH = /\.catch\(\s*\(\s*\w*\s*\)\s*=>\s*\{\s*\}\s*\)/g;
// A COUNT(*)/MAX( query with a "+ 1" on the same line or within the next 3 lines.
// Ignore JavaScript's Math.max; this rule targets SQL COUNT/MAX numbering queries.
const NUMBER_SOURCE = /(^|[^\w.])(?:COUNT|MAX)\(/i;
const PLUS_ONE = /\+\s*1\b/;
const WINDOW = 3;
function countNumbering(text) {
  const lines = text.split('\n');
  let count = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (!NUMBER_SOURCE.test(lines[i])) continue;
    if (PLUS_ONE.test(lines.slice(i, i + WINDOW + 1).join(' '))) count += 1;
  }
  return count;
}
// Counter-like column names: seq, next_value, last_value, next_number, counter, *_seq, *_counter.
// JS: `existing.seq + 1`, `Number(row.next_value) + 1`, `num(seq.seq) + 1`
const JS_COUNTER_PLUS_ONE = /\.(?:seq|next_value|last_value|next_number|last_number|counter|\w+_seq|\w+_counter)\)?\s*\+\s*1\b/i;
// SQL: SET seq = $1 (a bound value). `SET seq = seq + 1` is atomic and fine.
const SQL_SET_BOUND = /\bSET\s+(?:seq|next_value|last_value|next_number|last_number|counter|\w+_seq|\w+_counter)\s*=\s*\$\d/i;
const countCounterIncrements = (text) =>
  text.split(/\r?\n/).filter((l) => JS_COUNTER_PLUS_ONE.test(l) || SQL_SET_BOUND.test(l)).length;

const CATCH_TO_ZERO = /\.catch\(\s*\(\s*\w*\s*\)\s*=>\s*(?:\(\s*\{\s*rows\s*:|zero\()/g;
// C2: a raw English error response — the JSON body carries `error: e.message` and no
// stable error_code the frontend could localize. Lines that already answer with the
// contract (error_code / error_key / a typed helper) are compliant. Comments do not count.
const RAW_ERROR_MESSAGE = /\berror:\s*(?:e|err|error\d*)\s*\.\s*message\b/;
const TYPED_ERROR_LINE = /\b(?:error_code|error_key|routeFail|typedFail)\b/;
function countRawErrorMessages(text) {
  return text.split('\n').filter((l) => !/^\s*\/\//.test(l) && RAW_ERROR_MESSAGE.test(l) && !TYPED_ERROR_LINE.test(l)).length;
}
const POST_COMMIT_AUDIT = /\bawait\s+(?:logActivity|auditProc|auditFin)\s*\(/g;
// The replenishment sweep is a leader-locked, multi-step operation rather than
// one business-row transaction; its completion audit is intentionally separate.
function countUnboundActivityAudits(text, rel = '') {
  const call = /\bawait\s+logActivity\s*\(/g;
  let count = 0;
  let match;
  while ((match = call.exec(text))) {
    const end = text.indexOf(');', match.index);
    const statement = text.slice(match.index, end < 0 ? match.index + 2000 : end + 2);
    const sweepAuditException = rel === 'routes/materials.js' && /Manual replenishment sweep/.test(statement);
    if (!/\{\s*query\s*:/.test(statement) && !sweepAuditException) count += 1;
  }
  return count;
}
// Files that may name project_costs: the accrual writers and the cost view itself (expenses reads one row to
// know whether an expense is already posted).
const COST_VIEW_ALLOWED = new Set(['services/costView.js', 'services/costAccrual.js', 'services/costEventListener.js', 'routes/expenses.js']);
const isRuntimeCode = (rel) => /^(routes|services)\//.test(rel);

// fireEvent( calls that are fire-and-forget (no await/return/assignment on the line) or swallow a rejection.
function countEventSwallows(text) {
  const s = text.replace(/\r\n/g, '\n');
  let count = 0;
  let i = 0;
  while ((i = s.indexOf('fireEvent(', i)) >= 0) {
    const lineStart = s.lastIndexOf('\n', i) + 1;
    const prefix = s.slice(lineStart, i);
    if (/function\s+$/.test(prefix)) { i += 10; continue; } // a declaration, not a call
    let depth = 0; let k = i + 9;
    for (; k < s.length; k += 1) { if (s[k] === '(') depth += 1; if (s[k] === ')') { depth -= 1; if (depth === 0) break; } }
    const after = s.slice(k + 1, k + 30);
    const awaited = /\b(await|return)\b|=\s*$|\(\s*$/.test(prefix);
    if (!awaited || /^\s*\.catch\(/.test(after)) count += 1;
    i = k;
  }
  return count;
}

const isMigration = (rel) =>
  /^scripts\/(migrate-[^/]+|[^/]+-migration|setupDb)\.js$/.test(rel);
const isExcluded = (rel) =>
  /(^|\/)(__tests__|test-helpers)\//.test(rel) ||
  /^scripts\/(seed-|reconcile-|review-|create-|cleanup-|verify-)/.test(rel) ||
  rel === 'scripts/lint-guards.js' || rel === 'services/numbering.js';

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function scan() {
  const result = { 'silent-catch': {}, 'count-numbering': {}, 'counter-rmw': {}, 'catch-to-zero': {}, 'cost-view': {}, 'event-swallow': {}, 'post-commit-audit': {}, 'direct-project-id': {}, 'mutation-without-audit': {}, 'raw-error-message': {} };
  const auditCache = new Map();
  for (const file of walk(srcDir)) {
    const rel = path.relative(srcDir, file).split(path.sep).join('/');
    if (isExcluded(rel)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (['routes/procurement.js', 'routes/financeLedger.js'].includes(rel)) {
      const auditCalls = (text.match(POST_COMMIT_AUDIT) || []).length;
      if (auditCalls) result['post-commit-audit'][rel] = auditCalls;
    }
    if (rel.startsWith('routes/')) {
      const missingAudits = mutationAuditViolations(text, rel, { cache: auditCache, srcDir }).length;
      if (missingAudits) result['mutation-without-audit'][rel] = missingAudits;
      const projectReads = (text.match(/\b(?:req\.body|value)\.project_id\b/g) || []).length;
      if (projectReads) result['direct-project-id'][rel] = projectReads;
      const unboundAuditCalls = countUnboundActivityAudits(text, rel);
      if (unboundAuditCalls) result['post-commit-audit'][rel] = (result['post-commit-audit'][rel] || 0) + unboundAuditCalls;
      const rawErrors = countRawErrorMessages(text);
      if (rawErrors) result['raw-error-message'][rel] = rawErrors;
    }
    const lines = text.split('\n');
    let silent = 0;
    for (const line of lines) {
      if (isMigration(rel)) silent += (line.match(SILENT_CATCH) || []).length;
    }
    const numbering = countNumbering(text);
    if (silent) result['silent-catch'][rel] = silent;
    if (numbering) result['count-numbering'][rel] = numbering;
    if (isRuntimeCode(rel)) {
      const swallowed = countEventSwallows(text);
      if (swallowed) result['event-swallow'][rel] = swallowed;
      const zeros = (text.match(CATCH_TO_ZERO) || []).length;
      if (zeros) result['catch-to-zero'][rel] = zeros;
      if (!COST_VIEW_ALLOWED.has(rel)) {
        // Comments do not count.
        const reads = lines.filter((l) => /\bproject_costs\b/.test(l.replace(/\/\/.*/, ''))).length;
        if (reads) result['cost-view'][rel] = reads;
      }
    }
    const rmw = countCounterIncrements(text);
    if (rmw) result['counter-rmw'][rel] = rmw;
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
  const weakPasswordRefs = findLegacyDbPasswordReferences();
  if (weakPasswordRefs.length) {
    weakPasswordRefs.forEach((location) => console.error(`FAIL  committed-default-password: ${location}`));
    return 1;
  }
  // This rule is never baselined: tracked script credentials always fail,
  // including with --update. Output filenames and counts only.
  const passwords = scanScriptPasswords();
  if (Object.keys(passwords).length) {
    for (const [file, count] of Object.entries(passwords)) {
      console.error(`FAIL  script-password: ${file} has ${count} literal password assignment(s)`);
    }
    return 1;
  }
  const current = scan();
  if (Object.keys(current['direct-project-id']).length) {
    for (const [file, count] of Object.entries(current['direct-project-id'])) {
      console.error(`FAIL  direct-project-id: ${file} has ${count} reads outside the authorized helper`);
    }
    return 1; // Strict zero rule; --update cannot baseline these reads.
  }
  const baseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : {};
  const { failures, improvements } = compare(current, baseline);
  // A rule's first baseline (category absent) may be written; afterwards --update refuses any increase.
  const firstBaselineAllowed = new Set(['mutation-without-audit', 'raw-error-message']);
  const blocking = failures.filter((m) => !firstBaselineAllowed.has(m.split(':')[0]));
  if (process.argv.includes('--update') && !blocking.length) {
    fs.writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`);
    console.log(`baseline written: ${baselinePath}`);
    return 0;
  }
  improvements.forEach((m) => console.log(`improved  ${m} (run with --update to lock it in)`));
  if (failures.length) {
    failures.forEach((m) => console.error(`FAIL  ${m}`));
    console.error('New silent migration catches, COUNT/MAX numbering or read-then-write counters are not allowed. See docs/ERP_CLOSEOUT_PLAN.md Phase 0 / 2.4.');
    return 1;
  }
  console.log('lint-guards: ok');
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { scan, compare, countNumbering, countCounterIncrements, countEventSwallows, countUnboundActivityAudits, countLiteralPasswords, scanScriptPasswords, containsLegacyDbPassword, findLegacyDbPasswordReferences };
