// One-off: neutralise duplicate DEMO rows created by a helper bug in the first stage-2 run (no delete routes exist), via the API.
const x = require('./seedlib'); const { S, actAs, section } = x;
(async () => {
  section('cleanup duplicates from first stage-2 run');
  for (const id of [5, 7, 9, 11]) await actAs(['quantity_surveyor', 'workflow_owner'], 'PUT', `/api/boq/items/${id}`, { description_en: 'DEMO-DUPLICATE (ignore)', description_ar: 'DEMO-مكرر', quantity: 0 }, { label: `neutralise duplicate BOQ item ${id}` });
  await actAs(['quantity_surveyor', 'workflow_owner'], 'PUT', '/api/boq/sections/2', { name_en: 'DEMO-DUPLICATE section (ignore)', name_ar: 'DEMO-مكرر' }, { label: 'neutralise duplicate BOQ section 2' });
  await actAs(['project_manager', 'workflow_owner'], 'PUT', '/api/locations/2', { name: 'DEMO-DUPLICATE building (ignore)', name_en: 'DEMO-DUPLICATE building (ignore)', is_active: false }, { label: 'neutralise duplicate location 2' });
  Object.assign(S, { loc: { bldg: 3, f1: 4, f2: 6 }, boqSec: 3, boq: { conc: 4, steel: 6, lab: 8, sub: 10 }, cc: { mat: 16, lab: 18, sub: 20 } });
  x.finish();
})();
