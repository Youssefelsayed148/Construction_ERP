// B3 (C-MASTER-001 / C-INVENTORY-001) — the warehouses master surface. Parsed from
// route source like route-guards.test.js; the real-PG behaviour cases live in
// b3-warehouses.pg.test.js.
const fs = require('fs');
const path = require('path');

const ROUTES_DIR = path.join(__dirname, '..', '..', 'routes');
const warehouses = fs.readFileSync(path.join(ROUTES_DIR, 'warehouses.js'), 'utf8');

describe('B3 warehouse master routes', () => {
  test('POST / creates a warehouse (no delete route exists)', () => {
    expect(warehouses).toMatch(/router\.post\('\/',\s*authenticate,\s*authorize\(\)/);
    expect(warehouses).toMatch(/INSERT INTO warehouses/);
    expect(warehouses).toMatch(/module: 'warehouses'/);
  });

  test('PUT /:id updates a warehouse; there is no DELETE route', () => {
    expect(warehouses).toMatch(/router\.put\('\/:id',\s*authenticate,\s*authorize\(\)/);
    expect(warehouses).not.toMatch(/router\.delete\('\/:id'/);
  });

  test('PUT /:id/stock/:itemId/reorder-level validates reorder_level >= 0 and is audited', () => {
    expect(warehouses).toMatch(/router\.put\('\/:id\/stock\/:itemId\/reorder-level',\s*authenticate,\s*authorize\(\)/);
    expect(warehouses).toMatch(/reorder_level:\s*Joi\.number\(\)\.min\(0\)\.required\(\)/);
    expect(warehouses).toMatch(/ON CONFLICT \(warehouse_id, item_id\)/);
  });

  test('the movement projection never resets reorder_level (inventoryEngine UPDATE list)', () => {
    const engine = fs.readFileSync(path.join(__dirname, '..', '..', 'services', 'inventoryEngine.js'), 'utf8');
    const projection = engine.match(/UPDATE warehouse_stock\s*\n\s*SET ([\s\S]{0,300}?)\n\s*WHERE id = \$6/);
    expect(projection).not.toBeNull();
    expect(projection[1]).not.toContain('reorder_level'); // a movement keeps the configured threshold
  });
});
