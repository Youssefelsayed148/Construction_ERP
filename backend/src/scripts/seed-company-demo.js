'use strict';

// This entry point never imports or runs seed-staging.main and never loads dotenv.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { Pool } = require('pg');
const { assertDemoTarget, composeArguments, resetArguments, demoRequest, ensureRecord, accountDefinitions } = require('./company-demo-common');
const ROOT = path.resolve(__dirname, '../../..');
const TARGET = Object.freeze({ projectName: 'erp-demo-20261017', baseUrl: 'http://127.0.0.1:8092',
  dbName: 'construction_erp_demo', dbHost: '127.0.0.1', dbPort: '55442' });

function ignored(file, root = ROOT) {
  execFileSync('git', ['check-ignore', '--quiet', file], { cwd: root, stdio: 'ignore', windowsHide: true });
}

function initializeDemo({ root = ROOT, ignored: checkIgnored = ignored, exists = fs.existsSync, write = fs.writeFileSync } = {}) {
  assertDemoTarget(TARGET);
  for (const file of ['.env.demo', '.demo-users.json', '.demo/results.json']) checkIgnored(file, root);
  for (const file of ['.env.demo', '.demo-users.json']) {
    if (exists(path.join(root, file))) throw new Error('Refusing demo: environment or credential file already exists');
  }
  const secret = () => crypto.randomBytes(36).toString('base64url');
  const accounts = accountDefinitions().map(definition => ({ ...definition,
    email: `demo-${definition.key}@demo.example.com`, password: secret() }));
  const env = { APP_ENV: 'staging', DB_HOST: TARGET.dbHost, DB_PORT: TARGET.dbPort, DB_NAME: TARGET.dbName,
    DB_USER: 'company_demo', DB_PASSWORD: secret(), JWT_SECRET: secret(), WEBHOOK_ENCRYPTION_KEY: secret(),
    FRONTEND_URL: TARGET.baseUrl, DEFAULT_OWNER_PASSWORD: accounts.find(row => row.key === 'workflow_owner').password };
  write(path.join(root, '.env.demo'), Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  write(path.join(root, '.demo-users.json'), JSON.stringify({ target: TARGET, accounts }, null, 2) + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { accounts: accounts.length };
}

function configuration() {
  for (const file of ['.env.demo', '.demo-users.json']) ignored(file);
  const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env.demo'), 'utf8').split(/\r?\n/).filter(Boolean).map(line => {
    const split = line.indexOf('=');
    if (split < 1) throw new Error('Refusing demo: malformed environment');
    return [line.slice(0, split), line.slice(split + 1)];
  }));
  const target = { projectName: TARGET.projectName, baseUrl: env.FRONTEND_URL, dbName: env.DB_NAME, dbHost: env.DB_HOST, dbPort: env.DB_PORT };
  assertDemoTarget(target);
  if (env.APP_ENV !== 'staging' || !env.DB_USER || !env.DB_PASSWORD) throw new Error('Refusing demo: incomplete credentials');
  return { target, env };
}

