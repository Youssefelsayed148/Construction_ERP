'use strict';

const { assertDemoTarget } = require('./company-demo-common');
const TARGET = Object.freeze({ projectName: 'erp-demo-20261017', baseUrl: 'http://127.0.0.1:8092',
  dbName: 'construction_erp_demo', dbHost: '127.0.0.1', dbPort: '55442' });

function listRows(response, route) {
  if (response.status !== 200 || !Array.isArray(response.body?.data)) throw new Error(`Demo list ${route}: HTTP ${response.status}`);
  return response.body.data;
}

async function ensureFinanceRecord({ request, account, listPath, createPath, key, keyField, body, match }) {
  if (typeof request !== 'function' || !account || !listPath || !createPath || !key || !keyField || body?.[keyField] !== key) {
    throw new Error('Refusing demo: invalid finance stable key');
  }
  const rows = listRows(await request(account, listPath), listPath);
  const found = rows.filter(row => match ? match(row) : row?.[keyField] === key);
  if (found.length > 1) throw new Error('Refusing demo: ambiguous finance stable key');
  if (found.length === 1) return { row: found[0], created: false };
  const response = await request(account, createPath, { method: 'POST', body });
  if (response.status !== 201 || !response.body?.data) throw new Error(`Demo create ${createPath}: HTTP ${response.status}`);
  return { row: response.body.data, created: true };
}

