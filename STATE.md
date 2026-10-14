# Closeout state

Updated: 2026-10-14 (Africa/Cairo). Root STATE.md is the single current authority; historical statements below are archived and do not override this section.

## Current remediation scope and position

- Branch closeout/batch-a-to-6. R0.1-R0.9 and R1.1-R1.2 implementation and exit gates are complete. R1.1 inventory-only commit is 940c41e; implementation is 60b735a. R1.2 is the final scoped-aggregate slice. Do not start R2.
- Earlier Docker access and missing-node_modules stops are superseded 2026-10-14: owner completed npm ci, elevated local Docker works, and tests execute. Only new erp-r01- throwaway containers on loopback ports are authorized.
- Highest migration is `0064`; next is `0065`. `0030` remains unused. Current fresh test migrations: 126 applied / 0 already applied (63 legacy + 63 versioned).
- Resume position: R0/R1 exit is green, including fresh golden-data reconciliation; await a separate instruction for R2. No deployment or push.
- Older implementation slices in Phases 5.6-5.8, 7-11 are present; whole phase acceptance is incomplete. Independent review findings and human UAT/finance confirmation remain open. Production stays NO-GO.

## Current command evidence

| Gate | Latest current result |
|---|---|
| Backend mock: npm.cmd test -- --runInBand | PASS, 59 suites / 1,048 tests |
| Real PG: TEST_PG=1 npm.cmd run test:pg | PASS, 72 suites / 656 tests |
| Backend lint:guards | PASS, lint-guards: ok |
| Frontend test:ci | PASS, 32 suites / 131 tests |
| Frontend i18n:check / parity | PASS, 35 namespaces / 1,287 English keys |
| CI=true frontend build | PASS, Compiled successfully, exit 0 |
| Focused Playwright login/shell + locale | PASS, 16 passed / 8 existing skips |
| RECONCILIATION_BACKUP_CONFIRMED=true node src/scripts/reconcile-database.js | PASS, 16 checks / 0 discrepancies, fresh migrated and golden-seeded throwaway PG16 |
| R1.2 owner/scoped discovery | PASS, 238 parameterless GETs / 0 unexplained identical bodies / 0 server errors; 16 documented reference/zero responses |

The original six-gate pre-change baseline was not completed before earlier stop conditions; expected comparison counts are the request/review baseline, not a claim that this session ran all six before fixes. Current increases are identified regression tests. Exact ticket commands, corrections and output summaries are in docs/CLOSEOUT_LOG.md.

Final mock/guard rerun initially hit sandbox spawnSync git EPERM in the tracked-launcher census; elevated local rerun passed 59/1,048 and lint-guards: ok. PostgreSQL full gate passed 72/656; golden reconciliation ran on a separate freshly migrated container. Each exact erp-r01-remediation-20261014 container was removed. No migration added; highest/next remain 0064/0065. Final scorecard: docs/R0_R1_SCORECARD.md.

## Locked owner decisions and open limits

- Tender/bid is deferred to a later version; the system begins with a signed client contract.
- Redux auth replaced with React AuthContext; no Redux Toolkit or Socket.io.
- Localization/accessibility REV-019/020, Phase 10 L5-L11 and R6 are deferred past closeout and remain known open items. New typed-error keys do not close that program.
- Scope this remediation: R0-R5 overall, R0/R1 in this session. Finance operating decisions and human UAT remain outstanding.
- Historical exposed credential rotation remains an owner action; its sole value-bearing line is preserved in the archived R0.1 record below. No rotation or history rewrite was attempted.
- WEBHOOK_ENCRYPTION_KEY still falls back to JWT_SECRET: rotation without a dedicated stable encryption key can orphan stored webhook secrets; behavior unchanged.
- Preserve the untracked user audit/review reports and exclude both from commits. No external adapters, credentials files or other Docker resources are authorized.

## Archived history

All previous root STATE.md content and the complete former docs/STATE.md follow. Statements marked current in these snapshots describe their original session only. Earlier gate counts, migration maxima, stop/resume instructions and rollout statements are historical.

### Former root STATE.md (preserved)

# Closeout state

## R0/R1 pre-flight Docker stop — superseded 2026-10-14

Resolved: authorized elevated local Docker works. Retained below as historical evidence; resume R0.1.

- Branch verified by `git branch --show-current`: `closeout/batch-a-to-6`; HEAD from `git log -5 --oneline`: `43754e5`. Initial `git status --short` showed only untracked `docs/CODEX_AUDIT_REPORT.md` and `docs/REVIEW_REPORT_2026-10-14.md`; both remain untouched and unstaged.
- Blocker: `docker version` exited 1. Client version was `28.3.2`, context `desktop-linux`; engine access failed with the exact output:

```text
error during connect: Get "http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.51/version": open //./pipe/dockerDesktopLinuxEngine: Access is denied.
```

- The R0/R1 request explicitly requires stopping on Docker access denial without a workaround. No escalation or alternative database was attempted. No container was created; there is no container to remove.
- R0.1-R0.9 and R1.1-R1.2 are NOT STARTED. Baseline migrations, all six baseline gates, defect reproduction, exit gates, Playwright and reconciliation are NOT RUN. Earlier gate results below are historical and do not establish this session's baseline.
- Next action: restore Docker Desktop engine access for this session, then resume pre-flight with `docker version`, a new loopback-only throwaway PostgreSQL 16 test database and the requested baseline gates. Finish reading the review and plan in bounded chunks before implementation; the initial combined read exceeded the tool output budget. Report any baseline count difference before proceeding.
- Stop documentation only was changed; no ticket implementation or ticket commit was made. See `docs/R0_R1_SCORECARD.md` for the blocked scorecard. R2 remains out of scope.

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

## Stop condition � 2026-10-13 — superseded 2026-10-14

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

## Stop condition � 2026-10-13 � Docker engine unavailable — superseded 2026-10-14

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


## 2026-10-14 - Phase 10 portal shell labels

Localized the four portal titles and the dashboard scope description, project selector, preview exit, refresh/loading copy, portfolio heading, and secondary section headings. Existing routes and API calls are unchanged. This is an additional PortalDashboard caller migration; L4C remains open for remaining dynamic fields, user-facing server errors, and full Arabic review.

Verification: PortalDashboard suite PASS (11/11); i18n check passed; parity passed (35 namespaces / 1,216 English keys); git diff --check passed. No backend or migration changes. Implementation commit: 0f19c8a.


## 2026-10-14 - Phase 10 portal setup messages

Client, subcontractor, and supplier dashboard setup notes now include stable note_key/setup_action_keys for translation. Existing English note/setup_actions fields remain in the API as a compatibility fallback. PortalDashboard uses catalog entries when keys are present. This covers the zero-assignment setup states only; user-facing API errors and broader server content remain open.

Verification: backend client/consultant/portal suites PASS (3 suites / 40 tests); frontend PortalDashboard suite PASS (11/11); i18n check passed; parity passed (35 namespaces / 1,223 English keys). No migrations or data changes. Implementation commit: d0df760.


## 2026-10-14 - Phase 10 portal record identifiers

