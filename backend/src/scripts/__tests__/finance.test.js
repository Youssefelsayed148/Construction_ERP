// Phase 14 tests — AR/AP ledgers, valuations, allocations, reminders.
//
// Coverage:
//   - migration: valuation columns on invoices, payment_allocations,
//     ap_review_queue, receivable_reminders, tax_codes, audit_events
//   - the certificate calculation exactly: Gross Current Work + Approved
//     Variations = Gross Certified; − Retention − Advance Recovery − Other
//     Deductions + Tax = Net; cumulative tracking prevents double-certification
//   - allocation invariants: never over an invoice's outstanding, never over
//     a payment's amount; invoice status follows the money (audit-trail on
//     every create/status change)
//   - retention: released ≤ held, and released == held reconciles
//   - AP review queue fed from Phase 12 three-way-match exceptions
//   - the receivable reminder engine (7-before / due today / 7-14-30 overdue
//     escalation through the Phase 7 notification engine)
//   - AR/AP aging + the company finance dashboard

const { MockDb } = require('../test-helpers/mock-db');
const financeMigration = require('../finance-migration');
const finance = require('../../services/financeEngine');
const commercialEngine = require('../../services/commercialEngine');

const db = new MockDb();
const q = (sql, params) => db.query(sql, params);

const NOW = new Date('2026-09-18T10:00:00Z');
const FINANCE = { id: 5, name: 'CFO', role: 'finance_manager' };

function futureDate(days) {
  return new Date(NOW.getTime() + days * 86400000).toISOString().slice(0, 10);
}
function pastDate(days) {
  return new Date(NOW.getTime() - days * 86400000).toISOString().slice(0, 10);
}

