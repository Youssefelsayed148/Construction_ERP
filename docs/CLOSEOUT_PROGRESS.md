# Closeout progress (append-only)

Resume point for a new session. Authority: docs/ERP_CLOSEOUT_PLAN.md and docs/system_language_fix.md (corrections section). Parts: A = close Phase 3, B = Phase 4, C = Phase 5, D = Phase 6. Checkpoints CP1..CP8 stop and wait for "go".

Stack so far: #1-#35 (Phases 0-3 and earlier slices, see docs/CLOSEOUT_LOG.md). Baseline confirmed 2026-10-04: mock 970, real-PG 261 (31 suites), 85 migrations fresh and repeatable, lint:guards empty baseline, frontend i18n:check + 72 unit tests + build green.

## Current autonomous closeout (2026-10-13)

- Branch: `closeout/batch-a-to-6` (created; no closeout slice committed yet).
- Preserved the pre-existing untracked `docs/CODEX_AUDIT_REPORT.md`.
- A1 is in progress: expired matching active delegation rows are deactivated during renewal; PG regression assertions cover expired renewal and live-overlap refusal.
- A2 is in progress: webhook URL validation, DNS pinning, non-public address rejection, redirect refusal, and response cap are implemented with mocked regressions; A2 is not yet committed.
- A3 is in progress: webhook secrets are encrypted at rest using an HKDF-derived AES-256-GCM key; read helpers omit them, create and rotate return secrets once, and legacy plaintext rows are encrypted on first delivery. Rotation is audited in its transaction.
- A4 is in progress: `logActivity` now propagates write errors and supports transaction-bound queries; activity readers propagate DB errors. Procurement and finance-ledger writes moved inside their transaction, and a rollback-path injection test plus a route guard were added. The other route families have not yet been converted.
- Current local output: mock backend 42/42 suites and 928/928 tests; lint guards `ok`.
- Focused webhook output: 1 suite / 41 tests passed. This is mocked coverage only.
- Updated focused webhook output after A3: 1 suite / 42 tests passed. This is mocked coverage only.
- Focused A4 output: 4 suites / 57 tests passed; `npm run lint:guards` reports `lint-guards: ok`.
- After A5/A6 changes, the full backend mock gate passed at 45/45 suites and 944/944 tests; guards passed. A first run exposed a missing transaction mock in the agent approval parity fixture; that fixture now provides a transaction-bound mock and the rerun passed.
- Real-PG verification is blocked pending Docker Desktop availability. `docker info` reports the Docker Desktop Linux engine pipe is missing. Do not point tests at any other database.
- See root `STATE.md` for the exact resume command and outstanding gates.

## PRs in this run (stacked on #35)

- (A1) docs/PHASE3_GAP_AUDIT.md: audit table for plan 3.1-3.5, mapped to the plan numbering (no code).
- (A2.1) supplier-return reversal of the GRN cost (decision 2), GRN/invoice accrual pairing (decisions 5, 6), cancel-approval restriction (decision 4). Migration 0023. PR #36, CI green.
- (A2.2) replenishment raises a PR through the PR workflow with project scoping, budget check, location/cost code/work package. Migration 0024. PR #37, CI green.
- (A2.3) cost posting from material issue, expenses, payroll allocation; labour/equipment double count fixed; delivery receipts valued at the PO rate. Migration 0025. PR #38 (GitHub Actions did not start: see below).
- (A2.4) 30 catch-to-zero guards removed, one shared cost view, lint rules. Migration 0026. PR #39.
- (A2.5) event name fixes, routes for the eleven unrouted families, events in the change's transaction, no swallowed enqueue, lint rule. No migration. Also fixes the subcontractor certificate update that never worked. PR #40.
- (A2.6) daily-report measurements, one measurement-change hook (work-completion verify was missing it), weighted dashboard progress. No migration. PR #41.
- (A2.7) golden-chain test (two variants) reconciled at every step; found and fixed: PO status column too short (no PO could be issued on PostgreSQL), three-way match flagging partial invoices. Migration 0027. PR #42.

## Current checkpoint

CP3 reached (Part B complete, 2026-10-04): mock 921/42 (npm test), real-PG 502/50 (TEST_PG=1 npm run test:pg), frontend unit 91/15 + build + i18n:check + Playwright (32 passed / 46 skipped = gated suites), lint:guards green, 92 migrations fresh and repeatable. PRs #44-#54 are stacked on #43 and wait for "go" to start Part C (Phase 5). The remote CI gate still needs the GitHub Actions billing fix noted below; every PR carries its local verification numbers.

## Part B PRs (stacked on #43)

- (B1) harness precheck (fail fast / refuse prod-named DB) + docs/TESTING.md run recipes. PR #44.
- (B3) concurrency suite: 8 races on real PG; proof of failure shown by locally reverting the advisory lock (stock issue race) and the FOR UPDATE claim (double approval). PR #45.
- (B4) constraint tests; migration 0029 refuses a negative-quantity row in positive-only movement types (preflight shown live: stopped with counts, changed nothing, on a dirty DB). PR #46.
- (B2) five critical suites ported to real PG (36 tests); 45 superseded mock tests deleted, fixture chains healed. PR #47.
- (B5) /api/v1 contract tests; app fix - v1 catch-all answers the JSON 404 envelope instead of Express HTML. PR #48.
- (B6) full seeded permission-matrix sweep (deny-by-default grid, external isolation, v1 module/action derivation parity). PR #49.
- (B7) navigation visibility: API-403 half per role on real routes; rendering half activates in Part D (6.4); blanket-role fixture pinned for the 5.1 switch. PR #50.
- (B8) four Phase-11 reconciliation checks appended to reconcile-database (read-only, restored-copy only). PR #51.
- (B12) portal acceptance: forbidden financial fields absent from every portal payload, portal caging, assignment-expiry scoping. PR #52.
- (B9) 19 frontend component tests across Clients/Suppliers/Expenses/Payroll/MyActions; frontend unit 91/15. PR #53.
- (B10/B11/B13) gated real-backend Playwright journeys (6 green, desktop+mobile); load-profiling script + docs/LOAD_BASELINES.md; dashboard non-integer-id 500 to 400 (pinned by dashboard-id.pg); spec-26 exit-gate table filled honestly. PR #54.