Portal record cards now display domain-specific document numbers exposed by APIs (RFI, submittal, WIR, MIR, certificate, observation, and NCR) before using a localized generic record-number fallback. Added EN/AR labels for dashboard summary fields surfaced by consultant progress widgets.

Verification: PortalDashboard suite PASS (11/11); i18n check passed; parity passed (35 namespaces / 1,231 English keys); git diff --check passed. No backend or migration changes. Implementation commit: 0dda70b.


## 2026-10-14 - Phase 10 L4B procurement comparison localization

Localized the ProcurementReview title and description, RFQ input label, loading/compare actions, every comparison column, boolean values, document buttons, recommendation, and empty state. Load and download failures now show localized generic messages rather than raw server/network text. The sidebar entry already uses the translated navigation key.

Verification: ProcurementReview component tests PASS (2/2), covering translated comparison data and generic load/download errors; i18n check passed; parity passed (35 namespaces / 1,241 English keys); git diff --check passed. The full production build passed in the frontend batch gate before this page-only change; rerun it before batch close. Implementation commit: 1d14afb.


## 2026-10-14 - Phase 10 L4A Project Operations localization

Localized Project Operations headings, tabs, controls, table fields, empty/loading/error states, retention and finance metrics. Statuses use the shared enum translator; quantities use the locale-aware number formatter; material, warehouse, and project names use Arabic-first field fallback. The embedded ProcurementWorkspace already uses the procurement catalog. Load errors display a generic translated message instead of raw server/database text.

Verification: ProjectOperations component suite PASS (2/2), including Arabic-first warehouse/project names and generic load error; i18n check passed; parity passed (35 namespaces / 1,283 English keys); git diff --check passed. Full frontend build and suite rerun at batch close. Implementation commit: dd01f60.


## 2026-10-14 - Phase 10 portal record locale formatting

Portal record cards now use localizedName for title/name/subject fields, format due/deadline dates with the active locale, and format certificate/payment amounts as localized EGP. Machine identifiers and user-authored text remain unchanged. This adds formatter call-site coverage; the broader L4C portal/API error audit remains open.

Verification: PortalDashboard and formatter suites PASS (2 suites / 16 tests), including Arabic-first title, localized date, and EGP currency checks; i18n check passed; parity passed (35 namespaces / 1,283 English keys); git diff --check passed. No backend or migration changes. Implementation commit: 0b59ba5.


## 2026-10-14 - Phase 7/10 continuation batch gates

After the latest portal/project-operation localization changes: backend mock suite PASS (53 suites / 1,005 tests); backend lint guards PASS; frontend CI PASS (31 suites / 128 tests); frontend production build PASS (Compiled successfully); i18n check PASS; i18n parity PASS (35 namespaces / 1,283 English keys); mobile route sweep PASS (36/36 routes at Pixel 7, mocked APIs, no document-level horizontal overflow).

This does not close the Phase 7 exit gate: no IBM Plex Arabic font file exists in the repository or installed frontend assets, and no Lighthouse package is available in the local dependencies. The nginx font policy is already same-origin. Next safe action is to obtain a properly licensed local font artifact, then rerun offline/Lighthouse evidence. Phase 8 approval retirement still requires an approved migration decision and restored-real-data parity; certificate-surface constraints are documented in docs/CERTIFICATE_SURFACE_RETIREMENT.md. Phase 9 golden demo/CI scenario and the broader Phase 10/11 review and real-data gates remain open.

## 2026-10-14 continuation — fresh Docker Desktop baseline and Phase 9 values

The local Docker Desktop server became available through elevated local access (Engine 28.3.2). On a newly created, uniquely named disposable PostgreSQL 16 container/database, the migration runner applied the complete current chain: 126 applied, 0 previously applied, migrations 0059–0064 included. Generated DB and JWT credentials remained in the PowerShell process environment; no `.env.docker` or `.staging-users.json` was read.

Gate output: notification delivery PG 1 suite / 3 tests passed; full PG 67 suites / 618 tests passed; backend mock 53 suites / 1,005 tests passed; `npm run lint:guards` printed `lint-guards: ok`; frontend CI 31 suites / 128 tests passed; `i18n:check` passed; parity 35 namespaces / 1,283 English keys; production build compiled; Pixel 7 mobile route sweep 36/36 passed. The first focused PG invocation stopped before test execution because the isolated process lacked `JWT_SECRET`; rerun with a generated process-only JWT secret passed.

Created `docs/GOLDEN_VALUES.md` with hand calculations for the current pilot BOQ and a provisional residential commercial model, and recorded the missing-spec assumptions in `docs/DECISIONS.md`. The golden API/UI journey has not been implemented; these values remain provisional and unverified against runtime. The staging pilot smoke was not run because its existing script reads `.env.docker` and `.staging-users.json`, prohibited by the closeout request. The pre-existing untracked `docs/CODEX_AUDIT_REPORT.md` remains untouched and unstaged.

## 2026-10-14 continuation — Phase 9 residential C35 API fixture

Added a real-PG fixture case to `golden-chain.pg.test.js`. It provisions the residential tower template through `projectProvisioning`, verifies 96 unit locations, adds a project-scoped 120 m³ C35 BOQ item at 4,200 EGP/m³, attaches a 1.0 factor / 2% wastage recipe, allocates the BOQ to a unit, and inserts a schedule activity. `materialDemand.recomputeAllocation` returned one requirement row; the database held gross 120.0000 m³ and net 122.4000 m³; BOQ extension was 504,000 EGP. Added these verified fixture figures to `docs/GOLDEN_VALUES.md`.

Verification: fresh disposable Docker Desktop PostgreSQL 16, all migrations applied; focused `npm run test:pg -- --silent src/scripts/__tests__/golden-chain.pg.test.js` PASS, 1 suite / 7 tests; `node --check` PASS; `git diff --check` PASS. Implementation commit: `05986f2` (`Phase 9: add residential C35 golden fixture test`). The entire tender-to-warranty journey and browser journey remain open; Phase 9 exit is not met.

## 2026-10-14 continuation — Phase 11 operator metrics endpoint

Added owner/admin-only `GET /api/v1/ops/metrics` with aggregate outbox counts, pending retry age, failed sweep count, and notification-delivery counts. The endpoint reports `degraded` on dead events, failed sweeps, failed or undelivered notifications; it returns no event payload, provider error text, or user/project identifiers. Added `docs/MONITORING.md` with endpoint scope, local checks, initial response steps, and explicit limits (no history, paging, or external provider configured). Public readiness endpoints remain separate.

Verification: on a fresh disposable Docker Desktop PostgreSQL 16 database, `npm run test:pg -- --silent src/scripts/__tests__/v1-contract.pg.test.js` PASS, 1 suite / 8 tests, including owner access, site-engineer denial, and served route/OpenAPI coverage. Backend mocks PASS 53 suites / 1,005 tests; `npm run lint:guards` prints `lint-guards: ok`; `node --check` on route/test files and `git diff --check` passed. Implementation commit is recorded in the following documentation entry. Monitoring provider, historical retention, alert delivery, backup/restore, and production readiness remain open.

