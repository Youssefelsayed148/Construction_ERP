import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ProcurementReview from './ProcurementReview';

jest.mock('../hooks/useLocale', () => ({ useLocale: () => ({
  t: (key, options = {}) => Object.entries(options).reduce((result, [name, value]) => result.replaceAll(`{{${name}}}`, value), key),
}) }));
global.IS_REACT_ACT_ENVIRONMENT = true;

describe('procurement comparison localization', () => {
  let container; let root; let previousFetch;
  beforeEach(() => {
    previousFetch = global.fetch;
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); global.fetch = previousFetch; });

  const enterRfq = async () => act(async () => {
    const input = container.querySelector('#rfq-id');
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set;
    setter.call(input, '42');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  test('translates comparison headings, boolean values, documents, and recommendation', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: {
      rfq_number: 'RFQ-0042',
      rows: [{ quotation_id: 7, supplier_name: 'North Supply', compliant: true, lead_time_days: 4 }],
      recommendation: { supplier_name: 'North Supply', reason: 'Best value' },
      } }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'raw download detail' }) });
    await act(async () => { root.render(<ProcurementReview />); });
    await enterRfq();
    await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });

    expect(container.textContent).toContain('procurement.comparison.title');
    expect(container.textContent).toContain('procurement.fields.supplier_name');
    expect(container.textContent).toContain('common.yes');
    expect(container.textContent).toContain('procurement.comparison.documents.technicalEvaluation');
    expect(container.textContent).toContain('procurement.comparison.recommendation');
    await act(async () => { container.querySelector('.portal-actions button').click(); await Promise.resolve(); });
    expect(container.textContent).toContain('procurement.comparison.downloadError');
    expect(container.textContent).not.toContain('raw download detail');
  });

  test('shows localized generic text when the comparison request fails', async () => {
    global.fetch = jest.fn(async () => { throw new Error('raw network detail'); });
    await act(async () => { root.render(<ProcurementReview />); });
    await enterRfq();
    await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });

    expect(container.textContent).toContain('procurement.comparison.loadError');
    expect(container.textContent).not.toContain('raw network detail');
  });
});
