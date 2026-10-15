import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AdminWorkspace, { ADMIN_AREAS, canAccessAdminArea } from './AdminWorkspace';

jest.mock('../hooks/useLocale', () => ({ useLocale: () => ({ t: key => key, locale: 'en' }) }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const response = (status, body, total = '1') => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'X-Total-Count': total },
});

function mount(path = '/admin/organizations') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/admin/:area" element={<AdminWorkspace />} /></Routes></MemoryRouter>));
  return { container, root };
}

describe('R5 administrative workspaces', () => {
  let container;
  let root;
  beforeEach(() => {
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('user', JSON.stringify({ role: 'owner', policy_modules: ['*'], policy_permissions: [{ module: '*', action: '*' }] }));
    window.fetch = jest.fn();
  });
  afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); });

  test.each(Object.keys(ADMIN_AREAS))('defines a permission-scoped list screen for %s', area => {
    expect(canAccessAdminArea({ role: 'owner', policy_modules: ['*'] }, area)).toBe(true);
    expect(ADMIN_AREAS[area].list).toBeTruthy();
  });

  test.each(Object.keys(ADMIN_AREAS))('renders and loads the %s workspace', async area => {
    window.fetch.mockResolvedValue(response(200, { success: true, data: [] }, '0'));
    const search = ['variations', 'sla', 'numbering'].includes(area) ? '?project_id=7' : '';
    ({ container, root } = mount(`/admin/${area}${search}`));
    await act(async () => Promise.resolve());
    expect(container.querySelector('h1').textContent).toBe(`admin.${ADMIN_AREAS[area].title}.title`);
    expect(window.fetch).toHaveBeenCalled();
  });

  test('denies users without the route role or module grant', () => {
    expect(canAccessAdminArea({ role: 'staff', policy_modules: ['*'] }, 'users')).toBe(false);
    expect(canAccessAdminArea({ role: 'owner', policy_modules: ['inventory'] }, 'organizations')).toBe(false);
  });

  test('renders a permission denied state before making requests', async () => {
    localStorage.setItem('user', JSON.stringify({ role: 'staff', policy_modules: ['*'] }));
    ({ container, root } = mount('/admin/users'));
    await act(async () => Promise.resolve());
    expect(container.textContent).toContain('admin.messages.permissionDenied');
    expect(window.fetch).not.toHaveBeenCalled();
  });

  test('renders organizations, validates required fields, then creates successfully', async () => {
    window.fetch.mockResolvedValueOnce(response(200, { success: true, data: [] }));
    ({ container, root } = mount());
    await act(async () => Promise.resolve());
    expect(container.querySelector('h1').textContent).toBe('admin.organizations.title');
    await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(container.querySelector('[role="alert"]').textContent).toBe('common.validation.required');

    const fill = async (id, value) => act(async () => {
      const input = container.querySelector(`#admin-${id}`);
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set?.call(input, value);
      if (input.tagName === 'SELECT') input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await fill('code', 'ORG-1'); await fill('org_type', 'supplier'); await fill('name_en', 'Example'); await fill('name_ar', 'مثال');
    window.fetch.mockResolvedValueOnce(response(201, { success: true, data: { id: 1 } }));
    window.fetch.mockResolvedValueOnce(response(200, { success: true, data: [] }));
    await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(window.fetch.mock.calls.some(([url, options]) => String(url).includes('/organizations') && options.method === 'POST')).toBe(true);
  });

  test('shows typed save failures without losing the form', async () => {
    window.fetch.mockResolvedValueOnce(response(200, { success: true, data: [] }));
    ({ container, root } = mount());
    await act(async () => Promise.resolve());
    await act(async () => {
      const input = container.querySelector('#admin-code');
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set.call(input, 'ORG-ERR');
      input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
      for (const [id, value] of [['admin-org_type', 'other'], ['admin-name_en', 'Example'], ['admin-name_ar', 'مثال']]) {
        const element = container.querySelector(`#${id}`);
        if (element.tagName === 'SELECT') element.value = value;
        else Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    window.fetch.mockResolvedValueOnce(response(409, { error_code: 'database_conflict' }));
    await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(container.querySelector('form')).not.toBeNull();
    expect(container.querySelector('[role="alert"]').textContent).toBe('errors.requestFailed');
  });

  test('shows a newly created API token once and clears it when dismissed', async () => {
    window.fetch.mockResolvedValueOnce(response(200, { success: true, data: [] }, '0'));
    ({ container, root } = mount('/admin/api-tokens'));
    await act(async () => Promise.resolve());
    await act(async () => {
      for (const [id, value] of [['admin-name', 'Integration'], ['admin-scopes_text', 'projects:read'], ['admin-expires_in_days', '30']]) {
        const input = container.querySelector(`#${id}`);
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    window.fetch.mockResolvedValueOnce(response(201, { success: true, data: { token: 'once-only-token' } }));
    window.fetch.mockResolvedValueOnce(response(200, { success: true, data: [] }, '0'));
    await act(async () => container.querySelector('form.admin-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(container.textContent).toContain('once-only-token');
    const close = [...container.querySelectorAll('button')].find(button => button.textContent === 'common.close');
    await act(async () => close.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.textContent).not.toContain('once-only-token');
  });
});
