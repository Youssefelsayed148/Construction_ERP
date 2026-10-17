process.env.JWT_SECRET = process.env.JWT_SECRET || 'scope-filter-test-secret';

jest.mock('../../config/database', () => ({ query: jest.fn() }));

const { filterScopedPayload } = require('../../middleware/auth');

describe('project-scoped response filtering', () => {
  test('preserves timestamps while removing foreign records', () => {
    const date = new Date('2026-10-17T00:00:00.000Z');
    const filtered = filterScopedPayload({ data: [
      { project_id: 7, created_at: date, nested: { due_date: date } },
      { project_id: 9, created_at: date },
    ] }, [7]);
    expect(JSON.parse(JSON.stringify(filtered))).toEqual({ data: [
      { project_id: 7, created_at: date.toISOString(), nested: { due_date: date.toISOString() } },
    ] });
  });
  test('removes foreign records recursively and narrows project id lists', () => {
    const payload = {
      success: true,
      data: [
        { id: 1, project_id: 7, children: [{ id: 2, project_id: 7 }, { id: 3, project_id: 9 }] },
        { id: 4, project_id: 9 },
        { id: 5, name: 'global catalog row' },
      ],
      project_ids: [7, 9],
    };

    expect(filterScopedPayload(payload, [7])).toEqual({
      success: true,
      data: [
        { id: 1, project_id: 7, children: [{ id: 2, project_id: 7 }] },
        { id: 5, name: 'global catalog row' },
      ],
      project_ids: [7],
    });
  });
});
