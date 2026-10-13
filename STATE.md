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

Pilot smoke remains unverified. Automatic review rejected the command because the script reads `.env.docker` and `.staging-users.json`, which the request explicitly prohibits. No alternate execution path was attempted. The 5.8.2 code and gate repairs remain uncommitted; next action is explicit-path staging, cached-diff inspection, commit, then the requested carryover audit.

## Closeout continuation — after 5.8.2 commit (2026-10-13)

Commit `ad8f9f6` contains the verified Phase 5.8.2 slice and gate repairs. `docs/CARRYOVER.md` now records the verified gates and remaining audit/implementation sequence. Current scan: 36 frontend `prompt()` calls across 11 page files; Phase 6 remains open. Typed-name deletion dialogs now cover twelve prompts across five pages. The pilot smoke remains unverified because automatic review rejected the script's access to prohibited `.env.docker` and `.staging-users.json`. Next: revalidate Batch C/E and D1-D15 evidence, then complete the Phase 6 inventory and bounded prompt replacement slices.
