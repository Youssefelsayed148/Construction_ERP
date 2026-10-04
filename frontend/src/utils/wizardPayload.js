// The body POST /api/projects/wizard receives, built from the wizard form.
// advance_payment_percentage is a percentage of the contract: it is sent as such. (It used to be sent
// as advance_payment_amount, so a "15" meant 15 currency units on the project.)
const numOrNull = (v) => (v === '' || v == null ? null : Number(v));

export function buildWizardPayload(form) {
  return {
    ...form,
    client_id: numOrNull(form.client_id),
    project_manager_id: numOrNull(form.project_manager_id),
    contract_value: Number(form.contract_value) || 0,
    budget: Number(form.budget) || 0,
    retention_cap_amount: numOrNull(form.retention_cap_amount),
    advance_payment_percentage: numOrNull(form.advance_payment_percentage),
    liquidated_damages_rate: numOrNull(form.liquidated_damages_rate),
    gps_latitude: numOrNull(form.gps_latitude),
    gps_longitude: numOrNull(form.gps_longitude),
    sla_hours: Number(form.sla_hours) || 48,
    template_key: form.template_key || null,
  };
}
