'use strict';

const { ensureDemoWarehouses } = require('../company-demo-masters');

const TARGET = Object.freeze({ projectName: 'erp-demo-20261017', baseUrl: 'http://127.0.0.1:8092',
  dbName: 'construction_erp_demo', dbHost: '127.0.0.1', dbPort: '55442' });

describe('company demo masters warehouse exception', () => {
  test('refuses any database target except the named demo before querying', async () => {
    const query = jest.fn();
    await expect(ensureDemoWarehouses({ target: { ...TARGET, dbName: 'construction_erp_pilot' }, query, projects: [] }))
      .rejects.toThrow(/Refusing demo/);
    expect(query).not.toHaveBeenCalled();
  });

  test('inserts exactly two stable warehouse rows and creates none on rerun', async () => {
    const rows = new Map();
    const query = jest.fn(async (sql, params) => {
      if (sql.includes('SELECT id FROM warehouses')) {
        const row = [...rows.values()].find(item => item.name === params[0] && item.project_id === params[1]);
        return { rows: row ? [{ id: row.id }] : [] };
      }
      if (sql.includes('INSERT INTO warehouses')) {
        const row = { id: rows.size + 1, name: params[0], project_id: params[4] };
        rows.set(`${row.name}:${row.project_id}`, row);
        return { rows: [row] };
      }
      throw new Error('Unexpected SQL');
    });
    const projects = [{ id: 10, code: 'DEMO-A' }, { id: 11, code: 'DEMO-B' }, { id: 12, code: 'DEMO-C' }];
    const first = await ensureDemoWarehouses({ target: TARGET, query, projects });
    const second = await ensureDemoWarehouses({ target: TARGET, query, projects });
    expect(first.created).toBe(2);
    expect(second.created).toBe(0);
    expect(rows.size).toBe(2);
    expect(query.mock.calls.filter(call => call[0].includes('INSERT INTO warehouses'))).toHaveLength(2);
  });
});
