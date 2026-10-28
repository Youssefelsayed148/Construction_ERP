# Production go/no-go

**Decision: NO-GO.** No production deployment or real-data cutover is authorized
by this report. Evidence below is local, disposable, and incomplete where marked.

| # | GO criterion | Status | Evidence (file, commit, or command record) | Owner / next action |
|---:|---|---|---|---|
| 1 | Zero open Critical/High findings from the three audits | **pending-human** | Open findings are listed in `docs/REVIEW_REPORT_2026-10-14.md` and `docs/SECURITY_REVIEW_PREP.md`; npm production-dependency audits are recorded in `docs/BATCH3_SCORECARD.md`. | Independent reviewer + system owner: resolve, downgrade with evidence, or accept each open finding. |
| 2 | Golden E2E, concurrency, and permission-matrix suites green in CI on real PostgreSQL | **not met** | `.github/workflows/ci.yml` defines mock, PG16, frontend, Playwright, API guard, i18n, and root-build jobs (2026-10-28: confirmed every script it calls exists in `backend/package.json`/`frontend/package.json`; no remote run obtained). `backend/src/scripts/__tests__/golden-journey.pg.test.js` (new, 2026-10-28) now drives contract through warranty end to end, locally green (`docs/CLOSEOUT_LOG.md`'s Batch T1 entry) - it proves GOLDEN_VALUES.md's formulas, not its exact figures. `concurrency.pg.test.js` and `policy-matrix.pg.test.js` (extended by the new `t3-role-coverage.pg.test.js`, 47 tests) pass locally; no remote CI run exists for any of it. | CI owner + implementation: obtain a green remote run; finance/construction owner approves golden-value figures so a value-exact journey can be built. |
| 3 | Reconciliation clean on migrated data | **not met** | 2026-10-28: `node src/scripts/reconcile-database.js` (18 named checks) ran clean twice on a local throwaway PostgreSQL 16 database (`erp_closeout_test`, 135 migrations) - once empty, once after `seed:golden-demo` populated real fixture data; `pg_dump`/`pg_restore` into a second throwaway database matched row counts exactly (users 0/0, `schema_migrations` 135/135, 259 public tables both). This still does not establish a restored pilot/real-data copy. Full detail in `docs/CLOSEOUT_LOG.md`'s 2026-10-28 entries. | Environment operator + implementation: obtain a restored real-data-shaped copy, run reconciliation/data-cleaning there, and resolve findings. |
| 4 | Demo project cost, progress, and finance match golden values | **not met** | `docs/GOLDEN_VALUES.md` remains explicitly provisional. `golden-journey.pg.test.js` (new, 2026-10-28) proves the retention/advance-recovery/EAC formulas against its own deterministic numbers (marked `// PROVISIONAL golden value`), not GOLDEN_VALUES.md's exact BOQ/contract figures - building that exact fixture across one combined chain was judged too fragile for one session (`docs/CLOSEOUT_GAPS.md`). | Finance + construction: approve the golden-value assumptions. Implementation: then build the value-exact fixture. |
| 5 | Offline/mobile checks and Phase 10 localization exit, including Arabic PDFs | **not met**, closer than previously documented | 2026-10-28 re-audit (`docs/CLOSEOUT_RECONCILIATION.md`) found L0-L8 already done in code (0 inline `locale==='ar'` branches repo-wide, 0 raw error-leak sites, production Arabic PDF via headless Chromium with bundled OFL-licensed fonts) - the plan's own stale figures (1,093 branches, 374 raw errors, missing font asset) are corrected. L9 (RTL logical CSS), L10 (automated EN/AR E2E) and L11 (native Arabic review) remain open and owner-deferred past this closeout (2026-10-14 decision); `docs/ARABIC_REVIEW_PACK.md` still states no native review has occurred. | Native Arabic construction-domain reviewer: terminology sign-off. Owner: confirm L9-L11 stay deferred or pull them back in. |
| 6 | Restore drill and rollback runbook rehearsed | **pending-human**, stronger local evidence | 2026-10-28: a full `pg_dump`/`pg_restore` rehearsal into a second throwaway database passed with exact row-count parity; migration idempotency confirmed (rerun applies 0); the rollback mechanism itself (migrations are forward-only, no down-scripts - restore-from-backup is the documented runbook, `docs/MIGRATIONS.md`) was exercised end to end by that same rehearsal. Still local/throwaway only; `smoke:staging` and the Docker Compose pilot stack were NOT RUN (not provisioned in this sandbox). | Environment operator + owner: repeat this rehearsal against the pilot/staging environment, record it, and sign. |
| 7 | Finance, procurement, site, and owner UAT signed | **pending-human** | `docs/UAT_PILOT.md` (procure-to-pay) plus the new `docs/UAT_EXECUTION_KIT.md` (2026-10-28: full lifecycle across owner, procurement, site, finance, handover/warranty and all four external portals) are both ready to run; neither sign-off table has recorded human results. | Finance, procurement, site, owner, and the 4 portal role-holders: complete both kits and record signatures. |

## Exact local PowerShell commands

Run only from the repository root and only with the local seeded pilot configured
as described in `docs/STAGING.md`. The pilot scripts consume `.env.docker` and the
seed writes ignored generated credentials; do not print either file.

```powershell
$env:COMPOSE_PROJECT_NAME = 'erp-closeout-pilot-20261013'
docker compose --project-name $env:COMPOSE_PROJECT_NAME --env-file .env.docker up --build -d
npm --prefix backend run seed:staging
npm --prefix backend run seed:pilot-data
npm --prefix backend run smoke:staging -- --base-url=http://127.0.0.1:8090
npm --prefix backend run backup:rehearse
```

For a migrated throwaway database with `DB_*`, `JWT_SECRET`, and `TEST_PG=1` set
in the process environment:

```powershell
npm --prefix backend run test:pg -- --silent src/scripts/__tests__/golden-chain.pg.test.js
npm --prefix backend run test:pg -- --silent
```

The smoke requires a confirmed restorable backup because it invokes the read-only
reconciliation script. After verifying a backup, set
`RECONCILIATION_BACKUP_CONFIRMED=true` only for the smoke process. In PowerShell:
`$env:RECONCILIATION_BACKUP_CONFIRMED='true'; npm --prefix backend run smoke:staging`.
In `cmd.exe`: `set "RECONCILIATION_BACKUP_CONFIRMED=true" && npm --prefix backend run smoke:staging`.
The pilot smoke and local staging backup/restore rehearsal were run on 2026-10-13;
their output is recorded in `docs/CLOSEOUT_LOG.md` (B4/B5). They were **not rerun
for Batch 3**. Batch 3's new workflow was not executed remotely; see
`docs/BATCH3_SCORECARD.md` for exact local command status.

## Decision

Do not proceed to production. The independent security review, a remote-CI-verified golden journey,
restored-copy reconciliation, owner-approved golden values, native Arabic terminology review,
production-environment rollback rehearsal, and human UAT still need evidence. See `docs/LAUNCH_READINESS.md`
(2026-10-28) for the full criterion-by-criterion evidence table, the open Blocker/Major count, and the
ordered remaining path to launch.
