const x = require('./seedlib'); const { S, act, sql, check, section } = x;
(async () => { section('restore rejected measurement after the site_engineer self-approval defect');
  await act('quantity_surveyor', 'POST', `/api/quantities/measurements/${S.meas[1]}/review`, { state: 'rejected' }, { label: 'quantity_surveyor re-rejects 45 m3' });
  check('measurement 45 m3 is rejected again', sql(`select approval_state from quantity_measurements where id=${S.meas[1]}`) === 'rejected', '', 'quantity_surveyor', 'quantities'); x.finish(); })();
