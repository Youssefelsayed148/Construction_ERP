-- Preserve legacy single-answer values in the revisioned response registers.
INSERT INTO rfi_responses (
  rfi_id, revision, stage, responder_user_id, responder_name, body, attachments, created_at
)
SELECT r.id, GREATEST(COALESCE(r.revision, 1), 1), 'official_response', r.answered_by,
       u.name, r.answer, '[]'::jsonb, COALESCE(r.answered_at, r.updated_at, r.created_at, NOW())
  FROM project_rfis r
  LEFT JOIN users u ON u.id = r.answered_by
 WHERE NULLIF(BTRIM(r.answer), '') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM rfi_responses rr
      WHERE rr.rfi_id = r.id AND rr.revision = GREATEST(COALESCE(r.revision, 1), 1)
        AND rr.stage = 'official_response'
   );

INSERT INTO submittal_revisions (
  submittal_id, revision_number, stage, actor_user_id, actor_name,
  response_code, comments, attachments, created_at
)
SELECT s.id, GREATEST(COALESCE(s.revision_number, 1), 1), 'response', s.responded_by,
       u.name, s.response_code, s.response, '[]'::jsonb,
       COALESCE(s.responded_at, s.updated_at, s.created_at, NOW())
  FROM project_submittals s
  LEFT JOIN users u ON u.id = s.responded_by
 WHERE NULLIF(BTRIM(s.response), '') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM submittal_revisions sr
      WHERE sr.submittal_id = s.id AND sr.revision_number = GREATEST(COALESCE(s.revision_number, 1), 1)
        AND sr.stage = 'response'
   );
