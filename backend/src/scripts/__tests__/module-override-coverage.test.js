// Static checks for the resource-derived module/action rules (Phase 5.1). The overrides are keyed on route
// paths, so a renamed route would silently stop matching; these tests pin them to the real routers.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'coverage-test-secret-xxxxxxxxxxxxxxxx';
const policy = require('../../services/policy');

const routesOf = (file) => require(`../../routes/${file}`).stack
  .filter((l) => l.route)
  .flatMap((l) => Object.keys(l.route.methods).map((m) => ({ method: m.toUpperCase(), path: l.route.path })));

describe('module overrides', () => {
  test('every site router route is module "site"; no projects router route is', () => {
    for (const r of routesOf('site')) expect([r.path, policy.effectiveModule({ policyRoute: r.path }, 'projects')]).toEqual([r.path, 'site']);
    for (const r of routesOf('projects')) expect([r.path, policy.effectiveModule({ policyRoute: r.path }, 'projects')]).toEqual([r.path, 'projects']);
  });

  test('delivery, MIR and GRN routes are "inventory"; PR, RFQ and PO routes stay "procurement"', () => {
    const inventory = routesOf('procurement').filter((r) => policy.effectiveModule({ policyRoute: r.path }, 'procurement') === 'inventory').map((r) => `${r.method} ${r.path}`);
    expect(inventory.sort()).toEqual([
      'GET /documents/grn/:id', 'POST /deliveries', 'POST /deliveries/:id/mir', 'POST /grn/:id/returns', 'POST /mir/:id/decide', 'POST /mir/:id/grn',
    ]);
    for (const p of ['/pr', '/pr/:id/decide', '/rfq', '/po/:id/issue', '/invoices']) {
      expect(policy.effectiveModule({ policyRoute: p }, 'procurement')).toBe('procurement');
    }
  });
});

describe('action overrides', () => {
  const MOUNT_FILES = {
    approvals: 'approvals', commercial: 'commercial', consultant: 'consultant', 'client-portal': 'client', docs: 'doccontrol', 'finance-ledger': 'financeLedger', handover: 'handover',
    procurement: 'procurement', projects: 'projects', qhse: 'qhse', subcontractors: 'subcontractors', 'work-orders': 'workorders', reports: 'reports',
    invoices: 'invoices', items: 'items', payments: 'payments', suppliers: 'suppliers', inventory: 'inventory', materials: 'materials',
  };

  test('every override matches a real route with that method', () => {
    for (const [mount, method, pattern] of policy.ACTION_OVERRIDES) {
      const hits = routesOf(MOUNT_FILES[mount]).filter((r) => r.method === method && pattern.test(r.path));
      expect([mount, String(pattern), hits.length > 0]).toEqual([mount, String(pattern), true]);
    }
  });

  test('actions resolve from the route, not the verb', () => {
    const act = (mount, method, path, params, body) => policy.effectiveAction({ method, policyRoute: path, params, body }, mount);
    expect(act('docs', 'POST', '/documents/:id/:action(approve|reject)', { action: 'approve' })).toBe('approve');
    expect(act('docs', 'POST', '/documents/:id/:action(approve|reject)', { action: 'reject' })).toBe('reject');
    expect(act('docs', 'POST', '/documents/:id/submit')).toBe('submit');
    expect(act('procurement', 'POST', '/po/:id/issue')).toBe('issue_financial_document');
    expect(act('procurement', 'GET', '/rfq/:id/comparison')).toBe('see_supplier_value');
    expect(act('docs', 'POST', '/rfis')).toBe('create');
    expect(act('consultant', 'POST', '/wirs/:id/result', null, { result: 'approved' })).toBe('approve');
    expect(act('consultant', 'POST', '/wirs/:id/result', null, { result: 'rejected' })).toBe('reject');
    expect(act('consultant', 'POST', '/variations/:id/recommendation', null, { decision: 'approve' })).toBe('approve');
    expect(act('consultant', 'POST', '/payment-certificates/:id/recommendation', null, { decision: 'reject' })).toBe('reject');
      expect(act('consultant', 'POST', '/instructions/:id/recommendation', null, { decision: 'approve' })).toBe('approve');
    expect(act('client-portal', 'POST', '/variations/:id/response', null, { decision: 'reject' })).toBe('reject');
    expect(act('client-portal', 'POST', '/variations/:id/response', null, { decision: 'approve' })).toBe('approve');
    expect(act('client-portal', 'POST', '/documents/:id/acknowledgement')).toBe('approve');
    expect(act('docs', 'GET', '/documents')).toBe('view');
    // voiding a financial record and restoring a master are not plain deletes/creates
    expect(act('payments', 'DELETE', '/:id')).toBe('void');
    expect(act('invoices', 'DELETE', '/:id')).toBe('void');
    expect(act('items', 'POST', '/:id/restore')).toBe('delete');
    expect(act('suppliers', 'POST', '/:id/restore')).toBe('delete');
    expect(act('items', 'DELETE', '/:id')).toBe('delete');
  });
});
