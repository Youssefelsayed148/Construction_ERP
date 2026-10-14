const { scopedQuery } = require('../../services/projectReadScope');

const schema = [
  ['projects', 'id'], ['invoices', 'project_id'], ['payments', 'project_id'],
  ['commitments', 'project_id'], ['user_project_roles', 'project_id'],
].map(([table_name, column_name]) => ({ table_name, column_name }));

describe('R1.2 SQL aggregation scope', () => {
  test('company-wide queries without a filter retain the original query function', async () => {
    const q = jest.fn();
    expect(await scopedQuery({ accessScope: { companyWide: true, projectIds: [] } }, q)).toBe(q);
    expect(q).not.toHaveBeenCalled();
  });
  test('scope filters joins and nested aggregates before summation with bound ids', async () => {
    const q = jest.fn().mockResolvedValue({ rows: schema });
    const scoped = await scopedQuery({ query: {}, accessScope: { companyWide: false, projectIds: [7] } }, q);
    await scoped('SELECT (SELECT SUM(amount) FROM invoices) AS total FROM projects WHERE status=$1', ['active']);
    const [sql, values] = q.mock.calls[1];
    expect(sql).toContain('invoices AS (SELECT * FROM public.invoices WHERE project_id = ANY($2::int[]))');
    expect(sql).toContain('projects AS (SELECT * FROM public.projects WHERE id = ANY($2::int[]))');
    expect(values).toEqual(['active', [7]]);
  });
  test('explicit filters narrow company-wide queries and foreign filters fail closed', async () => {
    const q = jest.fn().mockResolvedValue({ rows: schema });
    const scoped = await scopedQuery({ query: { project_id: '8' }, accessScope: { companyWide: true, projectIds: [] } }, q);
    await scoped('SELECT SUM(amount) FROM invoices');
    expect(q.mock.calls[1][1]).toEqual([[8]]);
    await expect(scopedQuery({ query: { project_id: '8' }, accessScope: { companyWide: false, projectIds: [7] } }, q)).rejects.toMatchObject({ status: 403 });
  });
  test('existing CTEs compose with scope and identity grants remain intact', async () => {
    const q = jest.fn().mockResolvedValue({ rows: schema });
    const scoped = await scopedQuery({ accessScope: { companyWide: false, projectIds: [7] } }, q);
    await scoped('WITH totals AS (SELECT SUM(amount) FROM invoices) SELECT * FROM totals');
    expect(q.mock.calls[1][0]).toMatch(/^WITH invoices AS .*?, totals AS/);
    await scoped('SELECT * FROM user_project_roles');
    expect(q.mock.calls[2][0]).toBe('SELECT * FROM user_project_roles');
  });

  test('pg query configs cannot bypass scope and preserve named statement separation', async () => {
    const q = jest.fn().mockResolvedValue({ rows: schema });
    const scoped = await scopedQuery({ accessScope: { companyWide: false, projectIds: [7] } }, q);
    await scoped({ text: 'SELECT SUM(amount) FROM invoices WHERE status=$1', values: ['draft'], name: 'invoice-total' });
    expect(q.mock.calls[1][0]).toMatchObject({ name: 'invoice-total:project-scoped', values: ['draft', [7]] });
    expect(q.mock.calls[1][0].text).toContain('project_id = ANY($2::int[])');
  });
});
