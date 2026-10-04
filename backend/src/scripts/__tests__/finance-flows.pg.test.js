// Real PostgreSQL + real app. Ported from the mock suite finance.test.js: the certificate arithmetic with
// NUMERIC(15,2) values read back from the database, the previous cumulative that prevents double-certification,
// the payment-allocation invariants across two invoices (never over an invoice's outstanding, never over a
// payment's amount, repeated lines for one document counted together), the retention ledger (released ≤ held),
// the AP review queue fed by real three-way-match exceptions, and the company finance dashboard reconciled
// against tagged rows this suite inserted.
//
// Runs the real financeEngine/commercialEngine/procurementService in real transactions against the throwaway
// database — no HTTP needed: this service surface is the one the routes call (see routes/financeLedger.js).
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('finance flows (real PostgreSQL, real app)', () => {
  let db; let finance; let svc; let commercial; let fin; let decider;
  const tag = String(Date.now()).slice(-7);
  let seq = 0;
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const all = async (sql, params) => (await db.query(sql, params)).rows;
  const num = (v) => Math.round(Number(v) * 100) / 100;
  const money = (v) => Number(v).toFixed(2);
  const tx = (fn) => db.transaction((client) => fn(client.query.bind(client)));
  const made = { projects: [], suppliers: [], invoices: [], payments: [], clients: [], users: [] };

  const issueInvoice = async (invoice) => {
    await tx((q) => finance.transitionInvoice(q, invoice.id, 'approved', fin));
    await tx((q) => finance.transitionInvoice(q, invoice.id, 'issued', fin));
  };

  beforeAll(async () => {
    db = require('../../config/database');
    finance = require('../../services/financeEngine');
    svc = require('../../services/procurementService');
    commercial = require('../../services/commercialEngine');
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ('fin-owner', $1, 'x', 'finance_manager') RETURNING id, token_version", [`fin-${tag}@test.io`]);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'finance_manager'", [row.id]);
    fin = { id: row.id, name: 'fin-owner', role: 'finance_manager' };
    // Decisions on the dashboard PO need a privileged user (self-approval guard).
    const ownerRow = await one("INSERT INTO users (name, email, password, role) VALUES ('fin-decider', $1, 'x', 'owner') RETURNING id, token_version", [`find-${tag}@test.io`]);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [ownerRow.id]);
    made.users.push(ownerRow.id);
    decider = { id: ownerRow.id, name: 'fin-decider', role: 'owner' };
    // The project the tagged figures live on: budget 60000, contract 100000 (margin reconciliation in test 9).
    made.projects[0] = (await one(
      "INSERT INTO projects (name, name_en, code, status, budget, contract_value) VALUES ($1, $1, $2, 'active', 60000, 100000) RETURNING id",
      [`finp-${tag}`, `FP${tag}`.slice(0, 20)])).id;
    // Client valuations carry a client (invoices.client_id is NOT NULL on the real schema).
    made.clients[0] = (await one("INSERT INTO clients (code, name_en, name_ar, client_type) VALUES ($1, $1, $1, 'test') RETURNING id", [`b2fin-c-${tag}`])).id;
  });

  afterAll(async () => {
    for (const u of [fin.id, ...made.users]) {
      await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [u]);
      await db.query('UPDATE users SET is_active = false WHERE id = $1', [u]);
    }
    await db.pool.end();
  });

  test('1. client valuation arithmetic on real schema: certified gross/deductions/tax/net as exact NUMERIC(15,2)', async () => {
    seq += 1;
    const inv = await tx((q) => finance.createClientValuation(q, {
      project_id: made.projects[0], client_id: made.clients[0], gross_current_work: 5000, approved_variations_period: 10000,
      retention: 2000, advance_recovery: 500, other_deductions: 300, tax_pct: 14,
      created_by: fin.id, actor_name: fin.name,
    }));
    made.invoices.push(inv.id);
    expect(inv.status).toBe('draft');
    const row = await one('SELECT * FROM invoices WHERE id = $1', [inv.id]);
    // Certified gross = 5000 + 10000 = 15000; net before tax = 15000 − 2000 − 500 − 300 = 12200;
    // tax 14% = 1708; net = 13908. Read back from the NUMERIC(15,2) columns, not from the response.
    expect(money(row.certified_gross)).toBe('15000.00');
    expect(money(row.retention_amount)).toBe('2000.00');
    expect(money(row.advance_recovery)).toBe('500.00');
    expect(money(row.other_deductions)).toBe('300.00');
    expect(money(row.tax_amount)).toBe('1708.00');
    expect(money(row.net_amount)).toBe('13908.00');
    expect(money(row.amount)).toBe('13908.00');
    expect(row.invoice_number).toMatch(/^INV-/);
    // The create is audited.
    expect(await all("SELECT id FROM audit_events WHERE entity_type = 'invoice' AND event_type = 'create' AND entity_id = $1", [inv.id])).toHaveLength(1);
  });

  test('2. previous cumulative prevents double-certification across two periods', async () => {
    const prior = num((await one("SELECT COALESCE(MAX(cumulative_certified), 0) c FROM invoices WHERE project_id = $1 AND status NOT IN ('cancelled','void')", [made.projects[0]])).c);
    const second = await tx((q) => finance.createClientValuation(q, {
      project_id: made.projects[0], client_id: made.clients[0], gross_current_work: 8000, tax_pct: 0,
      created_by: fin.id, actor_name: fin.name,
    }));
    made.invoices.push(second.id);
    expect(money(second.previous_cumulative)).toBe(money(prior));          // the prior cumulative carried
    expect(money(second.cumulative_certified)).toBe(money(prior + 8000));
    expect(money(second.net_amount)).toBe('8000.00');
    // A third period adds on the newest maximum, not the sum of the cumulative rows.
    const third = await tx((q) => finance.createClientValuation(q, {
      project_id: made.projects[0], client_id: made.clients[0], gross_current_work: 1000, tax_pct: 0,
      created_by: fin.id, actor_name: fin.name,
    }));
    made.invoices.push(third.id);
    expect(money(third.previous_cumulative)).toBe(money(prior + 8000));
    expect(money(third.cumulative_certified)).toBe(money(prior + 9000));
  });

  describe('payment allocations', () => {
    let invoiceC; let invoiceD; let payment;
    beforeAll(async () => {
      invoiceC = await tx((q) => finance.createClientValuation(q, {
        project_id: made.projects[0], client_id: made.clients[0], gross_current_work: 5000, tax_pct: 0, created_by: fin.id, actor_name: fin.name,
      }));
      invoiceD = await tx((q) => finance.createClientValuation(q, {
        project_id: made.projects[0], client_id: made.clients[0], gross_current_work: 3000, tax_pct: 0, created_by: fin.id, actor_name: fin.name,
      }));
      made.invoices.push(invoiceC.id, invoiceD.id);
      await issueInvoice(invoiceC);
      await issueInvoice(invoiceD);
      payment = await one(
        "INSERT INTO payments (project_id, client_id, amount, payment_date, direction) VALUES ($1, NULL, 9500, CURRENT_DATE, 'ar') RETURNING *",
        [made.projects[0]]);
      made.payments.push(payment.id);
    });

    test('3. allocatePayment reconciles across two invoices: the money follows the allocations and the status follows the money', async () => {
      const r = await tx((q) => finance.allocatePayment(q, {
        payment_id: payment.id,
        allocations: [
          { target_type: 'client_invoice', invoice_id: invoiceC.id, amount: 5000 },
          { target_type: 'client_invoice', invoice_id: invoiceD.id, amount: 2000 },
        ],
        allocated_by: fin.id, actor_name: fin.name,
      }));
      expect(r.allocations).toHaveLength(2);
      const balC = await finance.invoiceOutstanding(db.query, invoiceC.id);
      const balD = await finance.invoiceOutstanding(db.query, invoiceD.id);
      expect(money(balC.allocated)).toBe('5000.00');
      expect(money(balC.outstanding)).toBe('0.00');
      expect(money(balD.outstanding)).toBe('1000.00');
      expect((await one('SELECT status FROM invoices WHERE id = $1', [invoiceC.id])).status).toBe('paid');
      expect((await one('SELECT status FROM invoices WHERE id = $1', [invoiceD.id])).status).toBe('partially_paid');
      expect(await all("SELECT id FROM payment_allocations WHERE payment_id = $1 AND target_type = 'client_invoice'", [payment.id])).toHaveLength(2);
    });

    test('4. an allocation can never exceed the invoice outstanding', async () => {
      await expect(tx((q) => finance.allocatePayment(q, {
        payment_id: payment.id,
        allocations: [{ target_type: 'client_invoice', invoice_id: invoiceD.id, amount: 2000 }],
        allocated_by: fin.id,
      }))).rejects.toThrow(/exceeds the invoice's outstanding/);
      expect(money((await finance.invoiceOutstanding(db.query, invoiceD.id)).outstanding)).toBe('1000.00');
    });

    test('5. an allocation total can never exceed the payment amount', async () => {
      // 7000 is already allocated on the 9500 payment; asking for 7000 more exceeds it.
      await expect(tx((q) => finance.allocatePayment(q, {
        payment_id: payment.id,
        allocations: [{ target_type: 'client_invoice', invoice_id: invoiceD.id, amount: 7000 }],
        allocated_by: fin.id,
      }))).rejects.toThrow(/exceeds the payment amount/);
    });

    test('6. repeated lines for one invoice in one request cannot exceed its balance in a single pass', async () => {
      await expect(tx((q) => finance.allocatePayment(q, {
        payment_id: payment.id,
        allocations: [
          { target_type: 'client_invoice', invoice_id: invoiceD.id, amount: 600 },
          { target_type: 'client_invoice', invoice_id: invoiceD.id, amount: 600 },
        ],
        allocated_by: fin.id,
      }))).rejects.toThrow(/exceeds the invoice's outstanding/);
      // The refused request wrote nothing: the balance is untouched.
      expect(money((await finance.invoiceOutstanding(db.query, invoiceD.id)).outstanding)).toBe('1000.00');
      // Every document this suite touched closes in balance.
      for (const inv of await all('SELECT id FROM invoices WHERE id = ANY($1::int[])', [made.invoices])) {
        const bal = await finance.invoiceOutstanding(db.query, inv.id);
        expect(Number(bal.outstanding)).toBeGreaterThanOrEqual(0);
        expect(Number(bal.allocated)).toBeLessThanOrEqual(Number(bal.net));
      }
      const allocSum = num((await one('SELECT COALESCE(SUM(amount), 0) s FROM payment_allocations WHERE payment_id = $1 AND voided_at IS NULL', [payment.id])).s);
      expect(allocSum).toBeLessThanOrEqual(num(payment.amount));
    });
  });

  test('7. retention: held then released reconciles exactly; over-release is refused', async () => {
    seq += 1;
    const project = (await one("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`ret-${tag}-7`, `FR${tag}7`.slice(0, 20)])).id;
    made.projects.push(project);
    await tx((q) => finance.recordRetention(q, { project_id: project, party_type: 'subcontractor', direction: 'held', amount: 1500 }));
    let totals = await finance.retentionTotals(db.query, { project_id: project, party_type: 'subcontractor' });
    expect(money(totals.held)).toBe('1500.00');
    expect(money(totals.balance)).toBe('1500.00');
    await tx((q) => finance.recordRetention(q, { project_id: project, party_type: 'subcontractor', direction: 'released', amount: 1500 }));
    totals = await finance.retentionTotals(db.query, { project_id: project, party_type: 'subcontractor' });
    expect(money(totals.released)).toBe('1500.00');
    expect(money(totals.balance)).toBe('0.00');
    await expect(tx((q) => finance.recordRetention(q, {
      project_id: project, party_type: 'subcontractor', direction: 'released', amount: 100,
    }))).rejects.toThrow(/exceeds the held balance/);
  });

  test('8. AP review queue: real three-way-match exceptions feed syncApReviewQueue, idempotently', async () => {
    seq += 1;
    const supplier = (await one('INSERT INTO suppliers (code, name_en, name_ar) VALUES ($1, $1, $1) RETURNING id', [`apq-s-${tag}`])).id;
    made.suppliers.push(supplier);
    const po = await tx((q) => svc.createPurchaseOrder(q, {
      supplier_id: supplier, project_id: made.projects[0], taxes: 100, freight: 0, approved_charges: 0,
      lines: [{ material_id: null, description: `apq-${tag}`, quantity: 10, unit: 'ea', unit_rate: 100 }],
      created_by: fin.id,
    }));
    const { invoice } = await tx((q) => svc.recordSupplierInvoice(q, {
      supplier_id: supplier, purchase_order_id: po.id,
      invoice_number: `APQ-${tag}-${seq}`,
      total_amount: 2199, tax_amount: 999,
      lines: [{ purchase_order_line_id: po.lines[0].id, material_id: null, quantity: 10, unit_price: 120 }],
      created_by: fin.id,
    }));
    const row = await one('SELECT exceptions, match_status FROM supplier_invoices WHERE id = $1', [invoice.id]);
    expect(row.match_status).toBe('exception');
    const types = row.exceptions.map((e) => e.type);
    expect(types).toContain('price_variance');   // 120 vs PO 100 (> 2%) — flagged on the line and again by the header check
    expect(types).toContain('missing_grn');      // no GRN acceptance for the line
    expect(types).toContain('tax_mismatch');     // 999 vs PO taxes 100
    expect(types).toContain('quantity_variance');// invoiced 10 vs delivered 0

    const before = (await all("SELECT id FROM ap_review_queue WHERE supplier_invoice_id = $1 AND status = 'open'", [invoice.id]));
    expect(before).toHaveLength(0);
    await finance.syncApReviewQueue(db.query);
    const after = (await all("SELECT id FROM ap_review_queue WHERE supplier_invoice_id = $1 AND status = 'open'", [invoice.id]));
    // One open row per DISTINCT exception type (the queue is unique per invoice + type).
    expect(after.length).toBe(new Set(types).size);
    const again = await finance.syncApReviewQueue(db.query);
    expect(await all("SELECT id FROM ap_review_queue WHERE supplier_invoice_id = $1", [invoice.id])).toHaveLength(after.length); // idempotent
    void again;
  });

  test('9. company finance dashboard reconciles with the tagged rows this suite inserted', async () => {
    seq += 1;
    const project = made.projects[0];
    // Tagged dashboard inputs: an open PO (committed AP), a manual cost row, an AR cash payment,
    // and client-held retention, all on figures this suite controls.
    const supplier = (await one('INSERT INTO suppliers (code, name_en, name_ar) VALUES ($1, $1, $1) RETURNING id', [`dash-s-${tag}`])).id;
    made.suppliers.push(supplier);
    const po = await tx((q) => svc.createPurchaseOrder(q, {
      supplier_id: supplier, project_id: project, taxes: 100, freight: 0, approved_charges: 0,
      lines: [{ material_id: null, description: `dash-${tag}`, quantity: 10, unit: 'ea', unit_rate: 190 }],
      created_by: fin.id,
    }));
    expect(num(po.total_amount)).toBe(2000);
    // A committed order is issued through its approval workflow (owner/admin decide at every stage).
    await tx(async (q) => {
      await svc.issuePurchaseOrder(q, po.id, decider);
      let status = 'draft';
      for (let i = 0; i < 6 && status !== 'issued'; i += 1) {
        status = (await svc.decideOnDocument(q, 'purchase_order', po.id, decider, 'approve')).status;
      }
      expect(status).toBe('issued');
    });
    await db.query(
      "INSERT INTO project_costs (project_id, source_type, source_id, amount, description) VALUES ($1, 'manual_test', $2, 500, $3)",
      [project, Number(tag), `dashboard fixture ${tag}`]);
    const arPayment = await one(
      "INSERT INTO payments (project_id, amount, payment_date, direction) VALUES ($1, 2500, CURRENT_DATE, 'ar') RETURNING id",
      [project]);
    made.payments.push(arPayment.id);
    await tx((q) => finance.recordRetention(q, { project_id: project, party_type: 'client', direction: 'held', amount: 800 }));

    const dashboard = await finance.companyFinanceDashboard(db.query);

    // AR outstanding reconciles: bucket sums == totals == the SQL-derived outstanding of every open invoice.
    const totalAr = Object.values(dashboard.ar_aging).reduce((s, v) => s + num(v), 0);
    expect(money(totalAr)).toBe(money(dashboard.total_ar_outstanding));
    const arSql = `SELECT COALESCE(SUM(o), 0) s FROM (
          SELECT (CASE WHEN COALESCE(i.net_amount, 0) > 0 THEN i.net_amount ELSE i.amount END) - COALESCE(a.s, 0) AS o
            FROM invoices i
            LEFT JOIN (SELECT invoice_id, SUM(amount) s FROM payment_allocations
                        WHERE target_type = 'client_invoice' AND voided_at IS NULL GROUP BY invoice_id) a ON a.invoice_id = i.id
           WHERE COALESCE(i.status, 'draft') NOT IN ('cancelled', 'void')
             AND (CASE WHEN COALESCE(i.net_amount, 0) > 0 THEN i.net_amount ELSE i.amount END) > 0
        ) x WHERE o > 0`;
    const sqlAr = num((await one(arSql)).s);
    expect(money(dashboard.total_ar_outstanding)).toBe(money(sqlAr));
    expect(num(dashboard.total_ar_outstanding)).toBeGreaterThan(0);

    // The AP aging buckets likewise sum to the open supplier-invoice outstanding.
    const totalAp = Object.values(dashboard.ap_aging).reduce((s, v) => s + num(v), 0);
    expect(money(totalAp)).toBe(money(dashboard.total_ap_outstanding));

    // Cash collected = every non-voided AR payment in the books (this suite added 2500).
    const sqlCash = num((await one("SELECT COALESCE(SUM(amount), 0) s FROM payments WHERE direction = 'ar' AND voided_at IS NULL")).s);
    expect(money(dashboard.cash_collected)).toBe(money(sqlCash));
    expect(num(dashboard.cash_collected)).toBeGreaterThanOrEqual(2500);

    // Payments due = open POs ('issued','approved','confirmed') — this suite's 2000 PO is among them.
    const sqlDue = num((await one("SELECT COALESCE(SUM(total_amount), 0) s FROM purchase_orders WHERE status IN ('issued','approved','confirmed')")).s);
    expect(money(dashboard.payments_due)).toBe(money(sqlDue));
    expect(num(dashboard.payments_due)).toBeGreaterThanOrEqual(2000);

    // Retention: client-held 800 → receivable; subcontractor net → payable.
    const sqlRetention = async (party) => num((await one(
      `SELECT COALESCE(SUM(CASE WHEN direction = 'held' THEN amount ELSE -amount END), 0) s
         FROM retention_ledger WHERE party_type = $1`, [party])).s);
    expect(money(dashboard.retention_receivable)).toBe(money(await sqlRetention('client')));
    expect(money(dashboard.retention_payable)).toBe(money(await sqlRetention('subcontractor')));
    expect(num(dashboard.retention_receivable)).toBeGreaterThanOrEqual(800);

    // Project margins reconcile with the canonical engine and with the figures inserted here:
    // committed = the 2000 PO; actual = the 500 cost row; budget 60000 → EAC 60000 → profit 40000 → 40%.
    const mine = dashboard.project_margins.find((m) => m.project_id === project);
    expect(mine).toBeTruthy();
    const canonical = await tx((q) => commercial.projectCommercial(q, project));
    expect(Number(mine.forecast_margin_percent)).toBe(Number(canonical.forecast_margin_percent));
    expect(Number(mine.forecast_profit)).toBe(40000);
    expect(Number(mine.forecast_margin_percent)).toBeCloseTo(40, 2);
  });
});
