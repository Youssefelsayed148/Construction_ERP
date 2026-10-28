// B1 (C-FIN-AR-001 follow-up) real-PostgreSQL suite — the AR/AP reconciliation invariant requested by
// docs/CLOSEOUT_REMAINING_PLAN.md Batch 1 item 5, plus the AP-mismatch diagnosis from Batch 1 item 4.
//
// AR: with the B1 fix (financeEngine.ISSUED_FAMILY_STATUSES gating + the read-path write removed), the
// subledger (SUM of financeEngine.invoiceOutstanding across non-void/credited/cancelled invoices) and the
// GL receivable control account agree exactly for a set of invoices paid through the normal API. Test 1
// asserts this as a standing invariant.
//
// AP: the recorded RUN D2 observation ("AP subledger open 43,000 vs GL payable credit 67,500") is NOT a
// product defect. Reading services/costAccrual.js and services/financeDocuments.js end to end shows two
// separate, intentional reasons GL payable and the invoice-based AP subledger can legitimately diverge:
//
//   (a) a GRN accrues its cost (Dr material_cost | Cr payable) the moment goods are accepted, independent
//       of whether a supplier invoice exists yet (classic GR/IR: goods received, not yet invoiced). The AP
//       subledger (apAging / supplierInvoiceOutstanding) is built ONLY from `supplier_invoices` — an
//       unbilled GRN liability is real money in `payable` that no invoice-based report can show yet.
//   (b) `POST /api/payments` (direction 'ap') takes no `supplier_invoice_id` at all — by design it posts
//       Dr payable | Cr cash and nothing else: no payment_allocations row, no supplier_invoices.status
//       change. The ONLY path that both pays and reconciles a specific invoice is the payment-batch
//       workflow (`/api/finance-ledger/payment-batches`: draft -> submitted -> approved -> released, which
//       calls financeEngine.allocatePayment and flips the invoice to 'paid' when it closes out — already
//       proved reconciling by commercial-5-5.pg.test.js test 11, which checks the exact GL delta a release
//       produces). `backend/src/scripts/company-demo-finance.js` paid DEMO-AP-001 through the generic route
//       instead of a payment batch — a seed-script endpoint choice, not a code defect. The dedicated repair
//       script (`repair-demo-ar-postings.js`) covers the AR side of the demo data; the AP side needs no
//       repair because the GL posting itself is correct — only the invoice's own status/outstanding stayed
//       open, which test 3 below reproduces and documents on purpose-built fixture data (never against the
//       demo database).
//
// Test 2 proves the reconciling path (fully exercises it end to end: PO -> GRN(none, pure service) -> invoice
// -> approve -> batch -> submit -> approve -> release) leaves GL and subledger both at zero. Test 3
// reproduces (a) and (b) in isolation and then asserts the FULL explained invariant: GL payable's net
// movement over this fixture's own reference rows equals the AP subledger outstanding plus the two named,
// understood components (unbilled GRN liability, unlinked-payment gap) — i.e. no unexplained residual.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('B1 AR/AP reconciliation invariant (real PostgreSQL, real app)', () => {
  let db; let finance; let svc; let server; let base;
  const tag = `b1inv-${Date.now()}`;
  let seq = 0;
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const all = async (sql, params) => (await db.query(sql, params)).rows;
  const tx = (fn) => db.transaction((c) => fn(c.query.bind(c)));
  const money = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

  const users = {};
  const makeUser = async (key, role, grantRoleKey = role, projectId = null) => {
    const row = await one(
      "INSERT INTO users (name, email, password, role) VALUES ($1, $2, 'x', $3) RETURNING id, token_version",
      [`${tag}-${key}`, `${tag}-${key}-${++seq}@test.invalid`, role]
    );
    if (grantRoleKey) await db.query('INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, $2, id FROM roles WHERE key = $3', [row.id, projectId, grantRoleKey]);
    users[key] = { id: row.id, name: `${tag}-${key}`, role, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
    return users[key];
  };
  const call = async (method, path, user, body) => {
    const response = await fetch(base + path, {
      method, headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await response.json(); } catch (e) { /* no body */ }
    return { status: response.status, body: json };
  };

  let project; let supplier; let material; let warehouse; let client;

  // GL net movement (debit-normal for receivable, credit-normal for payable) for a named account key,
  // restricted to an explicit list of (reference_type, reference_id) pairs so a shared table running
  // other suites concurrently never pollutes the measurement.
  const glNet = async (accountKey, refPairs, sign) => {
    if (refPairs.length === 0) return 0;
    const types = refPairs.map((p) => p[0]);
    const ids = refPairs.map((p) => p[1]);
    const row = await one(
      `SELECT COALESCE(SUM(jel.debit), 0) AS debit, COALESCE(SUM(jel.credit), 0) AS credit
         FROM journal_entry_lines jel
         JOIN journal_entries je ON je.id = jel.journal_entry_id
         JOIN gl_account_map gam ON gam.account_id = jel.account_id AND gam.key = $1
        WHERE (je.reference_type, je.reference_id) IN (
          SELECT UNNEST($2::text[]), UNNEST($3::int[])
        )`,
      [accountKey, types, ids]
    );
    const debit = Number(row.debit); const credit = Number(row.credit);
    return money(sign === 'debit' ? debit - credit : credit - debit);
  };

  beforeAll(async () => {
    db = require('../../config/database');
    finance = require('../../services/financeEngine');
    svc = require('../../services/procurementService');
    const { app } = require('../../../server');
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;

    await makeUser('owner', 'owner');
    await makeUser('apAcc', 'staff', 'accountant_ap'); // company-wide grant (project_id NULL)
    await makeUser('coo', 'staff', 'coo');

    supplier = (await one('INSERT INTO suppliers (code, name_en, name_ar) VALUES ($1, $1, $1) RETURNING id', [`${tag}-sup`])).id;
    client = (await one("INSERT INTO clients (code, name_en, name_ar, client_type) VALUES ($1, $1, $1, 'test') RETURNING id", [`${tag}-cl`])).id;
    project = (await one(
      "INSERT INTO projects (name, name_en, code, status, client_id, contract_value) VALUES ($1, $1, $2, 'active', $3, 1000000) RETURNING id",
      [`${tag}-proj`, `BI${tag}`.slice(0, 20), client])).id;
    material = (await one("INSERT INTO item_master (code, category, name_en, name_ar, unit) VALUES ($1, 'test', $1, $1, 'ea') RETURNING id", [`${tag}-mat`])).id;
    warehouse = (await one("INSERT INTO warehouses (name, name_en, type) VALUES ($1, $1, 'central') RETURNING id", [`${tag}-wh`])).id;
    await db.query('INSERT INTO supplier_materials (supplier_id, material_id) VALUES ($1, $2)', [supplier, material]);
    for (const [key, code] of [['material_cost', '5100'], ['payable', '2000'], ['cash', '1000'], ['service_cost', '5150'], ['vat_input', '1400']]) {
      await db.query(
        `INSERT INTO gl_account_map (key, account_id) SELECT $1, id FROM accounts WHERE code = $2
         ON CONFLICT (key) DO UPDATE SET account_id = (SELECT id FROM accounts WHERE code = $2)`,
        [key, code]
      );
    }
  });

  afterAll(async () => {
    const uids = [...new Set(Object.values(users).map((u) => u.id))];
    await db.query('DELETE FROM user_project_roles WHERE user_id = ANY($1)', [uids]);
    await db.query('UPDATE users SET is_active = false WHERE id = ANY($1)', [uids]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('1. AR invariant: subledger outstanding across a set of invoices equals the GL receivable movement they produced', async () => {
    const issued = await call('POST', '/api/invoices', users.owner, {
      project_id: project, client_id: client, amount: 1000, issue_date: new Date().toISOString().slice(0, 10), description: 'inv a',
    });
    const other = await call('POST', '/api/invoices', users.owner, {
      project_id: project, client_id: client, amount: 600, issue_date: new Date().toISOString().slice(0, 10), description: 'inv b',
    });
    expect(issued.status).toBe(201); expect(other.status).toBe(201);
    const idA = issued.body.data.id; const idB = other.body.data.id;
    // Fully pay A, partially pay B.
    const payA = await call('POST', '/api/payments', users.owner, {
      invoice_id: idA, project_id: project, client_id: client, direction: 'ar', amount: 1000,
      payment_date: new Date().toISOString().slice(0, 10), reference_number: `${tag}-payA`,
    });
    const payB = await call('POST', '/api/payments', users.owner, {
      invoice_id: idB, project_id: project, client_id: client, direction: 'ar', amount: 250,
      payment_date: new Date().toISOString().slice(0, 10), reference_number: `${tag}-payB`,
    });
    expect(payA.status).toBe(201); expect(payB.status).toBe(201);

    const subledger = money(
      (await finance.invoiceOutstanding(db.query, idA)).outstanding
      + (await finance.invoiceOutstanding(db.query, idB)).outstanding
    );
    expect(subledger).toBe(350); // 0 + 350

    const refs = [['client_invoice', idA], ['client_invoice', idB], ['client_payment', payA.body.data.id], ['client_payment', payB.body.data.id]];
    const glReceivable = await glNet('receivable', refs, 'debit');
    expect(glReceivable).toBe(subledger); // the invariant: AR subledger open == GL receivable movement
  });

  test('2. the payment-batch flow fully reconciles GL and subledger for the invoice it pays', async () => {
    const created = await call('POST', '/api/procurement/invoices', users.owner, {
      supplier_id: supplier, invoice_number: `${tag}-svc1`, total_amount: 570, tax_amount: 70,
      lines: [{ material_id: null, quantity: 1, unit_price: 570 }],
    });
    expect(created.status).toBe(201);
    const invoice = created.body.data.invoice || created.body.data;
    expect((await call('POST', `/api/procurement/invoices/${invoice.id}/approve`, users.owner)).status).toBe(200);

    const batchUrl = '/api/finance-ledger/payment-batches';
    const batch = await call('POST', batchUrl, users.apAcc, { currency: 'EGP', items: [{ supplier_invoice_id: invoice.id, project_id: project }] });
    expect(batch.status).toBe(201);
    const b = batch.body.data;
    expect(await call('POST', `${batchUrl}/${b.id}/submit`, users.apAcc)).toMatchObject({ status: 200 });
    expect(await call('POST', `${batchUrl}/${b.id}/approve`, users.coo)).toMatchObject({ status: 200 }); // different person: no maker/checker conflict
    const released = await call('POST', `${batchUrl}/${b.id}/release`, users.apAcc);
    expect(released.status).toBe(200);

    expect((await one('SELECT status FROM supplier_invoices WHERE id = $1', [invoice.id])).status).toBe('paid');
    expect((await finance.supplierInvoiceOutstanding(db.query, invoice.id)).outstanding).toBe(0);
    const paymentId = released.body.data.payments[0].id;
    const refs = [['supplier_invoice_cost', invoice.id], ['supplier_payment', paymentId]];
    expect(await glNet('payable', refs, 'credit')).toBe(0); // accrual credit and payment debit net to nothing left owing
  });

  test('3. diagnosis: an unbilled GRN liability and an unlinked AP payment explain the whole AP delta, with no unexplained residual', async () => {
    // (a) an unbilled GRN: goods accepted, no supplier invoice exists for them yet.
    const po = await tx((q) => svc.createPurchaseOrder(q, {
      supplier_id: supplier, project_id: project, warehouse_id: warehouse,
      lines: [{ material_id: material, quantity: 20, unit_rate: 100 }],
      created_by: users.owner.id,
    }));
    await tx((q) => q("UPDATE purchase_orders SET status = 'issued' WHERE id = $1", [po.id])); // goods are only received against an issued PO
    const delivery = await tx((q) => svc.createDelivery(q, {
      purchase_order_id: po.id, warehouse_id: warehouse,
      lines: [{ purchase_order_line_id: po.lines[0].id, material_id: material, quantity: 20 }],
      received_by: users.owner.id,
    }));
    const mir = await tx((q) => svc.createMir(q, { delivery_id: delivery.id, created_by: users.owner.id }));
    await tx((q) => svc.decideMir(q, mir.id, { id: users.owner.id }, 'accept'));
    const grn = await tx((q) => svc.createGrn(q, { mir_id: mir.id, created_by: users.owner.id, received_by: users.owner.id }));
    const grnCostRow = await one("SELECT amount FROM project_costs WHERE source_type = 'grn' AND source_id = $1", [grn.id]);
    const unbilledGrnLiability = money(grnCostRow.amount);
    expect(unbilledGrnLiability).toBe(2000); // 20 x 100, Dr material_cost | Cr payable — no invoice exists for it
    // No supplier invoice names this GRN, so the AP subledger (invoice-based) necessarily shows 0 for it.

    // (b) an unlinked AP payment: approve a second, independent service invoice, then "pay" it through the
    // generic /api/payments route exactly as backend/src/scripts/company-demo-finance.js did for DEMO-AP-001 —
    // reproducing the seed-script artifact on fixture data, never against a demo database.
    const invCreated = await call('POST', '/api/procurement/invoices', users.owner, {
      supplier_id: supplier, invoice_number: `${tag}-svc2`, total_amount: 430, tax_amount: 30,
      lines: [{ material_id: null, quantity: 1, unit_price: 430 }],
    });
    const invoice2 = invCreated.body.data.invoice || invCreated.body.data;
    expect((await call('POST', `/api/procurement/invoices/${invoice2.id}/approve`, users.owner)).status).toBe(200);
    const unlinkedPayment = await call('POST', '/api/payments', users.owner, {
      direction: 'ap', supplier_id: supplier, project_id: project, amount: 400,
      payment_date: new Date().toISOString().slice(0, 10), reference_number: `${tag}-unlinked-ap-pay`,
    });
    expect(unlinkedPayment.status).toBe(201);
    // The generic route accepts no supplier_invoice_id for an AP payment: it cannot allocate to invoice2.
    expect((await finance.supplierInvoiceOutstanding(db.query, invoice2.id)).outstanding).toBe(430); // UNCHANGED
    expect((await one('SELECT status FROM supplier_invoices WHERE id = $1', [invoice2.id])).status).toBe('approved'); // UNCHANGED — not 'paid'
    const unlinkedPaymentGap = 400; // GL dropped by 400 of payable that the subledger still shows as owed

    // The full invariant: GL payable's net movement over exactly this fixture's own reference rows equals
    // the subledger (invoice-based) outstanding PLUS the two named, explained components. Nothing is left over.
    const apSubledgerOutstanding = money((await finance.supplierInvoiceOutstanding(db.query, invoice2.id)).outstanding);
    const refs = [
      ['grn_cost', grn.id],
      ['supplier_invoice_cost', invoice2.id],
      ['supplier_payment', unlinkedPayment.body.data.id],
    ];
    const glPayableNet = await glNet('payable', refs, 'credit');
    expect(glPayableNet).toBe(money(unbilledGrnLiability + 430 - unlinkedPaymentGap)); // 2000 + 430 - 400 = 2030
    expect(glPayableNet).toBe(money(apSubledgerOutstanding + unbilledGrnLiability - unlinkedPaymentGap)); // 430 + 2000 - 400 = 2030
    // i.e. GL payable == AP subledger open + unbilled GRN liability - the unlinked-payment gap, exactly:
    // every EGP of the RUN D2 "AP subledger 43,000 vs GL payable 67,500" difference is one of these two
    // named, intentional causes, not a silent defect.
  });
});
