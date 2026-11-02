// Stage 4: subcontractor + contract > work order > executed quantities (approve + reject) > subcontractor certificate
const x = require('./seedlib');
const { S, act, actAs, approveUntil, check, readBack, snap, evidenceSince, idOf, sql, num, call, section } = x;
module.exports = async function stage4() {
  const P = S.project; const today = '2026-11-02';
  section('14. subcontractor + contract (commercial_manager)');
  S.sub = idOf('subcontractors', 'name_en', 'DEMO-Gulf Waterproofing Co');
  if (!S.sub) { const s0 = snap(); const r = await actAs(['commercial_manager', 'project_manager'], 'POST', '/api/subcontractors', { code: 'DEMO-SC-001', name_ar: 'DEMO-شركة الخليج للعزل', name_en: 'DEMO-Gulf Waterproofing Co', license_no: 'DEMO-LIC-1', classification: 'A', specialties: ['waterproofing'], insurance_amount: 500000, insurance_expiry: '2027-12-31', contact_person: 'DEMO Contact', phone: '+20-000-2222', email: 'demo-sub@example.com' }, { label: 'create subcontractor' }); S.sub = r.data?.id; evidenceSince(s0, 'subcontractor'); }
  S.subc = Number(sql(`select id from sub_contracts where project_id=${P} and subcontractor_id=${S.sub} limit 1`)) || null;
  if (!S.subc) { const s0 = snap(); const r = await actAs(['commercial_manager', 'project_manager'], 'POST', '/api/subcontractors/contracts', { project_id: P, subcontractor_id: S.sub, boq_item_id: S.boq.sub, scope: 'DEMO waterproofing of basement', contract_value: 176000, start_date: '2026-11-15', end_date: '2027-01-15', retention_percent: 10, advance_percent: 0 }, { label: 'create subcontract (176,000)' }); S.subc = r.data?.id; evidenceSince(s0, 'subcontract'); }
  await readBack('commercial_manager', `/api/subcontractors/${S.sub}`, { name_en: 'DEMO-Gulf Waterproofing Co' }, 'subcontractor exists');
  // subcontract value visibility: roles without see_subcontract_value must not see the contract value
  const sv = await call('site_engineer', 'GET', `/api/subcontractors/contracts/${P}`);
  check('site_engineer does not see subcontract values', sv.status === 403 || !JSON.stringify(sv.data || {}).includes('176000'), `HTTP ${sv.status}`, 'site_engineer', 'subcontractors');
  const svc = await call('commercial_manager', 'GET', `/api/subcontractors/contracts/${P}`);
  check('commercial_manager sees subcontract values', svc.status === 200 && JSON.stringify(svc.data || {}).includes('176000'), `HTTP ${svc.status}`, 'commercial_manager', 'subcontractors');
  // external subcontractor accounts: portal needs an organization + participant that cannot be created through the API
  const sp = await call('subcontractor_manager', 'GET', '/api/portal/subcontractor/dashboard');
  x.log.push({ role: 'subcontractor_manager', module: 'portal', action: 'subcontractor portal shows the DEMO subcontract', expected: 'contract visible', actual: `HTTP ${sp.status}, ${JSON.stringify(sp.data || {}).includes(String(S.subc)) ? 'visible' : 'not visible'}`, result: JSON.stringify(sp.data || {}).includes('DEMO') ? 'PASS' : 'FINDING', evidence: 'subcontractor account has no organization / project_participants row; neither is creatable through the API (organizations get no legacy_subcontractor_id). Used commercial_manager for the subcontractor-side steps', section: 'subcontractors' });

  section('15. work order (construction_manager) and executed quantities');
  S.wo = idOf('work_orders', 'title_en', 'DEMO-WO Waterproofing basement', `and project_id=${P}`);
  if (!S.wo) { const s0 = snap(); const r = await actAs(['construction_manager'], 'POST', '/api/work-orders', { project_id: P, boq_section_id: S.boqSec, title_ar: 'DEMO-عزل القبو', title_en: 'DEMO-WO Waterproofing basement', description: 'DEMO', planned_start_date: '2026-11-15', planned_end_date: '2026-12-15' }, { label: 'create work order' }); S.wo = r.data?.id; evidenceSince(s0, 'work order'); }
  await readBack('project_manager', `/api/work-orders/${S.wo}`, {}, 'work order exists');
  // allocation + measurements
  S.alloc = Number(sql(`select id from boq_location_allocations where boq_item_id=${S.boq.conc} limit 1`)) || null;
  if (!S.alloc) { const r = await actAs(['quantity_surveyor', 'project_manager'], 'POST', '/api/quantities/allocations', { boq_item_id: S.boq.conc, project_location_id: S.loc.f1, planned_quantity: 200, approved_design_quantity: 200, unit_cost: 1800, activity_type: 'concrete_pour' }, { label: 'allocate concrete to Floor 1' }); S.alloc = r.data?.id; }
  S.meas = S.meas || [];
  if (S.meas.length === 0) {
    for (const [qty, note] of [[60, 'approve'], [45, 'reject']]) {
      const s0 = snap();
      const r = await actAs(['site_engineer', 'site_manager'], 'POST', '/api/quantities/measurements', { project_id: P, project_location_id: S.loc.f1, boq_item_id: S.boq.conc, measured_date: today, quantity: qty, unit: 'm3', source_type: 'manual' }, { label: `site_engineer records executed quantity ${qty} m3` });
      S.meas.push(r.data?.id); evidenceSince(s0, 'measurement ' + qty);
    }
    await actAs(['quantity_surveyor', 'project_manager'], 'POST', `/api/quantities/measurements/${S.meas[0]}/review`, { state: 'approved' }, { label: 'quantity_surveyor approves 60 m3 (approve path)' });
    await actAs(['quantity_surveyor', 'project_manager'], 'POST', `/api/quantities/measurements/${S.meas[1]}/review`, { state: 'rejected' }, { label: 'quantity_surveyor rejects 45 m3 (reject path)' });
    check('approved measurement state', sql(`select approval_state from quantity_measurements where id=${S.meas[0]}`) === 'approved', sql(`select approval_state from quantity_measurements where id=${S.meas[0]}`), 'quantity_surveyor', 'quantities');
    check('rejected measurement state', sql(`select approval_state from quantity_measurements where id=${S.meas[1]}`) === 'rejected', '', 'quantity_surveyor', 'quantities');
  }
  const approvedQty = num(sql(`select coalesce(sum(quantity),0) from quantity_measurements where boq_item_id=${S.boq.conc} and approval_state='approved' and project_id=${P}`));
  check('approved executed quantity total = 60 (rejected 45 excluded)', approvedQty === 60, `approved=${approvedQty}`, 'quantity_surveyor', 'quantities');
  await act('client_executive', 'POST', '/api/quantities/measurements', { project_id: P, project_location_id: S.loc.f1, boq_item_id: S.boq.conc, measured_date: today, quantity: 1 }, { expect: 403, forbidden: true, label: 'client_executive records quantity (forbidden)' });
  await act('site_engineer', 'POST', `/api/quantities/measurements/${S.meas[1]}/review`, { state: 'rejected' }, { expect: 403, forbidden: true, label: 'site_engineer reviews a measurement (forbidden)' });

  section('16. subcontractor payment certificate (approve) + verification');
  S.scert = Number(sql(`select id from sub_payment_certificates where sub_contract_id=${S.subc} limit 1`)) || null;
  if (!S.scert) {
    const s0 = snap();
    const r = await actAs(['quantity_surveyor', 'commercial_manager', 'project_manager'], 'POST', '/api/subcontractors/certificates', { sub_contract_id: S.subc, period_from: '2026-11-15', period_to: '2026-11-30', work_value: 44000, retention_deduction: 4400, previous_paid: 0, penalties: 0, materials_deducted: 0 }, { label: 'create subcontract payment certificate (work 44,000)' });
    S.scert = r.data?.id; evidenceSince(s0, 'sub certificate');
    await actAs(['commercial_manager', 'project_manager'], 'PUT', `/api/subcontractors/certificates/${S.scert}`, { status: 'certified' }, { label: 'commercial_manager certifies the subcontract certificate' });
    check('certificate net = 44,000 - 4,400 retention = 39,600', num(sql(`select net_payable from sub_payment_certificates where id=${S.scert}`)) === 39600 || num(sql(`select coalesce(net_amount,0) from sub_payment_certificates where id=${S.scert}`)) === 39600, sql(`select row_to_json(c) from sub_payment_certificates c where id=${S.scert}`).slice(0, 180), 'commercial_manager', 'subcontractors');
  }
  await act('storekeeper', 'POST', '/api/subcontractors/contracts', { project_id: P, subcontractor_id: S.sub, contract_value: 1 }, { expect: 403, forbidden: true, label: 'storekeeper creates subcontract (forbidden)' });
  x.save();
};
if (require.main === module) module.exports().then(x.finish);
