# Independent review — ConERP, branch `closeout/batch-a-to-6`, HEAD `43754e5`

Review date: 2026-10-14. Reviewer: independent (did not build the system). Method: every "done / passed" statement in
STATE.md, docs/*.md and commit messages was treated as an unverified claim. "Evidence" below is output the reviewer produced in
this session against a read-only git worktree (`43754e5`, detached) and a throwaway PostgreSQL 16 container. Nothing was committed, pushed or deployed;
no `.env*`, `.staging-users.json` or credential file was opened; no external network call was made.

> **Status of this report.** Stages 0–6 were executed. Where a stage could not be completed it is listed in §5 (UNVERIFIED) with the blocker.
> The Critical/High findings in §4 were handed to a fresh sub-agent for independent re-verification; the outcome is recorded in §4.0.

---

## 1. Verdict

**NO-GO for UAT-with-real-data and for production.** This agrees with `docs/GO_NOGO.md` (itself NO-GO) but for stronger reasons than that document records:

| # | GO criterion (docs/GO_NOGO.md, plan §Phase 11) | Reviewer verdict | Why |
|---|---|---|---|
| 1 | Zero open Critical/High findings | **NOT MET** | 1 Critical + 5 High reproduced (REV-001…REV-006): cross-project write bypass, company-wide financial aggregates to project-scoped users, mutations with no audit row, unindexed ledger-balance trigger, O(N) finance GET endpoints, login capacity. |
| 2 | Golden E2E, concurrency, permission-matrix green on real PG | **PARTIAL** | PG suite green (68/635, reproduced). But the "golden" chain covers procure-to-pay only (`golden-chain.pg.test.js`, 3 tests); there is no tender→contract, site, consultant, variation, valuation, handover or warranty golden journey, and no tender module exists at all (REV-024). The permission-matrix tests did not catch REV-001. |
| 3 | Reconciliation clean on migrated data | **NOT MET / UNPROVEN** | 16 checks exist and are clean on a fresh golden-seeded DB (reproduced). On a DB the PG suite has touched, 8 of 16 checks fail (test-fixture residue, as GO_NOGO admits). No restored real/pilot copy exists. |
| 4 | Demo project matches golden values | **NOT MET** | Only the C35 slice is asserted; commercial assumptions are provisional (docs/DECISIONS.md). |
| 5 | Offline/mobile + Phase 10 localization + Arabic PDFs | **NOT MET** | Offline queue and 74 Playwright passes reproduced. Arabic mode still shows English on dashboard, reports, status enums and server-generated titles (REV-020); 492 icon-only buttons have no accessible name (REV-019); the chosen PDF renderer (Chromium) is not packaged in the backend image (REV-023). |
| 6 | Restore drill + rollback runbook | **PARTIAL** | Reviewer's own dump/restore of a 2.6 M-row database reproduced (§6.4). Migrations are forward-only with no rollback runbook. |
| 7 | UAT signed | **NOT MET** | No human UAT recorded (correct per GO_NOGO). |

**What would flip this to a conditional GO for UAT on non-production data:** fix REV-001, REV-002, REV-003, REV-004, REV-005, REV-006 (Batches R1–R4 in §7, roughly 2–3 weeks for one engineer) and re-run the PG suite plus the new regression tests listed there.

**Strengths worth recording (reproduced, not claimed):** typed JWTs reject `alg:none`, expired, wrong-`tv`, wrong-kind and base-secret-signed tokens; record-by-id access across 14 module families returned 403/404 for a project-scoped user; webhook SSRF guard blocked 13 of 14 hostile targets (IPv4/IPv6/mapped/octal/DNS-rebind); upload validation (extension allow-list + magic bytes, traversal stripped) held against 7 hostile files; document numbering held under 60 parallel invoice creations; daily-report idempotency held under 12 parallel same-key requests; migrations are repeatable and checksummed; backup/restore round-trips exactly.

---

## 2. Findings by severity (summary)

| Severity | Count | IDs |
|---|---:|---|
| Critical | 1 | REV-001 |
| High | 5 | REV-002 … REV-006 |
| Medium | 14 | REV-007 … REV-020 |
| Low | 4 | REV-021 … REV-024 (REV-024 is a scope gap) |
| Info | 4 | INF-1 … INF-4 |
| UNVERIFIED (not counted) | 9 | §5 |

(Counts are before sub-agent re-verification; see §4.0 for any change.)

### Top 10 issues
1. **REV-001 (Critical)** — a project-scoped user can create invoices, expenses and legal documents in *another project* by sending `?project_id=<own>` with a body `project_id=<foreign>`.
2. **REV-002 (High)** — `/api/finance/summary`, `/api/dashboard/overview`, `/api/finance-ledger/cash-flow` and 4 more return company-wide money to project-scoped roles; `?project_id=` is ignored.
3. **REV-003 (High)** — at least 7 mutation endpoints in 4 modules commit with **no audit row** (91 handlers by static scan).
4. **REV-004 (High)** — `journal_entry_lines` has no index on `journal_entry_id`, and a per-row deferred balance trigger scans the table for every line.
5. **REV-005 (High)** — `GET /api/finance-ledger/cash-flow` took 97.6 s and `/company-dashboard` did not answer in 304 s at 150 k invoices; those GETs also write 75 k rows and race on `COUNT(*)+1` numbering (15/15 concurrent pairs → 409).
6. **REV-006 (High)** — login throughput is 4.6/s per process (pure-JS bcrypt); 30 concurrent logins stall the event loop for >3 s and 94/211 logins failed at c=200.
7. **REV-007 (Medium)** — 4 GET endpoints always return 500 (route shadowing, bad SQL); one backs the QHSE calibration tab.
8. **REV-009 (Medium)** — uploaded project documents/photos are unreadable (404) by 36 of 48 roles, including Document Controller.
9. **REV-012 (Medium)** — a database password is committed in five tracked files since the initial commit.
10. **REV-017 (Medium)** — no screen at all for organizations, delegations, approval limits, inventory documents, variations, SLA admin; 213 of 699 internal routes have no frontend caller.

---

## 3. Stage 0 — baseline and truth check

### 0.1 Tree state
`git status`: only `?? docs/CODEX_AUDIT_REPORT.md` (as expected). Branch `closeout/batch-a-to-6`, HEAD `43754e534124adc70a5b58658f6fe76d4c19a5fd`. Review worktree: `…/scratchpad/review` (detached `43754e5`); `node_modules` junctioned read-only from the main checkout.

### 0.2 Inventory and migration reconciliation
* Backend non-test source ≈ 39,097 LOC; frontend JS ≈ 22,268 LOC; 54 route files; 65 services; 1,051 HTTP routes (700 internal, 351 `/api/v1`, 2 MCP); 249 tables.
* **Where the 126 migrations live** (reproduced): `backend/src/scripts/run-all-migrations.js` holds a frozen list of **63 legacy JS migrations** (`setupDb.js` + `migrate-N.js` + `*-migration.js`), and `backend/src/migrations/` holds **63 versioned SQL files** (`0001`…`0064`, with `0030` absent). `database/migrations/` is empty.
  `SELECT kind,count(*) FROM schema_migrations GROUP BY 1` → `legacy 63 / versioned 63`. 63 + 63 = 126.
* Fresh migrate: `all migrations completed (126 applied, 0 already applied)` in 12 s; second run `0 applied, 126 already applied` (idempotent); `--dry-run` lists the versioned files. 0 invalid indexes; 0 NOT VALID constraints of 1,185; 0 failed ledger rows; 0 tables without a primary key.
* Committed-artifact check by name only: `git log --all --diff-filter=A --name-only` shows **no** `.env`, `.env.docker`, `.staging-users.json`, `db_dump/`, `*.log` or `uploads/` ever added (all git-ignored). `scratch_pdf.txt` (58 KB spec text), `pg_proxy.js`, five `.bat/.ps1` launchers with Windows paths **are** tracked (see REV-012, INF-3).

### 0.3 Claims vs reality (each gate re-run by the reviewer)

| Claim (source) | Reviewer result | Status |
|---|---|---|
| Backend mock 54 suites / 1,013 tests (docs/i18n/STATUS.md, STATE.md) | `Test Suites: 54 passed, 54 total / Tests: 1013 passed` | **VERIFIED** |
| Real PG 68 suites / 635 tests | `Test Suites: 68 passed / Tests: 635 passed` against a fresh DB with 126 migrations (`TEST_PG=1 jest --config jest.pg.config.js --runInBand`) | **VERIFIED** |
| Frontend 31 suites / 128 tests | `Test Suites: 31 passed / Tests: 128 passed` | **VERIFIED** |
| Playwright 74 passed / 86 skipped | `74 passed`, `86 skipped`, 160 discovered, 0 failed. Skips: 44 structural viewport duplicates, 32 on-demand screenshot cases, 10 gated real-backend/pilot cases. Re-ran the gated `journeys-backend.spec.js` against the throwaway stack: **6/6 pass** (assertions are trivial: page body length > 50 and `html[dir]`). | **VERIFIED** (weak real-backend coverage, see INF-2) |
| `lint:guards` passes | `lint-guards: ok` | **VERIFIED** (guard blind spots: REV-003, REV-005) |
| `i18n:check`, `i18n:parity` | `i18n:check ok`; `i18n parity ok: 35 namespaces, 1283 English keys` | **VERIFIED** |
| Production build | compiled with `CI=false` and with `CI=true` (CI mode does not fail on warnings); main bundle 1.15 MB raw, 73 chunks | **VERIFIED** |
| i18n inventory 1127 / 59 / 2 / 6 / 68 / 304 / 479 | identical numbers from `npm run i18n:inventory` | **VERIFIED** |
| "68 prompts remain" (docs/i18n/STATUS.md; the brief) | the 68 is a regex for `prompt\|confirm\|alert`. Actual: `prompt(` **0**, `window.confirm` **1** (`pages/UnitsSales.js:202`), `alert(` **66** | **PARTLY CONTRADICTED** (prompt() is gone; confirm/alert remain) |
| 16 reconciliation checks | 16 checks present. Fresh golden-seeded DB: all 0. DB touched by PG suite: 8 FAIL (workflows 2, stock projection 8, project costs 7, cost sources 2, AP/AR 6, PO quantities 21, approvals 2) | **VERIFIED** (+ residue as GO_NOGO admits) |
| data-cleaning-report empty | `All constraints are validated. Nothing to clean.` | **VERIFIED** |
| STATE.md "A4 converted the audited state-changing route families to transaction-bound audit writes" | true for the converted families; **not** true for boq, hr, hse, schedule, locations, qhse, subcontractors … (REV-003) | **PARTLY CONTRADICTED** |
| STATE/GO_NOGO "Zero Critical/High" prerequisite | 1 Critical + 5 High reproduced | **CONTRADICTED** |
| STATE.md "Highest migration is 0049; next is 0050" | highest is `0064` | **CONTRADICTED** (stale) |
| docs/MIGRATIONS.md "0062 is the highest source migration" | `0064_schedule_activity_bac.sql` | **CONTRADICTED** (stale) |
| docs/IMPLEMENTATION_STATUS.md "5.6–5.8 open, 7–11 open, Batch B onward not complete" | contradicted by commits and STATE (Phases 7, 9, 10, 11 slices committed) | **CONTRADICTED** (stale) |
| LOAD_BASELINES "smoke floors" | table is 5 calls per level at c≤8 on a thin DB: valid only as a smoke floor | **VERIFIED as stated; not capacity evidence** |
| Remote CI has run | cannot be checked offline | **NOT RUN** |
| Pilot smoke on Compose stack | script reads prohibited files; not attempted | **NOT RUN** |
| `npm audit` (backend, frontend) | requires registry network; prohibited | **NOT RUN** |

### 0.4 Contradictions between STATE.md / CLOSEOUT_PROGRESS.md / IMPLEMENTATION_STATUS.md (and which the code supports)
1. **Gate numbers** — root `STATE.md` "Current gates" table (48/969, 56/566, 17/97, Playwright 32/46) vs. the same file's later sections (53/999 … 54/1013) vs. `docs/i18n/STATUS.md` (54/1013, 68/635, 31/128, 74/86). Code supports the **newest** numbers (reproduced).
2. **Highest migration** — STATE.md 0049, docs/MIGRATIONS.md 0062, source 0064. Source wins.
3. **Where work stopped** — root STATE.md "continue Phase 5.6.4" vs docs/STATE.md "5.6.4, 5.7, 5.8.1/2 done". Commits support docs/STATE.md.
4. **Two STATE files** (`STATE.md` and `docs/STATE.md`) with different content; AGENTS.md names only the root file.
5. **IMPLEMENTATION_STATUS.md** says Phases 7–11 and 5.6–5.8 open and "Batch B onward not complete" — contradicted by `git log` (Phase 9/10/11 commits). 
6. **Plan checkboxes** — `docs/ERP_CLOSEOUT_PLAN.md` leaves `[ ]` on items the code has implemented (Phase 1.5 webhooks: SSRF/secrets/wildcards/outbox; Phase 1.6 uploads/media/auth hygiene; every Phase 4 item; Phase 7 font bundling). The plan, which AGENTS.md calls the authority, therefore under-reports progress while STATE over-reports audit coverage.
7. **`docs/audit/CURRENT_API_MATRIX.md`** (2026-09-17, ~290 routes) vs 700 internal routes now.
8. **"Phase 6 prompt() removal"** — STATE says "zero calls"; STATUS says "68 prompts". Both are literally true of different regexes (see 0.3).

---

## 4. Findings

Format: ID · severity · area · location · proof command · actual output (trimmed) · impact · fix. All proofs ran against the throwaway stack (DB `conerp_review_test` / `conerp_review_perf_test`, API on loopback ports 5055/5056) with users the reviewer created.

### 4.0 Independent re-verification
A fresh sub-agent with no knowledge of this review was given only the claims (no outputs) and the throwaway stack, and asked to reproduce REV-001…REV-006. Result: **all six CONFIRMED**, none dropped or downgraded.
* REV-001: reproduced independently on expenses, invoices, legal, **payments and boq sections** (all 201 with `project_id=1` when `?project_id=176` is added; 403 without). Confirmed the repo's `record-scoping.pg` / `policy-matrix.pg` tests contain no mismatched query/body case. At least five modules affected.
* REV-002: `finance/summary` byte-identical to owner (160,137.56 invoiced vs 2,775.00 for project 176); `?project_id=176` does not narrow it.
* REV-003: same 7 endpoints add zero audit rows; control invoice adds 1 row in each table; no lint guard flags a missing audit.
* REV-004: only `journal_entry_lines_pkey`; 7.6 ms parallel seq scan per line at 300 k rows.
* REV-005: `cash-flow` 94.2 s; commitments numbering race 409 in 6 of 6 rounds (company-dashboard not re-run).
* REV-006: library/latency confirmed (4.56 logins/s; `/api/health` 1.9–3.8 s during 30 logins). **The sub-claim "login 500s" was not reproduced at 30 concurrent** (the verifier saw 30×200); the reviewer saw 3/30 once at c=30 and 94/211 at c=200 ("Connection terminated due to connection timeout"). Treat 500s as load-dependent.

---

### REV-001 · **Critical** · AuthZ / project scope · `backend/src/services/policy.js:131-140` (`extractProjectId`) + handlers reading `req.body.project_id`
**Defect.** The policy engine derives the project to authorize from `params → query → body`. Handlers write using `req.body.project_id`. A caller who is scoped to project A sends `?project_id=A` (authorized) and a body with `project_id=B`: authorization passes on A, the row is written to B.

**Proof** (project_manager scoped to project 176; foreign project 1):
```
POST /api/expenses            body{project_id:1,...}                 => 403 Insufficient permissions   (baseline)
POST /api/expenses?project_id=176  body{project_id:1,category:'materials',amount:1}
                                                                      => 201 {"id":23,"project_id":1,...}
POST /api/invoices?project_id=176  body{project_id:1,client_id:1,amount:5,issue_date:...}
                                                                      => 201 {"invoice_number":"INV-0120","project_id":1,...}
POST /api/legal?project_id=176     body{project_id:1,title:'idor-legal'}   => 201
SELECT id,project_id,created_by FROM expenses WHERE description='idor-mismatch'  ->  23 | 1 | 264
```
The invoice and expense paths also post journal entries and cost accruals to the foreign project. 88 Joi schemas across 29 route files accept `project_id` in the body, so the class is wide (payments without invoice, boq, quantities, locations, qhse, hse … were not individually exercised).
**Why the suites missed it.** `record-scoping.pg.test.js` and `policy-matrix.pg.test.js` assert the straightforward case (foreign id in the body only, or foreign record id in the path).
**Impact.** Horizontal privilege escalation on writes: any project-bound role (including a single-project PM or accountant) can inject financial records into any other project and pollute that project's cost, budget and ledger.
**Fix.** (1) In `extractProjectId`, if more than one of params/query/body supplies a project id and they differ, return a typed 400/403 (never "first wins"). (2) Prefer one canonical source per route and have handlers read the project id **from `req.policy.project_id`** that the authorizer resolved, not from the body. (3) Add a PG regression test that, for every route with a body `project_id`, sends mismatched query/body and expects 403. (4) Add a lint guard flagging `req.body.project_id` / `value.project_id` reads outside a helper that cross-checks the authorized project.

### REV-002 · **High** · Data disclosure · `routes/finance.js` (`/summary`), `routes/dashboard.js` (`/`, `/overview`, `/alerts`), `routes/financeLedger.js` (`/cash-flow`, `/retention`), `routes/hse.js` (`/dashboard`)
**Defect.** These endpoints aggregate across all projects and are only guarded by module/action, so a project-bound role with `view` receives company-wide numbers. The `?project_id=` filter is ignored.
**Proof** (project_manager scoped to project 176; the project's own invoiced total is 400.00; company total 161,152.56):
```
GET /api/finance/summary                 => {"total_invoiced":157752.56,"total_revenue_collected":26570,"total_expenses":1220.5,"net_profit":25349.5,...}
GET /api/finance/summary?project_id=176  => identical body (filter ignored)
GET /api/finance/summary?project_id=1    => 403
GET /api/dashboard/overview              => {"portfolio_budget":6964519,"portfolio_actual":67467.17,"projects_total":175,...}
```
Comparing owner vs scoped-PM bodies over every parameterless GET found 21 byte-identical non-empty bodies. Role census (reviewer's per-role users, one project each): finance/summary 14 roles, finance-ledger/cash-flow and /retention 15, dashboard/overview, /alerts and `/` 26, hse/dashboard 18 receive the company-wide figures. (Roles such as `owner_ceo`/`coo` are normally company-wide; the finding is about project-bound assignments, which include `project_manager`, `engineer`, `staff`, `site_supervisor`, `accountant*`.)
**Impact.** Cross-project financial disclosure; defeats "project-scope filter on every endpoint" (AGENTS.md, locked decision).
**Fix.** Make aggregate endpoints take `req.accessScope` (already computed by `authorize()`) and filter with `project_id = ANY($scope)` unless `companyWide`; honour `?project_id=`; add a matrix test "scoped user's aggregate == sum over own projects".

### REV-003 · **High** · Audit trail · e.g. `routes/boq.js:20-38`, `routes/hse.js` (inductions, ppe-records, incident/near-miss/jsa status), `routes/hr.js` (attendance, leaves), `routes/schedule.js`, `routes/locations.js`, `routes/qhse.js`, `routes/subcontractors.js`, `routes/projects.js` (phases/team/milestones), `routes/workorders.js`, `routes/units.js`
**Defect.** State-changing handlers insert/update/delete without writing an audit event (and several are multi-statement without a transaction).
**Proof** — row counts of `activity_log + audit_events` around each call as owner:
```
NO-AUDIT POST   /api/boq/sections          201  +0 rows      NO-AUDIT PUT    /api/boq/sections/4        200  +0
NO-AUDIT DELETE /api/boq/sections/4        200  +0          NO-AUDIT POST   /api/schedule/calendars    201  +0
NO-AUDIT POST   /api/hr/attendance         201  +0          NO-AUDIT POST   /api/hse/ppe-records       201  +0
NO-AUDIT POST   /api/hse/inductions        201  +0          AUDITED  POST   /api/invoices (control)    201  +2
```
Static scan (route-file blocks, direct SQL mutation, none of `logActivity|auditedTransaction|policyAudit|audit_events|activity_log`): **91 of 387** mutation handlers.
**Why guards missed it.** `lint-guards.js` rule `post-commit-audit` only checks that audit calls *that exist* are transaction-bound; nothing asserts that a mutation has one. The A4 failure-injection tests cover the `logActivity` primitive and approvals, not route families.
**Impact.** Contradicts the locked rule "audit event in the same transaction as the change" and Phase 1.6 "audit … cover boq, subcontractors, portal, actions, documents mutations". Hard deletes (`DELETE /api/boq/sections/:id`) leave no trace.
**Fix.** Wrap each handler in `auditedTransaction` with `before/after`; add a test that enumerates every non-GET route and asserts `Δ(audit rows) ≥ 1` for a happy-path call; add a lint rule that fails when a route block contains `INSERT|UPDATE|DELETE` and no audit helper. Soft-delete the remaining hard-delete routes (plan 2.5).

### REV-004 · **High** · Database / scalability · `journal_entry_lines` (no index on `journal_entry_id`), trigger `journal_entry_lines_balance` → `journal_entry_must_balance()`
**Defect.** The balance check is a deferred row-level constraint trigger running `SELECT SUM(debit),SUM(credit) FROM journal_entry_lines WHERE journal_entry_id = eid`; the table's only index is the PK, so each inserted line seq-scans the ledger.
**Proof.**
```
\d journal_entry_lines → only journal_entry_lines_pkey (id)
EXPLAIN (ANALYZE,BUFFERS) … WHERE journal_entry_id = 77000 @ 300,000 lines
  Parallel Seq Scan … Rows Removed by Filter: 99999 … Execution Time: 10.583 ms
INSERT of 300k balanced lines in one transaction: still running after 10 min (killed); with the trigger disabled: seconds
```
Cost per posting grows linearly with ledger size (≈ 3 scans × 11 ms at 300 k lines → ≈ 100 ms per scan at 3 M). Every GL report by entry id, FK joins and the reconcile check also scan. Same class: `journal_entry_lines.account_id`, `stock_movements(warehouse_id,material_id,lot_id)`, `purchase_orders.project_id`, `project_costs.project_id`, `boq_items.project_id`, `payments.supplier_id`… (472 FK columns have no leading index; REV-016).
**Fix.** `CREATE INDEX CONCURRENTLY idx_jel_entry ON journal_entry_lines(journal_entry_id)` (additive migration `0065`), change the trigger to statement-level or constraint-per-entry, add indexes for the FK list in REV-016, add a load test to CI-optional.

### REV-005 · **High** · Scalability / correctness · `services/financeEngine.js:496-514` (`arAging`), `:518-` (`apAging`), `:608-` (`runReceivableReminderSweep`); `services/commercialEngine.js:124-170` (`syncCommitments`) called from GET routes
**Defect.** `arAging` loads `SELECT * FROM invoices` into Node and issues one `payment_allocations` query per invoice (N+1). `syncCommitments` — invoked by `GET /api/finance-ledger/company-dashboard`, `/api/commercial/project/:id/commitments` and the commercial summary — **writes** from a GET: per purchase order it runs `SELECT COUNT(*) FROM commitments` then `INSERT … 'CM-' || count+1`, and `UPDATE`s every existing commitment on every read.
**Proof** (perf DB, 150 k invoices / 100 k POs, loopback):
```
GET /api/finance-ledger/cash-flow          200 in 97.6 s
GET /api/finance-ledger/company-dashboard  no response within 304.9 s (client headers timeout); 75,000 commitments rows written by the GET
client abort at 2 s ×30 → server still had 16 payment_allocations queries active afterwards (no cancellation)
race: new PO in each of two projects, then 2 concurrent GET …/commitments → 15 of 15 rounds returned one 409 database_conflict (duplicate commitment_number)
```
The same `SELECT * FROM invoices` appears in `runReceivableReminderSweep` (every 12 h, per replica) and in the replenishment/portal engines (`apiResources.js:61`, `portalEngine.js:352`).
The lint guard `count-numbering` did not catch the `COUNT(*)` → `count + 1` split across two statements.
**Impact.** Any authenticated finance user can pin the database for minutes; read endpoints return 409/500 under concurrency; dashboards unusable beyond a few thousand invoices (≈ 0.65 ms/invoice → 6.5 s at 10 k).
**Fix.** Single SQL aggregate for ageing (`SUM(net - credited - allocated) GROUP BY bucket` with a LEFT JOIN on allocations); never write on GET — make commitments event-driven via the existing outbox and use `numbering.js`; add `statement_timeout` and abort-on-disconnect (REV-015); extend the guard to flag `COUNT(*)` followed by `+ 1` on the next statement.

### REV-006 · **High** · Capacity · `routes/auth.js:3` (`bcryptjs`), `package.json` (native `bcrypt` installed but never required)
**Proof** (perf DB, owner login, 15 s per level):
```
login c=10   4.6 rps  p50 2184 ms  p95 2406        c=50  4.6 rps  p50 10885 ms        c=200  7.6 rps  p50 27892 ms  117×200, 94×500
30 concurrent logins: /api/health during the burst = 3256 ms, 2285 ms (idle p50 2 ms); 3 of 30 logins → 500 "Connection terminated due to connection timeout"
```
`bcryptjs` is pure JavaScript on the main thread; cost 12 saturates the event loop, delaying every other request and the pg connect timer.
**Impact.** A shift-start of 100 users stalls the whole API for ~20 s and produces failed logins; also a cheap CPU-DoS (the 20/15 min login limiter is per-IP and in-memory).
**Fix.** Use native `bcrypt` (libuv threadpool) or `argon2`, bounded login concurrency, limiter keyed on IP+email stored in Postgres/Redis; remove the unused dependency once switched.

### REV-007 · Medium · Functional · `routes/warehouses.js:65` vs `:231,:357`; `routes/qhse.js:928-941`; `routes/qhse.js:1309-1322`; `routes/quantities.js` (measurements list)
Four GETs always 500 for every role on the migrated schema:
```
GET /api/warehouses/transfers, /reservations → "invalid input syntax for type integer: \"transfers\""  (router.get('/:id') at :65 shadows them; policy record-scope SQL fails)
GET /api/qhse/calibration-records → "missing FROM-clause entry for table \"a\""   (UI: pages/QHSEExtended.js:652 calls it)
GET /api/qhse/mirs → "column s.name does not exist"  (suppliers has name_en/name_ar)
GET /api/quantities/measurements?project_id=176 → ambiguous column "project_id";  GET /api/expenses|/api/maintenance?status=x → ambiguous "status"
```
Impact: QHSE calibration tab and warehouse transfer/reservation lists are dead; `?project_id=` filter on measurements is broken. Fix: reorder routes, qualify columns, add a "smoke every GET with typical query params" test (a 5-minute script found these).

### REV-008 · Medium · Authorization-adjacent · `middleware/auth.js:114-160` + `routes/finance.js`, `utils/reporting.js:176`
Report columns tagged `internal` are shown only to `['owner','admin','finance_manager']` by role name (`visibleColumns`), and `Settings.js` gates on `['owner','admin']`, while the rest of the system uses grants (`see_internal_cost`). Roles that hold `see_internal_cost` (e.g. `owner_ceo`, `coo`, accountants) lose columns; renamed roles silently change visibility. Fix: derive from `policy` visibility flags.

### REV-009 · Medium · Functional / authz · `services/mediaAccess.js:12`
`policy.INTERNAL_ROLES` contains the 12 legacy keys; `users.role` may hold any of 48 role keys (`routes/users.js`), so 36 roles take the `!internal && !external → false` branch.
```
file linked in project_documents for project 176:
project_manager 200 | owner 200 | document_controller 404 | site_engineer 404 | qa_qc_manager 404 | planning_engineer 404 | viewer 404 | storekeeper 404
```
Fix: authorize by `policy.evaluate(user, 'docs'|'site','view', project)` for all non-external roles; test with every role.

### REV-010 · Medium · Availability · `services/authLockout.js`
5 failures lock an e-mail for 15 min regardless of source. Reproduced: 6 wrong passwords then the **correct** password → `Invalid email or password`. Any visitor who knows an address (including the sole owner) can keep the account locked. Also login e-mail matching is case-sensitive (`WHERE email = $1`) while the lock key is lower-cased. Fix: lock per (email, IP) with progressive delay, never block the owner out of band; normalise e-mail on write and read.

### REV-011 · Medium · Error leakage · 74 handlers, e.g. `routes/commercial.js:88`, `routes/financeLedger.js:41`, `routes/consultant.js:134`
`sanitizeServerError` hides only 5xx. 74 handlers answer `status(400|404|409).json({error: e.message})`, so database text leaks:
```
POST /api/commercial/contracts {client_id:99999999,…} → 400 "insert or update on table \"client_contracts\" violates foreign key constraint \"client_contracts_client_id_fkey\""
```
Also unknown routes return Express' HTML `Cannot GET …` (no typed 404). Fix: central mapping of `pg` error codes to typed errors (a `database_conflict` mapper already exists), JSON 404 handler, finish the L7 error-code contract (479 exception-message responses counted by the inventory).

### REV-012 · Medium · Secrets in VCS · `start_backend.bat`, `orchestrator.bat`, `launch_backend.ps1`, `docs/legacy/run_tests.ps1` (+ `start_backend.ps1` sets an empty password)
`git grep [redacted historical DB password]` → 5 tracked lines (`$env:DB_PASSWORD = "[redacted historical DB password]"` etc.); `git log -S` → present since the initial commit (`55ebef0`). Even if it only protected a developer database, it is a guessable credential in history. Fix: rotate the historical credential anywhere it was used and supply DB_PASSWORD through the environment; delete the launchers (they also hard-code `D:\The Osiris Labs\…` paths) or read from the environment, add a secret scanner (gitleaks) to CI.

### REV-013 · Medium · Resilience · `middleware/auth.js:121-124` (catch → 401), `config/database.js` (pool max 20, 5 s connect timeout), `routes/dashboard.js` (`Promise.all` of 6–12 queries per request)
```
docker stop db:  GET /api/projects → 401 (should be 503); /api/health → 503; recovery after start: first success within 2.5 s
dashboard_overview c=200: 103×500 + 5×401 ("timeout exceeded when trying to connect": 1,277 log lines)
```
`authenticate` maps *any* exception (including pool exhaustion or DB outage) to `401 Invalid token`; clients cannot tell an expired session from an outage, and a transient DB blip looks like mass logout. One dashboard request fans out up to 12 pool connections. Fix: distinguish `jwt` errors from infrastructure errors (503 + `Retry-After`), cap per-request fan-out or share one connection, add pool metrics (`pool.waitingCount`) to `/api/v1/ops/metrics`.

### REV-014 · Medium · Multi-instance safety · `middleware/security.js` (rate limiter), `routes/mcp.js` (limiter), `services/sweepLeader.js`, `services/outboxDispatcher.js:223`
* Login and MCP limiters are in-memory `Map`s, per process (ineffective behind N replicas; keyed on `req.ip`, which is the proxy unless `TRUST_PROXY` is set — compose sets `1`, `npm start` defaults to `false`).
* `sweepLeader` holds the advisory lock only **while a sweep runs**; there is no minimum interval, so with N replicas each replica's own timer acquires the lock in turn and the sweep runs **N× per interval** (non-concurrently). Non-leaders also insert a `skipped` row into `background_sweep_runs` every tick (webhook sweep: 1,440/day/replica) with no retention; `stats()` counts **all** `failed` rows ever, so a single historic failure keeps the metric `degraded` permanently.
* Uploads are written to local disk (`backend/uploads`), so a second replica cannot serve them.
* Outbox claim (`FOR UPDATE SKIP LOCKED`) **is** multi-instance safe (reviewed, PG suite passes).
Fix: Postgres-backed limiter; `last_run_at` gate inside the leader lock; prune `background_sweep_runs`; object storage or shared volume + sticky routing doc.

### REV-015 · Medium · Operability · `server.js`, `config/database.js`
No `SIGTERM/SIGINT` handler (grep), no `server.close()`, no pool drain; no `statement_timeout`, `lock_timeout` or `idle_in_transaction_session_timeout`; handlers do not cancel DB work when the client disconnects (REV-005 proof). `docker stop` kills in-flight writes after the grace period; one runaway query holds a connection indefinitely. Fix: graceful shutdown (stop sweeps, `server.close`, `pool.end`), session-level timeouts, `req.on('close')` cancellation via `pg_cancel_backend` for report endpoints.

### REV-016 · Medium · Indexing · live catalog
472 foreign-key columns have no leading index (examples: `project_costs.project_id`, `purchase_orders.project_id`, `boq_items.project_id`, `audit_events.project_id`, `payment_batch_items.supplier_id`, `stock_movements(warehouse_id,material_id,lot_id)`, `supplier_invoice_lines.supplier_invoice_id`, `deliveries.purchase_order_id`, `grn_lines.material_id`). List endpoints sort by columns with no index: `invoices.created_at`, `payments.payment_date/created_at`, `expenses` and `activity_log` have only a PK. Ranked `auto_explain` (ANALYZE) over the load run, all sequential scans:
```
n=2515 max 682 ms  SELECT i.*, … FROM invoices i LEFT JOIN … ORDER BY i.created_at DESC LIMIT 100   [Seq Scan invoices → top-N sort of 150 k rows]
n=1532 max 515 ms  finance/summary aggregates (payments, invoices, expenses)
n=3262 max 183 ms  SELECT SUM(amount) FROM invoices WHERE status NOT IN (…)
n=2213 max 258 ms  projects ⟕ v_project_cost_totals (project_costs seq scan)
n=28   max 12.2 s  SELECT * FROM invoices     (financeEngine; unfiltered)
… 12 statements total ≥ 50 ms, all Seq Scan (appendix C)
```
303 indexes had `idx_scan = 0` after the workload (candidates, e.g. `idx_audit_events_entity` duplicate of `(entity_type, entity_id)`). Fix: additive migration with the missing FK indexes (start with `*_project_id`), `(created_at DESC)` for list tables, covering/partial indexes for status aggregates, and materialized or incremental counters for dashboard totals.

### REV-017 · Medium · Phase 6 coverage · `frontend/src` (grep of every mount)
No frontend caller exists for `/api/organizations` (25 routes), `/api/delegations`, `/api/approval-limits`, `/api/inventory/lots|issues|returns|adjustments` (28 routes), commercial variations, SLA administration, webhooks and API-token management, numbering config, replenishment policy, workflow template editor, `/api/subcontractors` CRUD (12), `/api/costing`, `/api/maintenance`. `pages/Settings.js` is GL-account mappings only; there is no Users/Roles admin screen. Heuristic literal match: **213 of 699 internal routes** have no frontend reference. The plan's Phase 6 exit ("every spec screen reachable from navigation") is not met; these backend features are unusable except by API.

### REV-018 · Medium · Frontend resilience · `frontend/src`
No central 401/expiry handling (`grep 401` → none); `fetchApi` is copy-pasted in ≥ 10 pages; zero `AbortController` use; JWT in `localStorage` (mitigated by nginx CSP `script-src 'self'`); 7 of 32 form files have no double-submit guard (heuristic); shared form kit `FormField` used by 2 files; 41 files call `fetch` directly (61 call sites). `@reduxjs/toolkit`/`react-redux` remain (see INF-1); `axios`, `date-fns`, `recharts` (frontend) and `bcrypt` (backend) are declared but unused.

### REV-019 · Medium · Accessibility · axe-core 4.x, WCAG 2 A/AA, 25 routes × 2 locales (reviewer spec, run in the throwaway worktree)
```
en: button-name  critical 492 nodes / 18 routes   select-name critical 2   color-contrast serious 1012 nodes / 17 routes
ar: button-name  critical 492 nodes / 18 routes   select-name critical 2   color-contrast serious  249 nodes / 11 routes
```
Identical `button-name` counts in both locales show icon-only buttons have no localized accessible name at all (plan L9 open).

### REV-020 · Medium · Localization (Arabic mode, `<html lang=ar dir=rtl>` confirmed) 
Visible English in Arabic mode on real UI (not user data): Dashboard (`Portfolio`, `Procurement exposure`, `Quality & safety risks`, `Financial position`, `collected`, `outstanding`, raw `active`/`late`), My Actions (`critical high medium submitted`, server-generated `Approval requested`, `Purchase order approved`), Reports catalog (`Projects register`, `Quality tests`, `NCRs`, `Punch list`, `Near misses`, `Corrective actions`, … ~100 Latin words), status enums rendered raw. 66 `alert()` calls (QHSEExtended 10, HSE 9, Handover 8, DocControlExtended 7) and 1 `window.confirm`. Physical CSS remains (8 in `styles/*.css`, 36 inline `marginLeft/paddingRight/textAlign`). No horizontal page overflow on the 25 routes. These match `docs/i18n/STATUS.md` (L5/L7/L9 open); listed here because Phase 10 is a GO criterion.

### REV-021 · Low · CI · `.github/workflows/ci.yml`
Jobs: mock tests + guards, fresh-DB migrate ×2 + PG suite, frontend (i18n, unit, build, Playwright). Missing: dependency audit (`npm audit`/OSV), secret scan, image build/Compose health, real-backend journeys, golden/reconcile gate, `concurrency:` cancel, required-check/branch-protection (not inspectable). CI and Dockerfiles use Node 20; every local gate in this review and in STATE ran on Node 24 — Node 20 results are unproven. `backend/Dockerfile` runs the whole mock suite on every image build (slow, couples build to test flakiness). No remote run has ever been confirmed (NOT RUN).

### REV-022 · Low · Docs truth — see §0.4.

### REV-023 · Low · Phase 10 L8 · `backend/Dockerfile`, `utils/procurementPdf.js`, `utils/qcPdf.js`
Pilot image (inspected via `docker image inspect`, built 2026-10-13): user `node`, 325 MB, no Chromium, no fonts, no image HEALTHCHECK (Compose has one); `pdfkit` is still required by `procurementPdf.js` and `qcPdf.js` (other exports use `renderDocument`). The renderer decision (`docs/i18n/PDF_SPIKE.md`: Chromium) is not implemented in the deployable artifact. Frontend nginx image runs as root (no `USER`).

### REV-024 · Low (scope gap) · domain flow
There is **no tender / bid / opportunity module** (`grep -ri tender backend/src` → none; no such table besides `bid_comparisons` for RFQs), yet the golden scenario and the "Business Development / Tendering" role start at tender. Spec 28 is also absent from the repository (docs/DECISIONS.md). Flow coverage beyond tender is in §4.2.

### Info
* **INF-1 Locked decision "no Redux Toolkit".** `frontend/package.json` depends on `@reduxjs/toolkit` + `react-redux` and `store/index.js` uses `configureStore` (auth slice only), present since the initial commit (`55ebef0`). No Socket.io anywhere. Clarify whether the decision means "do not extend" or "remove".
* **INF-2 Real-backend Playwright coverage is nominal** — 3 specs × 2 viewports, assertions are "body text > 50 chars" and `html[dir]`.
* **INF-3 Stray artefacts** — `scratch_pdf.txt`, `pg_proxy.js` (binds 127.0.0.1), `.bat/.ps1` launchers with hard-coded `D:\…` paths are tracked; `db_dump/`, `*.log`, `uploads/`, `.env*` are ignored and were never committed.
* **INF-4 Webhook SSRF residual** — `2002:7f00:1::1` (6to4 embedding 127.0.0.1) is accepted by `resolveWebhookTarget` because `2002::/16` sits inside the accepted `2000::/3`; unrealistic without a 6to4 relay but trivial to block. JWT `verify` does not require an `exp` claim (all issued tokens carry one). `WEBHOOK_ENCRYPTION_KEY` falls back to `JWT_SECRET`, so rotating the JWT secret orphans stored webhook secrets.

---

### 4.1 Security review notes (Stage 3)
* **Route inventory** (generated from the live Express stack): 1,051 routes. Internal routes lacking `authorize`: only `GET /api/health`, `POST /api/auth/login`, `POST /api/auth/logout-all` (self-session by design), `GET /uploads/:file` (own resource authorization), `GET|POST /api/mcp` (own bearer + scope check). All 351 `/api/v1` routes authenticate via the v1 middleware; the OpenAPI document lists 351 operations (equal to the route count; path-by-path comparison not performed). Per-route validation/audit columns were not reliable by function-source heuristics; audit presence was measured empirically (REV-003).
* **AuthN.** Typed JWTs (session 8 h, preview 30 min read-only, v1 1 h, refresh 30 d) with per-kind HMAC keys derived from `JWT_SECRET`; `token_version` revocation checked per request; password change bumps it. 32-char minimum enforced **only** when `NODE_ENV=production`. `bcrypt` and `bcryptjs` both declared; only `bcryptjs` is used (REV-006). Constant-time login path (dummy hash) present.
* **AuthZ.** Policy engine is table-driven; expired `user_project_roles` deny (reproduced: setting `expires_at = yesterday` turned 200 into 403 on every route incl. `/api/auth/me`); portal roles (client/supplier) reach only their prefix (`This account can access only its scoped portal`); no fail-open for users with zero rows. Gaps: REV-001, REV-002, REV-009. No Postgres RLS (249 tables, 0 with `relrowsecurity`) — enforcement is application-only.
* **Injection.** No dynamic `ORDER BY`, no column names taken from request keys (Joi allow-listed); `sets.push(`${k} = $n`)` keys come from validated objects. Mass assignment: Joi rejects unknown keys (`"expense_date" is not allowed`). CSV export neutralises `= + - @` prefixes (`utils/reporting.js:156`). Upload: extension allow-list + magic-byte check, traversal stripped, files served `private, no-store` + `nosniff` with owner/policy check (REV-009 aside).
* **Hardening.** Headers: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, restrictive CSP on the API, HSTS only when `NODE_ENV=production`, `x-powered-by` disabled; CORS rejects non-listed origins (no ACAO for `https://evil.example`); JSON body limit 1 MB (2.2 MB → 413). nginx adds a strict CSP for the SPA. No cookies are used (bearer tokens).
* **Logging.** winston Console only, fixed level `info`, 110 raw `console.*` calls bypass it; the access log is `METHOD url` (query strings included) without status, duration or request id; `database.js` logs the full `pg` error object. No secrets/PII observed in logs during the run.
* **Agents / MCP / tokens** reviewed by reading (`routes/mcp.js`, `mcpService.js`, `approvalLimits.js`, `apiTokenService.js`) and via the passing `agent-approval`, `mcp-safety`, `token-typing` PG suites; not penetration-tested (§5).

### 4.2 Domain flow trace (Stage 1)
Traced PO 54 in the PG-suite database end to end (SQL, reviewer query): `purchase_orders 54 (5,000.00, fully_delivered)` → `purchase_order_lines 57 (50 × 100)` → `deliveries 29 received` → `goods_receipt_notes 23 posted (50)` → `project_costs grn:23 +5,000.00` → `supplier_return:8 −1,000.00` → `supplier_invoices 31 paid 4,000.00` → `payment_allocations 8 (payment 12, 4,000.00)`; journals `grn_cost 5,000 Dr = Cr`, `supplier_payment 4,000 Dr = Cr`. The chain reconciles (cost 4,000 = invoice 4,000 = payment 4,000). Only the procure-to-pay segment has an automated golden test; tender, site daily reports → quantities → progress (`daily-report-progress.pg`, `progress-derivation.pg`), QC/HSE, certificates/retention/advances (`commercial-5-5.pg`, `finance-flows.pg`, `certificate-gl-posting`), handover/warranty (`handover-documents-warranties.pg`) are covered by separate suites that were green but not chained.

### 4.3 Phase parity matrix (Stage 1)
Status vocabulary: **Met** (reproduced or directly evidenced), **Partial**, **Not met**, **Unproven** (claimed, not independently exercised).

| Phase / item | Exit criterion | Evidence | Status |
|---|---|---|---|
| 0 Baseline | status docs match reality | §0.4 contradictions | **Partial** |
| 0 | CI three green gates | `ci.yml` has the three jobs; no remote run | **Unproven** |
| 0 | COUNT+1 guard | `lint-guards: ok`; blind spot REV-005 | **Partial** |
| 1.1 Token typing | typed/aud/iss, revocation | jwt probe (7 cases), `token-typing.pg` | **Met** |
| 1.2 Fail-open | zero-role denied | `fail-closed.pg`; expiry test | **Met** |
| 1.3 Record scoping | A↛B across read/write | by-id 14 families 403/404; query/body bypass; aggregates | **Not met** (REV-001/002) |
| 1.4 Approval gate | atomic, limits, agent safety | `approvals-atomic.pg`, `agent-approval.pg` green; not pen-tested | **Unproven** |
| 1.5 Webhooks | SSRF, secrets, wildcard, outbox | 13/14 hostile targets blocked; secrets AES at rest (code); plan boxes unticked | **Met** (INF-4) |
| 1.6 Medium items | CSV, media, uploads, auth, rate limit, errors, audit | CSV/uploads Met; media REV-009; lockout REV-010; rate limit REV-014; errors REV-011; audit REV-003 | **Partial** |
| 2.1 Migrations | versioned, repeatable, checksummed, locked | 126 applied, 0 on rerun, advisory lock | **Met** |
| 2.2–2.3 Inventory/procurement locking | concurrent issue/MIR/delivery safe | `inventory-integrity.pg`, `procurement-locking.pg`, `concurrency.pg` (suite green; not re-implemented by reviewer) | **Met** (suite) |
| 2.4 Numbering | no duplicates under concurrency | 60 parallel invoices → 60 unique numbers; commitments COUNT+1 race | **Partial** (REV-005) |
| 2.5 Delete semantics | financial FKs RESTRICT, soft delete | 239 RESTRICT / 120 CASCADE FKs (plan says 104 remain); hard deletes remain (boq sections) | **Partial** |
| 2.6 Constraints | CHECKs, NUMERIC money | 139 CHECKs; money NUMERIC; 3 `timestamp` w/o tz (`invoices.created_at/updated_at`, `payments.created_at`); plan's status-enum audit for ~75 tables open | **Partial** |
| 2.7 GL | balanced postings | journals balanced (0 unbalanced across 300 k + 187); DB trigger enforces | **Met** |
| 3.1–3.5 Cost sync/events/jobs | single cost writer, outbox, leader | only `costAccrual.js` writes `project_costs` (grep); outbox SKIP LOCKED; sweeps N× (REV-014); PO 54 trace | **Partial** |
| 4 Test infra | 12 layers in CI | PG harness, concurrency, matrix, contract, nav-visibility (reviewer UI↔API parity: 624 checks, 0 hidden-tab→200), portal acceptance green; real-backend E2E nominal; load smoke only | **Partial** |
| 5.1 Org/RBAC | 33 roles, grants, delegations | 48 roles, per-role grants, expiry verified; no UI (REV-017) | **Partial** |
| 5.2 Project setup | WBS/WP/wizard atomic | `project-setup-5-2.pg` green | **Met** (suite) |
| 5.3 Inventory docs | lots/expiry/replenishment | API + suites green; no UI | **Partial** |
| 5.4 Procurement | award, PR/PO update | `procurement-5-4.pg`, `procurement-flows.pg` | **Met** (suite) |
| 5.5 Commercial/finance | budget/forecast/credit notes/batches | API + suites; GL mappings provisional (finance sign-off pending) | **Partial** |
| 5.6 Consultant/client/portals | WIR/variation/certificate flows, SLA admin | `consultant-observation.pg`, `client-actions.pg`, `portal-acceptance.pg` green; SLA admin absent; portal registers partial | **Partial** |
| 5.7 QA/QC, HSE, DC, planning, handover | incident merge, certificates, assignments | suites green; qhse calibration/mirs 500 (REV-007) | **Partial** |
| 5.8 Platform | tokens, MCP sessions, notification channels | tokens/sessions Met; real email/push/SMS adapters not implemented (stubs by design) | **Partial** |
| 6 Admin/module screens | all screens, no prompt() | prompt()=0 Met; admin/inventory/variation/SLA screens absent; form kit adopted in 2 files | **Not met** |
| 7.1 Offline | SW, idempotency, IDB queue, fonts | `site-report-offline.spec` (desktop+mobile) passes; fonts bundled OFL-1.1 (plan box still unticked); Lighthouse not run | **Partial** |
| 7.2 Responsive | 110 grids, 64/72 tables, 44 px targets | source scan claims zero grid/unwrapped table; 36-route sweep passes (reproduced within the 74) | **Met** (heuristic) |
| 8 Engines | EAC/ETC, retention, valuation, reminders, EV | migrations 0061–0064, suites green; legacy approval/certificate retirement open per plan | **Partial** |
| 9 Golden seed/E2E | tender→warranty chain, UI+API | seed (96 units, C35 BOQ EGP 504,000, demand 122.4 m³) reproduced; chain = procure-to-pay only | **Not met** |
| 10 L0–L11 | localization exit | L1/L2 Met (parity ok); L3–L11 Partial/Not met; REV-019/020 | **Not met** |
| 11 Rollout | reconcile 16, dry-run, backups, security review, perf budget, UAT | reconcile Met; restore drill Met (synthetic); no restored real copy; no independent security review; no perf budget; no UAT | **Partial** |

---

## 5. UNVERIFIED items and blockers

| # | Item | Blocker / reason |
|---|---|---|
| U1 | `npm audit` / outdated / duplicate dependencies (backend, frontend) | registry network call prohibited by the brief |
| U2 | Docker image build, image size, non-root, Compose healthchecks, multi-replica start, graceful shutdown of the real image | building requires `npm ci` (registry); only the pre-built pilot image was inspected (user `node`, 325 MB, no HEALTHCHECK) |
| U3 | Pilot Compose smoke (`smoke:staging`) and `backup:rehearse` | scripts read `.env.docker` / `.staging-users.json`, which the brief forbids opening; reviewer ran an equivalent dump/restore by hand (§6.4) |
| U4 | Remote CI behaviour, branch protection | no network; cannot confirm any remote run |
| U5 | Node 20 (CI/Docker) results | all local runs used Node 24.14.0 |
| U6 | MCP / agent / API-token endpoints penetration (prompt-injection exposure, scope bypass, approval-limit abuse) | reviewed by reading + existing suites only; no adversarial run |
| U7 | Disk-full on uploads, outbox backlog, partial deploy with pending migrations | not safely reproducible locally; by reading: `server.js` does not check `schema_migrations` at boot (Compose gates on the `migrate` service; `npm start` does not) |
| U8 | Concurrent approval and concurrent stock-issue races re-implemented by the reviewer | rely on the repo's `concurrency`, `approvals-atomic`, `inventory-integrity` PG suites (green); reviewer independently tested numbering, idempotency, payments `FOR UPDATE`, commitments |
| U9 | Per-module mutation sweep for REV-001 | exercised on expenses, invoices, legal only; remaining ~85 schemas with body `project_id` not individually run |

---

## 6. Scalability limits observed

Environment: Windows 11 host, Docker Desktop (7.57 GiB), PostgreSQL 16 container (loopback), **one** Node 24 API process (pool max 20, connect timeout 5 s), keep-alive closed-loop generator (own script; autocannon/k6 unavailable offline), 15 s per level. Dataset `conerp_review_perf_test`: golden seed + synthetic 60 clients, 300 projects, 150 k invoices, 75 k payments, 150 k expenses, 200 k project costs, 150 k journal entries / 300 k lines, 100 k POs, 800 k activity rows, 500 k audit events (≈ 2.6 M rows, 425 MB; ≥ 100× the golden seed). PG peaked at 1,613 % CPU and 27 active connections during the dashboard run.

### 6.1 Latency / throughput (owner token; `ok` = 2xx)
| Scenario | c=10 rps · p50/p95/p99 ms | c=50 | c=200 | Errors |
|---|---|---|---|---|
| `GET /api/projects` (301 rows, ≈ 314 KB, unpaginated) | 490 · 20/28/35 | 509 · 95/126/150 | 482 · 376/557/952 | none |
| `GET /api/dashboard/overview` | 29.6 · 332/473/518 | 29.6 · 1656/1980/2186 | 33.8 · 5599/6013/6247 | c=200: **103×500, 5×401** |
| `GET /api/dashboard/portfolio` | 94.8 · 101/146/222 | 115 · 417/604/693 | 121 · 1638/1761/1806 | none |
| `GET /api/finance/summary` | 71.7 · 137/170/185 | 79.4 · 619/728/759 | 82.5 · 2359/2541/2621 | none |
| `GET /api/invoices` (LIMIT 100) | 44.6 · 223/263/276 | 54.4 · 903/1082/1165 | 53.1 · 3714/4062/4170 | none |
| `POST /api/projects/:id/site-reports` (unique idempotency key + unique project/date) | 424 · 23/29/37 | 573 · 85/111/128 | 625 · 305/405/512 | none (a first run that re-used one project/date measured only the 409 path and was discarded) |
| `POST /api/documents/upload` (200 KB PNG) | 329 · 30/42/51 | 336 · 125/280/439 | 274 · 606/1435/1678 | none |
| `POST /api/auth/login` | 4.6 · 2184/2406/3433 | 4.6 · 10885/10904/10905 | 7.6 · 27892/27909/27909 | c=200: **94×500** |
| `GET /api/finance-ledger/cash-flow` | single call **97.6 s** | — | — | — |
| `GET /api/finance-ledger/company-dashboard` | single call **> 304 s** (no response) | — | — | writes 75 k rows |

Node CPU/RSS was not captured (sampler could not attach on Windows); PG container memory stayed ≈ 0.9 GiB. DB-pool saturation is evidenced by 1,277 `timeout exceeded when trying to connect` log lines at c=200.

### 6.2 Limits and blockers to horizontal scale
* Single-process capacity: ≈ 500 rps for a 300 KB list, 30–120 rps for aggregate endpoints at 2.6 M rows, 4–8 logins/s.
* Blockers for N replicas: in-memory limiters, sweeps run N× (REV-014), local-disk uploads, per-request fan-out against a 20-connection pool, no `statement_timeout`.
* Unbounded results: 73 GET list handlers have no `LIMIT`/pagination token (e.g. `/api/projects`, hse/qhse registers, `/api/users`, `schedule/activities`); `/api/projects` and `/api/dashboard/portfolio` return 311–314 KB for 301 projects and grow linearly.

### 6.3 Failure modes
* **DB down/restart:** `/api/health` → 503 immediately, authenticated routes → **401** (REV-013); service recovered on its own within 2.5 s of the container starting. Survivable, but misleading to clients.
* **Slow queries / pool exhaustion:** survivable only by queueing; at c=200 on aggregate endpoints requests fail with 500 after 5 s.
* **Outbox backlog / sweep failure:** visible via `/api/v1/ops/metrics`, but a single historic `failed` sweep keeps status `degraded` forever (REV-014).
* **Uploads on a full disk:** not reproduced (U7); no quota exists.
* **Partial deploy with pending migrations:** Compose blocks backend start until `migrate` completes; other start paths do not check.

### 6.4 Backup / restore (own rehearsal)
`pg_dump -Fc` of the 2.6 M-row perf DB: **3.1 s**, 30.3 MB; `createdb -T template0` + `pg_restore --exit-on-error`: **24.8 s**; comparison script: 249 tables / 2,598,376 rows on both sides, 0 count differences, 237 sequences, 0 differences. Rollback of the highest migrations: none provided (forward-only by design, `docs/MIGRATIONS.md`); the only rollback is restore-from-backup.

---

## 7. Remediation plan

Ordered batches; quick wins first, blockers for UAT first. Effort = one engineer-days, rough.

| Batch | Scope | Files / objects | Tests required | Effort | Depends on |
|---|---|---|---|---|---|
| **R0 Quick wins** | rotate/remove committed password (REV-012); fix 4 always-500 routes (REV-007); JSON 404 handler; media access by policy (REV-009); drop unused deps; tighten 6to4 SSRF; typed 503 for infrastructure errors in `authenticate` (REV-013) | launchers, `warehouses.js`, `qhse.js`, `quantities.js`, `expenses.js`, `maintenance.js`, `mediaAccess.js`, `auth.js`, `server.js`, `webhookService.js`, package.json | unit/PG: each fixed route 200; media access for all 48 roles; DB-down returns 503 | 2–3 d | — |
| **R1 AuthZ blockers** | REV-001 query/body project mismatch → reject; handlers use authorized project; REV-002 scope all aggregate endpoints | `policy.js`, every route reading `body.project_id` (29 files), `dashboard.js`, `finance.js`, `financeLedger.js`, `hse.js`, `dashboardWidgets.js` | new PG test: mismatched project ids on every body-`project_id` route → 403; scoped-user aggregates equal sum of own projects | 4–6 d | R0 |
| **R2 Audit completeness** | REV-003: audited transaction for every mutation; soft-delete remaining hard deletes; lint rule + route-enumerating test | ~91 handlers (list in appendix C) | enumerate non-GET routes, assert Δ audit ≥ 1; failure-injection per family | 4–5 d | R1 |
| **R3 Ledger/DB performance** | REV-004/016: index migration `0065` (journal lines, project_id FKs, created_at sorts), statement-level balance trigger; REV-005 aggregate SQL for ageing/dashboards, remove writes from GET, commitments via outbox + `numbering.js` | `src/migrations/0065_*.sql`, `financeEngine.js`, `commercialEngine.js`, `routes/financeLedger.js` | rerun the perf script: `cash-flow` < 1 s at 150 k invoices; concurrent commitments GET 200/200; PG reconcile | 5–7 d | R0 |
| **R4 Capacity & ops** | REV-006 native bcrypt/argon2 + login concurrency cap; REV-013/015 pool metrics, `statement_timeout`, graceful shutdown, abort on disconnect; REV-014 Postgres limiter, sweep min-interval, retention, failed-sweep window; pagination on 73 list endpoints | `auth.js`, `database.js`, `server.js`, `security.js`, `sweepLeader.js`, routes | login p95 < 500 ms at c=50; no 5xx at c=200 on dashboard; graceful-shutdown test | 5–6 d | R3 |
| **R5 Phase 6 screens** | REV-017: organizations, delegations, approval limits, users/roles, inventory documents, variations, SLA, webhooks/tokens, numbering, replenishment; central API client with 401/503 handling + `AbortController`; form kit adoption (REV-018) | `frontend/src/pages`, `services/api.js` | per-screen loading/empty/error/RTL tests; hidden-tab→403 test extended | 15–20 d | R1 |
| **R6 Localization/a11y** | REV-019/020: accessible names for icon buttons, `aria` localization, contrast, remaining English in dashboard/reports, error-code contract (479 messages), logical CSS | components, locales, route files | axe zero-critical gate in both locales; Arabic E2E per major route | 10–15 d | R5 |
| **R7 Delivery pipeline** | REV-021/023: CI adds audit, OSV, secret scan, Docker build + Compose smoke, real-backend journeys, Node 20/24 matrix, perf-smoke; package Chromium+fonts in backend image; rollback/restore runbook rehearsal | `.github/workflows`, `backend/Dockerfile`, docs | CI green remotely; runbook signed | 4–5 d | R0 |
| **R8 Domain scope** | REV-024 tender module (or formally descope), chain the golden journey (contract → site → QC → valuation → handover → warranty) in API and Playwright | new migrations/routes, golden suite | golden journey green in CI | 15–20 d | R1–R3 |
| **R9 Docs truth** | one STATE file, regenerate IMPLEMENTATION_STATUS/API matrix from code, tick plan boxes, correct MIGRATIONS.md | docs | CI doc-drift check (highest migration, gate counts) | 1–2 d | any |

Estimated critical path to a conditional GO for non-production UAT: R0 → R1 → R2 → R3 → R4 ≈ 3 weeks.

---

## 8. Appendix

### A. Environment and versions
Host: Windows 11 Home 10.0.26200; Node v24.14.0; Docker 28.3.2; PostgreSQL 16 (`postgres:16` image). Review worktree detached at `43754e5` under the session scratchpad; `node_modules` junctions only. Throwaway container **`conerp-review-pg`** (`127.0.0.1:55432`, random 24-hex password and 64-hex JWT secret generated per session, stored only in the scratchpad). Databases: `conerp_review_test` (migrated + PG-suite residue + probe users), `conerp_review_perf_test` (golden seed + scale data, `auto_explain` enabled), `conerp_review_restore_test` (restore target). API processes on `127.0.0.1:5055/5056` with `NODE_ENV=test`. All databases/container removed at the end (§ final line). No credential value appears in this report.

### B. Commands run (abridged, secrets elided)
```
git status; git log -30; git worktree add --detach <scratch>/review 43754e5
docker run -d --name conerp-review-pg -e POSTGRES_PASSWORD=<random> -e POSTGRES_DB=conerp_review_test -p 127.0.0.1:55432:5432 postgres:16
node src/scripts/run-all-migrations.js --dry-run | run (x2)           # 126 applied / 0 applied
npm run lint:guards; npx jest                                          # 54/1013
TEST_PG=1 npx jest --config jest.pg.config.js --runInBand --forceExit  # 68/635
frontend: npm run i18n:check | i18n:parity | i18n:inventory | test:ci | build (CI=false, CI=true)
npx playwright test (74 passed / 86 skipped); E2E_BACKEND=1 … journeys-backend.spec.js (6 passed); zz-review-axe.spec.js (reviewer scratch)
RECONCILIATION_BACKUP_CONFIRMED=true node src/scripts/reconcile-database.js   (on both throwaway DBs)
node src/scripts/data-cleaning-report.js; node src/scripts/seed-golden-demo.js (APP_ENV=test)
reviewer scripts (scratchpad/tools): routes.js (route inventory), mkusers.js (48 role users), probe_gets.js, cmp.js, idor.js, mismatch*.js, jwt.js,
  media*.js, conc_num.js, conc_idem.js, race_commit.js, aud*.js, load.js, health_during_login.js, dos.js, dbdown.js, uiapi.js, cmpdb.js
psql catalog queries (PKs, FK indexes, NOT VALID, tz columns, unpaired _en/_ar, duplicate/unused indexes)
pg_dump -Fc / createdb -T template0 / pg_restore --exit-on-error (perf DB)
docker image inspect erp-closeout-pilot-20261013-backend|frontend (read-only)
```
### C. Supporting lists
* **Heaviest statements (auto_explain, ANALYZE)** — see REV-016; all Seq Scan: invoices list top-N, finance/summary, invoices/payments/expenses SUM, `v_project_cost_totals`, expenses FILTER aggregates, projects at-risk count, `SELECT * FROM invoices/purchase_orders/payments`.
* **Mutation handlers with no audit token (91, static scan)** — boq (6), doccontrol (3), documents upload (1), handover (2), hr (5), hse (9), locations (3), maintenance (1), materials (1), payroll (1), portal (5), procurement award (1), projects (7), qhse (15), quantities (3), reports (2), schedule (6), site (4), subcontractors (6), units (5), workorders (5). The scan is a heuristic over route-file text (a handler delegating to an auditing service would be a false positive); 7 endpoints were confirmed empirically in REV-003 (boq sections POST/PUT/DELETE, schedule calendars POST, hr attendance POST, hse ppe-records POST, hse inductions POST).
* **Unpaired `_en/_ar` column:** `daily_laborers.full_name_en`. **`timestamp` without tz:** `invoices.created_at`, `invoices.updated_at`, `payments.created_at`.
* **Unused / duplicate indexes:** 303 with `idx_scan=0` after the workload; true duplicates are mostly partial-index pairs (`payments`, `payment_allocations`, `purchase_requests`, `site_daily_reports`).
