# Closeout state

Updated: 2026-10-13 (Africa/Cairo)

## Done

- On branch `closeout/batch-a-to-6`; the user-provided untracked `docs/CODEX_AUDIT_REPORT.md` remains untouched and untracked.
- Added root `AGENTS.md` conventions. Batch A security work A1–A9 is complete and passed its end-of-batch gates.
- A4 converted the audited state-changing route families to transaction-bound activity/policy audit writes, added a route-wide lint guard, and added audit failure-injection coverage.
- A1 delegation renewal/date handling fix: `dd268d4`.
- A5 finance posting typed errors and API contract assertions: `2d757b7`.
- A7 approval-limit actor FK restrictions with a forward migration: `80c9005`.
- Other Batch A slice commits are recorded in `git log` and `docs/CLOSEOUT_LOG.md` (A2/A3 webhook controls, A4 audit transaction work, A5 typed errors, A6 harness/migration inventory, A7 monetary limits, A8 Playwright, A9 security scan fixes).
- Batch A gates, freshly run 2026-10-13:
  - Backend mock: 48/48 suites, 969/969 tests.
  - Real PostgreSQL: 56/56 suites, 566/566 tests against disposable local Docker Postgres 16 (`construction_erp_test`, localhost port 55439); all migrations applied, including 0041.
  - `npm run lint:guards`: `lint-guards: ok`.
  - Frontend: 17/17 suites, 97/97 tests; `i18n:check ok`; production build compiled.
  - Playwright: 32 passed / 46 skipped (78 discovered). Real-backend seeded-user journeys and screenshot baselines are the skipped tests.
- Updated `docs/MIGRATIONS.md` and `docs/IMPLEMENTATION_STATUS.md` to the verified migration/code state.

## In progress

- Batch B1–B6 is committed and green. Unique project `erp-closeout-pilot-20261013` is running locally at `http://127.0.0.1:8090`; DB/API/frontend are healthy. Root `.env.docker` contains locally generated credentials and is git-ignored. Do not read or print it.
- B2 role/user staging seed is implemented and verified: 38 users across 33 canonical roles plus no-assignment/expired-assignment cases, requester/checker identities, three legacy workflow compatibility actors, and supplier/client seats. Passwords are in ignored root `.staging-users.json`; do not read or print them.
- B3 pilot procure-to-pay data is implemented and verified: 3 materials, two suppliers/six rates, cost codes, 1 warehouse, stock rows, and 3 BOQ lines totaling EGP 1,376,500. Re-run is idempotent.
- B4 smoke passed against `http://127.0.0.1:8090`: full API chain, RBAC, locale, upload scoping, journal/reconciliation, and logout revocation passed; 0 unbalanced chain entries and unchanged out-of-scope project data.
- B5 rehearsal passed: DB dump and uploads copied; restored to temporary staging-named DB; exact row counts and 226 sequence maxima matched; all reconcile counts were 0; data-cleaning report was empty; temporary restore DB removed.
- Batch B final gates passed: backend mock 50 suites / 960 tests; real PostgreSQL 56 suites / 566 tests; frontend 17 suites / 97 tests; i18n and production build passed; Playwright 32 passed / 46 skipped; Compose services healthy.
- Batch C1 shared UI kit: reusable validation/server-error mapping, accessible fields, localized bounded file uploads, toast provider/hook, permission-aware action wrapper, and existing dialogs/states. Focused frontend gate: 20 suites / 103 tests; `i18n:check ok`.
- Batch C2 committed: `3893bc6` (`Batch C2: add project procurement workspace`). Its focused UI test (1/1), localization check, production build, backend syntax checks, and whitespace check passed. One local API smoke run passed the procurement journey and scoped invoice-list checks, then hit `spawnSync node.exe EPERM` at the reconcile child-process step; it is not recorded as a clean full smoke. A Docker image build incidentally ran the backend mock suite (50 suites / 960 tests passed; 56 PostgreSQL suites skipped). Per the user's test-cadence instruction, use tests tied to the active ticket and defer broad suites to batch exits.
- Batch C3 committed: `df7047c` (`Batch C3: filter navigation by policy grants`). Its focused shell test passed 16/16 tests; auth route syntax and whitespace checks passed.
- C3 follow-up removes the remaining project role map/FULL fallback. Project tabs and financial cards now use effective module/action grants and project IDs. Targeted frontend checks pass: 3 suites / 26 tests; project-page Playwright passes 6/6 across desktop/mobile, including Arabic and site-engineer visibility.
- Batch C4 passes the real local backend procure-to-pay journey on English/Arabic desktop and mobile, plus an unassigned-user API denial. The run covers PR, RFQ and two quotes, award approval, PO workflow, delivery/MIR/GRN, supplier invoice and allocated payment. Read-only reconciliation reported zero violations across all 11 checks.
- Batch D UAT preparation is documented in `docs/UAT_PILOT.md`: scoped role scripts, checklist, defect template, deferred items, and signoff table. Human UAT has not been executed.
- Batch E implementation slices E1–E5 are complete and committed as recorded in `docs/CLOSEOUT_LOG.md`; finance account-purpose signoff still requires the owner. Human UAT has not been executed.
- Phase 5.6.1 is committed. In Phase 5.6.2, formal consultant-stage WIR reads, configured workflow SLA timestamps, a scoped transactional consultant WIR final-result action, and bilingual portal decision buttons are implemented and focused-tested. Engineer-instruction recommendations are complete; SLA administration remains open. Phases 5.6–6 remain incomplete.
- Phase 5.6.2 WIR/variation/certificate review work includes commits `576fe96`, `bf9e26e`, and `5b356e4`, plus the current focused-tested variation/certificate recommendation slice. Certificate finance finalization now waits for the finance-manager workflow step. Engineer-instruction recommendations are implemented; SLA administration remains open.

