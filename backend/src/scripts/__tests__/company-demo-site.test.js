'use strict';

const { ensureSiteRecord } = require('../company-demo-site');

describe('company demo site/QHSE idempotency', () => {
  test('creates each stable site record once and reports zero created on rerun', async () => {
    const records = [];
    const request = jest.fn(async (_account, _route, options = {}) => {
      if (options.method === 'POST') {
        const row = { id: records.length + 1, ...options.body };
        records.push(row);
        return { status: 201, body: { success: true, data: row } };
      }
      return { status: 200, body: { success: true, data: records } };
    });
    const spec = { request, account: { key: 'site_engineer' }, listPath: '/api/hse/incidents',
      createPath: '/api/hse/incidents', key: 'DEMO-HSE-001', keyField: 'description', body: { description: 'DEMO-HSE-001' } };
    const first = await ensureSiteRecord(spec);
    const second = await ensureSiteRecord(spec);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(records).toHaveLength(1);
    expect(request.mock.calls.filter(call => (call[2] || {}).method === 'POST')).toHaveLength(1);
  });
});
