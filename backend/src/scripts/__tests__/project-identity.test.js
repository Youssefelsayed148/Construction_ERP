const policy = require('../../services/policy');

describe('R1.1 collect all project identity sources', () => {
  test.each([
    { query: { project_id: '7' }, body: { project_id: 8 } },
    { params: { projectId: '7' }, body: { projectId: 8 } },
    { query: { projectId: '7' }, body: { project_id: 8 } },
    { params: { project_id: '7' }, query: { project_id: '8' } },
    { params: { id: '7' }, body: { project_id: 8 } },
  ])('rejects conflicting identities rather than selecting the first', sources => {
    expect(() => policy.extractProjectId(sources, 'projects')).toThrow();
  });

  test('equivalent numeric and string identities resolve to the same id', () => {
    expect(policy.extractProjectId({ params: { projectId: '7' }, query: { project_id: '7' }, body: { project_id: 7 } }, 'boq')).toBe(7);
  });

  test('nested site record ids are not additional project identities', () => {
    expect(policy.extractProjectId({ params: { projectId: '7', id: '99' }, route: { path: '/:projectId/site-reports/:id' } }, 'projects')).toBe(7);
    expect(policy.extractProjectId({ params: { id: '99' }, route: { path: '/phases/:id' }, query: { project_id: '7' } }, 'projects')).toBe(7);
  });

  test('route guard starts with zero direct body/validated project reads', () => {
    expect(require('../lint-guards').scan()['direct-project-id']).toEqual({});
  });

  test('handlers require and consume an authorized project context', () => {
    const { authorizedProjectId } = require('../../services/authorizedProject');
    expect(authorizedProjectId({ policy: { allowed: true, project_id: 7 } }, { project_id: '7' })).toBe(7);
    expect(() => authorizedProjectId({}, { project_id: 7 })).toThrow('authorization');
    expect(() => authorizedProjectId({ policy: { allowed: true, project_id: 7 } }, { project_id: 8 })).toThrow('disagree');
  });
});