## Where work stopped

C1–C4, D preparation and Batch E implementation are complete and committed; human UAT and finance account confirmation remain outstanding. SLA administration/configuration is part of the Phase 6 workflow admin surface; next continue Phase 5.6.4 client project actions and assignment expiry, then follow `docs/PLAN_5_6_TO_6.md` through Phases 5.6–6.

Batch A and Batch B1–B6 are green. C1–C4 and Batch E implementation are committed. Continue the remaining Phase 5.6–6 tickets with focused tests tied to each ticket; run broader gates at integration checkpoints. Keep targets local and never use production-looking databases or external services. Do not read or print generated secrets.

## Current gates

| Gate | Result |
|---|---|
| Backend mock (`npm test -- --runInBand`) | PASS — 48 suites / 969 tests |
| Real PG (`TEST_PG=1 npm run test:pg`) | PASS — 56 suites / 566 tests |
| Backend guards | PASS — `lint-guards: ok` |
| Frontend CI | PASS — 17 suites / 97 tests |
| i18n | PASS — `i18n:check ok` |
| Frontend production build | PASS — compiled successfully |
| Playwright | PASS — 32 passed / 46 skipped |
| Batch B1 image build / fresh Compose health | PASS — all 3 services healthy, localhost health ready |
| Batch B2 staging seed + guard/re-run assertions | PASS — 38 users including compatibility actors; guards verified |
| Batch B3 demo data | PASS — repeat seed stable; 3 BOQ items / EGP 1,376,500 |
| Batch B4 full smoke | PASS — all journey checkpoints; 0 unbalanced entries; token revoked |
| Batch B5 full rehearsal | PASS — 237 tables / 3,323 rows matched; 226 sequence maxima matched; reconcile 0; cleaning report empty |
| Batch B6 Windows instructions | PASS — `docs/STAGING.md`; `git diff --check` clean |
| Batch B full end-of-batch gate | PASS — backend 50/960, PG 56/566, frontend 17/97, i18n/build, Playwright 32/46, Compose healthy |
| Batch C4 live browser journeys | PASS — EN/AR desktop/mobile 4/4; unassigned procurement API 403; reconciliation 11/11 checks at zero |
| Batch D documentation | PASS — `docs/UAT_PILOT.md`; human UAT NOT RUN |
| Batch E implementation | PASS — E1–E5 slices committed; owner account confirmation and human UAT outstanding |
| Phase 5.6.1 observation completeness | PASS — focused PG 1/1, consultant/media 18/18, portal 1/1, i18n/build/syntax |
| Phase 5.6.2 consultant review workflows | IN PROGRESS — engineer-instruction recommendations implemented; PG 6/6 plus certificate 1/1; consultant/QHSE/scope mock 35/35; policy/module/scope 9/9; portal 2/2; i18n passed; SLA administration and other 5.6 work remain |
| Phase 5.6.3 RFI/submittal history and compatibility | PASS — PG 7/7; v1 remount 1/1; scope/policy 9/9. Phases 5.6.4–6 remain in progress |

