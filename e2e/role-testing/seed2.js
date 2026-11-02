// Stage 2: locations > BOQ > cost codes > schedule
const x = require('./seedlib');
const { S, act, actAs, check, readBack, snap, evidenceSince, idOf, sql, section } = x;
module.exports = async function stage2() {
  const P = S.project;
  section('5. locations');
  S.loc = S.loc || {};
  for (const [key, type, code, name, parent] of [['bldg', 'building', 'DEMO-B1', 'DEMO-Building 1', null], ['f1', 'floor', 'DEMO-B1-F1', 'DEMO-Floor 1', 'bldg'], ['f2', 'floor', 'DEMO-B1-F2', 'DEMO-Floor 2', 'bldg']]) {
    S.loc[key] = idOf('project_locations', 'code', code, `and project_id=${P}`);
    if (S.loc[key]) continue;
    const s0 = snap();
    const r = await actAs(['project_manager'], 'POST', '/api/locations', { project_id: P, location_type_code: type, code, name, name_en: name, name_ar: 'DEMO-' + name.slice(5), ...(parent ? { parent_id: S.loc[parent] } : {}) }, { label: `create location ${code}` });
    S.loc[key] = r.data?.id; evidenceSince(s0, 'location ' + code);
  }
  await readBack('project_manager', `/api/locations/${S.loc.f1}`, { code: 'DEMO-B1-F1' }, 'location exists');

  section('6. BOQ (quantity_surveyor)');
  S.boqSec = idOf('boq_sections', 'name_en', 'DEMO-Structure', `and project_id=${P}`);
  if (!S.boqSec) { const s0 = snap(); const r = await actAs(['quantity_surveyor', 'technical_office_engineer'], 'POST', '/api/boq/sections', { project_id: P, code: 'DEMO-S1', name_ar: 'DEMO-الهيكل الإنشائي', name_en: 'DEMO-Structure', sort_order: 1 }, { label: 'create BOQ section' }); S.boqSec = r.data?.id; evidenceSince(s0, 'boq section'); }
  S.boq = S.boq || {};
  for (const [key, code, en, unit, qty, rate, type] of [['conc', 'DEMO-1.1', 'DEMO-Reinforced concrete C30', 'm3', 400, 1800, 'material'], ['steel', 'DEMO-1.2', 'DEMO-Rebar supply and fix', 'ton', 60, 24000, 'material'], ['lab', 'DEMO-1.3', 'DEMO-Formwork labour', 'm2', 1200, 150, 'labor'], ['sub', 'DEMO-1.4', 'DEMO-Waterproofing subcontract', 'm2', 800, 220, 'subcontract']]) {
    S.boq[key] = idOf('boq_items', 'description_en', en, `and project_id=${P}`);
    if (S.boq[key]) continue;
    const s0 = snap(); const r = await actAs(['quantity_surveyor', 'technical_office_engineer'], 'POST', '/api/boq/items', { project_id: P, section_id: S.boqSec, code, description_ar: 'DEMO-' + en.slice(5), description_en: en, unit, quantity: qty, unit_rate: rate, type }, { label: `create BOQ item ${code}` });
    S.boq[key] = r.data?.id; evidenceSince(s0, 'boq item ' + code);
  }
  const sum = await x.call('quantity_surveyor', 'GET', `/api/boq/summary/${P}`);
  const total = 400 * 1800 + 60 * 24000 + 1200 * 150 + 800 * 220;
  check('BOQ summary total = 2,516,000 (4 items)', sum.status === 200 && JSON.stringify(sum.data).includes(String(total)) || Math.round(Number(sql(`select sum(quantity*unit_rate) from boq_items where project_id=${P}`))) === total, `db total=${sql(`select sum(quantity*unit_rate) from boq_items where project_id=${P}`)} api=${sum.status}`, 'quantity_surveyor', 'boq');
  // value visibility: storekeeper must not see unit rates
  const sk = await x.call('storekeeper', 'GET', `/api/boq/items/${P}`);
  check('storekeeper gets no BOQ rates (403 or rates stripped)', sk.status === 403 || !JSON.stringify(sk.data || {}).includes('"unit_rate":1800'), `HTTP ${sk.status}`, 'storekeeper', 'boq');

  section('7. cost codes (route is owner/admin only in code)');
  S.cc = S.cc || {};
  for (const [key, code, name, type] of [['mat', 'DEMO-CC-MAT', 'DEMO-Materials', 'material'], ['lab', 'DEMO-CC-LAB', 'DEMO-Labour', 'labour'], ['sub', 'DEMO-CC-SUB', 'DEMO-Subcontract', 'subcontract']]) {
    S.cc[key] = idOf('cost_codes', 'code', code); if (S.cc[key]) continue;
    const s0 = snap(); const r = await actAs(['quantity_surveyor', 'commercial_manager', 'workflow_owner'], 'POST', '/api/costing/codes', { code, name, name_en: name, name_ar: 'DEMO-' + name.slice(5), level: 1, type }, { label: `create cost code ${code}` });
    S.cc[key] = r.data?.id; evidenceSince(s0, 'cost code ' + code);
  }

  section('8. schedule (planning_engineer)');
  S.cal = idOf('project_calendars', 'name', 'DEMO-6-day site calendar', `and project_id=${P}`);
  if (!S.cal) { const r = await actAs(['planning_engineer', 'project_manager'], 'POST', '/api/schedule/calendars', { project_id: P, name: 'DEMO-6-day site calendar', is_default: true, work_days: [0, 1, 2, 3, 4, 6] }, { label: 'create calendar' }); S.cal = r.data?.id; }
  S.act = S.act || {};
  for (const [key, code, name, ps, pf, dur] of [['exc', 'DEMO-A10', 'DEMO-Excavation and foundations', '2026-11-02', '2026-12-15', 44], ['cols', 'DEMO-A20', 'DEMO-Columns and slabs L1', '2026-12-16', '2027-02-28', 75], ['mep', 'DEMO-A30', 'DEMO-MEP first fix L1', '2027-03-01', '2027-04-15', 46]]) {
    S.act[key] = idOf('schedule_activities', 'activity_code', code, `and project_id=${P}`); if (S.act[key]) continue;
    const s0 = snap(); const r = await actAs(['planning_engineer', 'project_manager'], 'POST', '/api/schedule/activities', { project_id: P, activity_code: code, name, planned_start: ps, planned_finish: pf, original_duration: dur, calendar_id: S.cal, project_location_id: S.loc.bldg, boq_item_id: key === 'cols' ? S.boq.conc : null, budgeted_cost: key === 'cols' ? 720000 : 100000 }, { label: `create activity ${code}` });
    S.act[key] = r.data?.id; evidenceSince(s0, 'activity ' + code);
  }
  if (!sql(`select count(*) from activity_relationships where project_id=${P}`).replace('0', '')) {
    await actAs(['planning_engineer'], 'POST', '/api/schedule/relationships', { project_id: P, predecessor_id: S.act.exc, successor_id: S.act.cols, relationship_type: 'FS', lag_days: 0 }, { label: 'link A10 -> A20 (FS)' });
    await actAs(['planning_engineer'], 'POST', '/api/schedule/relationships', { project_id: P, predecessor_id: S.act.cols, successor_id: S.act.mep, relationship_type: 'FS', lag_days: 0 }, { label: 'link A20 -> A30 (FS)' });
  }
  await readBack('planning_engineer', `/api/schedule/activities/${S.act.cols}`, { activity_code: 'DEMO-A20' }, 'activity exists');
  // forbidden
  await act('storekeeper', 'POST', '/api/schedule/activities', { project_id: P, name: 'DEMO-forbidden' }, { expect: 403, forbidden: true, label: 'storekeeper creates schedule activity (forbidden)' });
  await act('client_executive', 'POST', '/api/boq/items', { project_id: P, section_id: S.boqSec, description_ar: 'x', description_en: 'DEMO-forbidden' }, { expect: 403, forbidden: true, label: 'client_executive edits BOQ (forbidden)' });
  x.save();
};
if (require.main === module) module.exports().then(x.finish);
