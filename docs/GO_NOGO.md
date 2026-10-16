# Production go/no-go

**Decision: NO-GO.** No production deployment or real-data cutover is authorized
by this report. Evidence below is local, disposable, and incomplete where marked.

| # | GO criterion | Status | Evidence (file, commit, or command record) | Owner / next action |
|---:|---|---|---|---|
| 1 | Zero open Critical/High findings from the three audits | **pending-human** | Open findings are listed in `docs/REVIEW_REPORT_2026-10-14.md` and `docs/SECURITY_REVIEW_PREP.md`; npm production-dependency audits are recorded in `docs/BATCH3_SCORECARD.md`. | Independent reviewer + system owner: resolve, downgrade with evidence, or accept each open finding. |
| 2 | Golden E2E, concurrency, and permission-matrix suites green in CI on real PostgreSQL | **not met** | `.github/workflows/ci.yml` defines mock, PG16, frontend, Playwright, API guard, i18n, and root-build jobs. Local gate command results are in `docs/CLOSEOUT_LOG.md`; this workflow has no verified remote run in this batch. `golden-chain.pg.test.js` covers a partial P2P/residential slice, not tender through warranty. | CI owner + implementation: obtain a green remote run and complete the tender-to-warranty journey. |
| 3 | Reconciliation clean on migrated data | **not met** | `backend/scripts/r02-pg-gate.ps1 -Reconcile` runs against a fresh throwaway PostgreSQL 16 database; the latest result is recorded in `docs/CLOSEOUT_LOG.md`. This does not establish a restored pilot/real-data copy. Current migration total is 130 per the PG gate output in `docs/CLOSEOUT_LOG.md` and `backend/src/scripts/run-all-migrations.js`. | Environment operator + implementation: retain a restored pilot-copy report, run reconciliation/data-cleaning there, and resolve findings. |
| 4 | Demo project cost, progress, and finance match golden values | **not met** | `docs/GOLDEN_VALUES.md` and `backend/src/scripts/__tests__/golden-chain.pg.test.js` document/test the C35 slice; commercial assumptions remain provisional and the full project outputs are not asserted end-to-end. | Finance + construction + implementation: approve assumptions and complete runtime golden assertions. |
| 5 | Offline/mobile checks and Phase 10 localization exit, including Arabic PDFs | **not met** | `docs/CLOSEOUT_LOG.md` records the mobile/offline checks; `docs/i18n/PDF_SPIKE.md` records the renderer samples. `docs/i18n/STATUS.md` and `docs/ARABIC_REVIEW_PACK.md` show open Phase 10 and native terminology work. | Implementation + Arabic reviewer: finish production PDF/CSV work, localization gates, and native Egyptian construction terminology review. |
| 6 | Restore drill and rollback runbook rehearsed | **pending-human** | Local backup/restore rehearsal output, migration dry-run, reconciliation, and data-cleaning result are recorded under `docs/CLOSEOUT_LOG.md` (2026-10-13 B5). The evidence is local staging; a production-environment rollback rehearsal is not claimed. | Environment operator + owner: review/sign the documented rehearsal and record approved-environment rollback evidence. |
| 7 | Finance, procurement, site, and owner UAT signed | **pending-human** | `docs/UAT_PILOT.md` contains role scripts/sign-off fields; the sign-off table has no recorded human results. | Finance, procurement, site, and owner: complete scoped UAT and record signatures. |

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

Do not proceed to production. The independent security review, full golden journey,
restored-copy reconciliation, owner-approved golden values, production Arabic PDF/CSV migration and review,
production-environment rollback rehearsal, and human UAT still need evidence.
