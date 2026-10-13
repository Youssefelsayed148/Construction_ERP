// Project tab visibility follows the same module/action grants sent by the policy API.
// Each grant retains its optional project scope; a hidden tab is still protected by the API.
export const PROJECT_GROUPS = [
  { key: 'overview', permission: ['projects', 'view'], tabs: [] },
  { key: 'scope', tabs: [
    { key: 'boq', path: 'boq', permission: ['boq', 'view'] },
    { key: 'locations', path: 'locations', permission: ['locations', 'view'] },
    { key: 'schedule', path: 'schedule', permission: ['schedule', 'view'] },
  ] },
  { key: 'site', tabs: [
    { key: 'site', path: 'site', permission: ['site', 'view'] },
    { key: 'siteWorkspace', path: 'site-workspace', permission: ['site', 'view'] },
    { key: 'workOrders', path: 'work-orders', permission: ['work-orders', 'view'] },
    { key: 'qhse', path: 'qhse', permission: ['qhse', 'view'] },
    { key: 'hse', path: 'hse', permission: ['hse', 'view'] },
  ] },
  { key: 'procurement', tabs: [{ key: 'operations', path: 'operations', permission: ['procurement', 'view'] }] },
  { key: 'documents', tabs: [
    { key: 'documents', path: 'documents', permission: ['docs', 'view'] },
    { key: 'reports', path: 'reports', permission: ['reports', 'view'] },
  ] },
  { key: 'handover', tabs: [
    { key: 'handover', path: 'handover', permission: ['handover', 'view'] },
    { key: 'units', path: 'units', permission: ['sales', 'view'] },
  ] },
];

export const UNIT_SALES_TYPES = ['residential', 'commercial', 'mixed'];

export function hasProjectPermission(user, module, action, projectId) {
  const grants = user?.policy_permissions;
  if (!Array.isArray(grants)) return false;
  return grants.some((grant) => {
    const moduleMatch = grant.module === '*' ? (grant.action === '*' || grant.action === action) : grant.module === module;
    const actionMatch = grant.action === '*' || grant.action === action;
    const projectMatch = grant.project_id == null || Number(grant.project_id) === Number(projectId);
    return moduleMatch && actionMatch && projectMatch;
  });
}

export function visibleGroups(user, projectId, projectType) {
  return PROJECT_GROUPS.map((group) => {
    if (group.key === 'overview') {
      return { ...group, tabs: [], visible: hasProjectPermission(user, ...group.permission, projectId) };
    }
    const tabs = group.tabs.filter((tab) => hasProjectPermission(user, ...tab.permission, projectId)
      && !(tab.path === 'units' && projectType && !UNIT_SALES_TYPES.includes(projectType)));
    return { ...group, tabs };
  }).filter((group) => group.key === 'overview' ? group.visible : group.tabs.length > 0);
}

// Financial cards use the policy visibility flag grant rather than a legacy role list.
export const canSeeFinancials = (user, projectId) => Array.isArray(user?.policy_permissions)
  && user.policy_permissions.some((grant) => grant.action === 'see_internal_cost'
    && (grant.module === '*' || grant.module)
    && (grant.project_id == null || Number(grant.project_id) === Number(projectId)));

export function groupForPath(path) {
  const found = PROJECT_GROUPS.find((group) => group.tabs.some((tab) => tab.path === path));
  return found ? found.key : 'overview';
}