async function buildFixture() {
  await q(`CREATE TABLE IF NOT EXISTS projects (id SERIAL PRIMARY KEY, name VARCHAR(255), contract_value DECIMAL(15,2) DEFAULT 0, budget DECIMAL(15,2) DEFAULT 0)`);
  await q(`CREATE TABLE IF NOT EXISTS clients (id SERIAL PRIMARY KEY, name_en VARCHAR(255))`);
  await q(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, name VARCHAR(255), email VARCHAR(255), role VARCHAR(100), is_active BOOLEAN)`);
  await q(`CREATE TABLE IF NOT EXISTS suppliers (id SERIAL PRIMARY KEY, name_en VARCHAR(255))`);
  await q(`CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY, invoice_number VARCHAR(50), project_id INTEGER, client_id INTEGER,
    amount DECIMAL(15,2) DEFAULT 0, issue_date DATE, due_date DATE, status VARCHAR(30) DEFAULT 'draft',
    description TEXT, created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY, invoice_id INTEGER, project_id INTEGER, client_id INTEGER,
    amount DECIMAL(15,2) DEFAULT 0, payment_date DATE, payment_method VARCHAR(50),
    reference_number VARCHAR(100), notes TEXT, created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS supplier_invoices (
    id SERIAL PRIMARY KEY, invoice_number VARCHAR(100), supplier_id INTEGER,
    purchase_order_id INTEGER, invoice_date DATE, total_amount DECIMAL(15,2) DEFAULT 0,
    tax_amount DECIMAL(15,2) DEFAULT 0, status VARCHAR(30) DEFAULT 'received',
    exceptions JSONB DEFAULT '[]', match_status VARCHAR(30) DEFAULT 'unmatched',
    created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS purchase_orders (
    id SERIAL PRIMARY KEY, order_number VARCHAR(50), project_id INTEGER,
    total_amount DECIMAL(15,2) DEFAULT 0, status VARCHAR(30) DEFAULT 'draft')`);
  await q(`CREATE TABLE IF NOT EXISTS projects_cost_codes (id SERIAL PRIMARY KEY)`);
  await q(`CREATE TABLE IF NOT EXISTS cost_codes (id SERIAL PRIMARY KEY, code VARCHAR(50), name VARCHAR(255))`);
  await q(`CREATE TABLE IF NOT EXISTS project_costs (
    id SERIAL PRIMARY KEY, project_id INTEGER, cost_code_id INTEGER, amount DECIMAL(15,2) DEFAULT 0)`);
  await q(`CREATE TABLE IF NOT EXISTS sub_contracts (
    id SERIAL PRIMARY KEY, contract_number VARCHAR(50), project_id INTEGER,
    subcontractor_id INTEGER, contract_value DECIMAL(15,2) DEFAULT 0,
    revised_amount DECIMAL(15,2) DEFAULT 0, status VARCHAR(50) DEFAULT 'draft')`);
  await q(`CREATE TABLE IF NOT EXISTS variations (
    id SERIAL PRIMARY KEY, variation_number VARCHAR(50), project_id INTEGER,
    client_contract_id INTEGER, sub_contract_id INTEGER, title VARCHAR(255),
    description TEXT, variation_type VARCHAR(30), amount DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'change_event', workflow_instance_id INTEGER,
    decided_at TIMESTAMPTZ, incorporated_at TIMESTAMPTZ, created_by INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS client_contracts (
    id SERIAL PRIMARY KEY, contract_number VARCHAR(50), project_id INTEGER,
    client_id INTEGER, title VARCHAR(255), original_value DECIMAL(15,2) DEFAULT 0,
    revised_value DECIMAL(15,2) DEFAULT 0, retention_percent DECIMAL(5,3) DEFAULT 10,
    status VARCHAR(30) DEFAULT 'active')`);
  await q(`CREATE TABLE IF NOT EXISTS project_budgets (
    id SERIAL PRIMARY KEY, project_id INTEGER, cost_code_id INTEGER,
    budget_amount DECIMAL(15,2) DEFAULT 0, revised_amount DECIMAL(15,2) DEFAULT 0,
    original_amount DECIMAL(15,2) DEFAULT 0, current_amount DECIMAL(15,2) DEFAULT 0)`);
  await q(`CREATE TABLE IF NOT EXISTS budget_changes (
    id SERIAL PRIMARY KEY, project_id INTEGER, cost_code_id INTEGER, change_type VARCHAR(50),
    previous_amount DECIMAL(15,2) DEFAULT 0, new_amount DECIMAL(15,2) DEFAULT 0)`);
  await q(`CREATE TABLE IF NOT EXISTS sub_contract_changes (
    id SERIAL PRIMARY KEY, sub_contract_id INTEGER, change_type VARCHAR(50), amount DECIMAL(15,2))`);
  await q(`CREATE TABLE IF NOT EXISTS commitments (
    id SERIAL PRIMARY KEY, commitment_number VARCHAR(50), project_id INTEGER,
    source_type VARCHAR(50), source_id INTEGER, original_amount DECIMAL(15,2) DEFAULT 0,
    cancelled_amount DECIMAL(15,2) DEFAULT 0, status VARCHAR(30) DEFAULT 'active')`);
  await q(`CREATE TABLE IF NOT EXISTS users_audit (id SERIAL PRIMARY KEY)`);
  await q(`CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY, user_id INTEGER, channel VARCHAR(30), event_type VARCHAR(255),
    entity_type VARCHAR(100), entity_id INTEGER, action_item_id INTEGER,
    title VARCHAR(500), body TEXT, status VARCHAR(30), created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS notification_preferences (
    id SERIAL PRIMARY KEY, user_id INTEGER, event_type VARCHAR(255), channel VARCHAR(30), enabled BOOLEAN)`);
  await q(`CREATE TABLE IF NOT EXISTS business_rules (
    id SERIAL PRIMARY KEY, rule_key VARCHAR(100), rule_value JSONB DEFAULT '{}')`);

  await financeMigration.ensureTables(q);

  await q('INSERT INTO users (id, name, email, role, is_active) VALUES ($1,$2,$3,$4,$5)', [5, 'CFO', 'cfo@x.com', 'finance_manager', true]);
  await q('INSERT INTO users (id, name, email, role, is_active) VALUES ($1,$2,$3,$4,$5)', [4, 'PM', 'pm@x.com', 'project_manager', true]);
  await q('INSERT INTO users (id, name, email, role, is_active) VALUES ($1,$2,$3,$4,$5)', [2, 'Owner', 'o@x.com', 'owner', true]);
  await q('INSERT INTO clients (id, name_en) VALUES ($1,$2)', [1, 'Client One']);
  await q(`INSERT INTO projects (id, name, contract_value, budget) VALUES ($1,$2,$3,$4)`, [1, 'Finance Test Project', 100000, 80000]);
}

// Issuing an invoice posts it to the ledger (2.7b), so the lifecycle tests need the ledger tables and the account map.
async function buildLedgerFixture() {
  await q('CREATE TABLE IF NOT EXISTS accounts (id SERIAL PRIMARY KEY, code VARCHAR(20), name VARCHAR(255), type VARCHAR(30))');
  await q('CREATE TABLE IF NOT EXISTS gl_account_map (key VARCHAR(50) PRIMARY KEY, account_id INTEGER)');
  await q(`CREATE TABLE IF NOT EXISTS journal_entries (
    id SERIAL PRIMARY KEY, entry_number VARCHAR(50), date DATE, description TEXT, reference_id INTEGER,
    reference_type VARCHAR(100), total_amount DECIMAL(15,2) DEFAULT 0, created_by INTEGER, created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS journal_entry_lines (
    id SERIAL PRIMARY KEY, journal_entry_id INTEGER, account_id INTEGER, debit DECIMAL(15,2) DEFAULT 0,
    credit DECIMAL(15,2) DEFAULT 0, description TEXT, line_order INTEGER)`);
  for (const [key, code] of [['cash', '1000'], ['receivable', '1100'], ['revenue', '4000'], ['vat_output', '2100']]) {
    const account = (await q('INSERT INTO accounts (code, name, type) VALUES ($1, $1, $1) RETURNING id', [code])).rows[0];
    await q('INSERT INTO gl_account_map (key, account_id) VALUES ($1, $2)', [key, account.id]);
  }
}

beforeAll(async () => {
  await buildFixture();
  await buildLedgerFixture();
  await finance.ensureTaxCodes(q);
});

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

describe('migration', () => {
  test('creates the allocation/AP/reminder/audit tables and valuation columns', () => {
    expect(db.table('payment_allocations').columns.size).toBeGreaterThan(0);
    expect(db.table('ap_review_queue').columns.size).toBeGreaterThan(0);
    expect(db.table('receivable_reminders').columns.size).toBeGreaterThan(0);
    expect(db.table('audit_events').columns.size).toBeGreaterThan(0);
    expect(db.table('invoices').columns.has('certified_gross')).toBe(true);
    expect(db.table('invoices').columns.has('retention_amount')).toBe(true);
    expect(db.table('invoices').columns.has('advance_recovery')).toBe(true);
    expect(db.table('invoices').columns.has('previous_cumulative')).toBe(true);
    expect(db.table('payments').columns.has('direction')).toBe(true);
  });

  test('tax_codes table is created by the migration (not assumed pre-existing)', () => {
    // Regression: ensureTaxCodes INSERTs into tax_codes; before this fix no
    // DDL created the table, so migrate-27 crashed on a real database.
    expect(db.table('tax_codes').columns.has('code')).toBe(true);
    expect(db.table('tax_codes').columns.has('rate_pct')).toBe(true);
  });

  test('audit_events carries BOTH the Phase 4 and Phase 14 column families', async () => {
    // Regression: Phase 4 (policy engine) created audit_events with
    // entity / action / "before" / "after" / user_id. Phase 14's
    // writeAuditEvent used a disjoint column set, which would have failed on
    // any real database where the Phase 4 table already existed.
    for (const col of ['entity', 'action', 'entity_type', 'event_type', 'user_id', 'actor_id']) {
      expect(db.table('audit_events').columns.has(col)).toBe(true);
    }

    // writeAuditEvent dual-writes: entity=entity_type, action=event_type,
    // user_id=actor_id, so Phase 4 readers see Phase 14 events.
    // (Distinct entity_type so the probe doesn't collide with the
    // invoice-audit counts asserted in later describes.)
    await finance.writeAuditEvent(q, {
      entity_type: 'audit_regression_probe', entity_id: 1, event_type: 'create',
      actor_id: FINANCE.id, actor_name: 'CFO', after_state: { x: 1 },
    });
    const row = (await q("SELECT * FROM audit_events WHERE entity_type = 'audit_regression_probe' LIMIT 1")).rows[0];
    expect(row.entity).toBe('audit_regression_probe'); // Phase 4 family mirror
    expect(row.action).toBe('create');                 // Phase 4 family mirror
    expect(row.user_id).toBe(FINANCE.id);              // Phase 4 family mirror
    expect(row.actor_id).toBe(FINANCE.id);             // Phase 14 family
  });

  test('tax codes seeded and AP queue synced from three-way-match exceptions', async () => {
    const taxes = (await q('SELECT * FROM tax_codes')).rows;
    expect(taxes.length).toBe(4);
    expect(await finance.ensureTaxCodes(q)).toBe(0); // idempotent

    // A Phase 12 supplier invoice with exceptions feeds the queue.
    await q(`INSERT INTO supplier_invoices (id, invoice_number, supplier_id, total_amount, status, exceptions, match_status)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [40, 'SI-900', 9, 5000, 'received',
       JSON.stringify([{ type: 'missing_grn', detail: 'no GRN' }, { type: 'price_variance', detail: '10% off' }]),
       'exception']);
    const queued = await finance.syncApReviewQueue(q);
    expect(queued).toBe(2);
    const open = (await q("SELECT * FROM ap_review_queue WHERE status = 'open'")).rows;
    expect(open.length).toBe(2);
    expect((await finance.syncApReviewQueue(q))).toBe(0); // idempotent
  });
});

