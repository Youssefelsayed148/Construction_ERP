import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { WOMaterialFormModal } from './WorkOrders';

jest.mock('../hooks/useLocale', () => ({
  useLocale: () => ({ locale: 'en', setLocale: jest.fn(), t: (key) => key }),
}));
global.IS_REACT_ACT_ENVIRONMENT = true;

// Issue cost is derived server-side from the stock ledger (weighted average); the form must not offer
// a cost input and must never send one.
describe('work order material issue form', () => {
  let container; let root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); delete global.fetch; });

  const render = () => act(() => root.render(
    <WOMaterialFormModal wo={{ id: 7 }} items={[{ id: 3, code: 'CEM', name_en: 'Cement', unit: 'bag' }]}
      warehouses={[{ id: 2, name: 'Main' }]} locale="en" t={(k) => k} onClose={() => {}} onSave={() => {}} />));

  test('has no unit cost field', () => {
    render();
    expect(container.textContent).not.toMatch(/unit cost/i);
    const numberInputs = container.querySelectorAll('input[type="number"]');
    expect(numberInputs.length).toBe(2); // planned and actual quantity only
  });

  test('submits without unit_cost', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    render();
    const select = container.querySelector('select');
    await act(async () => {
      select.value = '3'; select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => { container.querySelector('.btn-primary').click(); });
    expect(global.fetch).toHaveBeenCalled();
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body).toEqual({ item_id: 3, planned_quantity: null, actual_quantity: null, warehouse_id: null });
    expect('unit_cost' in body).toBe(false);
  });
});
