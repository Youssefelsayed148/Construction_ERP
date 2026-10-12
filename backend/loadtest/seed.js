// Load-test dataset seeder (closeout B11). Bulk SQL (generate_series), no app services, so seeding is fast.
//
// SAFETY: refuses to run unless LOADTEST_CONFIRM_THROWAWAY=1 and the database host is local. It only ever INSERTs
// rows whose codes start with "lt-" and never deletes anything. Run it against a disposable database only.
//
//   LOADTEST_CONFIRM_THROWAWAY=1 node loadtest/seed.js            (default sizes below)
//   LT_PROJECTS=10 LT_ITEMS=500 ... node loadtest/seed.js         (smaller)
'use strict';

const SIZES = {
  projects: Number(process.env.LT_PROJECTS || 50),
  items: Number(process.env.LT_ITEMS || 5000),
  movements: Number(process.env.LT_MOVEMENTS || 20000),
  invoices: Number(process.env.LT_INVOICES || 2000),
  suppliers: Number(process.env.LT_SUPPLIERS || 200),
  clients: Number(process.env.LT_CLIENTS || 50),
  purchaseOrders: Number(process.env.LT_POS || 500),
};

async function main() {
  if (process.env.LOADTEST_CONFIRM_THROWAWAY !== '1') throw new Error('Set LOADTEST_CONFIRM_THROWAWAY=1 (throwaway database only)');
  const host = process.env.DB_HOST || 'localhost';
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error(`Refusing to seed non-local host ${host}`);
  const db = require('../src/config/database');
  const q = (sql, params) => db.query(sql, params);
  const one = async (sql, params) => (await q(sql, params)).rows[0];
  const t0 = Date.now();
  const tag = 'lt';

  await q(`INSERT INTO clients (code, name_ar, name_en, is_active)
           SELECT '${tag}-c-' || g, 'Client ' || g, 'Client ' || g, true FROM generate_series(1, $1) g`, [SIZES.clients]);
  await q(`INSERT INTO suppliers (code, name_ar, name_en, is_active)
           SELECT '${tag}-s-' || g, 'Supplier ' || g, 'Supplier ' || g, true FROM generate_series(1, $1) g`, [SIZES.suppliers]);
  await q(`INSERT INTO projects (name, name_en, name_ar, code, project_type, client_id, status, budget, contract_value, completion_percentage, start_date)
           SELECT 'LT Project ' || g, 'LT Project ' || g, 'LT Project ' || g, 'LT' || g,
                  (ARRAY['residential','commercial','industrial','infrastructure'])[1 + g % 4],
                  (SELECT id FROM clients WHERE code = '${tag}-c-' || (1 + g % $2)),
                  (ARRAY['active','active','planning','on_hold'])[1 + g % 4],
                  5000000 + g * 1000, 8000000 + g * 1000, (g * 7) % 100, CURRENT_DATE - (g % 300)
             FROM generate_series(1, $1) g`, [SIZES.projects, SIZES.clients]);
  await q(`INSERT INTO item_master (code, category, name_en, name_ar, unit, min_stock, safety_stock, reorder_point, order_multiple, moq, supplier_lead_time_days, is_active)
           SELECT '${tag}-i-' || g, (ARRAY['cement','steel','electrical','plumbing','finishing'])[1 + g % 5], 'Item ' || g, 'Item ' || g, 'pcs',
                  10 + g % 40, 5, 20 + g % 60, 5, 0, 7, true
             FROM generate_series(1, $1) g`, [SIZES.items]);
  // one central warehouse + one site warehouse per project
  await q(`INSERT INTO warehouses (name, name_en, type, project_id)
           SELECT 'LT WH ' || p.id, 'LT WH ' || p.id, 'site', p.id FROM projects p WHERE p.code LIKE 'LT%'`);
  await q(`INSERT INTO warehouses (name, name_en, type) VALUES ('LT Central', 'LT Central', 'central')`);
  // stock rows: every warehouse holds a slice of the items
  await q(`INSERT INTO warehouse_stock (warehouse_id, item_id, quantity, available_quantity, reorder_level, avg_unit_cost)
           SELECT w.id, i.id, 5 + (i.id % 90), 5 + (i.id % 90), 20, 10 + (i.id % 50)
             FROM warehouses w JOIN item_master i ON i.code LIKE '${tag}-i-%' AND (i.id + w.id) % 25 = 0
            WHERE w.name LIKE 'LT %'`);
  await q(`INSERT INTO stock_movements (warehouse_id, material_id, movement_type, quantity, unit_cost, total_cost, created_at)
           SELECT w.id, i.id, (ARRAY['receipt','issue','receipt','transfer_in'])[1 + g % 4], 1 + g % 20, 10 + g % 50, (1 + g % 20) * (10 + g % 50),
                  NOW() - (g % 365 || ' days')::interval
             FROM generate_series(1, $1) g
             JOIN LATERAL (SELECT id FROM warehouses WHERE name LIKE 'LT %' ORDER BY id OFFSET (g % $2) LIMIT 1) w ON true
             JOIN LATERAL (SELECT id FROM item_master WHERE code = '${tag}-i-' || (1 + g % $3)) i ON true`, [SIZES.movements, SIZES.projects + 1, SIZES.items]);
  await q(`INSERT INTO invoices (invoice_number, project_id, client_id, amount, issue_date, due_date, status, description)
           SELECT 'LT-INV-' || g, p.id, p.client_id, 10000 + g * 13, CURRENT_DATE - (g % 400), CURRENT_DATE - (g % 400) + 30,
                  (ARRAY['draft','sent','partially_paid','paid'])[1 + g % 4], 'Load test invoice ' || g
             FROM generate_series(1, $1) g
             JOIN LATERAL (SELECT id, client_id FROM projects WHERE code = 'LT' || (1 + g % $2)) p ON true`, [SIZES.invoices, SIZES.projects]);
  // purchase orders, three lines each, one GRN per PO covering the lines
  await q(`INSERT INTO purchase_orders (order_number, supplier_id, project_id, status, total_amount, taxes, created_at)
           SELECT 'LT-PO-' || g, (SELECT id FROM suppliers WHERE code = '${tag}-s-' || (1 + g % $2)), (SELECT id FROM projects WHERE code = 'LT' || (1 + g % $3)),
                  'issued', 3 * 10 * 100, 0, NOW() - (g % 200 || ' days')::interval
             FROM generate_series(1, $1) g`, [SIZES.purchaseOrders, SIZES.suppliers, SIZES.projects]);
  await q(`INSERT INTO purchase_order_lines (purchase_order_id, material_id, quantity, unit, unit_rate, line_net, delivered_quantity, accepted_quantity)
           SELECT po.id, (SELECT id FROM item_master WHERE code = '${tag}-i-' || (1 + (po.id * 3 + l) % $1)), 10, 'pcs', 100, 1000, 10, 10
             FROM purchase_orders po, generate_series(1, 3) l WHERE po.order_number LIKE 'LT-PO-%'`, [SIZES.items]);
  await q(`INSERT INTO goods_receipt_notes (grn_number, purchase_order_id, warehouse_id, status)
           SELECT 'LT-GRN-' || po.id, po.id, (SELECT id FROM warehouses WHERE project_id = po.project_id LIMIT 1), 'posted'
             FROM purchase_orders po WHERE po.order_number LIKE 'LT-PO-%'`);
  await q(`INSERT INTO grn_lines (grn_id, purchase_order_line_id, material_id, quantity, unit, returned_quantity)
           SELECT g.id, pol.id, pol.material_id, 10, 'pcs', 0
             FROM goods_receipt_notes g JOIN purchase_order_lines pol ON pol.purchase_order_id = g.purchase_order_id
            WHERE g.grn_number LIKE 'LT-GRN-%'`);

  // an owner for the HTTP run
  const email = 'lt-owner@loadtest.local';
  let owner = await one('SELECT id FROM users WHERE email = $1', [email]);
  if (!owner) {
    owner = await one("INSERT INTO users (name, email, password, role) VALUES ('lt-owner', $1, 'x', 'owner') RETURNING id", [email]);
    await q("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [owner.id]);
  }
  const counts = await one(`SELECT (SELECT count(*) FROM projects) projects, (SELECT count(*) FROM item_master) items,
    (SELECT count(*) FROM stock_movements) stock_movements, (SELECT count(*) FROM invoices) invoices,
    (SELECT count(*) FROM purchase_orders) purchase_orders, (SELECT count(*) FROM goods_receipt_notes) grns,
    (SELECT count(*) FROM grn_lines) grn_lines, (SELECT count(*) FROM suppliers) suppliers, (SELECT count(*) FROM warehouses) warehouses,
    (SELECT count(*) FROM warehouse_stock) warehouse_stock`);
  await q('ANALYZE');
  console.log(JSON.stringify({ seeded_ms: Date.now() - t0, counts }, null, 2));
  await db.pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
