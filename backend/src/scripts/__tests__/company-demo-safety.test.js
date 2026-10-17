'use strict';

const { assertDemoTarget, demoRequest, ensureRecord, resetArguments, accountDefinitions } = require('../company-demo-common');

const target = Object.freeze({ projectName: 'erp-demo-20261017', baseUrl: 'http://127.0.0.1:8092',
  dbName: 'construction_erp_demo', dbHost: '127.0.0.1', dbPort: '55442' });

describe('company demo target and reset safety', () => {
  test('accepts only the explicitly authorized isolated demo target', () => expect(() => assertDemoTarget(target)).not.toThrow());
  test.each([
    { projectName: 'erp-closeout-pilot-20261013' }, { projectName: 'erp-sweep-20261016' },
    { dbName: 'construction_erp_staging' }, { dbName: 'construction_erp_sweep' },
    { dbName: 'construction_erp_production_demo' }, { dbName: 'construction_erp_demo_prod' },
    { dbPort: '55440' }, { dbPort: '55441' }, { dbPort: '5432' }, { dbPort: '55442x' },
    { dbHost: 'db' }, { dbHost: 'db.example.invalid' },
    { baseUrl: 'http://127.0.0.1:8090' }, { baseUrl: 'http://127.0.0.1:8091' },
    { baseUrl: 'http://example.invalid:8092' }, { baseUrl: 'https://127.0.0.1:8092' },
    { baseUrl: 'http://127.0.0.1:8092@evil.invalid' }, { baseUrl: 'http://user:secret@127.0.0.1:8092' },
    { baseUrl: 'http://127.0.0.1:8092/path' }, { baseUrl: 'http://127.0.0.1:8092?x=1' },
  ])('rejects unsafe target %# before any HTTP request or reset', async override => {
    const unsafe = { ...target, ...override }; const fetchImpl = jest.fn();
    expect(() => assertDemoTarget(unsafe)).toThrow(/Refusing demo/);
    expect(() => resetArguments(unsafe)).toThrow(/Refusing demo/);
    await expect(demoRequest(unsafe, '/api/health', { fetchImpl })).rejects.toThrow(/Refusing demo/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  test('reset names only the demo Compose project and its explicit config', () => {
    expect(resetArguments(target)).toEqual(['compose', '--project-name', 'erp-demo-20261017', '--env-file', '.env.demo',
      '-f', 'docker-compose.demo.yml', 'down', '-v']);
  });
  test.each(['http://example.invalid/api/health', '//example.invalid/api/health', '/uploads/a', '/api/../health'])('refuses non-API or escaping request %s', async route => {
    const fetchImpl = jest.fn();
    await expect(demoRequest(target, route, { fetchImpl })).rejects.toThrow(/Refusing demo/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('company demo idempotency and account roster', () => {
  test('account idempotency never rotates an existing password or performs another registration', async () => {
    const create = jest.fn();
    const result = await ensureRecord({ key: 'demo-owner_ceo@demo.invalid', field: 'email',
      list: async () => [{ id: 4, email: 'demo-owner_ceo@demo.invalid' }], create });
    expect(result.id).toBe(4);
    expect(create).not.toHaveBeenCalled();
  });
  test('a stable code creates once and the second call performs no write', async () => {
    const rows = []; const create = jest.fn(async () => { const row = { id: 7, code: 'DEMO-A' }; rows.push(row); return row; });
    const options = { key: 'DEMO-A', list: async () => rows, create, field: 'code' };
    expect(await ensureRecord(options)).toEqual({ id: 7, code: 'DEMO-A' });
    expect(await ensureRecord(options)).toEqual({ id: 7, code: 'DEMO-A' });
    expect(create).toHaveBeenCalledTimes(1);
  });
  test('ambiguous existing keys refuse rather than creating or selecting an arbitrary row', async () => {
    const create = jest.fn();
    await expect(ensureRecord({ key: 'DEMO-A', field: 'code', list: async () => [{ code: 'DEMO-A' }, { code: 'DEMO-A' }], create }))
      .rejects.toThrow(/ambiguous/);
    expect(create).not.toHaveBeenCalled();
  });
  test('keeps all 33 canonical and five compatibility/safety accounts without duplicating keys', () => {
    const definitions = accountDefinitions();
    expect(definitions).toHaveLength(38);
    expect(new Set(definitions.map(row => row.key)).size).toBe(38);
    expect(definitions.map(row => row.key)).toEqual(expect.arrayContaining(['owner_ceo', 'procurement_officer', 'storekeeper',
      'unassigned', 'expired_assignment', 'workflow_owner', 'workflow_checker', 'workflow_budget']));
  });
});

describe('demo credentials and startup safety', () => {
  test('generated emails and bootstrap use addresses accepted by the login Joi email validator', () => {
    const { initializeDemo } = require('../seed-company-demo');
    const Joi = require('joi');
    const writes = new Map();
    initializeDemo({ root: '/unused', ignored: () => {}, exists: () => false,
      write: (file, value) => writes.set(require('path').basename(file), value) });
    const { accounts } = JSON.parse(writes.get('.demo-users.json'));
    expect(accounts).toHaveLength(38);
    for (const account of accounts) {
      expect(Joi.string().email().required().validate(account.email).error).toBeUndefined();
      expect(account.email).toBe(`demo-${account.key}@demo.example.com`);
    }
    const compose = require('fs').readFileSync(require('path').resolve(__dirname, '../../../../docker-compose.demo.yml'), 'utf8');
    expect(compose).toContain('DEFAULT_OWNER_EMAIL: demo-workflow_owner@demo.example.com');
  });
  test('host ingress is confined to the credential-free nginx proxy; execution services keep an internal-only network', () => {
    const fs = require('fs'); const path = require('path');
    const compose = fs.readFileSync(path.resolve(__dirname, '../../../../docker-compose.demo.yml'), 'utf8');
    const frontend = compose.slice(compose.indexOf('  frontend:'), compose.indexOf('\nnetworks:'));
    expect(frontend).toContain('networks: [demo, ingress]');
    expect(frontend).toContain('127.0.0.1:55442:5432');
    expect(compose).toContain('internal: true');
    expect(compose.slice(0, compose.indexOf('  frontend:'))).not.toContain('networks: [demo, ingress]');
    expect(compose).toContain('NOTIFICATION_LIVE_SEND_ENABLED: "false"');
    const nginx = fs.readFileSync(path.resolve(__dirname, '../../../scripts/company-demo-nginx.conf'), 'utf8');
    expect(nginx).toContain('proxy_pass db:5432;');
    expect(nginx).not.toMatch(/resolver|\$host|\$request/);
  });
  test('initialization refuses unignored credentials before creating any file', () => {
    const { initializeDemo } = require('../seed-company-demo');
    const writes = jest.fn();
    expect(() => initializeDemo({ root: '/unused', ignored: () => { throw new Error('not ignored'); }, write: writes }))
      .toThrow('not ignored');
    expect(writes).not.toHaveBeenCalled();
  });
  test('initialization refuses to replace an existing environment before creating credentials', () => {
    const { initializeDemo } = require('../seed-company-demo'); const writes = jest.fn();
    expect(() => initializeDemo({ root: '/unused', ignored: () => {}, exists: () => true, write: writes }))
      .toThrow(/already exists/);
    expect(writes).not.toHaveBeenCalled();
  });
});
