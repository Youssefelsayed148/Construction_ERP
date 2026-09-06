require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');

async function migrate() {
  console.log('Running Prompt 2.2 migration...\n');

  await query(`
    CREATE TABLE IF NOT EXISTS warehouses (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      name_en VARCHAR(255),
      name_ar VARCHAR(255),
      type VARCHAR(50) NOT NULL DEFAULT 'site',
      project_id INTEGER REFERENCES projects(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] warehouses');

  await query(`
    CREATE TABLE IF NOT EXISTS warehouse_stock (
      id SERIAL PRIMARY KEY,
      warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE CASCADE,
      item_id INTEGER REFERENCES item_master(id),
      quantity DECIMAL(15,3) DEFAULT 0,
      reorder_level DECIMAL(15,3) DEFAULT 0,
      UNIQUE(warehouse_id, item_id)
    )
  `);
  console.log('[OK] warehouse_stock');

  await query(`
    CREATE TABLE IF NOT EXISTS inventory_transfers (
      id SERIAL PRIMARY KEY,
      from_warehouse_id INTEGER REFERENCES warehouses(id),
      to_warehouse_id INTEGER REFERENCES warehouses(id),
      status VARCHAR(50) DEFAULT 'draft',
      requested_by INTEGER REFERENCES users(id),
      approved_by INTEGER REFERENCES users(id),
      transferred_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS inventory_transfer_items (
      id SERIAL PRIMARY KEY,
      transfer_id INTEGER REFERENCES inventory_transfers(id) ON DELETE CASCADE,
      item_id INTEGER REFERENCES item_master(id),
      quantity DECIMAL(15,3) DEFAULT 0
    )
  `);
  console.log('[OK] inventory_transfers');

  console.log('\nMigration complete!');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
