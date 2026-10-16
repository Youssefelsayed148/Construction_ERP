const fs = require('fs');
const path = require('path');
const { mountedRoutes } = require('../batch5a-route-inventory');
const policy = require('../../services/policy');
const describePg = process.env.TEST_PG === '1' ? describe : describe.skip;

describePg('Batch 5A complete mounted coarse-role inventory', () => {
  let db;
  beforeAll(() => { db = require('../../config/database'); });
  afterAll(async () => { if (db) await db.pool.end(); });
  test('enumerates every explicit coarse list and its grant-layer mismatches', async () => {
    const grants = (await db.query(`SELECT r.key, p.module, p.action FROM roles r
      JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id ORDER BY r.key,p.module,p.action`)).rows;
    const all = mountedRoutes();
    const restricted = all.filter(route => route.roles.length);
    const rows = restricted.map(route => {
      const req = { baseUrl: route.prefix, method: route.method, route: { path: route.route }, body: {} };
      const module = policy.effectiveModule(req, policy.moduleFromRequest(req));
      const action = policy.effectiveAction(req, policy.moduleFromRequest(req));
      const blocked = [...new Set(grants.filter(grant => [module, '*'].includes(grant.module)
        && [action, '*'].includes(grant.action) && !route.roles.includes(grant.key)).map(grant => grant.key))];
      return `| ${route.method} ${route.path} | ${module}/${action} | ${route.roles.join(', ')} | ${blocked.join(', ') || 'none'} |`;
    });
    console.log(`Batch5A coarse inventory: ${all.length} mounted method/routes; ${restricted.length} explicit coarse lists; ${rows.length} rows`);
    expect(restricted.length).toBeGreaterThan(50);
    if (process.env.BATCH5A_WRITE_REPORTS === '1') fs.writeFileSync(path.resolve(__dirname, '../../../../docs/BATCH_5A_COARSE_ROLE_TABLE.md'),
      '# Batch 5A coarse-role / RBAC inventory\n\nGenerated from every mounted router and current migrated role grants on a throwaway database. Every explicit coarse list is included. The final column is a grant-layer mismatch, not automatic authorization to remove a security restriction; record scope, portal and handler rules can additionally deny access. S-002 project entry routes now rely on RBAC and no longer have coarse lists.\n\n| Route | Effective permission | Coarse roles | Granted roles blocked by coarse list |\n|---|---|---|---|\n' + rows.join('\n') + '\n');
  });
});