// ---------------------------------------------------------------------------
// Certificate math (exact) + cumulative safety
// ---------------------------------------------------------------------------

describe('client valuations', () => {
  test('Gross Current Work + Variations = Gross Certified; − Retention − Advance − Other + Tax = Net', async () => {
    const inv = await finance.createClientValuation(q, {
      project_id: 1, client_id: 1, client_contract_id: null,
      gross_current_work: 5000, approved_variations_period: 10000,
      retention: 2000, advance_recovery: 500, other_deductions: 300, tax_pct: 14,
      created_by: FINANCE.id, actor_name: 'CFO',
    });
    expect(parseFloat(inv.certified_gross)).toBe(15000);
    // Net before tax = 15000 − 2000 − 500 − 300 = 12200; tax 14% = 1708.
    expect(parseFloat(inv.tax_amount)).toBe(1708);
    // Net = 12200 + 1708 = 13908
    expect(parseFloat(inv.net_amount)).toBe(13908);
    expect(inv.status).toBe('draft');
    expect(inv.invoice_number).toMatch(/^INV-/);

    // Audit trail written on create.
    const audits = (await q("SELECT * FROM audit_events WHERE entity_type = 'invoice' AND event_type = 'create'")).rows;
    expect(audits.length).toBe(1);
  });

  test('previous cumulative prevents double-certification across periods', async () => {
    const second = await finance.createClientValuation(q, {
      project_id: 1, client_id: 1,
      gross_current_work: 8000, approved_variations_period: 0,
      retention: 0, advance_recovery: 0, other_deductions: 0, tax_pct: 0,
      created_by: FINANCE.id, actor_name: 'CFO',
    });
    expect(parseFloat(second.previous_cumulative)).toBe(15000); // prior cumulative carried
    expect(parseFloat(second.cumulative_certified)).toBe(23000);
    expect(parseFloat(second.net_amount)).toBe(8000);
  });

  test('lifecycle transitions are enforced and audited', async () => {
    const inv = (await q('SELECT * FROM invoices ORDER BY id LIMIT 1')).rows[0];
    await expect(finance.transitionInvoice(q, inv.id, 'issued', FINANCE)).rejects.toThrow(/lifecycle/);
    await finance.transitionInvoice(q, inv.id, 'approved', FINANCE);
    await finance.transitionInvoice(q, inv.id, 'issued', FINANCE);
    const audit = (await q(
      "SELECT * FROM audit_events WHERE entity_type = 'invoice' AND event_type = 'status_change'"
    )).rows;
    expect(audit.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Allocation invariants (the reconciliation gate)
// ---------------------------------------------------------------------------

describe('payment allocations (reconciliation)', () => {
  let invoiceA; let invoiceB; let payment;

  beforeAll(async () => {
    invoiceA = await finance.createClientValuation(q, {
      project_id: 1, client_id: 1, gross_current_work: 5000, tax_pct: 0,
      created_by: FINANCE.id, actor_name: 'CFO',
    }); // net 5000
    await finance.transitionInvoice(q, invoiceA.id, 'approved', FINANCE);
    await finance.transitionInvoice(q, invoiceA.id, 'issued', FINANCE);
    invoiceB = await finance.createClientValuation(q, {
      project_id: 1, client_id: 1, gross_current_work: 3000, tax_pct: 0,
      created_by: FINANCE.id, actor_name: 'CFO',
    });
    await finance.transitionInvoice(q, invoiceB.id, 'approved', FINANCE);
    await finance.transitionInvoice(q, invoiceB.id, 'issued', FINANCE);

    await q(`INSERT INTO payments (id, project_id, client_id, amount, payment_date, direction)
             VALUES ($1,$2,$3,$4,$5,'ar')`, [70, 1, 1, 9500, futureDate(0)]);
    payment = (await q('SELECT * FROM payments WHERE id = 70')).rows[0];
  });

  test('allocations reconcile exactly across two invoices', async () => {
    const r = await finance.allocatePayment(q, {
      payment_id: 70,
      allocations: [
        { invoice_id: invoiceA.id, amount: 5000 },
        { invoice_id: invoiceB.id, amount: 2000 },
      ],
      allocated_by: FINANCE.id, actor_name: 'CFO',
    });
    expect(r.allocations.length).toBe(2);

    // Invoice A fully settled; B partially.
    const balA = await finance.invoiceOutstanding(q, invoiceA.id);
    expect(balA.outstanding).toBe(0);
    const balB = await finance.invoiceOutstanding(q, invoiceB.id);
    expect(balB.outstanding).toBe(1000);
    const a = (await q('SELECT * FROM invoices WHERE id = $1', [invoiceA.id])).rows[0];
    expect(a.status).toBe('paid');
    const b = (await q('SELECT * FROM invoices WHERE id = $1', [invoiceB.id])).rows[0];
    expect(b.status).toBe('partially_paid');
  });

  test('an allocation can never exceed the invoice outstanding', async () => {
    await expect(finance.allocatePayment(q, {
      payment_id: 70, allocations: [{ invoice_id: invoiceB.id, amount: 2000 }],
      allocated_by: FINANCE.id,
    })).rejects.toThrow(/exceeds the invoice's outstanding/);
  });

  test('an allocation total can never exceed the payment amount', async () => {
    await expect(finance.allocatePayment(q, {
      payment_id: 70, allocations: [{ invoice_id: invoiceB.id, amount: 3000 }],
      allocated_by: FINANCE.id,
    })).rejects.toThrow(/exceeds the payment amount/);
  });

  test('repeated lines for one invoice cannot exceed its balance in a single request', async () => {
    await expect(finance.allocatePayment(q, {
      payment_id: 70,
      allocations: [
        { invoice_id: invoiceB.id, amount: 600 },
        { invoice_id: invoiceB.id, amount: 600 },
      ],
      allocated_by: FINANCE.id,
    })).rejects.toThrow(/exceeds the invoice's outstanding/);
    expect((await finance.invoiceOutstanding(q, invoiceB.id)).outstanding).toBe(1000);
  });

  test('allocation totals reconcile exactly for every document', async () => {
    const invoices = (await q('SELECT * FROM invoices')).rows;
    for (const inv of invoices) {
      const bal = await finance.invoiceOutstanding(q, inv.id);
      expect(bal.outstanding).toBeGreaterThanOrEqual(0);
      expect(bal.allocated).toBeLessThanOrEqual(bal.net);
    }
    const payments = (await q('SELECT * FROM payments')).rows;
    for (const p of payments) {
      const allocs = (await q('SELECT * FROM payment_allocations WHERE payment_id = $1', [p.id])).rows;
      expect(finance.round2(allocs.reduce((s, a) => s + parseFloat(a.amount), 0))).toBeLessThanOrEqual(parseFloat(p.amount));
    }
  });
});

// ---------------------------------------------------------------------------
// Retention — released matches held, never exceeds it
// ---------------------------------------------------------------------------

describe('retention ledger', () => {
  test('held then released reconciles; over-release is refused', async () => {
    await finance.recordRetention(q, {
      project_id: 1, party_type: 'subcontractor', direction: 'held', amount: 1500,
    });
    let totals = await finance.retentionTotals(q, { project_id: 1, party_type: 'subcontractor' });
    expect(totals.held).toBe(1500);
    expect(totals.balance).toBe(1500);

    await finance.recordRetention(q, {
      project_id: 1, party_type: 'subcontractor', direction: 'released', amount: 1500,
    });
    totals = await finance.retentionTotals(q, { project_id: 1, party_type: 'subcontractor' });
    expect(totals.released).toBe(1500);
    expect(totals.balance).toBe(0);

    await expect(finance.recordRetention(q, {
      project_id: 1, party_type: 'subcontractor', direction: 'released', amount: 100,
    })).rejects.toThrow(/exceeds the held balance/);
  });
});

// ---------------------------------------------------------------------------
// Reminder engine
// ---------------------------------------------------------------------------

describe('receivable reminders', () => {
  test('7 days before due, due today, and the overdue ladder fire once each', async () => {
    // Three issued invoices: due in 7 days, due today, overdue 14 days.
    const soon = await finance.createClientValuation(q, {
      project_id: 1, client_id: 1, gross_current_work: 1000, tax_pct: 0,
      due_date: futureDate(7), created_by: FINANCE.id, actor_name: 'CFO',
    });
    await finance.transitionInvoice(q, soon.id, 'approved', FINANCE);
    await finance.transitionInvoice(q, soon.id, 'issued', FINANCE);

    const today = await finance.createClientValuation(q, {
      project_id: 1, client_id: 1, gross_current_work: 800, tax_pct: 0,
      due_date: futureDate(0), created_by: FINANCE.id, actor_name: 'CFO',
    });
    await finance.transitionInvoice(q, today.id, 'approved', FINANCE);
    await finance.transitionInvoice(q, today.id, 'issued', FINANCE);

    const late = await finance.createClientValuation(q, {
      project_id: 1, client_id: 1, gross_current_work: 4000, tax_pct: 0,
      due_date: pastDate(14), created_by: FINANCE.id, actor_name: 'CFO',
    });
    await finance.transitionInvoice(q, late.id, 'approved', FINANCE);
    await finance.transitionInvoice(q, late.id, 'issued', FINANCE);

    const r = await finance.runReceivableReminderSweep(q, { now: NOW });
    expect(r.reminders_sent).toBe(3);

    const stages = (await q('SELECT * FROM receivable_reminders')).rows.map((r2) => r2.reminder_type).sort();
    expect(stages).toEqual(['due_soon', 'due_today', 'overdue_14']);

    // Idempotent: a second sweep sends nothing new.
    const again = await finance.runReceivableReminderSweep(q, { now: NOW });
    expect(again.reminders_sent).toBe(0);

    // Closeout A2.5: the sweep emits events through the outbox (the dispatcher's route notifies the roles, covered
    // on real PostgreSQL in event-integrity.pg.test.js): invoice.due for due_soon and due_today, invoice.overdue for
    // the overdue ladder, each carrying its stage's escalation roles.
    const events = (await q('SELECT * FROM event_outbox')).rows
      .map((e) => ({ type: e.event_type, payload: typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload }))
      .filter((e) => ['invoice.due', 'invoice.overdue'].includes(e.type));
    expect(events.map((e) => [e.type, e.payload.stage]).sort()).toEqual([
      ['invoice.due', 'due_soon'], ['invoice.due', 'due_today'], ['invoice.overdue', 'overdue_14'],
    ]);
    const rolesOf = (stage) => events.find((e) => e.payload.stage === stage).payload.roles.length;
    expect([rolesOf('due_soon'), rolesOf('due_today'), rolesOf('overdue_14')]).toEqual([1, 2, 2]);
  });
});

// ---------------------------------------------------------------------------
// Company finance dashboard + cash-flow view
// ---------------------------------------------------------------------------

describe('company finance dashboard', () => {
  test('AR/AP aging, cash collected, payments due, retention, and project margins all reconcile', async () => {
    const dashboard = await finance.companyFinanceDashboard(q, { now: NOW });
    const totalAr = Object.values(dashboard.ar_aging).reduce((s, v) => s + parseFloat(v), 0);
    expect(finance.round2(totalAr)).toBe(dashboard.total_ar_outstanding);
    expect(dashboard.total_ar_outstanding).toBeGreaterThan(0);
    expect(dashboard.cash_collected).toBe(9500); // the 9500 allocation payment
    expect(dashboard.payments_due).toBe(0); // no open POs in this fixture
    expect(dashboard.retention_payable).toBe(0); // 1500 held − 1500 released
    expect(dashboard.project_margins.length).toBe(1);
    expect(typeof dashboard.project_margins[0].forecast_margin_percent).toBe('number');
  });
});
