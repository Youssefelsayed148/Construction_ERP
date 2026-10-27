-- Phase 1 security closeout (Batch 3): audit_events gains request context so a denial or a mutation
-- can be traced back to the request that produced it. Additive and nullable: existing rows (and every
-- caller that does not pass these fields yet) are unaffected.
ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS ip_address INET,
  ADD COLUMN IF NOT EXISTS request_id VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_audit_events_request_id ON audit_events(request_id) WHERE request_id IS NOT NULL;
