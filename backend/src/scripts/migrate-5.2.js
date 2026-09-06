require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');

async function migrate() {
  console.log('Running Prompt 5.2 migration...\n');

  await query(`
    CREATE TABLE IF NOT EXISTS cost_codes (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      name_en VARCHAR(255),
      name_ar VARCHAR(255),
      parent_id INTEGER REFERENCES cost_codes(id),
      level INTEGER DEFAULT 1,
      type VARCHAR(50) DEFAULT 'material',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] cost_codes');

  await query(`
    CREATE TABLE IF NOT EXISTS project_budgets (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      cost_code_id INTEGER REFERENCES cost_codes(id),
      budget_amount DECIMAL(15,2) DEFAULT 0,
      revised_amount DECIMAL(15,2) DEFAULT 0,
      status VARCHAR(50) DEFAULT 'draft',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] project_budgets');

  await query(`
    CREATE TABLE IF NOT EXISTS project_costs (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id),
      cost_code_id INTEGER REFERENCES cost_codes(id),
      source_type VARCHAR(100) NOT NULL,
      source_id INTEGER,
      amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      transaction_date DATE DEFAULT CURRENT_DATE,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] project_costs');

  // Seed CSI-style cost codes
  const existingCodes = await query('SELECT COUNT(*) as cnt FROM cost_codes');
  if (parseInt(existingCodes.rows[0].cnt) === 0) {
    await query(`
      INSERT INTO cost_codes (code, name, name_en, name_ar, level, type) VALUES
        ('01','General Requirements','General Requirements','المتطلبات العامة',1,'overhead'),
        ('02','Site Work','Site Work','أعمال الموقع',1,'material'),
        ('03','Concrete','Concrete','الخرسانة',1,'material'),
        ('04','Masonry','Masonry','أعمال المباني',1,'material'),
        ('05','Metals','Metals','المعادن',1,'material'),
        ('06','Wood & Plastics','Wood & Plastics','الأخشاب والبلاستيك',1,'material'),
        ('07','Thermal & Moisture','Thermal & Moisture Protection','العزل الحراري والرطوبة',1,'material'),
        ('08','Doors & Windows','Doors & Windows','الأبواب والنوافذ',1,'material'),
        ('09','Finishes','Finishes','التشطيبات',1,'material'),
        ('10','Equipment','Equipment','المعدات',1,'equipment'),
        ('11','Labor','Labor','العمالة',1,'labor'),
        ('12','Subcontractors','Subcontractors','المقاولين الفرعيين',1,'subcontract')
    `);
  }
  console.log('[OK] cost_codes seeded');

  console.log('\nMigration complete!');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
