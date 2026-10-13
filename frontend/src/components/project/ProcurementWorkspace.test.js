import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ProcurementWorkspace from './ProcurementWorkspace';

const mockShowToast = jest.fn();
const mockTranslate = (key) => key;
jest.mock('../../hooks/useLocale', () => ({ useLocale: () => ({ locale: 'en', t: mockTranslate }) }));
jest.mock('../common/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }));
global.IS_REACT_ACT_ENVIRONMENT = true;

describe('ProcurementWorkspace', () => {
  let container; let root; let previousFetch;
  beforeEach(() => {
    previousFetch = global.fetch;
    global.fetch = jest.fn(async (url) => {
      let data = [];
      if (String(url).includes('/procurement/project/')) data = {
        purchase_requests: [], rfqs: [], purchase_orders: [], deliveries: [],
        material_inspection_requests: [], goods_receipt_notes: [],
      };
      else if (String(url).includes('/procurement/invoices?project_id=')) data = [
        { id: 1, invoice_number: 'MATCHED-1', status: 'received', match_status: 'matched' },
        { id: 2, invoice_number: 'EXCEPTION-1', status: 'exception', match_status: 'exception' },
      ];
      else if (String(url).includes('/analytics/spend') || String(url).includes('/analytics/vendor-performance')) data = { rows: [], totals: {} };
      return { ok: true, json: async () => ({ success: true, data }) };
    });
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); global.fetch = previousFetch; jest.clearAllMocks(); });

  test('loads stage navigation and renders procurement sections', async () => {
    await act(async () => { root.render(<ProcurementWorkspace projectId="42" />); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.textContent).toContain('procurement.workspace.title');
    expect(container.textContent).toContain('procurement.workspace.createPr');
    const invoiceTab = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('procurement.workspace.sections.invoices'));
    await act(async () => { invoiceTab.click(); });
    expect(container.textContent).toContain('procurement.workspace.supplierInvoice');
    expect(container.textContent).toContain('procurement.workspace.recordPayment');
    expect(container.textContent).toContain('MATCHED-1');
    expect(container.querySelectorAll('button').length).toBeGreaterThan(0);
    expect([...container.querySelectorAll('.procurement-action-row button')].filter((button) => button.textContent.includes('procurement.actions.approveInvoice'))).toHaveLength(1);
    expect(container.textContent).toContain('EXCEPTION-1');
    expect(global.fetch.mock.calls.some(([url]) => String(url).includes('/procurement/invoices?project_id=42'))).toBe(true);
  });
});
