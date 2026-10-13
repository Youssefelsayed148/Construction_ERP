CREATE TABLE IF NOT EXISTS client_document_acknowledgements (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL UNIQUE REFERENCES project_documents(id) ON DELETE CASCADE,
  client_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  client_organization_id INTEGER REFERENCES organizations(id) ON DELETE RESTRICT,
  comment TEXT,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_document_acknowledgements_actor
  ON client_document_acknowledgements (client_user_id, acknowledged_at DESC);
