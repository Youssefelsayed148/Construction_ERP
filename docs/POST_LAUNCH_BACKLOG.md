# Post-launch backlog (Minors)

Written 2026-10-28 by Session T, from `docs/CLOSEOUT_RECONCILIATION.md`'s T0/T0.6 audit. Per
`docs/ERP_CLOSEOUT_PLAN.md`'s own rule, only Blockers and Majors gate launch — everything here is a MINOR
finding and is explicitly **not worked on** during this closeout.

| # | Finding | Source | Notes |
|---|---|---|---|
| 1 | Admin Users screen has no create route (edit role/dept/active only) | Phase 6 | user creation exists via `/api/auth/register`; this is a UI convenience gap |
| 2 | Inventory "requirements" has no screen literally named that | Phase 6 | likely already covered functionally by replenishment alerts |
| 3 | Finance "AP review queue" has no screen literally titled that | Phase 6 | functionally covered inside `ProcurementWorkspace.js`'s invoices section |
| 4 | `alert()` used for error display (not data entry) in ~20 page files instead of the shared `ErrorState` component | Phase 6 / T0.6-2 | UX inconsistency, not a missing form; zero `prompt()` calls remain anywhere |
| 5 | Only 2 of 40 frontend page files use the shared `components/common/States` helper; the other 38 implement loading/empty/error inline | T0.6-2 | consistency gap, not an absence — spot-checked screens do have the three states |
| 6 | `WorkOrders.js` uses native `alert()` on failure instead of an inline error state | T0.6-2 | |
| 7 | No per-route frontend guard (`ProtectedRoute` checks login only); the 2 routes traced (`/admin/*`, `/projects/:id/boq`) already degrade cleanly on a 403 | T0.6-5 | a `<RouteGuard>` reusing Sidebar's grant logic is feasible in well under 40 lines; cosmetic given the API already blocks the data |
| 8 | Legacy approval system retirement (dual-write mirror) not yet executed | Phase 8 | needs a 2-week real-data parity hold before the schema decision; functionally correct today |
| 9 | `/api/activity` (1 endpoint) — frontend caller not conclusively isolated in the time available | T0.6-1 | likely wired, not confirmed; low risk either way (1 endpoint) |
| 10 | Load test (k6/autocannon) does not exist | Phase 4 / 11 | acceptable to defer past this closeout per the plan's own Phase 4 ordering |
| 11 | No versioned/Sunset-header OpenAPI artifact, operator runbook, admin guide, or training notes document | Phase 11 | OpenAPI is generated programmatically and served; only the standalone docs are missing |
| 12 | `GET /api/docs/rfis` and `GET /api/docs/submittals` (also reachable as `GET /api/v1/rfis` and `GET /api/v1/submittals`) still return the legacy single-answer fields (`answer`/`answered_by`/`answered_by_name`/`answered_at` on RFIs; `response`/`responded_by`/`responded_by_name`/`responded_at` on submittals) alongside the revisioned `rfi_responses`/`submittal_revisions` registers | G1.6 | Not dead code: `backend/src/services/consultantEngine.js` dual-writes these columns on every new-style response so they stay in sync, and `frontend/src/pages/ProjectDocuments.js` reads `r.answer`/`s.response` directly from these list responses, so retiring them now would break that UI. Both GET routes now send `Deprecation: true` and `Sunset: Tue, 26 Jan 2027 00:00:00 GMT` response headers instead (`backend/src/routes/doccontrol.js`). Follow-up before the 2027-01-26 sunset: migrate `ProjectDocuments.js` to read the latest entry from `/rfis/:id/responses` / `/submittals/:id/revisions` instead of the header's `answer`/`response`, confirm no other consumer remains (re-grep frontend/src, backend/src, portal code, MCP/agent tool definitions), then drop the legacy columns from both SELECTs in one additive change. |

Nothing above blocks the GO/NO-GO decision in `docs/LAUNCH_READINESS.md`.
