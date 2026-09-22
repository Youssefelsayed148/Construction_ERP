// Phase 24 migration — reporting engine: saved views, scheduled reports.
//
// Run:  node backend/src/scripts/migrate-35-reporting.js

const DDL = [
  `CREATE TABLE IF NOT EXISTS saved_views (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    params JSONB DEFAULT '{}',     -- filter/sort/page contract parameters
    is_shared BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_saved_views_user ON saved_views(user_id)`,

  `CREATE TABLE IF NOT EXISTS scheduled_reports (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    report_key VARCHAR(60) NOT NULL,
    name VARCHAR(150) NOT NULL,
    frequency VARCHAR(20) NOT NULL DEFAULT 'weekly', -- weekly | monthly
    recipients JSONB DEFAULT '[]',   -- user ids
    format VARCHAR(10) NOT NULL DEFAULT 'pdf',  -- pdf | csv
    is_active BOOLEAN DEFAULT true,
    last_run_at TIMESTAMPTZ,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_scheduled_reports_project ON scheduled_reports(project_id)`,

  `CREATE TABLE IF NOT EXISTS scheduled_report_runs (
    id SERIAL PRIMARY KEY,
    scheduled_report_id INTEGER NOT NULL REFERENCES scheduled_reports(id) ON DELETE CASCADE,
    ran_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(30) DEFAULT 'generated',  -- generated | notified | failed
    recipient_count INTEGER DEFAULT 0,
    error TEXT
  )`,
];

async function ensureTables(query) {
  for (const ddl of DDL) {
    await query(ddl);
  }
}

module.exports = { DDL, ensureTables };
