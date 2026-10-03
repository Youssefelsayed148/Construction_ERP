// Real PostgreSQL. Phase 3: bug found while writing the 3.1 failing tests.
//
// Reproduced first: services/procurementService.createPurchaseOrder INSERTs payment_terms and
// delivery_terms, but the migrated purchase_orders table never had those columns — every PO creation
// through the service failed with 'column "payment_terms" of relation "purchase_orders" does not exist'.
// The mock-db suite cannot see this (it does not enforce columns) and the PG suite built POs by hand.
// The PO spec carries payment/delivery terms (they already exist on supplier_quotations), so the fix is
// the columns (migration 0019), not the service.
const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('purchase order terms columns (real PostgreSQL)', () => {
  let db; let svc;
  const tag = String(Date.now()).slice(-7);
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];

  beforeAll(async () => {
    db = require('../../config/database');
    svc = require('../../services/procurementService');
  });

  afterAll(async () => {
    await db.pool.end();
  });

  test('createPurchaseOrder works against the migrated schema and persists its terms', async () => {
    const supplier = (await one('INSERT INTO suppliers (name_ar, name_en) VALUES ($1, $1) RETURNING id', [`pt-${tag}`])).id;
    const po = await db.transaction((client) => svc.createPurchaseOrder(client.query.bind(client), {
      supplier_id: supplier,
      lines: [{ quantity: 5, unit_rate: 20, description: 'po-terms test' }],
      payment_terms: 'net 30',
      delivery_terms: 'FOB site',
      created_by: null,
    }));
    const row = await one('SELECT payment_terms, delivery_terms, total_amount FROM purchase_orders WHERE id = $1', [po.id]);
    expect(row.payment_terms).toBe('net 30');
    expect(row.delivery_terms).toBe('FOB site');
    expect(Number(row.total_amount)).toBe(100);
    await db.query('DELETE FROM purchase_order_lines WHERE purchase_order_id = $1', [po.id]);
    await db.query('DELETE FROM purchase_orders WHERE id = $1', [po.id]);
    await db.query('UPDATE suppliers SET is_active = false WHERE id = $1', [supplier]);
  });
});
