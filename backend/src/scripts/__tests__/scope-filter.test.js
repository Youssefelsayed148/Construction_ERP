process.env.JWT_SECRET = process.env.JWT_SECRET || 'scope-filter-test-secret';

jest.mock('../../config/database', () => ({ query: jest.fn() }));

const { filterScopedPayload } = require('../../middleware/auth');

describe('project-scoped response filtering', () => {
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
