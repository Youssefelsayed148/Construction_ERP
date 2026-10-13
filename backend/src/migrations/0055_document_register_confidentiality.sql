ALTER TABLE project_documents
  ADD COLUMN IF NOT EXISTS issue_date DATE,
  ADD COLUMN IF NOT EXISTS confidentiality VARCHAR(20) NOT NULL DEFAULT 'internal'
    CHECK (confidentiality IN ('public', 'internal', 'confidential', 'restricted'));

-- Preserve only the external access that was already granted explicitly via portal_visibility.
UPDATE project_documents
SET confidentiality = 'public'
WHERE portal_visibility IN ('client', 'consultant', 'subcontractor', 'all_external')
  AND confidentiality = 'internal';
