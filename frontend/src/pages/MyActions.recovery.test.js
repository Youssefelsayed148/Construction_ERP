import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import MyActions from './MyActions';

let mockLocale = 'en';
jest.mock('../hooks/useLocale', () => ({ useLocale: () => ({ locale: mockLocale,
  t: (key, params) => require('../i18n/translate').translate({
    en: { actions: require('../locales/en/actions.json'), enums: require('../locales/en/enums.json') },
    ar: { actions: require('../locales/ar/actions.json'), enums: require('../locales/ar/enums.json') },
  }, mockLocale, key, params),
}) }));
global.IS_REACT_ACT_ENVIRONMENT = true;

describe.each(['en', 'ar'])('My Actions %s scoped payload recovery', locale => {
  let container; let root;
  const reply = (notification) => {
    global.fetch = jest.fn(async url => ({ ok: true, headers: { get: () => null }, json: async () =>
      url.includes('/actions/my') ? { success: true, buckets: {} } : { success: true, data: [notification] } }));
  };
  beforeEach(() => {
    mockLocale = locale;
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); delete global.fetch; jest.restoreAllMocks(); });
  test.each(['procurement_officer', 'storekeeper'])('%s keeps a notification rendered when its timestamp is the diagnosed empty object', async role => {
    localStorage.setItem('user', JSON.stringify({ role }));
    reply({ id: 1, title: 'S005 notification', body: 'Scoped timestamp fixture', created_at: {}, status: 'unread' });
    await act(async () => root.render(<MyActions />));
    expect(container.textContent).toContain('S005 notification');
    expect(container.textContent).not.toContain('[object Object]');
    expect(container.querySelector('h1')).not.toBeNull();
  });
  test('a malformed title shows a localized recovery state and retry reloads valid data', async () => {
    reply({ id: 2, title: {}, created_at: '2026-10-17T00:00:00.000Z' });
    await act(async () => root.render(<MyActions />));
    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert.textContent).toContain(locale === 'ar' ? 'تعذر عرض المهام' : 'Unable to display actions');
    reply({ id: 2, title: 'Recovered notification', created_at: '2026-10-17T00:00:00.000Z' });
    await act(async () => alert.querySelector('button').click());
    expect(container.textContent).toContain('Recovered notification');
  });
});
