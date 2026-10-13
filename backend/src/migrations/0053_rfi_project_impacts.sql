ALTER TABLE project_rfis
  ADD COLUMN IF NOT EXISTS project_location_id INTEGER REFERENCES project_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS work_package_id INTEGER REFERENCES work_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_impact NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS schedule_impact_days INTEGER;