## 2026-10-14 continuation — Phase 11 go/no-go and review handoffs

Added `docs/GO_NOGO.md` with evidence and owner action for all seven criteria; the decision is NO-GO, with independent review, full golden journey, restored-copy reconciliation, runtime golden values, Arabic PDF/font review, real-environment restore/rollback rehearsal, and human UAT still open. Added `docs/SECURITY_REVIEW_PREP.md` for the independent Phase 1 reviewer and `docs/ARABIC_REVIEW_PACK.md` with the paired leaf inventory for all 35 EN/AR catalog namespaces plus screen/export review checklist. Human reviews remain pending. `npm audit` was not run because the closeout prohibits external sends and the command sends dependency metadata to a package registry.

The preceding metrics slice is committed as `2a02bb1` (`Phase 11: expose operator queue health metrics`). GO_NOGO records the exact local pilot, smoke, golden test, and restore commands; it explicitly states that pilot smoke and the full restore rehearsal were not run in this continuation. The user-provided untracked `docs/CODEX_AUDIT_REPORT.md` remains unmodified and excluded from commits.

## 2026-10-14 final continuation batch gates

Fresh Docker Desktop PostgreSQL 16 disposable database; generated database/JWT credentials stayed only in the test process. Current final outputs: migration runner PASS (full current chain); real PG PASS, 67 suites / 621 tests; backend mocks PASS, 53 suites / 1,005 tests; `npm run lint:guards` PASS (`lint-guards: ok`); frontend CI PASS, 31 suites / 128 tests; `i18n:check` PASS; parity PASS, 35 namespaces / 1,283 English keys; frontend production build PASS (`Compiled successfully`); Pixel 7 mobile route sweep PASS, 36/36. The full PG suite includes the new residential fixture and metrics authorization/contract tests. No remote CI job was run.

Pilot smoke and full backup/restore rehearsal remain unverified in this continuation because their scripts load `.env.docker` and `.staging-users.json`, which the request forbids reading. Production remains NO-GO per `docs/GO_NOGO.md`. No plan exit checkbox was closed by this gate run. `docs/GO_NOGO.md` and `docs/SECURITY_REVIEW_PREP.md` now reflect the final 621-test count.

## 2026-10-14 continuation - Phase 10 localization and renderer spike

Docker access was restored for this session. The fresh disposable Docker PostgreSQL 16 run applied 126 migrations and passed the full PostgreSQL suite (68 suites / 635 tests); the container was removed. Generated database and JWT credentials stayed in process memory. No `.env.docker` or `.staging-users.json` was read. Existing untracked `docs/CODEX_AUDIT_REPORT.md` remains untouched and unstaged.

Phase 10 work in this continuation: refreshed the inventory snapshot from current source; installed IBM Plex Sans and IBM Plex Sans Arabic under OFL-1.1 with license texts; added a same-origin font-loading Playwright test; rendered invoice, payment certificate, and multi-page WIR register samples through PDFKit and Chromium, rasterized each PDF, and inspected Arabic shaping/layout. The evidence in `docs/i18n/PDF_SPIKE.md` selects HTML-to-PDF using headless Chromium. The Arabic review pack now includes 97 glossary entries, the current 35-namespace paired catalog inventory, routes, and spike artifacts. CI now runs catalog parity alongside the existing localization check.

Current Phase 10 evidence and precise L0-L11 status are in `docs/i18n/STATUS.md`. The font-loading test passed 1/1; refreshed screenshot capture passed 32/32; full Playwright passed 74/86 with 86 seeded-backend tests skipped. Frontend CI passed 31 suites / 128 tests, backend mocks 54 / 1,013, PostgreSQL 68 / 635, migrations 126 applied / 0 already applied, parity 35 namespaces / 1,283 English keys, and the production build compiled. The PDF spike is evidence for the L8 renderer choice only; production renderer/call-site migration, CSV localization, L4-L7 and L9-L11 exits remain open. Production remains NO-GO.

Next: implement the shared Chromium renderer in the backend and package the runtime/font assets, then migrate export call sites and continue L7/L4-L6/L9-L11 work. Do not report Phase 10 complete until every exit and the native Arabic review are evidenced.

## 2026-10-14 - R0/R1 dependency stop — superseded 2026-10-14

Resolved: owner completed npm ci; dependencies are available and authorized elevated Docker works. Earlier failure output below is historical. Continue with R0.1; do not treat this note as an active blocker.

Owner authorized elevated Docker use only for erp-r01- throwaway containers on loopback ports. Branch confirmed closeout/batch-a-to-6; HEAD 43754e5. Earlier stop edits and untracked audit/review reports preserved. Elevated docker run --pull=never with postgres:16 and 127.0.0.1:55461 succeeded. Random credentials stayed in process environment. Probe erp-r01-preflight-20261014 and both attempts at erp-r01-baseline-20261014 were removed using their exact names with docker rm --force (exit 0). No containers from this run remain.

The first baseline attempt failed on Windows NODE_OPTIONS preload path parsing. Correcting that path exposed missing backend/node_modules/dotenv (MODULE_NOT_FOUND). No migrations ran. Independent backend command npm.cmd test -- --runInBand exited 1:

```text
'jest' is not recognized as an internal or external command,
operable program or batch file.
```

Test-Path returned False for backend/node_modules/.bin/jest.cmd, backend/node_modules/dotenv/package.json, backend/node_modules/pg/package.json, and frontend/node_modules/.bin/react-scripts.cmd. This fails the required baseline (54 suites / 1,013 tests); the request requires stopping before implementation. PG, guards, frontend CI, i18n and build were not run after this stop. R0 and R1 remain NOT STARTED; no ticket commits. No dependency installation, external calls, credential-file reads or edits occurred. Review report fully read in bounded UTF-8 chunks; finish plan inspection before implementation. Temporary credential-free dotenv suppression preload removed at stop.

Next action: restore local dependencies through an owner-approved offline source, or explicitly authorize registry access, then rerun complete pre-flight against a new erp-r01- PostgreSQL 16 container. Earlier Docker-denial stop is superseded; historical gate counts are not current verification. No product decisions arose. R2 remains out of scope. See docs/R0_R1_SCORECARD.md.

## 2026-10-14 - R0.10 proxy-addr remediation (Africa/Cairo)

Targeted command in backend: npm.cmd update proxy-addr --ignore-scripts --no-audit --no-fund; exit 0, changed 1 package. Lockfile scope comparison against HEAD: PASS, only node_modules/proxy-addr changed (2.0.7 -> 2.0.8), satisfying Express ~2.0.7. Direct dependencies forwarded 0.2.0 and ipaddr.js 1.9.1 unchanged; package.json unchanged. Lock diff contains version, resolved URL, integrity and upstream funding metadata only. No audit fix or other installation command ran.

npm.cmd audit --omit=dev: exit 0, found 0 vulnerabilities (0 critical). Advisory: https://github.com/advisories/GHSA-jqcg-44mw-7w3h; patched version 2.0.8, vulnerable IPv4-mapped IPv6 trust subnet matching. Offline reproducer loaded 2.0.7 source from the existing npm cache without installing or modifying the installed package: req.ip=198.51.100.99 (spoofed), assertion expected 203.0.113.7, exit 1. Same assertion with installed 2.0.8: req.ip=203.0.113.7, PASS, exit 0.

