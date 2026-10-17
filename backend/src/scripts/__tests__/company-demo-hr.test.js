'use strict';

const { ensureHrRecord } = require('../company-demo-hr');

describe('company demo HR idempotency', () => {
  test('creates each stable HR record once and recognizes it on rerun', async () => {
    const records = [];
    const request = jest.fn(async (_account, _route, options = {}) => {
      if (options.method === 'POST') {
        const row = { id: records.length + 1, ...options.body };
        records.push(row);
        return { status: 201, body: { success: true, data: row } };
      }
      return { status: 200, body: { success: true, data: records } };
    });
    const spec = { request, account: { key: 'workflow_owner' }, listPath: '/api/hr/employees',
      createPath: '/api/hr/employees', key: 'DEMO-EMP-001', keyField: 'code', body: { code: 'DEMO-EMP-001' } };
    const first = await ensureHrRecord(spec);
    const second = await ensureHrRecord(spec);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(records).toHaveLength(1);
    expect(request.mock.calls.filter(call => (call[2] || {}).method === 'POST')).toHaveLength(1);
  });
});
