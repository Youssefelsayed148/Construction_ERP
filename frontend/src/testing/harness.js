import React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render } from '@testing-library/react';
import store from '../store';
import { LocaleProvider } from '../i18n/LocaleContext';

// Shared helpers for screen tests: a mocked fetch driven by a responder, and a render wrapper with the
// real locale provider (so assertions use the real English catalog), redux store and a router.

export const json = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
  blob: async () => new Blob([JSON.stringify(body)]),
});

// mode: 'empty'   every request succeeds with an empty list
//       'error'   every request answers 500 { success:false, error:'Server exploded' }
//       'network' every request rejects (offline)
// responder(url, method, options) may return a response to override the mode for a request.
export function installFetch(mode, responder) {
  global.fetch = jest.fn(async (url, options = {}) => {
    const method = (options.method || 'GET').toUpperCase();
    if (responder) {
      const custom = responder(String(url), method, options);
      if (custom !== undefined) return custom;
    }
    if (mode === 'network') throw new TypeError('Failed to fetch');
    if (mode === 'error') return json({ success: false, error: 'Server exploded' }, 500);
    return json({ success: true, data: [] });
  });
  return global.fetch;
}

export function signIn(role = 'owner') {
  const encode = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const token = `${encode({ alg: 'none' })}.${encode({ exp: Math.floor(Date.now() / 1000) + 3600 })}.x`;
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Tester', role, policy_modules: ['*'] }));
}

export function renderScreen(element, { path = '/', route = '*', locale = 'en' } = {}) {
  localStorage.setItem('locale', locale);
  return render(
    <Provider store={store}>
      <LocaleProvider initialLocale={locale}>
        <MemoryRouter initialEntries={[path]}>
          <Routes><Route path={route} element={element} /></Routes>
        </MemoryRouter>
      </LocaleProvider>
    </Provider>,
  );
}
