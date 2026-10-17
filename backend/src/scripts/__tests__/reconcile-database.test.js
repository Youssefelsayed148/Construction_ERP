const { CHECKS, runReconciliation, formatReceiptNotice } = require('../reconcile-database');

describe('staging database reconciliation', () => {
  let configuredReceiptAge;
  beforeEach(() => { configuredReceiptAge = process.env.RECONCILIATION_STALE_RECEIPT_HOURS; delete process.env.RECONCILIATION_STALE_RECEIPT_HOURS; });
  afterEach(() => {
    if (configuredReceiptAge === undefined) delete process.env.RECONCILIATION_STALE_RECEIPT_HOURS;
    else process.env.RECONCILIATION_STALE_RECEIPT_HOURS = configuredReceiptAge;
  });
  test('receipt age reads the documented configuration key', async () => {
    process.env.RECONCILIATION_STALE_RECEIPT_HOURS = '100';
    const report = await runReconciliation(async () => ({ rows: [] }));
    expect(report.stale_receipt_hours).toBe(100);
  });
  test('receipt age is configurable, defaults to 72h, and warning output identifies MIR and age', async () => {
    const q = async sql => ({ rows: sql.includes('AS age_hours')
      ? [{ mir_id: 8, mir_number: 'MIR-00008', order_number: 'PO-00008', age_hours: '73' }]
      : [{ violations: 0, pending: 1 }] });
    const report = await runReconciliation(q);
    expect(report.stale_receipt_hours).toBe(72);
    expect(report.ok).toBe(true);
    expect(report.receipt_notices).toEqual([{ mir_id: 8, mir_number: 'MIR-00008', order_number: 'PO-00008', age_hours: 73, level: 'warning' }]);
    expect(formatReceiptNotice(report.receipt_notices[0])).toBe('[WARNING] MIR MIR-00008 / PO PO-00008: accepted receipt awaiting posted GRN; age=73.00h');
    const younger = await runReconciliation(q, { staleReceiptHours: 100 });
    expect(younger.receipt_notices[0].level).toBe('info');
    expect(formatReceiptNotice(younger.receipt_notices[0])).toMatch(/^\[INFO\]/);
  });
  test.each([0, -1, NaN, Infinity])('invalid receipt threshold %s refuses before querying', async staleReceiptHours => {
    const q = jest.fn();
    await expect(runReconciliation(q, { staleReceiptHours })).rejects.toThrow('stale receipt threshold');
    expect(q).not.toHaveBeenCalled();
  });
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
