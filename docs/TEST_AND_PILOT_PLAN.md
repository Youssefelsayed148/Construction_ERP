# Test scenarios and pilot plan (internal users)

Written 2026-10-28. Companion to `docs/LAUNCH_REMAINING.md`. Order: automated gates, then the system run locally,
then scenario testing, then a VPS pilot, then real use. External portals are out of scope for now.

Rule for every phase: do not move to the next phase until the exit criteria of the current one are met and the
results are written down (date, commit, what was run, pass/fail). Defects use the template in
`docs/UAT_EXECUTION_KIT.md`; severity follows its rubric.

## Phase 0 - Automated gates (no people needed)

| Gate | Command | Exit criteria |
|---|---|---|
| Backend mock tests | `cd backend && npx jest --silent` | green (PDF suite excepted on Windows) |
| Real-PG suite | `TEST_PG=1 DB_HOST=127.0.0.1 DB_PORT=5544 DB_NAME=erp_closeout_test DB_USER=postgres DB_PASSWORD=pgtest JWT_SECRET=<test> npm run test:pg` against a throwaway `postgres:16-alpine` container | all suites pass |
| Frontend tests | `cd frontend && CI=true npx react-scripts test --watchAll=false` | green |
| Static guards | `lint:guards`, `i18n:check`, `i18n:parity`, `lint:api` | all ok |
| Remote CI | Actions tab, branch `closeout/batch-a-to-6` | all jobs green |
| Migrations | run twice on a fresh DB | second run applies 0; status constraints validate (`backend/scripts/validate-status-constraints.sql`) |

## Phase 1 - Run the whole system locally

