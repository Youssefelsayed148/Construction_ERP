// Review harness: copies schema (or --with-data) into a unique disposable PostgreSQL database.
// Does not migrate or write the configured ERP database. Requires CREATEDB and PG tools.
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');
const { execFileSync } = require('child_process');
const path = require('path');
const cfg = {
  host: process.env.DB_HOST || 'localhost', port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres', password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'construction_erp',
};
const bin = process.env.PG_REVIEW_BIN || 'C:/Program Files/PostgreSQL/18/bin';
const includeData = process.argv.includes('--with-data');
const base = new Pool(cfg);
const name = 'erp_review_0918_' + Date.now();
let scratch, created = false;
const results = [];
function record(check, result, detail) {
  results.push({ check, result, detail });
  console.log(JSON.stringify(results[results.length - 1]));
}
async function run() {
  try {
    const args = ['-h', cfg.host, '-p', String(cfg.port), '-U', cfg.user];
    const env = { ...process.env, PGPASSWORD: cfg.password };
    const dump = execFileSync(path.join(bin, 'pg_dump.exe'),
      [...(includeData ? [] : ['--schema-only']), '--no-owner', '--no-privileges', ...args, cfg.database],
      { env, maxBuffer: 200 * 1024 * 1024 });
    await base.query('CREATE DATABASE ' + name);
    created = true;
    scratch = new Pool({ ...cfg, database: name });
    execFileSync(path.join(bin, 'psql.exe'),
      ['-X', '-v', 'ON_ERROR_STOP=1', ...args, '-d', name],
      { env, input: dump, stdio: ['pipe', 'ignore', 'pipe'] });
    const q = (sql, params) => scratch.query(sql, params);
    const steps = [
      [9, 'material-planning-migration', ['ensurePlanningColumns', 'ensureTables', 'seedStandardRecipes', 'purgeOrphanRequirements']],
      [10, 'inventory-migration', ['ensureTables', 'backfillOpeningMovements', 'rebuildProjection', 'createImmutabilityGuard']],
      [11, 'replenishment-migration', ['ensureTables', 'seedDefaultPolicy']],
      [12, 'procurement-migration', ['ensureTables']],
      [13, 'commercial-migration', ['ensureTables', 'legacySnapshots', 'createTransitionView']],
      [14, 'finance-migration', ['ensureTables', 'ensureAuditCompat']],
      [15, 'site-migration', ['ensureTables']],
      [16, 'consultant-migration', ['ensureTables', 'widenObservationTemplate']],
      [18, 'portal-migration', ['ensureTables']],
    ];
    for (let pass = 1; pass <= 2; pass++) {
      for (const [phase, file, fns] of steps) {
        try {
          for (const fn of fns) await require('./' + file)[fn](q);
          if (phase === 14) {
            await require('../services/financeEngine').ensureTaxCodes(q);
            await require('../services/financeEngine').syncApReviewQueue(q);
          }
          record(`Phase ${phase} migration pass ${pass}`, 'PASS');
        } catch (e) { record(`Phase ${phase} migration pass ${pass}`, 'FAIL', e.message); }
      }
    }
    for (const sql of [
      'SELECT id,name,name_en,status,completion_percentage FROM projects LIMIT 0',
      'SELECT total_price FROM supplier_quotations LIMIT 0',
    ]) {
      try { await q(sql); record(sql, 'PASS'); }
      catch (e) { record(sql, 'FAIL', e.message); }
    }
    await reproduce(q);
  } finally {
    if (scratch) await scratch.end();
    if (created) { await base.query('DROP DATABASE ' + name); console.log('Disposable database removed'); }
    await base.end();
    await require('../config/database').pool.end();
  }
}

