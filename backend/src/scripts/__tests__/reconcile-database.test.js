const { CHECKS, runReconciliation } = require('../reconcile-database');

describe('staging database reconciliation', () => {
  test('covers financial, retention, project, inventory and workflow invariants', () => {
    const source = CHECKS.map((check) => `${check.name} ${check.sql}`).join('\n');
    for (const term of ['payment_allocations', 'retention_ledger', 'project', 'inventory_transfers', 'workflow_instances']) {
      expect(source).toContain(term);
    }
  });

  test('passes only when every check has zero violations', async () => {
    let call = 0;
    const report = await runReconciliation(async () => ({ rows: [{ violations: call++ === 2 ? 1 : 0 }] }));
    expect(report.ok).toBe(false);
    expect(report.results.filter((result) => !result.ok)).toHaveLength(1);

    const clean = await runReconciliation(async () => ({ rows: [{ violations: 0 }] }));
    expect(clean.ok).toBe(true);
  });
});
