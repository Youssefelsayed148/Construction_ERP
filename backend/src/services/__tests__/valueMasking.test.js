'use strict';
const { maskPayload, deniedRules, RULES } = require('../valueMasking');

describe('valueMasking (default-deny)', () => {
  const invoice = { id: 1, invoice_number: 'INV-1', status: 'issued', net_amount: '97200', tax_amount: '4630', total_paid: '97200', client_id: 2 };
  test('removes client price fields when see_client_price is not held', () => {
    const out = maskPayload({ success: true, data: [invoice] }, 'invoices', { see_client_price: false });
    expect(out.data[0]).toEqual({ id: 1, invoice_number: 'INV-1', status: 'issued', client_id: 2 });
  });
  test('missing or non-true flags are treated as hidden', () => {
    expect(maskPayload({ data: invoice }, 'invoices', undefined).data.net_amount).toBeUndefined();
    expect(maskPayload({ data: invoice }, 'invoices', { see_client_price: 'yes' }).data.net_amount).toBeUndefined();
  });
  test('keeps values for a role holding the flag and never mutates the handler object', () => {
    const src = { data: invoice };
    expect(maskPayload(src, 'invoices', { see_client_price: true }).data.net_amount).toBe('97200');
    maskPayload(src, 'invoices', {});
    expect(src.data.net_amount).toBe('97200');
  });
  test('each flag guards its own mounts', () => {
    const sub = { data: { contract_value: 176000, name: 'S1' } };
    expect(maskPayload(sub, 'subcontractors', { see_client_price: true, see_internal_cost: true }).data).toEqual({ name: 'S1' });
    expect(maskPayload(sub, 'subcontractors', { see_subcontractor_price: true }).data.contract_value).toBe(176000);
    const cost = { data: { cost_code_id: 4, actual_cost: 480000, status: 'open', cost_percent: 5 } };
    expect(maskPayload(cost, 'costing', {}).data).toEqual({ cost_code_id: 4, status: 'open', cost_percent: 5 });
  });
  test('mounts without rules pass through; every rule names a known flag', () => {
    expect(deniedRules('hr', {})).toEqual([]);
    for (const rules of Object.values(RULES)) for (const r of rules) expect(['see_client_price', 'see_subcontractor_price', 'see_internal_cost']).toContain(r.flag);
  });
});
