require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');

async function migrate() {
  console.log('Running Phase 8 (QC & HSE) migration...\n');

  await query(`
    CREATE TABLE IF NOT EXISTS quality_tests (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      boq_item_id INTEGER,
      test_type VARCHAR(100) NOT NULL,
      test_date DATE DEFAULT CURRENT_DATE,
      result VARCHAR(20) DEFAULT 'pending',
      tested_by VARCHAR(255),
      notes TEXT,
      attachments JSONB DEFAULT '[]',
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] quality_tests');

  await query(`
    CREATE TABLE IF NOT EXISTS ncrs (
      id SERIAL PRIMARY KEY,
      ncr_number VARCHAR(50) UNIQUE NOT NULL,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      boq_item_id INTEGER,
      quality_test_id INTEGER REFERENCES quality_tests(id),
      description TEXT NOT NULL,
      severity VARCHAR(20) DEFAULT 'minor',
      status VARCHAR(30) DEFAULT 'open',
      raised_by INTEGER REFERENCES users(id),
      resolved_by INTEGER REFERENCES users(id),
      resolution_notes TEXT,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] ncrs');

  await query(`
    CREATE TABLE IF NOT EXISTS safety_inspections (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      inspection_date DATE DEFAULT CURRENT_DATE,
      inspector_id INTEGER REFERENCES users(id),
      checklist_items JSONB DEFAULT '[]',
      findings TEXT,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] safety_inspections');

  await query(`
    CREATE TABLE IF NOT EXISTS safety_incidents (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      incident_date DATE DEFAULT CURRENT_DATE,
      incident_type VARCHAR(100),
      severity VARCHAR(20) DEFAULT 'minor',
      description TEXT NOT NULL,
      injured_party VARCHAR(255),
      reported_by INTEGER REFERENCES users(id),
      corrective_action TEXT,
      status VARCHAR(30) DEFAULT 'open',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] safety_incidents');

  await query('CREATE INDEX IF NOT EXISTS idx_quality_tests_project ON quality_tests(project_id, result)');
  await query('CREATE INDEX IF NOT EXISTS idx_ncrs_project ON ncrs(project_id, status)');
  // Phase 20 replaces these legacy tables with compatibility views. On a
  // rerun, index only when the legacy relation is still a physical table.
  await query(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE oid = 'safety_inspections'::regclass AND relkind IN ('r', 'p')) THEN
      CREATE INDEX IF NOT EXISTS idx_safety_inspections_project ON safety_inspections(project_id);
    END IF;
  END $$`);
  await query(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE oid = 'safety_incidents'::regclass AND relkind IN ('r', 'p')) THEN
      CREATE INDEX IF NOT EXISTS idx_safety_incidents_project ON safety_incidents(project_id, status);
    END IF;
  END $$`);
  console.log('[OK] indexes');

  console.log('\nMigration complete!');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
