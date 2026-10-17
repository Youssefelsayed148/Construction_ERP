'use strict';

const { assertDemoTarget } = require('./company-demo-common');
const TARGET = Object.freeze({ projectName: 'erp-demo-20261017', baseUrl: 'http://127.0.0.1:8092',
  dbName: 'construction_erp_demo', dbHost: '127.0.0.1', dbPort: '55442' });

function rows(response, route, collection) {
  if (response.status !== 200) throw new Error(`Demo list ${route}: HTTP ${response.status}`);
  const data = response.body?.data;
  const result = collection ? data?.[collection] : data;
  if (!Array.isArray(result)) throw new Error(`Demo list ${route}: invalid list response`);
  return result;
}

async function ensureDocument({ request, account, listPath, createPath, key, keyField, body, collection, match }) {
  if (typeof request !== 'function' || !account || !listPath || !createPath || !key || !keyField || body?.[keyField] !== key) {
    throw new Error('Refusing demo: invalid procurement stable key');
  }
  const available = rows(await request(account, listPath), listPath, collection);
  const found = available.filter(row => match ? match(row) : row?.[keyField] === key);
  if (found.length > 1) throw new Error('Refusing demo: ambiguous procurement stable key');
  if (found.length === 1) return { row: found[0], created: false };
  const result = await request(account, createPath, { method: 'POST', body });
  if (result.status !== 201 || !result.body?.data) throw new Error(`Demo create ${createPath}: HTTP ${result.status}`);
  return { row: result.body.data, created: true };
}

