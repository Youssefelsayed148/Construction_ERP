-- Phase 2.4 follow-up: document_counters is the only counter.
--
-- 1. document_number_sequences (document control) was incremented with a read, a JS +1 and a write.
--    Its rows are copied into document_counters (old code stored last-issued minus one, so +1), taking the
--    higher of that and the highest SEQ actually registered. The table is no longer read or written;
--    it is kept (forward-only, no data loss) and can be dropped in a later migration.
-- 2. numbering_sequences.next_value was never read by anything. The column is dropped; the table keeps the
--    per-project prefix the project wizard records for each numbered entity.
INSERT INTO document_counters (scope_key, last_value)
SELECT 'project_documents.doc_number|project=' || s.project_id || '|discipline=' || s.discipline || '|doc_type=' || s.doc_type,
       GREATEST(s.seq + 1, COALESCE(m.max_seq, 0))
  FROM document_number_sequences s
  LEFT JOIN LATERAL (
    SELECT MAX((regexp_match(d.doc_number, '-([0-9]+)-[^-]*$'))[1]::bigint) AS max_seq
      FROM project_documents d
     WHERE d.project_id = s.project_id
       AND COALESCE(d.discipline, '-') = s.discipline
       AND COALESCE(d.doc_type, '-') = s.doc_type
       AND d.doc_number IS NOT NULL
  ) m ON TRUE
ON CONFLICT (scope_key) DO UPDATE SET last_value = GREATEST(document_counters.last_value, EXCLUDED.last_value);

ALTER TABLE numbering_sequences DROP COLUMN IF EXISTS next_value;
