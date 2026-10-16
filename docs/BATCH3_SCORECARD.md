# Batch 3 scorecard - CI, docs truth, golden seed, audit, go/no-go

Date: 2026-10-16. Evidence is from the recorded local commands below. The GitHub Actions workflow was not run remotely.

| Finding | Before | After | Test / evidence | Commit |
|---|---|---|---|---|
| 3.1 CI (REV-021) | The workflow had backend mock/PG, frontend tests/build, i18n check, and Playwright, but omitted production npm audits, `lint:api`, and the root build; PG service used the Alpine tag. | Workflow uses the requested `postgres:16` service; adds backend/frontend production audits, frontend API guard, and root build. Playwright uses the existing `@playwright/test` dependency and `npx playwright install --with-deps chromium`; browser execution stays in a dedicated E2E job and out of the production image. One-line package justification: `@playwright/test` already exists as a frontend dev dependency, so no package was added. | Local: audits 0 vulnerabilities; backend mock 65/65 suites, 1,089/1,089; PG `-All` 84/84 suites, 1,933/1,933, 130 migrations; frontend 37/37 suites, 323/323; E2E 74 passed; `i18n:check`, `lint:api`, `lint:guards`, root build PASS. Remote Actions NOT VERIFIED. Workflow `npm ci`, `i18n:parity`, explicit browser-install command, and second migrate invocation were not run locally. | `8c0e3b5`, `59df19f`, `52cf9df` |
| 3.2 Docs truth (REV-022/R9) | `STAGING.md` said 103 migrations and 33 roles; `GO_NOGO.md` cited 126 migrations, stale 68/635 PG counts, and said pilot smoke/full restore were not run. UAT did not enumerate all seed keys; PowerShell-only runbook examples omitted the backup-confirmation requirement for smoke. | Runbook now cites 130 migrations, pairs cmd.exe forms with PowerShell commands, records the required smoke flag and how to set it, and lists 38 actual keys from the seeder. GO/NO-GO rows use current command/file evidence with explicit status and owner. Historical 2026-10-13 smoke and local restore results are correctly cited; Batch 3 did not rerun them. | Evidence: `backend/src/scripts/run-all-migrations.js`; fresh PG output in `docs/CLOSEOUT_LOG.md`; seed key definitions in `backend/src/scripts/seed-staging.js`; historical smoke and restore output in the same log. `git diff --check` PASS. | `52962e7` |
| 3.3 Golden seed for pilot | Golden seed required credentials in process environment and allowed `APP_ENV=test`; there was no guarded `.env.docker` loading for direct local-pilot invocation. | Script loads root `.env.docker` at invocation, requires `APP_ENV=staging`, loopback DB host, a staging/test DB-name segment, valid port, and credentials. The `-Reconcile` PG gate proves non-staging refusal before using the throwaway DB, then seeds and reconciles. Pilot was not touched. | Focused guard: 1/1 suite, 9/9 tests. Throwaway PG: 130 migrations; refusal proven; 96 units, 1 BOQ, 122.4000 m3; reconciliation 16/16 with zero violations; container removed, exit 0. | `43ae0df` |
| 3.4 Frontend npm audit | Production dependency audit status had not been recorded for this batch. | Frontend production dependency audit has zero vulnerabilities; no package updates were required. Backend comparison audit also returned zero. | `npm audit --omit=dev --json`: frontend critical 0, high 0, moderate 0, low 0, info 0; no vulnerable package names. Backend critical 0, high 0, moderate 0, low 0, info 0; no vulnerable package names. | `52962e7` |
| 3.5 GO/NO-GO table | Evidence/status rows included stale counts and a stale statement that local smoke and restore work had not run. | Seven criteria state `met`, `not met`, or `pending-human`, cite evidence, and name the owner. Production remains NO-GO; UAT, finance approval, and native Arabic review remain human gates. | `docs/GO_NOGO.md`; source records in `docs/CLOSEOUT_LOG.md`, `docs/UAT_PILOT.md`, and the referenced review/status files. | `52962e7` |

## NOT DONE / NOT VERIFIED

- GitHub Actions remote status is NOT VERIFIED. The workflow was not executed in this environment.
- CI's `npm ci`, `i18n:parity`, explicit Chromium browser-install command, and second migration invocation were not run locally. The local Playwright suite did run with the already-installed browser.
- Batch 3 did not rerun the pilot smoke or staging backup rehearsal. Historical local results are cited from 2026-10-13; the running pilot was not restarted or reseeded.
- Production remains NO-GO pending human UAT, finance sign-off, native Arabic review, and independent security finding dispositions.

## Decisions waiting

- Independent security reviewer and system owner: disposition the open Critical/High findings listed in the review/preparation documents.
- Finance owner: sign off account mappings and UAT evidence.
- Native Arabic reviewer: review Egyptian construction terminology and RTL/product output.
- Finance, procurement, site, and owner representatives: complete and sign UAT.
- CI owner: observe a green remote GitHub Actions run and confirm branch protection/required-check configuration outside repository evidence.
