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

let container;
let root;

function setValue(element, value) {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value');
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

async function fillRequiredFields(container, config) {
  for (const field of config.fields) {
    if (!field.required) continue;
    const input = container.querySelector(`#admin-${field.name}`);
    if (!input) continue;
    let value = 'value';
    if (field.type === 'select') value = [...input.options].find(option => option.value)?.value || 'value';
    else if (field.type === 'number') value = '1';
    else if (field.type === 'date') value = '2026-12-01';
    else if (field.type === 'email') value = 'person@example.test';
    else if (field.type === 'url') value = 'https://example.test/hook';
    else if (field.type === 'textarea') value = field.name.endsWith('_json') ? '[]' : 'value';
    await act(async () => setValue(input, value));
  }
}

function adminRow(config) {
  const row = { id: 41, key: 'owner', is_active: true, status: 'draft', rule_key: 'replenishment_policy:material:cement' };
  for (const field of config.fields) row[field.name] = field.type === 'checkbox' ? true : field.required ? (field.type === 'number' ? 1 : 'existing') : '';
  return row;
}

async function executeWrite(area, action) {
  const config = ADMIN_AREAS[area];
  const row = adminRow(config);
  window.fetch.mockImplementation(async (url, options = {}) => {
    const method = (options.method || 'GET').toUpperCase();
    return method === 'GET'
      ? response(200, { success: true, data: area === 'inventory-documents' && String(url).includes('/41') ? row : [row] }, '1')
      : response(200, { success: true, data: { id: row.id, secret: 'rotated-secret', token: 'new-token' } }, '1');
  });
  ({ container, root } = mount(`/admin/${area}${['variations', 'inventory-documents', 'numbering', 'sla'].includes(area) ? '?project_id=7' : ''}`));
  await act(async () => Promise.resolve());
  if (action === 'create') {
    await fillRequiredFields(container, config);
    await act(async () => container.querySelector('form.admin-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  } else if (action === 'update') {
    const edit = [...container.querySelectorAll('button')].find(button => button.textContent === 'common.edit');
    await act(async () => edit.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await fillRequiredFields(container, config);
    await act(async () => container.querySelector('form.admin-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  } else if (action === 'deactivate') {
    const button = [...container.querySelectorAll('button')].find(item => item.textContent === 'admin.actions.deactivate');
    await act(async () => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  } else if (action === 'post') {
    const button = [...container.querySelectorAll('button')].find(item => item.textContent === 'admin.actions.post');
    await act(async () => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  } else if (action === 'void') {
    const button = [...container.querySelectorAll('button')].find(item => item.textContent === 'admin.actions.void');
    await act(async () => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await act(async () => setValue(container.querySelector('#admin-void-reason'), 'test reason'));
    await act(async () => container.querySelector('#admin-void-reason').closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  } else if (action === 'rotate') {
    const button = [...container.querySelectorAll('button')].find(item => item.textContent === 'admin.actions.rotateSecret');
    await act(async () => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  } else if (action === 'sweep') {
    const button = [...container.querySelectorAll('button')].find(item => item.textContent === 'admin.actions.runSweep');
    await act(async () => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  }
  const endpointKey = action === 'rotate' ? 'rotate' : action;
  const endpoint = config[endpointKey];
  const params = new URLSearchParams(['variations', 'inventory-documents', 'numbering'].includes(area) ? 'project_id=7' : '');
  const expected = typeof endpoint === 'function'
    ? action === 'create' ? endpoint(params) : endpoint(row.id, params)
    : endpoint;
  return { calls: window.fetch.mock.calls.filter(([, options = {}]) => (options.method || 'GET').toUpperCase() !== 'GET'), expected };
}

async function submitWithFailure(area, status) {
  const config = ADMIN_AREAS[area];
  const row = adminRow(config);
  window.fetch.mockImplementation(async (url, options = {}) => {
    const method = (options.method || 'GET').toUpperCase();
    if (method !== 'GET') return response(status, { error: { code: status === 422 ? 'validation_error' : 'internal_error', message: 'request failed' } });
    return response(200, { success: true, data: area === 'inventory-documents' && String(url).includes('/41') ? row : [row] }, '1');
  });
  ({ container, root } = mount(`/admin/${area}${['variations', 'inventory-documents', 'numbering'].includes(area) ? '?project_id=7' : ''}`));
  await act(async () => Promise.resolve());
  if (!config.create) {
    const edit = [...container.querySelectorAll('button')].find(button => button.textContent === 'common.edit');
    await act(async () => edit.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  }
  await fillRequiredFields(container, config);
  await act(async () => container.querySelector('form.admin-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  return container.querySelector('[role="alert"]')?.textContent || '';
}

describe('R5 administrative workspaces', () => {
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
    window.fetch.mockResolvedValueOnce(response(409, { error: { code: 'validation_error', message: 'Invalid request' } }));
    await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(container.querySelector('form')).not.toBeNull();
    expect(container.querySelector('[role="alert"]').textContent).toBe('errors.validation_error');
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

  test('organization Load More appends a distinct row and stops at X-Total-Count', async () => {
    window.fetch.mockImplementation(url => {
      const offset = Number(new URL(String(url), 'http://localhost').searchParams.get('offset') || 0);
      return Promise.resolve(response(200, { success: true, data: [{ id: offset + 1, code: `ORG-${offset + 1}`, name_en: `Organization ${offset + 1}`, org_type: 'supplier', status: 'active' }] }, '2'));
    });
    ({ container, root } = mount());
    await act(async () => Promise.resolve());
    const button = [...container.querySelectorAll('button')].find(item => item.textContent === 'common.pagination.loadMore');
    expect(button).not.toBeNull();
    await act(async () => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(container.textContent).toContain('Organization 2');
    expect(window.fetch.mock.calls.some(([url]) => new URL(String(url), 'http://localhost').searchParams.get('offset') === '1')).toBe(true);
    expect([...container.querySelectorAll('button')].some(item => item.textContent === 'common.pagination.loadMore')).toBe(false);
  });

  test.each([
    ['organizations', 'create'], ['organizations', 'update'], ['organizations', 'deactivate'],
    ['users', 'update'], ['users', 'deactivate'], ['delegations', 'create'], ['delegations', 'deactivate'],
    ['approval-limits', 'update'], ['inventory-documents', 'create'], ['inventory-documents', 'update'],
    ['inventory-documents', 'post'], ['inventory-documents', 'void'], ['variations', 'create'], ['variations', 'update'],
    ['webhooks', 'create'], ['webhooks', 'update'], ['webhooks', 'deactivate'], ['webhooks', 'rotate'],
    ['api-tokens', 'create'], ['api-tokens', 'deactivate'], ['numbering', 'update'],
    ['replenishment', 'create'], ['replenishment', 'update'], ['replenishment', 'deactivate'], ['replenishment', 'sweep'],
  ])('%s %s action sends its configured write request', async (area, action) => {
    const { calls, expected } = await executeWrite(area, action);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.map(([url]) => String(url))).toEqual(expect.arrayContaining([expect.stringContaining(expected)]));
  });

  test.each(Object.keys(ADMIN_AREAS))('%s denies a permitted role when its module grant is absent without calling the API', async area => {
    const config = ADMIN_AREAS[area];
    localStorage.setItem('user', JSON.stringify({ role: config.roles[0], policy_modules: ['unrelated'], policy_permissions: [] }));
    ({ container, root } = mount(`/admin/${area}?project_id=7`));
    await act(async () => Promise.resolve());
    expect(container.textContent).toContain('admin.messages.permissionDenied');
    expect(window.fetch).not.toHaveBeenCalled();
  });

  test.each(Object.keys(ADMIN_AREAS).filter(area => area !== 'sla'))('%s surfaces a validation response without dropping its form', async area => {
    expect(await submitWithFailure(area, 422)).toBe('errors.validation_error');
    expect(container.querySelector('form.admin-form')).not.toBeNull();
  });

  test.each(Object.keys(ADMIN_AREAS).filter(area => area !== 'sla'))('%s surfaces a server failure without dropping its form', async area => {
    expect(await submitWithFailure(area, 500)).toBe('errors.serverError');
    expect(container.querySelector('form.admin-form')).not.toBeNull();
  });
});
