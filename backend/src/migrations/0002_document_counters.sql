-- Phase 2.4: atomic document numbering (see services/numbering.js).
-- One row per scope key (table.column|prefix-|filters). Incremented with a single
-- UPDATE ... RETURNING; the first use of a scope is seeded from the existing data.
CREATE TABLE IF NOT EXISTS document_counters (
  scope_key  TEXT PRIMARY KEY,
  last_value BIGINT NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
