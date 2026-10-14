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
});
