import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ProjectTabs } from './ProjectShell';

let mockRole = 'owner';
jest.mock('../../hooks/useLocale', () => ({
  useLocale: () => ({ locale: 'en', t: (key, params) => (params ? `${key}:${params.group}` : key) }),
}));
jest.mock('../../services/api', () => ({ authService: { getCurrentUser: () => ({ role: mockRole }) } }));
global.IS_REACT_ACT_ENVIRONMENT = true;

describe('project tabs (navigation visibility)', () => {
  let container; let root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  const render = (role, path, type = 'residential') => {
    mockRole = role;
    act(() => root.render(<MemoryRouter initialEntries={[path]}><ProjectTabs projectId="5" projectType={type} /></MemoryRouter>));
    const groups = [...container.querySelectorAll('.project-tabs-groups a')].map((a) => [a.textContent, a.getAttribute('href')]);
    const subs = [...container.querySelectorAll('.project-tabs-sub a')].map((a) => a.getAttribute('href'));
    return { groups, subs };
  };

  test('owner on the overview sees six groups and no sub-tabs', () => {
    const { groups, subs } = render('owner', '/projects/5');
    expect(groups.map((g) => g[0])).toEqual(['overview', 'scope', 'site', 'procurement', 'documents', 'handover'].map((k) => `projects.nav.groups.${k}`));
    expect(groups[0][1]).toBe('/projects/5');
    expect(groups[1][1]).toBe('/projects/5/boq');
    expect(subs).toEqual([]);
  });

  test('the active group shows its own sub-tabs, as links to the existing sub-page URLs', () => {
    const { subs } = render('owner', '/projects/5/work-orders');
    expect(subs).toEqual(['site', 'site-workspace', 'work-orders', 'qhse', 'hse'].map((p) => `/projects/5/${p}`));
    expect(container.querySelector('.project-tab.active').textContent).toBe('projects.nav.groups.site');
    expect(container.querySelector('.project-tabs-sub').getAttribute('aria-label')).toBe('projects.nav.aria.tabs:projects.nav.groups.site');
  });

  test('a site engineer does not get procurement or handover, and only the locations sub-tab under scope', () => {
    const { groups, subs } = render('site_engineer', '/projects/5/locations');
    expect(groups.map((g) => g[1])).toEqual(['/projects/5', '/projects/5/locations', '/projects/5/site', '/projects/5/documents']);
    expect(subs).toEqual(['/projects/5/locations']);
  });

  test('a storekeeper sees overview and procurement only; HR and viewer see overview only', () => {
    expect(render('storekeeper', '/projects/5').groups.length).toBe(2);
    expect(render('hr', '/projects/5').groups.length).toBe(1);
    expect(render('viewer', '/projects/5').groups.length).toBe(1);
  });

  test('Units & Sales disappears for a project type that does not sell units', () => {
    expect(render('owner', '/projects/5/handover', 'infrastructure').subs).toEqual(['/projects/5/handover']);
    expect(render('owner', '/projects/5/handover', 'residential').subs).toEqual(['/projects/5/handover', '/projects/5/units']);
  });
});
