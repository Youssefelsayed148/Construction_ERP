import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ProjectFinanceWorkbench from './ProjectFinanceWorkbench';

jest.mock('../../hooks/useLocale', () => ({ useLocale: () => ({ t: (key) => key, locale: 'en' }) }));
global.IS_REACT_ACT_ENVIRONMENT = true;

describe('ProjectFinanceWorkbench', () => {
  let container; let root; let previousFetch;
  beforeEach(() => {
    previousFetch = global.fetch;
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ success: true, data: [] }) }));
    window.localStorage.setItem('token', 'test-token');
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); global.fetch = previousFetch; window.localStorage.clear(); jest.clearAllMocks(); });

  test('loads project finance lists and provides the five requested record surfaces', async () => {
    await act(async () => { root.render(<ProjectFinanceWorkbench projectId="42" invoices={[]} />); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.textContent).toContain('finance.workbench.title');
    expect(container.textContent).toContain('finance.workbench.applications');
    for (const path of ['/payment-applications?project_id=42', '/payment-certificates?project_id=42', '/budget-versions', '/forecast-versions', '/credit-notes?project_id=42', '/payment-batches', '/retention/releases?project_id=42', '/procurement/invoices?project_id=42']) {
      expect(global.fetch.mock.calls.some(([url]) => String(url).includes(path))).toBe(true);
    }
    const versionsTab = [...container.querySelectorAll('[role="tab"]')].find((button) => button.textContent.includes('finance.workbench.tabs.versions'));
    await act(async () => { versionsTab.click(); });
    expect(container.textContent).toContain('finance.workbench.newBudget');
    expect(container.textContent).toContain('finance.workbench.newForecast');
    const releaseTab = [...container.querySelectorAll('[role="tab"]')].find((button) => button.textContent.includes('finance.workbench.tabs.retention'));
    await act(async () => { releaseTab.click(); });
    expect(container.textContent).toContain('finance.workbench.newRetentionRelease');
  });
});
