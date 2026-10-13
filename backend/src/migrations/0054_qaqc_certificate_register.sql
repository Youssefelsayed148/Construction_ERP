CREATE TABLE IF NOT EXISTS qaqc_certificates (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  certificate_number VARCHAR(60) NOT NULL,
  certificate_type VARCHAR(30) NOT NULL
    CHECK (certificate_type IN ('material', 'test', 'equipment', 'calibration', 'safety', 'other')),
  title VARCHAR(255) NOT NULL,
  issuer VARCHAR(255),
  issue_date DATE,
  expiry_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'superseded', 'revoked')),
  project_document_id INTEGER REFERENCES project_documents(id) ON DELETE SET NULL,
  mir_id INTEGER REFERENCES material_inspection_requests(id) ON DELETE SET NULL,
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, certificate_number),
  CHECK (issue_date IS NULL OR expiry_date IS NULL OR expiry_date >= issue_date)
);

CREATE INDEX IF NOT EXISTS idx_qaqc_certificates_project
  ON qaqc_certificates(project_id, status, expiry_date);
