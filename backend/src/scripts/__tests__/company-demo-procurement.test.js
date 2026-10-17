'use strict';

const { ensureDocument } = require('../company-demo-procurement');

describe('company demo procurement idempotency', () => {
  test('creates a stable document once and reuses it on a complete rerun', async () => {
    const docs = [];
    const request = jest.fn(async (_account, route, options = {}) => {
      if (options.method === 'POST') {
        const row = { id: docs.length + 1, ...options.body };
        docs.push(row);
        return { status: 201, body: { success: true, data: row } };
      }
      return { status: 200, body: { success: true, data: [...docs] } };
    });
    const definition = { account: { key: 'procurement_officer' }, listPath: '/api/procurement/rfq',
      createPath: '/api/procurement/rfq', keyField: 'title', key: 'DEMO-RFQ-IDEMPOTENCY',
      body: { title: 'DEMO-RFQ-IDEMPOTENCY' } };
    const first = await ensureDocument({ request, ...definition });
    const second = await ensureDocument({ request, ...definition });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(docs).toHaveLength(1);
    expect(request.mock.calls.filter((call) => (call[2] || {}).method === 'POST')).toHaveLength(1);
  });
});
