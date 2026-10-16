'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '../../..');
const artifacts = path.join(root, '.sweep');
const PROJECT = 'erp-sweep-20261016';

function assertClone({ baseUrl, dbName }) {
  let url;
  try { url = new URL(baseUrl); } catch (_) { throw new Error('Refusing sweep: invalid clone URL'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.port !== '8091' || url.username || url.password || dbName !== 'construction_erp_sweep') {
    throw new Error('Refusing sweep: requires local HTTP port 8091 and construction_erp_sweep');
  }
}
function config() {
  const env = {};
  for (const line of fs.readFileSync(path.join(root, '.env.sweep'), 'utf8').split('\n')) {
    const split = line.indexOf('=');
    if (split > 0) env[line.slice(0, split)] = line.slice(split + 1).trim();
  }
  const target = { baseUrl: env.FRONTEND_URL, dbName: env.DB_NAME };
  assertClone(target);
  return { ...env, ...target };
}
function ignored(file) {
  execFileSync('git', ['check-ignore', '--quiet', file], { cwd: root, stdio: 'ignore' });
}
function save(name, value) {
  ignored('.sweep/results.json');
  fs.mkdirSync(artifacts, { recursive: true });
  fs.writeFileSync(path.join(artifacts, name), `${JSON.stringify(value, null, 2)}\n`);
}
function credentials() {
  ignored('.staging-users.json');
  return JSON.parse(fs.readFileSync(path.join(root, '.staging-users.json'), 'utf8')).accounts;
}
function composeArgs() { return ['compose', '--project-name', PROJECT, '--env-file', path.join(root, '.env.sweep'), '-f', path.join(artifacts, 'compose.json')]; }
function docker(args, options = {}) {
  return execFileSync('docker', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
}
function sql(query) {
  const target = config(); assertClone(target);
  // The database identity is checked in the same read-only transaction as every query.
  const wrapped = `BEGIN READ ONLY; DO $$ BEGIN IF current_database() <> 'construction_erp_sweep' THEN RAISE EXCEPTION 'Refusing sweep database'; END IF; END $$; ${query}; COMMIT;`;
  const output = docker([...composeArgs(), 'exec', '-T', 'db', 'sh', '-c', 'psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], { input: wrapped });
  return output.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
}
async function request(route, { method = 'GET', token, body } = {}) {
  const target = config(); assertClone(target);
  const url = new URL(route, target.baseUrl);
  assertClone({ baseUrl: url.origin, dbName: target.dbName });
  const start = performance.now();
  const response = await fetch(url, { method, redirect: 'error', signal: AbortSignal.timeout(20000), headers: {
    Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const content = await response.text();
  let data; try { data = JSON.parse(content); } catch (_) { data = null; }
  return { status: response.status, latencyMs: Math.round(performance.now() - start), total: response.headers.get('x-total-count'), data };
}
async function login(account) {
  const result = await request('/api/auth/login', { method: 'POST', body: { email: account.email, password: account.password } });
  if (result.status !== 200 || !result.data?.data?.token) throw new Error(`Clone login failed for ${account.key}: HTTP ${result.status}`);
  return result.data.data;
}
module.exports = { assertClone, config, root, artifacts, PROJECT, ignored, save, credentials, composeArgs, docker, sql, request, login };
