import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import BOQ from './BOQ';

// Closeout: BOQ.js used to swallow loadData/loadMasterItems failures with only
// console.error, leaving the user with no visible feedback. This covers the
// loadMasterItems path (triggered when opening the Add Item dialog): the error
// must become visible, localized through the shared errorMessage helper, and
// the dialog must stay open so the user can retry instead of losing the form.
jest.mock('../hooks/useLocale', () => ({ useLocale: () => ({ t: (key) => key, locale: 'en' }) }));
global.IS_REACT_ACT_ENVIRONMENT = true;

describe('BOQ load-error visibility', () => {
  let container; let root; let previousFetch;

  beforeEach(() => {
    previousFetch = global.fetch;
    window.localStorage.setItem('token', 'test-token');
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount()); container.remove(); global.fetch = previousFetch; window.localStorage.clear();
  });

  test('a rejected master-items load surfaces a localized error and keeps the Add Item dialog open', async () => {
    global.fetch = jest.fn(async (url) => {
      const path = String(url).split('/api')[1] || String(url);
      if (path.startsWith('/boq/sections/')) {
        return {
          ok: true, status: 200, headers: new Headers(),
          json: async () => ({ success: true, data: [{ id: 1, name_en: 'Civil', name_ar: 'مدني', parent_id: null, sort_order: 0 }] }),
        };
      }
      if (path.startsWith('/boq/items/')) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ success: true, data: [] }) };
      }
      if (path.startsWith('/items?limit=500')) {
        return { ok: false, status: 500, headers: new Headers(), json: async () => ({ success: false, error: 'Master item catalog failed to load' }) };
      }
      throw new Error(`unexpected fetch ${path}`);
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/projects/9/boq']}>
          <Routes><Route path="/projects/:id/boq" element={<BOQ />} /></Routes>
        </MemoryRouter>
      );
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    const addItemButton = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('boq.system.addItem'));
    expect(addItemButton).toBeTruthy();
    await act(async () => { addItemButton.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    // The dialog opened and stayed open despite the master-items fetch failing.
    expect(container.textContent).toContain('boq.system.addNewItem');
    // The failure is visible to the user, not just logged.
    expect(container.textContent).toContain('Master item catalog failed to load');
  });
});
