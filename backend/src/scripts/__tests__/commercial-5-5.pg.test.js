// Real PostgreSQL + real app. Phase 5.5 - commercial and finance (spec 09, 10):
//   contract parties, guarantees, insurances, currency rates, payment applications -> certificates (workflow),
//   versioned budgets and forecasts (maker/checker), commitment adjustments, variation fields, credit notes
//   (client and supplier, ledgered, cost reversed), payment batches, the supplier-invoice workflow, and the role
//   matrix on the internal API and /api/v1 (decision 8: the Quantity Surveyor does not see internal cost).
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const fs = require('fs');
const path = require('path');
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('5.5 commercial and finance (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let svc; let finance; let engine; let docs; let records; let budgeting;
  const tag = String(Date.now()).slice(-8);
  let seq = 0;
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const all = async (sql, params) => (await db.query(sql, params)).rows;
  const tx = (fn) => db.transaction((c) => fn(c.query.bind(c)));
  const call = async (method, p, user, body) => {
    const res = await fetch(`${base}${p}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user && user.token ? user.token : ''}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* empty */ }
    return { status: res.status, body: json };
  };
  const users = {};
  const made = { projects: [] };
  let day = 0;
  const makeUser = async (key, userRole, grantRole = userRole, projectId = null) => {
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ($1, $2, 'x', $3) RETURNING id, token_version",
      [`c55-${key}`, `c55-${key}-${++day}-${tag}@test.io`, userRole]);
    if (grantRole) await db.query('INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, $2, id FROM roles WHERE key = $3', [row.id, projectId, grantRole]);
    users[key] = { id: row.id, name: `c55-${key}`, role: userRole, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
    return users[key];
  };
  const makeProject = async (s, extra = {}) => {
    const id = (await one("INSERT INTO projects (name, name_en, code, status, budget, contract_value) VALUES ($1, $1, $2, 'active', $3, $4) RETURNING id",
      [`c55 ${s}`, `C55${tag}${s}`.slice(0, 20), extra.budget || 1000000, extra.contract_value || 2000000])).id;
    made.projects.push(id); return id;
  };
  const sum = (rows, f) => rows.reduce((s, r) => s + Number(r[f]), 0);
  const entryFor = async (kind, id) => {
    const entry = await one('SELECT * FROM journal_entries WHERE reference_type = $1 AND reference_id = $2', [kind, id]);
    if (!entry) return null;
    const lines = await all('SELECT l.debit, l.credit, a.code FROM journal_entry_lines l JOIN accounts a ON a.id = l.account_id WHERE l.journal_entry_id = $1 ORDER BY l.line_order', [entry.id]);
    return { entry, lines, debit: sum(lines, 'debit'), credit: sum(lines, 'credit') };
  };
  const codeOf = async (key) => (await one('SELECT a.code FROM gl_account_map m JOIN accounts a ON a.id = m.account_id WHERE m.key = $1', [key])).code;
  const migrationSql = fs.readFileSync(path.join(__dirname, '..', '..', 'migrations', '0036_commercial_finance.sql'), 'utf8');

  let pA; let pB; let client1; let supplier1; let cc1; let cc2; let contractA; let subContractA;

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    svc = require('../../services/procurementService');
    finance = require('../../services/financeEngine');
    engine = require('../../services/commercialEngine');
    docs = require('../../services/financeDocuments');
    records = require('../../services/commercialRecords');
    budgeting = require('../../services/budgeting');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    pA = await makeProject('A'); pB = await makeProject('B');
    client1 = (await one('INSERT INTO clients (code, name_en, name_ar) VALUES ($1, $1, $1) RETURNING id', [`c55-cl-${tag}`])).id;
    supplier1 = (await one('INSERT INTO suppliers (code, name_en, name_ar) VALUES ($1, $1, $1) RETURNING id', [`c55-s-${tag}`])).id;
    cc1 = (await one("INSERT INTO cost_codes (code, name, type) VALUES ($1, 'c55 one', 'material') RETURNING id", [`C55-1-${tag}`])).id;
    cc2 = (await one("INSERT INTO cost_codes (code, name, type) VALUES ($1, 'c55 two', 'labor') RETURNING id", [`C55-2-${tag}`])).id;
    contractA = (await one("INSERT INTO client_contracts (contract_number, project_id, client_id, original_value, revised_value, retention_percent) VALUES ($1, $2, $3, 1000000, 1000000, 10) RETURNING id", [`CC-55-${tag}`, pA, client1])).id;
    const sub = (await one("INSERT INTO subcontractors (name, name_en, name_ar) VALUES ($1, $1, $1) RETURNING id", [`c55-sub-${tag}`])).id;
    subContractA = (await one("INSERT INTO sub_contracts (contract_number, project_id, subcontractor_id, contract_value, retention_percent, status) VALUES ($1, $2, $3, 500000, 5, 'active') RETURNING id", [`SC-55-${tag}`, pA, sub])).id;
    await makeUser('owner', 'owner');
    await makeUser('cm', 'staff', 'commercial_manager');
    await makeUser('cmA', 'staff', 'commercial_manager', pA);
    await makeUser('qs', 'staff', 'quantity_surveyor');
    await makeUser('coo', 'staff', 'coo');
    await makeUser('apAcc', 'staff', 'accountant_ap');
    await makeUser('arAcc', 'staff', 'accountant_ar');
    await makeUser('keeper', 'storekeeper');
    await makeUser('client', 'client', 'client', pA);
    await makeUser('fresh', 'staff', null);
    for (const key of ['receivable', 'revenue', 'vat_output', 'vat_input', 'payable', 'cash', 'service_cost', 'material_cost']) {
      expect([key, await one('SELECT 1 AS ok FROM gl_account_map WHERE key = $1', [key])]).toEqual([key, { ok: 1 }]);
    }
  });

  afterAll(async () => {
    const uids = [...new Set(Object.values(users).map((u) => u.id))];
    await db.query('DELETE FROM user_project_roles WHERE user_id = ANY($1)', [uids]);
    await db.query('UPDATE users SET is_active = false WHERE id = ANY($1)', [uids]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  // --------------------------------------------------------------------------------------------------
  test('1. migration: tables exist, money is NUMERIC(15,2), the variation backfill is exact, and it is repeatable', async () => {
    for (const t of ['contract_parties', 'guarantees', 'insurances', 'payment_applications', 'invoice_lines', 'currency_rates', 'budget_versions', 'budget_lines', 'forecast_versions',
      'forecast_lines', 'commitment_adjustments', 'credit_notes', 'payment_batches', 'payment_batch_items']) {
      expect([t, (await one('SELECT count(*)::int n FROM information_schema.tables WHERE table_name = $1', [t])).n]).toEqual([t, 1]);
    }
    const money = await all(`SELECT table_name, column_name, numeric_precision, numeric_scale FROM information_schema.columns
      WHERE table_name IN ('guarantees', 'insurances', 'payment_applications', 'invoice_lines', 'budget_lines', 'forecast_lines', 'credit_notes', 'payment_batch_items')
        AND column_name IN ('amount', 'coverage_amount', 'claimed_work', 'certified_work', 'forecast_amount', 'unit_rate', 'tax_amount')`);
    expect(money.length).toBeGreaterThan(8);
    for (const c of money) expect([c.table_name, c.column_name, c.numeric_precision, c.numeric_scale]).toEqual([c.table_name, c.column_name, 15, 2]);
    expect((await one("SELECT numeric_scale FROM information_schema.columns WHERE table_name = 'currency_rates' AND column_name = 'rate'")).numeric_scale).toBe(8);
    // backfill: an old incorporated variation keeps its amount as submitted AND approved; an open one only as submitted
    const c = await db.pool.connect();
    try {
      await c.query('BEGIN');
      const v1 = (await c.query("INSERT INTO variations (variation_number, project_id, title, amount, status, variation_type) VALUES ($1, $2, 't', 700, 'incorporated', 'client') RETURNING id", [`VAR-MIG-A-${tag}`, pA])).rows[0].id;
      const v2 = (await c.query("INSERT INTO variations (variation_number, project_id, title, amount, status, variation_type) VALUES ($1, $2, 't', 300, 'estimate', 'client') RETURNING id", [`VAR-MIG-B-${tag}`, pA])).rows[0].id;
      await c.query(migrationSql); // repeat: must change nothing it should not
      const rows = (await c.query('SELECT id, amount, submitted_amount, approved_amount FROM variations WHERE id = ANY($1) ORDER BY id', [[v1, v2]])).rows;
      expect(rows.map((r) => [Number(r.amount), Number(r.submitted_amount), r.approved_amount == null ? null : Number(r.approved_amount)])).toEqual([[700, 700, 700], [300, 300, null]]);
    } finally { await c.query('ROLLBACK'); c.release(); }
  });

  // --------------------------------------------------------------------------------------------------
  test('2. variation fields: cause, responsibility, links, days impact; the approved amount is what counts when incorporated', async () => {
    const rfiOther = (await one("INSERT INTO project_rfis (project_id, rfi_number, subject, status) VALUES ($1, $2, 'other project', 'draft') RETURNING id", [pB, `RFI-55-B-${tag}`])).id;
    const rfi = (await one("INSERT INTO project_rfis (project_id, rfi_number, subject, status) VALUES ($1, $2, 'mine', 'draft') RETURNING id", [pA, `RFI-55-A-${tag}`])).id;
    const body = { project_id: pA, client_contract_id: contractA, title: 'extra slab', variation_type: 'client', cause: 'design_change', responsibility: 'client', time_impact_days: 12, linked_rfi_id: rfi, lines: [{ description: 'slab', quantity: 10, unit_rate: 1000 }] };
    const bad = await call('POST', '/api/commercial/variations', users.cm, { ...body, linked_rfi_id: rfiOther });
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ error_code: 'variation_link_invalid' });
    const made1 = await call('POST', '/api/commercial/variations', users.cm, body);
    expect(made1.status).toBe(201);
    const v = made1.body.data;
    expect(v).toMatchObject({ cause: 'design_change', responsibility: 'client', time_impact_days: 12, linked_rfi_id: rfi });
    expect([Number(v.amount), Number(v.submitted_amount), v.approved_amount]).toEqual([10000, 10000, null]);
    const edit = await call('PUT', `/api/commercial/variations/${v.id}`, users.cm, { recommended_amount: 9000, time_impact_days: 10 });
    expect(edit.status).toBe(200);
    expect([Number(edit.body.data.recommended_amount), edit.body.data.time_impact_days]).toEqual([9000, 10]);
    expect((await call('PUT', `/api/commercial/variations/${v.id}`, users.cm, { cause: 'moon_phase' })).body.error_code).toBe('validation_error');
    expect((await call('PUT', `/api/v1/variations/${v.id}`, users.cm, { responsibility: 'shared' })).status).toBe(200);
    // the approving decision states the amount; incorporation makes it THE amount (revised contract value follows)
    await db.query("UPDATE variations SET approved_amount = 8500, status = 'incorporated' WHERE id = $1", [v.id]);
    await tx((q) => engine.incorporateVariation(q, v.id));
    const done = await one('SELECT amount, submitted_amount, approved_amount FROM variations WHERE id = $1', [v.id]);
    expect([Number(done.amount), Number(done.submitted_amount), Number(done.approved_amount)]).toEqual([8500, 10000, 8500]);
    expect(Number((await one('SELECT revised_value FROM client_contracts WHERE id = $1', [contractA])).revised_value)).toBe(1008500);
    const closed = await call('PUT', `/api/commercial/variations/${v.id}`, users.cm, { time_impact_days: 1 });
    expect(closed.status).toBe(409);
    expect(closed.body.error_code).toBe('variation_closed');
    await db.query('UPDATE client_contracts SET revised_value = original_value WHERE id = $1', [contractA]);
  });

  // --------------------------------------------------------------------------------------------------
  test('3. contract parties, guarantees and insurances: project follows the contract, one live state, typed refusals', async () => {
    const org = (await one("INSERT INTO organizations (code, name_en, name_ar, org_type) VALUES ($1, $1, $1, 'consultant') RETURNING id", [`c55-org-${tag}`])).id;
    const party = await call('POST', `/api/commercial/contracts/${contractA}/parties`, users.cm, { organization_id: org, party_role: 'engineer', is_signatory: true });
    expect(party.status).toBe(201);
    expect((await call('POST', `/api/commercial/contracts/${contractA}/parties`, users.cm, { organization_id: org, party_role: 'engineer' })).body.error_code).toBe('contract_party_duplicate');
    expect((await call('POST', `/api/commercial/contracts/${contractA}/parties`, users.cm, { party_role: 'other' })).status).toBeGreaterThanOrEqual(400); // names no one
    expect((await call('GET', `/api/v1/contracts/${contractA}/parties`, users.cm)).body.data).toHaveLength(1);
    expect((await call('POST', `/api/commercial/subcontracts/${subContractA}/parties`, users.cm, { name_en: 'Surety Co', party_role: 'guarantor', share_pct: 100 })).status).toBe(201);

    const g = await call('POST', '/api/commercial/guarantees', users.cm, { guarantee_type: 'performance', client_contract_id: contractA, amount: 100000, expires_on: '2027-06-30', issuer_organization_id: org });
    expect(g.status).toBe(201);
    expect(g.body.data).toMatchObject({ project_id: pA, status: 'active', currency: 'EGP' });
    expect(g.body.data.guarantee_number).toMatch(/^GTE-/);
    expect((await call('POST', '/api/commercial/guarantees', users.cm, { guarantee_type: 'bid', client_contract_id: contractA, project_id: pB, amount: 1, expires_on: '2027-06-30' })).body.error_code).toBe('contract_project_mismatch');
    expect((await call('POST', '/api/commercial/guarantees', users.cm, { guarantee_type: 'bid', amount: 1, expires_on: '2027-06-30' })).body.error_code).toBe('scope_required');
    const soon = await call('POST', '/api/commercial/guarantees', users.cm, { guarantee_type: 'advance_payment', project_id: pA, amount: 5000, expires_on: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10) });
    const expiring = await call('GET', `/api/commercial/guarantees?project_id=${pA}&expiring_within_days=30`, users.cm);
    expect(expiring.body.data.map((x) => x.id)).toEqual([soon.body.data.id]);
    expect((await call('PUT', `/api/commercial/guarantees/${g.body.data.id}`, users.cm, { reference: 'BANK-REF-1', amount: 120000 })).body.data).toMatchObject({ reference: 'BANK-REF-1', amount: '120000.00' });
    const shortReason = await call('POST', `/api/commercial/guarantees/${g.body.data.id}/close`, users.cm, { status: 'released', reason: 'x' });
    expect(shortReason.body.error_code).toBe('reason_required');
    const closed = await call('POST', `/api/commercial/guarantees/${g.body.data.id}/close`, users.cm, { status: 'released', reason: 'works taken over' });
    expect(closed.body.data).toMatchObject({ status: 'released' });
    expect((await call('POST', `/api/commercial/guarantees/${g.body.data.id}/close`, users.cm, { status: 'called', reason: 'again' })).body.error_code).toBe('guarantee_not_active');
    expect((await call('PUT', `/api/commercial/guarantees/${g.body.data.id}`, users.cm, { reference: 'late' })).body.error_code).toBe('guarantee_not_active');

    const ins = await call('POST', '/api/commercial/insurances', users.cm, { insurance_type: 'contractors_all_risk', sub_contract_id: subContractA, policy_number: `POL-${tag}`, coverage_amount: 750000, expiry_date: '2027-01-01', start_date: '2026-01-01' });
    expect(ins.status).toBe(201);
    expect(ins.body.data).toMatchObject({ project_id: pA, status: 'active' });
    expect((await call('POST', '/api/commercial/insurances', users.cm, { insurance_type: 'other', project_id: pA, policy_number: 'P', coverage_amount: 1, start_date: '2027-02-01', expiry_date: '2027-01-01' })).status).toBeGreaterThanOrEqual(400); // dates inverted
    expect((await call('POST', `/api/commercial/insurances/${ins.body.data.id}/cancel`, users.cm, { reason: 'replaced by a new policy' })).body.data.status).toBe('cancelled');
    expect((await call('POST', `/api/commercial/insurances/${ins.body.data.id}/cancel`, users.cm, { reason: 'again again' })).body.error_code).toBe('insurance_not_active');
  });

  // --------------------------------------------------------------------------------------------------
  test('4. currency rates: dated history, exact conversion, inverse fallback, a missing rate is an error', async () => {
    const from = 'USD'; const to = 'Q' + [...String(tag).slice(-2)].map((d) => 'ABCDEFGHIJ'[d]).join(''); // a pair no other suite uses
    await db.query('DELETE FROM currency_rates WHERE from_currency = $1 AND to_currency = $2', [from, to]);   // rates are history: clear this suite's own pair
    const r1 = await call('POST', '/api/commercial/currency-rates', users.cm, { from_currency: from, to_currency: to, rate: 48.5, effective_date: '2026-01-01', source: 'CBE' });
    expect(r1.status).toBe(201);
    expect((await call('POST', '/api/commercial/currency-rates', users.cm, { from_currency: from, to_currency: to, rate: 49, effective_date: '2026-01-01' })).body.error_code).toBe('currency_rate_exists');
    expect((await call('POST', '/api/commercial/currency-rates', users.cm, { from_currency: from, to_currency: from, rate: 1, effective_date: '2026-01-01' })).body.error_code).toBe('currency_pair_invalid');
    await call('POST', '/api/commercial/currency-rates', users.cm, { from_currency: from, to_currency: to, rate: 50.25, effective_date: '2026-06-01' });
    const conv = (amount, f, t, asOf) => call('GET', `/api/commercial/currency-rates/convert?amount=${amount}&from=${f}&to=${t}&as_of=${asOf}`, users.cm);
    expect((await conv(1000, from, to, '2026-03-01')).body.data).toMatchObject({ amount: '48500.00', inverse: false });   // the January rate
    expect((await conv(1000, from, to, '2026-07-01')).body.data).toMatchObject({ amount: '50250.00' });                  // the June rate
    expect((await conv(50250, to, from, '2026-07-01')).body.data).toMatchObject({ amount: '1000.00', inverse: true });   // inverse of the same rate
    const none = await conv(10, from, to, '2025-01-01');
    expect(none.status).toBe(404);
    expect(none.body.error_code).toBe('currency_rate_missing');
    expect((await conv(10, 'GBP', 'JPY', '2026-07-01')).body.error_code).toBe('currency_rate_missing');
    expect((await call('GET', `/api/v1/currency-rates/convert?amount=1000&from=${from}&to=${to}&as_of=2026-03-01`, users.cm)).body.data.amount).toBe('48500.00');
  });

  // --------------------------------------------------------------------------------------------------
  test('5. payment application -> certificate (contract retention) -> the seeded payment_certificate workflow', async () => {
    const app1 = await call('POST', '/api/commercial/payment-applications', users.qs, { party_type: 'client', project_id: pA, client_contract_id: contractA, claimed_work: 100000, claimed_variations: 20000, claimed_materials: 10000, period_from: '2026-03-01', period_to: '2026-03-31' });
    expect(app1.status).toBe(201);
    const id = app1.body.data.id;
    expect(app1.body.data.application_number).toMatch(/^PAP-/);
    expect((await call('POST', `/api/commercial/payment-applications/${id}/certify`, users.owner, { certified_work: 1 })).body.error_code).toBe('payment_application_not_submitted');
    expect((await call('POST', '/api/commercial/payment-applications', users.qs, { party_type: 'client', project_id: pB, client_contract_id: contractA })).body.error_code).toBe('contract_project_mismatch');
    expect((await call('POST', `/api/commercial/payment-applications/${id}/submit`, users.qs)).body.data.status).toBe('submitted');
    expect((await call('POST', `/api/commercial/payment-applications/${id}/submit`, users.qs)).body.error_code).toBe('payment_application_not_draft');
    expect((await call('POST', `/api/commercial/payment-applications/${id}/certify`, users.owner, { certified_work: 100001 })).body.error_code).toBe('certified_exceeds_claimed');
    const out = await call('POST', `/api/commercial/payment-applications/${id}/certify`, users.owner, { certified_work: 90000, certified_variations: 20000, certified_materials: 5000, other_deductions: 1000, tax_pct: 10 });
    expect(out.status).toBe(200);
    const cert = out.body.data.certificate;
    // gross = work + materials + variations = 115000; retention 10% = 11500; net before tax = 115000 - 11500 - 1000 = 102500; tax 10% = 10250
    expect(cert).toMatchObject({ status: 'draft', party_type: 'client', project_id: pA });
    expect([Number(cert.gross_certified), Number(cert.retention_held), Number(cert.tax_amount), Number(cert.net_certificate), Number(cert.cumulative_certified)]).toEqual([115000, 11500, 10250, 112750, 115000]);
    expect(out.body.data.application).toMatchObject({ status: 'certified', certificate_id: cert.id });
    const second = await call('POST', '/api/commercial/payment-applications', users.qs, { party_type: 'client', project_id: pA, client_contract_id: contractA, claimed_work: 40000 });
    await call('POST', `/api/commercial/payment-applications/${second.body.data.id}/submit`, users.qs);
    const rejected = await call('POST', `/api/commercial/payment-applications/${second.body.data.id}/reject`, users.owner, { reason: 'measurement not agreed' });
    expect(rejected.body.data.status).toBe('rejected');
    const thirdRes = await call('POST', '/api/commercial/payment-applications', users.qs, { party_type: 'subcontractor', project_id: pA, sub_contract_id: subContractA, claimed_work: 50000 });
    expect([thirdRes.status, thirdRes.body.error]).toEqual([201, undefined]);
    const third = thirdRes.body.data;
    expect((await call('POST', `/api/commercial/payment-applications/${third.id}/withdraw`, users.cm)).body.data.status).toBe('withdrawn');

    // the certificate workflow: start records the requester's own step, then each step is decided; the last makes it certified
    const started = await call('POST', `/api/commercial/payment-certificates/${cert.id}/start`, users.owner);
    expect(started.status).toBe(200);
    expect(started.body.data.status).toBe('qs_review');
    expect((await call('POST', `/api/commercial/payment-certificates/${cert.id}/start`, users.owner)).body.error_code).toBe('workflow_already_started');
    let last = started.body.data;
    for (let i = 0; i < 8 && last.status !== 'certified'; i += 1) {
      const step = await call('POST', `/api/commercial/payment-certificates/${cert.id}/decide`, users.owner, { decision: 'approve', comment: `step ${i}` });
      expect([i, step.status, step.body.error]).toEqual([i, 200, undefined]);
      last = step.body.data;
    }
    expect(last.status).toBe('certified');
    expect(last.certified_by).toBe(users.owner.id);
    expect((await call('POST', `/api/commercial/payment-certificates/${cert.id}/decide`, users.owner, { decision: 'approve' })).body.error_code).toBe('payment_certificate_closed');
    const listed = await call('GET', `/api/commercial/payment-certificates?project_id=${pA}`, users.cm);
    expect([listed.status, listed.body.error]).toEqual([200, undefined]);
    expect(listed.body.data.map((c) => c.id)).toContain(cert.id);
  });

  // --------------------------------------------------------------------------------------------------
  test('6. budget versions: maker/checker, one approved version, approval applies it through budget_changes, QS never sees it', async () => {
    const created = await call('POST', '/api/commercial/budget-versions', users.cm, { project_id: pA, name: 'baseline', lines: [{ cost_code_id: cc1, amount: 600000 }, { cost_code_id: cc2, amount: 300000 }] });
    expect(created.status).toBe(201);
    const v1 = created.body.data;
    expect([v1.version_no, v1.status, v1.total]).toEqual([1, 'draft', 900000]);
    expect((await call('POST', '/api/commercial/budget-versions', users.cm, { project_id: pA, name: 'dup', lines: [{ cost_code_id: cc1, amount: 1 }, { cost_code_id: cc1, amount: 2 }] })).body.error_code).toBe('duplicate_cost_code');
    expect((await call('POST', '/api/commercial/budget-versions', users.cm, { project_id: pA, name: 'nocode', lines: [{ cost_code_id: 99999999, amount: 1 }] })).body.error_code).toBe('cost_code_not_found');
    expect((await call('POST', `/api/commercial/budget-versions/${v1.id}/decide`, users.coo, { decision: 'approve' })).body.error_code).toBe('budget_version_not_submitted');
    expect((await call('PUT', `/api/commercial/budget-versions/${v1.id}`, users.cm, { lines: [{ cost_code_id: cc1, amount: 650000 }, { cost_code_id: cc2, amount: 300000 }] })).body.data.total).toBe(950000);
    expect((await call('POST', `/api/commercial/budget-versions/${v1.id}/submit`, users.cm)).body.data.status).toBe('submitted');
    expect((await call('PUT', `/api/commercial/budget-versions/${v1.id}`, users.cm, { name: 'late' })).body.error_code).toBe('budget_version_not_draft');
    // the maker cannot be the checker
    const self = await call('POST', `/api/commercial/budget-versions/${v1.id}/decide`, users.cm, { decision: 'approve' });
    expect(self.status).toBe(403);
    expect(self.body.error_code).toBe('maker_checker_violation');
    const approved = await call('POST', `/api/commercial/budget-versions/${v1.id}/decide`, users.coo, { decision: 'approve' });
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe('approved');
    expect(approved.body.data.applied).toHaveLength(2);
    const budgets = await all('SELECT cost_code_id, current_amount FROM project_budgets WHERE project_id = $1 ORDER BY cost_code_id', [pA]);
    expect(budgets.map((b) => [b.cost_code_id, Number(b.current_amount)])).toEqual([[cc1, 650000], [cc2, 300000]]);
    expect((await one("SELECT count(*)::int n FROM budget_changes WHERE project_id = $1 AND source_type = 'budget_version' AND source_id = $2", [pA, v1.id])).n).toBe(2);
    expect((await engine.projectCommercial(db.query, pA)).current_budget).toBe(950000);
    // version 2 supersedes version 1; there is only ever one approved version (database index)
    const v2 = (await call('POST', '/api/commercial/budget-versions', users.cm, { project_id: pA, name: 'revised', copy_from_version_id: v1.id })).body.data;
    expect(v2.version_no).toBe(2);
    await call('PUT', `/api/commercial/budget-versions/${v2.id}`, users.cm, { lines: [{ cost_code_id: cc1, amount: 700000 }] });
    await call('POST', `/api/commercial/budget-versions/${v2.id}/submit`, users.cm);
    const two = await call('POST', `/api/commercial/budget-versions/${v2.id}/decide`, users.owner, { decision: 'approve' });
    expect(two.body.data.status).toBe('approved');
    expect(two.body.data.unlisted_codes).toEqual([cc2]);                      // cc2 was not restated: kept at its budget, reported
    expect((await all("SELECT version_no, status FROM budget_versions WHERE project_id = $1 ORDER BY version_no", [pA])).map((r) => [r.version_no, r.status])).toEqual([[1, 'superseded'], [2, 'approved']]);
    expect(Number((await one('SELECT current_amount FROM project_budgets WHERE project_id = $1 AND cost_code_id = $2', [pA, cc2])).current_amount)).toBe(300000);
    // a rejected version changes no budget
    const v3 = (await call('POST', '/api/commercial/budget-versions', users.cm, { project_id: pA, name: 'nope', lines: [{ cost_code_id: cc1, amount: 1 }] })).body.data;
    await call('POST', `/api/commercial/budget-versions/${v3.id}/submit`, users.cm);
    expect((await call('POST', `/api/commercial/budget-versions/${v3.id}/decide`, users.coo, { decision: 'reject', comment: 'too low' })).body.data.status).toBe('rejected');
    expect(Number((await one('SELECT current_amount FROM project_budgets WHERE project_id = $1 AND cost_code_id = $2', [pA, cc1])).current_amount)).toBe(700000);
    // the one configuration line: a single-person company can switch the rule off
    await db.query("UPDATE business_rules SET rule_value = '{\"enforced\": false}'::jsonb WHERE rule_key = 'finance:maker_checker'");
    try {
      const v4 = (await call('POST', '/api/commercial/budget-versions', users.cm, { project_id: pA, name: 'solo', lines: [{ cost_code_id: cc1, amount: 710000 }] })).body.data;
      await call('POST', `/api/commercial/budget-versions/${v4.id}/submit`, users.cm);
      expect((await call('POST', `/api/commercial/budget-versions/${v4.id}/decide`, users.cm, { decision: 'approve' })).status).toBe(200);
    } finally { await db.query("UPDATE business_rules SET rule_value = '{\"enforced\": true}'::jsonb WHERE rule_key = 'finance:maker_checker'"); }
  });

  // --------------------------------------------------------------------------------------------------
  test('7. forecast versions: actual to date comes from the shared cost view; one approved version', async () => {
    await db.query("INSERT INTO project_costs (project_id, cost_code_id, source_type, source_id, amount) VALUES ($1, $2, 'c55_test', $3, 12345.67)", [pA, cc1, Number(String(Date.now()).slice(-8))]);
    const f1 = await call('POST', '/api/commercial/forecast-versions', users.cm, { project_id: pA, name: 'Q1', as_of_date: '2026-03-31', lines: [{ cost_code_id: cc1, forecast_amount: 800000 }, { cost_code_id: cc2, forecast_amount: 250000 }] });
    expect(f1.status).toBe(201);
    expect([f1.body.data.total_forecast, f1.body.data.total_actual_to_date]).toEqual([1050000, 12345.67]);
    expect(f1.body.data.lines.find((l) => l.cost_code_id === cc1).actual_to_date).toBe('12345.67');
    expect((await call('POST', `/api/commercial/forecast-versions/${f1.body.data.id}/approve`, users.coo)).body.data.status).toBe('approved');
    expect((await call('POST', `/api/commercial/forecast-versions/${f1.body.data.id}/approve`, users.coo)).body.error_code).toBe('forecast_version_not_draft');
    const f2 = (await call('POST', '/api/commercial/forecast-versions', users.cm, { project_id: pA, name: 'Q2', lines: [{ cost_code_id: cc1, forecast_amount: 820000 }] })).body.data;
    await call('POST', `/api/commercial/forecast-versions/${f2.id}/approve`, users.coo);
    expect((await all('SELECT version_no, status FROM forecast_versions WHERE project_id = $1 ORDER BY version_no', [pA])).map((r) => [r.version_no, r.status])).toEqual([[1, 'superseded'], [2, 'approved']]);
    expect((await call('GET', `/api/commercial/project/${pA}/forecast-versions`, users.cm)).body.data).toHaveLength(2);
  });

  // --------------------------------------------------------------------------------------------------
  test('8. commitment adjustment: reason, range, history; the committed cost follows', async () => {
    const po = await tx((q) => svc.createPurchaseOrder(q, { supplier_id: supplier1, project_id: pA, taxes: 0, freight: 0, approved_charges: 0, lines: [{ material_id: null, description: `c55 ${tag}`, quantity: 10, unit: 'ea', unit_rate: 1000 }], created_by: users.owner.id }));
    await db.query("UPDATE purchase_orders SET status = 'issued' WHERE id = $1", [po.id]);
    const list = await call('GET', `/api/commercial/project/${pA}/commitments`, users.cm);
    expect(list.status).toBe(200);
    const commitment = list.body.data.find((c) => c.source_type === 'purchase_order' && c.source_id === po.id);
    expect(Number(commitment.original_amount)).toBe(10000);
    const url = `/api/commercial/commitments/${commitment.id}/adjust`;
    expect((await call('POST', url, users.cm, { cancelled_amount: 2500, reason: 'x' })).body.error_code).toBe('reason_required');
    expect((await call('POST', url, users.cm, { cancelled_amount: 10001, reason: 'descoped by client' })).body.error_code).toBe('cancelled_amount_out_of_range');
    const adj = await call('POST', url, users.cm, { cancelled_amount: 2500, reason: 'descoped by client' });
    expect(adj.status).toBe(200);
    expect([adj.body.data.net_amount, adj.body.data.adjustments.length]).toEqual([7500, 1]);
    expect((await call('POST', url, users.cm, { cancelled_amount: 2500, reason: 'same again' })).body.error_code).toBe('commitment_unchanged');
    await call('POST', url, users.cm, { cancelled_amount: 0, reason: 'descope reversed' });
    const hist = (await call('GET', `/api/v1/commitments/${commitment.id}`, users.cm)).body.data;
    expect(hist.adjustments.map((a) => [Number(a.previous_cancelled), Number(a.new_cancelled)])).toEqual([[2500, 0], [0, 2500]]);
    await call('POST', url, users.cm, { cancelled_amount: 4000, reason: 'descoped again' });
    expect((await engine.projectCommercial(db.query, pA)).committed_cost).toBe(506000);   // + the 500000 active subcontract commitment
  });

  // --------------------------------------------------------------------------------------------------
  const makeClientInvoice = async (amount, tax = 0, project = pA) => {
    seq += 1;
    const invoice = await tx(async (q) => {
      const row = await finance.createInvoiceRecord(q, { project_id: project, client_id: client1, amount, tax_amount: tax, net_amount: amount, issue_date: '2026-04-01', due_date: '2026-05-01', status: 'draft', description: `c55 ${seq}`, created_by: users.cm.id }, { actor_id: users.cm.id });
      await finance.transitionInvoice(q, row.id, 'approved', users.owner);
      return finance.transitionInvoice(q, row.id, 'issued', users.owner);
    });
    return invoice;
  };

  test('9. client credit note: issued through the ledger, maker/checker, reduces what is owed, void reverses exactly once', async () => {
    const invoice = await makeClientInvoice(1140, 140);
    const url = '/api/finance-ledger/credit-notes';
    expect((await call('POST', url, users.arAcc, { party_type: 'client', invoice_id: invoice.id, amount: 1141, reason: 'too much' })).body.error_code).toBe('credit_note_exceeds_outstanding');
    expect((await call('POST', url, users.arAcc, { party_type: 'client', invoice_id: invoice.id, amount: 100, tax_amount: 200, reason: 'tax over' })).body.error_code).toBe('credit_note_tax_exceeds_amount');
    expect((await call('POST', url, users.arAcc, { party_type: 'client', invoice_id: invoice.id, amount: 100, reason: 'x' })).body.error_code).toBe('reason_required');
    const cn = await call('POST', url, users.arAcc, { party_type: 'client', invoice_id: invoice.id, amount: 570, tax_amount: 70, reason: 'part of the work was not executed' });
    expect(cn.status).toBe(201);
    expect(cn.body.data).toMatchObject({ status: 'draft', project_id: pA });
    expect(cn.body.data.credit_note_number).toMatch(/^CN-/);
    // a second draft counts against the same outstanding
    expect((await call('POST', url, users.arAcc, { party_type: 'client', invoice_id: invoice.id, amount: 600, reason: 'second draft over the rest' })).body.error_code).toBe('credit_note_exceeds_outstanding');
    const self = await call('POST', `${url}/${cn.body.data.id}/issue`, users.arAcc);
    expect(self.status).toBe(403);                                        // arAcc lacks issue_financial_document
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'coo'", [users.arAcc.id]);
    const maker = await call('POST', `${url}/${cn.body.data.id}/issue`, users.arAcc);
    expect(maker.body.error_code).toBe('maker_checker_violation');        // now allowed to issue, but not their own draft
    const issued = await call('POST', `${url}/${cn.body.data.id}/issue`, users.coo);
    expect(issued.status).toBe(200);
    expect(issued.body.data.status).toBe('issued');
    const posted = await entryFor('client_credit_note', cn.body.data.id);
    expect(posted.debit).toBe(570);
    expect(posted.credit).toBe(570);
    expect(posted.lines.map((l) => [l.code, Number(l.debit), Number(l.credit)])).toEqual([[await codeOf('revenue'), 500, 0], [await codeOf('vat_output'), 70, 0], [await codeOf('receivable'), 0, 570]]);
    expect(Number((await one('SELECT credited_amount FROM invoices WHERE id = $1', [invoice.id])).credited_amount)).toBe(570);
    expect((await finance.invoiceOutstanding(db.query, invoice.id)).outstanding).toBe(570);
    expect((await call('POST', `${url}/${cn.body.data.id}/issue`, users.coo)).body.error_code).toBe('credit_note_not_draft');
    // paying the rest settles the invoice (credit + payment = invoice)
    const pay = await call('POST', '/api/payments', users.owner, { project_id: pA, client_id: client1, invoice_id: invoice.id, amount: 570, payment_date: '2026-04-20' });
    expect(pay.status).toBe(201);
    expect((await one('SELECT status FROM invoices WHERE id = $1', [invoice.id])).status).toBe('paid');
    // void: reversed once, credited amount back, a repeat is refused
    const voided = await call('POST', `${url}/${cn.body.data.id}/void`, users.coo, { reason: 'issued against the wrong invoice' });
    expect(voided.body.data.status).toBe('void');
    const reversal = await entryFor('client_credit_note_void', cn.body.data.id);
    expect([reversal.debit, reversal.credit]).toEqual([570, 570]);
    expect(Number((await one('SELECT credited_amount FROM invoices WHERE id = $1', [invoice.id])).credited_amount)).toBe(0);
    expect((await call('POST', `${url}/${cn.body.data.id}/void`, users.coo, { reason: 'once more please' })).body.error_code).toBe('credit_note_already_void');
    expect((await all("SELECT id FROM journal_entries WHERE reference_type = 'client_credit_note_void' AND reference_id = $1", [cn.body.data.id]))).toHaveLength(1);
    // a full credit on an unpaid invoice closes it as credited
    const invoice2 = await makeClientInvoice(500);
    const cn2 = (await call('POST', url, users.arAcc, { party_type: 'client', invoice_id: invoice2.id, amount: 500, reason: 'invoice raised in error' })).body.data;
    expect((await call('POST', `${url}/${cn2.id}/issue`, users.coo)).status).toBe(200);
    expect((await one('SELECT status FROM invoices WHERE id = $1', [invoice2.id])).status).toBe('credited');
    expect((await call('POST', `${url}/${cn2.id}/void`, users.coo, { reason: 'credit note was wrong' })).status).toBe(200);
    expect((await one('SELECT status FROM invoices WHERE id = $1', [invoice2.id])).status).toBe('issued');
    await db.query("DELETE FROM user_project_roles WHERE user_id = $1 AND role_id = (SELECT id FROM roles WHERE key = 'coo')", [users.arAcc.id]);
    expect((await finance.arAging(db.query)).current).toBeDefined();
  });

  // --------------------------------------------------------------------------------------------------
  const makeServiceInvoice = async ({ total = 1140, tax = 140, project = pA, approve = true, recoverable = true } = {}) => {
    seq += 1;
    const po = await tx((q) => svc.createPurchaseOrder(q, { supplier_id: supplier1, project_id: project, taxes: 0, freight: 0, approved_charges: 0, lines: [{ material_id: null, description: `c55 svc ${seq}`, quantity: 1, unit: 'ea', unit_rate: total - tax }], created_by: users.owner.id }));
    const created = await tx((q) => svc.recordSupplierInvoice(q, { supplier_id: supplier1, purchase_order_id: po.id, invoice_number: `C55-${tag}-${seq}`, total_amount: total, tax_amount: tax, vat_recoverable: recoverable, lines: [{ purchase_order_line_id: po.lines[0].id, material_id: null, quantity: 1, unit_price: total - tax }], created_by: users.owner.id }));
    const invoice = created.invoice || created;
    if (approve) await tx((q) => svc.approveSupplierInvoice(q, invoice.id, users.owner));
    return one('SELECT * FROM supplier_invoices WHERE id = $1', [invoice.id]);
  };
  const projectCost = async (project) => Number((await one('SELECT COALESCE(SUM(amount), 0) AS s FROM project_costs WHERE project_id = $1', [project])).s);

  test('10. supplier credit note: reverses its share of the invoice cost and VAT through the ledger, never more than accrued, void restores', async () => {
    const before = await projectCost(pA);
    const invoice = await makeServiceInvoice({ total: 1140, tax: 140 });
    expect(await projectCost(pA)).toBeCloseTo(before + 1000, 2);
    const url = '/api/finance-ledger/credit-notes';
    expect((await call('POST', url, users.apAcc, { party_type: 'supplier', supplier_invoice_id: invoice.id, amount: 1141, reason: 'too much' })).body.error_code).toBe('credit_note_exceeds_outstanding');
    const cn = (await call('POST', url, users.apAcc, { party_type: 'supplier', supplier_invoice_id: invoice.id, amount: 570, tax_amount: 70, reason: 'half of the service not delivered' })).body.data;
    expect(cn.credit_note_number).toMatch(/^SCN-/);
    const issued = await call('POST', `${url}/${cn.id}/issue`, users.coo);
    expect(issued.status).toBe(200);
    const row = await one("SELECT * FROM project_costs WHERE source_type = 'supplier_credit_note' AND source_id = $1", [cn.id]);
    expect([Number(row.amount), row.project_id]).toEqual([-500, pA]);
    expect(await projectCost(pA)).toBeCloseTo(before + 500, 2);
    const posted = await entryFor('supplier_credit_note_cost', cn.id);
    expect(posted.lines.map((l) => [l.code, Number(l.debit), Number(l.credit)])).toEqual([[await codeOf('payable'), 570, 0], [await codeOf('service_cost'), 0, 500], [await codeOf('vat_input'), 0, 70]]);
    expect((await finance.supplierInvoiceOutstanding(db.query, invoice.id)).outstanding).toBe(570);
    // the rest of the invoice cannot be credited beyond what is left
    const rest = (await call('POST', url, users.apAcc, { party_type: 'supplier', supplier_invoice_id: invoice.id, amount: 570, tax_amount: 70, reason: 'the other half as well' })).body.data;
    expect((await call('POST', `${url}/${rest.id}/issue`, users.coo)).status).toBe(200);
    expect((await one('SELECT status FROM supplier_invoices WHERE id = $1', [invoice.id])).status).toBe('paid');   // fully credited = nothing owed
    expect(await projectCost(pA)).toBeCloseTo(before, 2);
    // void restores the cost row once and reverses the entry
    expect((await call('POST', `${url}/${rest.id}/void`, users.coo, { reason: 'credit note raised by mistake' })).status).toBe(200);
    expect(await projectCost(pA)).toBeCloseTo(before + 500, 2);
    expect((await one('SELECT status FROM supplier_invoices WHERE id = $1', [invoice.id])).status).toBe('approved');
    expect((await entryFor('supplier_credit_note_cost_void', rest.id)).debit).toBe(570);
    // non-recoverable VAT is cost: the whole credit goes back to cost, nothing to vat_input
    const nr = await makeServiceInvoice({ total: 1140, tax: 140, recoverable: false });
    const cn3 = (await call('POST', url, users.apAcc, { party_type: 'supplier', supplier_invoice_id: nr.id, amount: 1140, tax_amount: 140, reason: 'whole service cancelled' })).body.data;
    expect((await call('POST', `${url}/${cn3.id}/issue`, users.coo)).status).toBe(200);
    expect((await entryFor('supplier_credit_note_cost', cn3.id)).lines.map((l) => [l.code, Number(l.debit), Number(l.credit)])).toEqual([[await codeOf('payable'), 1140, 0], [await codeOf('service_cost'), 0, 1140]]);
    // an invoice whose goods accrued at the GRN has no cost row of its own: refused with a code, nothing posted
    const grnCovered = await makeServiceInvoice({ total: 500, tax: 0, approve: false });
    await db.query("UPDATE supplier_invoices SET status = 'approved' WHERE id = $1", [grnCovered.id]);
    const cn4 = (await call('POST', url, users.apAcc, { party_type: 'supplier', supplier_invoice_id: grnCovered.id, amount: 100, reason: 'goods were returned' })).body.data;
    const refused = await call('POST', `${url}/${cn4.id}/issue`, users.coo);
    expect(refused.status).toBe(409);
    expect(refused.body.error_code).toBe('credit_note_cost_not_on_invoice');
    expect((await one('SELECT status FROM credit_notes WHERE id = $1', [cn4.id])).status).toBe('draft');
    expect(await entryFor('supplier_credit_note_cost', cn4.id)).toBeNull();
    // a received (unapproved) invoice cannot be credited at all
    const received = await makeServiceInvoice({ total: 100, tax: 0, approve: false });
    expect((await call('POST', url, users.apAcc, { party_type: 'supplier', supplier_invoice_id: received.id, amount: 10, reason: 'not approved yet' })).body.error_code).toBe('supplier_invoice_not_credit_eligible');
  });

  // --------------------------------------------------------------------------------------------------
  test('11. payment batch: maker/checker, never beyond what is payable, release pays and allocates through the ledger once', async () => {
    const inv1 = await makeServiceInvoice({ total: 2280, tax: 280 });
    const inv2 = await makeServiceInvoice({ total: 1140, tax: 140 });
    const url = '/api/finance-ledger/payment-batches';
    const apBefore = Number((await one("SELECT COALESCE(SUM(l.credit - l.debit), 0) AS s FROM journal_entry_lines l JOIN accounts a ON a.id = l.account_id WHERE a.code = $1", [await codeOf('payable')])).s);
    expect((await call('POST', url, users.apAcc, { items: [{ supplier_invoice_id: inv1.id, amount: 3000 }] })).body.error_code).toBe('payment_exceeds_payable');
    expect((await call('POST', url, users.apAcc, { items: [{ supplier_invoice_id: inv1.id }, { supplier_invoice_id: inv1.id }] })).body.error_code).toBe('payment_batch_duplicate_invoice');
    expect((await call('POST', url, users.apAcc, { items: [] })).body.error_code).toBe('validation_error');
    const received = await makeServiceInvoice({ total: 100, tax: 0, approve: false });
    expect((await call('POST', url, users.apAcc, { items: [{ supplier_invoice_id: received.id }] })).body.error_code).toBe('supplier_invoice_not_payable');
    const batch = await call('POST', url, users.apAcc, { currency: 'EGP', payment_date: '2026-05-10', items: [{ supplier_invoice_id: inv1.id, amount: 2000 }, { supplier_invoice_id: inv2.id }] });
    expect(batch.status).toBe(201);
    const b = batch.body.data;
    expect(b.batch_number).toMatch(/^PB-/);
    expect([b.status, b.total, b.items.length]).toEqual(['draft', 3140, 2]);
    // another open batch cannot take the same money twice
    expect((await call('POST', url, users.apAcc, { items: [{ supplier_invoice_id: inv1.id, amount: 400 }] })).body.error_code).toBe('payment_exceeds_payable');
    expect((await call('POST', `${url}/${b.id}/approve`, users.coo)).body.error_code).toBe('payment_batch_not_submitted');
    expect((await call('POST', `${url}/${b.id}/release`, users.apAcc)).body.error_code).toBe('payment_batch_not_approved');
    expect((await call('POST', `${url}/${b.id}/submit`, users.apAcc)).body.data.status).toBe('submitted');
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'coo'", [users.apAcc.id]);
    const selfApprove = await call('POST', `${url}/${b.id}/approve`, users.apAcc);
    expect(selfApprove.status).toBe(403);
    expect(selfApprove.body.error_code).toBe('maker_checker_violation');
    await db.query("DELETE FROM user_project_roles WHERE user_id = $1 AND role_id = (SELECT id FROM roles WHERE key = 'coo')", [users.apAcc.id]);
    expect((await call('POST', `${url}/${b.id}/approve`, users.coo)).body.data.status).toBe('approved');
    const released = await call('POST', `${url}/${b.id}/release`, users.apAcc);
    expect(released.status).toBe(200);
    expect(released.body.data.payments).toHaveLength(2);
    expect(released.body.data.batch.status).toBe('released');
    expect((await one('SELECT status FROM supplier_invoices WHERE id = $1', [inv2.id])).status).toBe('paid');
    expect((await one('SELECT status FROM supplier_invoices WHERE id = $1', [inv1.id])).status).toBe('approved');   // 2000 of 2280 paid
    expect((await finance.supplierInvoiceOutstanding(db.query, inv1.id)).outstanding).toBe(280);
    for (const p of released.body.data.payments) {
      const posted = await entryFor('supplier_payment', p.id);
      expect([posted.debit, posted.credit]).toEqual([Number(p.amount), Number(p.amount)]);
    }
    const apAfter = Number((await one("SELECT COALESCE(SUM(l.credit - l.debit), 0) AS s FROM journal_entry_lines l JOIN accounts a ON a.id = l.account_id WHERE a.code = $1", [await codeOf('payable')])).s);
    expect(apAfter - apBefore).toBeCloseTo(-3140, 2);                                                            // the invoices accrued earlier; the batch paid 3140
    expect((await call('POST', `${url}/${b.id}/release`, users.apAcc)).body.error_code).toBe('payment_batch_not_approved');   // a second release pays nothing
    expect((await call('POST', `${url}/${b.id}/cancel`, users.owner, { reason: 'too late to cancel' })).body.error_code).toBe('payment_batch_cannot_cancel');
    // cancel frees the money; a batch whose invoice was paid elsewhere between approval and release fails whole
    const b2 = (await call('POST', url, users.apAcc, { items: [{ supplier_invoice_id: inv1.id }] })).body.data;
    expect((await call('POST', `${url}/${b2.id}/cancel`, users.cm, { reason: 'wrong bank account' })).status).toBe(403);   // cm has no void on finance-ledger
    expect((await call('POST', `${url}/${b2.id}/cancel`, users.coo, { reason: 'wrong bank account' })).body.data.status).toBe('cancelled');
    const b3 = (await call('POST', url, users.apAcc, { items: [{ supplier_invoice_id: inv1.id }] })).body.data;
    await call('POST', `${url}/${b3.id}/submit`, users.apAcc); await call('POST', `${url}/${b3.id}/approve`, users.coo);
    const direct = await call('POST', '/api/payments', users.owner, { project_id: pA, direction: 'ap', supplier_id: supplier1, amount: 280, payment_date: '2026-05-12' });
    await call('POST', '/api/finance-ledger/payments/' + direct.body.data.id + '/allocate', users.owner, { allocations: [{ target_type: 'supplier_invoice', supplier_invoice_id: inv1.id, amount: 280 }] });
    const failed = await call('POST', `${url}/${b3.id}/release`, users.apAcc);
    expect(failed.status).toBe(400);
    expect(failed.body.error_code).toBe('payment_exceeds_payable');
    expect((await one('SELECT status FROM payment_batches WHERE id = $1', [b3.id])).status).toBe('approved');          // nothing half-paid
    expect((await all('SELECT id FROM payment_batch_items WHERE batch_id = $1 AND payment_id IS NOT NULL', [b3.id]))).toHaveLength(0);
  });

  // --------------------------------------------------------------------------------------------------
  test('12. supplier invoice workflow: the approval step is the accrual point, once, in the same transaction', async () => {
    const before = await projectCost(pA);
    const invoice = await makeServiceInvoice({ total: 1140, tax: 140, approve: false });
    const url = `/api/procurement/invoices/${invoice.id}/workflow`;
    expect((await call('POST', `${url}/decide`, users.owner, { decision: 'approve' })).body.error_code).toBe('workflow_not_started');
    const started = await call('POST', `${url}/start`, users.owner);
    expect(started.status).toBe(200);
    expect(started.body.data.workflow).toMatchObject({ status: 'active', current_step_key: 'match_certificate' });
    expect((await call('POST', `${url}/start`, users.owner)).body.error_code).toBe('workflow_already_started');
    expect(await projectCost(pA)).toBeCloseTo(before, 2);                                  // nothing accrued yet
    const m = await call('POST', `${url}/decide`, users.owner, { decision: 'approve', comment: 'matched' });
    expect(m.body.data.workflow.current_step_key).toBe('ap_review');
    const ap = await call('POST', `${url}/decide`, users.owner, { decision: 'approve' });
    expect(ap.body.data.workflow.current_step_key).toBe('approval');
    expect(await projectCost(pA)).toBeCloseTo(before, 2);                                  // still nothing: the approval step is next
    const approval = await call('POST', `${url}/decide`, users.owner, { decision: 'approve' });
    expect(approval.status).toBe(200);
    expect(approval.body.data.approval.invoice.status).toBe('approved');
    expect(await projectCost(pA)).toBeCloseTo(before + 1000, 2);                           // accrued exactly once
    expect((await all("SELECT id FROM project_costs WHERE source_type = 'supplier_invoice' AND source_id = $1", [invoice.id]))).toHaveLength(1);
    expect((await call('POST', `/api/procurement/invoices/${invoice.id}/approve`, users.owner)).status).toBe(409);   // the shortcut cannot accrue again
    // a rejection ends the workflow and accrues nothing
    const inv2 = await makeServiceInvoice({ total: 114, tax: 14, approve: false });
    await call('POST', `/api/procurement/invoices/${inv2.id}/workflow/start`, users.owner);
    await call('POST', `/api/procurement/invoices/${inv2.id}/workflow/decide`, users.owner, { decision: 'reject', comment: 'not our order' });
    expect((await one('SELECT status FROM supplier_invoices WHERE id = $1', [inv2.id])).status).toBe('received');
    expect((await all("SELECT id FROM project_costs WHERE source_type = 'supplier_invoice' AND source_id = $1", [inv2.id]))).toHaveLength(0);
    expect((await call('POST', `/api/procurement/invoices/${inv2.id}/workflow/decide`, users.owner, { decision: 'approve' })).body.error_code).toBe('workflow_closed');
  });

  // --------------------------------------------------------------------------------------------------
  test('13. role matrix: internal API and /api/v1 answer alike; QS has no internal cost; project seats cannot reach another project', async () => {
    const g = (await call('POST', '/api/commercial/guarantees', users.cm, { guarantee_type: 'retention', project_id: pA, amount: 1000, expires_on: '2027-12-31' })).body.data;
    const gB = (await call('POST', '/api/commercial/guarantees', users.cm, { guarantee_type: 'retention', project_id: pB, amount: 1000, expires_on: '2027-12-31' })).body.data;
    const bv = (await call('POST', '/api/commercial/budget-versions', users.cm, { project_id: pB, name: 'matrix', lines: [{ cost_code_id: cc1, amount: 5 }] })).body.data;
    const cn = (await call('POST', '/api/finance-ledger/credit-notes', users.arAcc, { party_type: 'client', invoice_id: (await makeClientInvoice(100)).id, amount: 10, reason: 'matrix check' })).body.data;
    const reads = [
      ['guarantee', (u) => call('GET', `/api/commercial/guarantees/${g.id}`, u), (u) => call('GET', `/api/v1/guarantees/${g.id}`, u)],
      ['guarantees', (u) => call('GET', '/api/commercial/guarantees', u), (u) => call('GET', '/api/v1/guarantees', u)],
      ['budget', (u) => call('GET', `/api/commercial/budget-versions/${bv.id}`, u), (u) => call('GET', `/api/v1/budgets/${bv.id}`, u)],
      ['budgets of a project', (u) => call('GET', `/api/commercial/project/${pB}/budget-versions`, u), (u) => call('GET', `/api/v1/budgets/projects/${pB}`, u)],
      ['credit notes', (u) => call('GET', '/api/finance-ledger/credit-notes', u), (u) => call('GET', '/api/v1/credit-notes', u)],
      ['payment batches', (u) => call('GET', '/api/finance-ledger/payment-batches', u), (u) => call('GET', '/api/v1/payment-batches', u)],
    ];
    const expected = {
      guarantee: { owner: 200, cm: 200, qs: 200, coo: 200, keeper: 403, client: 403, fresh: 403 },
      guarantees: { owner: 200, cm: 200, qs: 200, coo: 200, keeper: 403, client: 403, fresh: 403 },
      budget: { owner: 200, cm: 200, coo: 200, qs: 403, keeper: 403, client: 403, fresh: 403 },                 // decision 8: QS has no see_internal_cost
      'budgets of a project': { owner: 200, cm: 200, coo: 200, qs: 403, keeper: 403, client: 403, fresh: 403 },
      'credit notes': { owner: 200, apAcc: 200, arAcc: 200, coo: 200, qs: 403, keeper: 403, client: 403, fresh: 403 },
      'payment batches': { owner: 200, apAcc: 200, coo: 200, arAcc: 200, qs: 403, keeper: 403, client: 403, fresh: 403 },
    };
    for (const [name, internal, v1] of reads) {
      for (const [who, status] of Object.entries(expected[name])) {
        expect([name, who, 'internal', (await internal(users[who])).status]).toEqual([name, who, 'internal', status]);
        expect([name, who, 'v1', (await v1(users[who])).status]).toEqual([name, who, 'v1', status]);
      }
    }
    // writes: each verb is its own action
    const writes = [
      ['create guarantee', (u) => call('POST', '/api/commercial/guarantees', u, { guarantee_type: 'bid', project_id: pA, amount: 1, expires_on: '2027-01-01' }), { cm: 201, qs: 201, coo: 201, keeper: 403, client: 403, fresh: 403 }],
      ['close guarantee (void)', (u) => call('POST', `/api/commercial/guarantees/${g.id}/close`, u, { status: 'released', reason: 'matrix probe' }), { qs: 403, keeper: 403, client: 403, fresh: 403 }],
      ['decide budget (approve)', (u) => call('POST', `/api/commercial/budget-versions/${bv.id}/decide`, u, { decision: 'approve' }), { qs: 403, apAcc: 403, keeper: 403, client: 403, fresh: 403 }],
      ['issue credit note', (u) => call('POST', `/api/finance-ledger/credit-notes/${cn.id}/issue`, u), { qs: 403, apAcc: 403, keeper: 403, client: 403, fresh: 403 }],
      ['release batch (record_payment)', (u) => call('POST', '/api/finance-ledger/payment-batches/1/release', u), { qs: 403, arAcc: 403, keeper: 403, client: 403, fresh: 403 }],
      ['start invoice workflow (submit)', (u) => call('POST', '/api/procurement/invoices/1/workflow/start', u), { keeper: 403, client: 403, fresh: 403 }],
      ['adjust commitment (approve)', (u) => call('POST', '/api/commercial/commitments/1/adjust', u, { cancelled_amount: 0, reason: 'matrix probe' }), { qs: 403, apAcc: 403, keeper: 403, client: 403, fresh: 403 }],
    ];
    for (const [name, run, byUser] of writes) {
      for (const [who, status] of Object.entries(byUser)) expect([name, who, (await run(users[who])).status]).toEqual([name, who, status]);
    }
    // the same refusals through /api/v1
    expect((await call('POST', '/api/v1/guarantees', users.keeper, { guarantee_type: 'bid', project_id: pA, amount: 1, expires_on: '2027-01-01' })).status).toBe(403);
    expect((await call('POST', `/api/v1/credit-notes/${cn.id}/issue`, users.apAcc)).status).toBe(403);
    expect((await call('POST', `/api/v1/budgets/${bv.id}/decide`, users.qs, { decision: 'approve' })).status).toBe(403);
    // a project-bound seat: its own project yes, another project's record no (404-proof: 403, not data)
    expect((await call('GET', `/api/commercial/guarantees/${g.id}`, users.cmA)).status).toBe(200);
    expect((await call('GET', `/api/commercial/guarantees/${gB.id}`, users.cmA)).status).toBe(403);
    expect((await call('GET', `/api/v1/guarantees/${gB.id}`, users.cmA)).status).toBe(403);
    expect((await call('GET', `/api/commercial/budget-versions/${bv.id}`, users.cmA)).status).toBe(403);
    expect((await call('GET', `/api/commercial/project/${pB}/commitments`, users.cmA)).status).toBe(403);
    expect((await call('POST', '/api/commercial/guarantees', users.cmA, { guarantee_type: 'bid', project_id: pB, amount: 1, expires_on: '2027-01-01' })).status).toBe(403);
    // payment batches span projects: a project-bound seat is refused whatever its grant
    const scoped = await call('GET', '/api/finance-ledger/payment-batches', users.cmA);
    expect([scoped.status, scoped.body.error_code]).toEqual([403, 'company_scope_required']);
    expect((await call('GET', '/api/v1/payment-batches', users.cmA)).status).toBe(403);
    const mine = (await call('GET', '/api/commercial/guarantees', users.cmA)).body.data;
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((x) => x.project_id === pA)).toBe(true);
  });

  // --------------------------------------------------------------------------------------------------
  test('14. reconciliation: cost rows tie to ledger entries, every entry balances, the new kinds are covered', async () => {
    const unbalanced = await all(`SELECT je.id FROM journal_entries je JOIN journal_entry_lines l ON l.journal_entry_id = je.id
      WHERE je.reference_type LIKE '%credit_note%' OR je.reference_type = 'supplier_payment' GROUP BY je.id HAVING SUM(l.debit) <> SUM(l.credit)`);
    expect(unbalanced).toHaveLength(0);
    const orphans = await all(`SELECT pc.id, pc.source_type FROM project_costs pc WHERE pc.source_type IN ('supplier_credit_note', 'supplier_credit_note_void')
      AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = pc.source_id
        AND je.reference_type = CASE pc.source_type WHEN 'supplier_credit_note' THEN 'supplier_credit_note_cost' ELSE 'supplier_credit_note_cost_void' END)`);
    expect(orphans).toHaveLength(0);
    // the whole-database reconcile checks run against restored copies (scripts/reconcile-database.js); this suite shares its
    // database with others, so it asserts only on the rows it created: every cost row of this suite's projects has its entry
    const mine = await all(`SELECT pc.id FROM project_costs pc WHERE pc.project_id = ANY($1) AND pc.source_type IN ('supplier_invoice', 'supplier_credit_note', 'supplier_credit_note_void')
      AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = pc.source_id AND je.reference_type = CASE pc.source_type
        WHEN 'supplier_invoice' THEN 'supplier_invoice_cost' WHEN 'supplier_credit_note' THEN 'supplier_credit_note_cost' ELSE 'supplier_credit_note_cost_void' END)`, [made.projects]);
    expect(mine).toHaveLength(0);
  });
});
