# Owner decision sheet - open Majors before launch

Written 2026-10-28 from `docs/LAUNCH_READINESS.md`. "Plan" is the recommended handling; tick or change the Decision column. Nothing here is a sign-off until you write it.

| # | Open Major | Plan | Where | Decision (Fix / Waive / Defer) |
|---:|---|---|---|---|
| 1 | 75 of 99 status columns have no DB CHECK | Fix (NOT VALID checks, validated after data cleaning) | Session G1.2 | |
| 2 | `finance_manager` / `project_manager` on blanket `(*,*)` grants | Fix (explicit grants, guarded migration) | Session G1.1 | |
| 3 | Legacy RFI/submittal single-answer shape | Fix if no consumer, else Sunset header + date | Session G1.6 | |
| 4 | No real notification channel (console stubs) | Fix (provider interface + SMTP adapter, disabled until configured) | Session G1.3 | |
| 5 | `payment_certificates` vs `sub_payment_certificates` duplicate surfaces | Waive for pilot; document; unify after launch | Backlog | |
| 6 | Demo seed / golden values not value-exact | OWNER: approve `docs/GOLDEN_VALUES.md`, then a value-exact test | You, then agent | |
| 7 | No dry-run on a real-data copy | OPERATOR: required before go-live | Operator | |
| 8 | No per-project feature-flag mechanism | Waive; document env toggles | Session G3.2 | |
| 9 | 2 high `npm audit` findings untriaged | Fix (smallest non-breaking upgrade) or documented mitigation | Session G1.5 | |
| 10 | No load/performance test | Verify existing script; run on staging | Session G3.4, Operator | |
| 11 | No operator runbook / admin guide / training notes / API versioning doc | Fix (documents) | Session G3 | |
| 12 | No admin roles/permission-matrix screen | Fix (screen) | Session G2.1 | |
| 13 | No workflow-template editor | Fix (screen) | Session G2.2 | |
| 14 | No notification-rules screen | Fix (screen) | Session G2.3 | |
| 15 | No commercial-contracts screen | Fix (screen) | Session G2.4 | |
| 16 | No recipe-management screen | Fix (screen) | Session G2.5 | |
| 17 | `/api/subcontractors` admin has no UI | Fix (screen) | Session G2.6 | |
| 18 | `/api/costing` has no UI | Fix (screen) | Session G2.7 | |
| 19 | `/api/maintenance` has no UI | Fix (screen) | Session G2.8 | |
| 20 | Leftover Phase 4 tests (extra nav, real-data reconciliation, component tests, Playwright journeys, portal acceptance) | Defer to the post-G verification and pilot period | Later test pass | |
| 21 | `BOQ.js` swallows two mutation errors | Fix | Session G1.4 | |

## Other owner decisions still needed

| Decision | Recommendation | Your answer |
|---|---|---|
| Production approval limits per role and action (`docs/APPROVAL_LIMITS_DECISION_SHEET.md`) | Fill the sheet; start from the demo ladder scaled to your company | |
| Golden-value assumptions (retention %, advance %, caps) | Approve or correct the provisional table | |
| Localization L9-L11 (logical CSS audit, automated EN/AR E2E, native Arabic review) | Keep deferred past launch as decided on 2026-10-14, but get the native terminology review done during pilot | |
| Pilot scope: which roles/projects go first | One project, internal roles first, external portals second | |
| Merge to `main` | After G, one final verification run, and your GO | |
