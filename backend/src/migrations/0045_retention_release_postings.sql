-- Idempotent, auditable retention settlements need a stable release document and reversible ledger state.
ALTER TABLE retention_ledger
  ADD COLUMN IF NOT EXISTS idempotency_key UUID,
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS voided_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_retention_release_idempotency_key
  ON retention_ledger (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_retention_release_document
  ON journal_entries (reference_type, reference_id)
  WHERE reference_type IN ('retention_release', 'retention_release_void');