## Risks and decisions

- Production remains **NO-GO**; human UAT and owner finance account confirmation are not complete.
- Docker test execution needed elevated local-engine access because the sandbox could not access the Docker Desktop pipe. The test DB was isolated and named explicitly; no production-looking or external database was used.
- Approval limit defaults and finance mappings are provisional where noted in code/docs; finance signoff remains pending.
- `0030` remains a documented, unreused migration-number gap. Highest migration is `0049`; next is `0050`.

## Stop condition � 2026-10-13

- Blocker: required `docker info --format '{{.ServerVersion}}'` check failed with `error during connect ... dockerDesktopLinuxEngine ... Access is denied`.
- Evidence: command output from this closeout turn; Docker engine access is unavailable to this process.
- Next action: restore Docker Desktop engine access for this workspace/session, then rerun `docker info` before creating the new throwaway PostgreSQL 16 container. Resume at request Step 0.1; do not read `.env.docker` or `.staging-users.json`.
- Work stopped before database, test, gate, migration, or commit operations. Existing uncommitted work remains untouched.

## Closeout continuation � 2026-10-13

The initial sandbox Docker check returned `Access is denied`; an elevated local `docker info` retry succeeded with Docker Engine 28.3.2, clearing that blocker. Phase 5.8.2 was applied and verified against fresh throwaway PostgreSQL 16 databases. Migration 0059's PG test found and fixed the partial-index conflict predicate. Forward migration 0060 protects handover document links.

Current gates: backend mock 53 suites / 999 tests; real PG 67 suites / 605 tests; guards `lint-guards: ok`; frontend 28 suites / 107 tests; i18n passed; build passed; Playwright 34 passed / 50 skipped. See `docs/CLOSEOUT_LOG.md` for command evidence.

Pilot smoke remains unverified. Automatic review rejected the command because the script reads `.env.docker` and `.staging-users.json`, which the request explicitly prohibits. No alternate execution path was attempted.

## Closeout continuation — after 5.8.2 commit (2026-10-13)

Commit `ad8f9f6` contains the verified Phase 5.8.2 slice and gate repairs. `docs/CARRYOVER.md` records verified gates and remaining audit work. Current `frontend/src` prompt scan is zero; Phase 6 remains open for route-to-screen and permission journey verification. Pilot smoke remains unverified because automatic review rejected the script's access to prohibited `.env.docker` and `.staging-users.json`. Targeted D1-D15 revalidation is recorded in `docs/CARRYOVER.md`.

## 2026-10-13 closeout continuation — Phase 6.2 prompt-removal exit

Replaced consultant and supplier portal prompt flows with localized forms. Record choices come from dashboard lists; RFQ and PO details load from portal endpoints; amount fields validate before submission. Client preview selects from the loaded portfolio. Current source scan returned no `prompt()` calls.

Verification: `PortalDashboard.test.js` passed 1 suite / 10 tests; `i18n:check ok`; frontend production build compiled successfully; `git diff --check` passed. The pilot smoke remains unverified because automatic review rejected the script due to its reads of prohibited `.env.docker` and `.staging-users.json`.

