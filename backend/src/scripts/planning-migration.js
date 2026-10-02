// Phase 22 migration — planning / scheduling (net-new module).
//
// Run:  node backend/src/scripts/migrate-34-planning.js
//
// schedule_activities / activity_relationships / calendars / baselines,
// milestone↔activity integration, the earned-value opt-in flag, and the
// project_phases integration (a phase can own activities). project_phases
// and project_milestones are integrated, not replaced.

const DDL = [
  `CREATE TABLE IF NOT EXISTS calendars (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    is_default BOOLEAN DEFAULT false,
    work_days JSONB DEFAULT '[1,2,3,4,5]',
    exceptions JSONB DEFAULT '[]',      -- [{ date, is_workday, note }]
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_calendars_project ON calendars(project_id)`,

  `CREATE TABLE IF NOT EXISTS schedule_activities (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    activity_code VARCHAR(50),
    name VARCHAR(255) NOT NULL,
    wbs_path VARCHAR(300),
    work_package VARCHAR(255),
    phase_id INTEGER,
    project_location_id INTEGER REFERENCES project_locations(id) ON DELETE SET NULL,
    boq_item_id INTEGER,
    boq_location_allocation_id INTEGER,
    calendar_id INTEGER REFERENCES calendars(id) ON DELETE SET NULL,
    responsible_organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    responsible_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    subcontractor_organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    planned_start DATE,
    planned_finish DATE,
    actual_start DATE,
    actual_finish DATE,
    original_duration INTEGER DEFAULT 0,
    remaining_duration INTEGER,
    percent_complete DECIMAL(5,2) DEFAULT 0,
    progress_source VARCHAR(20) DEFAULT 'manual',  -- manual | quantity
    planned_quantity DECIMAL(15,3),
    critical BOOLEAN DEFAULT false,
    total_float DECIMAL(10,2),
    is_milestone BOOLEAN DEFAULT false,
    status VARCHAR(30) DEFAULT 'planned',          -- planned | in_progress | completed | suspended
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_schedule_activities_project ON schedule_activities(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_schedule_activities_location ON schedule_activities(project_location_id)`,

  `CREATE TABLE IF NOT EXISTS activity_relationships (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    predecessor_id INTEGER NOT NULL REFERENCES schedule_activities(id) ON DELETE CASCADE,
    successor_id INTEGER NOT NULL REFERENCES schedule_activities(id) ON DELETE CASCADE,
    relationship_type VARCHAR(2) NOT NULL DEFAULT 'FS',  -- FS | SS | FF | SF
    lag_days INTEGER DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_activity_relationships_pred ON activity_relationships(predecessor_id)`,
  `CREATE INDEX IF NOT EXISTS idx_activity_relationships_succ ON activity_relationships(successor_id)`,

  `CREATE TABLE IF NOT EXISTS baselines (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    baseline_date TIMESTAMPTZ DEFAULT NOW(),
    data JSONB DEFAULT '[]',
    is_current BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_baselines_project ON baselines(project_id)`,

  // Integration — a milestone can reference a schedule activity; the EV
  // bookkeeping is opt-in per project (SPI/CPI only where enabled).
  `ALTER TABLE project_milestones ADD COLUMN IF NOT EXISTS schedule_activity_id INTEGER REFERENCES schedule_activities(id) ON DELETE SET NULL`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS earned_value_enabled BOOLEAN DEFAULT false`,
];

async function ensureTables(query) {
  for (const ddl of DDL) {
    await query(ddl);
  }
}

module.exports = { DDL, ensureTables };
