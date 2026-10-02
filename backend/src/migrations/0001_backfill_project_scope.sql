-- Phase 2.1: give rows created before migrate-39 a project so scoped users can see them.
-- Forward-only: never edit this file after it has been applied; add a new one.

-- Reminders follow the asset's current project.
UPDATE maintenance_reminders m
   SET project_id = a.current_project_id
  FROM assets a
 WHERE m.asset_id = a.id
   AND m.project_id IS NULL
   AND a.current_project_id IS NOT NULL;

-- Agent requests carry the project in the stored tool arguments (mcpService.createConfirmationRecord).
UPDATE agent_action_requests r
   SET project_id = (r.payload->>'project_id')::int
 WHERE r.project_id IS NULL
   AND r.payload->>'project_id' ~ '^[0-9]{1,9}$'
   AND EXISTS (SELECT 1 FROM projects p WHERE p.id = (r.payload->>'project_id')::int);

-- legal_documents has no project, contract or asset reference to derive one from. Those rows stay
-- company-wide (project_id NULL); assigning them is a data-entry task for the legal team.
