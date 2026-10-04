import { buildWizardPayload } from './wizardPayload';

const base = { name_ar: 'م', name_en: 'P', client_id: '', project_manager_id: '', contract_value: 0, budget: 0,
  retention_cap_amount: '', advance_payment_percentage: '', liquidated_damages_rate: '', gps_latitude: '', gps_longitude: '',
  sla_hours: 48, template_key: '' };

describe('buildWizardPayload', () => {
  test('the advance percentage goes out as a percentage, never as an amount', () => {
    const p = buildWizardPayload({ ...base, advance_payment_percentage: '15' });
    expect(p.advance_payment_percentage).toBe(15);
    expect(p.advance_payment_amount).toBeUndefined();
  });

  test('blank optional numbers become null, present ones are numbers', () => {
    const p = buildWizardPayload({ ...base, client_id: '7', contract_value: '1000', retention_cap_amount: '50', gps_latitude: '30.5' });
    expect(p.client_id).toBe(7);
    expect(p.contract_value).toBe(1000);
    expect(p.retention_cap_amount).toBe(50);
    expect(p.gps_latitude).toBe(30.5);
    expect(p.project_manager_id).toBeNull();
    expect(p.advance_payment_percentage).toBeNull();
    expect(p.template_key).toBeNull();
    expect(p.sla_hours).toBe(48);
  });
});
