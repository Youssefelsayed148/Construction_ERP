# Launch: what remains (internal users)

Written 2026-10-28 on `closeout/batch-a-to-6` (HEAD `ab16309` when written). This replaces the "open Majors" list in
`docs/LAUNCH_READINESS.md` and `docs/GO_NOGO.md` as the working to-do list. Those two documents predate the
session-G fixes and cite stale numbers (for example "75 of 99 status columns unconstrained"; 70 CHECK constraints
now exist). Refresh them last (item 12).

**Scope:** internal users only. External portals (client, supplier, subcontractor, consultant): portal UAT, portal
acceptance tests and external-role items are deliberately deferred and not listed here.

## Where things stand

- **Blockers: none known.** No open item below is a confirmed product defect. What stands between us and launch is
  evidence (CI, real Postgres, pilot rehearsal), owner decisions, production setup and sign-offs.
- **Caveat:** the full real-Postgres suite is the step most likely to surface hidden bugs. Earlier runs of
  never-executed tests found latent defects, so budget time for fixes after items 2-3.
- **Verified 2026-10-28 on this machine:** backend `lint:guards`, frontend `i18n:check` / `i18n:parity` / `lint:api`,
  backend mock jest (all green except the Windows-only PDF suite, see "Local environment limits"), frontend
  tests 51/51 suites (493 tests), backend `npm audit --omit=dev` = 0 vulnerabilities.
- **Not verified here:** remote CI, real PostgreSQL 16 runs (no `psql` locally), the pilot Docker stack.
- Session G's migrations 0075-0083 (status CHECK constraints) were proven only on PGlite (in-memory Postgres 18),
  not on Postgres 16.

## A. Evidence still to produce

### 1. Green remote CI run
- **What:** one passing GitHub Actions run of `.github/workflows/ci.yml` on `closeout/batch-a-to-6`. Jobs: mock tests,
  PG16 tests, frontend, Playwright, API guard, i18n, root build.
- **Why it matters:** every other "green" claim is local. This is the only independent proof.
- **How:** open the repository's Actions tab. The push of `ab16309` may already have triggered a run. If a job
  fails, fix the cause and push again. (`gh` CLI is not installed on this machine.)
- **Done when:** all jobs green on the branch's latest commit, recorded in `docs/CLOSEOUT_LOG.md`.

### 2. Full real-PostgreSQL test run
- **What:** `npm --prefix backend run test:pg` against a migrated throwaway PostgreSQL 16 database (about 100
  `.pg.test.js` suites: concurrency, constraints, contract, permission matrix, golden journey, nav matrix).
- **Why it matters:** includes the suites that exercise locks, constraints and transactions, which mocks cannot.
- **How:** set `DB_*`, `JWT_SECRET`, `TEST_PG=1` in the process environment (never against a database whose name
  contains "prod"; the harness refuses). Docker 28 is installed here, so a throwaway Postgres container works.
- **Done when:** full suite passes; any failures triaged and fixed, one commit per slice.

### 3. Pilot / staging rehearsal
- **What:** bring up the Docker Compose pilot stack and run, in order:
  ```powershell
  $env:COMPOSE_PROJECT_NAME = 'erp-closeout-pilot-20261013'
  docker compose --project-name $env:COMPOSE_PROJECT_NAME --env-file .env.docker up --build -d
  npm --prefix backend run seed:staging
  npm --prefix backend run seed:pilot-data
  npm --prefix backend run smoke:staging -- --base-url=http://127.0.0.1:8090
  npm --prefix backend run backup:rehearse
  ```
  The smoke needs a verified restorable backup first, then `RECONCILIATION_BACKUP_CONFIRMED=true` for that process only.
- **Also:** run `node backend/src/scripts/reconcile-database.js` (18 checks) and the data-cleaning report on a
  restored copy shaped like real data, then run `backend/scripts/validate-status-constraints.sql` (70 VALIDATE
  lines) on that same copy so the NOT VALID status constraints become fully validated.
- **Why it matters:** so far reconciliation and restore were only ever run on empty/fixture throwaway databases.
- **Done when:** smoke passes, restore row counts match, reconciliation clean, all 70 validations green, results
  recorded.

### 4. Golden-value figures
- **What:** `docs/GOLDEN_VALUES.md` is still provisional. `golden-journey.pg.test.js` proves the formulas
  (retention, advance recovery, EAC) on its own numbers, not the document's exact BOQ/contract figures.
- **Depends on:** your decision D1 below. After approval, build the value-exact fixture and assert it in CI.

### 5. Internal UAT
- **What:** finance, procurement, site and owner run `docs/UAT_PILOT.md` (procure-to-pay) and the internal sections of
  `docs/UAT_EXECUTION_KIT.md` (owner, procurement, site, finance, handover/warranty) against the pilot stack from
  item 3, and sign the tables.
