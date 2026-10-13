import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ProjectTabs } from './ProjectShell';

let mockUser = { role: 'owner', policy_permissions: [{ module: '*', action: '*', project_id: null }] };
jest.mock('../../hooks/useLocale', () => ({
  useLocale: () => ({ locale: 'en', t: (key, params) => (params ? `${key}:${params.group}` : key) }),
}));
jest.mock('../../services/api', () => ({ authService: { getCurrentUser: () => mockUser } }));
global.IS_REACT_ACT_ENVIRONMENT = true;

describe('project tabs (effective permission visibility)', () => {
  let container; let root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); mockUser = { role: 'owner', policy_permissions: [{ module: '*', action: '*', project_id: null }] }; });

  const render = (user, path, type = 'residential') => {
    mockUser = user;
    const projectId = Number(path.match(/\/projects\/(\d+)/)?.[1] || 5);
    act(() => root.render(<MemoryRouter key={path} initialEntries={[path]}><ProjectTabs projectId={String(projectId)} projectType={type} /></MemoryRouter>));
    const groups = [...container.querySelectorAll('.project-tabs-groups a')].map((a) => [a.textContent, a.getAttribute('href')]);
    const subs = [...container.querySelectorAll('.project-tabs-sub a')].map((a) => a.getAttribute('href'));
    return { groups, subs };
  };

  test('wildcard grants expose all tabs and the active group uses its existing sub-page URLs', () => {
    const user = { role: 'owner', policy_permissions: [{ module: '*', action: '*', project_id: null }] };
    const { groups } = render(user, '/projects/5');
    expect(groups.map((g) => g[0])).toEqual(['overview', 'scope', 'site', 'procurement', 'documents', 'handover'].map((k) => `projects.nav.groups.${k}`));
    expect(groups[0][1]).toBe('/projects/5');
    expect(groups[1][1]).toBe('/projects/5/boq');
    const { subs } = render(user, '/projects/5/work-orders');
    expect(subs).toEqual(['site', 'site-workspace', 'work-orders', 'qhse', 'hse'].map((p) => `/projects/5/${p}`));
    expect(container.querySelector('.project-tab.active').textContent).toBe('projects.nav.groups.site');
  });

  test('a project seat shows only its granted destinations for that project', () => {
    const user = { role: 'site_engineer', policy_permissions: [
      { module: 'projects', action: 'view', project_id: 5 },
      { module: 'locations', action: 'view', project_id: 5 },
      { module: 'qhse', action: 'view', project_id: 5 },
    ] };
    const { groups, subs } = render(user, '/projects/5/locations');
    expect(groups.map((group) => group[1])).toEqual(['/projects/5', '/projects/5/locations', '/projects/5/qhse']);
    expect(subs).toEqual(['/projects/5/locations']);
    expect(render(user, '/projects/6').groups).toEqual([]);
  });

  test('HR and unmapped roles do not get a FULL fallback', () => {
    const hr = { role: 'hr_manager', policy_permissions: [{ module: 'projects', action: 'view', project_id: null }] };
    expect(render(hr, '/projects/5').groups.map((group) => group[1])).toEqual(['/projects/5']);
    expect(render({ role: 'future_role', policy_permissions: [] }, '/projects/5').groups).toEqual([]);
  });

  test('Units & Sales still follows project type and its explicit grant', () => {
    const user = { policy_permissions: [{ module: '*', action: '*', project_id: 5 }] };
    expect(render(user, '/projects/5/handover', 'infrastructure').subs).toEqual(['/projects/5/handover']);
    expect(render(user, '/projects/5/handover', 'residential').subs).toEqual(['/projects/5/handover', '/projects/5/units']);
  });
});
