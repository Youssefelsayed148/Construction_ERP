require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');

async function migrate() {
  console.log('Running Phase 4 migration...\n');

  await query(`
    CREATE TABLE IF NOT EXISTS subcontractors (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE,
      name VARCHAR(255) NOT NULL,
      name_en VARCHAR(255),
      name_ar VARCHAR(255),
      license_no VARCHAR(100),
      classification VARCHAR(100),
      specialties TEXT[] DEFAULT '{}',
      insurance_amount DECIMAL(15,2) DEFAULT 0,
      insurance_expiry DATE,
      contact_person VARCHAR(255),
      phone VARCHAR(50),
      email VARCHAR(255),
      address TEXT,
      bank_name VARCHAR(255),
      bank_account VARCHAR(255),
      rating DECIMAL(3,2) DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] subcontractors');

  await query(`
    CREATE TABLE IF NOT EXISTS sub_contracts (
      id SERIAL PRIMARY KEY,
      contract_number VARCHAR(50) UNIQUE,
      project_id INTEGER REFERENCES projects(id),
      subcontractor_id INTEGER REFERENCES subcontractors(id),
      boq_item_id INTEGER REFERENCES boq_items(id),
      scope TEXT,
      contract_value DECIMAL(15,2) DEFAULT 0,
      start_date DATE,
      end_date DATE,
      retention_percent DECIMAL(5,2) DEFAULT 10,
      status VARCHAR(50) DEFAULT 'draft',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] sub_contracts');

  await query(`
    CREATE TABLE IF NOT EXISTS sub_work_verifications (
      id SERIAL PRIMARY KEY,
      sub_contract_id INTEGER REFERENCES sub_contracts(id),
      boq_item_id INTEGER REFERENCES boq_items(id),
      period_from DATE,
      period_to DATE,
      quantity_claimed DECIMAL(15,3) DEFAULT 0,
      quantity_verified DECIMAL(15,3) DEFAULT 0,
      verified_by INTEGER REFERENCES users(id),
      status VARCHAR(50) DEFAULT 'pending',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] sub_work_verifications');

  await query(`
    CREATE TABLE IF NOT EXISTS sub_payment_certificates (
      id SERIAL PRIMARY KEY,
      certificate_number VARCHAR(50) UNIQUE,
      sub_contract_id INTEGER REFERENCES sub_contracts(id),
      period_from DATE,
      period_to DATE,
      work_value DECIMAL(15,2) DEFAULT 0,
      retention_deduction DECIMAL(15,2) DEFAULT 0,
      previous_paid DECIMAL(15,2) DEFAULT 0,
      penalties DECIMAL(15,2) DEFAULT 0,
      materials_deducted DECIMAL(15,2) DEFAULT 0,
      net_payable DECIMAL(15,2) DEFAULT 0,
      status VARCHAR(50) DEFAULT 'draft',
      certified_by INTEGER REFERENCES users(id),
      paid_at TIMESTAMPTZ,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] sub_payment_certificates');

  console.log('\nMigration complete!');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
