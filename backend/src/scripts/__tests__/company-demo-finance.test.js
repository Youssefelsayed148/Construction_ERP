'use strict';

const { ensureFinanceRecord } = require('../company-demo-finance');

describe('company demo finance idempotency', () => {
  test('creates each stable finance record once and reports zero on a rerun', async () => {
    const records = [];
    const request = jest.fn(async (_account, route, options = {}) => {
      if (options.method === 'POST') {
        const row = { id: records.length + 1, ...options.body };
        records.push(row);
        return { status: 201, body: { success: true, data: row } };
      }
      return { status: 200, body: { success: true, data: records } };
    });
    const spec = { request, account: { key: 'accountant_ar' }, listPath: '/api/invoices', createPath: '/api/invoices',
      key: 'DEMO-AR-001', keyField: 'description', body: { description: 'DEMO-AR-001' } };
    const first = await ensureFinanceRecord(spec);
    const second = await ensureFinanceRecord(spec);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(records).toHaveLength(1);
    expect(request.mock.calls.filter(call => (call[2] || {}).method === 'POST')).toHaveLength(1);
  });
});
