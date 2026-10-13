CREATE TABLE IF NOT EXISTS schedule_progress_updates (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  schedule_activity_id INTEGER NOT NULL REFERENCES schedule_activities(id) ON DELETE CASCADE,
  previous_percent_complete NUMERIC(5,2) NOT NULL CHECK (previous_percent_complete BETWEEN 0 AND 100),
  percent_complete NUMERIC(5,2) NOT NULL CHECK (percent_complete BETWEEN 0 AND 100),
  progress_source VARCHAR(20) NOT NULL CHECK (progress_source IN ('manual', 'quantity')),
  data_date DATE NOT NULL,
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedule_progress_updates_activity
  ON schedule_progress_updates(schedule_activity_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS schedule_activity_assignments (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  schedule_activity_id INTEGER NOT NULL REFERENCES schedule_activities(id) ON DELETE CASCADE,
  employee_id INTEGER REFERENCES employees(id) ON DELETE RESTRICT,
  asset_register_id INTEGER REFERENCES asset_register(id) ON DELETE RESTRICT,
  assigned_from DATE NOT NULL,
  assigned_to DATE NOT NULL,
  allocation_percent NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (allocation_percent > 0 AND allocation_percent <= 100),
  status VARCHAR(20) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (assigned_to >= assigned_from),
  CHECK (num_nonnulls(employee_id, asset_register_id) = 1)
);

CREATE INDEX IF NOT EXISTS idx_schedule_activity_assignments_activity
  ON schedule_activity_assignments(schedule_activity_id, status, assigned_from, assigned_to);
CREATE INDEX IF NOT EXISTS idx_schedule_activity_assignments_employee
  ON schedule_activity_assignments(employee_id, status, assigned_from, assigned_to) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schedule_activity_assignments_asset
  ON schedule_activity_assignments(asset_register_id, status, assigned_from, assigned_to) WHERE asset_register_id IS NOT NULL;
