import { PROJECT_GROUPS, visibleGroups, canSeeFinancials, groupForPath, UNIT_SALES_TYPES } from './projectNav';

const allGrants = [{ module: '*', action: '*', project_id: null }];
const userWith = (policy_permissions) => ({ role: 'unknown_future_role', policy_permissions });
const keys = (user, projectId = 5, type = 'residential') => visibleGroups(user, projectId, type).map((group) => group.key);
const tabs = (user, group, projectId = 5, type = 'residential') =>
  (visibleGroups(user, projectId, type).find((entry) => entry.key === group)?.tabs || []).map((tab) => tab.key);

describe('project page navigation visibility from effective grants', () => {
  test('six groups and every existing sub-page path are mapped once', () => {
    expect(PROJECT_GROUPS.map((group) => group.key)).toEqual(['overview', 'scope', 'site', 'procurement', 'documents', 'handover']);
    const all = PROJECT_GROUPS.flatMap((group) => group.tabs.map((tab) => tab.path)).sort();
    expect(all).toEqual(['boq', 'documents', 'handover', 'hse', 'locations', 'operations', 'qhse', 'reports',
      'schedule', 'site', 'site-workspace', 'units', 'work-orders'].sort());
  });

  test('wildcard grants show accessible groups and project types gate Units & Sales', () => {
    const user = userWith(allGrants);
    expect(keys(user)).toEqual(['overview', 'scope', 'site', 'procurement', 'documents', 'handover']);
    expect(tabs(user, 'handover')).toEqual(['handover', 'units']);
    expect(UNIT_SALES_TYPES).toContain('residential');
    expect(tabs(user, 'handover', 5, 'infrastructure')).toEqual(['handover']);
  });

  test('an explicit project seat limits tabs to that project and its effective grants', () => {
    const seatUser = userWith([
      { module: 'projects', action: 'view', project_id: 5 },
      { module: 'locations', action: 'view', project_id: 5 },
      { module: 'qhse', action: 'view', project_id: 5 },
      { module: 'procurement', action: 'create', project_id: 5 },
    ]);
    expect(keys(seatUser)).toEqual(['overview', 'scope', 'site']);
    expect(tabs(seatUser, 'scope')).toEqual(['locations']);
    expect(tabs(seatUser, 'site')).toEqual(['qhse']);
    expect(keys(seatUser, 6)).toEqual([]);
  });

  test('unknown and unassigned users fail closed instead of receiving full navigation', () => {
    expect(keys(userWith([]))).toEqual([]);
    expect(keys(userWith(undefined))).toEqual([]);
    expect(keys({ role: 'owner' })).toEqual([]);
  });

  test('financial figures require the effective internal-cost visibility grant', () => {
    expect(canSeeFinancials(userWith([{ module: '*', action: 'see_internal_cost', project_id: 5 }]), 5)).toBe(true);
    expect(canSeeFinancials(userWith([{ module: '*', action: 'see_internal_cost', project_id: 5 }]), 6)).toBe(false);
    expect(canSeeFinancials(userWith([{ module: 'projects', action: 'view', project_id: 5 }]), 5)).toBe(false);
  });

  test('groupForPath maps existing pages and unknown routes to overview', () => {
    expect(groupForPath('')).toBe('overview');
    expect(groupForPath('boq')).toBe('scope');
    expect(groupForPath('work-orders')).toBe('site');
    expect(groupForPath('operations')).toBe('procurement');
    expect(groupForPath('reports')).toBe('documents');
    expect(groupForPath('units')).toBe('handover');
    expect(groupForPath('nothing')).toBe('overview');
  });
});
