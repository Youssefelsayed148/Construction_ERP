'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const c = require('./sweep-common');
const tables = ['users', 'projects', 'purchase_orders', 'goods_receipt_notes', 'journal_entries'];
function run(args, options = {}) {
  const result = spawnSync('docker', args, { cwd: c.root, stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`Docker step failed (exit ${result.status}); inspect redacted local evidence before retry`);
}
async function main() {
  const phase = process.argv[2];
  if (phase === 'prepare') {
    c.ignored('.env.sweep'); c.ignored('.sweep/pilot.sql');
    fs.mkdirSync(c.artifacts, { recursive: true });
    const envPath = path.join(c.root, '.env.sweep');
    const env = { APP_ENV: 'staging', DB_HOST: '127.0.0.1', DB_PORT: '55441', DB_NAME: 'construction_erp_sweep', DB_USER: 'construction_erp_sweep_user', DB_PASSWORD: crypto.randomBytes(48).toString('hex'), JWT_SECRET: crypto.randomBytes(64).toString('hex'), WEBHOOK_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'), FRONTEND_URL: 'http://127.0.0.1:8091', CORS_ALLOW_HTTP_LOCAL: 'true', AUTH_RATE_LIMIT_PER_15_MIN: '10000' };
    c.assertClone({ baseUrl: env.FRONTEND_URL, dbName: env.DB_NAME });
    fs.writeFileSync(envPath, Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
    const model = JSON.parse(c.docker(['compose', '--project-name', c.PROJECT, '--env-file', envPath, 'config', '--format', 'json']));
    model.name = c.PROJECT;
    model.services.frontend.ports = [{ target: 80, published: '8091', host_ip: '127.0.0.1', protocol: 'tcp' }];
    for (const service of Object.values(model.services)) service.networks = { default: null };
    model.networks = { default: { name: `${c.PROJECT}_default`, internal: true }, ingress: { name: `${c.PROJECT}_ingress` } };
    // Docker Desktop does not publish ports from internal-only networks. The API stays isolated;
    // only nginx and PostgreSQL join the host-facing network as well.
    model.services.db.networks.ingress = null;
    model.services.frontend.networks.ingress = null;
    for (const [key, volume] of Object.entries(model.volumes)) volume.name = `${c.PROJECT}_${key}`;
    fs.writeFileSync(path.join(c.artifacts, 'compose.json'), JSON.stringify(model, null, 2) + '\n', { mode: 0o600 });
    console.log('Prepared ignored clone configuration; isolated internal network blocks external adapters.');
  } else if (phase === 'dump') {
    c.config();
    // Exactly ONE pilot invocation. wx makes accidental repeat fail before docker starts.
    const dump = fs.openSync(path.join(c.artifacts, 'pilot.sql'), 'wx', 0o600);
    try { run(['exec', 'erp-closeout-pilot-20261013-db-1', 'sh', '-c', 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl'], { stdio: ['ignore', dump, 'pipe'] }); }
    finally { fs.closeSync(dump); }
    const counts = Object.fromEntries(tables.map(table => [table, 0]));
    let active;
    for (const line of fs.readFileSync(path.join(c.artifacts, 'pilot.sql'), 'utf8').split('\n')) {
      const match = line.match(/^COPY public\.(\w+) /);
      if (match) active = match[1];
      else if (line === '\\.') active = null;
      else if (Object.hasOwn(counts, active)) counts[active]++;
    }
    c.save('pilot-counts.json', { source: 'COPY rows in single pg_dump snapshot; no separate pilot queries', counts });
    console.log(JSON.stringify({ pilotSnapshotCounts: counts }));
  } else if (phase === 'start-db') { c.config(); run([...c.composeArgs(), 'up', '-d', '--wait', 'db']);
  } else if (phase === 'restore') {
    c.config();
    const input = fs.openSync(path.join(c.artifacts, 'pilot.sql'), 'r');
    try { run([...c.composeArgs(), 'exec', '-T', 'db', 'sh', '-c', 'exec psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], { stdio: [input, 'ignore', 'pipe'] }); }
    finally { fs.closeSync(input); }
    console.log('Dump restored into sweep clone.');
  } else if (phase === 'build') { c.config(); run([...c.composeArgs(), 'build', 'migrate', 'backend', 'frontend']);
  } else if (phase === 'start') { c.config(); run([...c.composeArgs(), 'up', '-d', '--wait', '--wait-timeout', '180']);
  } else if (phase === 'verify') {
    const clone = Object.fromEntries(tables.map(table => [table, c.sql(`SELECT to_json(count(*)) FROM ${table}`)[0]]));
    const pilot = JSON.parse(fs.readFileSync(path.join(c.artifacts, 'pilot-counts.json'), 'utf8')).counts;
    const auth = await c.login(c.credentials().find(account => account.key === 'owner_ceo'));
    const result = { pilotSnapshotCounts: pilot, cloneCounts: clone, match: JSON.stringify(clone) === JSON.stringify(pilot), login: Boolean(auth.token) };
    c.save('clone.json', result); console.log(JSON.stringify(result));
    if (!result.match) throw new Error('Clone snapshot counts differ');
  } else throw new Error('Expected prepare|dump|start-db|restore|build|start|verify');
}
if (require.main === module) main().catch(() => { console.error('Clone phase failed; credentials and raw process errors suppressed. Stop after two failed attempts at the same step.'); process.exitCode = 1; });
