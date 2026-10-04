import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Clients from './Clients';

jest.mock('../hooks/useLocale', () => ({
  useLocale: () => ({ locale: 'en', setLocale: jest.fn(), t: (key) => key }),
}));
global.IS_REACT_ACT_ENVIRONMENT = true;

const ok = (body) => ({ ok: true, json: async () => body });

describe('Clients screen', () => {
  let container; let root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    // The list loaders swallow fetch errors with console.error; keep test output clean.
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete global.fetch;
    jest.restoreAllMocks();
  });

  const render = () => act(() => root.render(<Clients />));
  const flush = () => act(async () => {});

  test('renders one table row per client with the English name', async () => {
    global.fetch = jest.fn().mockResolvedValue(ok({ success: true, data: [
      { id: 1, code: 'CL-001', name_en: 'Delta Construction', client_type: 'company', is_active: true },
      { id: 2, code: 'CL-002', name_en: 'Nile Trading', client_type: 'individual', is_active: false },
    ] }));
    render(); await flush();
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Delta Construction');
    expect(rows[1].textContent).toContain('CL-002');
    expect(rows[1].textContent).toContain('Inactive');
  });

  test('shows the empty state when the list comes back empty', async () => {
    global.fetch = jest.fn().mockResolvedValue(ok({ success: true, data: [] }));
    render(); await flush();
    expect(container.querySelector('tbody')).toBe(null);
    expect(container.textContent).toContain('No clients found. Add your first client.');
  });

  test('falls back to the empty state (not a crash) when the list request rejects', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Database unavailable'));
    render(); await flush();
    expect(container.textContent).toContain('No clients found. Add your first client.');
    expect(container.querySelector('.spinner')).toBe(null); // loading cleared
  });

  test('typing in the search box refetches with the search query', async () => {
    global.fetch = jest.fn().mockResolvedValue(ok({ success: true, data: [] }));
    render(); await flush();
    const input = container.querySelector('.form-input');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'acme');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();
    expect(global.fetch.mock.calls.length).toBe(2);
    expect(global.fetch.mock.calls[1][0]).toContain('/api/clients?search=acme');
  });

  test('the add-client form posts the form payload and closes on success', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(ok({ success: true, data: [] }))
      .mockResolvedValueOnce(ok({ success: true }));
    render(); await flush();
    await act(async () => {
      [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Add Client')).click();
    });
    const modal = container.querySelector('.modal');
    expect(modal).not.toBe(null);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      const [nameEn, nameAr, , phone] = modal.querySelectorAll('.form-input');
      setter.call(nameEn, 'Delta Construction');
      nameEn.dispatchEvent(new Event('input', { bubbles: true }));
      setter.call(nameAr, 'دلتا للإنشاءات');
      nameAr.dispatchEvent(new Event('input', { bubbles: true }));
      setter.call(phone, '01000000000');
      phone.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { container.querySelector('.modal-footer .btn-primary').click(); });
    await flush();
    const [url, options] = global.fetch.mock.calls[1];
    expect(url).toBe('/api/clients');
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body);
    expect(body.name_en).toBe('Delta Construction');
    expect(body.name_ar).toBe('دلتا للإنشاءات');
    expect(body.phone).toBe('01000000000');
    expect(body.client_type).toBe('individual');
    expect(body.is_active).toBe(true);
    expect(container.querySelector('.modal')).toBe(null); // closed on success
  });

  test('a failed save shows the server error and re-enables the save button', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(ok({ success: true, data: [] }))
      .mockRejectedValueOnce(new Error('Duplicate client code'));
    render(); await flush();
    await act(async () => {
      [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Add Client')).click();
    });
    await act(async () => { container.querySelector('.modal-footer .btn-primary').click(); });
    await flush();
    const alert = container.querySelector('.alert-danger');
    expect(alert).not.toBe(null);
    expect(alert.textContent).toBe('Duplicate client code');
    expect(container.querySelector('.modal-footer .btn-primary').disabled).toBe(false);
  });
});
