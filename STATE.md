# Closeout state

Updated: 2026-10-13 (Africa/Cairo)

## Done

- Read the pasted closeout scope, audit report, plan, status/progress/log/testing/migration docs, and requested Docker/CI files.
- Created and switched to `closeout/batch-a-to-6`. Preserved the existing untracked `docs/CODEX_AUDIT_REPORT.md`.
- Added repository conventions in `AGENTS.md`.
- Commits: `f364461` (A1), `4e85eb5` (A2/A3 webhook SSRF and secret handling), `9da567b` (A4 selected transactional audits), `5a7d194` (A5), `6e5c389` (A6).
- A7 is committed as `0514025` (configurable monetary approval limits).
- A8 Playwright runner repair is implemented locally; full browser output is 32 passed / 46 skipped. It needs its own commit.
- Backend mock gate currently passes: 46 suites / 949 tests. `npm run lint:guards` passes.
- A7 implementation is in progress: versioned migration, role/action limit service, owner/admin API, approval enforcement and unit coverage exist; not yet committed.

## In progress

- Batch A remains incomplete. A2/A3 are grouped in one commit because the service and tests share files. A4 has selected transactional conversions only; the route-family sweep is incomplete. A5/A6 are committed.
- Current full backend mock gate passes 46/46 suites and 949/949 tests after updating expectations for configurable limits and the route inventory. The A7 focused suite is 1/1 and 4/4.
- Frontend gates pass: 17 suites / 97 tests, `i18n:check ok`, production build succeeds. Playwright lists 78 tests and ran 32 passed / 46 skipped; seeded-backend and screenshot-baseline cases remain gated/on-demand.

## Where work stopped

- `docker info` failed because the Docker Desktop Linux engine pipe is absent (`//./pipe/dockerDesktopLinuxEngine`). No alternate database was used.
- Docker Desktop engine is unavailable, so no isolated PostgreSQL could be started. Do not run the PG suite against another DB.
- The A7 full mock run first failed two stale assertions (owner-only monetary approval, fixed route count); both were updated and the rerun passed.

## Next step

- Continue A4 conversion/review of remaining route families; commit A8, then do A9. Keep A1 and A7 migration/runtime verification unverified until the full real-PG suite passes against a new explicitly test-named throwaway container/database.
- Then complete the frontend, Docker, UAT preparation, finance, and Phases 5.6–6 in the pasted request, recording exact command output and commits per slice.

## Gates

- Backend mock: PASS — 46/46 suites, 949/949 tests (`npm test -- --runInBand`).
- Backend lint guards: PASS — `lint-guards: ok`.
- Frontend: PASS — 17/17 suites, 97/97 tests; `i18n:check ok`; production build success.
- Playwright: PASS — `npm run test:e2e` reports 32 passed / 46 skipped (78 discovered); backend journeys and screenshot baselines were not run.
- Focused webhook suite: PASS — 1 suite, 42 tests.
- Real PostgreSQL: UNVERIFIED — Docker daemon unavailable. Audit baseline before these changes was 565 passed / 1 known failure.
- Frontend, browser, staging Docker, backup/restore, UAT, finance, and Phases 5.6–6: NOT RUN.
