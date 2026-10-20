import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ProjectFinanceWorkbench from './ProjectFinanceWorkbench';

jest.mock('../../hooks/useLocale', () => ({ useLocale: () => ({ t: (key) => key, locale: 'en' }) }));
global.IS_REACT_ACT_ENVIRONMENT = true;

// The commitment routes answer 403 without see_internal_cost and the adjust
// write needs commercial approve; these fixture grants mirror the policy.
const COMMERCIAL_USER = { id: 5, name: 'Demo Commercial', role: 'commercial_manager',
  policy_permissions: [
    { module: '*', action: 'see_internal_cost' },
    { module: 'commercial', action: 'approve' },
  ] };

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

  test('shows the commitments tab, contract table and adjust form for see_internal_cost + approve roles', async () => {
    window.localStorage.setItem('user', JSON.stringify(COMMERCIAL_USER));
    global.fetch = jest.fn(async (url, options = {}) => {
      const path = String(url);
      if (path.includes('/commercial/project/42/commitments') && (!options.method || options.method === 'GET')) {
        return { ok: true, json: async () => ({ success: true, data: [
          { id: 2, commitment_number: 'CM-00002', source_type: 'sub_contract', original_amount: 900, cancelled_amount: 100, status: 'active' },
          { id: 1, commitment_number: 'CM-00001', source_type: 'purchase_order', original_amount: 800, cancelled_amount: 0, status: 'cancelled' },
        ] }) };
      }
      return { ok: true, json: async () => ({ success: true, data: [] }) };
    });
    await act(async () => { root.render(<ProjectFinanceWorkbench projectId="42" invoices={[]} />); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(global.fetch.mock.calls.some(([url]) => String(url).includes('/commercial/project/42/commitments'))).toBe(true);
    const commitmentsTab = [...container.querySelectorAll('[role="tab"]')].find((button) => button.textContent.includes('finance.workbench.tabs.commitments'));
    expect(commitmentsTab).toBeTruthy();
    await act(async () => { commitmentsTab.click(); });
    expect(container.textContent).toContain('finance.workbench.commitments');
    expect(container.textContent).toContain('CM-00002');
    expect(container.textContent).toContain('finance.workbench.adjustCommitment');
    const options = [...container.querySelectorAll('option')];
    // The cancelled row is not selectable for adjustment.
    expect(options.some((o) => o.textContent.includes('CM-00002'))).toBe(true);
    expect(options.some((o) => o.textContent.includes('CM-00001'))).toBe(false);
  });

  test('hides the commitments tab for roles without the see_internal_cost grant', async () => {
    window.localStorage.removeItem('user');
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ success: true, data: [] }) }));
    await act(async () => { root.render(<ProjectFinanceWorkbench projectId="42" invoices={[]} />); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect([...container.querySelectorAll('[role="tab"]')].some((button) => button.textContent.includes('finance.workbench.tabs.commitments'))).toBe(false);
    expect(global.fetch.mock.calls.some(([url]) => String(url).includes('/commitments'))).toBe(false);
  });

  test('submits a commitment adjustment to the adjust endpoint', async () => {
    window.localStorage.setItem('user', JSON.stringify(COMMERCIAL_USER));
    global.fetch = jest.fn(async (url, options = {}) => {
      const path = String(url);
      if (path.includes('/commercial/project/42/commitments') && (!options.method || options.method === 'GET')) {
        return { ok: true, json: async () => ({ success: true, data: [
          { id: 2, commitment_number: 'CM-00002', source_type: 'sub_contract', original_amount: 900, cancelled_amount: 100, status: 'active' },
        ] }) };
      }
      return { ok: true, json: async () => ({ success: true, data: [] }) };
    });
    await act(async () => { root.render(<ProjectFinanceWorkbench projectId="42" invoices={[]} />); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const commitmentsTab = [...container.querySelectorAll('[role="tab"]')].find((button) => button.textContent.includes('finance.workbench.tabs.commitments'));
    await act(async () => { commitmentsTab.click(); });
    const form = [...container.querySelectorAll('form')].find((f) => f.textContent.includes('finance.workbench.adjustCommitment'));
    const change = (element, value) => {
      const proto = element && element.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
      const setter = element ? Object.getOwnPropertyDescriptor(proto, 'value').set : null;
      if (!element || !setter) throw new Error(`no value setter for ${element ? element.tagName : String(element)}`);
      setter.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const select = form.querySelector('select');
    const inputs = [...form.querySelectorAll('input')];
    await act(async () => {
      change(select, '2');
      change(inputs[0], '150.50');
      change(inputs[1], 'Scope reduction requested by the owner');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const adjustCall = global.fetch.mock.calls.find(([url, options]) => String(url).includes('/commitments/2/adjust') && options.method === 'POST');
    expect(adjustCall).toBeTruthy();
    expect(JSON.parse(adjustCall[1].body)).toEqual({ cancelled_amount: 150.5, reason: 'Scope reduction requested by the owner' });
  });
});
