-- R3.3: preserve the GET-time ledger rows as source-backed commitments and
-- reconcile existing ledger rows before reads become strictly read-only.
UPDATE commitments c
   SET project_id = po.project_id,
       original_amount = po.total_amount,
       status = CASE WHEN po.status = ANY(ARRAY['draft', 'rejected', 'cancelled', 'void']::text[])
                     THEN 'cancelled' ELSE 'active' END,
       updated_at = NOW()
  FROM purchase_orders po
 WHERE c.source_type = 'purchase_order' AND c.source_id = po.id;

UPDATE commitments c
   SET project_id = sc.project_id,
       original_amount = CASE WHEN COALESCE(sc.revised_amount, 0) > 0 THEN sc.revised_amount ELSE sc.contract_value END,
       status = CASE WHEN sc.status = ANY(ARRAY['active', 'approved', 'completed', 'closed']::text[])
                     THEN 'active' ELSE 'cancelled' END,
       updated_at = NOW()
  FROM sub_contracts sc
 WHERE c.source_type = 'sub_contract' AND c.source_id = sc.id;

WITH active_sources AS (
  SELECT 'purchase_order'::text AS source_type, po.id AS source_id, po.project_id, po.total_amount AS amount
    FROM purchase_orders po
   WHERE po.project_id IS NOT NULL
     AND (po.status IS NULL OR po.status <> ALL(ARRAY['draft', 'rejected', 'cancelled', 'void']::text[]))
  UNION ALL
  SELECT 'sub_contract', sc.id, sc.project_id,
         CASE WHEN COALESCE(sc.revised_amount, 0) > 0 THEN sc.revised_amount ELSE sc.contract_value END
    FROM sub_contracts sc
   WHERE sc.project_id IS NOT NULL AND sc.status = ANY(ARRAY['active', 'approved', 'completed', 'closed']::text[])
), missing_sources AS (
  SELECT s.* FROM active_sources s
   WHERE NOT EXISTS (
     SELECT 1 FROM commitments c WHERE c.source_type = s.source_type AND c.source_id = s.source_id
   )
), seed AS (
  SELECT COALESCE(MAX((regexp_match(commitment_number, '([0-9]+)$'))[1]::bigint), 0) AS last_value
    FROM commitments WHERE commitment_number LIKE 'CM-%'
), numbered AS (
  SELECT m.*, seed.last_value + ROW_NUMBER() OVER (ORDER BY m.source_type, m.source_id) AS sequence
    FROM missing_sources m CROSS JOIN seed
)
INSERT INTO commitments (commitment_number, project_id, source_type, source_id, original_amount, status)
SELECT 'CM-' || LPAD(sequence::text, 5, '0'), project_id, source_type, source_id, amount, 'active'
  FROM numbered
 ORDER BY source_type, source_id;

INSERT INTO document_counters (scope_key, last_value)
SELECT 'commitments.commitment_number|CM-|',
       COALESCE(MAX((regexp_match(commitment_number, '([0-9]+)$'))[1]::bigint), 0)
  FROM commitments WHERE commitment_number LIKE 'CM-%'
ON CONFLICT (scope_key) DO UPDATE
  SET last_value = GREATEST(document_counters.last_value, EXCLUDED.last_value), updated_at = NOW();
