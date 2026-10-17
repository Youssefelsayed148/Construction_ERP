'use strict';

const { CANONICAL_ROLES } = require('./seed-staging');

function assertDemoTarget(target) {
  let url;
  try { url = new URL(target.baseUrl); } catch (_) { throw new Error('Refusing demo: invalid target'); }
  const local = ['127.0.0.1', 'localhost', '[::1]'];
  if (target.projectName !== 'erp-demo-20261017' || target.dbName !== 'construction_erp_demo'
      || !['127.0.0.1', 'localhost', '::1'].includes(target.dbHost) || String(target.dbPort) !== '55442'
      || url.protocol !== 'http:' || !local.includes(url.hostname) || url.port !== '8092'
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Refusing demo: requires erp-demo-20261017, construction_erp_demo, local UI8092/PG55442');
  }
}

function composeArguments(target) {
  assertDemoTarget(target);
  return ['compose', '--project-name', target.projectName, '--env-file', '.env.demo', '-f', 'docker-compose.demo.yml'];
}
function resetArguments(target) { return [...composeArguments(target), 'down', '-v']; }

async function demoRequest(target, route, { method = 'GET', token, body, fetchImpl = fetch } = {}) {
  assertDemoTarget(target);
  if (!route.startsWith('/api/') || route.includes('..') || route.includes('\\')) throw new Error('Refusing demo: API route required');
  const url = new URL(route, target.baseUrl);
  if (url.origin !== new URL(target.baseUrl).origin) throw new Error('Refusing demo: foreign origin');
  const response = await fetchImpl(url, { method, redirect: 'error', signal: AbortSignal.timeout(20000), headers: {
    Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let data = null;
  try { data = await response.json(); } catch (_) { /* HTTP status remains evidence for non-JSON responses. */ }
  return { status: response.status, total: response.headers.get('x-total-count'), body: data };
}

async function ensureRecord({ key, field = 'code', list, create }) {
  const matching = (await list()).filter(row => row[field] === key);
  if (matching.length > 1) throw new Error('Refusing demo: ambiguous stable key');
  return matching[0] || create();
}

function accountDefinitions() {
  return [...CANONICAL_ROLES.map(role => ({ key: role, role, grantRole: role })),
    { key: 'unassigned', role: 'procurement_officer', grantRole: 'procurement_officer', noAssignment: true },
    { key: 'expired_assignment', role: 'site_engineer', grantRole: 'site_engineer', expired: true },
    { key: 'workflow_owner', role: 'owner', grantRole: 'owner' },
    { key: 'workflow_checker', role: 'purchasing_mgr', grantRole: 'procurement_manager' },
    { key: 'workflow_budget', role: 'accountant', grantRole: 'accountant' }];
}

module.exports = { assertDemoTarget, composeArguments, resetArguments, demoRequest, ensureRecord, accountDefinitions };
