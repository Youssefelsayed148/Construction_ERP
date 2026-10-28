// Real PostgreSQL. Every action the policy engine pins to a route (ACTION_OVERRIDES with a fixed action) must be held by at
// least one canonical role, otherwise only the legacy blanket roles can perform it and every canonical user gets a 403 on that
// step. Found by the scripted HTTP scenario (PO issue); migration 0084 closed the gaps. A new override with no holder fails here.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'canonical-holders-test-key';
const policy = require('../../services/policy');
const db = require('../../config/database');

const LEGACY_BLANKET_OR_ALIAS = ['owner', 'admin', 'manager', 'accountant', 'engineer', 'legal_mgr', 'maintenance_mgr', 'purchasing_mgr', 'site_supervisor', 'staff', 'viewer', 'consultant', 'client', 'subcontractor', 'supplier'];
// Destructive restore routes: owner/admin only by design.
const OWNER_ONLY = new Set(['items.delete', 'suppliers.delete']);

// Needs a migrated database: skipped unless TEST_PG=1, like every other .pg suite (the Docker image build and a plain `npm test` have no DB).
const describePg = process.env.TEST_PG === '1' ? describe : describe.skip;

describePg('canonical-role coverage of policy actions', () => {
afterAll(async () => { await db.pool.end(); });

test('every fixed-action override has at least one canonical-role holder', async () => {
  const pairs = new Set();
  for (const [module, , , action] of policy.ACTION_OVERRIDES) if (typeof action === 'string') pairs.add(`${module}.${action}`);
  expect(pairs.size).toBeGreaterThan(20);
  const rows = (await db.query(
    `SELECT r.key, p.module, p.action FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
      WHERE r.key <> ALL($1)`, [LEGACY_BLANKET_OR_ALIAS],
  )).rows;
  const missing = [...pairs].filter((pair) => {
    if (OWNER_ONLY.has(pair)) return false;
    const [module, action] = pair.split('.');
    return !rows.some((r) => (r.module === module || r.module === '*') && (r.action === action || r.action === '*'));
  });
  expect(missing).toEqual([]);
});
});
