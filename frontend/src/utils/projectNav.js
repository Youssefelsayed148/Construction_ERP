// The project page's navigation: six groups, each with sub-tabs that are the existing sub-page routes
// (/projects/:id/<path>). One visibility map (role -> groups and sub-tabs) lives here and nowhere else.
//
// Presentation only. Hiding a tab never replaces the backend policy check; a hidden sub-page URL still
// loads and the API still answers 403 for a role without the grant. Until Phase 5.1 grants are real every
// internal role holds a blanket grant, so this map is what narrows the page; it is keyed on role keys
// (spec 04 names plus the legacy keys whose meaning is unambiguous). A role that is not in the map sees
// everything, so a legacy or future role is never locked out of navigation by this file.
export const PROJECT_GROUPS = [
  { key: 'overview', tabs: [] },
  { key: 'scope', tabs: [{ key: 'boq', path: 'boq' }, { key: 'locations', path: 'locations' }, { key: 'schedule', path: 'schedule' }] },
  { key: 'site', tabs: [
    { key: 'site', path: 'site' }, { key: 'siteWorkspace', path: 'site-workspace' }, { key: 'workOrders', path: 'work-orders' },
    { key: 'qhse', path: 'qhse' }, { key: 'hse', path: 'hse' },
  ] },
  { key: 'procurement', tabs: [{ key: 'operations', path: 'operations' }] },
  { key: 'documents', tabs: [{ key: 'documents', path: 'documents' }, { key: 'reports', path: 'reports' }] },
  { key: 'handover', tabs: [{ key: 'handover', path: 'handover' }, { key: 'units', path: 'units' }] },
];

// Project types that sell units; Units & Sales is hidden for the rest. Easy to change.
export const UNIT_SALES_TYPES = ['residential', 'commercial', 'mixed'];

const ALL = true;
const FULL = { scope: ALL, site: ALL, procurement: ALL, documents: ALL, handover: ALL };
const NONE = {};
const TEAM_ONLY = { teamOnly: true };

// group -> true (every sub-tab) or a list of sub-page paths. Missing group = hidden. Overview is always visible.
const PROCUREMENT_AND_DOCS = { procurement: ALL, documents: ALL };
const ROLE_MAP = {
  owner: FULL, admin: FULL, manager: FULL, coo: FULL, projects_director: FULL, project_manager: FULL,
  construction_manager: { scope: ALL, site: ALL, procurement: ALL, documents: ALL, handover: ['handover'] },
  site_manager: { scope: ['schedule', 'locations'], site: ALL, documents: ALL },
  site_engineer: { scope: ['locations'], site: ALL, documents: ALL },
  planning_engineer: { scope: ALL, documents: ALL },
  technical_office_engineer: { scope: ALL, site: ['qhse'], documents: ALL },
  quantity_surveyor: { scope: ALL, procurement: ALL, documents: ['reports'] },
  commercial_manager: { scope: ['boq'], ...PROCUREMENT_AND_DOCS },
  contracts_manager: { scope: ['boq'], ...PROCUREMENT_AND_DOCS },
  procurement_manager: PROCUREMENT_AND_DOCS,
  procurement_officer: PROCUREMENT_AND_DOCS,
  finance_manager: { procurement: ALL, documents: ['reports'], handover: ['units'] },
  accountant_ar: { procurement: ALL, documents: ['reports'], handover: ['units'] },
  accountant_ap: { procurement: ALL, documents: ['reports'] },
  storekeeper: { procurement: ALL },
  qa_qc_engineer: { site: ['qhse'], documents: ALL, handover: ['handover'] },
  qa_qc_manager: { site: ['qhse'], documents: ALL, handover: ['handover'] },
  hse_officer: { site: ['hse'], documents: ALL },
  hse_manager: { site: ['hse'], documents: ALL },
  document_controller: { documents: ALL },
  // No equipment sub-page exists yet (equipment lives under /assets), so the plant manager sees Overview only here.
  equipment_manager: NONE,
  hr: TEAM_ONLY, business_development: TEAM_ONLY, viewer: TEAM_ONLY,
};
// Legacy keys that map cleanly onto a spec role. The rest (engineer, staff, accountant, ...) are deliberately
// absent: they keep full navigation until their users are moved to spec roles.
const LEGACY_ALIASES = { site_supervisor: 'site_manager', purchasing_mgr: 'procurement_manager' };

const specFor = (role) => ROLE_MAP[LEGACY_ALIASES[role] || role] || FULL;

const allowed = (spec, groupKey, path) => {
  const rule = spec[groupKey];
  return rule === true || (Array.isArray(rule) && rule.includes(path));
};

export function visibleGroups(role, projectType) {
  const spec = specFor(role);
  return PROJECT_GROUPS.map((group) => {
    if (group.key === 'overview') return group;
    const tabs = group.tabs.filter((tab) => allowed(spec, group.key, tab.path)
      && !(tab.path === 'units' && projectType && !UNIT_SALES_TYPES.includes(projectType)));
    return { ...group, tabs };
  }).filter((group) => group.key === 'overview' || group.tabs.length > 0);
}

// Contract value, budget and finance cards belong to the procurement and cost group.
export const canSeeFinancials = (role) => {
  const spec = specFor(role);
  return !spec.teamOnly && Boolean(spec.procurement);
};

export const isTeamOnly = (role) => Boolean(specFor(role).teamOnly);

export function groupForPath(path) {
  const found = PROJECT_GROUPS.find((group) => group.tabs.some((tab) => tab.path === path));
  return found ? found.key : 'overview';
}
