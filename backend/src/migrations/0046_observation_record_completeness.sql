ALTER TABLE observations
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS drawing_reference VARCHAR(255),
  ADD COLUMN IF NOT EXISTS drawing_document_id INTEGER REFERENCES project_documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_observations_due_project
  ON observations (project_id, due_date) WHERE due_date IS NOT NULL;
