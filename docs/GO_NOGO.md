# Production go/no-go

**Decision: NO-GO.** No production deployment or real-data cutover is authorized
by this report. Evidence below is local, disposable, and incomplete where marked.

| # | GO criterion | Status | Evidence | Remaining action and owner |
|---:|---|---|---|---|
| 1 | Zero open Critical/High findings from the three audits | **pending-human** | `docs/CODEX_AUDIT_REPORT.md`; `docs/SECURITY_REVIEW_PREP.md` | Independent security reviewer must resolve, downgrade with evidence, or accept each open finding. Owner: independent reviewer + system owner. |
| 2 | Golden E2E, concurrency, and permission-matrix suites green in CI on real PostgreSQL | **not met** | Final local PG16 suite: 68 suites / 627 tests; concurrency and policy-matrix pass in that suite. Phase 9 fixture is partial in `backend/src/scripts/__tests__/golden-chain.pg.test.js`; no full tender-to-warranty UI/API journey and no remote CI result. | Complete the full API and Playwright journeys, wire them as required CI checks, and confirm them on CI after billing is restored. Owner: implementation + CI owner. |
| 3 | Reconciliation clean on migrated data | **not met** | `backend/src/scripts/reconcile-database.js` covers the listed invariants; six disposable-PG seeded-defect cases verify payment amount, invoice balance, and project-scope allocations, retention and advance balance, and stock projection checks; previous disposable fixture runs showed nonzero test residue. A fresh disposable PostgreSQL 16 database with 126 migrations and the golden demo seed returned 0 violations from all 16 checks; data-cleaning report returned []. This is not a restored pilot/real-data copy, so that acceptance remains open. | Run backup rehearsal on an approved local pilot, retain the restore report, run reconciliation and data-cleaning report on the restored copy, fix and re-run findings. Owner: environment operator + implementation. |
| 4 | Demo project cost, progress, and finance match golden values | **not met** | `docs/GOLDEN_VALUES.md` contains arithmetic and a verified C35 fixture slice; commercial assumptions are provisional and not asserted end-to-end. | Finance and construction owners approve the fixture assumptions; finish seed and full golden assertions; record runtime outputs. Owner: finance + construction + implementation. |
| 5 | Offline/mobile checks and Phase 10 localization exit, including Arabic PDFs | **pending-human** | Phase 7 mobile route sweep 36/36 and offline report journey are recorded in `docs/CLOSEOUT_LOG.md`. IBM Plex Arabic local asset and Lighthouse PWA evidence are still absent; Arabic PDF visual inspection and native terminology review are not complete. | Obtain a properly licensed local Arabic font; run Lighthouse and export review; native Arabic construction reviewer signs `docs/ARABIC_REVIEW_PACK.md`. Owner: owner + Arabic reviewer. |
| 6 | Restore drill and rollback runbook rehearsed | **pending-human** | Earlier local staging backup rehearsal is recorded in `docs/CLOSEOUT_LOG.md`; no production-environment restore/rollback rehearsal is claimed. | Run and sign the documented restore/rollback rehearsal on the approved pilot environment; retain before/after counts and restore evidence. Owner: environment operator + owner. |
| 7 | Finance, procurement, site, and owner UAT signed | **pending-human** | `docs/UAT_PILOT.md` contains role scripts and sign-off table; no human UAT results are recorded. | Run scoped UAT with each role, close or accept defects, and collect signatures. Owner: finance, procurement, site, and owner. |

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

These commands describe the intended operator sequence. In this continuation the
new metrics and Phase 9 fixture tests were run on fresh disposable Docker PG16
instances, but the pilot smoke and full restore rehearsal were **not run**.

## Decision

Do not proceed to production. The independent security review, full golden journey,
restored-copy reconciliation, owner-approved golden values, Arabic PDF/font review,
production-environment rollback rehearsal, and human UAT still need evidence.