function compose(target, args) {
  assertDemoTarget(target);
  return execFileSync('docker', [...composeArguments(target), ...args], { cwd: ROOT, encoding: 'utf8', windowsHide: true,
    timeout: 180000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

function assertAvailablePorts() {
  if (process.platform !== 'win32') throw new Error('Refusing demo startup: Windows port-exclusion preflight required');
  const output = execFileSync('netsh', ['interface', 'ipv4', 'show', 'excludedportrange', 'protocol=tcp'], { encoding: 'utf8', windowsHide: true });
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+(\d+)/);
    if (match && [8092, 55442].some(port => port >= Number(match[1]) && port <= Number(match[2]))) {
      throw new Error('STOP Phase B: required demo port is excluded; do not alter the guard');
    }
  }
}

async function withDemoDatabase(work) {
  const { target, env } = configuration();
  assertDemoTarget(target);
  const pool = new Pool({ host: target.dbHost, port: Number(target.dbPort), database: target.dbName,
    user: env.DB_USER, password: env.DB_PASSWORD, connectionTimeoutMillis: 5000 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const identity = (await client.query('SELECT current_database() AS name')).rows[0];
    if (identity.name !== TARGET.dbName) throw new Error('Refusing demo: database identity mismatch');
    return await work(client.query.bind(client));
  } finally {
    try { await client.query('ROLLBACK'); } finally { client.release(); await pool.end(); }
  }
}

async function withDemoWriteDatabase(work) {
  const { target, env } = configuration();
  assertDemoTarget(target);
  const pool = new Pool({ host: target.dbHost, port: Number(target.dbPort), database: target.dbName,
    user: env.DB_USER, password: env.DB_PASSWORD, connectionTimeoutMillis: 5000 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const identity = (await client.query('SELECT current_database() AS name')).rows[0];
    if (identity.name !== TARGET.dbName) throw new Error('Refusing demo: database identity mismatch');
    const result = await work(client.query.bind(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* preserve original failure */ }
    throw error;
  } finally { client.release(); await pool.end(); }
}

function saveReport(name, result) {
  ignored('.demo/results.json');
  fs.mkdirSync(path.join(ROOT, '.demo'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, '.demo', name), JSON.stringify(result, null, 2) + '\n');
}

async function login(target, account) {
  const response = await demoRequest(target, '/api/auth/login', { method: 'POST', body: { email: account.email, password: account.password } });
  if (response.status !== 200 || !response.body?.data?.token) throw new Error(`Demo login ${account.key}: HTTP ${response.status}`);
  return response.body.data;
}

async function seedAccounts() {
  const { target } = configuration();
  const credentials = JSON.parse(fs.readFileSync(path.join(ROOT, '.demo-users.json'), 'utf8'));
  assertDemoTarget(credentials.target);
  const definitions = accountDefinitions();
  if (credentials.accounts.length !== 38 || definitions.some(row => !credentials.accounts.some(account => account.key === row.key))) {
    throw new Error('Refusing demo: incomplete account credential roster');
  }
  await withDemoDatabase(async () => {});
  const owner = credentials.accounts.find(row => row.key === 'workflow_owner');
  const { token } = await login(target, owner);
  const list = async () => {
    const response = await demoRequest(target, '/api/users?limit=200', { token });
    if (response.status !== 200 || !Array.isArray(response.body?.data)) throw new Error(`Demo GET /api/users: HTTP ${response.status}`);
    return response.body.data;
  };
  let created = 0;
  for (const account of credentials.accounts) {
    await ensureRecord({ field: 'email', key: account.email, list, create: async () => {
      const response = await demoRequest(target, '/api/auth/register', { method: 'POST', token,
        body: { name: `DEMO ${account.key}`, email: account.email, password: account.password, role: account.role } });
      if (response.status !== 201 || !response.body?.data?.id) throw new Error(`Demo register ${account.key}: HTTP ${response.status}`);
      created += 1; return response.body.data;
    } });
  }
  const rows = await list();
  const demoRows = rows.filter(row => row.email.endsWith('@demo.example.com'));
  if (demoRows.length !== 38) throw new Error('Demo account count invariant failed');
  let logins = 0;
  for (const account of credentials.accounts) { await login(target, account); logins += 1; }
  const result = { stage: 1, accounts: demoRows.length, created, logins, canonical: 33, compatibilityAndSafety: 5,
    assignments: 'Initial internal company seats; project-only/unassigned/expired seats configured in stage 2.',
    externalSends: 0, rawSqlWrites: 0 };
  saveReport('stage-1.json', result);
  return result;
}

async function main() {
  const action = process.argv[2] || '--accounts';
  if (action === '--init') { console.log(`Demo configuration initialized: ${initializeDemo().accounts} credential entries (values withheld).`); return; }
  const { target } = configuration();
  if (action === '--up') {
    assertAvailablePorts();
    compose(target, ['up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '150']);
    console.log('Demo Compose startup succeeded; no image build, pull or full test stage.'); return;
  }
  if (action === '--reset') {
    execFileSync('docker', resetArguments(target), { cwd: ROOT, stdio: 'pipe', windowsHide: true, timeout: 60000 });
    // The old checkpoint used .invalid addresses. Change only the demo roster after
    // its database has been removed; preserve passwords and the bootstrap secret.
    const file = path.join(ROOT, '.demo-users.json');
    const credentials = JSON.parse(fs.readFileSync(file, 'utf8'));
    assertDemoTarget(credentials.target);
    credentials.accounts = credentials.accounts.map(account => ({ ...account, email: `demo-${account.key}@demo.example.com` }));
    fs.writeFileSync(file, JSON.stringify(credentials, null, 2) + '\n', { mode: 0o600 });
    console.log('Only erp-demo-20261017 stopped and its volumes removed; demo email roster corrected, passwords preserved.'); return;
  }
  if (action === '--masters') {
    const credentials = JSON.parse(fs.readFileSync(path.join(ROOT, '.demo-users.json'), 'utf8'));
    assertDemoTarget(credentials.target);
    const { seedMasters, TARGET: mastersTarget } = require('./company-demo-masters');
    if (JSON.stringify(mastersTarget) !== JSON.stringify(target)) throw new Error('Refusing demo: masters target mismatch');
    const tokens = new Map();
    const request = async (account, route, options = {}) => {
      let session = tokens.get(account.key);
      if (!session) { session = await login(target, account); tokens.set(account.key, session); }
      return demoRequest(target, route, { ...options, token: session.token });
    };
    const result = await withDemoWriteDatabase((dbQuery) => seedMasters({ target, request, accounts: credentials.accounts, dbQuery }));
    saveReport('stage-2-masters.json', result);
    console.log(JSON.stringify(result));
    return;
  }
  if (action === '--procurement') {
    const credentials = JSON.parse(fs.readFileSync(path.join(ROOT, '.demo-users.json'), 'utf8'));
    assertDemoTarget(credentials.target);
    const { seedProcurement, TARGET: procurementTarget } = require('./company-demo-procurement');
    if (JSON.stringify(procurementTarget) !== JSON.stringify(target)) throw new Error('Refusing demo: procurement target mismatch');
    const tokens = new Map();
    const request = async (account, route, options = {}) => {
      let session = tokens.get(account.key);
      if (!session) { session = await login(target, account); tokens.set(account.key, session); }
      return demoRequest(target, route, { ...options, token: session.token });
    };
    const list = async (account, route) => {
      const response = await request(account, route);
      if (response.status !== 200 || !Array.isArray(response.body?.data)) throw new Error(`Demo list ${route}: HTTP ${response.status}`);
      return response.body.data;
    };
    const owner = credentials.accounts.find(row => row.key === 'workflow_owner');
    const [projects, suppliers, materials, warehouses] = await Promise.all([
      list(owner, '/api/projects?limit=200'), list(owner, '/api/suppliers?limit=200'),
      list(owner, '/api/items?limit=200'), list(owner, '/api/warehouses?limit=200'),
    ]);
    const result = await seedProcurement({ target, request, accounts: credentials.accounts,
      projects: projects.filter(row => String(row.code || '').startsWith('DEMO-PRJ-')),
      suppliers: suppliers.filter(row => String(row.code || '').startsWith('DEMO-SUP-')),
      materials: materials.filter(row => String(row.code || '').startsWith('DEMO-MAT-')),
      warehouses: warehouses.filter(row => String(row.name || '').startsWith('DEMO-2026-')) });
    saveReport('stage-3-procurement.json', result);
    console.log(JSON.stringify(result));
    return;
  }
  if (action === '--finance') {
    const credentials = JSON.parse(fs.readFileSync(path.join(ROOT, '.demo-users.json'), 'utf8'));
    assertDemoTarget(credentials.target);
    const { seedFinance, TARGET: financeTarget } = require('./company-demo-finance');
    if (JSON.stringify(financeTarget) !== JSON.stringify(target)) throw new Error('Refusing demo: finance target mismatch');
    const tokens = new Map();
    const request = async (account, route, options = {}) => {
      let session = tokens.get(account.key);
      if (!session) { session = await login(target, account); tokens.set(account.key, session); }
      return demoRequest(target, route, { ...options, token: session.token });
    };
    const owner = credentials.accounts.find(row => row.key === 'workflow_owner');
    const list = async route => {
      const response = await request(owner, route);
      if (response.status !== 200 || !Array.isArray(response.body?.data)) throw new Error(`Demo list ${route}: HTTP ${response.status}`);
      return response.body.data;
    };
    const projects = (await list('/api/projects?limit=200')).filter(row => String(row.code || '').startsWith('DEMO-PRJ-'));
    const [clients, suppliers, materials] = await Promise.all([
      list('/api/clients?limit=200'), list('/api/suppliers?limit=200'), list('/api/items?limit=200'),
    ]);
    const purchaseOrders = [];
    for (const project of projects) {
      const response = await request(owner, `/api/procurement/project/${project.id}?limit=200`);
      if (response.status !== 200) throw new Error(`Demo list /api/procurement/project/${project.id}: HTTP ${response.status}`);
      for (const row of response.body?.data?.purchase_orders || []) purchaseOrders.push({ ...row, project_id: project.id });
    }
    const result = await seedFinance({ target, request, accounts: credentials.accounts, projects,
      clients: clients.filter(row => String(row.code || '').startsWith('DEMO-CLI-')),
      suppliers: suppliers.filter(row => String(row.code || '').startsWith('DEMO-SUP-')),
      materials: materials.filter(row => String(row.code || '').startsWith('DEMO-MAT-')),
      purchaseOrders: purchaseOrders.filter(row => String(row.order_number || '').startsWith('PO-')) });
    saveReport('stage-4-finance.json', result);
    console.log(JSON.stringify(result));
    return;
  }
  if (action === '--hr') {
    const credentials = JSON.parse(fs.readFileSync(path.join(ROOT, '.demo-users.json'), 'utf8'));
    assertDemoTarget(credentials.target);
    const { seedHr, TARGET: hrTarget } = require('./company-demo-hr');
    if (JSON.stringify(hrTarget) !== JSON.stringify(target)) throw new Error('Refusing demo: HR target mismatch');
    const tokens = new Map();
    const request = async (account, route, options = {}) => {
      let session = tokens.get(account.key);
      if (!session) { session = await login(target, account); tokens.set(account.key, session); }
      return demoRequest(target, route, { ...options, token: session.token });
    };
    const owner = credentials.accounts.find(row => row.key === 'workflow_owner');
    const projectsResponse = await request(owner, '/api/projects?limit=200');
    if (projectsResponse.status !== 200 || !Array.isArray(projectsResponse.body?.data)) throw new Error(`Demo list /api/projects: HTTP ${projectsResponse.status}`);
    const projects = projectsResponse.body.data.filter(row => String(row.code || '').startsWith('DEMO-PRJ-'));
    const result = await seedHr({ target, request, accounts: credentials.accounts, projects });
    saveReport('stage-5-hr.json', result);
    console.log(JSON.stringify(result));
    return;
  }
  if (action === '--site-qhse') {
    const credentials = JSON.parse(fs.readFileSync(path.join(ROOT, '.demo-users.json'), 'utf8'));
    assertDemoTarget(credentials.target);
    const { seedSite, TARGET: siteTarget } = require('./company-demo-site');
    if (JSON.stringify(siteTarget) !== JSON.stringify(target)) throw new Error('Refusing demo: site/QHSE target mismatch');
    const tokens = new Map();
    const request = async (account, route, options = {}) => {
      let session = tokens.get(account.key);
      if (!session) { session = await login(target, account); tokens.set(account.key, session); }
      return demoRequest(target, route, { ...options, token: session.token });
    };
    const owner = credentials.accounts.find(row => row.key === 'workflow_owner');
    const projectsResponse = await request(owner, '/api/projects?limit=200');
    if (projectsResponse.status !== 200 || !Array.isArray(projectsResponse.body?.data)) throw new Error(`Demo list /api/projects: HTTP ${projectsResponse.status}`);
    const projects = projectsResponse.body.data.filter(row => String(row.code || '').startsWith('DEMO-PRJ-'));
    const result = await seedSite({ target, request, accounts: credentials.accounts, projects });
    saveReport('stage-6-site-qhse.json', result);
    console.log(JSON.stringify(result));
    return;
  }
  if (action === '--approval-limits') {
    const credentials = JSON.parse(fs.readFileSync(path.join(ROOT, '.demo-users.json'), 'utf8'));
    assertDemoTarget(credentials.target);
    const { seedApprovalLimits, TARGET: limitsTarget } = require('./company-demo-approval-limits');
    if (JSON.stringify(limitsTarget) !== JSON.stringify(target)) throw new Error('Refusing demo: approval-limits target mismatch');
    const tokens = new Map();
    const request = async (account, route, options = {}) => {
      let session = tokens.get(account.key);
      if (!session) { session = await login(target, account); tokens.set(account.key, session); }
      return demoRequest(target, route, { ...options, token: session.token });
    };
    const result = await seedApprovalLimits({ target, request, accounts: credentials.accounts });
    saveReport('stage-7-approval-limits.json', result);
    console.log(JSON.stringify(result));
    return;
  }
  if (action !== '--accounts') throw new Error('Refusing demo: unknown stage');
  console.log(JSON.stringify(await seedAccounts()));
}

if (require.main === module) main().catch(error => {
  // Child-process stdout/stderr and API bodies may contain sensitive context. Never dump them.
  console.error(error.message?.startsWith('Demo ') || error.message?.startsWith('Refusing demo') || error.message?.startsWith('STOP Phase B')
    ? error.message : 'Demo stage failed; inspect the owned environment with redacted diagnostics.');
  process.exitCode = 1;
});

module.exports = { ROOT, TARGET, initializeDemo, configuration, compose, withDemoDatabase, saveReport, login, seedAccounts, main };
