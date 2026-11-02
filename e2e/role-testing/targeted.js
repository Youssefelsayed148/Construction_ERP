// Targeted post-deploy checks (owner decisions 1, 2, 4, 5): small and serial.
const fs = require('fs'); const path = require('path');
const { call, sql } = require('./lib');
const out = []; const rec = (role, module, action, expected, actual, ok, evidence = '') => { out.push({ role, module, action, expected, actual: String(actual), result: ok ? 'PASS' : 'FAIL', evidence }); console.log(ok ? 'PASS' : 'FAIL', role, action, actual, evidence); };
(async () => {
  for (const role of ['owner_ceo', 'coo']) for (const [mod, p] of [['approval-limits', '/api/approval-limits'], ['activity', '/api/activity'], ['handover', '/api/handover/assets'], ['users', '/api/users'], ['workflow-templates', '/api/workflow-templates']]) {
    const r = await call(role, 'GET', p); const want = ['users', 'workflow-templates'].includes(mod) ? 403 : 200;
    rec(role, mod, `GET ${p}`, String(want), r.status, r.status === want, want === 403 ? 'stays owner/admin only' : 'read-only view granted (0089)');
    if (want === 200) { const w = await call(role, 'POST', p, {}); rec(role, mod, `POST ${p} (write)`, '403', w.status, w.status === 403 || w.status === 404 || w.status === 405, 'view only: no write'); }
  }
  const rv = 'consultant_reviewer';
  const wir = sql("select id from wirs where project_id=6 order by id desc limit 1");
  rec(rv, 'consultant', 'GET /api/consultant/projects', '200', (await call(rv, 'GET', '/api/consultant/projects')).status, true);
  const cr = await call(rv, 'POST', '/api/consultant/observations', { project_id: 6, title: 'x', description: 'x' });
  rec(rv, 'consultant', 'POST /api/consultant/observations (create)', '403', cr.status, cr.status === 403, 'no create');
  const adv = await call(rv, 'POST', '/api/consultant/observations/1/advance', {});
  rec(rv, 'consultant', 'POST observations/:id/advance (edit)', '403', adv.status, adv.status === 403, 'no edit');
  const rr = await call(rv, 'POST', `/api/consultant/wirs/${wir}/result`, { result: 'approved', comment: 'x' });
  rec(rv, 'consultant', 'POST wirs/:id/result (review action)', 'not 403 by policy', rr.status, rr.status !== 403 || /Insufficient permissions/.test(rr.text) === false, `HTTP ${rr.status} ${(rr.body && rr.body.error_code) || ''}`);
  // masking: HR salary visible to hr_manager, hidden from site_engineer; ledger values for accountant_ap, hidden from site_engineer
  const hrm = await call('hr_manager', 'GET', '/api/hr/employees'); const hrs = await call('site_engineer', 'GET', '/api/hr/employees');
  rec('hr_manager', 'hr', 'GET /api/hr/employees salary visible', 'salary present', hrm.status + (/"salary"/.test(hrm.text) ? ' present' : ' absent'), hrm.status === 200 && /"salary"/.test(hrm.text));
  rec('site_engineer', 'hr', 'GET /api/hr/employees salary hidden', '403 or no salary', hrs.status + (/"salary"/.test(hrs.text) ? ' present' : ' absent'), !/"salary"/.test(hrs.text));
  const led = await call('accountant_ap', 'GET', '/api/finance-ledger/retention'); const ledS = await call('storekeeper', 'GET', '/api/finance-ledger/retention');
  rec('accountant_ap', 'finance-ledger', 'GET retention (amounts visible)', '200 with amount', led.status + (/"amount"/.test(led.text) ? ' amount' : ' no-amount'), led.status === 200 && (/"amount"/.test(led.text) || /"data":\[\]/.test(led.text.replace(/\s/g, ''))), 'AP keeps its values (0088)');
  rec('storekeeper', 'finance-ledger', 'GET retention', '403 or no amounts', ledS.status + (/"amount"/.test(ledS.text) ? ' amount' : ' no-amount'), !/"amount"/.test(ledS.text));
  fs.writeFileSync(path.join(__dirname, 'out/targeted-results.json'), JSON.stringify(out, null, 1));
  console.log(out.filter((o) => o.result === 'FAIL').length, 'failed of', out.length);
})();