Exposure assessment (source inspection, not deployment or incident verification): server.js sets trust proxy using parseTrustProxy(process.env.TRUST_PROXY). security.js defaults to false; only true, false and non-negative hop counts are accepted, rejecting CIDR strings. docker-compose.yml fixes TRUST_PROXY to 1 for the backend; generate-staging-env.js also generates 1. Frontend nginx appends its immediate peer to X-Forwarded-For, and Compose publishes only frontend port 8090 on loopback, with no published backend port. Thus the checked-in default/Compose configuration does NOT use the subnet configuration required by this advisory, despite carrying the affected runtime package. No credential configuration was read; actual deployed settings and historical exploitation are unverified. TRUST_PROXY=true or exposing the backend directly while trusting one hop can independently allow spoofing; those configurations were not changed in this narrowly scoped ticket.

Added three tests in backend/src/scripts/__tests__/security.test.js using real Express req.ip/req.ips getters: nearest client behind one trusted hop (spoofed earlier entry ignored), no-proxy forwarded spoof retaining the same rate-limit key and returning 429 on the second request, and the advisory subnet regression.

Verification command outputs:
- npm.cmd test -- --runInBand src/scripts/__tests__/security.test.js: PASS, 1 suite / 10 tests.
- npm.cmd test -- --runInBand: PASS, 54 suites / 1,016 tests (+3 tests from baseline 1,013).
- npm.cmd run migrate: PASS, 126 applied / 0 already applied on fresh erp_r01_r010_test.
- TEST_PG=1 npm.cmd run test:pg: PASS, 68 suites / 635 tests.
- git diff --check: PASS.

PG gate used only new volume-free erp-r01-r010-20261014, cached postgres:16 with --pull=never, loopback 127.0.0.1:55461. Random database/JWT credentials stayed in process environment; dotenv config was suppressed with a credential-free temporary preload. Exact container removed in finally; no production database, secrets files or other Docker resources accessed. Existing stopped-run documentation and untracked audit/review reports were preserved. R0.1-R0.9 and R1 remain unimplemented; this verifies R0.10 only. Commit message: R0.10: patch proxy-addr and verify trusted proxy IP handling.

## 2026-10-14 - R0.1 environment-only launcher credentials

Resolved earlier Docker/dependency stop headings are explicitly marked superseded 2026-10-14. Owner confirms npm ci completed; elevated Docker access is authorized for erp-r01- throwaway containers only. R0.1 is active/completed as recorded below; previous stop evidence remains historical.

Reference discovery: rg searched launcher names across repository files, excluding audit/review reports, node_modules and logs. No launcher consumers found; docs/legacy/README.md explicitly marks legacy smoke scripts superseded by Jest/Playwright. Preserved all five scripts and removed their DB_PASSWORD assignments, including both legacy runner overrides and start_backend.ps1's empty override; values now inherit from the calling environment. No launcher was executed.

Reproduction: npm.cmd test -- --runInBand src/scripts/__tests__/script-passwords.test.js failed 1 suite / 5 tests before edits, with Received true for password overrides in every named script; no credential values appeared in output. After fix, focused launcher/guard suites PASS, 2 suites / 13 tests. New lint guard uses git ls-files for tracked .bat/.cmd/.ps1/.sh scripts and rejects literal password assignments at a zero baseline, including with --update. Diagnostics print filenames/counts only. Fixture coverage includes shell, batch and PowerShell forms, process references, generated expressions and empty values. One initial new guard test rejected a generated expression; corrected the classification, then reran both suites green. npm.cmd run lint:guards: lint-guards: ok.

Owner action required: rotate "NewStrongPassword123!" anywhere it was ever used; history was not rewritten and no credential was rotated here.

Scope: start_backend.bat, orchestrator.bat, launch_backend.ps1, docs/legacy/run_tests.ps1, start_backend.ps1, backend/src/scripts/lint-guards.js, new backend/src/scripts/__tests__/script-passwords.test.js, and closeout documentation. No migrations or runtime endpoint behavior changed. Full R0 exit gates remain due at batch exit. Commit message: R0.1: inherit launcher passwords and reject script literals.

## 2026-10-14 - R0.2 GET route SQL and dispatch repairs

Before: fresh throwaway PG16, 126 migrations; npm.cmd run test:pg -- src/scripts/__tests__/get-routes.pg.test.js failed all seven confirmed endpoint cases (HTTP 500). Generic enumeration initially needed support for a root-mounted nested router; corrected fixture enumeration. First broader sweep then found 448 unique GET routes / 8 server failures: reservation ambiguity, invalid fixture dates, and v1 materials recipes/requirements, invoices retention and document search shadowed by record routes. Date inputs were corrected to 2026-10-14; the real additional failures were fixed in this ticket, with no allow-list.

Fixes: warehouse detail GET registered after named collections; warehouse reservation filters qualified with sr; missing calibration assets join added; MIR supplier fields use name_en/name_ar while preserving supplier_name; quantities filters qualified with qm; expense/maintenance filters qualified; v1 family registration puts literal paths before parameter paths, preserving relative order within each specificity group.

After: same PG suite PASS, 1 suite / 8 tests; seven confirmed endpoints each HTTP 200; generic owner sweep 448 GET routes / 0 server failures, using seeded project_id, status=active and limit=5. Record paths use a deliberately absent numeric record id; external/MCP authorization responses may be 4xx, so this sweep demonstrates no server errors rather than successful domain workflows. No exceptions or allow-list. Focused existing external-api/procurement/location-quantity mocks PASS, 3 suites / 71 tests. npm.cmd run lint:guards: lint-guards: ok; git diff --check PASS. Container erp-r01-remediation-20261014 removed (exit 0); database/JWT credentials stayed in process env, dotenv suppressed. No external adapters called.

Modified: warehouses.js, qhse.js, quantities.js, expenses.js, maintenance.js, v1.js; new get-routes.pg.test.js. No migration. Full R0 batch gates remain due. Commit message: R0.2: repair GET queries and literal route dispatch.

## 2026-10-14 - R0.3 typed unknown API route responses

Reproduction: npm.cmd test -- --runInBand src/scripts/__tests__/api-not-found.test.js failed 3/3 cases: GET/POST/DELETE unknown API routes returned text/html instead of application/json. Fix: final /api fallback after registered routers returns HTTP 404, success=false, error_code=api_route_not_found, error_key=errors.apiRouteNotFound, empty error_params and request_id. Existing v1 router keeps its own contract. Added paired EN/AR catalog keys only for this new response; no deferred localization program started.

After: same test PASS 3/3; combined unknown-route/typed-route/external-api focused suites PASS, 3 suites / 53 tests. Test explicitly mocks dotenv and database. Frontend i18n:parity and i18n:check PASS. No DB migration or external calls; full batch gates remain due. Changed server.js, two errors catalogs; new api-not-found.test.js. Commit message: R0.3: return typed JSON for unknown API routes.

