'use strict';

const { seedApiRecords } = require('../company-demo-business');
const TARGET = Object.freeze({ projectName: 'erp-demo-20261017', baseUrl: 'http://127.0.0.1:8092',
  dbName: 'construction_erp_demo', dbHost: '127.0.0.1', dbPort: '55442' });

function fakeRequest() {
  const rows = new Map();
  const request = jest.fn(async (_account, path, options = {}) => {
    if (options.method === 'POST') {
      const kind = path.split('/').at(-1);
      const row = { id: rows.size + 1, ...options.body };
      rows.set(`${kind}:${row.code}`, row);
      return { status: 201, body: { success: true, data: row } };
    }
    const kind = path.split('/').at(-1);
    return { status: 200, body: { success: true, data: [...rows.values()].filter(row => `${kind}:${row.code}` && path.includes(kind)) } };
  });
  return request;
}

describe('company demo business API seed', () => {
  test('target guard rejects a non-demo target before making an API request', async () => {
    const request = jest.fn();
    await expect(seedApiRecords({ target: { ...TARGET, dbName: 'construction_erp_pilot' }, records: [], request }))
      .rejects.toThrow(/Refusing demo/);
    expect(request).not.toHaveBeenCalled();
  });

  test('stable API keys are created once and a second seed reports zero creates', async () => {
    const request = fakeRequest();
    const records = [
      { key: 'CLIENT-A', keyField: 'code', listPath: '/api/clients', createPath: '/api/clients', account: 'owner_ceo', body: { code: 'CLIENT-A' } },
      { key: 'CLIENT-B', keyField: 'code', listPath: '/api/clients', createPath: '/api/clients', account: 'owner_ceo', body: { code: 'CLIENT-B' } },
    ];
    const first = await seedApiRecords({ target: TARGET, records, request });
    const afterFirstWrites = request.mock.calls.filter((call) => (call[2] || {}).method === 'POST').length;
    const second = await seedApiRecords({ target: TARGET, records, request });
    const afterSecondWrites = request.mock.calls.filter((call) => (call[2] || {}).method === 'POST').length;
    expect(first.created).toBe(2);
    expect(second.created).toBe(0);
    expect(afterFirstWrites).toBe(2);
    expect(afterSecondWrites).toBe(2);
  });
});