## Stop condition � 2026-10-13 � Docker engine unavailable

- Blocker: the required `docker info --format '{{.ServerVersion}}'` check failed with Docker Desktop pipe access denied.
- Evidence: output was `error during connect: Get "http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.51/info": open //./pipe/dockerDesktopLinuxEngine: Access is denied.` The accompanying `docker ps` check failed on the same pipe.
- Work state: the Phase 7 daily-report idempotency middleware/client/test changes are uncommitted. Backend mock `external-api.test.js` passed 1 suite / 46 tests. The real-Postgres `daily-report-progress.pg.test.js` was not run; no database was created or modified in this stopped slice.
- Safety: no credential files were read, no `.env` file was edited, and no elevated or alternate Docker access attempt was made.
- Next action: restore Docker Desktop engine access for this workspace/session, rerun `docker info --format '{{.ServerVersion}}'`, then apply the focused PG test to a named throwaway Postgres 16 database before committing this slice.

## 2026-10-14 continuation — Phase 7 idempotent daily reports

The normal workspace shell still cannot open Docker Desktop's named pipe; the authorized elevated Docker CLI path works. `docker info --format '{{.ServerVersion}}'` returned `28.3.2`, resolving the earlier stop condition. Used fresh, loopback-only, volume-free PostgreSQL 16 container `erp-closeout-pg16-20261014`; database `construction_erp_test` at `127.0.0.1:55441`. All 122 migrations applied. Backend mock: 53 suites / 1,001 tests; real PostgreSQL: 67 suites / 607 tests; frontend: 28 suites / 111 tests; i18n, production build, lint guards, syntax checks and `git diff --check` passed. The Phase 7.2 code is not yet committed; audit report artifact remains untouched and unstaged. Continue Phase 7 offline queue and responsive work; Phases 8–11 remain open.

Commit recorded: `2f31c01` (`Phase 7.2: require idempotent daily reports`). The only remaining untracked item is the user's pre-existing `docs/CODEX_AUDIT_REPORT.md`; it is not part of this commit.

## 2026-10-14 continuation — Phase 7 offline daily-report queue

Implemented a user/project-scoped IndexedDB queue for daily reports, staged photo files, and project-location/BOQ quantity measurements. Added network retry with capped exponential delay, stale-sync recovery, manual retry/removal, and visible queued/syncing/conflict/failed states. Corrected IndexedDB completion-handler timing. Added a Playwright offline/reconnect journey that verifies one photo upload, one idempotent report POST, and queue removal at both desktop and mobile Chromium sizes. Current count: 110 inline `gridTemplateColumns` occurrences under `frontend/src/pages` and 64 `<table>` occurrences; global responsive/table migration remains open. No IBM Plex font files are present in `frontend/public` or `frontend/backend`.

Verification: backend mock 53 suites / 1,002 tests; real PG 67 suites / 608 tests on loopback disposable DB `construction_erp_test`; frontend CI 29 suites / 117 tests; `i18n:check ok`; production build compiled; `lint-guards: ok`; full existing Playwright 34 passed / 50 skipped; focused offline journey passed 1/1 desktop and 1/1 mobile; `git diff --check` pending final staging review. Lighthouse score and bundled IBM Plex Arabic remain unverified/open. Continue Phase 7.2 responsive/table work and then Phases 8–11.

Commit recorded: `7487787` (`Phase 7.2: queue site reports offline`) on `closeout/batch-a-to-6`. The pre-existing `docs/CODEX_AUDIT_REPORT.md` remains untracked, untouched and excluded.

## 2026-10-14 continuation — Phase 7 responsive utilities and tables

Replaced all 110 inline `gridTemplateColumns` declarations in `frontend/src/pages` with responsive utility classes (source scan: zero remain). Wrapped all 72 JSX `<table>` elements under `frontend/src` in `.table-container`; Babel AST scan found zero unwrapped tables. Site Management buttons/icon actions now have 44px minimum targets and site form controls have 14px text. Existing E2E suite after conversion: 36 passed / 50 skipped; site offline journey passed desktop/mobile. Frontend CI 29 suites / 117 tests, i18n check, build, backend lint guards and `git diff --check` passed. Phase 7 still open for IBM Plex Arabic local assets, Lighthouse score, and mobile journeys for every major screen/portal.