async function seedProcurement({ target, request, accounts, projects, suppliers, materials, warehouses }) {
  assertDemoTarget(target);
  const account = key => {
    const found = accounts.find(row => row.key === key);
    if (!found) throw new Error(`Refusing demo: missing role account ${key}`);
    return found;
  };
  const maker = account('procurement_officer');
  const approver = account('workflow_checker');
  const finance = account('finance_manager');
  const storekeeper = account('storekeeper');
  const owner = account('workflow_owner');
  const counts = {};
  const bump = kind => { counts[kind] = (counts[kind] || 0) + 1; };
  const byProject = projects.slice().sort((a, b) => a.code.localeCompare(b.code));
  const usersResponse = await request(owner, '/api/users?limit=200');
  const userList = rows(usersResponse, '/api/users?limit=200');
  const userByEmail = new Map(userList.map(row => [row.email, row]));
  for (const roleAccount of [approver, finance]) {
    const user = userByEmail.get(`demo-${roleAccount.key}@demo.example.com`);
    if (!user) throw new Error(`Refusing demo: missing workflow user ${roleAccount.key}`);
    for (const project of byProject) {
      const teamPath = `/api/team?project_id=${project.id}&limit=200`;
      const teamRows = rows(await request(owner, teamPath), teamPath);
      const roleKey = roleAccount.key === 'workflow_checker' ? 'purchasing_mgr' : 'finance_manager';
      if (teamRows.some(row => Number(row.user_id) === Number(user.id) && row.role_key === roleKey)) continue;
      const assigned = await request(owner, '/api/team', { method: 'POST', body: {
        project_id: project.id, user_id: user.id, role_key: roleKey, organization_id: null, expires_at: null,
      } });
      if (assigned.status !== 201) throw new Error(`Demo create /api/team: HTTP ${assigned.status}`);
      bump('workflow_team_seats');
    }
  }
  const prRows = [];
  for (let index = 0; index < 12; index += 1) {
    const project = byProject[index % byProject.length];
    const material = materials[index % materials.length];
    const title = `DEMO-PR-${String(index + 1).padStart(3, '0')}`;
    const body = { title, project_id: project.id, priority: index === 0 ? 'urgent' : 'normal', needed_by: '2026-11-15',
      lines: [{ material_id: material.id, description: material.name_en, quantity: index === 0 ? 1000 : 15 + index, unit: material.unit,
        estimated_unit_price: index === 0 ? 25000 : 900 + index * 150, needed_by: '2026-11-15' }] };
    const result = await ensureDocument({ request, account: maker, listPath: `/api/procurement/project/${project.id}?limit=200`, collection: 'purchase_requests',
      createPath: '/api/procurement/pr', key: title, keyField: 'title', body });
    if (result.created) bump('purchase_requests');
    prRows.push(result.row);
  }

  const rfqRows = [];
  for (let index = 0; index < 4; index += 1) {
    const project = byProject[index % byProject.length];
    const pr = prRows[index + 1];
    const title = `DEMO-RFQ-${String(index + 1).padStart(3, '0')}`;
    const material = materials[(index + 1) % materials.length];
    const body = { title, project_id: project.id, purchase_request_id: pr.id, due_date: '2026-11-30',
      lines: [{ material_id: material.id, description: material.name_en, quantity: 100 + index * 20, unit: material.unit }] };
    const result = await ensureDocument({ request, account: account('procurement_manager'), listPath: '/api/procurement/rfq?limit=200',
      createPath: '/api/procurement/rfq', key: title, keyField: 'title', body });
    if (result.created) bump('rfqs');
    rfqRows.push(result.row);
  }

  const primaryRfq = rfqRows[0];
  let detailResponse = await request(account('procurement_manager'), `/api/procurement/rfq/${primaryRfq.id}`);
  if (detailResponse.status !== 200 || !detailResponse.body?.data) throw new Error(`Demo list /api/procurement/rfq/${primaryRfq.id}: HTTP ${detailResponse.status}`);
  let rfqDetail = detailResponse.body.data;
  const invitedIds = suppliers.slice(0, 3).map(row => Number(row.id));
  const existingInvites = new Set((rfqDetail.vendors || []).map(row => Number(row.supplier_id)));
  const missingInvites = invitedIds.filter(id => !existingInvites.has(id));
  if (missingInvites.length) {
    const invite = await request(account('procurement_manager'), `/api/procurement/rfq/${primaryRfq.id}/vendors`, { method: 'POST', body: { supplier_ids: missingInvites } });
    if (invite.status !== 201) throw new Error(`Demo invite /api/procurement/rfq/${primaryRfq.id}/vendors: HTTP ${invite.status}`);
  }
  detailResponse = await request(account('procurement_manager'), `/api/procurement/rfq/${primaryRfq.id}`);
  rfqDetail = detailResponse.body?.data;
  const rfqLine = rfqDetail?.lines?.[0];
  if (!rfqLine) throw new Error('Demo RFQ detail has no line');
  const quotes = [
    { compliant: false, deviations: ['Does not meet specified fire rating'], technical_score: 45, commercial_score: 92, unit_price: 700 },
    { compliant: true, deviations: [], technical_score: 72, commercial_score: 50, unit_price: 900 },
    { compliant: true, deviations: [], technical_score: 96, commercial_score: 94, unit_price: 1150 },
  ];
  for (let index = 0; index < 3; index += 1) {
    const supplier = suppliers[index];
    const existing = (rfqDetail.quotations || []).filter(row => Number(row.supplier_id) === Number(supplier.id));
    if (existing.length > 1) throw new Error('Refusing demo: duplicate supplier quotation');
    if (existing.length) continue;
    const quote = quotes[index];
    const response = await request(account('procurement_manager'), `/api/procurement/rfq/${primaryRfq.id}/quotations`, { method: 'POST', body: {
      supplier_id: supplier.id, lines: [{ rfq_line_id: rfqLine.id, material_id: rfqLine.material_id, quantity: rfqLine.quantity, unit_price: quote.unit_price, delivery_days: 7 + index * 3 }],
      compliant: quote.compliant, deviations: quote.deviations, technical_score: quote.technical_score, commercial_score: quote.commercial_score,
      lead_time_days: 7 + index * 3, payment_terms: '30 days', delivery_terms: 'Delivered to Alexandria site', warranty_months: 12, valid_until: '2026-12-15' } });
    if (response.status !== 201) throw new Error(`Demo quote /api/procurement/rfq/${primaryRfq.id}/quotations: HTTP ${response.status}`);
    bump('quotations');
  }

  const poRows = [];
  for (let index = 0; index < 10; index += 1) {
    const project = byProject[index % byProject.length];
    const pr = prRows[index];
    const supplier = suppliers[index % suppliers.length];
    const material = materials[index % materials.length];
    const body = { supplier_id: supplier.id, purchase_request_id: pr.id, project_id: project.id, needed_by: '2026-11-30',
      tolerance_pct: 5, payment_terms: '30 days', delivery_terms: 'Alexandria project delivery',
      lines: [{ material_id: material.id, description: material.name_en, quantity: index < 2 ? 100 : 10 + index,
        unit: material.unit, unit_rate: 900 + index * 175, notes: `DEMO-PO-${String(index + 1).padStart(3, '0')}` }] };
    const workspace = await request(maker, `/api/procurement/project/${project.id}?limit=200`);
    if (workspace.status !== 200) throw new Error(`Demo list /api/procurement/project/${project.id}: HTTP ${workspace.status}`);
    const existing = (workspace.body?.data?.purchase_orders || []).filter(row => Number(row.purchase_request_id) === Number(pr.id));
    if (existing.length > 1) throw new Error('Refusing demo: duplicate PO stable key');
    let po = existing[0];
    if (!po) {
      const created = await request(maker, '/api/procurement/po', { method: 'POST', body });
      if (created.status !== 201 || !created.body?.data) throw new Error(`Demo create /api/procurement/po: HTTP ${created.status}`);
      po = created.body.data; bump('purchase_orders');
    }
    poRows.push({ ...po, project_id: project.id, material_id: material.id });
  }

  // Two POs are approved through distinct maker/checker accounts so receipt APIs can accept their partial deliveries.
  const receiptPlans = [
    // Keep the date-based stable keys aligned with the date-only demo back-date.
    { po: poRows[0], warehouse: warehouses.find(row => Number(row.project_id) === Number(poRows[0].project_id)), deliveryDates: ['2026-04-10', '2026-03-10'], quantities: [40, 40], decision: 'accept' },
    { po: poRows[1], warehouse: warehouses.find(row => Number(row.project_id) === Number(poRows[1].project_id)), deliveryDates: ['2026-10-07'], quantities: [20], decision: 'reject' },
  ];
  const delivered = [];
  for (const plan of receiptPlans) {
    let poResponse = await request(maker, `/api/procurement/po/${plan.po.id}`);
    if (poResponse.status !== 200 || !poResponse.body?.data) throw new Error(`Demo list /api/procurement/po/${plan.po.id}: HTTP ${poResponse.status}`);
    let po = poResponse.body.data;
    if (po.status === 'draft' && !po.workflow_instance_id) {
      const issue = await request(owner, `/api/procurement/po/${po.id}/issue`, { method: 'POST', body: {} });
      if (issue.status < 200 || issue.status >= 300) throw new Error(`Demo issue /api/procurement/po/${po.id}: HTTP ${issue.status}`);
    }
    for (const checker of [owner, approver, finance, approver]) {
      poResponse = await request(checker, `/api/procurement/po/${plan.po.id}`);
      if (poResponse.status !== 200 || !poResponse.body?.data) throw new Error(`Demo list /api/procurement/po/${plan.po.id}: HTTP ${poResponse.status}`);
      po = poResponse.body.data;
      if (po.status === 'issued' || po.status === 'acknowledged' || po.status === 'partially_delivered' || po.status === 'fully_delivered') break;
      const decide = await request(checker, `/api/procurement/po/${po.id}/decide`, { method: 'POST', body: { decision: 'approve', comment: 'Approved for fictional demo procurement.' } });
      if (decide.status !== 200) throw new Error(`Demo decide /api/procurement/po/${po.id}: HTTP ${decide.status}`);
    }
    if (!['issued', 'acknowledged', 'partially_delivered', 'fully_delivered'].includes(po.status)) throw new Error(`Demo PO approval did not issue document: HTTP_STATE_${String(po.status).toUpperCase()}`);
    for (let deliveryIndex = 0; deliveryIndex < plan.deliveryDates.length; deliveryIndex += 1) {
      const date = plan.deliveryDates[deliveryIndex];
      const path = `/api/procurement/project/${plan.po.project_id}?limit=200`;
      const workspace = await request(owner, path);
      if (workspace.status !== 200) throw new Error(`Demo list ${path}: HTTP ${workspace.status}`);
      const prior = (workspace.body?.data?.deliveries || []).filter(row => Number(row.purchase_order_id) === Number(plan.po.id) && String(row.delivery_date).slice(0, 10) === date);
      if (prior.length > 1) throw new Error('Refusing demo: duplicate delivery stable key');
      let delivery = prior[0];
      if (!delivery) {
        const detail = await request(owner, `/api/procurement/po/${plan.po.id}`);
        if (detail.status !== 200) throw new Error(`Demo list /api/procurement/po/${plan.po.id}: HTTP ${detail.status}`);
        const poLine = detail.body?.data?.lines?.[0];
        if (!poLine) throw new Error('Demo purchase order has no line');
        const response = await request(storekeeper, '/api/procurement/deliveries', { method: 'POST', body: {
          purchase_order_id: plan.po.id, warehouse_id: plan.warehouse.id, delivery_date: date,
          lines: [{ purchase_order_line_id: poLine.id, quantity: plan.quantities[deliveryIndex], notes: 'Fictional staged receipt for demo.' }],
        } });
        if (response.status !== 201 || !response.body?.data) throw new Error(`Demo create /api/procurement/deliveries: HTTP ${response.status}`);
        delivery = response.body.data; bump('deliveries');
      }
      const mirs = workspace.body?.data?.material_inspection_requests || [];
      let mir = mirs.find(row => Number(row.delivery_id) === Number(delivery.id));
      if (!mir) {
        const response = await request(storekeeper, `/api/procurement/deliveries/${delivery.id}/mir`, { method: 'POST', body: {} });
        if (response.status !== 201 || !response.body?.data) throw new Error(`Demo create MIR: HTTP ${response.status}`);
        mir = response.body.data; bump('mirs');
      }
      if (mir.status === 'pending') {
        const response = await request(owner, `/api/procurement/mir/${mir.id}/decide`, { method: 'POST', body: {
          decision: plan.decision, notes: plan.decision === 'reject' ? 'Rejected during demo inspection; supplier return recorded separately against an accepted GRN.' : 'Accepted demo delivery.' } });
        if (response.status !== 200) throw new Error(`Demo decide MIR: HTTP ${response.status}`);
        mir = response.body?.data || mir;
      }
      delivered.push({ delivery, mir, plan });
      const refreshed = await request(owner, `/api/procurement/project/${plan.po.project_id}?limit=200`);
      if (refreshed.status !== 200) throw new Error(`Demo list ${path}: HTTP ${refreshed.status}`);
      const existingGrn = (refreshed.body?.data?.goods_receipt_notes || []).find(row => Number(row.mir_id) === Number(mir.id));
      if (mir.status === 'accepted' && !existingGrn) {
        const response = await request(storekeeper, `/api/procurement/mir/${mir.id}/grn`, { method: 'POST', body: {} });
        if (response.status !== 201 || !response.body?.data) throw new Error(`Demo create GRN: HTTP ${response.status}`);
        bump('grns');
      }
    }
  }
  let supplierReturn = null;
  const returnPlan = receiptPlans[0];
  const returnWorkspacePath = `/api/procurement/project/${returnPlan.po.project_id}?limit=200`;
  const returnWorkspace = await request(owner, returnWorkspacePath);
  if (returnWorkspace.status !== 200) throw new Error(`Demo list ${returnWorkspacePath}: HTTP ${returnWorkspace.status}`);
  const acceptedMir = (returnWorkspace.body?.data?.material_inspection_requests || []).find(row =>
    Number(row.purchase_order_id) === Number(returnPlan.po.id) && row.status === 'accepted');
  const returnGrn = acceptedMir && (returnWorkspace.body?.data?.goods_receipt_notes || []).find(row => Number(row.mir_id) === Number(acceptedMir.id));
  if (!returnGrn) throw new Error('Demo return source GRN not found for the accepted partial delivery');
  const returnMaterial = materials.find(row => Number(row.id) === Number(returnPlan.po.material_id));
  const movementPath = `/api/warehouses/${returnGrn.warehouse_id}/movements?movement_type=supplier_return&material_id=${returnMaterial.id}&limit=200`;
  const movementRows = rows(await request(storekeeper, movementPath), movementPath);
  if (!movementRows.some(row => row.reference_type === 'supplier_return')) {
    const response = await request(storekeeper, `/api/procurement/grn/${returnGrn.id}/returns`, { method: 'POST', body: {
      reason: 'Fictional demo return after inspection; damaged portion returned to supplier.',
      lines: [{ material_id: returnMaterial.id, quantity: 5, notes: 'DEMO-RETURN-PO-001' }],
    } });
    if (response.status !== 201 || !response.body?.data) throw new Error(`Demo create supplier return: HTTP ${response.status}`);
    supplierReturn = response.body.data; bump('supplier_returns');
  }
  return { created: Object.values(counts).reduce((sum, count) => sum + count, 0), counts,
    records: { purchase_requests: prRows.map(row => row.request_number), rfqs: rfqRows.map(row => row.rfq_number), purchase_orders: poRows.map(row => row.order_number), deliveries: delivered.map(row => row.delivery.delivery_number), mirs: delivered.map(row => row.mir.mir_number), supplier_return: supplierReturn?.return_number || null } };
}

module.exports = { TARGET, ensureDocument, seedProcurement };
