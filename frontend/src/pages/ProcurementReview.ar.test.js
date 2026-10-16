import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ProcurementReview from './ProcurementReview';

jest.mock('../hooks/useLocale', () => ({ useLocale: () => ({ locale: 'ar',
  t: (key, params) => require('../i18n/translate').translate({
    en: { procurement: require('../locales/en/procurement.json'), common: require('../locales/en/common.json') },
    ar: { procurement: require('../locales/ar/procurement.json'), common: require('../locales/ar/common.json') },
  }, 'ar', key, params),
}) }));
global.IS_REACT_ACT_ENVIRONMENT = true;

test('comparison translates the generated reason while preserving supplier names and terms', async () => {
  const previousFetch = global.fetch; const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container);
  global.fetch = jest.fn(async () => ({ ok: true, headers: { get: () => '1' }, json: async () => ({ success: true, data: {
    rfq_number: 'RFQ-1', rows: [{ quotation_id: 1, supplier_name: 'Vendor DATA', payment_terms: 'Net 30 DATA', total_price: -1500.5 }],
    recommendation: { supplier_name: 'Vendor DATA', reason: 'highest commercial score among compliant quotes; lowest total price as tiebreak', reason_code: 'highest_commercial_score_lowest_price_tiebreak', reason_params: {} },
  } }) }));
  try {
    await act(async () => root.render(<ProcurementReview />));
    await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    const recommendation = container.querySelector('.alert-info');
    expect(recommendation.textContent).toContain('Vendor DATA');
    expect(recommendation.textContent.replace('Vendor DATA', '')).not.toMatch(/[A-Za-z_]|\{\w+\}/);
    expect(recommendation.textContent).toContain('أعلى تقييم تجاري');
    expect(container.querySelector('tbody').textContent).toContain('Net 30 DATA');
    expect(container.querySelector('tbody').textContent).toContain(new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(-1500.5));
  } finally { act(() => root.unmount()); container.remove(); global.fetch = previousFetch; }
});
