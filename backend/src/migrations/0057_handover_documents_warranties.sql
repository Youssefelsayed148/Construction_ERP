ALTER TABLE handover_package_items
  ADD COLUMN IF NOT EXISTS project_document_id INTEGER REFERENCES project_documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_handover_package_items_document
  ON handover_package_items(project_document_id) WHERE project_document_id IS NOT NULL;

UPDATE handover_package_items hi
SET project_document_id = d.id
FROM project_documents d
WHERE hi.project_document_id IS NULL AND NULLIF(hi.document_url, '') = d.file_url AND hi.project_id = d.project_id;

CREATE TABLE IF NOT EXISTS asset_documents (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  asset_id INTEGER NOT NULL REFERENCES asset_register(id) ON DELETE CASCADE,
  project_document_id INTEGER NOT NULL REFERENCES project_documents(id) ON DELETE CASCADE,
  document_type VARCHAR(30) NOT NULL DEFAULT 'other'
    CHECK (document_type IN ('manual', 'warranty', 'certificate', 'photo', 'other')),
  title VARCHAR(255) NOT NULL,
  linked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (asset_id, project_document_id, document_type)
);

CREATE INDEX IF NOT EXISTS idx_asset_documents_project_asset
  ON asset_documents(project_id, asset_id, linked_at DESC);

CREATE TABLE IF NOT EXISTS warranties (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  warranty_number VARCHAR(60) NOT NULL,
  asset_id INTEGER REFERENCES asset_register(id) ON DELETE SET NULL,
  handover_package_item_id INTEGER REFERENCES handover_package_items(id) ON DELETE SET NULL,
  project_document_id INTEGER REFERENCES project_documents(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  issuer VARCHAR(255) NOT NULL,
  coverage_description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'void')),
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, warranty_number),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_warranties_project_status_dates
  ON warranties(project_id, status, end_date);

INSERT INTO warranties (project_id, warranty_number, asset_id, title, issuer, coverage_description, start_date, end_date, status, notes)
SELECT a.project_id, 'WAR-LEGACY-' || a.id, a.id, left(a.name || ' warranty', 255), 'Unspecified',
       'Coverage dates migrated from the project asset register.', a.warranty_start, a.warranty_end,
       CASE WHEN a.warranty_end < CURRENT_DATE THEN 'expired' ELSE 'active' END,
       'Issuer and document were not present in the legacy asset warranty fields.'
FROM asset_register a
WHERE a.warranty_start IS NOT NULL AND a.warranty_end IS NOT NULL AND a.warranty_end >= a.warranty_start
ON CONFLICT (project_id, warranty_number) DO NOTHING;