CLOSEOUT CI NOTE (2026-10-04): GitHub Actions jobs for PR #38 and later did not start ("recent account payments have failed or your spending limit needs to be increased"). #36 and #37 were green. Everything verified locally with the same commands; the remote gate needs the billing fix and a re-run. CP1 was skipped because every audited gap is inside the A2 list.

## Prior checkpoint (CP2, Part A, superseded by CP3)

CP2 was reached after A2.1-A2.7 (#36-#42) and the decisions PR #43: PO modes raise PRs (gate stays removed); owner/admin over-budget override with reason (migration 0028, audited); daily-report quantities pending and shown separately on the PM dashboard; payroll allocation by attendance with an hours split and an explicit unallocated bucket; input VAT to 1400 for stocked-only and mixed invoices unless vat_recoverable (0028). Per-slice detail in docs/CLOSEOUT_LOG.md.

## Part C (Phase 5) - resumed 2026-10-05

- (5.1) organizations + RBAC. PR #55 (migrations 0031, 0032). Its branch also carried a broken half-written 5.2 migration; reverted there (commit 988165e, no history rewrite).
- (5.1b) legacy role switch DRY RUN only (read-only report, docs/LEGACY_ROLE_SWITCH.md). PR #57. NOT done by rule: no user moved, no wildcard removed; waits for your review of the report.
- (5.2) project setup: settings, calendars, WBS/work packages, register FKs, wizard fixes. Migration 0033. PR #56.
- (5.3) materials and inventory: lots/batch/expiry (FEFO), unit-conversion table, issue/return/adjustment documents, expiry alert, replenishment endpoints, one open-requirement formula. Migration 0034.
- (5.4) procurement: award recommendation entity + approval, RFQ list/get, PR/PO update and cancel, vendor performance and spend queries; fixes the requester-step bug (only owner/admin/system could submit a requisition). Migration 0035.
- (5.5) commercial and finance: parties/guarantees/insurances/rates, payment applications and certificate workflow, versioned budgets/forecasts (maker/checker), commitment adjust, variation fields, credit notes, payment batches, supplier invoice workflow. Migration 0036. CHECKPOINT CP5 reached; waits for "go" and for the owner's confirmation of the retention/advance/deduction accounts.

## 2026-10-13: A7 configurable agent approval limits (implementation in progress)

Added versioned migration `0037_role_action_approval_limits.sql` with provisional EGP defaults for money-moving tools and finance approver roles. The admin API is mounted at `/api/approval-limits` (owner/admin only), writes are transactional with activity audit, and the MCP decision path resolves ID-only action amounts from stored ERP records before checking the approver's role/action limit. Missing, disabled, unresolved, over-limit, or currency-mismatched limits fail closed. The role check uses the approver's actual role, so project delegation does not increase a monetary cap. Defaults remain provisional and require finance/owner review.

Focused output:

```text
backend> npm test -- --runInBand src/scripts/__tests__/approval-limits.test.js
Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
```

The first full run exposed two stale expectations after the policy/API additions (owner-only approval and an exact route-file count); both were updated. Rerun output:

```text
backend> npm test -- --runInBand
Test Suites: 46 passed, 46 total
Tests:       949 passed, 949 total
Snapshots:   0 total
Time:        4.673 s
Ran all test suites.

backend> npm run lint:guards
lint-guards: ok
```

Migration application and PG approval/delegation integration remain unverified because Docker Desktop is unavailable. A7 is committed as `0514025`.

## 2026-10-13: A8 Playwright runner and frontend gates

Fixed package resolution from `frontend/`, added a wrapper that uses the frontend-local Playwright CLI and a project-local ignored browser cache, and documented Windows PowerShell commands. Installed 1346 locked packages in frontend/ and Chromium 153 into `frontend/.playwright-browsers`.

Verified: Playwright discovered 78 tests in 7 files; suite result was 32 passed / 46 skipped in 1.4m (real-backend seeds and screenshot baselines were not run). Frontend CI unit gate: 17 suites / 97 tests passed. `npm run i18n:check` printed `i18n:check ok`. `npm run build` printed `Compiled successfully.`

## 2026-10-13: A9 Phase 1.5/1.6 security scan (committed as 67ba313)

Completed a code-level scan against each checklist item in `docs/ERP_CLOSEOUT_PLAN.md` 1.5/1.6. Existing last-owner protection, event outbox, retry/dead-letter tables, wildcard matcher, and upload size cap were confirmed. Added webhook project scopes and connected wildcard matching to every durable outbox event (0039); closed report column/filter/export and project-scope gaps; applied role/project checks to media and removed external access to unapproved photos; added upload content validation and removed archive/legacy spreadsheet types; introduced persistent login lockout and cost-12 password upgrades (0038); validated CORS and TRUST_PROXY; disabled x-powered-by; added generic 500 redaction; and added persistent per-authenticated-subject v1 rate limits after token auth (0040). The MFA/provider and AV scanning boundaries are documented in DECISIONS.md.

Focused tests: 6 suites / 76 tests pass. Full backend mock: 48 suites / 968 tests pass. `npm run lint:guards` prints `lint-guards: ok`. Real-PG and external security review are unverified. A4 remains partial, so Batch A exit is not green.

## 2026-10-13: A4 transactional audit continuation (local, not committed)

Converted equipment create/update/delete, assignment and usage-log creation; client CRUD; item create/update/soft-delete/restore; legal-document CRUD; and supplier CRUD/restore/material-link changes to write their activity row on the same transaction client as the business mutation. Generated codes and duplicate checks for new clients, suppliers and items now run inside the transaction. Equipment usage creation now also records an audit row.

Verification: `node --check` passed for all five changed route files; `git diff --check` passed; full backend mock suite passed (48 suites / 968 tests). A route-tree search then found 129 direct activity-audit call references (down from 168 at the initial A4 inventory); A4 remains incomplete and real PostgreSQL rollback behavior remains unverified because Docker Desktop is unavailable. This master-data slice is committed as `160e1a3`.

## 2026-10-13: A4 QHSE transactional audit continuation (local, not committed)

Moved all existing QHSE `logActivity` call sites into `auditedTransaction`, including quality tests, NCR creation and status/verification, safety inspections and incidents, multi-row ITP creation, WIR engine transitions, checklist templates, CAPA creation, mock-ups, calibration records, and punch-item engine transitions. ITP numbering and point inserts now share the transaction; WIR/punch workflow and outbox mutations use the transaction query passed through the domain engine.

Verification: `node --check` and `git diff --check` passed; full backend mock suite passed (48 suites / 968 tests); `npm run lint:guards` printed `lint-guards: ok`. A route-tree search then found 112 direct activity-audit call references. A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. The QHSE slice is committed as `5a635b4`.

## 2026-10-13: A4 HSE transactional audit continuation (local, not committed)

Moved all existing HSE `logActivity` call sites into `auditedTransaction`: incident and inspection creation, permit create/submit/decision, JSA and risk-assessment creation/status, toolbox-talk creation, and near-miss creation. The permit status engine transition also now runs inside a transaction. Number allocation for near misses now runs on the transaction query. Toolbox-talk PDF rendering remains after the database commit.

Verification: `node --check` and `git diff --check` passed; full backend mock suite passed (48 suites / 968 tests); `npm run lint:guards` printed `lint-guards: ok`. A route-tree search then found 102 direct activity-audit call references. A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. The HSE slice is committed as `4ff6d36`.

## 2026-10-13: A4 document-control transactional audit continuation (local, not committed)

Moved all document-control activity audit writes into the same transaction as document creation/versioning, submit/approve/reject/delete, RFI and submittal creation, document register/supersede, transmittal creation/transitions, and correspondence creation/status/amendment. Initial document version rows and transmittal item rows now share their parent transaction. RFI and submittal durable outbox events are inserted through the same transaction query.

Verification: `node --check` and `git diff --check` passed; full backend mock suite passed (48 suites / 968 tests); `npm run lint:guards` printed `lint-guards: ok`. A route-tree search then found 89 direct activity-audit call references. A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. The document-control slice is committed as `401b17a`.

## 2026-10-13: A4 site transactional audit continuation (local, not committed)

Moved site-report, engineer-instruction, site-visit, assembled-report, photo, sticky-note, and sticky-note-to-action activity writes into their business transactions. The report transaction now includes its audit alongside measurements and the durable report event; instruction number allocation and insertion share a transaction. Site engine operations receive the transaction query for multi-row changes.

Verification: `node --check` and `git diff --check` passed; full backend mock suite passed (48 suites / 968 tests); `npm run lint:guards` printed `lint-guards: ok`. A route-tree search then found 84 direct activity-audit call references. A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. The site slice is committed as `7c8dfc5`.

## 2026-10-13: A4 warehouse transactional audit continuation (local, not committed)

Moved stock movement creation/reversal, MIR quarantine release/reject, transfer creation/completion, and reservation creation/release activity writes into the business transactions. Stock balances and paired transfer movements are calculated on the same transaction client as the audit row.

Verification: `node --check` and `git diff --check` passed; full backend mock suite passed (48 suites / 968 tests); `npm run lint:guards` printed `lint-guards: ok`. A route-tree search then found 81 direct activity-audit call references. A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. The warehouse slice is committed as `16705ca`.

## 2026-10-13: A4 HR transactional audit continuation (local, not committed)

Moved employee and daily laborer creation/update, leave approval/rejection, and labor-payment activity writes into the same transaction as the change. Employee/laborer number generation now runs on the transaction query. Labor-payment audit joins its existing event-outbox transaction.

Verification: `node --check` and `git diff --check` passed; full backend mock suite passed (48 suites / 968 tests). A route-tree search then found 76 direct activity-audit call references. A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. The HR slice is committed as `0d9854b`.

## 2026-10-13: A4 materials transactional audit continuation (local, not committed)

Moved recipe and recipe-line create/update writes, replenishment-policy upsert/removal, activity rows, and recipe-change outbox events into shared transactions. Recipe headers, factor lines, audit rows, and durable recipe events now commit or roll back together. The manual replenishment sweep retains its post-run audit entry because the sweep is an independently leader-locked operation rather than one database mutation.

Verification: `node --check` and `git diff --check` passed; full backend mock suite passed (48 suites / 968 tests). A route-tree search then found 71 direct activity-audit call references. A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. The materials slice is committed as `3231bb5`.

## 2026-10-13: A4 handover transactional audit continuation (local, not committed)

Moved handover process start/transition and warranty-claim create/transition audit writes into their engine transactions. Starting handover now creates default package items in the same transaction as the process and audit. Asset-register creation also commits with its audit.

Verification: `node --check` and `git diff --check` passed; full backend mock suite passed (48 suites / 968 tests); `npm run lint:guards` printed `lint-guards: ok`. The raw route-tree grep then found 66 audit call expressions, including transactional calls; this is not a count of outstanding unconverted sites. A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. The handover slice is committed as `6f63618`.

## 2026-10-13: A4 finance transactional audit continuation (local, not committed)

Moved expense, invoice, and payment activity writes into their database transactions. Expense creation includes ledger posting, project-cost accrual, and activity in one transaction; invoice create/update/void audit joins the ledger transaction; payment create/void audit joins postings, allocation updates, status recalculation, audit events, and outbox events.

Verification: `node --check` and `git diff --check` passed for all three routes; full backend mock suite passed (48 suites / 968 tests); `npm run lint:guards` printed `lint-guards: ok`. The raw route-tree grep reports 66 audit call expressions, including transactional ones. A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. The finance slice is committed as `45cb4e1`.

## 2026-10-13: A4 consultant and work-order transactional audit continuation (local, not committed)

Moved consultant observation, RFI-response, and submittal-response activity rows into their locked engine transactions. Work-order creation/cancellation and completion verification now write activity on the same client as the corresponding mutation, progress recomputation, and verification event.

Verification: `node --check` and `git diff --check` passed for both routes; full backend mock suite passed (48 suites / 968 tests); `npm run lint:guards` printed `lint-guards: ok`. A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. This consultant/work-order slice is not committed yet.

## 2026-10-13: A4 maintenance and payroll transactional audit continuation (local, pending commit)

Maintenance reminder create/update activity rows now share the corresponding SQL transaction. Payroll creation includes details and activity in one transaction; finance posting activity joins the existing transaction with status, journal, and cost allocation. Backend verification: `node --check` for both routes and `git diff --check` exit 0; `npm test -- --runInBand` passed 48 suites / 968 tests; `npm run lint:guards` printed `lint-guards: ok`. PostgreSQL rollback verification remains unverified because Docker Desktop is unavailable. Current expected commit: per-slice commit to follow.

## 2026-10-13: A4 team assignment transactional audit continuation (local, pending commit)

Both `/api/team` and `/api/organizations/team` create/revoke paths now include the team-service mutation, policy audit event, and activity row in one transaction. `node --check` for both routers and `git diff --check` exit 0; `npm test -- --runInBand` passed 48 suites / 968 tests; `npm run lint:guards` printed `lint-guards: ok`. PostgreSQL rollback verification remains unverified because Docker Desktop is unavailable. Current expected commit: per-slice commit to follow.

## 2026-10-13: A4 portal transactional audit continuation (local, pending commit)

Subcontractor instruction acknowledgements and payment application submissions now include their activity rows in the same transaction as the portal-engine mutation. `node --check` and `git diff --check` exit 0; `npm test -- --runInBand` passed 48 suites / 968 tests; `npm run lint:guards` printed `lint-guards: ok`. PostgreSQL rollback verification remains unverified because Docker Desktop is unavailable. Current expected commit: per-slice commit to follow.

## 2026-10-13: A4 reports and client preview transactional audit continuation (local, pending commit)

Saved-view and scheduled-report creation now include activity rows in the same transactions as their inserts. Client portal preview policy/activity audit rows now share a transaction. Syntax checks and `git diff --check` exit 0; backend mock suite passes 48 suites / 968 tests; `npm run lint:guards` prints `lint-guards: ok`. PostgreSQL rollback verification remains unverified because Docker Desktop is unavailable. Current expected commit: per-slice commit to follow.

## 2026-10-13: A4 authentication transactional audit continuation (local, pending commit)

User creation, password change, and logout-all now write activity rows inside the transactions that create the user or update credentials/session version. Syntax and whitespace checks exit 0; backend mock suite passes 48 suites / 968 tests; guards pass (`lint-guards: ok`). PostgreSQL rollback verification remains unverified because Docker Desktop is unavailable. Current expected commit: per-slice commit to follow.

## 2026-10-13: A4 commercial and finance audit transaction continuation (local, pending commit)

Added `atomicAudited` and moved audit rows into mutation transactions for commercial contracts/variations/parties/guarantees/insurance/rates, payment applications/certificates, budget and forecast versions, and commitment adjustments. `node --check` and `git diff --check` exit 0; backend mock suite passes 48 suites / 968 tests; `npm run lint:guards` prints `lint-guards: ok`. PostgreSQL rollback verification remains unverified because Docker Desktop is unavailable. Current expected commit: per-slice commit to follow.

## 2026-10-13: A4 unit sales audit continuation (local, pending commit)

Unit-sale invoice activity now shares the invoice creation/posting transaction. Bulk unit creation activity now shares the generated-unit insert transaction. Syntax/whitespace checks exit 0; backend mock suite passes 48 suites / 968 tests; guards print `lint-guards: ok`. PostgreSQL rollback verification remains unverified because Docker Desktop is unavailable. Current expected commit: per-slice commit to follow.

## 2026-10-13: A4 sales and schedule transactional audit continuation (local, pending commit)

Building create/link/floor inserts, unit status changes, schedule activity create/progress, and baseline replacement now include their audit row in the corresponding transaction. Schedule progress sync errors now propagate and roll back. Syntax/whitespace checks exit 0; backend mock suite passes 48 suites / 968 tests; lint guards pass. PostgreSQL rollback remains unverified because Docker Desktop is unavailable. Current expected commit: per-slice commit to follow.

## 2026-10-13: A4 quantity measurement audit continuation (local, pending commit)

Quantity measurement creation now inserts its activity audit row in the same transaction as the measurement and derived progress updates. Syntax/whitespace checks exit 0; backend mock suite passes 48 suites / 968 tests; guards pass. PostgreSQL rollback remains unverified because Docker Desktop is unavailable. Current expected commit: per-slice commit to follow.

## 2026-10-13: A4 organization audit transaction continuation (local, pending commit)

Organization/company/departments/job-position/qualification/bank-account/performance-score mutations now insert policy audit within their write transaction; organization creation also writes activity in that transaction. Backend mock gate: 48 suites / 968 tests; `lint:guards: ok`. Frontend gates: 17 suites / 97 tests, `i18n:check ok`, production build compiled. Playwright: 32 passed / 46 skipped. Docker info returns pipe access denied; real PostgreSQL remains unverified. Current expected commit: per-slice commit to follow.

## 2026-10-13: A4 schedule CSV import transaction continuation (local, pending commit)

Schedule CSV replacement/import now processes schedule activities, relationships, and its activity audit row through one transaction query. Syntax/whitespace checks exit 0; full backend mock suite passes 48 suites / 968 tests; lint guards print `lint-guards: ok`. Real PostgreSQL rollback remains unverified because Docker Desktop is inaccessible. Current expected commit: per-slice commit to follow.

## 2026-10-13: A4 agent approval transactional audit continuation (local, pending commit)

Agent approval decisions now insert activity audit in the same transaction as the decision claim. Syntax/whitespace checks exit 0; full backend mock suite passes 48 suites / 968 tests; guards print `lint-guards: ok`. Real PostgreSQL rollback remains unverified because Docker Desktop is inaccessible. Current expected commit: per-slice commit to follow.

## 2026-10-13: A4 authentication login audit continuation (local, pending commit)

Successful login now clears the lockout counter, upgrades a legacy password hash if needed, and writes login activity inside one transaction. Backend mock suite passes 48 suites / 969 tests; `lint-guards: ok`. Real PostgreSQL rollback remains unverified because Docker Desktop is inaccessible. Current expected commit: per-slice commit to follow.

## 2026-10-13: A4 route-wide transactional audit guard (local, pending commit)

`lint:guards` now scans route `logActivity` calls for transaction query binding, with a narrow exception for the leader-locked replenishment completion audit. Added unit assertions and a clean route-wide scan. Backend suite passes 48 suites / 969 tests; `lint-guards: ok`; syntax and whitespace checks exit 0. Real PostgreSQL rollback remains unverified because Docker Desktop is inaccessible. Current expected commit: per-slice commit to follow.

## 2026-10-13: Batch A security gate closed; Batch B next

Batch A completed its full local gate. The real-PG run against a named disposable local Docker Postgres 16 database passed 56 suites / 566 tests. Backend mock passed 48/48 suites / 969/969 tests; lint guards passed; frontend passed 17/17 suites / 97/97 tests, i18n check, production build, and Playwright (32 passed / 46 skipped). The final PG-discovered fixes were committed separately: `dd268d4` (A1 date normalization), `2d757b7` (A5 typed finance errors), and `80c9005` (A7 actor FK restrictions). See `docs/CLOSEOUT_LOG.md` for exact command summaries and the skipped Playwright coverage. Next: Batch B fresh local Docker compose/staging work; no staging smoke or backup/restore has run yet.
## 2026-10-13: Batch B1 Compose foundation

Built and started an isolated local Compose pilot on `127.0.0.1:8090` using project `erp-closeout-pilot-20261013`. Database, API, and frontend all became healthy; API reports database healthy, runs as `node`, and DB/uploads are separate named volumes. The migration service completed on the empty volume. Root `.env.docker` was generated by the new script and is git-ignored. Next: B2 staging role/user seed with database/app-environment guards, then B3 demo data, B4 end-to-end smoke, B5 backup/restore, B6 instructions.
## 2026-10-13: Batch B2 staging seed

The guarded staging seed passed against the local pilot. It created 35 users across 33 canonical roles, a project, requester/checker identities, unassigned and expired-assignment cases, and supplier/client organization seats. A second run bumped the procurement officer token version from 0 to 1, retained 34 project assignments, one expired assignment, zero assignment rows for the unassigned user, and two organization seats. Production-mode refusal was verified. Generated credentials remain in git-ignored `.staging-users.json`. Next: B3 procurement demo data, then B4 flow smoke.
## 2026-10-13: Batch B3 demo procure-to-pay data

The idempotent demo-data seed passed twice. Verified 3 materials, cost codes, supplier rates, 1 warehouse, 3 stock rows, and 3 BOQ lines (total EGP 1,376,500). Backend mock passed 49 suites / 972 tests; lint guards passed. Next: implement and run B4’s local API smoke across requester/checker, PR→RFQ→quotes→award→approval→PO→partial receipt→MIR/GRN→supplier invoice/payment, file access checks, locale headers, journal balance, and reconcile checks.
B3 follow-up: added a second fictional supplier and alternative prices; verified two pilot suppliers and six supplier/material rates. This enables the B4 bid comparison path. The earlier single-supplier B3 log is historical; current seed state has two suppliers/six rates.
## 2026-10-13: Batch B4 local procure-to-pay smoke

The local-only staging smoke passed at `http://127.0.0.1:8090`. It logged into the 33 canonical roles plus staging edge/workflow accounts; checked unassigned, expired-assignment, and cross-project denial; checked EN/AR headers; ran PR → RFQ → two quotations → comparison → award recommendation → checker/authority approval → PO → partial delivery → MIR/GRN → matched supplier invoice → allocated payment; uploaded and scoped a PDF; checked balanced journals, project cost, unchanged out-of-scope data, reconciliation, and logout revocation. No credentials or tokens were printed.

The journey found and fixed two defects: MIR creation now carries the PO project ID so scoped inventory approval resolves correctly, and logout-all uses an authenticated self-session guard because it only changes `req.user.id` and is not a business permission.

```text
npm --prefix backend run smoke:staging
[PASS] health: API ready and database healthy
[PASS] login: 33 canonical roles and 5 staging edge/workflow accounts
[PASS] RBAC: no-assignment and expired-seat users receive 403; cross-project actor is scoped to its own project
[PASS] EN/AR: Accept-Language en/ar requests both include bilingual project names
[PASS] P2P: PR → RFQ → 2 quotations → comparison → award recommendation → separate checker/authority approval
[PASS] P2P: approved PO → partial delivery → MIR/GRN → matched supplier invoice → payment allocation
[PASS] media: uploaded PDF is readable by its uploader and denied outside project scope
[PASS] reconcile: 0 unbalanced chain entries; out-of-scope project unchanged; project cost view updated
[PASS] npm run reconcile
[PASS] logout: checker token revoked and rejected
STAGING_SMOKE_OK base=http://127.0.0.1:8090 project=PILOT-PTP-001 pr=13 rfq=13 po=12 grn=4 invoice=4 payment=4
```

The backend image build completed its mock gate (49 suites / 958 tests; 56 PG suites skipped in the image build). Focused route/isolation tests passed 2 suites / 424 tests. A local `pg_dump` restore was verified with 305 tables in an isolated temporary DB, then the temporary DB and dump were removed. B5's repeatable script, migrate dry-run, data-cleaning report, and before/after counts remain in progress.

B4 final verification: the backend mock gate passed 49 suites / 958 tests (56 PostgreSQL suites skipped), `npm run lint:guards` printed `lint-guards: ok`, and the fresh isolated Postgres 16 test database passed `npm run test:pg` with 56 suites / 566 tests. It was built by applying all 103 migrations to an empty container and was removed after testing. The MIR project-scope assertion passed in the golden-chain PG suite.

## 2026-10-13: Batch B5 backup/restore rehearsal

The guarded rehearsal backed up the local staging database and uploads, restored the DB into a differently named temporary database, compared all table counts and 226 sequence maxima, ran 103-entry migration dry-run, reconciliation, and the data-cleaning report, then removed the temporary restore database and in-container dump. Database row counts matched exactly (3,323 across 237 tables); all reconciliation counts were zero; data-cleaning report was empty. The retained local backup bundle and full JSON count/sequence snapshot are in the printed OS temp directory. Focused tests: 1 suite / 2 tests passed; syntax check and backend guards passed. B6 Windows PowerShell instructions and the full end-of-B gate remain.

B6 documents the verified local workflow in `docs/STAGING.md`, including localhost endpoints, staging seed behavior, smoke/rehearsal commands, health checks, generated credential locations, and safe stop/restart. `git diff --check` passed. Next: full end-of-Batch-B gates across backend, real PostgreSQL, frontend CI/i18n/build, Docker health, and Playwright.

## Batch B exit (2026-10-13)

B1–B6 are committed and all required Batch B gates passed. Backend mock: 50 suites / 960 tests; real PG: 56 suites / 566 tests on an empty, freshly migrated disposable PostgreSQL 16 container; frontend: 17 suites / 97 tests; i18n and production build passed; Playwright: 32 passed / 46 skipped; local Compose health is ready/healthy. Full B4 smoke and B5 backup/restore outputs are recorded above. Next: Batch C UI kit and procure-to-pay screens.

## 2026-10-13: Batch C1 shared form and UX kit

Added reusable form validation and server field-error mapping, accessible validated fields, a toast provider/hook, a permission-aware action wrapper, and localized upload controls with configurable per-file size and file-count limits. Existing reason/confirm dialogs and loading/empty/error states remain part of the kit. Added English and Arabic common labels and RTL-safe toast styling. Client upload limits improve feedback; backend validation remains authoritative.

```text
npm run test:ci
Test Suites: 20 passed, 20 total
Tests:       103 passed, 103 total

npm run i18n:check
i18n:check ok
```

## 2026-10-13: Batch C2 procurement workspace (implementation in progress)

Added a project procurement workspace covering requisitions, RFQs and quotations, bid comparison and award, purchase orders, deliveries/MIR/GRN, supplier invoices, AP payments, project spend, and vendor performance. Added a project-scoped supplier invoice register endpoint; the query is constrained by the selected PO project and the caller's assigned project scope. RFQ bid comparison now uses the effective policy action for supplier-value access. English and Arabic labels/errors and responsive styles are included.

Focused verification:

```text
frontend: npm test -- --watchAll=false --runInBand src/components/project/ProcurementWorkspace.test.js
1 suite passed; 1 test passed

frontend: npm run i18n:check
i18n:check ok

frontend: npm run build
Compiled successfully.

backend: node --check src/routes/procurement.js
backend: node --check src/services/policy.js
backend: node --check src/scripts/smoke-staging.js
all syntax checks exited 0

backend: npm test -- --runInBand src/scripts/__tests__/module-override-coverage.test.js
1 suite passed; 4 tests passed (includes the comparison supplier-value policy action)

git diff --check
clean
```

An earlier local staging API journey passed the PR-to-payment path and project invoice register checks, then stopped at the existing reconcile child-process launch (`spawnSync node.exe EPERM`). It does not count as a clean full smoke result. This phase also exposed that the backend Docker runtime image build automatically runs its full mock suite: 50 suites / 960 tests passed, 56 PostgreSQL suites skipped. That suite run was incidental to the image build; future phase work will use ticket-focused checks and reserve broad gates for batch exits, following the user's requested cadence.

Batch C2 commit: `3893bc6` (`Batch C2: add project procurement workspace`).

## 2026-10-13: Batch C3 effective-permission navigation (implementation in progress)

Login now returns the user's effective `(module, action)` grants along with its existing module list. The sidebar uses those grants to hide inaccessible destinations, requires `see_supplier_value` for the RFQ comparison link, and treats an explicit empty grant set as no module access. Legacy module-only sessions can still show ordinary view destinations, while action-specific destinations fail closed. The inventory, agent activity, and external portal links now use their policy module keys.

Focused verification:

```text
frontend: npm test -- --watchAll=false --runInBand src/components/layout/Shell.i18n.test.js
1 suite passed; 16 tests passed

backend: node --check src/routes/auth.js
exit 0

git diff --check
clean
```

Batch C3 commit: `df7047c` (`Batch C3: filter navigation by policy grants`).

## 2026-10-13: Batch C4 procurement browser journey (implementation in progress)

Added a focused Playwright journey that opens project operations, creates a project-scoped purchase request with a line, submits it, and verifies its submitted status and that the draft submit action disappears. The API is mocked in this browser test; backend scoping is covered by the C2 local API assertions.

```text
npm run test:e2e -- --project=desktop-chromium e2e/procurement-workspace.spec.js
1 passed (4.2s)
```

The first invocation was blocked before test startup by `spawn EPERM`; the local process-permission retry ran only this one test and passed. Initial locator assertions were tightened based on the rendered table/action state.

### C3 follow-up: project tabs and project seats

Removed `projectNav`'s hard-coded role map and FULL fallback. The login grant projection now retains each grant's `project_id`; project group/sub-tab visibility and financial figures use those effective grants. Focused checks passed: project nav/shell/sidebar, 3 suites / 26 tests; `project-page.spec.js`, 6/6 across desktop and mobile (English owner, scoped site engineer, Arabic RTL).

## 2026-10-13: Batch C4 live procure-to-pay journeys

The real local API and disposable pilot database now pass the complete browser journey with a requester and separate workflow actors: purchase request and approvals, RFQ with two quotations, award recommendation/approval, PO workflow, delivery, MIR checker acceptance, GRN, supplier invoice approval, and payment allocation. The workspace now offers material selection for PR/RFQ lines, joins delivery/GRN read models through project purchase orders, and starts PO approval through the existing workflow route with an audited state change. A real unassigned pilot session receives HTTP 403 from the project procurement endpoint.

Focused verification:

```text
Playwright real backend: EN desktop 1/1, EN mobile 1/1, AR desktop 1/1, AR mobile 1/1
Playwright denied access: 1/1 (unassigned account, procurement project endpoint returns 403)
frontend ProcurementWorkspace.test.js: 1 suite / 1 test
npm run i18n:check: passed
npm run build: compiled successfully
node --check backend/src/routes/procurement.js: passed
Read-only database reconciliation: 11 checks, 0 violations
git diff --check: passed
```

The first live-browser attempts exposed local API CORS setup, form buttons without explicit submit types, and workflow actors that needed to match each configured resolver. Those issues were corrected before the four final runs. The journey uses separate accountant, purchasing manager, finance manager, inventory checker, and requester/owner roles as the workflow requires. No full suite was run for this slice, following the user's test cadence.

Batch C is complete. Next: D UAT pilot instructions, E provisional finance mapping/UI/docs with finance owner confirmation still pending, then the Phase 5.6–6 plan and implementation.

## 2026-10-13: Batch D UAT preparation

Added `docs/UAT_PILOT.md` with the pilot scope and finance-posting exclusion, seeded account keys (no passwords), role scripts and expected results, access/localization/negative-access checklist, known deferred work, defect template, and signoff table. The pilot project and startup/smoke instructions link to `docs/STAGING.md`. The receiving script names `workflow_owner` because the seeded `storekeeper` lacks procurement-workspace view access. Human UAT has not been run; the checklist is ready for the business testers. `git diff --check` passed. No automated tests were needed for this documentation-only slice.

## 2026-10-13: Batch E1 provisional GL mapping foundation

Migration `0042_provisional_gl_account_mappings.sql` adds confirmation metadata to existing `gl_account_map` rows, adds provisional account keys for retention/advance/deductions/subcontractor cost, and adds a one-certificate-to-one-client-invoice link. It does not rewrite journal history or backfill postings. The owner/admin Settings page can inspect and edit mapped active accounts; owner confirmation is a separate owner-only audited operation, and every edit resets the row to provisional. EN/AR labels are present. Existing chart codes supply initial local mappings, all expressly unconfirmed in code, the UI, and `docs/DECISIONS.md`.

Focused evidence: migration runner applied exactly one migration and skipped 103 already-applied migrations on the loopback staging DB; backend mapping service tests passed 1 suite / 4 tests; Settings/shell i18n tests passed 1 suite / 17 tests; `npm run i18n:check` passed. No full suite was run. Remaining work at that point was certificate posting and invoice lines.

## 2026-10-13: Batch E1/E2 certificate postings and invoice lines

Client certificates now create a linked draft invoice after final workflow approval. The invoice stores bilingual, typed certificate lines and exposes them in its detail response. Posting on invoice issue separates receivable, revenue, output tax, retention, advance recovery, and deductions; a void reverses the entry and ledger memo movements. Certified subcontractor certificates post balanced cost, input tax, payable, retention, advance recovery, and deduction lines. Certificate void requires a reason, blocks paid certificates, reverses subcontractor postings, and requires a linked client invoice to be voided first. Posting paths are idempotent.

Focused verification: migration runner applied `0043_subcontractor_certificate_postings.sql` (1 applied, 104 already applied) on the loopback staging DB; `certificate-gl-posting.test.js` passed 1 suite / 5 tests, covering client/subcontractor entries, invalid balance rejection, bilingual invoice line persistence, and invoice-line total validation; `node --check` passed for the changed backend services/routes. No broader suite or full live certificate workflow was run. Account purposes remain provisional until finance-owner confirmation.

## 2026-10-13: Batch E3/E4 lot returns and forecast approval

Supplier-return lines now retain their source GRN line and stock lot. A lot-tracked return must name the source GRN line; the outbound movement uses that exact lot and retains the existing GRN cost reversal posting. Return-limit and missing-lot errors use typed codes, and creating a return now writes activity audit inside the transaction. Migration `0044_lot_specific_supplier_returns.sql` adds nullable source-line/lot references so existing rows are preserved.

Forecast approval now enforces the existing finance maker/checker rule. When a project has an approved forecast, its approved line total supplies the forecast target for ETC; EAC remains actual plus accrued plus ETC and cannot fall below current cost to date. The prior budget/commitment ETC formula remains active when no forecast is approved.

Focused real-Postgres evidence on the disposable `construction_erp_closeout_test_20261013` database: supplier-return tests passed 3/3 (accepted-quantity bounds, concurrency, and the exact source-lot return); commercial/finance tests selected for forecast, credit-note regression, role matrix, and certificate tie-out passed 4/4; the earlier procurement-locking test file passed after the typed-error correction. Migration runner applied 0044 (1 applied, 105 already applied). No full test suites were run.

## 2026-10-13: Batch E5 finance workbench and retention release

Added a project Finance workbench for applications/certificates, budget and forecast versions, client and supplier credit notes, payment batches, and retention releases. Retention releases are project-scoped, idempotent, capped by journal-backed retention holds, posted to the ledger, and voidable with a reason and reversing journal entry. The legacy retention endpoint no longer accepts direct releases.

Migration `0045_retention_release_postings.sql` applied to the local staging and disposable test databases. Focused real-Postgres tests passed 2/2 for certificate/ledger tie-out and client/subcontractor release posting, balance caps, idempotency and void reversal. The Finance workbench test passed 1/1; `i18n:check`, production build, backend syntax checks and `git diff --check` passed. No full suite was run, following the user's test cadence. Finance account mappings remain provisional pending owner confirmation, and human UAT remains outstanding.

## 2026-10-13: Phase 5.6–6 code audit and execution plan

Audited `docs/ERP_CLOSEOUT_PLAN.md` lines 275–343 against current routes, migrations, services, frontend routes and screens. The detailed status and ticket acceptance criteria are in `docs/PLAN_5_6_TO_6.md`. The audit corrected stale items: incident-table migration/compatibility view, schedule entities, handover records, project setup APIs, project navigation, procurement and finance workspaces already exist. Remaining work is scoped to missing workflow behavior, formal portal registers/forms, record links/register gaps, remaining prompt flows, and provider/token/session decisions. The dedicated plan is committed before Phase 5.6 implementation begins. Per the user's cadence, each ticket will use focused checks; broader verification is reserved for phase integration gates.

## 2026-10-13: Phase 5.6.1 observation record completeness

Added migration `0046_observation_record_completeness.sql` for observation due dates and drawing links. Observation creation now verifies drawing type/project/consultant visibility, validates same-project locations and actor-owned uploaded evidence, and records before/after photos in the shared photo model. Consultant media reads require the matching assigned organization and project. The portal's raise-observation prompt is now a bilingual scoped form with due date, drawing selection/reference, severity and separate before/after uploads. Date-only fields are normalized to prevent timezone shifts in JSON.

Focused verification: isolated PostgreSQL migration applied; real-Postgres observation test passed 1/1; consultant and media-access tests passed 2 suites / 18 tests; portal observation-form test passed 1/1; i18n check and production build passed; backend syntax checks and `git diff --check` passed. No full suite was run.

## 2026-10-13: Phase 5.6.2 formal WIR inbox and SLA read

The consultant inbox and dashboard now take WIR reviews from the formal `wirs` register at `consultant_review`, replacing the legacy `sub_work_verifications` dashboard read. Inbox results include the drawing reference and inspection date. A due timestamp is based on the configured active consultant workflow step (`opened_at + sla_hours`); without both values it stays null.

The consultant portal also now supports `POST /api/consultant/wirs/:id/result`. It checks the formal WIR's project assignment while holding the row lock, calls the QA/QC engine, and writes both the activity audit and workflow action history in the same transaction. The consultant portal gets a typed not-found response for WIRs outside its project assignment.

The consultant inbox now includes variations at their formal consultant recommendation step and certificates at the consultant review step, and the portal exposes localized approve/reject actions. Consultant writes recheck project assignment and link to formal workflow action history. A certificate remains in finance review after the consultant recommendation; finance approval alone finalizes certification and downstream posting. Migration 0047 backfills the consultant review permissions that were already declared in the role policy for fresh installs.

Focused checks: `consultant-observation.pg.test.js` passed 5/5, including the real scoped WIR decision HTTP route; the named finance certificate lifecycle test passed 1/1 and kept consultant recommendation separate from finance finalization. Consultant/QHSE/scope mock tests passed 35/35; policy module/action tests passed 4/4; portal UI passed 2/2; `i18n:check` passed. Migration runner applied 0047 (1 applied, 108 already applied). An initial migration-era role grant mismatch and fixture issues were corrected before the passing runs. A forced Jest shutdown showed a Windows libuv assertion after PASS, so the route test was rerun without force and exited 0. No full suite was run. Engineer-instruction recommendations and SLA administration remain open in 5.6.2.
