-- A handover package item is part of the contractual closeout record. Keep its
-- document relationship intact when a document is hard-deleted; document soft
-- deletion remains the normal application path.
ALTER TABLE handover_package_items
  DROP CONSTRAINT IF EXISTS handover_package_items_project_document_id_fkey;

ALTER TABLE handover_package_items
  ADD CONSTRAINT handover_package_items_project_document_id_fkey
  FOREIGN KEY (project_document_id) REFERENCES project_documents(id) ON DELETE RESTRICT;
