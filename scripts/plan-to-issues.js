// Turns each "- [ ]" item in docs/ERP_CLOSEOUT_PLAN.md into an issue spec.
//
//   node scripts/plan-to-issues.js            dry run: print a summary, write nothing outside stdout
//   node scripts/plan-to-issues.js --json     print the full list as JSON
//   node scripts/plan-to-issues.js --create   create the issues with the gh CLI (public side effect)
//
// Labels: phase:N (or phase:10-L3 style), severity:critical|high|medium when the section heading says so.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const plan = fs.readFileSync(path.join(__dirname, '..', 'docs', 'ERP_CLOSEOUT_PLAN.md'), 'utf8').split('\n');
const issues = [];
let phase = null;
let section = '';
let severity = null;

for (const line of plan) {
  const ph = line.match(/^## Phase (\d+):/);
  if (ph) { phase = ph[1]; section = ''; severity = null; continue; }
  if (/^## /.test(line)) { phase = null; continue; }
  const sub = line.match(/^(\d+\.\d+|L\d+) (.+)$/);
  if (sub && phase !== null) {
    section = `${sub[1]} ${sub[2]}`;
    const sev = sub[2].match(/\((Critical|High|Medium)(?:\/(High))?\)/i);
    severity = sev ? sev[1].toLowerCase() : null;
    continue;
  }
  const item = line.match(/^\s*- \[ \] (.+)$/);
  if (item && phase !== null) {
    const labels = [`phase:${phase}`];
    if (severity) labels.push(`severity:${severity}`);
    issues.push({ title: `[P${phase}${section ? ` ${section.split(' ')[0]}` : ''}] ${item[1].slice(0, 100)}`, body: `${item[1]}\n\nPlan section: ${section || `Phase ${phase}`}\nSource: docs/ERP_CLOSEOUT_PLAN.md`, labels });
  }
}

const args = process.argv.slice(2);
if (args.includes('--json')) {
  console.log(JSON.stringify(issues, null, 2));
} else if (args.includes('--create')) {
  for (const i of issues) {
    execFileSync('gh', ['issue', 'create', '--title', i.title, '--body', i.body, ...i.labels.flatMap((l) => ['--label', l])], { stdio: 'inherit' });
  }
} else {
  const byPhase = {};
  issues.forEach((i) => { byPhase[i.labels[0]] = (byPhase[i.labels[0]] || 0) + 1; });
  console.log(`${issues.length} issues from the plan`, byPhase);
  console.log('Dry run. Use --create to open them on GitHub (labels must exist first).');
}
