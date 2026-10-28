# Launch readiness verdict

Written 2026-10-28 by Session T, the last test batch of this closeout. This is the finite exit list: the
7 GO criteria from `docs/GO_NOGO.md` plus an 8th the plan itself adds (zero open Blockers/Majors without an
owner-accepted waiver). Evidence is drawn from `docs/CLOSEOUT_RECONCILIATION.md` (T0/T0.6), the new
`golden-journey.pg.test.js`/`t3-role-coverage.pg.test.js` (T2/T3), `docs/UAT_EXECUTION_KIT.md` (T5), and the
T1 full verification run recorded in `docs/CLOSEOUT_LOG.md`. Anything not run or not audited this session
is stated as such below and in the risk list at the end — nothing is silently omitted.

## Verdict: **NO-GO**

Unchanged from `docs/GO_NOGO.md`. Several criteria moved from "not met" toward "met" this session (see
below), but criteria 2, 4, 5 and 7 remain open on human/owner/CI-infrastructure grounds this session could
not close, and the 8th criterion (zero open Blockers/Majors) is not met.

## The 8 criteria

| # | Criterion | Status | Evidence | Owner / next action |
|---:|---|---|---|---|
| 1 | Zero open Critical/High findings from the three audits | **pending-human** | Phase 1 security re-audit (`docs/CLOSEOUT_GAPS.md`) found all items DONE at code level as of this session; `npm audit --omit=dev` this session: 1 moderate, 2 high, 0 critical dependency findings, not yet triaged. No independent human security reviewer has signed off. | Independent reviewer: triage the 2 high npm findings and give a sign-off. |
| 2 | Golden E2E, concurrency and permission-matrix suites green in CI on real PostgreSQL | **NOT MET** | `golden-journey.pg.test.js` (new, T2) now drives contract through warranty end to end and passes locally; it does not reproduce `docs/GOLDEN_VALUES.md`'s exact BOQ/contract figures (judged too fragile for one session - proves the same formulas on simpler numbers instead, see its header comment). Concurrency (`concurrency.pg.test.js`) and permission-matrix (`policy-matrix.pg.test.js`, extended this session by `t3-role-coverage.pg.test.js`) suites pass locally. **No remote CI run exists for any of this** - `.github/workflows/ci.yml`'s jobs were confirmed to reference real, existing scripts (read-only check, per this session's own rule never to trigger remote CI), but a green GitHub Actions run has not been obtained. | CI owner: push this branch's commits through an actual GitHub Actions run and record it green. Finance/construction owner: approve the golden-value assumptions so a value-exact golden test can be built. |
| 3 | Reconciliation report clean on migrated data | **PARTIAL** | `reconcile-database.js` (18 named checks) ran clean twice this session (T4) - once on an empty migrated throwaway DB, once after `seed:golden-demo` populated real fixture data. `pg_dump`/`pg_restore` backup-restore rehearsal also passed with identical row counts before/after. **None of this is a restored copy of real/production-shaped data** - only throwaway and fixture data has ever been reconciled. | Environment operator: obtain a restored real-data (or production-shaped) copy and rerun `reconcile-database.js` and `data-cleaning-report` against it. |
| 4 | Demo project cost, progress and finance match golden values | **NOT MET** | `docs/GOLDEN_VALUES.md`'s commercial table remains explicitly provisional (owner/finance approval pending). `golden-journey.pg.test.js` proves the retention/advance-recovery/EAC *formulas* match, not the exact BOQ/contract *figures* in that document. | Finance + construction owner: approve the golden-value assumptions (retention %, advance %, caps) in `docs/GOLDEN_VALUES.md`; implementation: then build the value-exact fixture test. |
| 5 | Offline/mobile checks and Phase 10 localization exit (no English-only strings in Arabic mode, Arabic PDFs reviewed) | **NOT MET** (closer than documented) | This session's Phase 10 re-audit found L0-L4 and most of L5-L8 are **already done in code** (0 inline `locale==='ar'` branches repo-wide, 0 raw error-leak sites, production Arabic PDF via headless Chromium) - `docs/ERP_CLOSEOUT_PLAN.md`'s and `docs/CLOSEOUT_GAPS.md`'s stale figures (1,093 branches, 374 raw errors) were corrected. L9 (RTL logical CSS), L10 (automated EN/AR E2E coverage) and L11 (native Arabic construction-domain review) remain genuinely open and are owner-deferred past this closeout per the 2026-10-14 decision - L11's native review specifically has never happened (`docs/ARABIC_REVIEW_PACK.md` says so explicitly). Mobile/offline checks (Phase 7) are DONE per the plan's own `[x]` marks, reconfirmed. | Native Arabic construction-domain reviewer: review `docs/ARABIC_REVIEW_PACK.md` and sign off terminology. Owner: decide whether L9-L11 block this launch or stay deferred as already decided. |
| 6 | Restore drill and rollback runbook rehearsed | **PARTIAL, stronger than before** | This session (T4) ran a full `pg_dump`/`pg_restore` rehearsal into a second throwaway database with exact row-count comparison (users, `schema_migrations`, all 259 public tables) - passed. Migration idempotency confirmed (run twice, second run applies 0). The rollback mechanism itself is "restore from a verified backup" (migrations are forward-only by design, no down-scripts) - this session's rehearsal exercises exactly that mechanism. **Still local/throwaway, not a production or pilot-environment rehearsal**, and `smoke:staging` was NOT RUN (needs the Docker Compose pilot stack, not provisioned in this sandbox). | Environment operator: repeat this same rehearsal against the pilot/staging environment and record it; then review and sign. |
| 7 | Finance, procurement, site and owner UAT signed | **pending-human** | `docs/UAT_EXECUTION_KIT.md` (new, T5) now covers the full lifecycle across owner, procurement, site, finance, handover/warranty and all four external portals, extending `docs/UAT_PILOT.md`'s procure-to-pay-only scope. Both kits' sign-off tables are still all Pending - no human has run them. | Finance, procurement, site, owner, and the 4 portal role-holders: run the scripts in `docs/UAT_EXECUTION_KIT.md` and `docs/UAT_PILOT.md` and record real results. |
| 8 | Zero open Blockers/Majors without an owner-accepted waiver | **NOT MET** | See the counts and list below. | Owner: accept, waive, or assign each open Major; none found this session was small enough to safely fix in place. |

## Blocker / Major / Minor counts

| | Found this session (new evidence) | Fixed this session | Still open |
|---|---:|---:|---:|
| Blocker | 0 confirmed (the one suspected Blocker - procurement lifecycle UI - was **refuted**: `ProcurementWorkspace.js` already has full PR->RFQ->award->PO->GRN->invoice forms, see `docs/CLOSEOUT_RECONCILIATION.md`'s "resolved conflict" note) | 0 | 0 |
| Major | ~20 (listed below) | 0 (none was both <40 lines and clearly correct in place - each needs a screen, a migration, a human decision, or a CI/environment action) | ~20 |
| Minor | 11 | 0 (deliberately not worked on, per the plan's own rule) | 11, in `docs/POST_LAUNCH_BACKLOG.md` |

Test-code bugs found and fixed this session (5, all under 40 lines, test-only - these are **not** product
Blockers/Majors, see `docs/CLOSEOUT_LOG.md`'s T1 entry) are not counted above.

### Open Majors (owner/human decision or larger engineering work needed; file:line evidence in `docs/CLOSEOUT_RECONCILIATION.md`)

1. Phase 2.6: 75 of 99 `status` columns have no DB-level CHECK constraint (app-level validation only).
2. Phase 5.1: canonical `finance_manager` and `project_manager` roles still run on blanket `(*,*)` grants, unlike every other canonical role.
3. Phase 5.6: legacy single-answer RFI/submittal response shape not retired (`doccontrol.js:84`).
4. Phase 5.8: no real notification channel exists (email/push/SMS/WhatsApp are console-only stubs).
5. Phase 8: `payment_certificates` vs `sub_payment_certificates` duplicate surfaces, no lossless mapping built.
6. Phase 9: demo seed is not a complete residential BOQ; the golden scenario is not asserted against `docs/GOLDEN_VALUES.md`'s exact figures (T2 narrows this but does not close it).
7. Phase 11: no dry-run migration against a real/production-shaped data copy.
8. Phase 11: no per-project feature-flag/rollout mechanism beyond ad hoc env toggles.
9. Phase 11: dependency audit findings (2 high) not triaged.
10. Phase 11: no load/performance test exists anywhere in the repo.
11. Phase 11: no operator runbook, admin guide, or training notes document; no versioned/Sunset-header OpenAPI artifact.
12. T0.6: no admin roles/permission-matrix screen.
13. T0.6: no workflow-template editor screen.
14. T0.6: no notification-rules screen.
15. T0.6: no dedicated commercial-contracts screen.
16. T0.6: no recipe-management screen.
17. T0.6: `/api/subcontractors` contract/verification admin has no UI (certificate-payment lifecycle is reachable via `ProjectFinanceWorkbench.js`, so this is mitigated but not closed).
18. T0.6: `/api/costing` has no UI (cost-code admin/profitability).
19. T0.6: `/api/maintenance` has no UI (asset maintenance reminders).
20. Phase 4: nav-visibility beyond the 4 Phase-A routes, reconciliation-on-real-data, frontend component tests, Playwright real-backend journeys, and portal acceptance tests remain open (T3 added role/permission coverage but not these).
21. `BOQ.js`: two mutation call sites (`:81,89`) swallow errors silently (console.error only, no user-visible error).

## Completeness statement (per the T-session prompt's own rule)

- **Screens**: audited fully for Phase 6's named items; T0.6's per-screen quality matrix audited partially (6 screens scored in depth; ~34 more confirmed to exist/route but not individually scored on every quality column - risk, not cleared).
- **API routes**: module wiring matrix audited fully (47 mounts); API->DB integrity (transaction/typed-error/audit/constraint/test) sampled on 16 of 47 route files - the other ~30 are **not audited**, risk.
- **DB constraints**: status-enum coverage audited fully with a live query (75/99 unconstrained, see above); other constraint types (FK, UNIQUE, CHECK on money/quantity) were already closed in earlier sessions and reconfirmed structurally this session.
- **Role access**: three-layer audit (backend/sidebar/frontend-guard) done on a sample (2 routes traced end-to-end for the frontend-guard layer; list-endpoint project-scope sampled on a few modules, extended by T3's 9 generated tests to 8 modules); portal-cage id-guessing sampled (T3 added 4 generated tests, one per external family) but not exhaustive against every reachable resource.
- **Localization**: audited fully for L0-L8 (code-level); L9-L11 correctly left open per the owner's 2026-10-14 deferral decision, not re-litigated.
- **Money/ledger correctness**: audited via the existing suites plus `golden-journey.pg.test.js`'s new assertions (GL balance, AR/AP subledger==GL, retention held/released) - all pass; the exact `GOLDEN_VALUES.md` figures remain unverified against runtime output (owner/finance decision pending), as that document itself already states.
- **Portals**: role-access audited per above; forbidden-field-per-portal and mobile-viewport-per-portal acceptance tests (Phase 4's own item) are **not audited**, risk.
- **Pilot readiness**: migration idempotency, reconciliation, backup/restore all rehearsed locally and passed; `smoke:staging` and any Docker-Compose-pilot-dependent check are **NOT RUN** (sandbox has no Docker Compose stack provisioned), risk/operator action.

## Shortest remaining path to launch

1. **Owner**: approve `docs/GOLDEN_VALUES.md`'s commercial assumptions (retention %, advance %, caps) and `docs/APPROVAL_LIMITS_DECISION_SHEET.md`'s production approval-limit values.
2. **Owner**: decide and record a waiver-or-fix call on each of the 21 open Majors above (several are "acceptable via API/SQL at launch" per this session's own severity rubric; a few - notification channels, status enums, the finance_manager/project_manager blanket-grant gap - look less safe to wave through without a decision).
3. **Agent (next implementation session)**: build the admin roles/permission-matrix, workflow-template-editor, notification-rules, commercial-contracts and recipe-management screens (Phase 6); add DB-level status CHECK constraints for the ~75 unconstrained tables (Phase 2.6); grant `finance_manager`/`project_manager` the same granular per-module permissions every other canonical role already has (Phase 5.1); wire a real notification provider (Phase 5.8).
4. **Agent**: value-exact golden-journey fixture once step 1 lands; run it in a real remote CI workflow (step 5 depends on CI access this sandbox doesn't have).
5. **CI owner**: obtain and record a green GitHub Actions run of the full test matrix on this branch.
6. **Operator**: stand up the pilot/staging Docker Compose stack; run `smoke:staging`, the backup/restore rehearsal, and reconciliation against a real-data-shaped restored copy.
7. **Independent reviewer**: triage the 2 high `npm audit` findings; sign off the security review.
8. **Native Arabic reviewer**: review `docs/ARABIC_REVIEW_PACK.md` terminology (L11).
9. **UAT users** (finance, procurement, site, owner, plus client/supplier/subcontractor/consultant portal holders): run `docs/UAT_EXECUTION_KIT.md` and `docs/UAT_PILOT.md` against the pilot stack from step 6 and sign.
10. **Owner**: make the GO/NO-GO call once steps 1-9 have evidence; merge to `main` only after that.

No step above is marked done by this document. `docs/GO_NOGO.md`'s verdict line stays **NO-GO** until every
row in its own table has real evidence, which human sign-offs will not supply by themselves.