## 2026-10-14 - R0.4 policy-based media access

Before: corrected media-role-matrix.pg.test.js against committed pre-fix media source on fresh throwaway PG16 failed 1/1 test: 48 roles / 11 mismatches, including document_controller and site_engineer. Initial oracle classified four canonical external aliases incorrectly; corrected external classification using migration 0031's external block, then reran pre-fix evidence. After: same corrected PG matrix PASS, 48 roles / 0 mismatches; one linked draft document per role, expected internal access derived from seeded docs.view/wildcard grants. Existing media/client/consultant focused mocks PASS, 3 suites / 29 tests.

Fix: all non-external roles reach docs/site policy evaluation on the linked project; removed INTERNAL_ROLES gate. Canonical external role names from migration 0031 retain portal restrictions instead of receiving generic internal access. The legacy external assignment/approval/confidentiality behavior is preserved. Canonical external aliases without implemented portal-resolution branches continue to deny others' internal files; this ticket does not broaden their portal behavior. Uploaded-file owner fast path and preview scoping remain intact.

Changed mediaAccess.js; added media-role-matrix.pg.test.js. Fresh volume-free erp-r01-remediation-20261014 containers were removed after every before/after run; all 126 migrations applied. No secrets files/external adapters used; random credentials stayed in process env. Commit message: R0.4: authorize internal media through project policy.

## 2026-10-14 - R0.5 distinguish authentication outages

Before: npm.cmd test -- --runInBand src/scripts/__tests__/auth-infrastructure.test.js failed 3 pool outage/timeout cases (expected 503, received 401), while malformed/expired JWT 401 checks passed. Fix: JWT validation errors remain 401; failures outside JWT validation return typed authentication_unavailable 503 with Retry-After=5, empty error_params and paired errors.authenticationUnavailable key. Raw infrastructure messages are not exposed. Existing account/revocation and preview checks unchanged.

After: same suite passes all 5 cases; combined infrastructure/tokens/permission-isolation suites PASS, 3 suites / 368 tests. Frontend i18n:check PASS, parity PASS 35 namespaces / 1,285 English keys. Changed auth.js and two errors catalogs; new auth-infrastructure.test.js. Full R0 exit gates remain due. Commit message: R0.5: return retryable 503 for authentication infrastructure failures.

## 2026-10-14 - R0.6 block 6to4 SSRF and require JWT expiration

Before: tokens/external-api focused suites failed 2 regressions: resolveWebhookTarget accepted 2002:7f00:1::1; correctly signed typed session JWT without exp did not throw. Commands: npm.cmd test -- --runInBand src/scripts/__tests__/tokens.test.js src/scripts/__tests__/external-api.test.js; 2 failed / 52 passed tests.

Fix: block all 2002::/16, including public IPv4 embeddings, in the webhook address guard. Require a finite exp claim after signature verification, using JsonWebTokenError so R0.5 still maps JWT failures to 401. After: same regressions pass; tokens/external-api/auth-infrastructure suites PASS, 3 suites / 59 tests. No external DNS/HTTP performed; webhook lookup tests use stubs.

Reported unchanged risk: webhookService.js still derives its encryption master from WEBHOOK_ENCRYPTION_KEY || JWT_SECRET. If the dedicated encryption key is absent, JWT-secret rotation can orphan previously encrypted webhook secrets. No key value was read, no credentials rotated, and fallback behavior was not changed. Changed webhookService.js, tokens.js and their two existing test files. Commit message: R0.6: block 6to4 webhooks and require JWT expiration.

## 2026-10-14 - R0.7 remove unused frontend dependencies

Proof: rg -n '(axios|date-fns|recharts)' frontend/src frontend/e2e frontend/scripts --glob '*.{js,jsx,ts,tsx}' returned no matches (exit 1). Temporary R0.7 dependency declaration script failed before removal (axios still declared), then PASS after removal; backend bcrypt retained. npm.cmd uninstall axios date-fns recharts --offline --ignore-scripts --no-audit --no-fund: exit 0; manifest removes exactly those three declarations and frontend lock diff contains 347 deletions, no additions. No registry calls. npm reified optional local packages (35 added / 34 removed); initial frontend gate could not start because optional canvas lacked its native binary. Removed only the incomplete frontend/node_modules/canvas artifact after verifying the exact path remained inside this workspace, leaving its lock declaration intact; no native build or other installation was attempted.

Verification after environment correction: npm.cmd run test:ci PASS, 31 suites / 128 tests; CI=true npm.cmd run build PASS, Compiled successfully, exit 0. Changed only frontend/package.json and frontend/package-lock.json plus closeout records. Commit message: R0.7: remove unused axios date-fns and recharts dependencies.

## 2026-10-14 - R0.8 React AuthContext replaces Redux

Before: temporary Redux declaration/import regression failed (@reduxjs/toolkit remains declared). Fix: React AuthProvider/useAuth under store/ follows LocaleContext's provider pattern; exposes user, isAuthenticated, loading, error and former setUser/setLoading/setError/logout transitions. Initializes user from existing authService storage. Login keeps authService.setSession/token/user keys and navigation; Sidebar logout clears the existing session/preview through authService and resets context. Role, project scope and permission payload remain unchanged.

Scope: index.js, Login.js, Sidebar.js, store/ (new AuthContext.js, replacement index, deleted authSlice), Layout.test.js, Shell.i18n.test.js, new Sidebar.test.js, frontend dependency manifest/lock only. Removed @reduxjs/toolkit and react-redux via npm.cmd uninstall --package-lock-only --offline --ignore-scripts --no-audit --no-fund; no registry calls. Source search for react-redux/@reduxjs/toolkit/authSlice returned no matches; same temporary removal check PASS.

After: frontend test:ci PASS, 32 suites / 131 tests (+3 focused persisted-user/grants/logout/state checks). CI=true production build PASS, Compiled successfully, exit 0. Playwright e2e/shell.spec.js + e2e/locale.spec.js: 16 passed / 8 skipped, desktop/mobile; includes login, locale switches, refresh, logout/login persistence. The eight skips are existing duplicated viewport cases; no new skips. No deferred localization/accessibility work started. Commit message: R0.8: replace Redux auth slice with React context.

### Former docs/STATE.md (preserved)

# Closeout session state

## Completed

