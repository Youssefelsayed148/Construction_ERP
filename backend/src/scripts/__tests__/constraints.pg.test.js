// Real PostgreSQL. Phase 2.6a: the database refuses non-positive quantities and amounts, negative money and
// statuses outside the workflow vocabulary, whoever writes.
//
// Reproduced first: none of these constraints existed; a PO line of quantity 0 or -5, an invoice or payment of 0,
// a work order with status 'banana' were all accepted by the database (only some Joi schemas stopped them).
//
// A CHECK is evaluated before the foreign-key triggers, so a probe row that points at parents that do not exist
// answers 23514 when the CHECK rejects it and 23503 when the CHECK accepts it. No fixtures needed.
const { Pool } = require('pg');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

const NOPE = 2147483000; // a parent id that does not exist

describePg('2.6a constraints (real PostgreSQL)', () => {
  let pool;
  beforeAll(() => {
    pool = new Pool({ host: process.env.DB_HOST || '127.0.0.1', port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  });
  afterAll(async () => { await pool.end(); });

  // Runs the insert in a transaction that is always rolled back; resolves to the SQLSTATE or 'ok'.
  const probe = async (sql, params) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql, params);
      return 'ok';
    } catch (e) { return e.code; } finally { await client.query('ROLLBACK'); client.release(); }
  };

  describe('quantities must be positive', () => {
    const lines = [
      ['purchase_order_lines', 'purchase_order_id'], ['purchase_request_lines', 'purchase_request_id'], ['rfq_lines', 'rfq_id'],
      ['delivery_lines', 'delivery_id'], ['supplier_return_lines', 'supplier_return_id'],
    ];
    test.each(lines)('%s.quantity > 0', async (table, fk) => {
      const sql = `INSERT INTO ${table} (${fk}, quantity) VALUES ($1, $2)`;
      expect(await probe(sql, [NOPE, 0])).toBe('23514');
      expect(await probe(sql, [NOPE, -5])).toBe('23514');
      expect(await probe(sql, [NOPE, 1])).toBe('23503'); // CHECK passed, the missing parent stopped it
    });
  });

  describe('amounts', () => {
    test('invoices.amount > 0', async () => {
      const sql = "INSERT INTO invoices (invoice_number, project_id, client_id, amount, issue_date) VALUES ($1, $2, $2, $3, '2026-01-01')";
      expect(await probe(sql, ['C-0', NOPE, 0])).toBe('23514');
      expect(await probe(sql, ['C-1', NOPE, -1])).toBe('23514');
      expect(await probe(sql, ['C-2', NOPE, 1])).toBe('23503');
    });
    test('payments.amount > 0', async () => {
      const sql = "INSERT INTO payments (project_id, client_id, amount, payment_date) VALUES ($1, $1, $2, '2026-01-01')";
      expect(await probe(sql, [NOPE, 0])).toBe('23514');
      expect(await probe(sql, [NOPE, -1])).toBe('23514');
      expect(await probe(sql, [NOPE, 1])).toBe('23503');
    });
    test('money is not negative: PO lines, POs, supplier invoices, expenses, BOQ', async () => {
      expect(await probe('INSERT INTO purchase_order_lines (purchase_order_id, quantity, unit_rate) VALUES ($1, 1, -1)', [NOPE])).toBe('23514');
      expect(await probe('INSERT INTO purchase_orders (order_number, total_amount) VALUES ($1, -1)', ['C-PO'])).toBe('23514');
      expect(await probe('INSERT INTO supplier_invoices (supplier_id, invoice_number, total_amount) VALUES ($1, $2, -1)', [NOPE, 'C-SI'])).toBe('23514');
      expect(await probe('INSERT INTO supplier_invoices (supplier_id, invoice_number, tax_amount) VALUES ($1, $2, -1)', [NOPE, 'C-SI2'])).toBe('23514');
      expect(await probe("INSERT INTO expenses (amount, category) VALUES (-1, 'other')")).toBe('23514');
      expect(await probe("INSERT INTO boq_items (project_id, quantity, unit_rate) VALUES ($1, -1, 1)", [NOPE])).toBe('23514');
      expect(await probe("INSERT INTO boq_items (project_id, quantity, unit_rate) VALUES ($1, 1, -1)", [NOPE])).toBe('23514');
      expect(await probe("INSERT INTO boq_items (project_id, quantity, unit_rate) VALUES ($1, 0, 0)", [NOPE])).toBe('23503'); // zero is allowed
    });
  });

  describe('status vocabularies', () => {
    const cases = [
      ['invoices', "INSERT INTO invoices (invoice_number, project_id, client_id, amount, issue_date, status) VALUES ('S-' || $2::text, $1, $1, 1, '2026-01-01', $2)",
        ['draft', 'sent', 'approved', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled', 'void', 'credited']],
      ['work_orders', 'INSERT INTO work_orders (title, project_id, status) VALUES ($2, $1, $2)', ['planned', 'in_progress', 'completed', 'cancelled']],
      ['projects', 'INSERT INTO projects (id, name, code, status) VALUES ($1::int, $2::text, $2::text, $2::text)', ['planning', 'active', 'on_hold', 'completed', 'closed']],
      ['project_phases', 'INSERT INTO project_phases (project_id, name, status) VALUES ($1, $2, $2)', ['planning', 'active', 'completed', 'on_hold']],
      ['project_milestones', 'INSERT INTO project_milestones (project_id, title, status) VALUES ($1, $2, $2)', ['pending', 'achieved', 'delayed']],
      ['units', 'INSERT INTO units (building_id, code, status) VALUES ($1, $2, $2)', ['available', 'reserved', 'contracted', 'delivered', 'blocked', 'closed']],
      ['buildings', 'INSERT INTO buildings (project_id, code, name, status) VALUES ($1, $2, $2, $2)', ['planning', 'under_construction', 'completed']],
      ['expenses', "INSERT INTO expenses (amount, category, project_id, status) VALUES (1, 'other', $1, $2)", ['pending', 'approved', 'rejected']],
    ];
    // projects and expenses have no enforced parent, so an accepted status inserts ('ok'); the others stop at their missing parent (23503).
    test.each(cases)('%s accepts its vocabulary and refuses anything else', async (table, sql, allowed) => {
      const accepted = ['projects', 'expenses'].includes(table) ? 'ok' : '23503';
      for (const status of allowed) expect([table, status, await probe(sql, [NOPE, status])]).toEqual([table, status, accepted]);
      expect([table, await probe(sql, [NOPE, 'banana'])]).toEqual([table, '23514']);
    });
  });

  test('every constraint added here is validated on a clean database (or reported by the data-cleaning report)', async () => {
    const names = ['purchase_order_lines_quantity_positive', 'purchase_request_lines_quantity_positive', 'rfq_lines_quantity_positive',
      'delivery_lines_quantity_positive', 'supplier_return_lines_quantity_positive', 'invoices_amount_positive', 'payments_amount_positive',
      'invoices_status_known', 'work_orders_status_known', 'projects_status_known', 'project_phases_status_known', 'project_milestones_status_known',
      'units_status_known', 'buildings_status_known', 'expenses_status_known'];
    const rows = (await pool.query('SELECT conname, convalidated FROM pg_constraint WHERE conname = ANY($1)', [names])).rows;
    expect(rows.map((r) => r.conname).sort()).toEqual([...names].sort());
    const { findInvalidConstraints } = require('../../services/dataCleaning');
    const invalid = (await findInvalidConstraints((t, p) => pool.query(t, p), { limit: 5 })).filter((c) => names.includes(c.constraint));
    // Anything left NOT VALID must be explained by offending rows (never an unexplained invalid constraint).
    for (const c of invalid) expect(c.offenders).toBeGreaterThan(0);
    for (const r of rows) if (!r.convalidated) expect(invalid.some((c) => c.constraint === r.conname)).toBe(true);
  });
});
