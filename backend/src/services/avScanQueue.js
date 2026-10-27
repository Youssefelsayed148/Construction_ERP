// Phase 1 security closeout (Batch 3): AV-scan queue stub.
//
// Every uploaded file is inserted with uploaded_files.scan_status = 'pending' (migration
// 0071_upload_scan_queue.sql). This module is the ONE place that would dispatch a pending row to a
// real antivirus provider — per AGENTS.md ("use stubs for external adapters"), there is no such
// provider configured in this codebase, so enqueueScan() only logs its intent. It never marks a file
// 'clean' itself: a stub that claimed files were scanned clean without a real scanner would be a false
// safety guarantee, worse than leaving the row visibly 'pending'.
//
// Wiring in a real provider later means: (1) call the provider's API (or push to its queue) here
// instead of logging, (2) add a webhook/poll route that receives the verdict and does
// `UPDATE uploaded_files SET scan_status = $1, scanned_at = NOW() WHERE id = $2`, and (3) decide,
// as a separate product decision, whether file serving (routes/media.js) should refuse a file whose
// scan_status is not yet 'clean' — deliberately not done here (see the migration's own comment).
'use strict';

function enqueueScan({ fileName }) {
  if (!fileName) throw new Error('enqueueScan requires fileName');
  // uploaded_files has no surrogate id: file_name is its primary key (routes/documents.js generates
  // a unique, timestamp-prefixed name per file at upload time), so it is the queue's own reference.
  // eslint-disable-next-line no-console
  console.log(`[av-scan-queue] queued uploaded_files '${fileName}' for a future AV scan (stub — no provider configured)`);
  return { fileName, status: 'pending' };
}

module.exports = { enqueueScan };
