'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '..', '.env.docker') });
const fs = require('fs');
const { execFileSync } = require('child_process');
const { Pool } = require('pg');
const tokens = require('../services/tokens');
const { assertSafeTarget, CANONICAL_ROLES } = require('./seed-staging');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const backendRoot = path.resolve(repoRoot, 'backend');
const credentialsPath = path.join(repoRoot, '.staging-users.json');
const PROJECT_CODE = 'PILOT-PTP-001';
const OTHER_PROJECT_CODE = 'PILOT-CROSS-SCOPE';

function baseUrlFromArgs(argv = process.argv.slice(2)) {
  const arg = argv.find((value) => value.startsWith('--base-url='));
  const value = arg ? arg.slice('--base-url='.length) : (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:8090');
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Refusing smoke target: --base-url must be a localhost HTTP address');
  }
  return url.origin;
}

function assertSmokeEnvironment(env = process.env) {
  assertSafeTarget(env);
  if (!fs.existsSync(credentialsPath)) throw new Error('Missing ignored .staging-users.json; run the guarded staging seed first');
}

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  assertSmokeEnvironment();
  const base = baseUrlFromArgs();
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  const byKey = new Map(credentials.accounts.map((account) => [account.key, account]));
  for (const role of CANONICAL_ROLES) ensure(byKey.has(role), `Missing seeded account for role ${role}`);
  for (const key of ['workflow_owner', 'workflow_checker', 'workflow_budget', 'unassigned', 'expired_assignment']) {
    ensure(byKey.has(key), `Missing seeded smoke account ${key}`);
  }

  const pool = new Pool({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT), database: process.env.DB_NAME,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, connectionTimeoutMillis: 5000,
  });
  const one = async (sql, params = []) => (await pool.query(sql, params)).rows[0];
  const all = async (sql, params = []) => (await pool.query(sql, params)).rows;
  let checkerToken;
  const api = async (method, route, { token = null, body, language = 'en', form = null } = {}) => {
    const headers = { 'Accept-Language': language, Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (!form) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${base}${route}`, {
      method, headers, body: form || (body === undefined ? undefined : JSON.stringify(body)),
    });
    let json = null;
    try { json = await response.json(); } catch (_) { /* file content or empty response */ }
    return { status: response.status, headers: response.headers, body: json, response };
  };
  const expectStatus = (result, expected, label) => {
    ensure(result.status === expected,
      `${label}: expected HTTP ${expected}, received ${result.status}${result.body ? ` (${JSON.stringify(result.body)})` : ''}`);
    return result;
  };
  const call = async (method, route, token, body, expected = 200, label = `${method} ${route}`) =>
    expectStatus(await api(method, route, { token, body }), expected, label).body;
  const login = async (account) => {
    const result = expectStatus(await api('POST', '/api/auth/login', {
      body: { email: account.email, password: account.password },
    }), 200, `login ${account.key}`);
    ensure(result.body && result.body.data && result.body.data.token, `login ${account.key}: token missing`);
    return result.body.data;
  };

  try {
    const health = expectStatus(await api('GET', '/api/health'), 200, 'health');
    ensure(health.body.status === 'ready' && health.body.database.status === 'healthy', 'health: DB is not ready');
    console.log('[PASS] health: API ready and database healthy');

    const authenticated = new Map();
    for (const role of CANONICAL_ROLES) authenticated.set(role, await login(byKey.get(role)));
    for (const key of ['workflow_owner', 'workflow_checker', 'workflow_budget', 'unassigned', 'expired_assignment']) {
      authenticated.set(key, await login(byKey.get(key)));
    }
    console.log(`[PASS] login: ${CANONICAL_ROLES.length} canonical roles and 5 staging edge/workflow accounts`);

    const requester = authenticated.get('procurement_officer');
    const checker = authenticated.get('workflow_checker');
    const owner = authenticated.get('workflow_owner');
    const budgetApprover = authenticated.get('workflow_budget');
    const finance = authenticated.get('finance_manager');
    const procurementManager = authenticated.get('procurement_manager');
    const storekeeper = authenticated.get('storekeeper');
    checkerToken = checker.token;
    const project = await one('SELECT id, name_en, name_ar, budget FROM projects WHERE code = $1', [PROJECT_CODE]);
    const supplierRows = await all("SELECT id, code FROM suppliers WHERE code LIKE 'PILOT-SUPPLIER-%' ORDER BY code");
    const material = await one("SELECT id, code, unit FROM item_master WHERE code = 'PILOT-MAT-CEMENT'");
    const warehouse = await one('SELECT id FROM warehouses WHERE project_id = $1 AND name = $2', [project.id, 'Pilot Site Warehouse']);
    ensure(project && supplierRows.length >= 2 && material && warehouse, 'pilot project, two suppliers, material, or warehouse missing');

    const otherProject = await one(
      `INSERT INTO projects (name, name_en, name_ar, code, status, budget, contract_value)
       VALUES ('Cross scope smoke project', 'Cross Scope Smoke', 'مشروع اختبار النطاق', $1, 'active', 77777, 90000)
       ON CONFLICT (code) DO NOTHING RETURNING id`, [OTHER_PROJECT_CODE]);
    const otherProjectRow = otherProject || await one('SELECT id FROM projects WHERE code = $1', [OTHER_PROJECT_CODE]);
    const crossUserRow = await one(
      `INSERT INTO users (name, email, password, role, is_active, token_version)
       VALUES ('Pilot Cross Scope', 'pilot-cross-scope@pilot.example.com', 'disabled-password', 'procurement_officer', true, 0)
       ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, is_active = true,
         token_version = users.token_version + 1, updated_at = NOW()
       RETURNING id, token_version, name, role`);
    await pool.query('DELETE FROM user_project_roles WHERE user_id = $1', [crossUserRow.id]);
    await pool.query(
      `INSERT INTO user_project_roles (user_id, project_id, role_id)
       SELECT $1, $2, id FROM roles WHERE key = 'procurement_officer'`, [crossUserRow.id, otherProjectRow.id]);
    const crossToken = tokens.signSession({ userId: crossUserRow.id, tokenVersion: crossUserRow.token_version });
    const otherProjectSnapshot = await one('SELECT status, budget, contract_value, updated_at FROM projects WHERE id = $1', [otherProjectRow.id]);

    const unassigned = authenticated.get('unassigned');
    expectStatus(await api('GET', `/api/projects/${project.id}`, { token: unassigned.token }), 403, 'unassigned access denied');
    const expired = authenticated.get('expired_assignment');
    expectStatus(await api('GET', `/api/projects/${project.id}`, { token: expired.token }), 403, 'expired assignment denied');
    console.log('[PASS] RBAC: no-assignment and expired-seat users receive 403; cross-project actor is scoped to its own project');

    // Both language headers return the same bilingual project registers for the locale-aware client.
    const projectEn = expectStatus(await api('GET', `/api/projects/${project.id}`, { token: owner.token, language: 'en' }), 200, 'English project read');
    const projectAr = expectStatus(await api('GET', `/api/projects/${project.id}`, { token: owner.token, language: 'ar' }), 200, 'Arabic project read');
    const bilingual = (payload) => payload.body && payload.body.data
      && Boolean(payload.body.data.name_en) && Boolean(payload.body.data.name_ar);
    ensure(bilingual(projectEn) && bilingual(projectAr), 'EN/AR project fields were not returned for both Accept-Language values');
    console.log('[PASS] EN/AR: Accept-Language en/ar requests both include bilingual project names');

    // Maker creates and submits a requisition. The budget/checker/authority stages use distinct actors.
    const quantity = 10;
    const priceA = Number((await one('SELECT unit_price FROM supplier_materials WHERE supplier_id = $1 AND material_id = $2', [supplierRows[0].id, material.id])).unit_price);
    const pr = (await api('POST', '/api/procurement/pr', {
      token: requester.token, body: { title: `Pilot smoke ${Date.now()}`, project_id: project.id,
        lines: [{ material_id: material.id, quantity, estimated_unit_price: priceA }] },
    })).body;
    ensure(pr && pr.data && pr.data.id, 'purchase requisition create failed');
    const prId = pr.data.id;
    expectStatus(await api('POST', `/api/procurement/pr/${prId}/submit`, { token: requester.token, body: {} }), 200, 'submit PR');
    for (let i = 0; i < 5; i += 1) {
      const state = await one(
        `SELECT wi.current_step_key, wi.status FROM workflow_instances wi
         JOIN purchase_requests pr ON pr.workflow_instance_id = wi.id WHERE pr.id = $1`, [prId]);
      const currentPr = await one('SELECT status FROM purchase_requests WHERE id = $1', [prId]);
      if (currentPr.status === 'procurement') break;
      const actor = state.current_step_key === 'budget_check' ? budgetApprover
        : state.current_step_key === 'authority_approval' || state.current_step_key === 'procurement' ? checker : owner;
      expectStatus(await api('POST', `/api/procurement/pr/${prId}/decide`, {
        token: actor.token, body: { decision: 'approve', comment: 'staging pilot approval' },
      }), 200, `approve PR step ${state.current_step_key}`);
    }
    ensure((await one('SELECT status FROM purchase_requests WHERE id = $1', [prId])).status === 'procurement', 'PR did not reach procurement approval state');

    // RFQ, two fictional supplier quotations, commercial comparison, then maker/checker award approval.
    const rfq = (await api('POST', '/api/procurement/rfq', {
      token: requester.token,
      body: { purchase_request_id: prId, project_id: project.id, title: `Pilot RFQ ${Date.now()}`,
        lines: [{ material_id: material.id, quantity, unit: material.unit }] },
    })).body.data;
    ensure(rfq && rfq.id, 'RFQ create failed');
    expectStatus(await api('POST', `/api/procurement/rfq/${rfq.id}/vendors`, {
      token: requester.token, body: { supplier_ids: supplierRows.map((row) => row.id) },
    }), 201, 'invite RFQ suppliers');
    const rfqLine = await one('SELECT id FROM rfq_lines WHERE rfq_id = $1 ORDER BY id LIMIT 1', [rfq.id]);
    const quotations = [];
    for (const supplier of supplierRows) {
      const rate = Number((await one('SELECT unit_price FROM supplier_materials WHERE supplier_id = $1 AND material_id = $2', [supplier.id, material.id])).unit_price);
      const quote = expectStatus(await api('POST', `/api/procurement/rfq/${rfq.id}/quotations`, {
        token: requester.token,
        body: { supplier_id: supplier.id, lines: [{ rfq_line_id: rfqLine.id, material_id: material.id, quantity, unit_price: rate, delivery_days: 5 }],
          compliant: true, payment_terms: 'net 30' },
      }), 201, `quote ${supplier.code}`);
      quotations.push({ id: quote.body.data.id, supplierId: supplier.id, rate });
    }
    const comparison = expectStatus(await api('GET', `/api/procurement/rfq/${rfq.id}/comparison`, { token: checker.token }), 200, 'RFQ comparison');
    ensure(comparison.body && comparison.body.data, 'comparison payload missing');
    expectStatus(await api('GET', `/api/procurement/rfq/${rfq.id}/comparison`, { token: crossToken }), 403, 'cross-project RFQ comparison denied');
    // The configured comparison awards the lower priced compliant quote.
    const selected = quotations.slice().sort((a, b) => a.rate - b.rate)[0];
    const recommendation = expectStatus(await api('POST', `/api/procurement/rfq/${rfq.id}/award-recommendations`, {
      token: requester.token,
      body: { quotation_id: selected.id, basis: 'comparison', justification: 'Lowest compliant fictional pilot quote after comparison.' },
    }), 201, 'create award recommendation').body.data;
    expectStatus(await api('POST', `/api/procurement/award-recommendations/${recommendation.id}/submit`, { token: requester.token, body: {} }), 200, 'submit award recommendation');
    expectStatus(await api('POST', `/api/procurement/award-recommendations/${recommendation.id}/decide`, {
      token: checker.token, body: { decision: 'approve', comment: 'procurement review complete' },
    }), 200, 'checker procurement review');
    expectStatus(await api('POST', `/api/procurement/award-recommendations/${recommendation.id}/decide`, {
      token: owner.token, body: { decision: 'approve', comment: 'authority approval complete' },
    }), 200, 'owner authority approval');
    const crossRfq = expectStatus(await api('GET', `/api/procurement/rfq/${rfq.id}`, { token: crossToken }), 403, 'cross-project RFQ denied');
    void crossRfq;
    console.log('[PASS] P2P: PR → RFQ → 2 quotations → comparison → award recommendation → separate checker/authority approval');

    // Approved award drives a PO. Keep an intentional partial delivery so the receipt state is meaningful.
    const po = expectStatus(await api('POST', '/api/procurement/po', {
      token: owner.token,
      body: { supplier_id: selected.supplierId, purchase_request_id: prId, project_id: project.id,
        lines: [{ material_id: material.id, quantity, unit: material.unit, unit_rate: selected.rate }] },
    }), 201, 'create PO').body.data;
    expectStatus(await api('POST', `/api/procurement/po/${po.id}/issue`, { token: owner.token, body: {} }), 200, 'start PO approval');
    for (let i = 0; i < 8; i += 1) {
      const state = await one('SELECT workflow_instance_id FROM purchase_orders WHERE id = $1', [po.id]);
      const workflow = await one('SELECT current_step_key, status FROM workflow_instances WHERE id = $1', [state.workflow_instance_id]);
      const poStatus = (await one('SELECT status FROM purchase_orders WHERE id = $1', [po.id])).status;
      if (poStatus === 'issued') break;
      expectStatus(await api('POST', `/api/procurement/po/${po.id}/decide`, {
        token: owner.token, body: { decision: 'approve', comment: 'pilot PO approval' },
      }), 200, `approve PO step ${workflow.current_step_key}`);
    }
    ensure((await one('SELECT status FROM purchase_orders WHERE id = $1', [po.id])).status === 'issued', 'PO did not reach issued state');
    const poLine = await one('SELECT id FROM purchase_order_lines WHERE purchase_order_id = $1 ORDER BY id LIMIT 1', [po.id]);
    const delivered = 6;
    const delivery = expectStatus(await api('POST', '/api/procurement/deliveries', {
      token: storekeeper.token,
      body: { purchase_order_id: po.id, warehouse_id: warehouse.id,
        lines: [{ purchase_order_line_id: poLine.id, quantity: delivered, lot_number: `PILOT-${Date.now()}` }] },
    }), 201, 'record partial delivery').body.data;
    const mir = expectStatus(await api('POST', `/api/procurement/deliveries/${delivery.id}/mir`, { token: storekeeper.token, body: {} }), 201, 'create MIR').body.data;
    expectStatus(await api('POST', `/api/procurement/mir/${mir.id}/decide`, {
      token: procurementManager.token, body: { decision: 'accept', notes: 'pilot sample inspected' },
    }), 200, 'accept MIR');
    const grn = expectStatus(await api('POST', `/api/procurement/mir/${mir.id}/grn`, { token: storekeeper.token, body: {} }), 201, 'post GRN').body.data;
    const partialStatus = (await one('SELECT status FROM purchase_orders WHERE id = $1', [po.id])).status;
    ensure(partialStatus === 'partially_delivered' || partialStatus === 'partially_fully_delivered', `unexpected partial receipt PO status ${partialStatus}`);

    const invoiceNumber = `PILOT-SMOKE-${Date.now()}`;
    const invoiceAmount = Math.round(delivered * selected.rate * 100) / 100;
    const invoiceResult = expectStatus(await api('POST', '/api/procurement/invoices', {
      token: finance.token,
      body: { supplier_id: selected.supplierId, purchase_order_id: po.id, invoice_number: invoiceNumber,
        total_amount: invoiceAmount, tax_amount: 0,
        lines: [{ purchase_order_line_id: poLine.id, material_id: material.id, quantity: delivered, unit_price: selected.rate }] },
    }), 201, 'record supplier invoice').body.data;
    const invoice = invoiceResult.invoice || invoiceResult;
    const invoiceRegister = expectStatus(await api('GET', `/api/procurement/invoices?project_id=${project.id}`, { token: requester.token }), 200, 'read project supplier invoice register').body.data;
    ensure(invoiceRegister.some((row) => Number(row.id) === Number(invoice.id)), 'supplier invoice register did not return the new project invoice');
    expectStatus(await api('GET', `/api/procurement/invoices?project_id=${otherProjectRow.id}`, { token: requester.token }), 403, 'deny supplier invoice register outside project scope');
    const invoiceApproval = expectStatus(await api('POST', `/api/procurement/invoices/${invoice.id}/approve`, {
      token: procurementManager.token, body: {},
    }), 200, 'approve three-way matched invoice');
    const payment = expectStatus(await api('POST', '/api/payments', {
      token: finance.token,
      body: { direction: 'ap', supplier_id: selected.supplierId, project_id: project.id,
        amount: invoiceAmount, payment_date: new Date().toISOString().slice(0, 10), payment_method: 'bank_transfer' },
    }), 201, 'record AP payment').body.data;
    expectStatus(await api('POST', `/api/finance-ledger/payments/${payment.id}/allocate`, {
      token: finance.token,
      body: { allocations: [{ target_type: 'supplier_invoice', supplier_invoice_id: invoice.id, amount: invoiceAmount }] },
    }), 201, 'allocate payment');
    const paidInvoice = await one('SELECT status FROM supplier_invoices WHERE id = $1', [invoice.id]);
    ensure(paidInvoice.status === 'paid', 'allocated supplier invoice is not paid');
    console.log('[PASS] P2P: approved PO → partial delivery → MIR/GRN → matched supplier invoice → payment allocation');

    // Upload a tiny PDF, register it against the pilot project, then prove an actor assigned only elsewhere cannot read it.
    const pdfBytes = Buffer.from('%PDF-1.4\n% local staging smoke file\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n');
    const form = new FormData();
    form.append('files', new Blob([pdfBytes], { type: 'application/pdf' }), 'pilot-smoke.pdf');
    const upload = expectStatus(await api('POST', '/api/documents/upload', { token: owner.token, form }), 201, 'upload scoped file');
    const fileUrl = upload.body.data[0].file_url;
    const fileName = path.basename(fileUrl);
    const uploadRecord = await one('SELECT uploaded_by FROM uploaded_files WHERE file_name = $1', [fileName]);
    await pool.query(
      `INSERT INTO project_documents (project_id, title, discipline, doc_type, file_url, file_type,
         file_size_bytes, version, status, uploaded_by, portal_visibility)
       VALUES ($1, 'Pilot smoke attachment', 'general', 'document', $2, 'pdf', $3, 1, 'approved', $4, 'internal')`,
      [project.id, fileUrl, pdfBytes.length, owner.user.id]);
    ensure(Number(uploadRecord.uploaded_by) === Number(owner.user.id), 'uploaded file owner did not persist');
    expectStatus(await api('GET', fileUrl, { token: owner.token }), 200, 'uploader reads scoped file');
    expectStatus(await api('GET', fileUrl, { token: crossToken }), 404, 'other-project user denied scoped file');
    expectStatus(await api('GET', fileUrl, { token: authenticated.get('unassigned').token }), 404, 'unassigned user denied scoped file');
    console.log('[PASS] media: uploaded PDF is readable by its uploader and denied outside project scope');

    // Restrict the cross-scope assertion to the project row; the P2P flow must leave it unchanged.
    const afterOtherProject = await one('SELECT status, budget, contract_value, updated_at FROM projects WHERE id = $1', [otherProjectRow.id]);
    ensure(JSON.stringify(afterOtherProject) === JSON.stringify(otherProjectSnapshot), 'out-of-scope project row changed during the pilot chain');
    const unbalanced = await all(
      `SELECT e.id FROM journal_entries e JOIN journal_entry_lines l ON l.journal_entry_id = e.id
       WHERE (e.reference_type, e.reference_id) IN (SELECT * FROM unnest($1::text[], $2::int[]))
       GROUP BY e.id HAVING SUM(l.debit) <> SUM(l.credit)`,
      [['grn_cost', 'supplier_invoice_cost', 'supplier_payment'], [grn.id, invoice.id, payment.id]]);
    ensure(unbalanced.length === 0, `pilot chain has ${unbalanced.length} unbalanced journal entries`);
    const bilingualCost = await one('SELECT total_cost FROM v_project_cost_totals WHERE project_id = $1', [project.id]);
    ensure(Number(bilingualCost.total_cost) >= invoiceAmount, 'project cost view did not reflect the GRN');
    console.log(`[PASS] reconcile: ${unbalanced.length} unbalanced chain entries; out-of-scope project unchanged; project cost view updated`);

    // Reconcile the database projections and integrity checks after the flow.
    const output = execFileSync(process.execPath, ['src/scripts/reconcile-database.js'], {
      cwd: backendRoot, env: { ...process.env, DOTENV_CONFIG_PATH: path.join(repoRoot, '.env.docker') }, encoding: 'utf8',
    });
    ensure(!/\b(failed|violations?: [1-9]\d*)\b/i.test(output), 'reconcile command reported a failure or nonzero violations');
    console.log('[PASS] npm run reconcile');

    expectStatus(await api('POST', '/api/auth/logout-all', { token: checkerToken, body: {} }), 200, 'logout/revoke checker sessions');
    expectStatus(await api('GET', '/api/auth/me', { token: checkerToken }), 401, 'revoked checker token rejected');
    console.log('[PASS] logout: checker token revoked and rejected');
    console.log(`STAGING_SMOKE_OK base=${base} project=${PROJECT_CODE} pr=${prId} rfq=${rfq.id} po=${po.id} grn=${grn.id} invoice=${invoice.id} payment=${payment.id}`);
  } finally {
    await pool.end();
  }
}

if (require.main === module) main().catch((error) => {
  console.error(`Staging smoke failed: ${error.message}`);
  process.exitCode = 1;
});

module.exports = { baseUrlFromArgs, assertSmokeEnvironment, main };
