-- Phase 1 security closeout (Batch 3): AV-scan queue stub (services/avScanQueue.js has the design
-- note). Every upload is queued for a scan (status defaults to 'pending'); nothing in this codebase
-- marks a row 'clean' yet, because there is no real antivirus provider wired in (per AGENTS.md: "use
-- stubs for external adapters"). File serving is deliberately NOT gated on this column yet - doing so
-- before a real scanner exists would make every upload permanently inaccessible, which is a worse
-- outcome than the gap this stub documents.
ALTER TABLE uploaded_files
  ADD COLUMN IF NOT EXISTS scan_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS scanned_at TIMESTAMPTZ;

ALTER TABLE uploaded_files DROP CONSTRAINT IF EXISTS uploaded_files_scan_status_check;
ALTER TABLE uploaded_files
  ADD CONSTRAINT uploaded_files_scan_status_check CHECK (scan_status IN ('pending', 'clean', 'infected', 'error'));

CREATE INDEX IF NOT EXISTS idx_uploaded_files_scan_status ON uploaded_files(scan_status) WHERE scan_status = 'pending';
