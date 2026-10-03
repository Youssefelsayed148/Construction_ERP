-- Phase 2.8: every approval request has at most one workflow instance, linked by legacy_approval_id.
--
-- Bug fixed in code: POST /api/approvals/request started the workflow but never set workflow_instances.legacy_approval_id
-- (it only put the id in the context JSON). The first decision then found no instance for the request, created a SECOND
-- one from the legacy row, and left the first active forever (with its action item).
--
-- This migration:
--   1. links an instance to its request ONLY when the request has no linked instance yet and the instance's context
--      names exactly that request (the unambiguous case: the request was never decided). Column value NULL -> id;
--      nothing else on those rows changes.
--   2. adds a unique index so one request can never have two instances again. It cannot be built while a request has
--      two linked instances (concurrent first decisions could have created twins), so the migration stops with the count
--      and changes nothing; those rows are for a person to resolve.
-- Instances left active next to a decided twin (case: request decided through the auto-heal path) are NOT touched: they
-- are stale duplicates a person must cancel. scripts/preflight-upgrade.sql counts all three groups.
-- Existing rows: instances linked in step 1 get legacy_approval_id set; no row is deleted.
DO $$
DECLARE
  twins BIGINT;
BEGIN
  SELECT count(*) INTO twins FROM (
    SELECT 1 FROM workflow_instances WHERE legacy_approval_id IS NOT NULL
    GROUP BY legacy_approval_id HAVING count(*) > 1) d;
  IF twins > 0 THEN
    RAISE EXCEPTION '0017 stopped, nothing changed: % approval request(s) have more than one workflow instance. Resolve them (see scripts/preflight-upgrade.sql) and run the migration again.', twins;
  END IF;
END $$;

UPDATE workflow_instances wi
   SET legacy_approval_id = (wi.context ->> 'legacy_approval_id')::integer
 WHERE wi.legacy_approval_id IS NULL
   AND wi.context ->> 'legacy_approval_id' ~ '^[0-9]+$'
   AND EXISTS (SELECT 1 FROM approval_requests ar WHERE ar.id = (wi.context ->> 'legacy_approval_id')::integer)
   AND NOT EXISTS (SELECT 1 FROM workflow_instances o WHERE o.legacy_approval_id = (wi.context ->> 'legacy_approval_id')::integer)
   AND NOT EXISTS (SELECT 1 FROM workflow_instances o2
                    WHERE o2.id <> wi.id AND o2.legacy_approval_id IS NULL
                      AND o2.context ->> 'legacy_approval_id' = wi.context ->> 'legacy_approval_id');

CREATE UNIQUE INDEX IF NOT EXISTS uq_workflow_instances_one_per_legacy_approval
  ON workflow_instances (legacy_approval_id) WHERE legacy_approval_id IS NOT NULL;