1. Use a clean database (not the pilot container's data): fresh Postgres 16, run all migrations.
2. Seed: `seed:staging`, then `seed:pilot-data` (or `seed:golden-demo` for the golden fixture).
3. Start backend and frontend; log in as each internal role from the seeded set.
4. Walk the smoke checklist below with a browser, English and Arabic, desktop and phone width.
5. Run `smoke:staging` and `reconcile-database.js`; both must be clean.

Exit: every smoke scenario passes in both languages; no console errors on the main screens; reconciliation clean.

## Phase 2 - Scenario tests

Run these as the named role. Each scenario lists the expected result. Record pass/fail per row.

### A. Access and security
| # | Scenario | Expected |
|---|---|---|
| A1 | Log in with correct and wrong password; repeat wrong password past the lockout limit | wrong login gives a generic error; lockout engages; no disclosure of whether the account exists or is disabled |
| A2 | Each role opens its menu | only permitted modules appear |
| A3 | A role opens a URL it has no permission for | clean 403 screen, no data shown |
| A4 | Project-scoped user opens another project's record by changing the id in the URL | denied |
| A5 | Disabled user's existing session / token | rejected |
| A6 | Owner/admin changes a role or user | takes effect; audit entry exists |
| A7 | Try double-clicking Submit on every create form | one record, not two |

### B. Project to handover (golden path, owner/PM/site/finance/procurement)
| # | Scenario | Expected |
|---|---|---|
| B1 | Create client, project, contract, BOQ with sections and items | totals add up; contract value matches BOQ |
| B2 | Purchase request, RFQ, award, PO | numbering sequential, no gaps or duplicates |
| B3 | Approval chain on the PO using the approval limits | goes to the right approver; below-limit auto path correct; rejection returns it |
| B4 | Goods receipt against the PO (full, then partial, then over-delivery attempt) | stock increases by exactly the received quantity; over-delivery refused |
| B5 | Supplier invoice, three-way match, payment | AP subledger equals GL payable |
| B6 | Material issue to site, site daily report, progress update | stock decreases; cost posts to the project; progress % moves |
| B7 | Client progress invoice with retention and advance recovery | gross, retention and net match hand calculation; AR subledger equals GL receivable |
| B8 | Receipt of payment, retention release | balances clear; no negative stock or balance anywhere |
| B9 | Variation order and EAC | contract and forecast update after approval only |
| B10 | Handover and warranty record | statuses move in the allowed order only |

### C. Money correctness (finance)
| # | Scenario | Expected |
|---|---|---|
| C1 | Draft invoice listed repeatedly | never turns overdue or changes without an action; payment against it refused |
| C2 | Pay an invoice twice / pay more than the balance | second attempt refused with a clear message |
| C3 | Supplier return after receipt | stock and payable reversed |
| C4 | Run reconciliation after the whole of B | all 18 checks clean |
| C5 | Compare invoice, receipt and GL figures to a hand-calculated example | exact match (this becomes the golden test once D1 is approved) |

### D. Operations modules
| # | Scenario | Expected |
|---|---|---|
| D1 | QA/QC: inspection, NCR raised and closed | transitions in allowed order only |
| D2 | HSE: incident, action, closure | assigned person sees it; notification created |
| D3 | Documents: upload, revise, RFI and submittal flow | revision history kept; wrong file types and oversize files refused |
| D4 | HR and payroll: employee, attendance, payroll run | statuses valid; approval required before payment |
| D5 | Assets and maintenance: asset, reminder, work order | reminders fire; invalid status refused |
| D6 | Admin screens: roles/permission matrix, workflow-template editor, notification rules, cost codes, contracts | edits save; an edited workflow template changes in-flight instances as the UI warns |
| D7 | Reports and CSV export | totals match screens; formulas in cells are neutralised |

### E. Resilience and data safety
| # | Scenario | Expected |
|---|---|---|
| E1 | Two users act on the same record at once (approve, stock issue) | one succeeds, the other gets a clear conflict message |
| E2 | Restart backend mid-session | users re-authenticate cleanly; no half-written records |
| E3 | Backup, restore into a second database | row counts identical; reconciliation clean |
| E4 | Run migrations on the restored copy | applies 0 or only new ones, no errors |
| E5 | Kill the database briefly | friendly error pages, recovery without restart |

### F. Language and devices
| # | Scenario | Expected |
|---|---|---|
| F1 | Switch to Arabic on every main screen | no English-only strings, no raw keys, dates and numbers localised |
| F2 | Arabic PDFs (invoice, PO, reports) | render with correct shaping and fonts |
| F3 | Phone-width layout of daily-use screens (site report, approvals) | usable without horizontal scroll |

Exit: no open Blocker or Major; each remaining Minor is logged in `docs/POST_LAUNCH_BACKLOG.md`.

## Phase 3 - Deploy on the VPS as a pilot

Treat the first VPS deployment as a pilot, not production. Things to settle before starting (need your input): VPS
OS and size, domain name, who holds server access, where backups are stored, and who receives alerts.

1. **Server baseline:** non-root user, SSH keys only, firewall open on 22/80/443 only, automatic security updates,
   Docker and Docker Compose installed.
2. **Secrets:** generate fresh `JWT_SECRET`, DB password and any API keys; store in `.env` files that are not in git.
   Never reuse demo or staging values.
3. **Deploy:** pull the tagged commit, `docker compose --env-file <prod env> up --build -d`, run migrations once.
4. **HTTPS:** reverse proxy (Caddy or Nginx) with a real certificate; set `TRUST_PROXY` to match; restrict
   `CORS_EXTRA_ORIGINS` to the real domain. Database port must not be reachable from outside.
5. **Create real accounts:** one owner/admin first, change the default password immediately, then create users per
   role. No seeded demo logins left enabled.
6. **Email:** SMTP settings plus `NOTIFICATION_LIVE_SEND_ENABLED=true`; send a test message.
7. **Backups:** schedule nightly database dumps and uploaded files to storage off the server; do a restore drill
   onto a second database and record it. Take a manual backup before each deployment.
8. **Monitoring:** health endpoint check, disk space, container restarts, backup success; follow
   `docs/MONITORING.md`.
9. **Smoke on the VPS:** `smoke:staging` against the real URL, then repeat Phase 2 scenarios A, B (shortened), E3
   and F1 on the deployed system.

Exit: HTTPS works, restore drill recorded, smoke green, no default credentials, owner has the runbook.

## Phase 4 - Pilot with real users and real work

1. **Scope the pilot:** one live project and a small group (owner, one each of procurement, site, finance). Keep the
   old way of working running in parallel for the first two to four weeks.
2. **Load real data deliberately:** import master data (clients, suppliers, items, cost codes) and the pilot project
   BOQ first; run reconciliation and the data-cleaning report on it before anyone transacts.
3. **Train:** 1-hour session per role using `docs/TRAINING_NOTES.md` and `docs/ADMIN_GUIDE.md`; give each person the
   UAT script for their role as a first-week task.
4. **Run UAT on the pilot** (`docs/UAT_PILOT.md`, `docs/UAT_EXECUTION_KIT.md`, internal roles) and collect
   signatures.
5. **Weekly rhythm:** reconciliation run, backup check, defect triage (Blocker same day, Major within the week), a
   short review with the pilot users.
6. **Watch list:** wrong totals, duplicate records, approvals stuck, slow screens, users working around the system,
   Arabic text problems.
7. **Rules:** every fix goes through the Phase 0 gates before deployment; take a backup before each deployment; no
   direct database edits except through a recorded, reviewed script.

Exit to full launch (all must be true): at least two clean weekly reconciliations, no open Blocker/Major, UAT signed
by finance, procurement, site and owner, a successful restore drill on the pilot server, and your explicit go decision.

## Phase 5 - Go-live

1. Refresh `docs/GO_NOGO.md` and `docs/LAUNCH_READINESS.md` with the evidence and the new verdict.
2. Merge `closeout/batch-a-to-6` into `main` and tag the release.
3. Final verified backup, then cut over remaining projects in waves, not all at once.
4. Keep the daily and weekly checks from Phase 4 for the first month.

## Rollback

Migrations are forward-only. Rolling back means restoring the last verified backup and redeploying the previous
tag. That is why every deployment starts with a backup and why the restore drill is a hard exit criterion.