- Batches A and B are complete; see `docs/CLOSEOUT_LOG.md` and `docs/STAGING.md`.
- Batch C procurement UI and live journeys are complete; commits include `7c24499` and preceding C slices.
- Batch D UAT preparation is complete in commit `0243d3e`; human UAT remains outstanding.
- Batch E1 account mapping foundation is committed in `9be0cfb`; finance-owner confirmation is still pending.
- Batch E1/E2 certificate postings and invoice lines are committed in `f88c15b`.
- Batch E3/E4 source-lot supplier returns and forecast approval/ETC/EAC behavior are committed in `164c9e9`.
- Batch E5 finance workbench and journal-backed retention release are committed in `7370bca`; focused checks passed.
- Phase 5.6.1, the delivered 5.6.2 workflow slices, and 5.6.3 are implemented. Phase 5.6.2 SLA administration remains open.
- Phase 5.6.4 client actions are committed in `940d2f3`. Phase 5.6.5.a structured subcontractor submission intake/history is committed in `d6070bc`; 5.6.5.b formal WIR/MIR registers are committed in `f7e291d`; 5.6.5.c RFI/submittal forms are committed in `04c8ff0`; 5.6.5.d RFI acknowledgement/resubmittal forms are committed in `ba2a00c`; 5.6.5.e remaining subcontractor action forms are committed in `1f3a345`. Supplier portal MIRs currently show their number, current status, and decision date through own deliveries. Line-level accepted/rejected quantities and full internal inspection history remain on the procurement register.
- Phase 5.7.1 canonical incident source changes and populated legacy-conversion checks are committed in `a090a36`. QHSE and site internal queries now use `incidents`; HSE compatibility conversion retains the legacy view.
- Phase 5.7.2.a RFI location/work-package/cost/schedule impacts are committed in `ea2227c`; migration 0053 is applied on the disposable test database.
- Phase 5.7.2.b QA/QC certificate register is committed in `8ca1850`; migration 0054 is applied on the disposable test database. Spec 15 QA/QC certificates are distinct from finance payment certificates.
- Phase 5.7.2.c controlled-document issue dates/confidentiality and external confidentiality enforcement are committed in `f9d8c52`; migration 0055 is applied on the disposable test database.
- Phase 5.7.2.d transmittal recipient/document form and project-scope checks are committed in `4c89759`; no migration was required. Focused UI, route, PostgreSQL scope and i18n checks passed.
- Phase 5.7.3 schedule progress history and employee/asset assignments are committed in `8978b35`; its state-record correction is `697ccee`. Migration 0056 is applied on the disposable PostgreSQL database and focused route/component checks passed.
- Phase 5.7.4 handover evidence and the standalone warranty register are committed in `4e5da68`; focused checks passed. Migration 0057 is applied and reruns cleanly on the disposable PostgreSQL database.
- Phase 5.8.1 API tokens, durable MCP sessions, and action comments are committed in `42f255e`; focused PostgreSQL tests, the affected MCP safety case, lint guards, migration rerun, and syntax checks passed. Migration 0058 is applied and reruns cleanly on the disposable database.

## Next

1. Continue route-wide audit verification, especially transactional audit failures, safe error behavior, adjustment GL treatment, and project journeys.
2. Complete Phase 6 route-to-screen/API/permission inventory and remove all remaining prompt flows in bounded slices.
3. Continue remaining Phases 5.6 and 7-11 items in master-plan order; see `docs/CARRYOVER.md`.

## In progress / stopped
- Phase 5.8.2 notification delivery tracking and related gate repairs are committed as `ad8f9f6` on `closeout/batch-a-to-6`. Migration 0059 and forward migration 0060 applied successfully to fresh throwaway Postgres 16 test databases using runtime-generated credentials; no credential values were printed or written to tracked files.
- Current closeout gates: backend mock 53 suites / 999 tests; real PG 67 suites / 605 tests; `lint-guards: ok`; frontend CI 28 suites / 107 tests; `i18n:check ok`; production build passed; Playwright 34 passed / 50 skipped. Details and exact output summaries are in `docs/CLOSEOUT_LOG.md`.
- The Docker pilot smoke remains unverified. Automatic review rejected the smoke command because its script reads the explicitly prohibited `.env.docker` and `.staging-users.json` files. No workaround was attempted.

## Decisions and limits

- GL account mappings stay provisional until the finance owner confirms account purposes.
- Human UAT has not been executed.
- The current prompt scan finds zero calls under `frontend/src`; Phase 6 remains open for route-to-screen/API/permission inventory and journey verification. The portal prompt-removal slice passes 10 focused tests, i18n check, and production build; see the latest closeout entries.
- `docs/CODEX_AUDIT_REPORT.md` is a pre-existing untracked user artifact and has not been edited.

- Targeted revalidation of audit leads D1-D15 is recorded in `docs/CARRYOVER.md`; multiple findings from the old report are fixed/superseded in current code. Revalidation is not a full security or business-journey acceptance pass.

## Stop condition � 2026-10-13 � Docker engine unavailable — superseded 2026-10-14

The required `docker info --format '{{.ServerVersion}}'` check failed: `error during connect: Get "http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.51/info": open //./pipe/dockerDesktopLinuxEngine: Access is denied.` The Phase 7 idempotency changes remain uncommitted. Backend mock coverage passed 46/46; the focused real-Postgres daily-report replay test is unverified. No database or credential files were accessed. Resume after Docker Desktop engine access is restored, verify `docker info`, then run the focused PG test on a named throwaway database.

## 2026-10-14 continuation — Docker access restored; Phase 7 idempotency verified

The normal shell remains denied access to the Docker Desktop pipe; elevated Docker CLI access returned Engine `28.3.2`. Used fresh loopback-only, volume-free PostgreSQL 16 container `erp-closeout-pg16-20261014` and only database `construction_erp_test`. All 122 migrations applied. Daily-report idempotency covers internal, v1 and MCP; full backend mock (53/1,001), real PostgreSQL (67/607), frontend (28/111), i18n, build and guard gates passed. The slice is not yet committed. Continue with the Phase 7 offline queue; Phases 8–11 remain open.

Commit recorded: `2f31c01` (`Phase 7.2: require idempotent daily reports`). The user audit report remains untracked and untouched.

## 2026-10-14 continuation — Phase 7 offline daily-report queue

IndexedDB now stores report drafts, local photo blobs and quantity measurements scoped to owner and project. Sync uses capped exponential retry and the same idempotency key; conflicts/failures stay visible, and users can retry or remove. Desktop and mobile Playwright airplane-mode journeys each passed and confirmed one upload/report POST after reconnect. Backend mock 53/1,002; real PG 67/608; frontend 29/117; i18n and production build passed; full Playwright 34 passed / 50 skipped. Global responsive conversion still has 110 inline grid-template declarations and 64 table tags; local Arabic font assets and Lighthouse are open.

Phase 7.2 offline site-report queue committed as `7487787` (`Phase 7.2: queue site reports offline`). Remaining Phase 7 work is font packaging, Lighthouse, app-wide responsive/table conversion and broader mobile coverage.

## 2026-10-14 continuation — Phase 7 responsive utilities

App-wide page grid declarations were converted to responsive classes (110 to 0). All 72 JSX tables now sit in `.table-container` (AST check: 0 unwrapped). Site Management buttons are 44px minimum and form controls 14px. Post-change Playwright: 36 passed / 50 skipped, including offline flow on desktop/mobile; frontend 29/117, i18n and build passed. Phase 7 remains open for bundled IBM Plex Arabic, Lighthouse evidence, and broader route/portal mobile coverage.

Responsive grid/table slice committed as `7fd068a` (`Phase 7.2: make page grids responsive`).

## 2026-10-14 continuation - Phase 8 baseline BAC, financial EVM, resource loading

