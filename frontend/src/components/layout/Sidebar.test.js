import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '../../store';
import { authService } from '../../services/api';
import Sidebar from './Sidebar';

jest.mock('../../hooks/useLocale', () => ({
  useLocale: () => ({ locale: 'en', setLocale: jest.fn(), t: key => key }),
}));
global.IS_REACT_ACT_ENVIRONMENT = true;

describe('R0.8 context auth and sidebar preserve session behavior', () => {
  let root; let container; let auth;
  const user = { id: 7, name: 'Engineer', role: 'site_engineer', policy_modules: ['projects'],
    policy_permissions: [{ module: 'projects', action: 'view' }], scoped_project_ids: [11] };
  function Probe() { auth = useAuth(); return null; }
  beforeEach(() => {
    localStorage.clear(); sessionStorage.clear();
    authService.setSession('fixture-token', user);
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<AuthProvider><Probe /><MemoryRouter>
      <Routes><Route path="/" element={<Sidebar />} /><Route path="/login" element={<p>Logged out</p>} /></Routes>
    </MemoryRouter></AuthProvider>));
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); localStorage.clear(); sessionStorage.clear(); });

  test('restores user role, project scope and permissions while retaining token key', () => {
    expect(auth.user).toEqual(user);
    expect(auth.isAuthenticated).toBe(true);
    expect(localStorage.getItem('token')).toBe('fixture-token');
    expect(container.querySelector('a[href="/projects"]')).not.toBeNull();
    expect(container.querySelector('a[href="/invoices"]')).toBeNull();
  });

  test('sidebar logout clears session and preview, resets context and navigates without resetting locale', () => {
    localStorage.setItem('locale', 'ar');
    sessionStorage.setItem('clientPreviewToken', 'fixture-preview');
    act(() => container.querySelector('.logout-btn').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(auth.user).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.error).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(sessionStorage.getItem('clientPreviewToken')).toBeNull();
    expect(localStorage.getItem('locale')).toBe('ar');
    expect(container.textContent).toContain('Logged out');
  });

  test('user, loading and error transitions preserve former auth slice semantics', () => {
    act(() => auth.setLoading(true));
    expect(auth.loading).toBe(true);
    act(() => auth.setError('fixture failure'));
    expect(auth.error).toBe('fixture failure');
    expect(auth.loading).toBe(false);
    const updated = { ...user, role: 'project_manager' };
    act(() => auth.setUser(updated));
    expect(auth.user).toEqual(updated);
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.error).toBe('fixture failure');
  });

