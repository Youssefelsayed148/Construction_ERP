require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');

async function migrate() {
  console.log('Running Prompt 2.1 migration...\n');

  await query(`
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      name_en VARCHAR(255),
      name_ar VARCHAR(255),
      code VARCHAR(50) UNIQUE NOT NULL,
      location VARCHAR(255),
      project_type VARCHAR(100) DEFAULT 'commercial',
      client_id INTEGER REFERENCES clients(id),
      project_manager_id INTEGER REFERENCES users(id),
      contract_value DECIMAL(15,2) DEFAULT 0,
      budget DECIMAL(15,2) DEFAULT 0,
      start_date DATE,
      expected_completion DATE,
      actual_completion DATE,
      status VARCHAR(50) DEFAULT 'planning',
      completion_percentage DECIMAL(5,2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] projects');

  await query(`
    CREATE TABLE IF NOT EXISTS project_phases (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      code VARCHAR(50),
      name VARCHAR(255) NOT NULL,
      name_en VARCHAR(255),
      name_ar VARCHAR(255),
      sort_order INTEGER DEFAULT 0,
      start_date DATE,
      end_date DATE,
      budget DECIMAL(15,2) DEFAULT 0,
      status VARCHAR(50) DEFAULT 'planning',
      completion_percentage DECIMAL(5,2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] project_phases');

  await query(`
    CREATE TABLE IF NOT EXISTS project_team (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      role VARCHAR(100) DEFAULT 'site_engineer',
      assigned_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] project_team');

  await query(`
    CREATE TABLE IF NOT EXISTS project_milestones (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      title_en VARCHAR(255),
      title_ar VARCHAR(255),
      target_date DATE,
      achieved_date DATE,
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] project_milestones');

  await query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS name_en VARCHAR(255)`);
  await query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS name_ar VARCHAR(255)`);

  console.log('\nMigration complete!');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
