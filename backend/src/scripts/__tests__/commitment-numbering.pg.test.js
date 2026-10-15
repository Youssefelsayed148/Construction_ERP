// Real PostgreSQL: commitment ledger numbering remains unique under concurrency and rolls back with its source transaction.
const { Pool } = require('pg');
const ledger = require('../../services/commitmentLedger');

const describePg = process.env.TEST_PG === '1' ? describe : describe.skip;

describePg('commitment numbering (real PostgreSQL)', () => {
  let pool;
  let projectId;
  let supplierId;
  const tag = `R33NUM${Date.now()}`;
  const purchaseOrderIds = [];

  const withTransaction = async (fn) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const value = await fn(client.query.bind(client));
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };

  const makePurchaseOrder = async (suffix) => {
    const row = (await pool.query(
      "INSERT INTO purchase_orders (order_number, project_id, supplier_id, total_amount, status) VALUES ($1,$2,$3,1000,'issued') RETURNING id",
      [`${tag}-${suffix}`, projectId, supplierId]
    )).rows[0];
    purchaseOrderIds.push(row.id);
    return row.id;
  };

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.DB_HOST || '127.0.0.1', port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, max: 30,
    });
    const project = (await pool.query(
      "INSERT INTO projects (name, name_en, code, status, budget, contract_value) VALUES ($1,$1,$2,'active',10000,10000) RETURNING id",
      [`${tag} project`, tag]
    )).rows[0];
    projectId = project.id;
    supplierId = (await pool.query(
      'INSERT INTO suppliers (code, name_en, name_ar) VALUES ($1,$1,$1) RETURNING id', [`${tag}-SUP`]
    )).rows[0].id;
  });

  afterAll(async () => {
    if (projectId) {
      await pool.query('DELETE FROM commitments WHERE project_id = $1', [projectId]);
      await pool.query('DELETE FROM purchase_orders WHERE id = ANY($1)', [purchaseOrderIds]);
      await pool.query('DELETE FROM suppliers WHERE id = $1', [supplierId]);
      await pool.query('DELETE FROM projects WHERE id = $1', [projectId]);
    }
    await pool.end();
  });

  test('20 concurrent source syncs allocate distinct CM numbers and a rollback returns its number', async () => {
    const rolledBackPo = await makePurchaseOrder('rollback');
    let rolledBackNumber;
    try {
      await withTransaction(async (q) => {
        rolledBackNumber = (await ledger.syncPurchaseOrder(q, rolledBackPo)).commitment_number;
        throw new Error('intentional transaction rollback');
      });
    } catch (error) {
      expect(error.message).toBe('intentional transaction rollback');
    }
    expect(await pool.query('SELECT 1 FROM commitments WHERE source_type = $1 AND source_id = $2', ['purchase_order', rolledBackPo]).then((r) => r.rowCount)).toBe(0);
    const retriedNumber = await withTransaction(async (q) => (await ledger.syncPurchaseOrder(q, rolledBackPo)).commitment_number);
    expect(retriedNumber).toBe(rolledBackNumber);

    const sources = await Promise.all(Array.from({ length: 20 }, (_, i) => makePurchaseOrder(i)));
    const results = await Promise.all(sources.map((id) => withTransaction((q) => ledger.syncPurchaseOrder(q, id))));
    const numbers = results.map((row) => row.commitment_number);
    expect(numbers).toHaveLength(20);
    expect(new Set(numbers).size).toBe(20);
    expect(numbers.every((number) => /^CM-\d{5,}$/.test(number))).toBe(true);
    expect((await pool.query('SELECT count(*)::int AS n FROM commitments WHERE project_id = $1', [projectId])).rows[0].n).toBe(21);
  });
});