Commit recorded: `7fd068a` (`Phase 7.2: make page grids responsive`) on `closeout/batch-a-to-6`.

## 2026-10-14 continuation — Phase 8 cash contribution slice

Implemented project commercial cash contribution as the cash-basis sum of non-voided AR payments less non-voided AP payments, scoped by project. The commercial endpoint now returns `cash_in`, `cash_out`, and `cash_contribution`; Project Operations displays the contribution card with EN/AR catalog keys. PostgreSQL does the DECIMAL aggregation and subtraction. This closes only the cash-contribution part of Phase 8's combined EAC/cash task; Phase 8 remains open.

Docker Desktop verification: normal sandbox access still returned `Access is denied` on `dockerDesktopLinuxEngine`; the authorized Docker CLI retry returned server version `28.3.2` and confirmed `erp-closeout-pg16-20261014` running with loopback mapping `127.0.0.1:55441`. Tests used only `construction_erp_test` on that disposable Postgres 16 container, environment-only test configuration, and no persistent migration changes.

Current command evidence:
- `npm test -- --runInBand --silent`: PASS, 53 suites / 1,003 tests.
- `TEST_PG=1 npm run test:pg -- --silent` on disposable PG16: PASS, 67 suites / 609 tests.
- Focused `commercial-5-5.pg.test.js`: PASS, 17/17 tests.
- `npm run test:ci -- --silent`: PASS, 29 suites / 117 tests.
- `npm run i18n:check`: `i18n:check ok`.
- `npm run i18n:parity`: `i18n parity ok: 35 namespaces, 1085 English keys`.
- `npm run build`: `Compiled successfully`.
- `npm run lint:guards`: `lint-guards: ok`.
- Locale JSON parsing and `git diff --check`: passed.

Definition: cash contribution represents recorded cash movement only; it is not forecast profit, accrual margin, or ledger-reconciled cash flow. It excludes voided payments and any cash movement not recorded in `payments`. No schema migration was needed. Next Phase 8 work is to fix per-cost-code forecast ETC/EAC with a hand-calculated golden case, then capped contract recovery/retention and certified-quantity valuation. Phases 7, 9, 10, and 11 remain open; production is NO-GO pending their gates and human-only signoffs.

## 2026-10-14 continuation — Phase 8 baseline-driven SPI slice

The schedule KPI endpoint now enables SPI by default when a valid current project baseline exists and calculates planned value from the saved baseline dates/quantities, matched to current activity progress. Projects without a current baseline retain the existing explicit `earned_value_enabled` opt-in and current-schedule SPI behavior. The response identifies `spi_source` as `current_baseline`, `current_schedule`, or null. Real-Postgres regression confirms a live schedule change does not change baseline SPI.

Verification: focused planning mock `npm test -- --runInBand src/scripts/__tests__/planning.test.js` PASS 12/12; real PG `TEST_PG=1 npm run test:pg -- --silent src/scripts/__tests__/schedule-progress-assignments.pg.test.js` PASS 4/4 on disposable PG16 `construction_erp_test`; baseline KPI route returns SPI 1 from baseline PV=50/EV=50 while current schedule would produce 0.5. Initial focused PG attempt exposed incorrect test setup (it changed existing progress-history fixture values and called a router path without the repeated schedule mount); fixture and path were corrected, and rerun passed. CPI still has no activity-level actual-cost source, so SPI alone does not complete the Phase 8 earned-value task. Resource loading remains open.

## 2026-10-14 continuation — Phase 8 capped retention and advance recovery

