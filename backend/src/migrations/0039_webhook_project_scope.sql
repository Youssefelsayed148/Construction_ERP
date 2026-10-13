-- Optional per-webhook project allowlist. NULL means company-wide delivery;
-- an array restricts delivery to those project IDs only.
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS project_ids JSONB;
CREATE INDEX IF NOT EXISTS idx_webhooks_project_ids ON webhooks USING GIN (project_ids);
