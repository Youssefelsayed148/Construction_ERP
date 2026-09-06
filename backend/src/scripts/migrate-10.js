require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');

async function migrate() {
  console.log('Running Phase 10 (Buildings & Units) migration...\n');

  await query(`
    CREATE TABLE IF NOT EXISTS buildings (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      code VARCHAR(50) NOT NULL,
      name VARCHAR(255) NOT NULL,
      floors INTEGER DEFAULT 1,
      units_per_floor INTEGER DEFAULT 1,
      status VARCHAR(30) DEFAULT 'planning',
      completion_percentage DECIMAL(5,2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(project_id, code)
    )
  `);
  console.log('[OK] buildings');

  await query(`
    CREATE TABLE IF NOT EXISTS units (
      id SERIAL PRIMARY KEY,
      building_id INTEGER REFERENCES buildings(id) ON DELETE CASCADE,
      code VARCHAR(50) NOT NULL,
      type VARCHAR(30) DEFAULT 'apartment',
      area DECIMAL(10,2),
      bedrooms INTEGER,
      bathrooms INTEGER,
      floor_no INTEGER,
      finishing_type VARCHAR(30) DEFAULT 'semi_finished',
      price DECIMAL(15,2),
      price_per_m2 DECIMAL(12,2),
      view VARCHAR(100),
      facing VARCHAR(50),
      features JSONB DEFAULT '[]',
      status VARCHAR(30) DEFAULT 'available',
      delivery_date DATE,
      handover_date DATE,
      sold_amount DECIMAL(15,2),
      commission_percent DECIMAL(5,2),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(building_id, code)
    )
  `);
  console.log('[OK] units');

  console.log('[INFO] Adding client_id FK to units...');
  try {
    await query(`ALTER TABLE units ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE RESTRICT`);
    console.log('[OK] units.client_id FK added');
  } catch (e) {
    if (e.code === '42710') console.log('[SKIP] client_id column already exists');
    else { console.error('Failed adding client_id:', e.message); }
  }

  await query('CREATE INDEX IF NOT EXISTS idx_buildings_project ON buildings(project_id)');
  await query('CREATE INDEX IF NOT EXISTS idx_units_building ON units(building_id, status)');
  await query('CREATE INDEX IF NOT EXISTS idx_units_client ON units(client_id)');
  console.log('[OK] indexes');

  console.log('\nMigration complete!');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
