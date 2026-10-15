'use strict';

const { parsePagination, queryPaginated, paginateRows, withoutTopLevelOrderBy } = require('../../utils/pagination');

describe('R4.4 shared list pagination', () => {
  test('defaults to 200 and clamps limit to 1000 with a non-negative offset', () => {
    expect(parsePagination({})).toEqual({ limit: 200, offset: 0 });
    expect(parsePagination({ limit: '5000', offset: '-4' })).toEqual({ limit: 1000, offset: 0 });
    expect(parsePagination({ limit: 'bad', offset: '12' })).toEqual({ limit: 200, offset: 12 });
  });

  test('runs a total count and stable id-tiebroken page query without changing the row envelope', async () => {
    const q = jest.fn()
      .mockResolvedValueOnce({ rows: [{ total: '450' }] })
      .mockResolvedValueOnce({ rows: [{ id: 7 }, { id: 8 }] });
    const res = { headers: {}, setHeader(name, value) { this.headers[name] = value; } };
    const result = await queryPaginated({ query: { limit: '2', offset: '4' }, params: {} }, res, q, {
      sql: 'SELECT id, name FROM clients WHERE is_active = $1', params: [true], orderBy: [{ column: 'name', direction: 'ASC' }],
    });
    expect(result).toEqual({ rows: [{ id: 7 }, { id: 8 }], total: 450, limit: 2, offset: 4 });
    expect(res.headers['X-Total-Count']).toBe('450');
    expect(q.mock.calls[1][0]).toContain('ORDER BY name ASC, id ASC LIMIT $2 OFFSET $3');
    expect(q.mock.calls[1][1]).toEqual([true, 2, 4]);
  });

  test('rejects unsafe caller-supplied order columns', async () => {
    await expect(queryPaginated({ query: {} }, { setHeader() {} }, jest.fn(), {
      sql: 'SELECT id FROM clients', params: [], orderBy: [{ column: 'name; DROP TABLE users', direction: 'ASC' }],
    })).rejects.toThrow('pagination order');
  });

  test('supports a stable domain identifier when list rows do not expose an id field', async () => {
    const q = jest.fn()
      .mockResolvedValueOnce({ rows: [{ total: '3' }] })
      .mockResolvedValueOnce({ rows: [{ resource_id: 4 }] });
    const res = { setHeader() {} };
    await queryPaginated({ query: {} }, res, q, {
      sql: 'SELECT resource_id, name FROM resources',
      orderBy: [{ column: 'name' }],
      tieBreaker: 'resource_id',
    });
    expect(q.mock.calls[1][0]).toContain('ORDER BY name ASC, resource_id ASC');
  });

  test('paginates derived rows with a stable requested order and total header', () => {
    const res = { headers: {}, setHeader(name, value) { this.headers[name] = value; } };
    const result = paginateRows({ query: { limit: '2', offset: '1' } }, res, [
      { id: 9, planned_start: '2026-03-01' },
      { id: 2, planned_start: null },
      { id: 7, planned_start: '2026-02-01' },
    ], { orderBy: [{ column: 'planned_start' }] });
    expect(result.rows.map((row) => row.id)).toEqual([9, 2]);
    expect(result.total).toBe(3);
    expect(res.headers['X-Total-Count']).toBe('3');
  });

  test('removes only the top-level existing sort so joined sort columns remain usable', () => {
    expect(withoutTopLevelOrderBy(`SELECT bi.* FROM boq_items bi
      LEFT JOIN boq_sections bs ON bs.id = bi.section_id
      WHERE bi.project_id = $1 ORDER BY bs.sort_order, bi.code`))
      .toBe('SELECT bi.* FROM boq_items bi\n      LEFT JOIN boq_sections bs ON bs.id = bi.section_id\n      WHERE bi.project_id = $1');
    expect(withoutTopLevelOrderBy(`SELECT json_agg(x ORDER BY x.id) FROM items x ORDER BY x.code`))
      .toBe('SELECT json_agg(x ORDER BY x.id) FROM items x');
  });
});
