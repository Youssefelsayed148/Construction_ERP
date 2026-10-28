# Post-launch backlog

Minor findings identified during closeout that are not launch blockers, tracked
here with an owner decision and a target date so they are not lost. This is not
the Phase/Batch closeout plan (`docs/ERP_CLOSEOUT_PLAN.md`) or the independent
security review worksheet (`docs/SECURITY_REVIEW_PREP.md`); it is a flat list of
small, deferred items.

## Minor findings

| ID | Area | Finding | Why deferred | Target date | Notes |
|---|---|---|---|---|---|
| PLB-001 | API / doccontrol | `GET /api/docs/rfis` and `GET /api/docs/submittals` (also reachable as `GET /api/v1/rfis` and `GET /api/v1/submittals`) still return the legacy single-answer fields (`answer`, `answered_by`, `answered_by_name`, `answered_at` on RFIs; `response`, `responded_by`, `responded_by_name`, `responded_at` on submittals) alongside the revisioned `rfi_responses`/`submittal_revisions` registers. | Not dead code: `backend/src/services/consultantEngine.js` dual-writes these columns on every new-style response so they stay in sync, and `frontend/src/pages/ProjectDocuments.js` (lines rendering `r.answer` and `s.response`) reads them directly from these list responses. Retiring them now would break that UI. Both GET routes now send `Deprecation: true` and `Sunset: Tue, 26 Jan 2027 00:00:00 GMT` response headers instead (`backend/src/routes/doccontrol.js`). | 2027-01-26 (90 days from 2026-10-28, the date this finding was recorded) | Before the sunset date: migrate `ProjectDocuments.js` to read the latest entry from `/rfis/:id/responses` / `/submittals/:id/revisions` instead of the header's `answer`/`response`, confirm no other consumer remains (re-grep frontend/src, backend/src, portal code, MCP/agent tool definitions), then drop the legacy columns from both SELECTs in one additive change. |
