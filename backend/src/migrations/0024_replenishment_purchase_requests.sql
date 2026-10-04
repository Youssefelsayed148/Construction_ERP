-- Closeout A2.2 (plan 3.3): replenishment raises a purchase requisition through the PR workflow.
--
--   1. purchase_requests gains location_id, cost_code_id, work_package_id (all optional, RESTRICT) and
--      budget_check (the result of the automated budget check, JSONB).
--   2. item_master.default_cost_code_id: the cost code a material's requisitions are charged to
--      (copied onto replenishment PRs; NULL until someone configures it).
--   3. A unique index on purchase_requests.source_key for every OPEN status. The old index covered only
--      'draft'; once a replenishment PR is submitted into the workflow it is no longer a draft, so two
--      sweep runners could each create one. 'procurement' (approved, awaiting its PO) is deliberately not
--      in the index: a new need after the PO exists must be able to raise a new request.
--
-- Existing rows: untouched. The migration STOPS with counts and changes nothing if two open requisitions
-- already share a source_key. Report query for a restored copy:
--
--   SELECT source_key, count(*) AS open_requests, array_agg(id ORDER BY id) AS request_ids,
--          array_agg(status ORDER BY id) AS statuses
--     FROM purchase_requests
--    WHERE source_key IS NOT NULL AND status IN ('draft', 'submitted', 'budget_check', 'authority_approval')
--    GROUP BY source_key HAVING count(*) > 1;
DO $$
DECLARE
  dupes BIGINT;
BEGIN
  SELECT count(*) INTO dupes FROM (
    SELECT 1 FROM purchase_requests
     WHERE source_key IS NOT NULL AND status IN ('draft', 'submitted', 'budget_check', 'authority_approval')
     GROUP BY source_key HAVING count(*) > 1) d;
  IF dupes > 0 THEN
    RAISE EXCEPTION '0024 stopped, nothing changed: % source_key value(s) have more than one open purchase requisition. See the report query in the migration header; resolve them by hand and run the migration again.', dupes;
  END IF;
END $$;

ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES project_locations(id) ON DELETE RESTRICT;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS cost_code_id INTEGER REFERENCES cost_codes(id) ON DELETE RESTRICT;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS work_package_id INTEGER REFERENCES work_packages(id) ON DELETE RESTRICT;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS budget_check JSONB;
ALTER TABLE item_master ADD COLUMN IF NOT EXISTS default_cost_code_id INTEGER REFERENCES cost_codes(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_requests_open_key_wide
  ON purchase_requests (source_key)
  WHERE source_key IS NOT NULL AND status IN ('draft', 'submitted', 'budget_check', 'authority_approval');
