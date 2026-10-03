import { PROJECT_GROUPS, visibleGroups, canSeeFinancials, groupForPath, UNIT_SALES_TYPES } from './projectNav';

const keys = (role, type) => visibleGroups(role, type).map((g) => g.key);
const tabs = (role, group, type) => (visibleGroups(role, type).find((g) => g.key === group)?.tabs || []).map((t) => t.key);

describe('project page navigation map', () => {
  test('six groups in the agreed order, every existing sub-page path appears exactly once', () => {
    expect(PROJECT_GROUPS.map((g) => g.key)).toEqual(['overview', 'scope', 'site', 'procurement', 'documents', 'handover']);
    const all = PROJECT_GROUPS.flatMap((g) => g.tabs.map((t) => t.path)).sort();
    expect(all).toEqual(['boq', 'documents', 'handover', 'hse', 'locations', 'operations', 'qhse', 'reports',
      'schedule', 'site', 'site-workspace', 'units', 'work-orders'].sort());
  });

  test('owner and project manager see everything for a unit-selling project', () => {
    for (const role of ['owner', 'admin', 'project_manager', 'coo']) {
      expect(keys(role, 'residential')).toEqual(['overview', 'scope', 'site', 'procurement', 'documents', 'handover']);
      expect(tabs(role, 'handover', 'residential')).toEqual(['handover', 'units']);
    }
  });

  test('Units & Sales is only offered for project types that sell units', () => {
    expect(UNIT_SALES_TYPES).toContain('residential');
    expect(tabs('owner', 'handover', 'infrastructure')).toEqual(['handover']);
    expect(tabs('owner', 'handover', 'industrial')).toEqual(['handover']);
    expect(tabs('finance_manager', 'handover', 'infrastructure')).toEqual([]);
    expect(keys('finance_manager', 'infrastructure')).not.toContain('handover');
  });

  test.each([
    ['site_engineer', ['overview', 'scope', 'site', 'documents'], { scope: ['locations'] }],
    ['site_manager', ['overview', 'scope', 'site', 'documents'], { scope: ['locations', 'schedule'] }],
    ['planning_engineer', ['overview', 'scope', 'documents'], { scope: ['boq', 'locations', 'schedule'] }],
    ['technical_office_engineer', ['overview', 'scope', 'site', 'documents'], { site: ['qhse'] }],
    ['quantity_surveyor', ['overview', 'scope', 'procurement', 'documents'], { documents: ['reports'] }],
    ['commercial_manager', ['overview', 'scope', 'procurement', 'documents'], { scope: ['boq'] }],
    ['procurement_officer', ['overview', 'procurement', 'documents'], {}],
    ['finance_manager', ['overview', 'procurement', 'documents', 'handover'], { documents: ['reports'], handover: ['units'] }],
    ['accountant_ap', ['overview', 'procurement', 'documents'], { documents: ['reports'] }],
    ['storekeeper', ['overview', 'procurement'], {}],
    ['qa_qc_engineer', ['overview', 'site', 'documents', 'handover'], { site: ['qhse'], handover: ['handover'] }],
    ['hse_officer', ['overview', 'site', 'documents'], { site: ['hse'] }],
    ['document_controller', ['overview', 'documents'], {}],
    ['hr', ['overview'], {}],
    ['business_development', ['overview'], {}],
    ['viewer', ['overview'], {}],
  ])('%s', (role, groups, expectTabs) => {
    expect(keys(role, 'residential')).toEqual(groups);
    for (const [g, list] of Object.entries(expectTabs)) expect(tabs(role, g, 'residential')).toEqual(list);
  });

  test('legacy keys: mapped where the meaning is unambiguous, unknown roles keep full navigation', () => {
    expect(keys('site_supervisor', 'residential')).toEqual(keys('site_manager', 'residential'));
    expect(keys('purchasing_mgr', 'residential')).toEqual(keys('procurement_manager', 'residential'));
    expect(keys('engineer', 'residential')).toEqual(keys('owner', 'residential'));
    expect(keys('staff', 'residential')).toEqual(keys('owner', 'residential'));
    expect(keys(undefined, 'residential')).toEqual(keys('owner', 'residential'));
    expect(keys('some_future_role', 'residential')).toEqual(keys('owner', 'residential'));
  });

  test('financial cards are shown only where the role can see the procurement and cost group', () => {
    expect(canSeeFinancials('owner')).toBe(true);
    expect(canSeeFinancials('quantity_surveyor')).toBe(true);
    expect(canSeeFinancials('finance_manager')).toBe(true);
    expect(canSeeFinancials('site_engineer')).toBe(false);
    expect(canSeeFinancials('hr')).toBe(false);
    expect(canSeeFinancials('viewer')).toBe(false);
    expect(canSeeFinancials('unknown_role')).toBe(true);
  });

  test('groupForPath maps every sub-page to its group; unknown paths fall back to overview', () => {
    expect(groupForPath('')).toBe('overview');
    expect(groupForPath('boq')).toBe('scope');
    expect(groupForPath('work-orders')).toBe('site');
    expect(groupForPath('operations')).toBe('procurement');
    expect(groupForPath('reports')).toBe('documents');
    expect(groupForPath('units')).toBe('handover');
    expect(groupForPath('nothing')).toBe('overview');
  });
});
