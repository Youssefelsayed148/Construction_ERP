import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Payroll from './Payroll';

jest.mock('../hooks/useLocale', () => ({
  useLocale: () => ({ locale: 'en', setLocale: jest.fn(), t: (key) => key }),
}));
global.IS_REACT_ACT_ENVIRONMENT = true;

const ok = (body) => ({ ok: true, json: async () => body });

describe('Payroll screen', () => {
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

  const render = () => act(() => root.render(<Payroll />));
  const flush = () => act(async () => {});

  test('shows the empty state when there are no payroll periods', async () => {
    global.fetch = jest.fn().mockResolvedValue(ok({ success: true, data: [] }));
    render(); await flush();
    expect(container.querySelector('tbody')).toBe(null);
    expect(container.textContent).toContain('No payroll periods found. Create your first payroll.');
  });

  test('renders one row per payroll period', async () => {
    global.fetch = jest.fn().mockResolvedValue(ok({ success: true, data: [
      { id: 1, month: 1, year: 2026, status: 'draft' },
    ] }));
    render(); await flush();
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('January 2026');
  });

  test('generating posts the selected month/year and shows the success message', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(ok({ success: true, data: [] }))
      .mockResolvedValueOnce(ok({ success: true }));
    render(); await flush();
    await act(async () => {
      [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Create Payroll')).click();
    });
    expect(container.querySelector('.modal')).not.toBe(null);
    await act(async () => { container.querySelector('.modal-footer .btn-primary').click(); });
    await flush();
    const [url, options] = global.fetch.mock.calls[1];
    expect(url).toBe('/api/payroll');
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body);
    expect(typeof body.month).toBe('number');
    expect(body.month).toBe(new Date().getMonth() + 1);
    expect(body.year).toBe(new Date().getFullYear());
    expect(container.textContent).toContain('Payroll generated successfully!');
  });

  test('a failed generation shows the server error and no success message', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(ok({ success: true, data: [] }))
      .mockResolvedValueOnce(ok({ success: false, error: 'Period already exists' }));
    render(); await flush();
    await act(async () => {
      [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Create Payroll')).click();
    });
    await act(async () => { container.querySelector('.modal-footer .btn-primary').click(); });
    await flush();
    const alert = container.querySelector('.alert-danger');
    expect(alert).not.toBe(null);
    expect(alert.textContent).toBe('Period already exists');
    expect(container.querySelector('.alert-success')).toBe(null);
  });
});
