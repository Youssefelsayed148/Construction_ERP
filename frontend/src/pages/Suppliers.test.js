import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Suppliers from './Suppliers';

jest.mock('../hooks/useLocale', () => ({
  useLocale: () => ({ locale: 'en', setLocale: jest.fn(), t: (key) => key }),
}));
global.IS_REACT_ACT_ENVIRONMENT = true;

const ok = (body) => ({ ok: true, json: async () => body });
const supplier = { id: 1, code: 'SUP-001', name_en: 'Cement Trader', specialty: 'concrete', city: 'Cairo', is_active: true };

describe('Suppliers screen', () => {
  let container; let root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete global.fetch;
    jest.restoreAllMocks();
  });

  const render = () => act(() => root.render(<Suppliers />));
  const flush = () => act(async () => {});

  test('renders supplier rows with the specialty label and active badge', async () => {
    global.fetch = jest.fn().mockResolvedValue(ok({ success: true, data: [supplier] }));
    render(); await flush();
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Cement Trader');
    expect(rows[0].textContent).toContain('Concrete');
    expect(rows[0].textContent).toContain('common.statuses.active');
  });

  test('shows the empty state when no suppliers exist', async () => {
    global.fetch = jest.fn().mockResolvedValue(ok({ success: true, data: [] }));
    render(); await flush();
    expect(container.querySelector('tbody')).toBe(null);
    expect(container.textContent).toContain('No suppliers found. Add your first supplier.');
  });

  test('the edit form PUTs the updated payload to the supplier endpoint', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('/suppliers?')) return Promise.resolve(ok({ success: true, data: [supplier] }));
      if (url.includes('/suppliers/1/materials')) return Promise.resolve(ok({ success: true, data: [] }));
      if (url.includes('/items?')) return Promise.resolve(ok({ success: true, data: [] }));
      return Promise.resolve(ok({ success: true }));
    });
    render(); await flush();
    await act(async () => { container.querySelector('tbody tr .btn').click(); });
    const modal = container.querySelector('.modal');
    expect(modal.textContent).toContain('Edit: SUP-001');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      const nameEn = modal.querySelector('.form-input');
      setter.call(nameEn, 'Cement Trader Ltd');
      nameEn.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { container.querySelector('.modal-footer .btn-primary').click(); });
    await flush();
    const [url, options] = global.fetch.mock.calls.find(([, o]) => o && o.method === 'PUT');
    expect(url).toBe('/api/suppliers/1');
    expect(options.method).toBe('PUT');
    const body = JSON.parse(options.body);
    expect(body.name_en).toBe('Cement Trader Ltd');
    expect(body.name_ar).toBe(''); // untouched fields are preserved as-is
    expect(body.specialty).toBe('concrete');
    expect(container.querySelector('.modal')).toBe(null); // closed on success
  });
});