Implemented contract-level advance amounts and automatic certificate recovery caps. Client and subcontract contract creation now derive advance amount from the contract advance percentage unless a value is supplied. Retention uses an explicit contract override or the active business rule (fallback 10%). Payment certificate retention is constrained by the project retention cap and prior held retention; default advance recovery follows the project `advance.recovery_percent` setting (fallback 0%), capped by the remaining contract advance. An explicit recovery override is also capped and recorded in the same audit transaction. Subcontract creation now checks project access and writes its audit row with the contract in one transaction.

Migration `0061_subcontract_advance_caps.sql` adds `advance_percent` and `advance_amount` to `sub_contracts`; existing subcontract rows start at zero advance amount and require finance configuration before recovery can occur. The migration was applied only to disposable Docker Desktop PostgreSQL 16 database `construction_erp_test` on loopback port 55441. Normal Docker pipe access was denied; the user-requested elevated local Docker CLI confirmed server 28.3.2 and the known throwaway container. No pilot/production database or credential files were accessed.

Command evidence:
- Backend mock `npm test -- --runInBand --silent`: PASS, 53 suites / 1,003 tests.
- Full real PostgreSQL `TEST_PG=1 npm run test:pg -- --silent`: PASS, 67 suites / 611 tests.
- Focused `commercial-5-5.pg.test.js`: PASS, 18 / 18, including contract defaults, capped recoveries, manual override audit, and denial after cap.
- Frontend `npm run test:ci -- --silent`: PASS, 29 suites / 117 tests.
- Frontend `npm run build`: `Compiled successfully`.
- Frontend `npm run i18n:check`: `i18n:check ok`; parity: 35 namespaces / 1,086 English keys.
- Backend `npm run lint:guards`: `lint-guards: ok`; syntax checks, locale JSON parse, and `git diff --check` passed.

Phase 8 remains open for cost-code EAC, certified-quantity valuation, CPI/resource loading, legacy approval retirement, and duplicate transition/payment-certificate surfaces. Phases 7 and 9–11 remain open; production GO criteria remain pending.

## 2026-10-14 continuation — Phase 7 mobile route sweep

Added an API-mocked Playwright sweep for primary internal screens and all four external portals at the configured Pixel 7 viewport. The journey sets isolated test auth state, uses empty API responses, and checks every route renders with no page-level horizontal overflow. `npx playwright test e2e/mobile-route-sweep.spec.js --project=mobile-chromium --reporter=line` passed 17/17. The initial sandbox launch returned `spawn EPERM`; the local Playwright command passed through the authorized elevated runner. This is route smoke coverage, not a real-user workflow or full Phase 7 exit gate. Lighthouse and local IBM Plex Arabic assets remain open.

## 2026-10-14 continuation — Phase 8 forecast ETC and EAC basis

New forecast versions now store per-cost-code `forecast_amount` as ETC, and the commercial engine computes `EAC = actual cost + ETC`. Without an approved forecast, ETC is remaining commitments (`max(committed - actual, 0)`) plus uncommitted current budget. Accrued cost remains visible as an informational amount. Additive migration `0062_forecast_etc_basis.sql` defaults existing versions to the legacy `eac` basis; API-created versions explicitly use `etc`, so earlier approvals retain their prior computed result. The finance workbench accepts multiple cost-code lines in one version with EN/AR labels.

Command evidence on the disposable Docker Desktop Postgres 16 database `construction_erp_test` (loopback `127.0.0.1:55441`): migration 0062 applied (1 applied, 123 already applied); backend mock 53 suites / 1,003 tests; focused real PG commercial suite 18/18; frontend CI 29 suites / 118 tests; finance workbench focused test 2/2; production build compiled; i18n check and parity passed (35 namespaces / 1,089 English keys). Existing EAC-basis behavior and new ETC-basis hand calculation both pass. Finance approval of the changed basis remains required before production. Phase 8 remains open for certified-quantity valuation, CPI/resource loading, legacy approval retirement, and duplicate finance surfaces.

## Current continuation state — 2026-10-14

