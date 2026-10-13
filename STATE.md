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

- Batch B local Docker staging/pilot work has not started. No staging seed credentials or user accounts have been created.
- The isolated PostgreSQL test container was for the PG test gate only; it is not the Batch B compose pilot and does not satisfy the fresh `docker compose up --build` smoke/backup rehearsal.
- Batches C–E and Phases 5.6–6 remain open. Finance signoff still requires the owner to confirm the provisional chart-of-accounts mappings.

## Where work stopped

Batch A is green. Next inspect `docker-compose.yml`, both Dockerfiles, `frontend/nginx.conf`, the staging seed script, health checks, and migration runner. Then implement Batch B slices in order, starting with safe fresh local compose startup; do not read any `.env` file or use non-local hosts/services.

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
| Batch B compose, staging smoke, backup/restore | NOT RUN |
| Batches C–E and Phases 5.6–6 | NOT RUN |

## Risks and decisions

- Production remains **NO-GO**; human UAT and owner finance account confirmation are not complete.
- Docker test execution needed elevated local-engine access because the sandbox could not access the Docker Desktop pipe. The test DB was isolated and named explicitly; no production-looking or external database was used.
- Approval limit defaults and finance mappings are provisional where noted in code/docs; finance signoff remains pending.
- `0030` remains a documented, unreused migration-number gap. Highest migration is `0041`; next is `0042`.