// C5: the canonical role map (migration 0031) against the rendered sidebar.
// Menu entries are module-gated by the session's effective policy grants;
// adminWorkspaces/settings/agent-activity are additionally role-gated.
describe('C5 canonical role map: rendered sidebar entries', () => {
  const Grants = {
    owner_ceo: ['dashboard', 'projects', 'inventory', 'clients', 'suppliers', 'assets', 'hr', 'invoices', 'legal', 'approvals', 'actions'],
    procurement_manager: ['dashboard', 'projects', 'inventory', 'procurement', 'suppliers', 'invoices'],
    storekeeper: ['projects', 'items', 'warehouses', 'inventory', 'actions', 'notifications'],
    accountant_ar: ['dashboard', 'clients', 'invoices', 'payments', 'finance', 'finance-ledger', 'approvals', 'actions'],
    site_engineer: ['projects', 'boq', 'locations', 'quantities', 'schedule', 'site', 'work-orders', 'qhse', 'hse', 'actions', 'notifications'],
    hr_manager: ['hr', 'payroll', 'users', 'organizations', 'delegations', 'projects', 'dashboard', 'reports', 'actions', 'notifications'],
    client_executive: ['projects', 'docs', 'qhse', 'boq'],
    supplier_sales: ['portal', 'items', 'warehouses'],
  };
  const permissionsOf = (mods) => mods.map((m) => ({ module: m, action: 'view' }))
    // The bid-comparison entry additionally requires see_supplier_value.
    .concat([{ module: '*', action: 'see_supplier_value' }]);

  const renderFor = (role) => {
    const mods = Grants[role];
    localStorage.clear();
    authService.setSession('fixture-token', { id: 9, name: `Demo ${role}`, role,
      policy_modules: [...mods], policy_permissions: permissionsOf(mods) });
    let c = document.createElement('div');
    document.body.appendChild(c);
    let r = createRoot(c);
    act(() => r.render(<AuthProvider><MemoryRouter initialEntries={['/dashboard']}>
      <Sidebar />
    </MemoryRouter></AuthProvider>));
    return { get links() { return [...c.querySelectorAll('a.nav-item')].map((a) => a.getAttribute('href')); },
      unmount() { act(() => r.unmount()); c.remove(); } };
  };

  test('owner_ceo: full internal menu plus admin workspaces; settings and agent activity stay owner/admin', () => {
    const view = renderFor('owner_ceo');
    expect(view.links).toEqual(expect.arrayContaining(['/dashboard', '/projects', '/inventory', '/hr', '/invoices', '/my-actions', '/admin/organizations']));
    expect(view.links).not.toContain('/settings');
    expect(view.links).not.toContain('/agent-activity');
    view.unmount();
  });

  test('procurement_manager: comparison, suppliers and invoices; no hr, clients, expenses or legal', () => {
    const view = renderFor('procurement_manager');
    expect(view.links).toEqual(expect.arrayContaining(['/procurement/comparison', '/suppliers', '/invoices', '/inventory']));
    expect(view.links).not.toContain('/hr');
    expect(view.links).not.toContain('/clients');
    expect(view.links).not.toContain('/expenses');
    expect(view.links).not.toContain('/legal');
    view.unmount();
  });

  test('storekeeper: inventory and projects; no invoices, procurement comparison or hr (no prices, no money)', () => {
    const view = renderFor('storekeeper');
    expect(view.links).toEqual(expect.arrayContaining(['/inventory', '/projects']));
    expect(view.links).not.toContain('/invoices');
    expect(view.links).not.toContain('/procurement/comparison');
    expect(view.links).not.toContain('/hr');
    view.unmount();
  });

  test('accountant_ar: invoices and my actions; no inventory, hr or suppliers', () => {
    const view = renderFor('accountant_ar');
    expect(view.links).toEqual(expect.arrayContaining(['/invoices', '/my-actions', '/approvals']));
    expect(view.links).not.toContain('/inventory');
    expect(view.links).not.toContain('/hr');
    expect(view.links).not.toContain('/suppliers');
    view.unmount();
  });

  test('site_engineer: projects and my actions; no invoices, inventory or admin workspaces', () => {
    const view = renderFor('site_engineer');
    expect(view.links).toEqual(expect.arrayContaining(['/projects', '/my-actions']));
    expect(view.links).not.toContain('/invoices');
    expect(view.links).not.toContain('/inventory');
    expect(view.links).not.toContain('/admin/organizations');
    view.unmount();
  });

  test('hr_manager: hr; no invoices, inventory or admin workspaces', () => {
    const view = renderFor('hr_manager');
    expect(view.links).toEqual(expect.arrayContaining(['/hr', '/projects']));
    expect(view.links).not.toContain('/invoices');
    expect(view.links).not.toContain('/inventory');
    expect(view.links).not.toContain('/admin/organizations');
    view.unmount();
  });

  test('FINDING C5: canonical external roles render an empty or portal-less sidebar - the portal menu is keyed by legacy roles', () => {
    const client = renderFor('client_executive');
    expect(client.links).toEqual(['/projects']);
    client.unmount();
    const supplier = renderFor('supplier_sales');
    // supplier_sales holds portal/items/warehouses but the portal entry is keyed 'supplier'
    // and no main-menu module matches, so the sidebar renders without any portal link.
    expect(supplier.links).toEqual([]);
    supplier.unmount();
  });
});

});
