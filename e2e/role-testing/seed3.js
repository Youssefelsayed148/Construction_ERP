// Stage 3: supplier, items, warehouse > procurement (PR > RFQ > quotes > award > PO) > goods receipt > issue to site (+ a rejected PR)
const x = require('./seedlib');
const { S, act, actAs, approveUntil, check, readBack, snap, evidenceSince, idOf, sql, num, call, section } = x;
const APPROVERS = ['procurement_manager', 'project_manager', 'finance_manager', 'owner_ceo', 'coo', 'workflow_owner'];
module.exports = async function stage3() {
  const P = S.project;
  section('9. masters: supplier, items, warehouse');
  S.supplier = idOf('suppliers', 'name_en', 'DEMO-Delta Steel Trading');
  if (!S.supplier) { const s0 = snap(); const r = await act('procurement_officer', 'POST', '/api/suppliers', { code: 'DEMO-SUP-001', name_ar: 'DEMO-دلتا للحديد', name_en: 'DEMO-Delta Steel Trading', specialty: 'steel', contact_person: 'DEMO Sales', phone: '+20-000-1111', email: 'demo-supplier@example.com', city: 'Cairo', payment_terms: 'net30', tax_id: 'DEMO-TAX-1' }, { label: 'create supplier' }); S.supplier = r.data?.id; evidenceSince(s0, 'supplier'); }
  { const r = await call('procurement_officer', 'GET', `/api/suppliers/${S.supplier}`);
    if (r.status === 200) check('supplier exists (read back by creator)', true, '', 'procurement_officer', 'suppliers');
    else x.log.push({ role: 'procurement_officer', module: 'suppliers', action: 'VERIFY creator can read the supplier it just created', expected: 'HTTP 200', actual: `HTTP ${r.status}`, result: 'FINDING', evidence: 'record-scope: a supplier with no project link is invisible to project-bound roles; owner reads it instead', section: 'masters' }); }
  S.item = S.item || {};
  for (const [key, code, en, ar, unit, cat] of [['rebar', 'DEMO-IT-REBAR', 'DEMO-Rebar 16mm', 'DEMO-حديد تسليح', 'ton', 'raw_material'], ['cement', 'DEMO-IT-CEM', 'DEMO-Cement 50kg bag', 'DEMO-أسمنت', 'bag', 'raw_material']]) {
    S.item[key] = idOf('item_master', 'name_en', en); if (S.item[key]) continue;
    const s0 = snap(); const r = await act('procurement_manager', 'POST', '/api/items', { code, category: cat, unit, name_en: en, name_ar: ar }, { label: `create item ${code}` }); S.item[key] = r.data?.id; evidenceSince(s0, 'item ' + code);
  }
  S.wh = idOf('warehouses', 'name', 'DEMO-Site Warehouse');
  if (!S.wh) { const s0 = snap(); const r = await act('storekeeper', 'POST', '/api/warehouses', { name: 'DEMO-Site Warehouse', name_en: 'DEMO-Site Warehouse', name_ar: 'DEMO-مخزن الموقع', warehouse_type: 'project', project_id: P }, { label: 'create warehouse' }); S.wh = r.data?.id; evidenceSince(s0, 'warehouse'); }

  section('10. procurement happy path: PR > RFQ > quotes > award > PO');
  const QTY = 20, PRICE = 24000, VALUE = QTY * PRICE; const rebar = S.item.rebar;
  S.pr = idOf('purchase_requests', 'title', 'DEMO-PR Rebar for columns');
  if (!S.pr) {
    const s0 = snap();
    const pr = await act('procurement_officer', 'POST', '/api/procurement/pr', { project_id: P, title: 'DEMO-PR Rebar for columns', priority: 'high', needed_by: '2026-12-10', cost_code_id: S.cc.mat, lines: [{ material_id: rebar, description: 'DEMO rebar 16mm', quantity: QTY, unit: 'ton', estimated_unit_price: PRICE }] }, { label: 'procurement_officer creates PR' });
    S.pr = pr.data?.id; check('PR amount = 480,000', num(pr.data?.amount) === VALUE, `amount=${pr.data?.amount}`, 'procurement_officer', 'procurement');
    await act('procurement_officer', 'POST', `/api/procurement/pr/${S.pr}/submit`, undefined, { label: 'PR submit' });
    evidenceSince(s0, 'PR created+submitted', { notif: true });
  }
  await approveUntil(`/api/procurement/pr/${S.pr}/decide`, `select status from purchase_requests where id=${S.pr}`, ['procurement', 'approved', 'converted'], APPROVERS, { decision: 'approve', comment: 'DEMO approve' }, 'PR approval chain');
  S.rfq = idOf('rfqs', 'title', 'DEMO-RFQ Rebar for columns');
  if (!S.rfq) {
    const rfq = await act('procurement_officer', 'POST', '/api/procurement/rfq', { project_id: P, purchase_request_id: S.pr, title: 'DEMO-RFQ Rebar for columns', due_date: '2026-12-01', lines: [{ material_id: rebar, description: 'DEMO rebar 16mm', quantity: QTY, unit: 'ton' }] }, { label: 'create RFQ' });
    S.rfq = rfq.data?.id; await act('procurement_officer', 'POST', `/api/procurement/rfq/${S.rfq}/vendors`, { supplier_ids: [1, S.supplier] }, { label: 'invite 2 suppliers' });
  }
  const rfqLine = Number(sql(`select id from rfq_lines where rfq_id=${S.rfq} limit 1`));
  const haveQ = (sid) => sql(`select count(*) from supplier_quotations where rfq_id=${S.rfq} and supplier_id=${sid}`) !== '0';
  // supplier_sales (external) quotes through its own portal for supplier 1; procurement_officer keys the second vendor's quote
  if (!haveQ(1)) {
    const portal = await call('supplier_sales', 'GET', '/api/portal/supplier/dashboard'); check('supplier portal dashboard opens for supplier_sales', portal.status === 200, `HTTP ${portal.status}`, 'supplier_sales', 'portal');
    await act('supplier_sales', 'POST', `/api/portal/supplier/rfqs/${S.rfq}/quotations`, { supplier_id: 1, payment_terms: 'net30', delivery_terms: 'site', lead_time_days: 7, tax_pct: 0, lines: [{ rfq_line_id: rfqLine, material_id: rebar, quantity: QTY, unit_price: PRICE, delivery_days: 7 }] }, { label: 'supplier_sales submits quotation via supplier portal', module: 'portal' });
  }
  if (!haveQ(S.supplier)) await act('procurement_officer', 'POST', `/api/procurement/rfq/${S.rfq}/quotations`, { supplier_id: S.supplier, payment_terms: 'net45', delivery_terms: 'site', lead_time_days: 14, lines: [{ rfq_line_id: rfqLine, material_id: rebar, quantity: QTY, unit_price: PRICE + 1500 }] }, { label: 'quotation 2 (dearer)' });
  { const r = await call('procurement_officer', 'GET', `/api/suppliers/${S.supplier}`);
    x.log.push({ role: 'procurement_officer', module: 'suppliers', action: 'VERIFY buyer can read a supplier invited to its own project RFQ', expected: 'HTTP 200', actual: `HTTP ${r.status}`, result: r.status === 200 ? 'PASS' : 'FINDING', evidence: r.status === 200 ? '' : 'GET /api/suppliers/:id is record-scoped and does not see RFQ invitations/quotations as a project link', section: 'procurement' }); }
  const cmp = await call('procurement_officer', 'GET', `/api/procurement/rfq/${S.rfq}/comparison`);
  check('comparison lists both quotations', cmp.status === 200 && (cmp.data?.rows || []).length === 2, `HTTP ${cmp.status} rows=${(cmp.data?.rows || []).length}`, 'procurement_officer', 'procurement');
  const q1 = Number(sql(`select id from supplier_quotations where rfq_id=${S.rfq} and supplier_id=1 limit 1`));
  S.award = Number(sql(`select id from rfq_award_recommendations where rfq_id=${S.rfq} limit 1`)) || null;
  if (!S.award) {
    const aw = await act('procurement_officer', 'POST', `/api/procurement/rfq/${S.rfq}/award-recommendations`, { quotation_id: q1, basis: 'lowest_price', justification: 'DEMO cheapest compliant quote' }, { label: 'award recommendation' }); S.award = aw.data?.id;
    await act('procurement_officer', 'POST', `/api/procurement/award-recommendations/${S.award}/submit`, undefined, { label: 'award submit' });
  }
  await approveUntil(`/api/procurement/award-recommendations/${S.award}/decide`, `select status from rfq_award_recommendations where id=${S.award}`, ['approved'], APPROVERS, { decision: 'approve', comment: 'DEMO' }, 'award approval chain');
  S.po = Number(sql(`select id from purchase_orders where purchase_request_id=${S.pr} limit 1`)) || null;
  if (!S.po) { const po = await act('procurement_officer', 'POST', '/api/procurement/po', { supplier_id: 1, purchase_request_id: S.pr, project_id: P, lines: [{ material_id: rebar, quantity: QTY, unit: 'ton', unit_rate: PRICE }] }, { label: 'create PO' }); S.po = po.data?.id; check('PO value = 480,000', num(sql(`select total_amount from purchase_orders where id=${S.po}`)) === VALUE || num(sql(`select coalesce(sum(quantity*unit_rate),0) from purchase_order_lines where purchase_order_id=${S.po}`)) === VALUE, `po=${sql(`select total_amount from purchase_orders where id=${S.po}`)}`, 'procurement_officer', 'procurement'); }
  await act('procurement_officer', 'POST', `/api/procurement/po/${S.po}/issue`, undefined, { expect: 403, forbidden: true, label: 'procurement_officer issues PO (forbidden: manager only)' });
  const s1 = snap();
  await act('procurement_manager', 'POST', `/api/procurement/po/${S.po}/issue`, undefined, { expect: [200, 409], label: 'procurement_manager submits PO for issue approval' });
  await approveUntil(`/api/procurement/po/${S.po}/decide`, `select status from purchase_orders where id=${S.po}`, ['issued'], APPROVERS, { decision: 'approve', comment: 'DEMO' }, 'PO approval chain (approval limits)');
  evidenceSince(s1, 'PO issue', { notif: true });
  const poRead = await readBack('procurement_manager', `/api/procurement/po/${S.po}`, { status: 'issued' }, 'PO issued (read back)');
  const spo = await call('supplier_sales', 'GET', '/api/portal/supplier/dashboard');
  check('supplier portal shows the issued PO to supplier_sales', spo.status === 200 && JSON.stringify(spo.data || {}).includes(String(S.po)), `HTTP ${spo.status}`, 'supplier_sales', 'portal');
  await act('supplier_sales', 'POST', `/api/portal/supplier/purchase-orders/${S.po}/acknowledge`, {}, { expect: [200, 201], module: 'portal', label: 'supplier_sales acknowledges PO via portal' });

  section('11. goods receipt (storekeeper) and stock');
  const poLine = Number(sql(`select id from purchase_order_lines where purchase_order_id=${S.po} limit 1`));
  const stock = () => num(sql(`select coalesce(sum(quantity),0) from warehouse_stock where warehouse_id=${S.wh} and item_id=${rebar}`));
  const stock0 = stock();
  if (sql(`select count(*) from goods_receipt_notes where purchase_order_id=${S.po}`) === '0') {
    const s2 = snap();
    const d = await act('storekeeper', 'POST', '/api/procurement/deliveries', { purchase_order_id: S.po, warehouse_id: S.wh, lines: [{ purchase_order_line_id: poLine, quantity: QTY }] }, { label: 'storekeeper records delivery' });
    const mir = await actAs(['storekeeper', 'qa_qc_manager'], 'POST', `/api/procurement/deliveries/${d.data?.id}/mir`, undefined, { label: 'create MIR' });
    await actAs(['qa_qc_manager', 'procurement_manager', 'project_manager'], 'POST', `/api/procurement/mir/${mir.data?.id}/decide`, { decision: 'accept' }, { label: 'MIR accepted' });
    await act('storekeeper', 'POST', `/api/procurement/mir/${mir.data?.id}/grn`, undefined, { label: 'GRN posted' });
    evidenceSince(s2, 'GRN', { notif: false });
    check(`stock rose by ${QTY} (was ${stock0})`, stock() - stock0 === QTY, `stock=${stock()}`, 'storekeeper', 'inventory');
    const cost = num(sql(`select coalesce(sum(amount),0) from project_costs where source_type='grn' and source_id in (select id from goods_receipt_notes where purchase_order_id=${S.po})`));
    check('project cost posted = 480,000', cost === VALUE, `cost=${cost}`, 'storekeeper', 'costing');
  }
  await act('storekeeper', 'POST', '/api/procurement/deliveries', { purchase_order_id: S.po, warehouse_id: S.wh, lines: [{ purchase_order_line_id: poLine, quantity: 5 }] }, { expect: [400, 409, 422], forbidden: true, label: 'receive more than ordered after full receipt (refused)' });

  section('12. issue to site');
  if (!S.issue) {
    const before = stock();
    const iss = await act('storekeeper', 'POST', '/api/inventory/issues', { warehouse_id: S.wh, project_id: P, reason: 'DEMO issue to columns', lines: [{ material_id: rebar, quantity: 8 }] }, { label: 'create issue-to-site draft' });
    S.issue = iss.data?.id;
    await actAs(['storekeeper', 'project_manager'], 'POST', `/api/inventory/issues/${S.issue}/post`, undefined, { label: 'post issue' });
    check('stock fell by 8 after the issue', before - stock() === 8, `before=${before} after=${stock()}`, 'storekeeper', 'inventory');
  }

  section('13. rejected requisition (reject path)');
  S.pr2 = idOf('purchase_requests', 'title', 'DEMO-PR Rejected luxury cladding');
  if (!S.pr2) {
    const pr = await act('procurement_officer', 'POST', '/api/procurement/pr', { project_id: P, title: 'DEMO-PR Rejected luxury cladding', priority: 'low', lines: [{ material_id: S.item.cement, description: 'DEMO over-spec cladding', quantity: 500, unit: 'bag', estimated_unit_price: 900 }] }, { label: 'create PR to be rejected' });
    S.pr2 = pr.data?.id; await act('procurement_officer', 'POST', `/api/procurement/pr/${S.pr2}/submit`, undefined, { label: 'PR2 submit' });
    const s3 = snap();
    await approveUntil(`/api/procurement/pr/${S.pr2}/decide`, `select status from purchase_requests where id=${S.pr2}`, ['rejected'], APPROVERS, { decision: 'reject', comment: 'DEMO not budgeted' }, 'PR rejection');
    evidenceSince(s3, 'PR reject', { notif: true });
  }
  // forbidden actions
  await act('storekeeper', 'POST', '/api/procurement/pr', { project_id: P, title: 'DEMO-forbidden', lines: [{ description: 'x', quantity: 1 }] }, { expect: 403, forbidden: true, label: 'storekeeper creates PR (forbidden)' });
  await act('site_engineer', 'POST', `/api/procurement/pr/${S.pr}/decide`, { decision: 'approve' }, { expect: 403, forbidden: true, label: 'site_engineer approves PR (forbidden)' });
  await act('supplier_sales', 'POST', '/api/procurement/pr', { project_id: P, title: 'DEMO-forbidden', lines: [{ description: 'x', quantity: 1 }] }, { expect: 403, forbidden: true, label: 'supplier_sales uses internal procurement (forbidden)' });
  x.save();
};
if (require.main === module) module.exports().then(x.finish);