Phase 8 forecast ETC/EAC work is complete for this slice (commit `0a2ee09`); capped retention and advance recovery are committed as `c8cc6fe`. The mobile route sweep is committed as `96c344e`. The earlier “Next Phase 8 work” note above is superseded: certified-quantity valuation and the other remaining Phase 8 items are still open. The user audit report `docs/CODEX_AUDIT_REPORT.md` remains untracked and excluded from all commits.

## 2026-10-14 continuation — Phase 8 certified-quantity valuation

Implemented quantity-backed valuation for both client and subcontractor payment applications. Each application line links to a certified `quantity_measurements` row and snapshots its unique matching contract-line rate. Row locks and active-application reservations prevent duplicate claims; certification records the accepted quantity and computes `gross_current_work` from the line snapshots. Partially certified remainder can be claimed later. Rejected and withdrawn applications release their reservations by lifecycle status. Manual legacy applications remain supported. Migration `0063_payment_application_quantity_valuation.sql` adds the valuation basis and line table; no legacy amounts were rewritten.

Verification on disposable Docker Desktop PostgreSQL 16 (`construction_erp_test`, loopback `127.0.0.1:55441`): `npm run migrate` applied migration 0063 (1 applied, 124 already applied); focused commercial PG suite passed 19/19; full real-PG suite passed 67 suites / 612 tests; backend mocks passed 53 suites / 1,003 tests; backend lint guards passed; i18n check passed and parity reports 35 namespaces / 1,098 English keys; JS syntax, EN/AR JSON parsing, and `git diff --check` passed. First PG run caught certificate totals using the request's supplied money amount rather than the derived quantity amount; corrected and reran focused and full PG suites successfully.

Phase 8 valuation checkbox is closed. Phase 8 remains open for reminder tiers, CPI/resource loading, legacy approval retirement, and duplicate transition/payment-certificate surfaces. Phases 7 and 9–11 remain open.

Final follow-up after exposing quantity lines on application detail and rejecting manual work overrides for quantity-based certification: `TEST_PG=1 npm run test:pg -- --silent src/scripts/__tests__/commercial-5-5.pg.test.js` — PASS, 19/19; `npm run i18n:check` — PASS; `npm run i18n:parity` — PASS, 35 namespaces / 1,099 English keys; `node --check` on the commercial route/service/test and `git diff --check` — PASS. The full PG run (67 suites / 612 tests) preceded these final additive validation/read changes; the focused commercial PG suite was rerun after them.

Valuation implementation commit: `c2a68a5` (`Phase 8: derive valuation from certified quantities`). The pre-commit full PostgreSQL run passed 67 suites / 612 tests; the final focused commercial rerun after the last validation/read changes passed 19/19.

## 2026-10-14 continuation — Phase 8 receivable reminder tiers

Receivable reminders now apply active client-specific rules before project and company defaults, resolving configuration per invoice instead of once per sweep. An explicit disabled client rule suppresses reminders. The pre-due `due_soon` tier now fires once whenever an outstanding invoice is 1–7 days from its due date, so a missed scheduler day does not lose the seven-day reminder. The event payload includes `days_until_due`; existing due-today and overdue 7/14/30 tiers remain.

Verification: real PostgreSQL `event-integrity.pg.test.js` passed 30/30, including the six-day pre-due case, client-over-project role priority, once-only idempotency, and client disable. Backend mock suite passed 53 suites / 1,003 tests; `npm run lint:guards` passed; changed-file `node --check` and `git diff --check` passed. The first run found only a test invoice number exceeding the schema's 20-character limit; the fixture was shortened and the suite reran green. No migration was needed.

Phase 8 reminder tier task is closed. Remaining Phase 8 work: CPI/resource-loaded planning, legacy approval retirement, and duplicate transition/payment-certificate surfaces. Phase 7 and Phases 9–11 remain open.

Reminder-tier implementation commit: `3ae651e` (`Phase 8: honor client receivable reminder rules`). Focused PostgreSQL verification passed 30/30 after correction of the overlong test fixture.


## 2026-10-14 - Phase 10 L6 portal dashboard labels

