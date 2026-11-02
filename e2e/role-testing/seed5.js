// Stage 5: QA/QC (tests, NCR, WIR approve+reject) and HSE (incident, inspection, permit approve+reject, toolbox talk)
const x = require('./seedlib');
const { S, act, actAs, check, readBack, snap, evidenceSince, idOf, sql, call, section } = x;
module.exports = async function stage5() {
  const P = S.project; const today = '2026-11-02';
  section('17. QA/QC');
  S.qt = idOf('quality_tests', 'notes', 'DEMO-cube test 7-day pass', `and project_id=${P}`);
  if (!S.qt) { const s0 = snap(); const r = await act('testing_lab', 'POST', '/api/qhse/quality-tests', { project_id: P, boq_item_id: S.boq.conc, test_type: 'concrete_cube_7d', test_date: today, result: 'pass', tested_by: 'DEMO Lab', notes: 'DEMO-cube test 7-day pass' }, { label: 'testing_lab records passing cube test' }); S.qt = r.data?.id; evidenceSince(s0, 'quality test'); }
  S.qt2 = idOf('quality_tests', 'notes', 'DEMO-cube test 28-day FAIL', `and project_id=${P}`);
  if (!S.qt2) { const r = await act('testing_lab', 'POST', '/api/qhse/quality-tests', { project_id: P, boq_item_id: S.boq.conc, test_type: 'concrete_cube_28d', test_date: today, result: 'fail', tested_by: 'DEMO Lab', notes: 'DEMO-cube test 28-day FAIL' }, { label: 'testing_lab records FAILING cube test' }); S.qt2 = r.data?.id; }
  S.ncr = idOf('ncrs', 'description', 'DEMO-NCR low cube strength Floor 1', `and project_id=${P}`);
  if (!S.ncr || !['closed'].includes(sql(`select status from ncrs where id=${S.ncr}`))) {
    const s0 = snap(); const r = S.ncr ? { data: { id: S.ncr } } : await actAs(['qa_qc_manager', 'site_engineer'], 'POST', '/api/qhse/ncrs', { project_id: P, boq_item_id: S.boq.conc, quality_test_id: S.qt2, description: 'DEMO-NCR low cube strength Floor 1', severity: 'major' }, { label: 'qa_qc_manager raises NCR from failed test' }); S.ncr = r.data?.id; evidenceSince(s0, 'NCR', { notif: true });
    if (sql(`select status from ncrs where id=${S.ncr}`) === 'open') await actAs(['qa_qc_manager'], 'POST', `/api/qhse/ncrs/${S.ncr}/status`, { status: 'in_progress' }, { label: 'NCR -> in_progress' });
    if (sql(`select status from ncrs where id=${S.ncr}`) === 'in_progress') await actAs(['qa_qc_manager'], 'POST', `/api/qhse/ncrs/${S.ncr}/status`, { status: 'resolved', resolution_notes: 'DEMO core tests passed' }, { label: 'NCR -> resolved' });
    await actAs(['qa_qc_manager'], 'POST', `/api/qhse/ncrs/${S.ncr}/verify`, { verification_notes: 'DEMO core tests passed' }, { expect: [200, 201], label: 'qa_qc_manager verifies NCR closure' });
    check('NCR ended resolved/closed', ['resolved', 'closed'].includes(sql(`select status from ncrs where id=${S.ncr}`)), sql(`select status from ncrs where id=${S.ncr}`), 'qa_qc_manager', 'qhse');
  }
  for (const [key, note, decision] of [['wirA', 'DEMO-WIR approve: rebar Floor 1', 'approve'], ['wirR', 'DEMO-WIR reject: formwork Floor 1', 'reject']]) {
    S[key] = idOf('wirs', 'notes', note, `and project_id=${P}`);
    if (!S[key]) { const w = await actAs(['site_engineer', 'site_manager'], 'POST', '/api/qhse/wirs', { project_id: P, boq_item_id: S.boq.steel, project_location_id: S.loc.f1, inspection_date: today, notes: note }, { label: `site_engineer creates WIR (${decision} path)` }); S[key] = w.data?.id; }
    if (sql(`select status from wirs where id=${S[key]}`) === 'draft') {
      const s0 = snap();
      await actAs(['site_engineer', 'site_manager', 'qa_qc_manager'], 'POST', `/api/qhse/wirs/${S[key]}/submit`, {}, { label: `WIR submit (${decision})` });
      await actAs(['qa_qc_manager'], 'POST', `/api/qhse/wirs/${S[key]}/decision`, { decision, comment: 'DEMO ' + decision }, { label: `qa_qc_manager ${decision}s WIR` });
      evidenceSince(s0, `WIR ${decision}`, { notif: true });
    }
    if (key === 'wirA' && sql(`select status from wirs where id=${S.wirA}`) === 'pm_review') await actAs(['project_manager'], 'POST', `/api/qhse/wirs/${S.wirA}/decision`, { decision: 'approve', comment: 'DEMO PM stage' }, { label: 'project_manager approves WIR (PM stage -> consultant review)' });
  }
  if (!S.wirConsultant) {
    S.wirConsultant = true;
    const cr = await call('consultant_coordinator', 'POST', `/api/consultant/wirs/${S.wirA}/result`, { result: 'approved', comment: 'DEMO consultant review' });
    x.log.push({ role: 'consultant_coordinator', module: 'consultant', action: 'POST /api/consultant/wirs/:id/result', expected: 'HTTP 200 (consultant reviews WIR)', actual: `HTTP ${cr.status}`, result: cr.status < 300 ? 'PASS' : 'FINDING', evidence: cr.status < 300 ? '' : 'consultant account cannot act: route is authorize(consultant) (legacy role key) and the account has no consultant organization participant', section: 'QA/QC' });
  }
  check('WIR A advanced to consultant review / WIR R returned to draft for correction (reject path)', sql(`select status from wirs where id=${S.wirA}`) === 'consultant_review' && sql(`select status from wirs where id=${S.wirR}`) === 'draft', `A=${sql(`select status from wirs where id=${S.wirA}`)} R=${sql(`select status from wirs where id=${S.wirR}`)}`, 'qa_qc_manager', 'qhse');
  await act('storekeeper', 'POST', '/api/qhse/ncrs', { project_id: P, description: 'DEMO-forbidden' }, { expect: 403, forbidden: true, label: 'storekeeper raises NCR (forbidden)' });
  await act('testing_lab', 'POST', `/api/qhse/ncrs/${S.ncr}/verify`, { verification_notes: 'x' }, { expect: 403, forbidden: true, label: 'testing_lab verifies an NCR (forbidden)' });

  section('18. HSE');
  S.inc = idOf('incidents', 'description', 'DEMO-Incident minor hand injury', `and project_id=${P}`);
  if (!S.inc) { const s0 = snap(); const r = await actAs(['hse_manager', 'site_manager'], 'POST', '/api/hse/incidents', { project_id: P, incident_date: today, incident_type: 'injury', severity: 'minor', description: 'DEMO-Incident minor hand injury', injured_party: 'DEMO worker', corrective_action: 'DEMO gloves toolbox talk' }, { label: 'hse_manager logs incident' }); S.inc = r.data?.id; evidenceSince(s0, 'incident', { notif: true }); await actAs(['hse_manager'], 'POST', `/api/hse/incidents/${S.inc}/status`, { status: 'closed' }, { expect: [200, 201, 400], label: 'incident close' }); }
  S.hins = idOf('hse_inspections', 'findings', 'DEMO-HSE walk: housekeeping ok', `and project_id=${P}`);
  if (!S.hins) { const r = await actAs(['hse_manager', 'site_manager'], 'POST', '/api/hse/inspections', { project_id: P, inspection_date: today, inspection_type: 'housekeeping', checklist_items: [{ item: 'Walkways clear', ok: true }, { item: 'PPE worn', ok: true }], findings: 'DEMO-HSE walk: housekeeping ok', status: 'passed' }, { label: 'hse_manager records inspection' }); S.hins = r.data?.id; }
  for (const [key, title, decision] of [['permA', 'DEMO-Permit hot work approved', 'approve'], ['permR', 'DEMO-Permit excavation rejected', 'reject']]) {
    S[key] = idOf('permits', 'title', title, `and project_id=${P}`);
    if (!S[key]) { const p = await actAs(['site_engineer', 'site_manager'], 'POST', '/api/hse/permits', { project_id: P, permit_type: decision === 'approve' ? 'hot_work' : 'excavation', title, description: 'DEMO', precautions: ['fire watch'], valid_from: today, valid_to: '2026-11-03' }, { label: `permit requested (${decision} path)` }); S[key] = p.data?.id; }
    if (sql(`select status from permits where id=${S[key]}`) === 'draft') {
      const s0 = snap();
      await actAs(['site_engineer', 'site_manager'], 'POST', `/api/hse/permits/${S[key]}/submit`, {}, { label: `permit submit (${decision})` });
      await actAs(['hse_manager'], 'POST', `/api/hse/permits/${S[key]}/decision`, { decision, comment: 'DEMO' }, { label: `hse_manager ${decision}s permit` });
      evidenceSince(s0, `permit ${decision}`, { notif: true });
    }
  }
  check('permit A approved, permit R rejected', ['approved', 'active'].includes(sql(`select status from permits where id=${S.permA}`)) && sql(`select status from permits where id=${S.permR}`) === 'rejected', `A=${sql(`select status from permits where id=${S.permA}`)} R=${sql(`select status from permits where id=${S.permR}`)}`, 'hse_manager', 'hse');
  if (!idOf('toolbox_talks', 'title', 'DEMO-Toolbox: working at height', `and project_id=${P}`)) await actAs(['hse_manager', 'site_manager'], 'POST', '/api/hse/toolbox-talks', { project_id: P, title: 'DEMO-Toolbox: working at height', topic: 'fall protection', conducted_by: 'DEMO HSE', attendees_count: 12, attendees: ['DEMO A', 'DEMO B'] }, { label: 'toolbox talk' });
  await act('accountant_ap', 'POST', '/api/hse/incidents', { project_id: P, description: 'DEMO-forbidden' }, { expect: 403, forbidden: true, label: 'accountant_ap logs HSE incident (forbidden)' });
  x.save();
};
if (require.main === module) module.exports().then(x.finish);
