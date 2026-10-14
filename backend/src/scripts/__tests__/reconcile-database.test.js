const { CHECKS, runReconciliation } = require('../reconcile-database');

describe('staging database reconciliation', () => {
  test('covers financial, retention, project, inventory and workflow invariants', () => {
    const source = CHECKS.map((check) => `${check.name} ${check.sql}`).join('\n');
    for (const term of ['payment_allocations', 'retention_ledger', 'project', 'inventory_transfers', 'workflow_instances']) {
      expect(source).toContain(term);
    }
    for (const name of [
      'advance recovery ledger', 'journal entry lines balance',
      'PO delivered and accepted quantities', 'owned integer sequences',
    ]) expect(CHECKS.some((check) => check.name.includes(name))).toBe(true);
  });

  test('passes only when every check has zero violations', async () => {
    let call = 0;
    const report = await runReconciliation(async () => ({ rows: [{ violations: call++ === 2 ? 1 : 0 }] }));
    expect(report.ok).toBe(false);
    expect(report.results.filter((result) => !result.ok)).toHaveLength(1);

    const clean = await runReconciliation(async () => ({ rows: [{ violations: 0 }] }));
    expect(clean.ok).toBe(true);
  });

  test('sequence reconciliation quotes discovered identifiers and counts lagging sequences', async () => {
    const check = CHECKS.find((item) => item.name.includes('owned integer sequences'));
    const statements = [];
    const rows = [
      [{ table_schema: 'public', table_name: 'unusual"table', column_name: 'id' }, { table_schema: 'public', table_name: 'in_sync', column_name: 'id' }],
      [{ max_id: 8, last_value: 7 }],
      [{ max_id: 4, last_value: 4 }],
    ];
    const result = await check.run(async (sql, params) => {
      statements.push({ sql, params });
      return { rows: rows.shift() };
    });
    expect(result.rows[0].violations).toBe(1);
    expect(statements[1].sql).toContain('"public"."unusual""table"');
    expect(statements[1].params).toEqual(['public.unusual"table', 'id']);
  });
});
