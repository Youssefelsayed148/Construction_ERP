require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');

async function migrate() {
  console.log('Running Phase 7 (Site Management) migration...\n');

  await query(`
    CREATE TABLE IF NOT EXISTS site_daily_reports (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      report_date DATE NOT NULL DEFAULT CURRENT_DATE,
      weather VARCHAR(50),
      temperature VARCHAR(20),
      workers_count INTEGER DEFAULT 0,
      work_summary TEXT,
      material_received TEXT,
      equipment_on_site TEXT,
      issues_notes TEXT,
      photos JSONB DEFAULT '[]',
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(project_id, report_date)
    )
  `);
  console.log('[OK] site_daily_reports');

  await query(`
    CREATE TABLE IF NOT EXISTS engineer_instructions (
      id SERIAL PRIMARY KEY,
      instruction_number VARCHAR(50) UNIQUE NOT NULL,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      priority VARCHAR(20) DEFAULT 'normal',
      status VARCHAR(30) DEFAULT 'issued',
      issued_by INTEGER REFERENCES users(id),
      issued_date DATE DEFAULT CURRENT_DATE,
      response TEXT,
      closed_by INTEGER REFERENCES users(id),
      closed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] engineer_instructions');

  await query(`
    CREATE TABLE IF NOT EXISTS site_visits (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
      visitor_name VARCHAR(255) NOT NULL,
      visitor_role VARCHAR(100),
      notes TEXT,
      photos JSONB DEFAULT '[]',
      action_items JSONB DEFAULT '[]',
      logged_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] site_visits');

  await query('CREATE INDEX IF NOT EXISTS idx_site_reports_project_date ON site_daily_reports(project_id, report_date DESC)');
  await query('CREATE INDEX IF NOT EXISTS idx_instructions_project ON engineer_instructions(project_id, status)');
  await query('CREATE INDEX IF NOT EXISTS idx_site_visits_project ON site_visits(project_id, visit_date DESC)');
  console.log('[OK] indexes');

  console.log('\nMigration complete!');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
