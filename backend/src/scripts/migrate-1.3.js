// Add equipment_assignments and equipment_usage_logs tables
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');

async function migrate() {
  console.log('Running Prompt 1.3 migration...\n');

  await query(`
    CREATE TABLE IF NOT EXISTS equipment_assignments (
      id SERIAL PRIMARY KEY,
      equipment_id INTEGER REFERENCES assets(id) ON DELETE CASCADE,
      project_id INTEGER,
      assigned_from DATE NOT NULL,
      assigned_to DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] equipment_assignments');

  await query(`
    CREATE TABLE IF NOT EXISTS equipment_usage_logs (
      id SERIAL PRIMARY KEY,
      equipment_id INTEGER REFERENCES assets(id) ON DELETE CASCADE,
      project_id INTEGER,
      log_date DATE NOT NULL,
      hours_operated DECIMAL(10,2) DEFAULT 0,
      operator_id INTEGER,
      fuel_liters DECIMAL(10,2) DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] equipment_usage_logs');

  // Also ensure assets table has the equipment columns (if running on existing DB)
  await query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS equipment_type VARCHAR(50)`);
  await query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(15,2) DEFAULT 0`);
  await query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS daily_rate DECIMAL(15,2) DEFAULT 0`);
  await query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS operator_required BOOLEAN DEFAULT false`);

  console.log('\nMigration complete!');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
