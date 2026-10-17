const { CHECKS, PENDING_RECEIPTS_SQL, runReconciliation } = require('../reconcile-database');
const describePg = process.env.TEST_PG === '1' ? describe : describe.skip;

describePg('Batch 5A MIR, receipts and supplier-return reconciliation', () => {
  let db; let client; let counter = 0;
  const tag = `${Date.now()}-${process.pid}`;
  const one = async (sql, params) => (await client.query(sql, params)).rows[0];
  const count = async fragment => {
    const check = CHECKS.find(row => row.name.includes(fragment));
    expect(check).toBeTruthy();
    return Number((await one(check.sql)).violations);
  };
  async function fixture({ posted = false, accepted = 6 } = {}) {
    const suffix = `${tag}-${++counter}`;
    const project = await one("INSERT INTO projects (name,code,status) VALUES ($1,$1,'active') RETURNING id", [`S003-${suffix}`]);
    const material = await one("SELECT id FROM item_master WHERE code='RM-CONC-C35'");
    const po = await one("INSERT INTO purchase_orders (order_number,project_id,status) VALUES ($1,$2,'issued') RETURNING id", [`S003-${suffix}`, project.id]);
    const line = await one('INSERT INTO purchase_order_lines (purchase_order_id,material_id,quantity,delivered_quantity,accepted_quantity) VALUES ($1,$2,20,10,$3) RETURNING id', [po.id, material.id, accepted]);
    const delivery = await one("INSERT INTO deliveries (purchase_order_id,status) VALUES ($1,'received') RETURNING id", [po.id]);
    const dl = await one('INSERT INTO delivery_lines (delivery_id,purchase_order_line_id,material_id,quantity) VALUES ($1,$2,$3,10) RETURNING id', [delivery.id, line.id, material.id]);
    const mir = await one("INSERT INTO material_inspection_requests (purchase_order_id,delivery_id,status) VALUES ($1,$2,'partially_accepted') RETURNING id", [po.id, delivery.id]);
    // Both quantity columns are NUMERIC(15,3); bind the subtraction as numeric
    // so PostgreSQL does not infer integer from the literal 10.
    const ml = await one('INSERT INTO mir_lines (mir_id,delivery_line_id,purchase_order_line_id,material_id,quantity,accepted_quantity,rejected_quantity) VALUES ($1,$2,$3,$4,10,$5::numeric,10::numeric-$5::numeric) RETURNING id', [mir.id, dl.id, line.id, material.id, accepted]);
    let grn; let gl;
    if (posted) {
      grn = await one("INSERT INTO goods_receipt_notes (purchase_order_id,delivery_id,mir_id,status) VALUES ($1,$2,$3,'posted') RETURNING id", [po.id, delivery.id, mir.id]);
      gl = await one('INSERT INTO grn_lines (grn_id,mir_line_id,purchase_order_line_id,material_id,quantity) VALUES ($1,$2,$3,$4,$5) RETURNING id', [grn.id, ml.id, line.id, material.id, accepted]);
    }
    return { po, line, delivery, dl, mir, ml, grn, gl, material };
  }
  beforeAll(() => { db = require('../../config/database'); });
  beforeEach(async () => { client = await db.pool.connect(); await client.query('BEGIN'); });
  afterEach(async () => { try { await client.query('ROLLBACK'); } finally { client.release(); } });
  afterAll(async () => { await db.pool.end(); });
  test('accepted MIR awaiting its GRN is legitimate accepted stock', async () => {
    const before = await count('PO delivered and accepted quantities reconcile');
    const pendingBefore = Number((await one(PENDING_RECEIPTS_SQL)).pending);
    await fixture();
    expect(await count('PO delivered and accepted quantities reconcile')).toBe(before);
    expect(Number((await one(PENDING_RECEIPTS_SQL)).pending)).toBe(pendingBefore + 1);
  });
  test.each([[71, 'info'], [72, 'info'], [73, 'warning']])('PO-00008 receipt aged %s hours is %s without an integrity violation', async (age, level) => {
    const before = await count('PO delivered and accepted quantities reconcile');
    const f = await fixture();
    const number = `MIR-PO-00008-${tag}-${age}`;
    await client.query('UPDATE material_inspection_requests SET mir_number=$1,decided_at=NOW()-($2::numeric * INTERVAL \'1 hour\') WHERE id=$3', [number, age, f.mir.id]);
    await client.query('UPDATE purchase_orders SET order_number=$1 WHERE id=$2', [`PO-00008-${tag}-${age}`, f.po.id]);
    const report = await runReconciliation(client.query.bind(client), { staleReceiptHours: 72 });
    expect(report.receipt_notices.find(row => row.mir_id === f.mir.id)).toMatchObject({ mir_number: number, age_hours: age, level });
    expect(await count('PO delivered and accepted quantities reconcile')).toBe(before);
  });
  test('a posted GRN resolves an aged receipt notice without changing MIR acceptance', async () => {
    const f = await fixture();
    await client.query("UPDATE material_inspection_requests SET decided_at=NOW()-INTERVAL '120 hours' WHERE id=$1", [f.mir.id]);
    const pending = await runReconciliation(client.query.bind(client));
    expect(pending.receipt_notices.find(row => row.mir_id === f.mir.id)?.level).toBe('warning');
    const grn = await one("INSERT INTO goods_receipt_notes (purchase_order_id,delivery_id,mir_id,status) VALUES ($1,$2,$3,'posted') RETURNING id", [f.po.id, f.delivery.id, f.mir.id]);
    await client.query('INSERT INTO grn_lines (grn_id,mir_line_id,purchase_order_line_id,material_id,quantity) VALUES ($1,$2,$3,$4,6)', [grn.id, f.ml.id, f.line.id, f.material.id]);
    const posted = await runReconciliation(client.query.bind(client));
    expect(posted.receipt_notices.some(row => row.mir_id === f.mir.id)).toBe(false);
    expect((await one('SELECT accepted_quantity FROM purchase_order_lines WHERE id=$1', [f.line.id])).accepted_quantity).toBe('6.000');
  });
  test('one posted partial receipt plus its pending MIR peer are counted once each', async () => {
    const before = await count('PO delivered and accepted quantities reconcile');
    const f = await fixture({ posted: true });
    const delivery = await one("INSERT INTO deliveries (purchase_order_id,status) VALUES ($1,'received') RETURNING id", [f.po.id]);
    const dl = await one('INSERT INTO delivery_lines (delivery_id,purchase_order_line_id,material_id,quantity) VALUES ($1,$2,$3,4) RETURNING id', [delivery.id, f.line.id, f.material.id]);
    const mir = await one("INSERT INTO material_inspection_requests (purchase_order_id,delivery_id,status) VALUES ($1,$2,'partially_accepted') RETURNING id", [f.po.id, delivery.id]);
    await client.query('INSERT INTO mir_lines (mir_id,purchase_order_line_id,material_id,delivery_line_id,quantity,accepted_quantity,rejected_quantity) VALUES ($1,$2,$3,$4,4,2,2)', [mir.id, f.line.id, f.material.id, dl.id]);
    await client.query('UPDATE purchase_order_lines SET accepted_quantity=8,delivered_quantity=14 WHERE id=$1', [f.line.id]);
    expect(await count('PO delivered and accepted quantities reconcile')).toBe(before);
  });
  test('detects a stale posted receipt even when its MIR and PO projections agree', async () => {
    const before = await count('posted GRN quantities match MIR acceptance');
    const f = await fixture({ posted: true });
    await client.query('UPDATE mir_lines SET accepted_quantity=5,rejected_quantity=5 WHERE id=$1', [f.ml.id]);
    await client.query('UPDATE purchase_order_lines SET accepted_quantity=5 WHERE id=$1', [f.line.id]);
    expect(await count('posted GRN quantities match MIR acceptance')).toBe(before + 1);
  });
  test('supplier return reduces accepted stock once and return projection drift is detected', async () => {
    const acceptedBefore = await count('PO delivered and accepted quantities reconcile');
    const returnsBefore = await count('GRN returned quantities reconcile with supplier returns');
    const f = await fixture({ posted: true });
    const sr = await one("INSERT INTO supplier_returns (purchase_order_id,grn_id,status) VALUES ($1,$2,'returned') RETURNING id", [f.po.id, f.grn.id]);
    await client.query('INSERT INTO supplier_return_lines (supplier_return_id,grn_line_id,material_id,quantity) VALUES ($1,$2,$3,2)', [sr.id, f.gl.id, f.material.id]);
    await client.query('UPDATE grn_lines SET returned_quantity=2 WHERE id=$1', [f.gl.id]);
    await client.query('UPDATE purchase_order_lines SET accepted_quantity=4 WHERE id=$1', [f.line.id]);
    expect(await count('PO delivered and accepted quantities reconcile')).toBe(acceptedBefore);
    expect(await count('GRN returned quantities reconcile with supplier returns')).toBe(returnsBefore);
    const report = await runReconciliation(client.query.bind(client));
    expect(report.receipt_notices.some(row => row.mir_id === f.mir.id)).toBe(false);
    expect((await one('SELECT accepted_quantity FROM purchase_order_lines WHERE id=$1', [f.line.id])).accepted_quantity).toBe('4.000');
    await client.query('UPDATE grn_lines SET returned_quantity=1 WHERE id=$1', [f.gl.id]);
    expect(await count('GRN returned quantities reconcile with supplier returns')).toBe(returnsBefore + 1);
  });
  test('rejected MIR and cancelled delivery do not inflate accepted or delivered quantities', async () => {
    const before = await count('PO delivered and accepted quantities reconcile');
    const f = await fixture();
    await client.query("UPDATE material_inspection_requests SET status='rejected' WHERE id=$1", [f.mir.id]);
    await client.query('UPDATE mir_lines SET accepted_quantity=0,rejected_quantity=10 WHERE id=$1', [f.ml.id]);
    await client.query('UPDATE purchase_order_lines SET accepted_quantity=0 WHERE id=$1', [f.line.id]);
    expect(await count('PO delivered and accepted quantities reconcile')).toBe(before);
    await client.query("UPDATE deliveries SET status='cancelled' WHERE id=$1", [f.delivery.id]);
    await client.query('UPDATE purchase_order_lines SET delivered_quantity=0 WHERE id=$1', [f.line.id]);
    expect(await count('PO delivered and accepted quantities reconcile')).toBe(before);
  });
  test('genuine acceptance projection drift is still a violation before a GRN exists', async () => {
    const before = await count('PO delivered and accepted quantities reconcile');
    const f = await fixture();
    await client.query('UPDATE purchase_order_lines SET accepted_quantity=5 WHERE id=$1', [f.line.id]);
    expect(await count('PO delivered and accepted quantities reconcile')).toBe(before + 1);
  });
});
