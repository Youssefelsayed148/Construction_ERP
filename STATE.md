# Closeout state

Updated: 2026-10-13 (Africa/Cairo)

## Done

- Read the pasted closeout scope, audit report, plan, status/progress/log/testing/migration docs, and requested Docker/CI files.
- Created and switched to `closeout/batch-a-to-6`. Preserved the existing untracked `docs/CODEX_AUDIT_REPORT.md`.
- Added repository conventions in `AGENTS.md`.
- Commits: `f364461` (A1), `4e85eb5` (A2/A3 webhook SSRF and secret handling), `9da567b` (A4 selected transactional audits), `5a7d194` (A5), `6e5c389` (A6).
- A7 is committed as `0514025` (configurable monetary approval limits).
- A8 is committed as `31cd433` (project-local Playwright install/runner).
- Backend mock gate currently passes: 48 suites / 968 tests. `npm run lint:guards` passes.

## In progress

- Batch A remains incomplete. A2/A3 are grouped in one commit because the service and tests share files. A4 has selected transactional conversions only; the route-family sweep is incomplete. A5/A6 are committed.
- A4 remains partial: multiple route families have transactional activity and policy audit writes; a textual occurrence count is not a reliable remaining-work metric, and global rollback proof is not real-PG verified.
- A9 security scan fixes are committed as `67ba313`; the MFA item is design-only in `docs/DECISIONS.md`.
- A4 continuations through `01533ce` convert master data, QHSE, HSE, document-control, site, warehouse, HR, materials, handover, finance, consultant, work-order, maintenance, payroll, team-assignment, portal, reports, client-preview, auth, commercial/finance, sales, schedule, quantity, organization, and agent approval writes. Current route-wide lint guard checks that `logActivity` calls receive the caller transaction query, allowing only the documented completion sweep exception. Batch A remains incomplete; raw grep counts include transaction-bound calls and are not counts of remaining debt.
- Frontend gates pass: 17 suites / 97 tests, `i18n:check ok`, production build compiled successfully. Playwright ran 32 passed / 46 skipped out of 78; real-backend journeys and screenshot baselines remain skipped.
- The most recent backend rerun passes 48/48 suites and 969/969 tests; guards pass. A8 frontend/browser outputs remain green as recorded below.

## Where work stopped

- `docker info` failed because access to the Docker Desktop Linux engine pipe is denied (`//./pipe/dockerDesktopLinuxEngine`). No alternate database was used.
- Docker Desktop engine is unavailable, so no isolated PostgreSQL could be started. Do not run the PG suite against another DB.
- The A7 full mock run first failed two stale assertions (owner-only monetary approval, fixed route count); both were updated and the rerun passed.

## Next step

- Commit the current route-wide audit guard slice, continue the A4 service/migration audit review, then complete the Batch A closeout only after the sweep is covered. Keep A1, A7, A9 migrations and all PG checks unverified until the full real-PG suite passes against a new explicitly test-named throwaway container/database.
- Then complete the frontend, Docker, UAT preparation, finance, and Phases 5.6–6 in the pasted request, recording exact command output and commits per slice.

## Gates

- Backend mock: PASS — 48/48 suites, 968/968 tests (`npm test -- --runInBand`).
- Backend lint guards: PASS — `lint-guards: ok`.
- Frontend: PASS — 17/17 suites, 97/97 tests; `i18n:check ok`; production build success.
- Playwright: PASS — `npm run test:e2e` reports 32 passed / 46 skipped (78 discovered); backend journeys and screenshot baselines were not run.
- A7 focused: PASS — 1 suite, 4 tests (`approval-limits.test.js`).
- A9 focused: PASS — 6 suites, 76 tests; latest full backend run covers 48 suites / 968 tests.
- Focused webhook suite: PASS — 1 suite, 42 tests.
- Real PostgreSQL: UNVERIFIED — Docker daemon unavailable. Audit baseline before these changes was 565 passed / 1 known failure.
- Frontend, browser, staging Docker, backup/restore, UAT, finance, and Phases 5.6–6: NOT RUN.
