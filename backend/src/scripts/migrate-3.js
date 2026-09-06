require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');

async function migrate() {
  console.log('Running Phase 3 migration...\n');

  // BOQ
  await query(`
    CREATE TABLE IF NOT EXISTS boq_sections (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      code VARCHAR(50),
      name VARCHAR(255) NOT NULL,
      name_en VARCHAR(255),
      name_ar VARCHAR(255),
      parent_id INTEGER REFERENCES boq_sections(id),
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] boq_sections');

  await query(`
    CREATE TABLE IF NOT EXISTS boq_items (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      section_id INTEGER REFERENCES boq_sections(id) ON DELETE SET NULL,
      code VARCHAR(50),
      description VARCHAR(500),
      description_en VARCHAR(500),
      description_ar VARCHAR(500),
      unit VARCHAR(50) DEFAULT 'm2',
      quantity DECIMAL(15,3) DEFAULT 0,
      unit_rate DECIMAL(15,2) DEFAULT 0,
      total_price DECIMAL(15,2) GENERATED ALWAYS AS (quantity * unit_rate) STORED,
      item_master_id INTEGER REFERENCES item_master(id),
      type VARCHAR(50) DEFAULT 'material',
      completed_quantity DECIMAL(15,3) DEFAULT 0,
      completion_percentage DECIMAL(5,2) GENERATED ALWAYS AS (CASE WHEN quantity > 0 THEN (completed_quantity / quantity * 100) ELSE 0 END) STORED,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] boq_items');

  // Work Orders
  await query(`
    CREATE TABLE IF NOT EXISTS work_orders (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id),
      phase_id INTEGER REFERENCES project_phases(id),
      boq_section_id INTEGER REFERENCES boq_sections(id),
      title VARCHAR(255) NOT NULL,
      title_en VARCHAR(255),
      title_ar VARCHAR(255),
      description TEXT,
      status VARCHAR(50) DEFAULT 'planned',
      planned_start_date DATE,
      planned_end_date DATE,
      actual_start_date DATE,
      actual_end_date DATE,
      assigned_to INTEGER REFERENCES users(id),
      completion_percentage DECIMAL(5,2) DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] work_orders');

  await query(`
    CREATE TABLE IF NOT EXISTS work_order_materials (
      id SERIAL PRIMARY KEY,
      work_order_id INTEGER REFERENCES work_orders(id) ON DELETE CASCADE,
      item_id INTEGER REFERENCES item_master(id),
      boq_item_id INTEGER REFERENCES boq_items(id),
      planned_quantity DECIMAL(15,3) DEFAULT 0,
      actual_quantity DECIMAL(15,3) DEFAULT 0,
      unit_cost DECIMAL(15,2) DEFAULT 0,
      total_cost DECIMAL(15,2) DEFAULT 0,
      warehouse_id INTEGER REFERENCES warehouses(id),
      issued_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] work_order_materials');

  await query(`
    CREATE TABLE IF NOT EXISTS work_order_labor (
      id SERIAL PRIMARY KEY,
      work_order_id INTEGER REFERENCES work_orders(id) ON DELETE CASCADE,
      skill_category VARCHAR(100),
      worker_count INTEGER DEFAULT 1,
      hours DECIMAL(10,2) DEFAULT 0,
      work_date DATE,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] work_order_labor');

  await query(`
    CREATE TABLE IF NOT EXISTS work_order_equipment (
      id SERIAL PRIMARY KEY,
      work_order_id INTEGER REFERENCES work_orders(id) ON DELETE CASCADE,
      equipment_id INTEGER REFERENCES assets(id),
      hours DECIMAL(10,2) DEFAULT 0,
      hourly_cost DECIMAL(15,2) DEFAULT 0,
      total_cost DECIMAL(15,2) DEFAULT 0,
      work_date DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] work_order_equipment');

  await query(`
    CREATE TABLE IF NOT EXISTS work_completions (
      id SERIAL PRIMARY KEY,
      work_order_id INTEGER REFERENCES work_orders(id) ON DELETE CASCADE,
      boq_item_id INTEGER REFERENCES boq_items(id),
      quantity_completed DECIMAL(15,3) DEFAULT 0,
      completion_date DATE,
      verified_by INTEGER REFERENCES users(id),
      verified_at TIMESTAMPTZ,
      status VARCHAR(50) DEFAULT 'pending_verification',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] work_completions');

  console.log('\nMigration complete!');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