- **Done when:** sign-off tables hold real results and names; defects found are fixed or consciously waived.

### 6. Security sign-off
- **What:** an independent reviewer works through `docs/SECURITY_REVIEW_PREP.md` and signs. Backend dependency audit
  is clean; run `npm audit --omit=dev` in `frontend/` and triage what it lists (not triaged yet).
- **Done when:** no open Critical/High, or each is downgraded with evidence or accepted by you in writing.

## B. Decisions only you can make

| # | Decision | Why it matters | Where |
|---|---|---|---|
| D1 | Approve golden-value assumptions: retention %, advance %, caps | Unblocks item 4 | `docs/GOLDEN_VALUES.md` |
| D2 | Production approval limits per role and action | Demo limits are placeholders | `docs/APPROVAL_LIMITS_DECISION_SHEET.md` |
| D3 | `finance_manager` and `project_manager` run on blanket `(*,*)` grants, unlike every other canonical role. Move them to granular per-module grants, or accept for launch | Least-privilege on the two most powerful operational roles | `docs/CLOSEOUT_GAPS.md` (Phase 5.1) |
| D4 | Notifications: is email (SMTP) enough for launch? Push, SMS and WhatsApp are console-only stubs | If more channels are required this becomes build work | `docs/STAGING.md` |
| D5 | Arabic: is Arabic in launch scope? L9 (RTL logical CSS), L10 (automated EN/AR E2E) and L11 (native review) were deferred on 2026-10-14. Confirm deferral or pull back in | Decides whether item 9 is required | `docs/GO_NOGO.md` criterion 5 |
| D6 | Duplicate `payment_certificates` vs `sub_payment_certificates` surfaces: no lossless mapping exists. Keep both for launch, or schedule consolidation | Avoids double-entry confusion; retirement is post-launch work | `docs/CERTIFICATE_SURFACE_RETIREMENT.md` |
| D7 | Merge timing for `main` (see item 12) | Merge only after UAT per your earlier decision | memory / `docs/CLOSEOUT_PLAN_F_AND_T.md` |

## C. Production setup (operator work)

- Real `JWT_SECRET`, database credentials and secrets handling; never reuse demo or staging values.
- `TRUST_PROXY` set to match the real proxy; `CORS_EXTRA_ORIGINS` validated.
- SMTP: `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / password. Live sending only happens when
  `NOTIFICATION_LIVE_SEND_ENABLED=true` (off by default, by design). Send a test mail before cutover.
- Backups on a schedule, a rehearsed restore (item 3), and monitoring/alerting per `docs/MONITORING.md` and
  `docs/OPERATOR_RUNBOOK.md`. Rollback is restore-from-backup (migrations are forward-only, no down scripts).
- Take a final verified backup immediately before cutover.
- Arabic (if in scope): Arabic PDFs use headless Chromium with bundled fonts; confirm Chromium is available in the
  production image.

## D. Smaller items (not launch-gating)

Tracked in `docs/POST_LAUNCH_BACKLOG.md`. Notable ones:
- `alert()` used for error display in about 20 page files instead of the shared error component.
- No per-route frontend guard (the API already blocks the data; this is cosmetic).
- Legacy RFI/submittal single-answer fields return with `Deprecation`/`Sunset` headers; sunset date 2027-01-26.
  `ProjectDocuments.js` must move to the revisioned endpoints before then.
- Legacy approvals dual-write retirement needs a two-week real-data parity hold first.
- No per-project feature-flag/rollout mechanism beyond environment toggles.
- Open Phase 4 test gaps: Playwright journeys against a real backend, frontend component tests beyond the current
  51 suites. (Portal acceptance tests are in the deferred external-user scope.)

## E. Local environment limits (not product defects)

- `f4-pdf-export` fails on this Windows machine: the native `canvas.node` module is not a valid Win32 application.
  Run it in CI or reinstall dependencies on this machine.
- `external-api` scrypt tests can time out under full-suite load; they pass when run alone.
- No `psql` locally; use Docker for a throwaway Postgres.

## F. Final steps, in order

1. Complete items 1-3 and fix anything they expose.
2. Make decisions D1-D6; then build the value-exact golden fixture (item 4) and apply any approval-limit changes.
3. Run internal UAT (item 5) and security sign-off (item 6).
4. Complete production setup (section C).
5. Refresh `docs/GO_NOGO.md` and `docs/LAUNCH_READINESS.md` with the fresh evidence and a new verdict.
6. Merge `closeout/batch-a-to-6` into `main` (a clean fast-forward was previously confirmed by dry run), then do the
   planned branch cleanup. Check first that the four extra branches noted in the project memory have been merged or
   archived.
7. Take the final backup and cut over.
