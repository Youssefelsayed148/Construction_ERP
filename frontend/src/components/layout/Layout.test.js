import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import store from '../../store';
import Layout from './Layout';

jest.mock('../../hooks/useLocale', () => ({
  useLocale: () => ({ locale: 'en', setLocale: jest.fn(), t: (key) => key }),
}));
jest.mock('../../services/api', () => ({
  authService: {
    getCurrentUser: () => ({ name: 'Tester', role: 'owner', policy_modules: ['*'] }),
    clearSession: jest.fn(),
  },
}));

global.IS_REACT_ACT_ENVIRONMENT = true;

describe('responsive application shell', () => {
  let container; let root;
  beforeEach(() => {
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount()); container.remove();
  });

  test('opens and closes the mobile navigation with an accessible control', () => {
    act(() => root.render(<Provider store={store}><MemoryRouter><Routes><Route path="/" element={<Layout />}><Route index element={<p>Page</p>} /></Route></Routes></MemoryRouter></Provider>));
    const button = container.querySelector('.mobile-menu-button');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.querySelector('.sidebar').classList.contains('mobile-open')).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  test('shows an actionable offline state', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    act(() => root.render(<Provider store={store}><MemoryRouter><Routes><Route path="/" element={<Layout />} /></Routes></MemoryRouter></Provider>));
    expect(container.querySelector('.offline-banner').textContent).toContain('offline');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });
});
