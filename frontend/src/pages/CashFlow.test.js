import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import CashFlow from './CashFlow';

jest.mock('../hooks/useLocale', () => ({ useLocale: () => ({ t: (key) => key, locale: 'en' }) }));
global.IS_REACT_ACT_ENVIRONMENT = true;

const renderPage = async (root, container) => {
  await act(async () => { root.render(<MemoryRouter><CashFlow /></MemoryRouter>); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
};

describe('CashFlow', () => {
  let container; let root; let previousFetch;
  beforeEach(() => {
    previousFetch = global.fetch;
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); global.fetch = previousFetch; jest.clearAllMocks(); window.localStorage.clear(); });

  test('loads the cash-flow contract and renders both aging tables and retention balances', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => ({
      success: true,
      data: {
        ar_aging: { current: 1000.5, '1_30': 200, '31_60': 0, '61_90': 0, '90_plus': 75.25 },
        ap_aging: { current: 0, '1_30': 0, '31_60': 300, '61_90': 0, '90_plus': 0 },
        retention_receivable: 5000,
        retention_payable: 1500,
      },
    }) }));
    await renderPage(root, container);
    expect(global.fetch.mock.calls.some(([url]) => String(url).includes('/finance-ledger/cash-flow'))).toBe(true);
    expect(container.textContent).toContain('finance.cashFlow.title');
    expect(container.textContent).toContain('finance.cashFlow.arAging');
    expect(container.textContent).toContain('finance.cashFlow.apAging');
    expect(container.textContent).toContain('finance.cashFlow.buckets.90_plus');
    expect(container.textContent).toContain('finance.cashFlow.retentionReceivable');
    expect(container.textContent).toContain('finance.cashFlow.retentionPayable');
  });

  test('renders the localized empty state when every balance is zero', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => ({
      success: true,
      data: { ar_aging: { current: 0, '1_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 }, ap_aging: { current: 0 }, retention_receivable: 0, retention_payable: 0 },
    }) }));
    await renderPage(root, container);
    expect(container.querySelector('[data-testid="cashflow-empty"]')).not.toBeNull();
    expect(container.textContent).toContain('finance.cashFlow.empty');
  });

  test('renders the typed error contract, never the raw server message', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 500, headers: new Headers(), json: async () => ({ success: false, error: 'Internal server English' }) }));
    await renderPage(root, container);
    expect(container.textContent).toContain('errors.serverError');
    expect(container.textContent).not.toContain('Internal server English');
  });
});