async function reproduce(q) {
  // Each case uses only synthetic data in the disposable database.
  async function check(label, fn) {
    try { await fn(); } catch (e) { record(label, 'ERROR', e.message); }
  }
  for (const [label, fn] of [
    ['Replenishment scheduler invocation', async () => {
      await require('../services/replenishment').runReplenishmentSweep(q, { notify: false });
      record('Replenishment scheduler invocation', 'PASS');
    }],
    ['Receivable scheduler invocation', async () => {
      await require('../services/financeEngine').runReceivableReminderSweep(q);
      record('Receivable scheduler invocation', 'PASS');
    }],
  ]) await check(label, fn);
  const insert = async (table, data) => (await q(
    `INSERT INTO ${table} (${Object.keys(data).join(',')}) VALUES (${Object.keys(data).map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`,
    Object.values(data))).rows[0];
  const user = await insert('users', { name: 'Review User', email: 'review@example.invalid', password: 'not-a-login', role: 'owner' });
  const clientParty = await insert('clients', { name_ar: 'Review client' });
  const invoiceBase = { client_id: clientParty.id, issue_date: '2026-09-18' };
  const project = await insert('projects', { name: 'Review A', code: 'REVIEW-A', contract_value: 10000, budget: 5000 });
  const other = await insert('projects', { name: 'Review B', code: 'REVIEW-B' });
  const warehouse = await insert('warehouses', { name: 'Review warehouse' });
  const material = (await q('SELECT id FROM item_master ORDER BY id LIMIT 1')).rows[0];
  const inv = require('../services/inventoryEngine');
  const svc = require('../services/procurementService');
  const finance = require('../services/financeEngine');
  await check('MIR reject must not release stock', async () => {
    await inv.createMovement(q, { warehouse_id: warehouse.id, material_id: material.id, movement_type: 'quarantine', quantity: 10 });
    const mir = await insert('material_inspection_requests', { mir_number: 'REVIEW-MIR', warehouse_id: warehouse.id, status: 'pending' });
    await insert('mir_lines', { mir_id: mir.id, material_id: material.id, quantity: 10 });
    const result = await svc.decideMir(q, mir.id, user, 'reject');
    record('MIR reject must not release stock', result.status === 'rejected' ? 'PASS' : 'FAIL', { status: result.status, balance: await inv.getBalances(q, warehouse.id, material.id) });
  });
  await check('Three valuations must total 300', async () => {
    const totals = [];
    for (let i = 0; i < 3; i++) totals.push((await finance.createClientValuation(q, { project_id: project.id, client_id: clientParty.id, gross_current_work: 100 })).cumulative_certified);
    record('Three valuations must total 300', Number(totals[2]) === 300 ? 'PASS' : 'FAIL', totals);
  });
  // Check the INSERT arithmetic independently while all reads use PostgreSQL.
  await check('Valuation cumulative arithmetic', async () => {
    await insert('invoices', { ...invoiceBase, invoice_number: 'REVIEW-CUM-1', project_id: other.id, amount: 100, cumulative_certified: 100 });
    await insert('invoices', { ...invoiceBase, invoice_number: 'REVIEW-CUM-2', project_id: other.id, amount: 100, cumulative_certified: 200 });
    let cumulative;
    const capture = async (sql, params) => {
      if (/INSERT INTO invoices/.test(sql)) {
        cumulative = params[18];
        return { rows: [{ id: 2147483647, cumulative_certified: cumulative }] };
      }
      return q(sql, params);
    };
    await finance.createClientValuation(capture, { project_id: other.id, client_id: clientParty.id, gross_current_work: 100 });
    record('Valuation cumulative arithmetic (captured INSERT)', cumulative === 300 ? 'PASS' : 'FAIL', { expected: 300, actual: cumulative });
  });
  await check('Payment allocation failure must be atomic', async () => {
    const invoice = await insert('invoices', { ...invoiceBase, invoice_number: 'REVIEW-ALLOC', project_id: project.id, amount: 100, net_amount: 100 });
    const payment = await insert('payments', { client_id: clientParty.id, amount: 200, project_id: project.id, payment_date: '2026-09-18' });
    try { await finance.allocatePayment(q, { payment_id: payment.id, allocations: [{ invoice_id: invoice.id, amount: 50 }, { invoice_id: 2147483647, amount: 50 }] }); }
    catch (e) { record('Payment allocation rejected', 'OBSERVED', e.message); }
    const rows = (await q('SELECT amount FROM payment_allocations WHERE payment_id=$1', [payment.id])).rows;
    record('Payment allocation failure must be atomic', rows.length === 0 ? 'PASS' : 'FAIL', rows);
  });
  await check('Historical payment allocations backfill once', async () => {
    const invoice = await insert('invoices', { ...invoiceBase, invoice_number: 'REVIEW-LEGACY-PAY', project_id: project.id, amount: 100 });
    const payment = await insert('payments', { invoice_id: invoice.id, client_id: clientParty.id, amount: 40, project_id: project.id, payment_date: '2026-09-18' });
    const migration = require('./finance-migration');
    const first = await migration.backfillLegacyPaymentAllocations(q);
    const second = await migration.backfillLegacyPaymentAllocations(q);
    const rows = (await q('SELECT amount FROM payment_allocations WHERE payment_id=$1', [payment.id])).rows;
    record('Historical payment allocations backfill once', first >= 1 && second === 0 && rows.length === 1 && Number(rows[0].amount) === 40 ? 'PASS' : 'FAIL', { inserted: first, from_configured_copy: includeData ? first - 1 : 0, second, rows });
    const violations = (await q(`
      SELECT 'payment' AS kind, p.id FROM payments p JOIN payment_allocations a ON a.payment_id = p.id
      GROUP BY p.id, p.amount HAVING SUM(a.amount) > p.amount
      UNION ALL
      SELECT 'invoice' AS kind, i.id FROM invoices i JOIN payment_allocations a ON a.invoice_id = i.id AND a.target_type = 'client_invoice'
      GROUP BY i.id, i.amount, i.net_amount HAVING SUM(a.amount) > COALESCE(NULLIF(i.net_amount, 0), i.amount)
    `)).rows;
    record('Historical payment allocations reconcile', violations.length === 0 ? 'PASS' : 'FAIL', { violations: violations.length });
  });
  await check('Client project query uses real schema', async () => {
    const org = await insert('organizations', { code: 'REVIEW-CLIENT', name_ar: 'Review client', org_type: 'client' });
    await insert('organization_users', { organization_id: org.id, user_id: user.id });
    await insert('project_participants', { organization_id: org.id, project_id: project.id, participant_type: 'client', portal_access_enabled: true });
    const data = await require('../services/clientEngine').clientDashboard(q, user);
    record('Client project query uses real schema', data.projects.length === 1 ? 'PASS' : 'FAIL', { project_ids: data.project_ids, projects: data.projects, financials: data.financials });
  });
  await check('Subcontract payment application ownership', async () => {
    const sub = await insert('subcontractors', { name: 'Review other subcontractor' });
    const contract = await insert('sub_contracts', { contract_number: 'REVIEW-SC', project_id: other.id, subcontractor_id: sub.id, contract_value: 1000 });
    const result = await require('../services/portalEngine').submitPaymentApplication(q, user.id, { project_id: other.id, sub_contract_id: contract.id, period_from: '2026-09-01', period_to: '2026-09-18', work_value: 100 });
    record('Subcontract payment application ownership', result == null ? 'PASS' : 'FAIL', { created_without_org_assignment: !!result });
  });
  await check('Inventory transaction adapter', async () => {
    const client = await scratch.connect();
    try {
      await inv.getBalances(client.query.bind(client), warehouse.id, material.id);
      record('Inventory transaction adapter', 'PASS');
    }
    finally { client.release(); }
  });
  await check('Reversing quarantine release preserves physical stock', async () => {
    await inv.createMovement(q, { warehouse_id: warehouse.id, material_id: material.id, movement_type: 'quarantine', quantity: 3 });
    const release = await inv.createMovement(q, { warehouse_id: warehouse.id, material_id: material.id, movement_type: 'quarantine_release', quantity: 3 });
    const before = await inv.getBalances(q, warehouse.id, material.id);
    await inv.reverseMovement(q, release.id);
    const after = await inv.getBalances(q, warehouse.id, material.id);
    record('Reversing quarantine release preserves physical stock', after.physical === before.physical ? 'PASS' : 'FAIL', { before, after });
  });
  await check('Expired reservations projection', async () => {
    await insert('stock_reservations', { warehouse_id: warehouse.id, material_id: material.id, quantity: 2, status: 'active', expires_at: '2000-01-01' });
    await inv.rebuildWarehouseStock(q, { warehouseId: warehouse.id, materialId: material.id });
    const live = await inv.getBalances(q, warehouse.id, material.id);
    const projection = (await q('SELECT reserved_quantity,available_quantity FROM warehouse_stock WHERE warehouse_id=$1 AND item_id=$2', [warehouse.id, material.id])).rows[0];
    record('Expired reservations projection', Number(projection.available_quantity) === live.available ? 'PASS' : 'FAIL', { live, projection });
  });
  await check('Site report project isolation', async () => {
    await insert('attendance', { project_id: other.id, date: '2026-09-18', status: 'present' });
    const workspace = await require('../services/siteEngine').getWorkspace(q, project.id, '2026-09-18');
    record('Site report project isolation', workspace.manpower.present === 0 ? 'PASS' : 'FAIL', { other_project_attendance_in_report: workspace.manpower.present });
  });
  await check('Subcontract variations do not inflate client revenue', async () => {
    await insert('variations', { title: 'Subcontract change', variation_number: 'REVIEW-VAR', project_id: project.id, variation_type: 'subcontract', amount: 500, status: 'incorporated' });
    const revenue = (await require('../services/commercialEngine').projectCommercial(q, project.id)).revised_contract_value;
    record('Subcontract variations do not inflate client revenue', revenue === 10000 ? 'PASS' : 'FAIL', { expected: 10000, actual: revenue });
  });
  await check('Material consumption counted once across locations', async () => {
    const boq = await insert('boq_items', { project_id: project.id, code: 'REVIEW-BOQ', description: 'Review concrete', quantity: 200 });
    const recipe = await insert('material_recipes', { project_id: project.id, boq_item_id: boq.id, name: 'Review recipe' });
    await insert('recipe_lines', { recipe_id: recipe.id, material_id: material.id, factor_per_unit: 1, wastage_pct: 0 });
    const work = await insert('work_orders', { project_id: project.id, title: 'Review work' });
    await insert('work_order_materials', { work_order_id: work.id, item_id: material.id, boq_item_id: boq.id, actual_quantity: 20 });
    for (const label of ['A', 'B']) {
      const location = await insert('project_locations', { project_id: project.id, name: label });
      await insert('boq_location_allocations', { boq_item_id: boq.id, project_location_id: location.id, planned_quantity: 100 });
    }
    await require('../services/materialDemand').recomputeBoqItem(q, boq.id);
    const total = Number((await q('SELECT SUM(net_requirement) AS total FROM material_requirements WHERE boq_item_id=$1', [boq.id])).rows[0].total);
    record('Material consumption counted once across locations', total === 180 ? 'PASS' : 'FAIL', { expected: 180, actual: total });
  });
  await check('Seeded portal role permissions', async () => {
    const migration = require('./policy-migration');
    const missing = [];
    for (const [role, module] of [['consultant', 'consultant'], ['client', 'client-portal'], ['subcontractor', 'portal'], ['supplier', 'portal']]) {
      const grants = migration.EXTERNAL_ROLE_MODULE_GRANTS[role];
      if (!grants.includes(module)) missing.push({ role, module });
    }
    record('Seeded portal role permissions', missing.length ? 'FAIL' : 'PASS', missing);
  });
  await check('Consultant record mutation ownership', async () => {
    const observation = await insert('observations', { observation_number: 'REVIEW-OBS', project_id: other.id, title: 'Other project', status: 'submitted_for_verification' });
    try {
      await require('../services/consultantEngine').advanceObservation(q, observation.id, { id: user.id, role: 'subcontractor' }, 'accept');
      record('Consultant record mutation ownership', 'FAIL', 'Unassigned actor accepted an observation');
    } catch (e) {
      if (!/cannot accept|not assigned/i.test(e.message)) throw e;
      record('Consultant record mutation ownership', 'PASS', e.message);
    }
  });
  await check('Ordered RFI and submittal revisions', async () => {
    const engine = require('../services/consultantEngine');
    const rfi = await insert('project_rfis', { rfi_number: 'REVIEW-RFI-ORDER', project_id: project.id, subject: 'Review RFI', status: 'submitted', raised_by: user.id });
    let earlyRejected = false;
    try { await engine.recordRfiResponse(q, { rfi_id: rfi.id, stage: 'official_response', user, body: 'Too early' }); }
    catch (e) { earlyRejected = /cannot follow/.test(e.message); }
    for (const stage of ['coordinator', 'discipline_review', 'official_response', 'acknowledgement']) {
      await engine.recordRfiResponse(q, { rfi_id: rfi.id, stage, user, body: stage });
    }
    const closed = await engine.closeRfi(q, rfi.id, user);
    const submittal = await insert('project_submittals', { submittal_number: 'REVIEW-SUB-ORDER', project_id: project.id, title: 'Review submittal', status: 'submitted' });
    const stages = ['internal_technical_review', 'pm', 'consultant_coordinator', 'reviewer'];
    for (const stage of stages) await engine.recordSubmittalResponse(q, { submittal_id: submittal.id, stage, user, revision: 1 });
    await engine.recordSubmittalResponse(q, { submittal_id: submittal.id, stage: 'response', user, response_code: 'D', revision: 1 });
    await engine.resubmitSubmittal(q, submittal.id, user, { comments: 'Revision 2' });
    for (const stage of stages) await engine.recordSubmittalResponse(q, { submittal_id: submittal.id, stage, user, revision: 2 });
    await engine.recordSubmittalResponse(q, { submittal_id: submittal.id, stage: 'response', user, response_code: 'A', revision: 2 });
    const finalSub = (await q('SELECT status FROM project_submittals WHERE id = $1', [submittal.id])).rows[0];
    record('Ordered RFI and submittal revisions', earlyRejected && closed.status === 'closed' && finalSub.status === 'closed' ? 'PASS' : 'FAIL', { earlyRejected, rfi_status: closed.status, submittal_status: finalSub.status });
  });
}

run().then(() => {
  const failures = results.filter(r => ['FAIL', 'ERROR'].includes(r.result));
  console.log(JSON.stringify({ checks: results.length, failures: failures.length }));
  if (failures.length) process.exitCode = 1;
}).catch(e => { console.error(e.message); process.exitCode = 1; });