Portal dashboard widget and field labels now resolve through the bilingual portals.dashboard.* catalog instead of replacing underscores and title-casing arbitrary API values. Record status and priority use the shared enum translators, with the stored machine value preserved as fallback for unknown enums. Added EN/AR labels for common portal metrics and the empty state. This is a bounded caller migration; the system-wide API-value and dynamic-content audit remains open.

Verification: frontend PortalDashboard suite PASS (11/11); npm run i18n:check PASS; npm run i18n:parity PASS (35 namespaces, 1,146 English keys). No backend changes or migrations. Implementation commit: 1740ed7.


## 2026-10-14 - Phase 7 responsive route sweep expansion

Expanded the mobile Playwright sweep from 17 representative routes to all 36 application routes, covering each major internal page, every project subroute, and all four external portals. Each route starts with isolated local test auth, mocked API responses, and checks that the page renders without document-level horizontal overflow at the configured Pixel 7 viewport.

Verification: `npx playwright test e2e/mobile-route-sweep.spec.js --project=mobile-chromium --reporter=line` PASS, 36/36. A first overlapping test invocation caused dev-server connection refusals after 19 cases; the clean single invocation completed all 36 successfully. This is route/overflow smoke coverage only; it does not assert screen-specific business workflows. Implementation commit: 1b0e672.


## 2026-10-14 - Phase 10 portal value localization follow-up

Portal dashboard boolean values now use common.yes/common.no and numeric values use the shared locale-aware formatNumber helper. The empty value remains a typographic dash. This closes only boolean and metric-number rendering for this caller; Phase 10 L4C remains open for titles, controls, remaining dynamic fields, empty states, and broader translation audit.

Verification: frontend PortalDashboard and formatter suites PASS (2 suites / 16 tests); git diff --check passed. No catalog, backend, or migration changes. Implementation commit: b93dc27.


## 2026-10-14 - Phase 8 certificate surface retirement audit

Read-only code and disposable database inspection confirmed two live certificate surfaces. The legacy subcontractor table still backs its route list/write actions, project-scope resolution, and subcontractor payment cost listener. The shared table has different financial columns. The existing v_sub_payment_certificates view projects the shared subcontractor rows; it neither replaces nor mirrors the legacy table. On the retained disposable PG16 database, counts were 62 shared rows, 28 legacy rows, and 17 rows in the transition view; no certificate-number collisions were found. These fixtures are not a real-data parity result.

No table or financial history was modified. Column aliases such as materials_deducted/advance_recovery and penalties/other_deductions cannot be assumed to have equivalent accounting meaning. Removal would violate additive-only migrations and could sever legacy source identifiers. Added docs/CERTIFICATE_SURFACE_RETIREMENT.md with a safe additive mapping plan; Phase 8 remains open pending real-data mapping and parity.

Implementation commit: documentation only; no schema migration or application behavior changed.


## Continuation frontend gates (2026-10-14)

After the Phase 7 route and Phase 10 portal slices: `npm run test:ci -- --silent` PASS (29 suites / 124 tests); `npm run build` PASS (Compiled successfully); `npm run i18n:check` PASS; `npm run i18n:parity` PASS (35 namespaces / 1,146 English keys).


## 2026-10-14 - Phase 10 portal dashboard empty-state contract

Subcontractor, supplier, and consultant dashboard services now add a namespaced empty_key beside the existing English empty_label. The PortalDashboard resolves that key through EN/AR catalogs and uses the legacy text only as fallback, so older API clients remain compatible. Added catalog labels for all current backend widget names and empty states, with service and frontend regression coverage. This is partial Phase 10 L4C/L7 progress; other English setup notes, values, and controls remain open.

Verification: backend mocks PASS (53 suites / 1,005 tests); portal/consultant service tests PASS (30/30); lint guards passed; changed JS syntax and git diff --check passed. Frontend CI PASS (29 suites / 124 tests); PortalDashboard focused suite PASS (11/11); production build compiled; i18n check passed; parity passed (35 namespaces / 1,203 English keys). No migration or database change. Implementation commit: 0b7f57a.
