import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import MyActions from './MyActions';

jest.mock('../hooks/useLocale', () => ({
  useLocale: () => ({ locale: 'en', setLocale: jest.fn(), t: (key) => key }),
}));
global.IS_REACT_ACT_ENVIRONMENT = true;

const ok = (body) => ({ ok: true, json: async () => body });
const responseData = { buckets: { overdue: [
  { id: 1, title: 'Approve BOQ change', source_type: 'boq_change', source_id: 3, status: 'open',
    priority: 'high', due_date: '2026-02-01T00:00:00Z', assigned_user_id: 1, acknowledged_at: null },
] } };

describe('MyActions screen', () => {
  let container; let root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete global.fetch;
    jest.restoreAllMocks();
  });

  const render = () => act(() => root.render(<MyActions />));
  const flush = () => act(async () => {});

  const mockByEndpoint = (actionsBody, notifications = { success: true, data: [] }) => {
    global.fetch = jest.fn((url) => {
      if (url.includes('/actions/my')) return Promise.resolve(ok(actionsBody));
      return Promise.resolve(ok(notifications));
    });
  };

  test('renders the action row in its bucket tab with counts and due date', async () => {
    mockByEndpoint({ success: true, ...responseData });
    render(); await flush();
    expect(container.textContent).toContain('Overdue (1)');
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Approve BOQ change');
    expect(rows[0].textContent).toContain('boq_change #3');
    expect(rows[0].textContent).toContain('high');
  });

  test('an empty bucket shows the empty message and an empty notification inbox', async () => {
    mockByEndpoint({ success: true, buckets: {} });
    render(); await flush();
    expect(container.textContent).toContain('Nothing here.');
    expect(container.textContent).toContain('No notifications.');
    expect(container.querySelectorAll('tbody tr').length).toBe(0);
  });

  test('a failed load shows the error message and the empty bucket view', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Database unavailable'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    render(); await flush();
    expect(container.textContent).toContain('Database unavailable');
    expect(container.textContent).toContain('Nothing here.'); // error state, not a crash
    expect(container.querySelector('tbody')).not.toBe(null);
  });
});
