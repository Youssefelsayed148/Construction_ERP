// Stage 6: documents / RFIs / submittals (approve + reject) > client billing (AR) > supplier invoice + payment (AP) > ledger checks
const x = require('./seedlib');
const { S, act, actAs, approveUntil, check, readBack, snap, evidenceSince, idOf, sql, num, call, section } = x;
const APPROVERS = ['procurement_manager', 'project_manager', 'finance_manager', 'owner_ceo', 'coo', 'workflow_owner'];
module.exports = async function stage6() {
  const P = S.project; const today = '2026-11-02';
  section('19. document control: documents, RFI, submittals');
  S.doc = idOf('project_documents', 'title', 'DEMO-Structural drawing STR-001', `and project_id=${P}`);
  if (!S.doc) { const s0 = snap(); const r = await actAs(['document_controller', 'technical_office_engineer'], 'POST', '/api/docs/documents', { project_id: P, title: 'DEMO-Structural drawing STR-001', description: 'DEMO', document_type: 'drawing', file_url: '/uploads/demo/DEMO-STR-001.pdf', file_type: 'application/pdf', file_size_bytes: 1024 }, { label: 'document_controller registers a drawing' }); S.doc = r.data?.id; evidenceSince(s0, 'document'); }
  const dv = await call('document_controller', 'GET', `/api/docs/documents/${S.doc}`); check('document readable', dv.status === 200, `HTTP ${dv.status}`, 'document_controller', 'docs');
  if (sql(`select status from project_documents where id=${S.doc}`) === 'draft') {
    await actAs(['document_controller', 'technical_office_engineer'], 'POST', `/api/docs/documents/${S.doc}/submit`, {}, { expect: [200, 201, 409], label: 'document submit for review' });
    await approveUntil(`/api/docs/documents/${S.doc}/approve`, `select status from project_documents where id=${S.doc}`, ['approved', 'issued', 'published'], ['project_manager', 'technical_office_engineer', 'document_controller', 'owner_ceo', 'workflow_owner'], {}, 'document approval');
  }
  S.docR = idOf('project_documents', 'title', 'DEMO-Method statement MS-009 (to reject)', `and project_id=${P}`);
  if (!S.docR) {
    const r = await actAs(['document_controller', 'technical_office_engineer'], 'POST', '/api/docs/documents', { project_id: P, title: 'DEMO-Method statement MS-009 (to reject)', document_type: 'report', file_url: '/uploads/demo/DEMO-MS-009.pdf', file_type: 'application/pdf', file_size_bytes: 2048 }, { label: 'register method statement' }); S.docR = r.data?.id;
    await actAs(['document_controller', 'technical_office_engineer'], 'POST', `/api/docs/documents/${S.docR}/submit`, {}, { expect: [200, 201, 409], label: 'method statement submit' });
    await approveUntil(`/api/docs/documents/${S.docR}/reject`, `select status from project_documents where id=${S.docR}`, ['rejected', 'draft', 'returned'], ['project_manager', 'technical_office_engineer', 'owner_ceo', 'workflow_owner'], { comment: 'DEMO incomplete' }, 'document rejection');
  }
  S.rfi = idOf('project_rfis', 'subject', 'DEMO-RFI column C4 reinforcement clash', `and project_id=${P}`);
  if (!S.rfi) {
    const s0 = snap(); const r = await actAs(['site_engineer', 'technical_office_engineer'], 'POST', '/api/docs/rfis', { project_id: P, subject: 'DEMO-RFI column C4 reinforcement clash', question: 'DEMO: bar spacing conflicts with duct sleeve', priority: 'high', due_date: '2026-11-12', project_location_id: S.loc.f1 }, { label: 'site_engineer raises RFI' }); S.rfi = r.data?.id; evidenceSince(s0, 'RFI', { notif: true });
  }
  if (sql(`select count(*) from rfi_responses where rfi_id=${S.rfi}`) === '0') {
    // staged response register (the single-answer endpoint is retired). Consultant family needs an organization it cannot get via API, so PM drives the internal stages.
    const cr = await call('consultant_coordinator', 'POST', `/api/consultant/rfis/${S.rfi}/response`, { stage: 'coordinator', body: 'DEMO coordinator review', revision: 1 });
    x.log.push({ role: 'consultant_coordinator', module: 'consultant', action: 'POST /api/consultant/rfis/:id/response (coordinator stage)', expected: 'HTTP 201 (consultant answers RFI)', actual: `HTTP ${cr.status}`, result: cr.status < 300 ? 'PASS' : 'FINDING', evidence: cr.status < 300 ? '' : JSON.stringify(cr.body).slice(0, 140), section: 'documents' });
    if (cr.status >= 300) await actAs(['project_manager'], 'POST', `/api/consultant/rfis/${S.rfi}/response`, { stage: 'coordinator', body: 'DEMO coordinator review (PM stand-in)', revision: 1 }, { label: 'project_manager stands in for consultant: RFI coordinator stage' });
    await actAs(['project_manager', 'workflow_owner'], 'POST', `/api/consultant/rfis/${S.rfi}/response`, { stage: 'discipline_review', body: 'DEMO discipline review', revision: 1 }, { label: 'RFI discipline review' });
    await actAs(['project_manager', 'workflow_owner'], 'POST', `/api/consultant/rfis/${S.rfi}/response`, { stage: 'official_response', body: 'DEMO: shift sleeve 50mm east', revision: 1 }, { label: 'RFI official response' });
    await actAs(['site_engineer', 'workflow_owner'], 'POST', `/api/consultant/rfis/${S.rfi}/response`, { stage: 'acknowledgement', body: 'DEMO acknowledged by requester', revision: 1 }, { label: 'site_engineer (requester) acknowledges RFI response' });
    await actAs(['technical_office_engineer', 'project_manager'], 'POST', `/api/docs/rfis/${S.rfi}/close`, {}, { expect: [200, 201, 404, 400], label: 'RFI close' });
  }
  const consultRfi = await call('consultant_coordinator', 'GET', '/api/consultant/projects');
  x.log.push({ role: 'consultant_coordinator', module: 'consultant', action: 'consultant portal lists the DEMO project for RFI/submittal review', expected: 'project visible', actual: `HTTP ${consultRfi.status}, ${JSON.stringify(consultRfi.data || {}).includes('DEMO') ? 'visible' : 'not visible'}`, result: JSON.stringify(consultRfi.data || {}).includes('DEMO') ? 'PASS' : 'FINDING', evidence: 'no consultant participant/organization on the DEMO project (not creatable via API); RFI answered by technical_office_engineer instead', section: 'documents' });
  for (const [key, title, code, label] of [['subA', 'DEMO-Submittal: rebar mill certificates', 'A', 'approved (code A)'], ['subR', 'DEMO-Submittal: alternative cement brand (to reject)', 'D', 'rejected (code D)']]) {
    S[key] = idOf('project_submittals', 'title', title, `and project_id=${P}`);
    if (!S[key]) { const s0 = snap(); const r = await actAs(['site_engineer', 'technical_office_engineer'], 'POST', '/api/docs/submittals', { project_id: P, title, submittal_type: 'material', submitted_to: 'PMC' }, { label: `site_engineer creates submittal (${label})` }); S[key] = r.data?.id; evidenceSince(s0, 'submittal ' + label); }
    if (sql(`select count(*) from submittal_revisions where submittal_id=${S[key]}`) === '0') {
      await actAs(['technical_office_engineer', 'workflow_owner'], 'POST', `/api/consultant/submittals/${S[key]}/response`, { stage: 'internal_technical_review', comments: 'DEMO internal review', revision: 1 }, { label: `submittal internal technical review (${label})` });
      await actAs(['project_manager', 'workflow_owner'], 'POST', `/api/consultant/submittals/${S[key]}/response`, { stage: 'pm', comments: 'DEMO PM ok', revision: 1 }, { label: `submittal PM stage (${label})` });
      await actAs(['consultant_coordinator', 'workflow_owner'], 'POST', `/api/consultant/submittals/${S[key]}/response`, { stage: 'consultant_coordinator', comments: 'DEMO coordinator', revision: 1 }, { label: `submittal consultant coordinator stage (${label})` });
      await actAs(['consultant_reviewer', 'consultant_coordinator', 'workflow_owner'], 'POST', `/api/consultant/submittals/${S[key]}/response`, { stage: 'reviewer', comments: 'DEMO reviewer', revision: 1 }, { label: `submittal reviewer stage (${label})` });
      await actAs(['consultant_coordinator', 'workflow_owner'], 'POST', `/api/consultant/submittals/${S[key]}/response`, { stage: 'response', response_code: code, comments: 'DEMO final ' + label, revision: 1 }, { label: `submittal final response ${label}` });
    }
  }
  await act('storekeeper', 'POST', '/api/docs/documents', { project_id: P, title: 'DEMO-forbidden', file_url: '/x' }, { expect: 403, forbidden: true, label: 'storekeeper registers a document (forbidden)' });

  section('20. client billing (AR): contract > payment application > certify > invoice > receipts');
  S.cc2 = Number(sql(`select id from client_contracts where project_id=${P} limit 1`)) || null;
  if (!S.cc2) { const s0 = snap(); const r = await actAs(['commercial_manager', 'contracts_manager', 'workflow_owner'], 'POST', '/api/commercial/contracts', { project_id: P, client_id: S.client, original_value: 2000000, retention_percent: 10, advance_percent: 0, title: 'DEMO-Main contract Palm Tower' }, { label: 'create client contract (2,000,000)' }); S.cc2 = r.data?.id; evidenceSince(s0, 'client contract'); }
  const CLAIM = 108000; // 60 m3 approved x 1,800
  S.pap = Number(sql(`select id from payment_applications where client_contract_id=${S.cc2} order by id limit 1`)) || null;
  if (!S.pap) {
    const s0 = snap();
    const r = await actAs(['commercial_manager', 'quantity_surveyor', 'workflow_owner'], 'POST', '/api/commercial/payment-applications', { party_type: 'client', project_id: P, client_contract_id: S.cc2, claimed_work: CLAIM, period_from: '2026-11-01', period_to: '2026-11-30' }, { label: 'payment application 1 (108,000 = 60 m3 approved)' }); S.pap = r.data?.id;
    await actAs(['commercial_manager', 'quantity_surveyor', 'workflow_owner'], 'POST', `/api/commercial/payment-applications/${S.pap}/submit`, {}, { label: 'payment application submit' });
    const cert = await actAs(['commercial_manager', 'workflow_owner'], 'POST', `/api/commercial/payment-applications/${S.pap}/certify`, { certified_work: CLAIM, advance_recovery: 0 }, { label: 'commercial_manager certifies application' });
    const c = cert.data?.certificate || {}; S.cert = c.id;
    check('retention held = 10% of 108,000 = 10,800', num(c.retention_held) === 10800, `retention=${c.retention_held}`, 'commercial_manager', 'commercial');
    check('net certificate = 97,200', num(c.net_certificate) === 97200, `net=${c.net_certificate}`, 'commercial_manager', 'commercial');
    evidenceSince(s0, 'payment application', { notif: false });
  }
  S.cert = S.cert || Number(sql(`select id from payment_certificates where payment_application_id=${S.pap} limit 1`));
  if (sql(`select status from payment_certificates where id=${S.cert}`) !== 'certified') {
    await actAs(['commercial_manager', 'workflow_owner'], 'POST', `/api/commercial/payment-certificates/${S.cert}/start`, {}, { expect: [200, 201, 409], label: 'certificate workflow start' });
    await approveUntil(`/api/commercial/payment-certificates/${S.cert}/decide`, `select status from payment_certificates where id=${S.cert}`, ['certified', 'consultant_client'], ['commercial_manager', 'project_manager', 'finance_manager', 'owner_ceo', 'coo', 'workflow_owner'], { decision: 'approve', comment: 'DEMO' }, 'certificate approval chain', 10);
    const cs = sql(`select status from payment_certificates where id=${S.cert}`);
    if (cs === 'consultant_client') {
      const r = await call('consultant_coordinator', 'POST', `/api/consultant/payment-certificates/${S.cert}/recommendation`, { decision: 'approve', comment: 'DEMO' });
      x.log.push({ role: 'consultant_coordinator', module: 'consultant', action: 'POST /api/consultant/payment-certificates/:id/recommendation', expected: 'HTTP 200 (consultant recommends)', actual: `HTTP ${r.status}`, result: r.status < 300 ? 'PASS' : 'FINDING', evidence: 'known deferred external-role gap (authorize(consultant) legacy key); certificate parks at consultant_client; client billed by direct invoice', section: 'billing' });
    }
  }
  S.inv = Number(sql(`select id from invoices where project_id=${P} and description like 'DEMO-%' order by id limit 1`)) || Number(sql(`select id from invoices where payment_certificate_id=${S.cert}`)) || null;
  if (!S.inv) { const s0 = snap(); const r = await actAs(['accountant_ar', 'finance_manager'], 'POST', '/api/invoices', { client_id: S.client, project_id: P, amount: 97200, issue_date: today, due_date: '2026-12-02', description: 'DEMO-Invoice 1 (net of retention)' }, { label: 'accountant_ar raises client invoice 97,200' }); S.inv = r.data?.id; evidenceSince(s0, 'client invoice', { notif: true }); }
  const gl = sql(`select coalesce(sum(l.debit),0)||'/'||coalesce(sum(l.credit),0) from journal_entry_lines l join journal_entries e on e.id=l.journal_entry_id where e.reference_type='client_invoice' and e.reference_id=${S.inv}`).split('/');
  check('invoice journal entry balances (debit = credit > 0)', num(gl[0]) === num(gl[1]) && num(gl[0]) > 0, `debit=${gl[0]} credit=${gl[1]}`, 'accountant_ar', 'finance-ledger');
  const payAr = (amount) => call('accountant_ar', 'POST', '/api/payments', { invoice_id: S.inv, project_id: P, client_id: S.client, direction: 'ar', amount, payment_date: today });
  if (sql(`select status from invoices where id=${S.inv}`) !== 'paid') {
    const over = await payAr(999999); x.log.push({ role: 'accountant_ar', module: 'payments', action: 'receipt larger than the balance', expected: 'refused (4xx)', actual: `HTTP ${over.status}`, result: over.status >= 400 && over.status < 500 ? 'PASS' : 'FAIL', evidence: over.code || '', section: 'billing', forbidden: true });
    if (sql(`select status from invoices where id=${S.inv}`) === 'sent') { const p1 = await payAr(40000); x.log.push({ role: 'accountant_ar', module: 'payments', action: 'partial receipt 40,000', expected: 'HTTP 201', actual: `HTTP ${p1.status}`, result: p1.status === 201 ? 'PASS' : 'FAIL', evidence: '', section: 'billing' }); }
    check('invoice partially_paid', sql(`select status from invoices where id=${S.inv}`) === 'partially_paid', sql(`select status from invoices where id=${S.inv}`), 'accountant_ar', 'invoices');
    const p2 = await payAr(57200); x.log.push({ role: 'accountant_ar', module: 'payments', action: 'balance receipt 57,200', expected: 'HTTP 201', actual: `HTTP ${p2.status}`, result: p2.status === 201 ? 'PASS' : 'FAIL', evidence: p2.status === 201 ? '' : JSON.stringify(p2.body).slice(0, 150), section: 'billing' });
    check('invoice paid', sql(`select status from invoices where id=${S.inv}`) === 'paid', sql(`select status from invoices where id=${S.inv}`), 'accountant_ar', 'invoices');
    check('receipts total = 97,200', num(sql(`select coalesce(sum(amount),0) from payments where invoice_id=${S.inv} and direction='ar' and voided_at is null`)) === 97200, '', 'accountant_ar', 'payments');
  }
  // reject path: a payment application that the commercial manager rejects
  if (!sql(`select count(*) from payment_applications where client_contract_id=${S.cc2} and status in ('rejected')`).replace(/^0$/, '')) {
    const r = await actAs(['commercial_manager', 'quantity_surveyor', 'workflow_owner'], 'POST', '/api/commercial/payment-applications', { party_type: 'client', project_id: P, client_contract_id: S.cc2, claimed_work: 500000, period_from: '2026-12-01', period_to: '2026-12-31' }, { label: 'payment application 2 (over-claim 500,000)' });
    await actAs(['commercial_manager', 'quantity_surveyor', 'workflow_owner'], 'POST', `/api/commercial/payment-applications/${r.data?.id}/submit`, {}, { label: 'application 2 submit' });
    await actAs(['commercial_manager', 'workflow_owner'], 'POST', `/api/commercial/payment-applications/${r.data?.id}/reject`, { reason: 'DEMO claim exceeds approved quantities' }, { label: 'commercial_manager rejects over-claim (reject path)' });
    check('application 2 rejected', sql(`select status from payment_applications where id=${r.data?.id}`) === 'rejected', sql(`select status from payment_applications where id=${r.data?.id}`), 'commercial_manager', 'commercial');
  }
  // client portal: client_executive sees the project and its own invoice (client value visibility)
  const cp = await call('client_executive', 'GET', '/api/client-portal/projects');
  x.log.push({ role: 'client_executive', module: 'client-portal', action: 'client portal lists the DEMO project', expected: 'project visible', actual: `HTTP ${cp.status}, ${JSON.stringify(cp.data || {}).includes('DEMO-Palm Tower Main') ? 'visible' : 'not visible'}`, result: JSON.stringify(cp.data || {}).includes('DEMO-Palm Tower Main') ? 'PASS' : 'FINDING', evidence: 'client portal resolves projects through legacy_client_id of the participant organization; the DEMO client created via API has no organization mapping (_migration_client_org_map), so a newly created client can never get portal visibility through the API', section: 'billing' });
  await act('accountant_ar', 'POST', '/api/procurement/po', { supplier_id: 1, project_id: P, lines: [{ quantity: 1, unit_rate: 1 }] }, { expect: [400, 403], forbidden: true, label: 'accountant_ar creates PO (forbidden/refused)' });

  section('21. supplier invoice + payment (AP)');
  const poLine = Number(sql(`select id from purchase_order_lines where purchase_order_id=${S.po} limit 1`));
  S.sinv = Number(sql(`select id from supplier_invoices where purchase_order_id=${S.po} and invoice_number='DEMO-SINV-001'`)) || null;
  if (!S.sinv) {
    const s0 = snap();
    const r = await actAs(['accountant_ap', 'finance_manager'], 'POST', '/api/procurement/invoices', { supplier_id: 1, purchase_order_id: S.po, invoice_number: 'DEMO-SINV-001', total_amount: 480000, tax_amount: 0, lines: [{ purchase_order_line_id: poLine, material_id: S.item.rebar, quantity: 20, unit_price: 24000 }] }, { label: 'accountant_ap records supplier invoice (480,000)' });
    S.sinv = (r.data?.invoice || r.data)?.id; evidenceSince(s0, 'supplier invoice');
  }
  if (!['approved', 'paid', 'partially_paid'].includes(sql(`select status from supplier_invoices where id=${S.sinv}`))) await actAs(['procurement_manager'], 'POST', `/api/procurement/invoices/${S.sinv}/approve`, {}, { label: 'procurement_manager approves 3-way-matched invoice' });
  check('supplier invoice approved', ['approved', 'paid'].includes(sql(`select status from supplier_invoices where id=${S.sinv}`)), sql(`select status from supplier_invoices where id=${S.sinv}`), 'procurement_manager', 'procurement');
  await act('accountant_ap', 'POST', `/api/procurement/invoices/${S.sinv}/approve`, {}, { expect: [403, 409], forbidden: true, label: 'accountant_ap approves supplier invoice (separation of duties)' });
  if (sql(`select status from supplier_invoices where id=${S.sinv}`) !== 'paid') {
    const pay = await actAs(['accountant_ap', 'finance_manager'], 'POST', '/api/payments', { direction: 'ap', supplier_id: 1, project_id: P, amount: 480000, payment_date: today }, { label: 'accountant_ap records AP payment 480,000' });
    await actAs(['accountant_ap', 'finance_manager'], 'POST', `/api/finance-ledger/payments/${pay.data?.id}/allocate`, { allocations: [{ target_type: 'supplier_invoice', supplier_invoice_id: S.sinv, amount: 480000 }] }, { expect: [200, 201], label: 'payment allocated to supplier invoice' });
  }
  check('supplier invoice paid', sql(`select status from supplier_invoices where id=${S.sinv}`) === 'paid', sql(`select status from supplier_invoices where id=${S.sinv}`), 'accountant_ap', 'finance-ledger');
  const apGl = num(sql(`select coalesce(sum(l.credit),0)-coalesce(sum(l.debit),0) from journal_entry_lines l join journal_entries e on e.id=l.journal_entry_id join gl_account_map m on m.account_id=l.account_id and m.key='payable' where (e.reference_type,e.reference_id) in (select 'grn_cost', id from goods_receipt_notes where purchase_order_id=${S.po}) or (e.reference_type='supplier_payment' and e.reference_id in (select id from payments where supplier_id=1 and project_id=${P}))`));
  check('AP ledger balance for this PO nets to 0 after payment', apGl === 0, `net=${apGl}`, 'accountant_ap', 'finance-ledger');
  const unbalanced = sql(`select count(*) from (select e.id from journal_entries e join journal_entry_lines l on l.journal_entry_id=e.id group by e.id having sum(l.debit)<>sum(l.credit)) t`);
  check('no unbalanced journal entries exist in the ledger', unbalanced === '0', `unbalanced=${unbalanced}`, 'finance_manager', 'finance-ledger');
  // supplier invoice rejection
  S.sinv2 = Number(sql(`select id from supplier_invoices where invoice_number='DEMO-SINV-002'`)) || null;
  if (!S.sinv2) {
    const r = await actAs(['accountant_ap', 'finance_manager'], 'POST', '/api/procurement/invoices', { supplier_id: 1, purchase_order_id: S.po, invoice_number: 'DEMO-SINV-002', total_amount: 90000, tax_amount: 0, lines: [{ purchase_order_line_id: poLine, material_id: S.item.rebar, quantity: 5, unit_price: 18000 }] }, { expect: [201, 400, 409], label: 'accountant_ap records over-billed duplicate invoice (to reject)' });
    S.sinv2 = (r.data?.invoice || r.data)?.id;
    if (S.sinv2) { await actAs(['procurement_manager', 'procurement_officer'], 'POST', `/api/procurement/invoices/${S.sinv2}/workflow/start`, {}, { expect: [200, 201, 409], label: 'invoice workflow start' }); await approveUntil(`/api/procurement/invoices/${S.sinv2}/workflow/decide`, `select status from supplier_invoices where id=${S.sinv2}`, ['rejected'], ['procurement_manager', 'project_manager', 'owner_ceo', 'workflow_owner'], { decision: 'reject', comment: 'DEMO over-billed' }, 'supplier invoice rejection'); }
  }
  await act('storekeeper', 'POST', '/api/payments', { direction: 'ap', supplier_id: 1, project_id: P, amount: 1, payment_date: today }, { expect: 403, forbidden: true, label: 'storekeeper records a payment (forbidden)' });
  x.save();
};
if (require.main === module) module.exports().then(x.finish);
