import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Reservations, { canManageReservations } from './Reservations';

jest.mock('../hooks/useLocale', () => ({ useLocale: () => ({ t: (key) => key, locale: 'en' }) }));
global.IS_REACT_ACT_ENVIRONMENT = true;

const STOREKEEPER = { id: 3, name: 'Demo Storekeeper', role: 'storekeeper',
  policy_modules: ['projects', 'items', 'warehouses'],
  policy_permissions: [
    { module: 'projects', action: 'view' }, { module: 'items', action: 'view' },
    { module: 'warehouses', action: 'view' }, { module: 'warehouses', action: 'create' },
  ] };
const VIEWER = { id: 4, name: 'Demo Viewer', role: 'viewer',
  policy_modules: ['projects'], policy_permissions: [{ module: 'projects', action: 'view' }] };

const LIST_BODY = { success: true, data: [
  { id: 7, material_code: 'MTL-0002', material_name_en: 'Cement', project_name: 'Project A',
    quantity: 40, status: 'active', expires_at: null, created_at: '2026-02-10T08:00:00Z' },
  { id: 6, material_code: 'MTL-0001', material_name_en: 'Sand', project_name: null,
    quantity: 5, status: 'released', expires_at: '2026-03-01T00:00:00Z', created_at: '2026-02-01T08:00:00Z' },
] };

function fetchMock() {
  return jest.fn(async (url, options = {}) => {
    const path = String(url).split('/api')[1] || String(url);
    if (path.startsWith('/items')) return { ok: true, status: 200, headers: new Headers(), json: async () => ({ success: true, data: [{ id: 2, code: 'MTL-0002', name_en: 'Cement' }] }) };
    if (path === '/warehouses' || path.startsWith('/warehouses?')) return { ok: true, status: 200, headers: new Headers(), json: async () => ({ success: true, data: [{ id: 1, name: 'Main warehouse' }] }) };
    if (path.startsWith('/warehouses/reservations') && options.method === 'POST' && String(url).endsWith('/release')) {
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ success: true, data: { id: 7, status: 'released' } }) };
    }
    if (path === '/warehouses/reservations' && options.method === 'POST') {
      return { ok: true, status: 201, headers: new Headers(), json: async () => ({ success: true, data: { id: 8 } }) };
    }
    if (path.startsWith('/warehouses/reservations')) {
      return { ok: true, status: 200, headers: new Headers(), json: async () => LIST_BODY };
    }
    throw new Error(`unexpected fetch ${options.method || 'GET'} ${path}`);
  });
}

async function renderPage(root, container, user) {
  if (user) localStorage.setItem('user', JSON.stringify(user));
  await act(async () => { root.render(<MemoryRouter><Reservations /></MemoryRouter>); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

describe('Reservations', () => {
  let container; let root; let previousFetch;
  beforeEach(() => {
    previousFetch = global.fetch;
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); global.fetch = previousFetch; jest.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); });

  test('canManageReservations follows the warehouses create grant only', () => {
    expect(canManageReservations(STOREKEEPER)).toBe(true);
    expect(canManageReservations(VIEWER)).toBe(false);
    expect(canManageReservations(null)).toBe(false);
  });

  test('loads the reservation list and shows the reserve form for warehouse write roles', async () => {
    global.fetch = fetchMock();
    await renderPage(root, container, STOREKEEPER);
    expect(global.fetch.mock.calls.some(([url]) => String(url).includes('/warehouses/reservations'))).toBe(true);
    expect(container.textContent).toContain('inventory.reservations.title');
    expect(container.textContent).toContain('MTL-0002');
    expect(container.textContent).toContain('enums.status.active');
    expect(container.textContent).toContain('enums.status.released');
    expect(container.textContent).toContain('inventory.reservations.newReservation');
    expect([...container.querySelectorAll('tr td button')].some((b) => b.textContent.includes('inventory.reservations.release'))).toBe(true);
  });

  test('read-only roles see the list without the reserve form or release actions', async () => {
    global.fetch = fetchMock();
    await renderPage(root, container, VIEWER);
    expect(container.textContent).not.toContain('inventory.reservations.newReservation');
    const buttons = [...container.querySelectorAll('tbody button')];
    expect(buttons.filter((b) => b.textContent.includes('inventory.reservations.release'))).toHaveLength(0);
  });

  test('renders the localized empty state for an empty filtered list', async () => {
    global.fetch = jest.fn(async (url) => {
      const path = String(url).split('/api')[1] || String(url);
      if (path.startsWith('/warehouses/reservations')) return { ok: true, status: 200, headers: new Headers(), json: async () => ({ success: true, data: [] }) };
      throw new Error(`unexpected fetch ${path}`);
    });
    await renderPage(root, container, STOREKEEPER);
    expect(container.textContent).toContain('inventory.reservations.empty');
  });

  test('renders the typed error contract, never the raw server message', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 500, headers: new Headers(), json: async () => ({ success: false, error: 'Raw server English failure' }) }));
    await renderPage(root, container, STOREKEEPER);
    expect(container.textContent).toContain('errors.serverError');
    expect(container.textContent).not.toContain('Raw server English failure');
  });

  test('creating a reservation posts the warehouse reservation contract with the selected material', async () => {
    global.fetch = fetchMock();
    await renderPage(root, container, STOREKEEPER);
    const form = [...container.querySelectorAll('form')].find((f) => f.textContent.includes('inventory.reservations.newReservation'));
    const select = form.querySelector('select');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    const inputs = form.querySelectorAll('input');
    const set = (element, value, proto = window.HTMLInputElement.prototype) => {
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    };
    await act(async () => {
      set(select, '2', window.HTMLSelectElement.prototype);
      set(inputs[0], '12.5');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const createCall = global.fetch.mock.calls.find(([url, options]) => String(url).endsWith('/api/warehouses/reservations') && options.method === 'POST');
    expect(createCall).toBeTruthy();
    expect(JSON.parse(createCall[1].body)).toEqual({ material_id: 2, quantity: 12.5, warehouse_id: null, expires_at: null });
  });

  test('releasing an active reservation posts to the release endpoint and reloads', async () => {
    global.fetch = fetchMock();
    await renderPage(root, container, STOREKEEPER);
    const releaseButton = [...container.querySelectorAll('tbody button')].find((b) => b.textContent.includes('inventory.reservations.release'));
    await act(async () => { releaseButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(global.fetch.mock.calls.some(([url, options]) => String(url).endsWith('/api/warehouses/reservations/7/release') && options.method === 'POST')).toBe(true);
  });
});
