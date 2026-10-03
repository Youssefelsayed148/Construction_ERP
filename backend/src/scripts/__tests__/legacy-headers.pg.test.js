// Real PostgreSQL. Phase 2.6c: purchase request and purchase order LINES are the only place a material, a
// quantity and a price live. The single material_id / quantity / unit_price on the header is legacy.
//
// Reproduced first: replenishment still wrote one material into the PO and PR header (and found its open orders
// by that header column), and `openConfirmedQuantity` carried a try/catch for "a database before line tables" that
// swallowed any error. Header-only orders (created before line tables) had no lines at all.
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const replenishment = require('../../services/replenishment');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('2.6c legacy header material (real PostgreSQL)', () => {
  let pool; let q; let supplier; let item; let po2; let item2;
  const tag = String(Date.now()).slice(-7);
  const one = async (sql, params) => (await pool.query(sql, params)).rows[0];

  const mkItem = async (label, mode, extra = {}) => {
    const row = await one(
      `INSERT INTO item_master (code, category, unit, name_en, name_ar, is_active, min_stock, max_stock, safety_stock, supplier_lead_time_days, moq, order_multiple)
       VALUES ($1, 'other', 'bag', $1, $1, true, 20, 200, 10, 10, 5, 5) RETURNING *`, [`L26C-${tag}-${label}`]);
    const wh = (await one("INSERT INTO warehouses (name) VALUES ($1) RETURNING id", [`l26c-${tag}-${label}`])).id;
    await pool.query('INSERT INTO warehouse_stock (warehouse_id, item_id, quantity, reorder_level, available_quantity) VALUES ($1, $2, 10, 15, 10)', [wh, row.id]);
    await pool.query('INSERT INTO supplier_materials (supplier_id, material_id, unit_price, lead_time_days) VALUES ($1, $2, 100, 10)', [supplier, row.id]);
    await pool.query('INSERT INTO business_rules (rule_key, rule_value) VALUES ($1, $2)', [`replenishment_policy:material:${row.id}`, JSON.stringify({ mode, ...extra })]);
    return row;
  };

  beforeAll(async () => {
    pool = new Pool({ host: process.env.DB_HOST || '127.0.0.1', port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
    q = (sql, params) => pool.query(sql, params);
    supplier = (await one("INSERT INTO suppliers (name_en, name_ar) VALUES ($1, $1) RETURNING id", [`l26c ${tag}`])).id;
    item = await mkItem('pr', 'auto_draft_pr');
    item2 = await mkItem('po', 'auto_issue_po', { authority_ceiling: 1000000 });
  });
  afterAll(async () => { await pool.end(); });

  test('a replenishment purchase request keeps its material, quantity and unit on the line, not the header', async () => {
    const first = await replenishment.evaluateMaterial(q, item, { notify: false });
    expect(first.actions.purchase_request.created).toBe(true);
    const pr = first.actions.purchase_request.request;
    const header = await one('SELECT material_id, unit FROM purchase_requests WHERE id = $1', [pr.id]);
    expect(header.material_id).toBeNull();
    const lines = (await pool.query('SELECT material_id, quantity FROM purchase_request_lines WHERE purchase_request_id = $1', [pr.id])).rows;
    expect(lines).toHaveLength(1);
    expect(lines[0].material_id).toBe(item.id);
    // idempotent: a second sweep finds the open draft and creates nothing
    const second = await replenishment.evaluateMaterial(q, item, { notify: false });
    expect(second.actions.purchase_request.created).toBe(false);
    expect((await one("SELECT count(*)::int n FROM purchase_requests WHERE source_key = $1", [`replenishment:${item.id}`])).n).toBe(1);
  });

  test('a replenishment purchase order is one header without a material plus one line, and is never stacked', async () => {
    const first = await replenishment.evaluateMaterial(q, item2, { notify: false });
    expect(first.actions.purchase_order.created).toBe(true);
    po2 = first.actions.purchase_order.order;
    const header = await one('SELECT material_id, quantity, unit_price FROM purchase_orders WHERE id = $1', [po2.id]);
    expect(header.material_id).toBeNull();
    const lines = (await pool.query('SELECT material_id, quantity, unit_rate FROM purchase_order_lines WHERE purchase_order_id = $1', [po2.id])).rows;
    expect(lines).toHaveLength(1);
    expect(lines[0].material_id).toBe(item2.id);
    expect(Number(lines[0].unit_rate)).toBe(100);
    const second = await replenishment.evaluateMaterial(q, item2, { notify: false });
    // the order is now incoming stock, so the second sweep needs nothing; if it did act it must reuse the open order
    expect(second.actions.purchase_order === null || second.actions.purchase_order.created === false).toBe(true);
    expect((await one("SELECT count(*)::int n FROM purchase_orders po WHERE EXISTS (SELECT 1 FROM purchase_order_lines l WHERE l.purchase_order_id = po.id AND l.material_id = $1)", [item2.id])).n).toBe(1);
  });

  test('incoming quantity counts the undelivered part of the lines of open orders only', async () => {
    const m = await mkItem('inc', 'alert_only');
    const open = (await one("INSERT INTO purchase_orders (order_number, supplier_id, status) VALUES ($1, $2, 'issued') RETURNING id", [`L26C-${tag}-A`, supplier])).id;
    const closed = (await one("INSERT INTO purchase_orders (order_number, supplier_id, status) VALUES ($1, $2, 'closed') RETURNING id", [`L26C-${tag}-B`, supplier])).id;
    await pool.query('INSERT INTO purchase_order_lines (purchase_order_id, material_id, quantity, delivered_quantity) VALUES ($1, $3, 10, 4), ($2, $3, 7, 0)', [open, closed, m.id]);
    expect(await replenishment.openConfirmedQuantity(q, m.id)).toBe(6);
  });

  test('a database error while counting incoming stock is raised, not swallowed', async () => {
    const failing = async (sql) => { if (/purchase_order_lines/.test(sql)) throw new Error('boom'); return { rows: [] }; };
    await expect(replenishment.openConfirmedQuantity(failing, 1)).rejects.toThrow('boom');
  });

  test('a delayed purchase order raises its alert for the materials on its lines', async () => {
    const m = await mkItem('late', 'alert_only');
    const late = (await one("INSERT INTO purchase_orders (order_number, supplier_id, status, needed_by) VALUES ($1, $2, 'issued', '2020-01-01') RETURNING id", [`L26C-${tag}-C`, supplier])).id;
    await pool.query('INSERT INTO purchase_order_lines (purchase_order_id, material_id, quantity) VALUES ($1, $2, 5)', [late, m.id]);
    await replenishment.runReplenishmentSweep(q, { notify: false });
    const alert = await one("SELECT purchase_order_id FROM replenishment_alerts WHERE material_id = $1 AND alert_type = 'delayed_po' AND status = 'open'", [m.id]);
    expect(alert && alert.purchase_order_id).toBe(late);
  });

  describe('migration 0014 backfills lines for header-only orders', () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'migrations', '0014_backfill_header_only_lines.sql'), 'utf8');
    test('adds one line per header-only PO and PR, leaves documents that have lines alone, and is repeatable', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const m = (await client.query("INSERT INTO item_master (code, category, unit, name_en, name_ar) VALUES ($1, 'other', 'bag', 'h', 'h') RETURNING id", [`L26C-${tag}-H`])).rows[0].id;
        const onlyHeader = (await client.query("INSERT INTO purchase_orders (order_number, supplier_id, material_id, quantity, unit, unit_price, status) VALUES ($1, $2, $3, 12, 'bag', 7.5, 'issued') RETURNING id", [`L26C-${tag}-D`, supplier, m])).rows[0].id;
        const hasLines = (await client.query("INSERT INTO purchase_orders (order_number, supplier_id, material_id, quantity, unit_price, status) VALUES ($1, $2, $3, 99, 1, 'issued') RETURNING id", [`L26C-${tag}-E`, supplier, m])).rows[0].id;
        await client.query('INSERT INTO purchase_order_lines (purchase_order_id, material_id, quantity) VALUES ($1, $2, 3)', [hasLines, m]);
        const prOnly = (await client.query("INSERT INTO purchase_requests (request_number, material_id, quantity, unit, status) VALUES ($1, $2, 8, 'bag', 'draft') RETURNING id", [`L26C-${tag}-PR`, m])).rows[0].id;
        await client.query(sql);
        await client.query(sql);
        const a = (await client.query('SELECT material_id, quantity, unit, unit_rate FROM purchase_order_lines WHERE purchase_order_id = $1', [onlyHeader])).rows;
        expect(a).toHaveLength(1);
        expect([a[0].material_id, Number(a[0].quantity), a[0].unit, Number(a[0].unit_rate)]).toEqual([m, 12, 'bag', 7.5]);
        expect((await client.query('SELECT 1 FROM purchase_order_lines WHERE purchase_order_id = $1', [hasLines])).rows).toHaveLength(1);
        const b = (await client.query('SELECT material_id, quantity FROM purchase_request_lines WHERE purchase_request_id = $1', [prOnly])).rows;
        expect(b).toHaveLength(1);
        expect([b[0].material_id, Number(b[0].quantity)]).toEqual([m, 8]);
      } finally { await client.query('ROLLBACK'); client.release(); }
    });
  });
});
