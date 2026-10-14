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

  test('builds one estimate-to-complete forecast version with multiple cost-code lines', async () => {
    await act(async () => { root.render(<ProjectFinanceWorkbench projectId="42" invoices={[]} />); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const versionsTab = [...container.querySelectorAll('[role="tab"]')].find((button) => button.textContent.includes('finance.workbench.tabs.versions'));
    await act(async () => { versionsTab.click(); });
    const forecastForm = [...container.querySelectorAll('form')].find((form) => form.textContent.includes('finance.workbench.newForecast'));
    const addLine = [...forecastForm.querySelectorAll('button')].find((button) => button.textContent.includes('finance.workbench.addLine'));
    await act(async () => { addLine.click(); });
    const inputs = forecastForm.querySelectorAll('input');
    const setValue = (input, value) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    await act(async () => {
      setValue(inputs[0], 'October ETC'); setValue(inputs[1], '11'); setValue(inputs[2], '125.50');
      setValue(inputs[3], '12'); setValue(inputs[4], '250.25');
      forecastForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const createCall = global.fetch.mock.calls.find(([url, options]) => String(url).includes('/forecast-versions') && options.method === 'POST');
    expect(JSON.parse(createCall[1].body)).toMatchObject({
      project_id: 42, name: 'October ETC',
      lines: [
        { cost_code_id: 11, forecast_amount: 125.5 },
        { cost_code_id: 12, forecast_amount: 250.25 },
      ],
    });
  });
});
