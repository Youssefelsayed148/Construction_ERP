require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');

async function migrate() {
  console.log('Running Phase 9 (Document Control) migration...\n');

  await query(`
    CREATE TABLE IF NOT EXISTS document_categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      parent_id INTEGER REFERENCES document_categories(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] document_categories');

  await query(`
    CREATE TABLE IF NOT EXISTS project_documents (
      id SERIAL PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      category_id INTEGER REFERENCES document_categories(id),
      title VARCHAR(255) NOT NULL,
      description TEXT,
      document_type VARCHAR(50) DEFAULT 'drawing',
      file_url TEXT,
      file_type VARCHAR(20),
      file_size_bytes BIGINT,
      version INTEGER DEFAULT 1,
      status VARCHAR(30) DEFAULT 'draft',
      tags JSONB DEFAULT '[]',
      uploaded_by INTEGER REFERENCES users(id),
      approved_by INTEGER REFERENCES users(id),
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] project_documents');

  await query(`
    CREATE TABLE IF NOT EXISTS document_versions (
      id SERIAL PRIMARY KEY,
      document_id INTEGER REFERENCES project_documents(id) ON DELETE CASCADE,
      version_no INTEGER NOT NULL,
      file_url TEXT NOT NULL,
      file_type VARCHAR(20),
      file_size_bytes BIGINT,
      change_description TEXT,
      uploaded_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(document_id, version_no)
    )
  `);
  console.log('[OK] document_versions');

  await query(`
    CREATE TABLE IF NOT EXISTS project_rfis (
      id SERIAL PRIMARY KEY,
      rfi_number VARCHAR(50) UNIQUE NOT NULL,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      subject VARCHAR(255) NOT NULL,
      question TEXT,
      category VARCHAR(100),
      priority VARCHAR(20) DEFAULT 'normal',
      status VARCHAR(20) DEFAULT 'open',
      due_date DATE,
      raised_by INTEGER REFERENCES users(id),
      answered_by INTEGER REFERENCES users(id),
      answer TEXT,
      answered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] project_rfis');

  await query(`
    CREATE TABLE IF NOT EXISTS project_submittals (
      id SERIAL PRIMARY KEY,
      submittal_number VARCHAR(50) UNIQUE NOT NULL,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      submittal_type VARCHAR(30) DEFAULT 'material',
      status VARCHAR(30) DEFAULT 'submitted',
      submitted_to VARCHAR(255),
      submitted_by INTEGER REFERENCES users(id),
      submitted_at TIMESTAMPTZ DEFAULT NOW(),
      response TEXT,
      responded_by INTEGER REFERENCES users(id),
      responded_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] project_submittals');

  await query('CREATE INDEX IF NOT EXISTS idx_project_documents_project ON project_documents(project_id, category_id, status)');
  await query('CREATE INDEX IF NOT EXISTS idx_document_versions_doc ON document_versions(document_id)');
  await query('CREATE INDEX IF NOT EXISTS idx_rfis_project ON project_rfis(project_id, status)');
  await query('CREATE INDEX IF NOT EXISTS idx_submittals_project ON project_submittals(project_id, status)');
  console.log('[OK] indexes');

  const existing = await query('SELECT COUNT(*) as cnt FROM document_categories');
  if (parseInt(existing.rows[0].cnt) === 0) {
    await query(`
      INSERT INTO document_categories (name) VALUES
        ('Drawings'), ('Contracts'), ('Reports'), ('Photos'), ('Correspondence'), ('Permits & Approvals')
    `);
  }
  console.log('[OK] default categories seeded');

  console.log('\nMigration complete!');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
