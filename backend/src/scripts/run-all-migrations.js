// Phase 26 — run ALL phase migrations in order.
//
// setupDb.js creates only the Phase-0 base schema; every later phase shipped
// its own migrate-N.js script that had to be run manually, so a fresh
// database never converged without tribal knowledge. This runner executes
// every migration in order; each script is idempotent (CREATE TABLE IF NOT
// EXISTS / guarded ALTERs), so re-running is safe.
//
// Run: node src/scripts/run-all-migrations.js
//   --dry-run   list the migrations without running them

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Ordered: base schema first, then phases in commit order.
const MIGRATIONS = [
  'setupDb.js',
  'migrate-1.3.js', 'migrate-1.4.js', 'migrate-2.1.js', 'migrate-2.2.js',
  'migrate-3.js', 'migrate-4.js', 'migrate-5.2.js', 'migrate-7.js',
  'migrate-8.js', 'migrate-9.js', 'migrate-10.js', 'migrate-11.js',
  'migrate-12.js', 'migrate-13.js', 'migrate-14.js', 'migrate-15.js',
  'policy-migration.js', 'migrate-16.js', 'organizations-migration.js',
  'migrate-16-organizations.js', 'migrate-17-policy-engine.js',
  'migrate-18-project-wizard.js', 'project-wizard-migration.js',
  'migrate-19-workflow-engine.js', 'workflow-engine-migration.js',
  'migrate-20-action-engine.js', 'action-engine-migration.js',
  'migrate-21-locations-quantities.js', 'location-quantity-migration.js',
  'migrate-22-material-planning.js', 'material-planning-migration.js',
  'migrate-23-inventory.js', 'inventory-migration.js',
  'migrate-24-replenishment.js', 'replenishment-migration.js',
  'migrate-25-procurement.js', 'procurement-migration.js',
  'migrate-26-commercial.js', 'commercial-migration.js',
  'migrate-27-finance.js', 'finance-migration.js',
  'migrate-28-site.js', 'site-migration.js',
  'migrate-29-consultant.js', 'consultant-migration.js',
  'migrate-30-portals.js', 'portal-migration.js',
  'migrate-31-qaqc.js', 'qaqc-migration.js',
  'migrate-32-hse.js', 'hse-migration.js',
  'migrate-33-doccontrol.js', 'doccontrol-migration.js',
  'migrate-34-planning.js', 'planning-migration.js',
  'migrate-35-reporting.js', 'reporting-migration.js',
  'migrate-36-handover.js', 'handover-migration.js',
  'migrate-37-external-api.js', 'migrate-38-agent-layer.js',
  'migrate-39-project-scope-hardening.js',
];

function runScript(script) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], { stdio: 'inherit' });
    child.on('exit', (code) => resolve(code || 0));
  });
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) {
    console.log('Migrations that would run:');
    MIGRATIONS.forEach((m) => console.log('  ' + m));
    process.exit(0);
  }
  for (const file of [...new Set(MIGRATIONS)]) {
    const script = path.join(__dirname, file);
    if (!fs.existsSync(script)) {
      console.warn(`[migrate] missing (skipped): ${file}`);
      continue;
    }
    console.log(`[migrate] ${file} ...`);
    const exit = await runScript(script);
    if (exit !== 0) {
      console.error(`[migrate] FAILED: ${file} (exit ${exit}) — stopping, later phases depend on earlier ones`);
      process.exit(1);
    }
  }
  console.log('[migrate] all migrations completed');
  process.exit(0);
}

if (require.main === module) {
  run().catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { MIGRATIONS, run, runScript };
