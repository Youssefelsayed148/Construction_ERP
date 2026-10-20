import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import NotificationPreferences from './NotificationPreferences';

jest.mock('../hooks/useLocale', () => ({ useLocale: () => ({ t: (key) => key, locale: 'en' }) }));
global.IS_REACT_ACT_ENVIRONMENT = true;

const PREFS_BODY = { success: true, data: [
  { id: 1, user_id: 3, event_type: 'invoice.overdue', channel: 'email', enabled: true },
  { id: 2, user_id: 3, event_type: 'invoice.overdue', channel: 'whatsapp', enabled: false },
] };

const okJson = (body) => ({ ok: true, status: 200, headers: new Headers(), json: async () => body });

async function renderPage(root, container, fetchInstance) {
  await act(async () => { root.render(<MemoryRouter><NotificationPreferences /></MemoryRouter>); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

describe('NotificationPreferences', () => {
  let container; let root; let previousFetch;
  beforeEach(() => {
    previousFetch = global.fetch;
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); global.fetch = previousFetch; jest.clearAllMocks(); localStorage.clear(); });

  test('renders the event x channel matrix with stored overrides on top of the defaults', async () => {
    global.fetch = jest.fn(async (url) => okJson(PREFS_BODY));
    await renderPage(root, container);
    expect(global.fetch.mock.calls.some(([url]) => String(url).includes('/notifications/preferences'))).toBe(true);
    expect(container.textContent).toContain('notifications.preferences.title');
    // All 16 routed events render, channels via the enums.channel catalog.
    expect([...container.querySelectorAll('tbody tr')]).toHaveLength(16);
    expect(container.querySelector('thead').textContent).toContain('enums.channel.inApp');
    const checkboxes = [...container.querySelectorAll('tbody input[type="checkbox"]')];
    expect(checkboxes).toHaveLength(16 * 5);
    // Default: in_app on; stored rows override (invoice.overdue email on, whatsapp off).
    const checkboxAt = (rowIndex, channelIndex) => checkboxes[rowIndex * 5 + channelIndex];
    expect(checkboxAt(1, 0).checked).toBe(true); // rfi.submitted in_app default on
    expect(checkboxAt(1, 1).checked).toBe(false); // rfi.submitted email default off
    expect(checkboxAt(6, 1).checked).toBe(true); // invoice.overdue email stored on
    expect(checkboxAt(6, 4).checked).toBe(false); // invoice.overdue whatsapp stored off
    // An empty stored list shows the defaults note.
    expect(container.querySelector('[data-testid="prefs-defaults-note"]')).toBeNull();
  });

  test('shows the defaults note when no personal preference rows exist', async () => {
    global.fetch = jest.fn(async (url) => okJson({ success: true, data: [] }));
    await renderPage(root, container);
    expect(container.querySelector('[data-testid="prefs-defaults-note"]')).not.toBeNull();
    expect(container.textContent).toContain('notifications.preferences.defaultsNote');
  });

  test('toggling a cell PUTs the exact preference contract', async () => {
    global.fetch = jest.fn(async (url, options = {}) => {
      if (options.method === 'PUT') return okJson({ success: true });
      return okJson({ success: true, data: [] });
    });
    await renderPage(root, container);
    const checkbox = [...container.querySelectorAll('tbody input[type="checkbox"]')][0];
    // observation.created / in_app starts on (default), so toggling writes enabled=false.
    await act(async () => { checkbox.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });
    const put = global.fetch.mock.calls.find(([url, options]) => options.method === 'PUT');
    expect(String(put[0]).endsWith('/api/notifications/preferences')).toBe(true);
    expect(JSON.parse(put[1].body)).toEqual({ event_type: 'observation.created', channel: 'in_app', enabled: false });
  });

  test('renders the typed error contract, never the raw server message', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 500, headers: new Headers(), json: async () => ({ success: false, error: 'Raw server English failure' }) }));
    await renderPage(root, container);
    expect(container.textContent).toContain('errors.serverError');
    expect(container.textContent).not.toContain('Raw server English failure');
    expect(container.querySelector('[data-testid="prefs-defaults-note"]')).toBeNull();
  });
});
