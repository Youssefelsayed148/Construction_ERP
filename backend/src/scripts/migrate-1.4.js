// Add daily_laborers and labor_payments tables
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');

async function migrate() {
  console.log('Running Prompt 1.4 migration...\n');

  await query(`
    CREATE TABLE IF NOT EXISTS daily_laborers (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE,
      full_name VARCHAR(255) NOT NULL,
      full_name_en VARCHAR(255),
      national_id VARCHAR(100),
      phone VARCHAR(50),
      skill_category VARCHAR(100) DEFAULT 'general',
      daily_rate DECIMAL(15,2) DEFAULT 0,
      bank_account VARCHAR(255),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] daily_laborers');

  await query(`
    CREATE TABLE IF NOT EXISTS labor_payments (
      id SERIAL PRIMARY KEY,
      project_id INTEGER,
      laborer_id INTEGER REFERENCES daily_laborers(id),
      work_order_id INTEGER,
      payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
      days_worked DECIMAL(10,2) DEFAULT 1,
      daily_rate DECIMAL(15,2) DEFAULT 0,
      total_amount DECIMAL(15,2) DEFAULT 0,
      paid_by VARCHAR(255),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] labor_payments');

  // Ensure employees table has bilingual name columns
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS name_en VARCHAR(255)`);
  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS name_ar VARCHAR(255)`);

  console.log('\nMigration complete!');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
