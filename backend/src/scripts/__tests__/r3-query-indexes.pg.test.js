// Real PostgreSQL: R3.5's focused query and high-volume FK indexes are present after migration.
const { Pool } = require('pg');

const describePg = process.env.TEST_PG === '1' ? describe : describe.skip;

describePg('R3.5 ranked query indexes (real PostgreSQL)', () => {
  let pool;
  beforeAll(async () => {
    pool = new Pool({
      host: process.env.DB_HOST || '127.0.0.1', port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    });
  });
  afterAll(async () => { await pool.end(); });

  test('the invoice, purchase-order, cost, journal and supplier indexes exist', async () => {
    const names = [
      'idx_invoices_created_at_desc_r3',
      'idx_purchase_orders_project_created_at_r3',
      'idx_project_costs_project_transaction_r3',
      'idx_journal_entry_lines_account_id_r3',
      'idx_payments_supplier_id_r3',
      'idx_payment_allocations_supplier_invoice_r3',
    ];
    const rows = (await pool.query(
      "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1)", [names]
    )).rows;
    expect(rows.map((row) => row.indexname).sort()).toEqual([...names].sort());
    expect(rows.find((row) => row.indexname === 'idx_purchase_orders_project_created_at_r3').indexdef)
      .toMatch(/\(project_id, created_at DESC, id DESC\)/);
  });
});