Implemented and verified the Phase 8 earned-value/resource-load plan item. Migration 0064 adds activity BAC; baseline snapshots capture BAC and milestone status. Financial SPI/CPI use explicit baseline BAC and the central project cost view. Legacy baselines without complete BAC retain quantity SPI and expose CPI as unavailable. Added transactional audit for BAC changes, project-scoped daily resource-load output for employees/assets, and an EN/AR permission-visible schedule editor and analytics table.

Verification: Docker Desktop Engine 28.3.2; only disposable loopback PostgreSQL container `erp-closeout-pg16-20261014` and test database `construction_erp_test` used. Migration output: 1 applied, 125 already applied. Focused schedule PG 6/6; full PG 67/616; backend mocks 53/1,003; lint guards passed; frontend CI 29/120; focused Schedule component 4/4; i18n check/parity passed (35 namespaces / 1,123 English keys); build compiled; changed JS syntax, EN/AR JSON parse, `git diff --check` passed. Exact commands/output summary recorded in `docs/CLOSEOUT_LOG.md`.

Current open Phase 8 items: legacy approvals dual-write hold/retirement and duplicate transition/payment-certificate surfaces. Phase 7 PWA/Lighthouse, Phases 9-11, and all human/production-evidence gates remain open. `docs/CODEX_AUDIT_REPORT.md` remains an untracked user artifact and is not part of this slice. Implementation commit: db10c5e.

## 2026-10-14 stop note — approval retirement cutover

Phase 8 legacy approval retirement preparation is complete but not cut over. Workflow-backed status is used by approval API reads, dashboard, stale report, and stale-cancel script; legacy status mirroring remains enabled by default. Verification: approval PG 9/9; full PG 67 suites / 618 tests; backend mocks 53 suites / 1,004 tests; `lint:guards: ok`; changed-file JavaScript syntax and `git diff --check` passed. Approval parity passed for all 55 rows after the idempotent repository migration helper created two missing workflow twins on the disposable test DB.

Exact blocker: migration 0013's partial unique pending index keeps a stale legacy row reserved after a workflow decision when mirroring is disabled, preventing same-record re-submission. The API now returns typed 409 `approval_resubmission_requires_legacy_mirror`; no history is rewritten. Replacing the index conflicts with the repository's additive-only migration rule and needs a schema/migration decision. The real-data two-week parity hold has not started. Next action: approve a compatible uniqueness design and migration, then run parity/preflight on restored real-like data and start the two-week monitored hold; keep dual-write default enabled until that evidence and signoff exist.

## 2026-10-14 in progress — Phase 11 reconciliation coverage

`reconcile-database.js` now covers the planned reconciliation categories, including journal balance, sequence drift, PO delivery/GRN quantities, credit-aware payment allocation, project-cost source linkage, and advance ledger direction totals. Unit tests (3/3), backend mocks (53/1,005), lint guards, changed-file syntax/diff checks passed. All added SQL executed read-only against the local disposable PostgreSQL database.

Do not treat this as the Phase 11 restored-copy gate. The disposable database includes retained test fixtures and returned nonzero findings: 16 active workflows missing a current pending step, 64 stock projection mismatches, 59 cost/journal-link rows, 16 missing cost source rows, 84 AP/AR journal references without live documents, and 174 PO delivery/GRN quantity mismatches. No repair or deletion was performed. Restored-real-data backup/copy, reconciliation, discrepancy resolution, and saved report remain the next actions. Implementation commit: 75b6f36.

## 2026-10-14 in progress — Phase 10 shared locale helpers

Implemented the L6 formatting/name helper foundation in `frontend/src/utils/formatters.js`. Formatters follow document `lang` by default or accept an explicit locale; Arabic-digit selection is configurable. Formatter suite passed 5/5; frontend CI 29/123; i18n checks passed (35 namespaces / 1,123 keys); production build compiled. Existing call sites have not all been migrated, so Phase 10 remains open for page migration, API error localization, PDF/RTL/accessibility review, and E2E. Implementation commit: 39e0b6e.

## 2026-10-14 continuation - repeatable Phase 9 golden demo seed

Added `npm run seed:golden-demo`, a process-environment-only fixture CLI guarded to `APP_ENV=test|staging`, a test/staging database-name segment, loopback DB host, valid port, and present DB credentials. Added guard unit cases and changed the real-PG residential fixture to use the same idempotent seed function. On a fresh disposable PostgreSQL 16 database, all 126 migrations applied; the CLI ran twice and returned 96 units, EGP 504,000 C35 BOQ, and 122.4 m3 net demand on both runs. The focused golden-chain suite passed 1 suite / 7 tests.

Batch gates: full PostgreSQL suite 67 suites / 621 tests PASS; backend mocks 54 suites / 1,013 tests PASS; `npm run lint:guards` PASS (`lint-guards: ok`); frontend CI 31 suites / 128 tests PASS; `i18n:check` PASS; parity 35 namespaces / 1,283 English keys PASS; production build PASS; Pixel 7 route sweep 36/36 PASS. The first unprivileged Playwright launch returned `spawn EPERM`; the approved local browser runner passed all 36 routes. Seed guard tests passed 8/8. Database and JWT credentials were generated in process memory; the disposable container and temporary dotenv file were removed.

The full tender-to-warranty/browser scenario is still open because Spec 28 is absent and commercial values remain provisional. Phase 7 local font/Lighthouse, Phase 8 restored-real-data approval parity, Phase 10 Arabic PDF/native review, and Phase 11 seeded reconciliation-defect cases, restored-copy report, independent review, rollout rollback, and UAT also remain open. Pilot smoke and backup/restore rehearsal were not run because their scripts read prohibited `.env.docker` and `.staging-users.json`. Production remains NO-GO; no phase exit boxes were closed.
## 2026-10-14 continuation - Phase 11 seeded reconciliation defects

Added real-PostgreSQL defect tests that seed a payment allocation above the payment amount and a client payment allocation across project boundaries. Each matching reconciliation SQL check reported exactly one violation; test transactions rolled back the fixtures. This is focused detection coverage for two checks, not a complete per-invariant matrix or a clean restored-real-data report.

Updated full gates: fresh disposable PostgreSQL 16 full chain 126 migrations; PG 68 suites / 623 tests PASS; backend mocks 54 suites / 1,013 tests PASS; lint guards PASS; frontend CI 31 suites / 128 tests PASS; i18n check and parity (35 namespaces / 1,283 keys) PASS; production build PASS; Pixel 7 route sweep 36/36 PASS. No real or production data was accessed.
## 2026-10-14 continuation - expanded Phase 11 reconciliation defect coverage

Expanded the real-PG seeded-defect suite from two to six invariants: payment allocation total, invoice allocation balance, cross-project payment allocation, retention releases, advance restorations, and stock-ledger projection. Each test compares the check result before and after inserting its fixture, so pre-existing database residue does not mask or create a false positive. Full PG suite passed 68 suites / 627 tests after this correction. The restored-real-data clean report remains outstanding.
## 2026-10-14 continuation - clean demo reconciliation baseline

