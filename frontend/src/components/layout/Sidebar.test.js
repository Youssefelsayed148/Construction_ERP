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
    owner_ceo: ['dashboard', 'projects', 'inventory', 'clients', 'suppliers', 'assets', 'hr', 'invoices', 'finance-ledger', 'warehouses', 'notifications', 'legal', 'approvals', 'actions'],
    procurement_manager: ['dashboard', 'projects', 'procurement', 'suppliers', 'invoices', 'warehouses', 'notifications'],
    storekeeper: ['projects', 'items', 'warehouses', 'inventory', 'actions', 'notifications'],
    accountant_ar: ['dashboard', 'clients', 'invoices', 'payments', 'finance', 'finance-ledger', 'approvals', 'actions', 'notifications'],
    site_engineer: ['projects', 'boq', 'locations', 'quantities', 'schedule', 'site', 'work-orders', 'qhse', 'hse', 'actions', 'notifications'],
    hr_manager: ['hr', 'payroll', 'users', 'organizations', 'delegations', 'projects', 'dashboard', 'reports', 'actions', 'notifications'],
    client_executive: ['projects', 'docs', 'qhse', 'boq'],
    client_reviewer: ['projects', 'docs', 'qhse', 'boq'],
    pmc_manager: ['projects', 'boq', 'locations', 'quantities', 'site', 'schedule', 'docs', 'documents', 'qhse', 'reports'],
    consultant_coordinator: ['projects', 'consultant', 'documents'],
    consultant_reviewer: ['projects', 'consultant', 'documents'],
    subcontractor_manager: ['portal', 'subcontractors', 'documents'],
    subcontractor_site_engineer: ['portal', 'documents'],
    supplier_sales: ['portal', 'items', 'warehouses'],
    testing_lab: ['portal', 'qhse'],
  };
  const permissionsOf = (mods) => mods.map((m) => ({ module: m, action: 'view' }))
    // The bid-comparison entry additionally requires see_supplier_value.
    .concat([{ module: '*', action: 'see_supplier_value' }]);

  const renderFor = (role, explicitMods) => {
    const mods = explicitMods || Grants[role];
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
    expect(view.links).toEqual(expect.arrayContaining(['/dashboard', '/projects', '/inventory', '/hr', '/invoices', '/my-actions', '/cash-flow', '/reservations', '/notification-preferences', '/admin/organizations']));
    expect(view.links).not.toContain('/settings');
    expect(view.links).not.toContain('/agent-activity');
    view.unmount();
  });

  test('procurement_manager: comparison, suppliers, invoices and reservations; no hr, clients, expenses, legal or cash flow', () => {
    const view = renderFor('procurement_manager');
    expect(view.links).toEqual(expect.arrayContaining(['/procurement/comparison', '/suppliers', '/invoices', '/reservations', '/notification-preferences']));
    expect(view.links).not.toContain('/hr');
    expect(view.links).not.toContain('/clients');
    expect(view.links).not.toContain('/expenses');
    expect(view.links).not.toContain('/legal');
    expect(view.links).not.toContain('/cash-flow');
    view.unmount();
  });

  test('storekeeper: inventory, projects, reservations and notification preferences; no invoices, comparison, hr or cash flow', () => {
    const view = renderFor('storekeeper');
    expect(view.links).toEqual(expect.arrayContaining(['/inventory', '/projects', '/reservations', '/notification-preferences']));
    expect(view.links).not.toContain('/invoices');
    expect(view.links).not.toContain('/procurement/comparison');
    expect(view.links).not.toContain('/hr');
    expect(view.links).not.toContain('/cash-flow');
    view.unmount();
  });

  test('accountant_ar: invoices, my actions, cash flow and notification preferences; no inventory, hr, suppliers or reservations', () => {
    const view = renderFor('accountant_ar');
    expect(view.links).toEqual(expect.arrayContaining(['/invoices', '/my-actions', '/approvals', '/cash-flow', '/notification-preferences']));
    expect(view.links).not.toContain('/inventory');
    expect(view.links).not.toContain('/hr');
    expect(view.links).not.toContain('/suppliers');
    expect(view.links).not.toContain('/reservations');
    view.unmount();
  });

  test('site_engineer: projects, my actions and notification preferences; no invoices, inventory, reservations or cash flow', () => {
    const view = renderFor('site_engineer');
    expect(view.links).toEqual(expect.arrayContaining(['/projects', '/my-actions', '/notification-preferences']));
    expect(view.links).not.toContain('/invoices');
    expect(view.links).not.toContain('/inventory');
    expect(view.links).not.toContain('/reservations');
    expect(view.links).not.toContain('/cash-flow');
    expect(view.links).not.toContain('/admin/organizations');
    view.unmount();
  });

  test('hr_manager: hr and notification preferences; no invoices, inventory, reservations or cash flow', () => {
    const view = renderFor('hr_manager');
    expect(view.links).toEqual(expect.arrayContaining(['/hr', '/projects', '/notification-preferences']));
    expect(view.links).not.toContain('/invoices');
    expect(view.links).not.toContain('/inventory');
    expect(view.links).not.toContain('/reservations');
    expect(view.links).not.toContain('/cash-flow');
    expect(view.links).not.toContain('/admin/organizations');
    view.unmount();
  });

  test('FINDING C5 (fixed): every canonical external role renders its alias family portal menu', () => {
    // The 0031 canonical external roles map to the portal menu of their legacy
    // alias family: same path, nothing beyond what the legacy roles reach.
    const expected = {
      client_executive: ['/client-portal'],
      client_reviewer: ['/client-portal'],
      pmc_manager: ['/client-portal'],
      consultant_coordinator: ['/consultant-portal'],
      consultant_reviewer: ['/consultant-portal'],
      subcontractor_manager: ['/subcontractor-portal'],
      subcontractor_site_engineer: ['/subcontractor-portal'],
      supplier_sales: ['/supplier-portal'],
      testing_lab: ['/supplier-portal'],
    };
    for (const [role, links] of Object.entries(expected)) {
      const view = renderFor(role);
      expect(view.links).toEqual(links);
      view.unmount();
    }
  });

  test('legacy external roles keep their existing portal menus verbatim', () => {
    // Legacy grant fixtures: their own grants include their portal module.
    const legacyGrants = {
      client: ['client-portal', 'projects', 'docs', 'qhse', 'boq'],
      consultant: ['consultant', 'projects', 'boq', 'qhse', 'docs', 'work-orders', 'documents'],
      subcontractor: ['portal', 'subcontractors'],
      supplier: ['portal', 'items', 'warehouses'],
    };
    for (const [role, links] of Object.entries({
      client: ['/client-portal'], consultant: ['/consultant-portal'],
      subcontractor: ['/subcontractor-portal'], supplier: ['/supplier-portal'],
    })) {
      const view = renderFor(role, legacyGrants[role]);
      expect(view.links).toEqual(links);
      view.unmount();
    }
  });
});

});