async function seedFinance({ target, request, accounts, projects, clients, suppliers, purchaseOrders, materials }) {
  assertDemoTarget(target);
  const account = key => {
    const row = accounts.find(item => item.key === key);
    if (!row) throw new Error(`Refusing demo: missing role account ${key}`);
    return row;
  };
  const owner = account('workflow_owner');
  const ar = account('accountant_ar');
  const ap = account('accountant_ap');
  const procurementMaker = account('procurement_officer');
  const procurementChecker = account('procurement_manager');
  const orderedProjects = projects.slice().sort((a, b) => a.code.localeCompare(b.code));
  const orderedClients = clients.slice().sort((a, b) => a.code.localeCompare(b.code));
  const demoSuppliers = suppliers.slice().sort((a, b) => a.code.localeCompare(b.code));
  if (orderedProjects.length !== 3 || orderedClients.length !== 3 || !demoSuppliers.length) throw new Error('Refusing demo: finance masters are incomplete');
  const created = {};
  const bump = key => { created[key] = (created[key] || 0) + 1; };
  const invoicePlans = [
    { key: 'PAID', project: orderedProjects[0], client: orderedClients[0], amount: 100000, due: '2026-08-01', paid: 100000 },
    { key: 'PARTIAL', project: orderedProjects[1], client: orderedClients[1], amount: 200000, due: '2026-12-15', paid: 50000 },
    { key: 'UNPAID', project: orderedProjects[2], client: orderedClients[2], amount: 80000, due: '2026-12-15', paid: 0 },
    { key: 'OVERDUE', project: orderedProjects[0], client: orderedClients[0], amount: 40000, due: '2026-09-01', paid: 0 },
  ];
  const invoices = [];
  for (const plan of invoicePlans) {
    const description = `DEMO-AR-${plan.key}-001`;
    const body = { project_id: plan.project.id, client_id: plan.client.id, amount: plan.amount,
      issue_date: '2026-02-15', due_date: plan.due, description };
    const result = await ensureFinanceRecord({ request, account: owner,
      listPath: `/api/invoices?project_id=${plan.project.id}&limit=200`, createPath: '/api/invoices',
      key: description, keyField: 'description', body });
    if (result.created) bump('client_invoices');
    invoices.push({ ...result.row, ...plan, description });
  }
  for (const invoice of invoices.filter(row => row.paid > 0)) {
    const reference = `DEMO-AR-RCPT-${invoice.key}-001`;
    const result = await ensureFinanceRecord({ request, account: ar,
      listPath: `/api/payments?project_id=${invoice.project.id}&limit=200`, createPath: '/api/payments',
      key: reference, keyField: 'reference_number',
      match: row => row.direction === 'ar' && row.reference_number === reference,
      body: { direction: 'ar', project_id: invoice.project.id, client_id: invoice.client.id, invoice_id: invoice.id,
        amount: invoice.paid, payment_date: '2026-08-15', payment_method: 'bank_transfer', reference_number: reference,
        notes: 'Fictional demo client receipt.' } });
    if (result.created) bump('client_receipts');
  }

  const po = purchaseOrders.find(row => row.status === 'partially_delivered');
  if (!po) throw new Error('Refusing demo: no partially delivered PO for supplier invoice');
  const details = await request(procurementMaker, `/api/procurement/po/${po.id}`);
  if (details.status !== 200 || !details.body?.data?.lines?.[0]) throw new Error(`Demo list /api/procurement/po/${po.id}: HTTP ${details.status}`);
  const poLine = details.body.data.lines[0];
  const supplier = demoSuppliers.find(row => Number(row.id) === Number(po.supplier_id)) || demoSuppliers[0];
  const invoicePath = `/api/procurement/invoices?project_id=${po.project_id}`;
  const supplierInvoiceNumber = 'DEMO-AP-001';
  const supplierInvoiceBody = { supplier_id: supplier.id, purchase_order_id: po.id,
    invoice_number: supplierInvoiceNumber, invoice_date: '2026-08-20', total_amount: Number(poLine.unit_rate) * 40,
    tax_amount: 0, vat_recoverable: true, lines: [{ purchase_order_line_id: poLine.id, material_id: poLine.material_id,
      quantity: 40, unit_price: Number(poLine.unit_rate) }] };
  const supplierInvoice = await ensureFinanceRecord({ request, account: procurementMaker, listPath: invoicePath,
    createPath: '/api/procurement/invoices', key: supplierInvoiceNumber, keyField: 'invoice_number', body: supplierInvoiceBody });
  if (supplierInvoice.created) bump('supplier_invoices');
  let apInvoice = supplierInvoice.row.invoice || supplierInvoice.row;
  if (apInvoice.status !== 'approved' && apInvoice.status !== 'paid') {
    const approved = await request(procurementChecker, `/api/procurement/invoices/${apInvoice.id}/approve`, { method: 'POST', body: {} });
    if (approved.status < 200 || approved.status >= 300) throw new Error(`Demo approve /api/procurement/invoices/${apInvoice.id}: HTTP ${approved.status}`);
    apInvoice = approved.body?.data?.invoice || approved.body?.data || apInvoice;
    bump('supplier_invoice_approvals');
  }
  const apReference = 'DEMO-AP-PAY-001';
  const apPayment = await ensureFinanceRecord({ request, account: ap,
    listPath: `/api/payments?project_id=${po.project_id}&limit=200`, createPath: '/api/payments',
    key: apReference, keyField: 'reference_number', match: row => row.direction === 'ap' && row.reference_number === apReference,
    body: { direction: 'ap', project_id: po.project_id, supplier_id: supplier.id, amount: Number(apInvoice.total_amount || supplierInvoiceBody.total_amount),
      payment_date: '2026-08-25', payment_method: 'bank_transfer', reference_number: apReference,
      notes: 'Fictional demo supplier payment; separate from client receipts.' } });
  if (apPayment.created) bump('supplier_payments');
  return { stage: 'finance', created: Object.values(created).reduce((sum, value) => sum + value, 0), counts: created,
    documents: { clientInvoices: invoices.map(row => row.description), supplierInvoice: supplierInvoiceNumber,
      clientReceipts: invoices.filter(row => row.paid > 0).map(row => `DEMO-AR-RCPT-${row.key}-001`), supplierPayment: apReference } };
}

module.exports = { TARGET, ensureFinanceRecord, seedFinance };