On a fresh volume-free Docker PostgreSQL 16 database, the full 126-migration chain and idempotent golden demo seed completed. Read-only runReconciliation returned ok=true with zero violations for all 16 checks. The NOT VALID constraint data-cleaning report returned an empty list. The exact disposable container and process-only generated DB/JWT credentials were removed. This is clean seeded-demo evidence only, not the required restored-real-data acceptance; production remains NO-GO.
## 2026-10-14 continuation - Phase 11 seeded defects cover reconciliation matrix

Expanded `reconcile-defects.pg.test.js` to 14 real-PG cases covering 15 of the 16 reconciliation checks. They seed payment and invoice allocation overages, client/supplier cross-project allocations, cross-project warehouse transfers, missing workflow steps, missing cost source/ledger links, orphan money-movement journal references, unbalanced journal lines, PO delivery-line mismatch, retention/advance imbalance, stock projection mismatch, and approval mirror gaps. Every case compares violation deltas against baseline and rolls back its transaction. Owned-sequence drift remains covered by the existing unit test because setval is not transactionally rollbackable.

Fresh full PG gate: 68 suites / 635 tests PASS after 126 migrations. The full backend mocks 54/1,013, lint guards, frontend CI 31/128, i18n check/parity 35 namespaces / 1,283 keys, production build, and Pixel 7 sweep 36/36 passed in the current batch. Restored-real-data reconciliation remains open.
## 2026-10-14 continuation - synthetic golden-demo backup/restore

On a fresh volume-free Docker PostgreSQL 16 container, applied all 126 migrations, seeded the residential demo, created a custom-format pg_dump inside the container, and restored it into a second empty database. Source and restored snapshots matched: project OSIRIS-RES-TOWERS-001, 96 units, 1 BOQ item, net demand 122.4000 m3. The restored DB passed 16/16 read-only reconciliation checks with 0 violations; data-cleaning report returned []. All credentials were process-generated, no protected env or staging-user files were opened, and the exact container was removed. This only rehearses the synthetic demo restore; the approved-pilot/real-data restore and rollback gate remains open.
## 2026-10-14 - R0.9 docs truth and R0 exit gate

Reproduction: temporary R0.9 doc/pointer/decision check failed because docs/STATE.md had 114 lines rather than a three-line pointer. After: same check PASS. Root STATE.md now has a current authority section plus Archived history preserving the complete former root/docs state contents; no history content deleted. Docker/dependency stops marked superseded 2026-10-14. Current source command lists 0062, 0063, 0064; 0030 present=False; highest/next corrected to 0064/0065. docs/MIGRATIONS.md and IMPLEMENTATION_STATUS.md stale current claims corrected without rewriting their history. DECISIONS records signed-contract start/tender deferral, Redux removal, single STATE and localization/accessibility REV-019/020 L5-L11/R6 deferral. Phase 9 and GOLDEN_VALUES start at contract; Phase 10 deferral explicit. AGENTS.md already agrees; unchanged. Plan checkboxes ticked: none (no whole-phase acceptance inferred).

Full R0 gates: backend npm.cmd test -- --runInBand PASS 57 suites / 1,034 tests; TEST_PG=1 npm.cmd run test:pg PASS 70 suites / 644 tests after all 126 migrations on fresh throwaway PG16; lint:guards PASS; frontend test:ci PASS 32 suites / 131 tests; i18n:check PASS; parity PASS 35 namespaces / 1,285 keys; CI=true production build PASS. Counts exceed requested/review baseline by added regressions (mock +21, PG +9, frontend +3). Pre-change six-gate baseline was interrupted by superseded environment stops, so comparator counts are explicitly request/review counts, not a claim of unrun output.

First full PG exit run failed one MCP test because /777/ matched an invoice-number timestamp substring while the amount key was correctly redacted. Explained fixture issue: assertion now matches complete serialized monetary scalar values, retaining amount-key checks; summaries may be truncated JSON. Fresh full rerun PASS 70/644. This test-only repair does not weaken monetary redaction or alter runtime behavior. Exact erp-r01-remediation-20261014 container removed after each run. No secrets files or external adapters used.

R0 scorecard in docs/R0_R1_SCORECARD.md; R1 not yet implemented. Continue with R1.1 inventory-only commit before policy/handler edits. Commit message: R0.9: consolidate state and record verified closeout decisions.

## 2026-10-14 - R1.1 reject project identity conflicts and authorize moves

Required inventory-only commit made first: 940c41e, docs/R1_PROJECT_ID_INVENTORY.md only. Source census: 88 Joi project-id substring declarations / 29 files, including two query-only schemas, current_project_id asset placement and nested company-only batch items. Manual shared-schema/factory tracing refined the inventory to 91 mutation entries (generated issue/return/adjustment POST/PUT pairs and shared PR update schema); no declaration was omitted.

Reproduction before implementation: five valid expense/invoice/legal/payment/BOQ section calls with scoped query A and body B returned 201 and SELECT found one foreign-project row per case. Initial generic sweep returned 86/86 responses without required project_id_mismatch. Five unit source-conflict cases did not throw; equivalent sources already passed. Fixture setup initially used an invalid clients column and was corrected before reproducing the defect.

Fix: collect params/query/body snake/camel ids and asset current_project_id, reject distinct supplied ids with typed project_id_mismatch 400 before record SQL, preserve existing project_id_invalid code. Child record params.id is not treated as a second project id when the path names :projectId. req.policy now exposes authorized identity and source identity; a shared helper replaces all direct value.project_id reads in route files and normalizes validated project-bearing payloads before delegated engines/dynamic updates. Strict-zero direct-project-id lint cannot be baselined with --update. No baseline entries added.

Record moves require both source and destination grants; moving to unassigned/company data requires company-wide destination authority. Asset placement now resolves its original current_project_id, preventing destination-only users from moving another project's asset. Existing pre-authenticated v1/MCP chains use the same authorizer. Company-wide seats come exclusively from existing policy rows, not invented role lists.

After: five cases return typed 400 and SELECT confirms zero inserted rows; refined inventory sweep 91 handlers / 0 failures. Single-source scoped/owner calls succeed. HSE moves denied without destination grant (SELECT source unchanged), allowed with both grants and owner company-wide; asset destination-only move denied, owner move succeeds. Focused PG 9 tests, plus full R1.1 PG gate PASS 71 suites / 653 tests; only explicitly pending R1.2 reproduction excluded from that run. Full mock gate passed 58 suites / 1,042 before final additional unit case; final project/policy/helper focused checks passed 13 tests, and full R1 exit mock rerun remains due. Guards PASS; paired EN/AR checks PASS, 35 namespaces / 1,287 keys.

Explained corrections before green: duplicate imports from the temporary refactoring script were consolidated (all route syntax checks pass); a changed validation code was restored to project_id_invalid; child site-report ids were excluded from project identity collection. No unexplained failing gate is waived. Every PG run used fresh erp-r01- throwaway PG16, all 126 migrations and exact container removal; no credential files/externals used. No migration. R1.2 aggregates/discovery remain pending. Commit message: R1.1: enforce canonical project identity and both-project writes.
