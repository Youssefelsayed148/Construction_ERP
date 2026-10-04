import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Expenses from './Expenses';

jest.mock('../hooks/useLocale', () => ({
  useLocale: () => ({ locale: 'en', setLocale: jest.fn(), t: (key) => key }),
}));
global.IS_REACT_ACT_ENVIRONMENT = true;

const ok = (body) => ({ ok: true, json: async () => body });

describe('Expenses screen', () => {
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

  const render = () => act(() => root.render(<Expenses />));
  const flush = () => act(async () => {});

  const openModal = async () => {
    await act(async () => {
      [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Add Expense')).click();
    });
    return container.querySelector('.modal');
  };
  const fill = async (modal, index, value) => {
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      const input = modal.querySelectorAll('.form-input')[index];
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  test('the expense form posts the payload with a numeric project_id and closes on success', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('/projects?')) return Promise.resolve(ok({ success: true, data: [{ id: 5, code: 'PRJ-005', name_en: 'Tower' }] }));
      return Promise.resolve(ok({ success: true }));
    });
    render(); await flush();
    const modal = await openModal();
    await flush(); // projects load into the modal select
    await fill(modal, 0, 'Site fuel');
    await fill(modal, 1, '1500');
    await act(async () => {
      const projectSelect = modal.querySelector('select.form-select:nth-of-type(2)') || modal.querySelectorAll('select')[1];
      projectSelect.value = '5';
      projectSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => { container.querySelector('.modal-footer .btn-primary').click(); });
    await flush();
    const [url, options] = global.fetch.mock.calls.find(([, o]) => o && o.method === 'POST');
    expect(url).toBe('/api/expenses');
    const body = JSON.parse(options.body);
    expect(body.description).toBe('Site fuel');
    expect(body.amount).toBe('1500');
    expect(body.project_id).toBe(5);
    expect(container.querySelector('.modal')).toBe(null); // closed on success
  });

  test('a failed save surfaces the API error and leaves the modal open', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('/projects?')) return Promise.resolve(ok({ success: true, data: [] }));
      return Promise.reject(new Error('Amount exceeds project budget'));
    });
    render(); await flush();
    const modal = await openModal();
    await fill(modal, 0, 'Site fuel');
    await fill(modal, 1, '1500');
    await act(async () => { container.querySelector('.modal-footer .btn-primary').click(); });
    await flush();
    const alert = container.querySelector('.alert-danger');
    expect(alert).not.toBe(null);
    expect(alert.textContent).toBe('Amount exceeds project budget');
    expect(container.querySelector('.modal')).not.toBe(null); // modal stays open on failure
  });

  test('a saved expense renders in the table with its category and amount', async () => {
    global.fetch = jest.fn().mockResolvedValue(ok({ success: true, data: [
      { id: 9, category: 'fuel', description: 'Site fuel', amount: '1500.00', status: 'pending', created_at: '2026-01-15T00:00:00Z' },
    ] }));
    render(); await flush();
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Site fuel');
    expect(rows[0].textContent).toContain('fuel');
    expect(rows[0].textContent).toContain('1,500');
  });
});
