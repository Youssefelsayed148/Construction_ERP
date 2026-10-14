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

Focused checks: `consultant-observation.pg.test.js` passed 6/6, including real scoped WIR and engineer-instruction recommendation routes; the named finance certificate lifecycle test passed 1/1 and kept consultant recommendation separate from finance finalization. Consultant/QHSE/scope mock tests passed 35/35; policy module/action/scope tests passed 9/9; portal UI passed 2/2; `i18n:check` passed. Migration runner applied 0048 (1 applied, 109 already applied). An initial migration-era role grant mismatch and fixture issues were corrected before the passing runs. A forced Jest shutdown showed a Windows libuv assertion after PASS, so the route test was rerun without force and exited 0. No full suite was run. SLA administration remains open in 5.6.2.

## 2026-10-13: Phase 5.6.2 engineer-instruction recommendations

Added migration `0048_engineer_instruction_recommendations.sql` with a single linked recommendation record per instruction. Consultants see unreviewed issued/acknowledged instructions in My Reviews and can submit an approve/reject recommendation with a comment. The endpoint checks the consultant role and assigned project under a row lock, refuses a second recommendation or instructions outside the eligible lifecycle states, and records activity audit in the same transaction. The instruction's issued/acknowledged/implemented/closed lifecycle remains owned by the site instruction register. Policy maps the endpoint action and resolves its target instruction project. The portal exposes localized labels already used by its recommendation controls.

Focused verification on the disposable local PostgreSQL database: migration 0048 applied (1 applied, 109 already applied); `consultant-observation.pg.test.js` passed 1 suite / 6 tests; module override and record-scope tests passed 2 suites / 9 tests; `PortalDashboard.test.js` passed 1 suite / 2 tests; `npm run i18n:check` returned `i18n:check ok`; changed backend JavaScript passed `node --check`; `git diff --check` passed. The first HTTP fixture returned 403 because it omitted the consultant's project permission row; the fixture was corrected and all 6 PG tests then passed. No full suite was run.

## 2026-10-13: Phase 5.6.3 RFI/submittal response compatibility

Migration 0049 backfills existing legacy RFI and submittal answers into the revision tables without changing source fields. The internal legacy write routes and their v1 paths return typed HTTP 410 responses with replacement routes. Consultant history reads return the register record, latest history entry, and ordered history; API v1 now maps these reads and the staged RFI writer. The staged endpoint accepts acknowledgement as supported by the underlying service.

Focused checks: `consultant-observation.pg.test.js` passed 7/7 (including a repeated backfill, staged acknowledgement, history order, v1 parity, cross-project denial and legacy write refusals); v1 router remount check passed 1/1; policy module/action and record-scope tests passed 9/9. Migration 0049 applied to the disposable PostgreSQL database (1 applied, 110 already applied). No full suite was run.

### 5.6.4 Client project actions and assignment expiry

Client variation approve/reject actions now use the formal variation workflow, and client-visible project documents can be acknowledged through a new audit register. Actions recheck the actor's active client organization assignment while holding the target record lock. The acknowledgement records actor, organization, comment, and time, updates document status, and refuses repeats; workflow responses append workflow action history. API activity audit is part of the same transaction. Role permission backfill, record-scope rules, v1 mappings, and the bilingual client action center are in place. Read-only client preview does not expose action buttons.

Focused checks: `client-actions.pg.test.js` passed 4/4, covering active multi-project assignments, expiry and other-organization denial, variation workflow actor/history, document acknowledgement and duplicate refusal, and the HTTP audit. Client portal and policy module/action/scope tests passed 19/19; `PortalDashboard.test.js` passed 3/3; v1 router remount check passed 1/1; `i18n:check` and changed-file syntax/diff checks passed. Migrations 0050 and 0051 plus the policy grant update applied to the disposable PostgreSQL database. No full suite was run.

### 5.6.5.a Subcontractor submission intake and history

Added strict intake validation for WIR/MIR requests, manpower/equipment reports, NCR/observation responses, and variation quotes. Every submission must name the actor's awarded package; any related NCR, observation, or variation must belong to that same project and package. The portal stores intake only, leaving formal register state to internal review. The new history endpoint scopes results to the assigned organization/project pairs and allowlists response fields, including legacy payload redaction. The form provides EN/AR labels, package and related-record selectors, validation, submit/error states, and a history/status register. Migration 0052 creates and backfills external portal action grants. The supplier compliance panel now distinguishes expired, within-30-day, and within-90-day documents in EN/AR.

Focused results: `subcontractor-submissions.pg.test.js` passed 2/2; `portal.test.js` and `policy-migration.test.js` passed 35/35; `PortalDashboard.test.js` passed 5/5; the v1 router remount check passed 1/1; `i18n:check` passed. Migration runner applied 0052; after restoring the unchanged policy migration helper checksum it reported 1 applied, 113 already applied. No whole suite was run.

### 5.6.5.b Formal subcontractor WIR and supplier MIR registers

The subcontractor dashboard now returns formal WIR number, status, result, and inspection date scoped to active package projects and the assigned subcontractor organizations. The supplier dashboard exposes MIR number, status, project, and decision date only through that supplier's delivered purchase orders. Both registers render in the portal with EN/AR labels and localized lifecycle states. No migration was needed.

Focused results: `portal.test.js` passed 15/15; `subcontractor-submissions.pg.test.js` passed 3/3, including the real-PostgreSQL WIR scope check; `PortalDashboard.test.js` passed 5/5; and `i18n:check` passed. No full suite was run.

### 5.6.5.c Subcontractor RFI and submittal forms

Replaced the RFI and submittal creation prompts with EN/AR forms. Each form selects an awarded package from the caller's dashboard and derives its project ID from that package; RFI fields include question, priority and optional response date, while submittal fields include type and recipient. Errors render in the form and duplicate record IDs are not entered by hand.

Focused results: `PortalDashboard.test.js` passed 7/7, including scoped RFI payload and submittal type/recipient coverage; `i18n:check` passed. No backend or whole-suite tests were needed for this frontend-only change.

### 5.6.5.d Scoped RFI acknowledgement and submittal resubmission

The subcontractor portal now selects RFIs from its package-scoped dashboard records for acknowledgement, and returned submittals from a separately scoped list for resubmission. The dashboard only offers resubmittal records with `resubmit_required` status that belong to one of the caller's packages. Both actions use bilingual forms and visible error handling.

Focused results: `portal.test.js` passed 16/16, including a cross-package resubmittal-list isolation case; `PortalDashboard.test.js` passed 8/8, including both action payloads; `i18n:check` passed. No full suite was run.

### 5.6.5.e Package acknowledgements, quantity claims and payment forms

Replaced the remaining subcontractor package/instruction acknowledgement, quantity claim and payment application prompts. Package and instruction actions use active assigned records from the dashboard; quantity claims derive the BOQ item from the selected awarded package, and payment applications derive both project and package IDs from that same assigned package. Date, quantity and monetary fields have client validation, and failures are shown in EN/AR.

Focused results: `portal.test.js` passed 17/17, including issued instruction scope; `PortalDashboard.test.js` passed 9/9, covering the four form payloads; `i18n:check` and `git diff --check` passed. No full suite was run.

### 5.7.1 Canonical incident readers and legacy conversion evidence

QHSE incident GET/POST/PUT and site daily-report aggregation now use `incidents`. The `safety_incidents` compatibility view remains owned by the HSE migration for legacy consumers. The migration regression now verifies exact imported row IDs and values, parity through the view, idempotent rerun, and sequence continuation past migrated IDs.

Focused results: the targeted `migration-runner.pg.test.js` case passed 1/1; the targeted site daily-report census case passed 1/1; the scan for internal `safety_incidents` SQL in routes/services returned no matches. No full suite was run at this ticket boundary.

### 5.7.2.a RFI project context and impact fields

Added nullable location, work-package, cost-impact and schedule-impact fields with versioned migration 0053. RFI create validates optional location/package IDs belong to the selected project in the audited transaction; the document register read includes reference names and impact values. The RFI form selects project-owned locations/work packages and captures both impacts in EN/AR. Consultant inbox rows display the added context. The subcontractor portal continues returning only its allowlisted RFI fields, with a test that excludes cost/schedule impacts. Existing finance workbench, observation register and document transmittal/register implementations were retained instead of introducing duplicates.

Focused results: `rfi-impacts.pg.test.js` passed 2/2; backend `consultant.test.js` + `portal.test.js` passed 30/30; frontend `ProjectDocuments.test.js` + `PortalDashboard.test.js` passed 10/10; `WorkPackageSelect.test.js` passed 4/4; `i18n:check` passed. Migration 0053 applied to the disposable PostgreSQL database (1 applied, 114 already applied). No full suite was run.

### 5.7.2.b QA/QC certificate register

The finance workbench's payment certificates are separate from the certificate register required by QA/QC spec 15. Added migration 0054 and a project-scoped QA/QC certificate register with generated numbers, type, issuer, issue/expiry dates, active/superseded/revoked state, and optional same-project controlled-document and MIR links. Added the EN/AR QHSE register tab. Reads and writes enforce project assignment; writes are audited transactionally.

Focused results: migration output was `[migrate] 0054_qaqc_certificate_register.sql ...` and `[migrate] all migrations completed (1 applied, 115 already applied)` on the disposable PostgreSQL database. `qaqc-certificates.pg.test.js` passed 3/3 (register/list/update, cross-project links, project scope); `QHSECertificatesTab.test.js` passed 2/2; `i18n:check ok`; `node --check src/routes/qhse.js` exited 0. No full suite was run.

### 5.7.2.c Controlled-document register fields and confidentiality

Migration 0055 adds controlled-document `issue_date` and a `confidentiality` classification alongside the existing `portal_visibility` audience field. Existing external visibility grants are backfilled as public. New/updated document metadata rejects non-public documents with external audiences; portal dashboards, consultant drawing links, search, acknowledgements and protected media apply the public classification check. The document upload form captures the controlled register type, discipline, issue/review dates, classification, audience, location/package and organization references. External portal search/media tests cover confidential denial. Date-only request values are validated without timezone coercion and normalized on API responses.

Focused results: migration output was `[migrate] 0055_document_register_confidentiality.sql ...` and `[migrate] all migrations completed (1 applied, 116 already applied)` on the disposable PostgreSQL database. `document-register-fields.pg.test.js` + `qaqc-certificates.pg.test.js` + `client-actions.pg.test.js` + `consultant-observation.pg.test.js` passed 4 suites / 16 tests; `media-access.test.js` + `client-portal.test.js` + `consultant.test.js` + `portal.test.js` + `doccontrol.test.js` passed 5 suites / 60 tests; `ProjectDocuments.test.js` passed 2/2; `i18n:check ok`; `node --check` passed for the changed backend routes/services/utils. No full suite was run.

### 5.7.2.d Transmittal form and project scope

The project transmittal form now loads active project participant organizations and controlled documents, captures a recipient, purpose, attention, response date and selected document items, and shows recipient and item count in the list. The API validates recipient and document project ownership, scopes recipient/list/detail/status/PDF/item access, and audits item additions transactionally. No schema migration was needed.

Focused results: frontend `TransmittalsTab.test.js` passed 1/1; backend `doccontrol.test.js` passed 13/13; real-PostgreSQL `transmittals-project-scope.pg.test.js` passed 3/3 for same-project create/read, cross-project recipient/document rejection and caller project scope; `i18n:check ok`; backend route and PG test syntax checks plus `git diff --check` passed. No full suite was run.

### 5.7.3 Schedule progress history and resource assignments

Migration 0056 adds an attributed progress-update history and dated schedule assignment records for project employees and registered project assets. Progress writes now preserve before/after percentages, source, data date, note and actor in the same transaction as the activity update. Assignment APIs validate full-period project membership/asset ownership, prevent concurrent overlapping assignments for the same employee or asset, and enforce planned → active → completed/cancelled lifecycle transitions. The schedule screen exposes progress history and bilingual resource assignment controls. Date-only API values round-trip without timezone shifts.

Focused results: migration runner applied 0056 (1 applied, 117 already applied) to the disposable PostgreSQL DB; the idempotent rerun reported 0 applied, 118 already applied. `schedule-progress-assignments.pg.test.js` passed 3/3 for progress attribution/history, employee and asset assignments, overlap/lifecycle handling and project-scope denial. Existing `planning.test.js` passed 12/12; `Schedule.test.js` passed 2/2; `i18n:check ok`; changed backend JavaScript and PG test passed `node --check`; `git diff --check` passed. `i18n:parity` reports seven existing missing `common.suppliers` keys in `ProcurementWorkspace.js` and no schedule key errors. No full suite was run.

### 5.7.4 Handover evidence and warranty register

Migration 0057 adds a controlled-document link to handover package items, an asset-document register, and a standalone warranty coverage register. Existing complete asset warranty date pairs are backfilled idempotently; legacy issuer/document gaps are recorded in notes. The package, asset, and warranty forms upload through the existing endpoint, create internal controlled project documents, and store project-document links. The warranty register supports project/asset/package association, issuer, coverage, date validation, generated numbers, expiry display, and audited void/reactivate actions. Reads and writes enforce project scope and reject cross-project links; the handover page now shows loading, error/retry, and empty states.

Focused results: migration 0057 applied to `construction_erp_closeout_test_20261013` (1 applied, 118 already applied); idempotent rerun reported 0 applied, 119 already applied. `handover-documents-warranties.pg.test.js` passed 1 suite / 3 tests covering controlled-document links, active/expired/void warranty state, missing evidence, cross-project rejection, and project-scope denial. `Handover.test.js` passed 1 suite / 1 test for evidence upload/document registration and warranty creation. `i18n:check ok`; backend route/PG test `node --check` passed; `git diff --check` passed. `i18n:parity` reports the same seven existing missing `common.suppliers` keys in ProcurementWorkspace and no handover-key issues. No full suite was run.

### 5.8.1 API tokens, agent sessions, and action comments

Migration 0058 adds user-bound opaque API tokens, durable MCP sessions and action-item comments. Personal API tokens are owner/admin-issued only for the actor, use the `construction-erp:api-v1` audience and explicit non-wildcard v1 family scopes, return the secret only once, and store a SHA-256 hash. Default expiry is 30 days (maximum 90); user token-version changes, expiry and revocation fail closed. MCP now creates UUID sessions server-side, binds them to the bearer identity, audits creation/resume/expiry, and rejects malformed, foreign, expired or closed sessions. Owner/admin session oversight can move active records to completed/revoked. Action comment reads and appends are audited; access inherits the action's project policy and external portal roles are denied. The v1 comments endpoints enforce `actions:read` or `actions:write`.

Focused results: migration 0058 applied on `construction_erp_closeout_test_20261013` (1 applied, 119 already applied); rerun reported 0 applied, 120 already applied. `agent-platform-records.pg.test.js` passed 1 suite / 3 tests for one-time/hash/scope/expiry/revocation, v1 scope enforcement, session ownership/expiry, and project-scoped comment read/write. The named session case in `mcp-safety.pg.test.js` passed 1/1. `lint:guards` reported `ok`; changed backend route/service/test syntax and `git diff --check` passed. No full suite was run.

### 5.8.2 Notification delivery status and retry — verified locally

Added migration 0059 for durable delivery attempts and linked inbox rows; implemented stable event/user/channel idempotency, preference suppression, bounded retry state, safe email console/unconfigured placeholders, and caller-owned delivery status/retry endpoints. Manual retry is audited transactionally. No provider performs an external send. Fixed the partial unique-index conflict target discovered by the focused PostgreSQL test. Added migration 0060 so hard deletion cannot detach controlled-document evidence from a handover package item.

Verification: fresh Postgres 16 database `erp_closeout_pg_final_20261013202700` on port 55471 applied all 122 migrations through 0060. The focused delivery PG test passed 3/3. Backend mock passed 53/53 suites and 999/999 tests; full PG passed 67/67 suites and 605/605 tests; `lint-guards: ok`; frontend CI passed 28/28 suites and 107/107 tests; `i18n:check ok`; production build passed; Playwright passed 34 and skipped 50 configured backend-seeded/screenshot tests. The local pilot smoke was blocked by automatic review because the requested script reads the explicitly prohibited `.env.docker` and `.staging-users.json` files. Verification used runtime-generated credentials; no credential values were written to tracked files or printed.

### Phase 6.2 — typed-name delete confirmation slice

Replaced the exact-name deletion prompts on Assets, Clients, Expenses, and Legal with the shared accessible ConfirmDialog. The confirmation input focuses when opened, the destructive action remains disabled until the exact record name is entered, and the prompt copy is in the paired EN/AR common catalog. Current prompt inventory changed from 48 calls across 16 page files to 40 calls across 12 page files; Phase 6 remains open.

Verification: `Shell.i18n.test.js` passed 18/18; `i18n:check ok`; frontend production build compiled successfully; `git diff --check` passed. No full frontend suite or browser journey was run for this slice.

### Phase 6.2 — HR deletion confirmations

Converted employee and daily-laborer deletion prompts to the shared typed-confirmation dialog. Current scan: 36 calls across 11 page files (from 40 across 12 after the previous slice).

Verification: `Shell.i18n.test.js` passed 18/18; `i18n:check ok`; frontend production build compiled successfully without ESLint warnings; `git diff --check` passed. No HR-specific page test exists in the current frontend test inventory.

### Current-source audit reconciliation

Revalidated D1-D15 leads against current code after the 5.8.2 changes. Several old findings are fixed or superseded (webhook SSRF/secret handling, approval limits, procurement/finance UI callers, invoice lines, forecast controls, supplier-return lot links, project permission navigation, test-user seeder). Remaining confirmed leads and evidence are listed in `docs/CARRYOVER.md`; the original user audit report is left untouched.

### Phase 6.2 — shared single-field text entry

Added a reusable accessible text-entry dialog with required-field validation, submit/error state, focus behavior, and EN/AR catalog labels. Replaced prompts for new handover claim titles, saved report-view names, and site-photo captions. The live prompt scan now finds 33 calls across 8 files.

Verification: `Shell.i18n.test.js` and `Handover.test.js` passed 2 suites / 20 tests; `i18n:check ok`; frontend production build compiled successfully; `git diff --check` passed. The Handover test now uses a stable translation mock to avoid a test-only effect loop.

### Phase 6.2 — approval and NCR notes

Converted inline approval decision notes and NCR resolution notes to `TextEntryDialog`, retaining optional approval notes and required resolution notes. Current scan: 31 prompt calls across 6 files.

Verification: `Shell.i18n.test.js` passed 19/19; `i18n:check ok`; frontend production build compiled successfully; `git diff --check` passed. No Approvals or QHSE page-specific test exists in the current frontend test inventory.

### Phase 6.2 — submittal response reasons

Converted rejected/revised submittal reason entry to `TextEntryDialog`; response remains optional as before. Current prompt scan: 30 calls across 5 files.

Verification: `ProjectDocuments.test.js` + `Shell.i18n.test.js` passed 2 suites / 21 tests; `i18n:check ok`; frontend production build compiled successfully; `git diff --check` passed.

### Phase 6.2 — engineer-instruction closeout response

Replaced the optional closeout-response prompt with a bilingual text-entry dialog while preserving the existing close action and response payload. Current prompt scan: 29 calls across 4 files.

Verification: `i18n:check ok`; frontend production build compiled successfully; `git diff --check` passed. No SiteManagement page-specific test exists in the current frontend test inventory.

### Phase 6.2 — correspondence amendments

Replaced the amended-body prompt with a multiline text-entry dialog prefilled from the selected correspondence record. Current prompt scan: 28 calls across 3 files.

Verification: `i18n:check ok`; frontend production build compiled successfully; `git diff --check` passed. No DocControlExtended page-specific test exists in the current frontend test inventory.

### Phase 6.2 — ITP point form and unit contract amount

Replaced the three sequential inspection-point prompts with one bilingual form that validates the required title and offers the hold/witness/review enum plus acceptance criteria. Replaced unit sold amount entry with the shared numeric dialog and a non-negative finite-number validator. Current scan: 24 calls, all in `PortalDashboard.js`.

Verification: `Shell.i18n.test.js` passed 1 suite / 20 tests; `i18n:check ok`; frontend production build compiled successfully; `git diff --check` passed. No QHSEExtended or UnitsSales page-specific test exists in the current frontend test inventory.

### Phase 6.2 � consultant and supplier portal forms

Replaced the remaining portal prompts with record selectors and localized forms. RFQ/PO details load from portal endpoints; quotation and invoice line values are validated; client preview selects from the loaded portfolio. Current `frontend/src` prompt scan returns no matches.

Verification: `PortalDashboard.test.js` passed 1 suite / 10 tests; `i18n:check ok`; frontend production build compiled successfully; `git diff --check` passed. Phase 6 route-to-screen and permission journey checks remain open.

### Phase 6.2 � Arabic catalog encoding correction

Corrected the Arabic quick-action and client-preview catalog entries to valid UTF-8 Arabic. Rechecked JSON parsing and recursive EN/AR catalog parity.

Verification: `npm run i18n:check` reported `i18n:check ok`; `git diff --check` passed.

### Phase 6 � settings navigation reachability

Added a permission-filtered Settings navigation entry for owner/admin roles; the existing `/settings` route and server-side account-mapping authorization remain the enforcement points.

Verification: `Layout.test.js` passed 1 suite / 2 tests, including owner Settings-link visibility; `i18n:check ok`; `git diff --check` passed. Full App route-to-screen and role-matrix inventory remains open.

### Phase 7.1 � versioned app shell and safe updates

Added a web manifest, SVG app icon, production service worker, versioned app-shell/static asset cache, offline navigation fallback, and an update banner that activates a waiting worker only after user action. API and uploaded-file paths are excluded from the cache. Removed the Google Fonts runtime import and narrowed nginx CSP to same-origin styles and fonts. The master plan's app-shell checkbox is complete.

Verification: production build compiled; `node --check public/service-worker.js` exited 0; `i18n:check ok`; `git diff --check` passed. Not verified: installability/Lighthouse score or offline browser journey. The repo has no local IBM Plex font assets; bundling those fonts remains open. Offline write queue, idempotent server handling for site-report POSTs, conflict UI, responsive/table/touch work remain open.

### Stop condition � Docker engine unavailable (2026-10-13)

Docker Desktop pipe access was denied by the required `docker info` check. The current idempotency implementation/test changes are held uncommitted pending real-Postgres verification. Backend mock test output: `external-api.test.js` PASS, 1 suite / 46 tests. Focused PG test and database migration/application were not run. Resume after engine access is restored.

### Phase 7.2 — idempotent daily-report writes (2026-10-14)

Daily-report creation now requires `Idempotency-Key` through the internal API, `/api/v1`, and MCP. The backend records claims, replays completed responses, rejects in-flight duplicates, and fails closed when required idempotency storage is unavailable. The site report form reuses one key for retries while the form remains open. MCP's `update_daily_report_draft` accepts `idempotency_key`; the v1 middleware avoids double-claiming remounted requests. The global API error handler preserves valid typed statuses and codes so middleware errors return 400/409 rather than 500.

Verification used fresh disposable PostgreSQL 16 container `erp-closeout-pg16-20261014`, loopback port 55441, database `construction_erp_test`, with no mounted volume; `npm run migrate` applied 122 migrations. Backend mock `npm test -- --runInBand`: 53 suites / 1,001 tests passed. Real PG `npm run test:pg -- --silent`: 67 suites / 607 tests passed. Frontend `npm run test:ci -- --runInBand`: 28 suites / 111 tests passed. `npm run i18n:check`: `i18n:check ok`; `npm run build`: compiled successfully; `npm run lint:guards`: `lint-guards: ok`; focused `node --check` and `git diff --check` passed.

The frontend gate exposed a missing portal translation used by the localized quick action; paired English/Arabic entries were added and the full suite passed. Lighthouse/offline browser journey remains open. IndexedDB queue, conflict/sync UI, font packaging, and responsive requirements remain open. This implementation slice is pending its explicit-path commit.

Phase 7.2 was committed as `2f31c01` (`Phase 7.2: require idempotent daily reports`) on `closeout/batch-a-to-6`. The next implementation slice is the IndexedDB offline site-report queue.

### Phase 7.2 — offline daily-report queue (2026-10-14)

Added an IndexedDB store for site-report drafts, photos as local `File` blobs, and project-scoped BOQ/location quantity measurements. Records are filtered by authenticated owner and project. Reconnect sync uploads photos, submits the report with the persisted idempotency key, and removes it only after success. Network failures use capped exponential backoff; stale `syncing` records recover after two minutes; 409 conflicts and permanent failures remain visible with manual retry/removal actions. The offline banner now describes queued daily reports and online-only changes. Report form grids use responsive CSS classes and form controls enforce 14px text; queue actions meet 44px touch size.

Verification: backend mock `npm test -- --runInBand`: 53 suites / 1,002 tests; real PostgreSQL `npm run test:pg -- --silent`: 67 suites / 608 tests; frontend `npm run test:ci`: 29 suites / 117 tests; `npm run i18n:check`: `i18n:check ok`; `npm run build`: `Compiled successfully`; backend `npm run lint:guards`: `lint-guards: ok`. Full Playwright: 34 passed / 50 skipped; the existing 50 pilot/backend/screenshot cases remain gated. New airplane-mode journey: 1/1 desktop and 1/1 mobile passed, verifying one upload and one report POST after reconnect. The focused real-PG daily-report suite passed 12/12. Used disposable loopback Postgres 16 DB `construction_erp_test` on `erp-closeout-pg16-20261014`; no pilot DB or credential files were used.

Not complete: Lighthouse/PWA score, local IBM Plex Arabic assets, replacement of all 110 inline `gridTemplateColumns` occurrences and wrapping all 64 tables in `.table-container`, and mobile journeys for every major screen/portal. Phase 7 remains open. Slice awaits explicit-path commit.

Phase 7.2 offline queue commit: `7487787` (`Phase 7.2: queue site reports offline`) on `closeout/batch-a-to-6`. The user's audit report artifact remains unstaged.

### Phase 7.2 — app-wide responsive grids and tables (2026-10-14)

Converted 110 inline `gridTemplateColumns` declarations in frontend page files to named responsive classes; source scan now returns zero. Added responsive breakpoints for two-to-five-column layouts, asymmetric form/sidebar/schedule layouts, and existing auto-fit grids. Wrapped all 72 JSX tables across `frontend/src` in `.table-container`; AST scan reports zero unwrapped, including HSE, QHSE, and document control. Site Management’s button and icon targets have a 44px minimum, and its form controls have 14px text.

Verification after the layout conversion: frontend CI 29 suites / 117 tests; `i18n:check ok`; production build compiled; backend `lint-guards: ok`; `git diff --check` exited 0; full Playwright 36 passed / 50 skipped. Desktop and mobile offline daily-report journeys each passed 1/1 after the final Site Management sizing change. Real PG/backend gates remain valid from the immediately preceding Phase 7 queue slice because this slice changes only frontend layout and docs; they passed 67 suites / 608 tests and 53 suites / 1,002 tests respectively.

Remaining Phase 7 items: locally bundle licensed IBM Plex Arabic fonts; run Lighthouse and record an actual PWA score; extend mobile viewport coverage to every major screen and portal. Do not mark Phase 7 complete until those items and its exit gate are satisfied.

Responsive layout/table commit: `7fd068a` (`Phase 7.2: make page grids responsive`) on `closeout/batch-a-to-6`.

### Phase 8 — project cash contribution (2026-10-14)

The commercial engine now returns `cash_in`, `cash_out`, and `cash_contribution` for live project payments (`AR - AP`, excluding voided rows and restricted by `project_id`). The aggregation/subtraction is performed in SQL over DECIMAL. The Project Operations commercial cards now use paired `commercial.fields.*` English/Arabic keys for all displayed commercial figures, including cash contribution.

Verification output: backend mock `npm test -- --runInBand --silent` PASS 53 suites / 1,003 tests; real PG `TEST_PG=1 npm run test:pg -- --silent` PASS 67 suites / 609 tests; focused `commercial-5-5.pg.test.js` PASS 17/17; frontend `npm run test:ci -- --silent` PASS 29 suites / 117 tests; `i18n:check ok`; `i18n parity ok: 35 namespaces, 1085 English keys`; frontend production build `Compiled successfully`; backend `lint-guards: ok`; locale JSON parse and `git diff --check` passed. The DB was the disposable PostgreSQL 16 container `erp-closeout-pg16-20261014`, loopback port 55441, database `construction_erp_test`. Docker Desktop reported server version 28.3.2 through the authorized CLI path.

Phase 8 is still open: per-cost-code ForecastVersion EAC logic, recovery caps, certified-quantity valuation, baseline-driven SPI/CPI, resource loading, legacy approval retirement, and duplicate surfaces remain. This metric is a cash-basis operational indicator and excludes voided or unrecorded cash activity; it is not accrual profit or a reconciled cash flow statement.

### Phase 8 — baseline-driven SPI (2026-10-14)

A valid current baseline now enables SPI automatically. The KPI route uses baseline planned dates and quantities with current activity progress; the API marks `spi_source`. Without a current baseline the prior project opt-in and live-schedule calculation remain. This closes the baseline default for SPI only; CPI remains open because project costs are not associated with activities, and resource loading is not implemented.

Verification: planning mock 12/12; schedule real-PG route suite 4/4 on disposable Postgres 16. The regression asserts baseline SPI=1 while the changed live schedule would yield 0.5. The first focused attempt exposed a test-only fixture regression and incorrect mounted URL; corrected fixture/path, then passed. Phase 8 earned-value task remains unchecked until CPI and resource-loading requirements are covered.

### Phase 8 — capped retention and advance recovery (2026-10-14)

Added client and subcontract advance amounts, derived from contract value and advance percent where omitted. Explicit retention values override the active retention business rule; absent/invalid values use the 10% fallback. Certificate retention now respects the project retention cap and prior certified retention. Automatic advance recovery uses the project recovery setting (fallback 0%) and cannot exceed remaining contract advance; explicit overrides are balance-capped and audited in the same transaction. Subcontract creation validates project scope and inserts its audit row transactionally. Migration 0061 adds subcontract advance fields; existing rows default to zero and are fail-closed until finance configures their outstanding advances.

Verification on disposable Docker Desktop PostgreSQL 16 (`construction_erp_test`, loopback 127.0.0.1:55441): full PG 67 suites / 611 tests; focused commercial PG 18/18; backend mocks 53/1,003; frontend CI 29/117; production build compiled; i18n check passed; i18n parity 35 namespaces / 1,086 English keys; backend lint guards passed; syntax, locale JSON, and whitespace checks passed. The normal Docker pipe was denied; elevated local Docker CLI reported server 28.3.2. No pilot/production DB or credential files were accessed.

This slice does not close Phase 8. Cost-code EAC, certified-quantity valuation, CPI/resource loading, legacy approvals, and duplicate payment surfaces remain open. Phase 7 and Phases 9–11 remain open.

### Phase 7 — mobile route sweep (2026-10-14)

Added a narrow viewport smoke sweep for 17 major internal/portal routes. API calls are stubbed with empty deterministic responses; each route is checked for body visibility and page-level horizontal overflow. Playwright `npx playwright test e2e/mobile-route-sweep.spec.js --project=mobile-chromium --reporter=line`: PASS, 17/17. Sandbox launch initially returned `spawn EPERM`; elevated local Playwright execution passed. Phase 7 remains open for route-specific mobile workflows, offline fonts and Lighthouse evidence.

### Phase 8 — forecast ETC/EAC basis (2026-10-14)

New forecast versions treat line `forecast_amount` as per-cost-code ETC; commercial EAC is actual plus ETC. ETC defaults to remaining net commitments plus budget not yet committed. Migration 0062 preserves pre-existing ForecastVersions on the legacy EAC basis and API-created versions explicitly use ETC. The workbench now accepts multiple cost-code inputs in one forecast. The older Phase 13 formula note has been updated to explain this transition.

Verification: migration 0062 applied to disposable Docker Desktop PostgreSQL 16 (`construction_erp_test`); backend mocks 53/1,003; commercial real-PG 18/18 including ETC-basis and legacy EAC-basis regressions; frontend CI 29/118; Project Finance Workbench focused test 2/2; production build compiled; locale checks/parity 35 namespaces / 1,089 English keys; syntax/guard checks passed. Finance owner signoff remains required for the changed forecast basis. Phase 8 remains open for certified quantity valuation, CPI/resource loading and other listed items.

Commit references for the verified 2026-10-14 slices: `c8cc6fe` (Phase 8 capped retention/advance recovery), `96c344e` (Phase 7 mobile route sweep), and `0a2ee09` (Phase 8 ETC/EAC basis). The earlier follow-on ordering note is superseded by the current continuation state in `STATE.md`.

## 2026-10-14 continuation — Phase 8 certified-quantity valuation

Implemented quantity-backed valuation for both client and subcontractor payment applications. Each application line links to a certified `quantity_measurements` row and snapshots its unique matching contract-line rate. Row locks and active-application reservations prevent duplicate claims; certification records the accepted quantity and computes `gross_current_work` from the line snapshots. Partially certified remainder can be claimed later. Rejected and withdrawn applications release their reservations by lifecycle status. Manual legacy applications remain supported. Migration `0063_payment_application_quantity_valuation.sql` adds the valuation basis and line table; no legacy amounts were rewritten.

Verification on disposable Docker Desktop PostgreSQL 16 (`construction_erp_test`, loopback `127.0.0.1:55441`): `npm run migrate` applied migration 0063 (1 applied, 124 already applied); focused commercial PG suite passed 19/19; full real-PG suite passed 67 suites / 612 tests; backend mocks passed 53 suites / 1,003 tests; backend lint guards passed; i18n check passed and parity reports 35 namespaces / 1,098 English keys; JS syntax, EN/AR JSON parsing, and `git diff --check` passed. First PG run caught certificate totals using the request's supplied money amount rather than the derived quantity amount; corrected and reran focused and full PG suites successfully.

Phase 8 valuation checkbox is closed. Phase 8 remains open for reminder tiers, CPI/resource loading, legacy approval retirement, and duplicate transition/payment-certificate surfaces. Phases 7 and 9–11 remain open.

Final follow-up after exposing quantity lines on application detail and rejecting manual work overrides for quantity-based certification: `TEST_PG=1 npm run test:pg -- --silent src/scripts/__tests__/commercial-5-5.pg.test.js` — PASS, 19/19; `npm run i18n:check` — PASS; `npm run i18n:parity` — PASS, 35 namespaces / 1,099 English keys; `node --check` on the commercial route/service/test and `git diff --check` — PASS. The full PG run (67 suites / 612 tests) preceded these final additive validation/read changes; the focused commercial PG suite was rerun after them.

Valuation implementation commit: `c2a68a5` (`Phase 8: derive valuation from certified quantities`). The pre-commit full PostgreSQL run passed 67 suites / 612 tests; the final focused commercial rerun after the last validation/read changes passed 19/19.

## 2026-10-14 continuation — Phase 8 receivable reminder tiers

Receivable reminders now apply active client-specific rules before project and company defaults, resolving configuration per invoice instead of once per sweep. An explicit disabled client rule suppresses reminders. The pre-due `due_soon` tier now fires once whenever an outstanding invoice is 1–7 days from its due date, so a missed scheduler day does not lose the seven-day reminder. The event payload includes `days_until_due`; existing due-today and overdue 7/14/30 tiers remain.

Verification: real PostgreSQL `event-integrity.pg.test.js` passed 30/30, including the six-day pre-due case, client-over-project role priority, once-only idempotency, and client disable. Backend mock suite passed 53 suites / 1,003 tests; `npm run lint:guards` passed; changed-file `node --check` and `git diff --check` passed. The first run found only a test invoice number exceeding the schema's 20-character limit; the fixture was shortened and the suite reran green. No migration was needed.

Phase 8 reminder tier task is closed. Remaining Phase 8 work: CPI/resource-loaded planning, legacy approval retirement, and duplicate transition/payment-certificate surfaces. Phase 7 and Phases 9–11 remain open.

Reminder-tier implementation commit: `3ae651e` (`Phase 8: honor client receivable reminder rules`). Focused PostgreSQL verification passed 30/30 after correction of the overlong test fixture.

### Phase 8 - baseline BAC, financial SPI/CPI, and daily resource load (2026-10-14)

Schedule activities now accept a non-negative `budgeted_cost` (BAC). Capturing a baseline snapshots BAC and milestone status so later edits do not rewrite baseline values. Financial PV/EV/SPI use those immutable snapshot budgets; CPI uses actual cost from the shared `costView.projectTotal` source. Existing baselines with no complete BAC keep quantity-based SPI and expose CPI as unavailable with an explicit reason. Added the scoped daily planned/active employee and asset resource-load API and analytics table, plus an RBAC-visible activity budget editor. Mutations are audited in their transaction.

Verification on disposable Docker Desktop PostgreSQL 16 (`erp-closeout-pg16-20261014`, database `construction_erp_test`, loopback port 55441): Docker Engine 28.3.2; migration 0064 applied (1 applied, 125 already applied); focused schedule PG suite 6/6; full PG suite 67 suites / 616 tests; backend mocks 53 suites / 1,003 tests; backend lint guards passed; frontend CI 29 suites / 120 tests; Schedule component test 4/4; i18n check passed, parity 35 namespaces / 1,123 English keys; production build compiled; changed JS syntax, EN/AR locale JSON parsing, and `git diff --check` passed. The focused PG suite was rerun after the full suite and again passed 6/6 with the final baseline-capture and audit assertions.

The Phase 8 earned-value/resource-load checkbox is closed. Phase 8 remains open for legacy approval retirement and duplicate transition/payment-certificate surfaces. Phase 7 and Phases 9-11 remain open. Lighthouse/PWA, Playwright for this schedule slice, golden-project parity, Arabic PDF inspection, rollout rehearsal, and human reviews were not run by this slice.

### Phase 8 - approval retirement preparation (2026-10-14)

Decision status and stage now project from the linked workflow throughout approval list/detail/audit/check reads, dashboard counts, stale reporting, and the stale-cancel script. `APPROVALS_LEGACY_DUAL_WRITE=false` provides a reversible workflow-authoritative test/deployment mode; the default remains enabled. The off-mode test covers decisions without updating the legacy row and the expected re-submission conflict. The API returns typed 409 `approval_resubmission_requires_legacy_mirror` where the old partial unique index reserves a stale pending row. No history is rewritten and no index is dropped.

Verification on loopback-only Docker Desktop PostgreSQL 16 database `construction_erp_test` (`127.0.0.1:55441`): approval PG 9/9; full PG 67 suites / 618 tests; backend mocks 53 suites / 1,004 tests; `npm run lint:guards` passed; changed JS `node --check` and `git diff --check` passed. `verifyApprovalParity` found two orphaned test rows; the repository's idempotent `migrateLegacyApprovals` helper created their workflow twins, then parity passed for all 55 approval rows. No migration was added. An initial test-run attempt used an invalid default role; the retry explicitly targeted the disposable DB and passed. No production data was accessed.

The legacy approval plan item remains open. The real-data two-week parity hold has not started. The old migration-0013 pending index blocks same-record re-submission when dual writes are disabled, and replacing it requires a migration decision because repository instructions require additive-only migrations. Do not switch the mirror off for routine use until this is resolved and the real-data hold/signoff is complete. See `docs/APPROVALS_RETIREMENT.md`. Implementation commit: db10c5e.

### Phase 11 - reconciliation coverage expansion (2026-10-14)

Expanded the read-only reconciler to check advance recovery/void-restoration direction totals, project-cost source-document presence, client credit amounts in invoice allocation limits, balanced journal lines/header totals, PO delivered and accepted quantities against delivery/posted-GRN lines, and owned integer sequences against maximum ids. Existing checks cover stock projection, project-cost journal linkage, allocation limits, retention, project scope, and approval twins. Removed automatic dotenv loading from the verifier so direct invocation does not read the backend `.env` file.

Verification: reconciliation unit tests 3/3; backend mocks 53 suites / 1,005 tests; lint guards passed; changed JS syntax and `git diff --check` passed. Read-only SQL executed successfully on Docker Desktop PostgreSQL 16 disposable `construction_erp_test` (`127.0.0.1:55441`). That database contains retained test fixtures and returned nonzero findings: active workflow/pending-step 16, stock projection 64, cost/journal link 59, cost source document 16, AP/AR live-document linkage 84, and PO delivery/GRN quantities 174. Allocation caps, retention/advance balances, project scope, journal balance, approvals, and sequence checks returned zero. These are explicitly not treated as acceptance failures or a restored-real-data result.

Coverage expansion is complete. Phase 11's restored-real-data dry run, discrepancy remediation, and retained report remain open; the backup-confirmed CLI was not run. No migrations or data repairs were made. Implementation commit: 75b6f36.

### Phase 10 L6 - shared locale formatting and name helpers (2026-10-14)

Added locale-aware shared currency, number, date, date-time, and percent formatters plus `localizedName`. Helpers use explicit locales when provided; otherwise they follow the document `lang`, with Arabic using `ar-EG`, Arabic EGP rendered as `ج.م.`, and configurable number digits through `numberingSystem`. Existing API/database machine values remain unchanged; enum translation helpers remain the rendering mechanism. This slice implements the helper foundation only; caller migration and system-wide Arabic review remain open.

Verification: formatter suite 5/5; frontend CI 29 suites / 123 tests; `i18n:check` and `i18n:parity` passed (35 namespaces / 1,123 English keys); production build compiled successfully. No backend or migration changes. Implementation commit: 0b59ba5. Implementation commit: 0dda70b. Implementation commit: 0f19c8a.

L6 shared formatter/name-helper items are closed. API-value rendering audit, broader page call-site migration, dynamic status coverage, PDFs, RTL review, and Phase 10 exit remain open. Implementation commit: 39e0b6e.


## 2026-10-14 - Phase 10 L6 portal dashboard labels

Portal dashboard widget and field labels now resolve through the bilingual portals.dashboard.* catalog instead of replacing underscores and title-casing arbitrary API values. Record status and priority use the shared enum translators, with the stored machine value preserved as fallback for unknown enums. Added EN/AR labels for common portal metrics and the empty state. This is a bounded caller migration; the system-wide API-value and dynamic-content audit remains open.

Verification: frontend PortalDashboard suite PASS (11/11); npm run i18n:check PASS; npm run i18n:parity PASS (35 namespaces, 1,146 English keys). No backend changes or migrations. Implementation commit: 1740ed7.


## 2026-10-14 - Phase 7 responsive route sweep expansion

Expanded the mobile Playwright sweep from 17 representative routes to all 36 application routes, covering each major internal page, every project subroute, and all four external portals. Each route starts with isolated local test auth, mocked API responses, and checks that the page renders without document-level horizontal overflow at the configured Pixel 7 viewport.

Verification: `npx playwright test e2e/mobile-route-sweep.spec.js --project=mobile-chromium --reporter=line` PASS, 36/36. A first overlapping test invocation caused dev-server connection refusals after 19 cases; the clean single invocation completed all 36 successfully. This is route/overflow smoke coverage only; it does not assert screen-specific business workflows. Implementation commit: 1b0e672.


## 2026-10-14 - Phase 10 portal value localization follow-up

Portal dashboard boolean values now use common.yes/common.no and numeric values use the shared locale-aware formatNumber helper. The empty value remains a typographic dash. This closes only boolean and metric-number rendering for this caller; Phase 10 L4C remains open for titles, controls, remaining dynamic fields, empty states, and broader translation audit.

Verification: frontend PortalDashboard and formatter suites PASS (2 suites / 16 tests); git diff --check passed. No catalog, backend, or migration changes. Implementation commit: b93dc27.


## 2026-10-14 - Phase 8 certificate surface retirement audit

Read-only code and disposable database inspection confirmed two live certificate surfaces. The legacy subcontractor table still backs its route list/write actions, project-scope resolution, and subcontractor payment cost listener. The shared table has different financial columns. The existing v_sub_payment_certificates view projects the shared subcontractor rows; it neither replaces nor mirrors the legacy table. On the retained disposable PG16 database, counts were 62 shared rows, 28 legacy rows, and 17 rows in the transition view; no certificate-number collisions were found. These fixtures are not a real-data parity result.

No table or financial history was modified. Column aliases such as materials_deducted/advance_recovery and penalties/other_deductions cannot be assumed to have equivalent accounting meaning. Removal would violate additive-only migrations and could sever legacy source identifiers. Added docs/CERTIFICATE_SURFACE_RETIREMENT.md with a safe additive mapping plan; Phase 8 remains open pending real-data mapping and parity.

Implementation commit: documentation only; no schema migration or application behavior changed.


## Continuation frontend gates (2026-10-14)

After the Phase 7 route and Phase 10 portal slices: `npm run test:ci -- --silent` PASS (29 suites / 124 tests); `npm run build` PASS (Compiled successfully); `npm run i18n:check` PASS; `npm run i18n:parity` PASS (35 namespaces / 1,146 English keys).


## 2026-10-14 - Phase 10 portal dashboard empty-state contract

Subcontractor, supplier, and consultant dashboard services now add a namespaced empty_key beside the existing English empty_label. The PortalDashboard resolves that key through EN/AR catalogs and uses the legacy text only as fallback, so older API clients remain compatible. Added catalog labels for all current backend widget names and empty states, with service and frontend regression coverage. This is partial Phase 10 L4C/L7 progress; other English setup notes, values, and controls remain open.

Verification: backend mocks PASS (53 suites / 1,005 tests); portal/consultant service tests PASS (30/30); lint guards passed; changed JS syntax and git diff --check passed. Frontend CI PASS (29 suites / 124 tests); PortalDashboard focused suite PASS (11/11); production build compiled; i18n check passed; parity passed (35 namespaces / 1,203 English keys). No migration or database change. Implementation commit: 0b7f57a.


## 2026-10-14 - Phase 10 portal shell labels

Localized the four portal titles and the dashboard scope description, project selector, preview exit, refresh/loading copy, portfolio heading, and secondary section headings. Existing routes and API calls are unchanged. This is an additional PortalDashboard caller migration; L4C remains open for remaining dynamic fields, user-facing server errors, and full Arabic review.

Verification: PortalDashboard suite PASS (11/11); i18n check passed; parity passed (35 namespaces / 1,216 English keys); git diff --check passed. No backend or migration changes.


## 2026-10-14 - Phase 10 portal setup messages

Client, subcontractor, and supplier dashboard setup notes now include stable note_key/setup_action_keys for translation. Existing English note/setup_actions fields remain in the API as a compatibility fallback. PortalDashboard uses catalog entries when keys are present. This covers the zero-assignment setup states only; user-facing API errors and broader server content remain open.

Verification: backend client/consultant/portal suites PASS (3 suites / 40 tests); frontend PortalDashboard suite PASS (11/11); i18n check passed; parity passed (35 namespaces / 1,223 English keys). No migrations or data changes. Implementation commit: d0df760.


## 2026-10-14 - Phase 10 portal record identifiers

Portal record cards now display domain-specific document numbers exposed by APIs (RFI, submittal, WIR, MIR, certificate, observation, and NCR) before using a localized generic record-number fallback. Added EN/AR labels for dashboard summary fields surfaced by consultant progress widgets.

Verification: PortalDashboard suite PASS (11/11); i18n check passed; parity passed (35 namespaces / 1,231 English keys); git diff --check passed. No backend or migration changes. Implementation commit: 0dda70b.


## 2026-10-14 - Phase 10 L4B procurement comparison localization

Localized the ProcurementReview title and description, RFQ input label, loading/compare actions, every comparison column, boolean values, document buttons, recommendation, and empty state. Load and download failures now show localized generic messages rather than raw server/network text. The sidebar entry already uses the translated navigation key.

Verification: ProcurementReview component tests PASS (2/2), covering translated comparison data and generic load/download errors; i18n check passed; parity passed (35 namespaces / 1,241 English keys); git diff --check passed. The full production build passed in the frontend batch gate before this page-only change; rerun it before batch close. Implementation commit: 1d14afb.


## 2026-10-14 - Phase 10 L4A Project Operations localization

Localized Project Operations headings, tabs, controls, table fields, empty/loading/error states, retention and finance metrics. Statuses use the shared enum translator; quantities use the locale-aware number formatter; material, warehouse, and project names use Arabic-first field fallback. The embedded ProcurementWorkspace already uses the procurement catalog. Load errors display a generic translated message instead of raw server/database text.

Verification: ProjectOperations component suite PASS (2/2), including Arabic-first warehouse/project names and generic load error; i18n check passed; parity passed (35 namespaces / 1,283 English keys); git diff --check passed. Full frontend build and suite rerun at batch close. Implementation commit: dd01f60.


## 2026-10-14 - Phase 10 portal record locale formatting

Portal record cards now use localizedName for title/name/subject fields, format due/deadline dates with the active locale, and format certificate/payment amounts as localized EGP. Machine identifiers and user-authored text remain unchanged. This adds formatter call-site coverage; the broader L4C portal/API error audit remains open.

Verification: PortalDashboard and formatter suites PASS (2 suites / 16 tests), including Arabic-first title, localized date, and EGP currency checks; i18n check passed; parity passed (35 namespaces / 1,283 English keys); git diff --check passed. No backend or migration changes. Implementation commit: 0b59ba5.


## 2026-10-14 - Phase 7/10 continuation batch gates

After the latest portal/project-operation localization changes: backend mock suite PASS (53 suites / 1,005 tests); backend lint guards PASS; frontend CI PASS (31 suites / 128 tests); frontend production build PASS (Compiled successfully); i18n check PASS; i18n parity PASS (35 namespaces / 1,283 English keys); mobile route sweep PASS (36/36 routes at Pixel 7, mocked APIs, no document-level horizontal overflow).

This does not close the Phase 7 exit gate: no IBM Plex Arabic font file exists in the repository or installed frontend assets, and no Lighthouse package is available in the local dependencies. The nginx font policy is already same-origin. Next safe action is to obtain a properly licensed local font artifact, then rerun offline/Lighthouse evidence. Phase 8 approval retirement still requires an approved migration decision and restored-real-data parity; certificate-surface constraints are documented in docs/CERTIFICATE_SURFACE_RETIREMENT.md. Phase 9 golden demo/CI scenario and the broader Phase 10/11 review and real-data gates remain open.

## 2026-10-14 continuation — fresh Docker Desktop baseline and Phase 9 values

The local Docker Desktop server became available through elevated local access (Engine 28.3.2). On a newly created, uniquely named disposable PostgreSQL 16 container/database, the migration runner applied the complete current chain: 126 applied, 0 previously applied, migrations 0059–0064 included. Generated DB and JWT credentials remained in the PowerShell process environment; no `.env.docker` or `.staging-users.json` was read.

Gate output: notification delivery PG 1 suite / 3 tests passed; full PG 67 suites / 618 tests passed; backend mock 53 suites / 1,005 tests passed; `npm run lint:guards` printed `lint-guards: ok`; frontend CI 31 suites / 128 tests passed; `i18n:check` passed; parity 35 namespaces / 1,283 English keys; production build compiled; Pixel 7 mobile route sweep 36/36 passed. The first focused PG invocation stopped before test execution because the isolated process lacked `JWT_SECRET`; rerun with a generated process-only JWT secret passed.

Created `docs/GOLDEN_VALUES.md` with hand calculations for the current pilot BOQ and a provisional residential commercial model, and recorded the missing-spec assumptions in `docs/DECISIONS.md`. The golden API/UI journey has not been implemented; these values remain provisional and unverified against runtime. The staging pilot smoke was not run because its existing script reads `.env.docker` and `.staging-users.json`, prohibited by the closeout request. The pre-existing untracked `docs/CODEX_AUDIT_REPORT.md` remains untouched and unstaged.

## 2026-10-14 continuation — Phase 9 residential C35 API fixture

Added a real-PG fixture case to `golden-chain.pg.test.js`. It provisions the residential tower template through `projectProvisioning`, verifies 96 unit locations, adds a project-scoped 120 m³ C35 BOQ item at 4,200 EGP/m³, attaches a 1.0 factor / 2% wastage recipe, allocates the BOQ to a unit, and inserts a schedule activity. `materialDemand.recomputeAllocation` returned one requirement row; the database held gross 120.0000 m³ and net 122.4000 m³; BOQ extension was 504,000 EGP. Added these verified fixture figures to `docs/GOLDEN_VALUES.md`.

Verification: fresh disposable Docker Desktop PostgreSQL 16, all migrations applied; focused `npm run test:pg -- --silent src/scripts/__tests__/golden-chain.pg.test.js` PASS, 1 suite / 7 tests; `node --check` PASS; `git diff --check` PASS. Implementation commit: `05986f2` (`Phase 9: add residential C35 golden fixture test`). The entire tender-to-warranty journey and browser journey remain open; Phase 9 exit is not met.

## 2026-10-14 continuation — Phase 11 operator metrics endpoint

Added owner/admin-only `GET /api/v1/ops/metrics` with aggregate outbox counts, pending retry age, failed sweep count, and notification-delivery counts. The endpoint reports `degraded` on dead events, failed sweeps, failed or undelivered notifications; it returns no event payload, provider error text, or user/project identifiers. Added `docs/MONITORING.md` with endpoint scope, local checks, initial response steps, and explicit limits (no history, paging, or external provider configured). Public readiness endpoints remain separate.

Verification: on a fresh disposable Docker Desktop PostgreSQL 16 database, `npm run test:pg -- --silent src/scripts/__tests__/v1-contract.pg.test.js` PASS, 1 suite / 8 tests, including owner access, site-engineer denial, and served route/OpenAPI coverage. Backend mocks PASS 53 suites / 1,005 tests; `npm run lint:guards` prints `lint-guards: ok`; `node --check` on route/test files and `git diff --check` passed. Implementation commit is recorded in the following documentation entry. Monitoring provider, historical retention, alert delivery, backup/restore, and production readiness remain open.

## 2026-10-14 continuation — Phase 11 go/no-go and review handoffs

Added `docs/GO_NOGO.md` with evidence and owner action for all seven criteria; the decision is NO-GO, with independent review, full golden journey, restored-copy reconciliation, runtime golden values, Arabic PDF/font review, real-environment restore/rollback rehearsal, and human UAT still open. Added `docs/SECURITY_REVIEW_PREP.md` for the independent Phase 1 reviewer and `docs/ARABIC_REVIEW_PACK.md` with the paired leaf inventory for all 35 EN/AR catalog namespaces plus screen/export review checklist. Human reviews remain pending. `npm audit` was not run because the closeout prohibits external sends and the command sends dependency metadata to a package registry.

The preceding metrics slice is committed as `2a02bb1` (`Phase 11: expose operator queue health metrics`). GO_NOGO records the exact local pilot, smoke, golden test, and restore commands; it explicitly states that pilot smoke and the full restore rehearsal were not run in this continuation. The user-provided untracked `docs/CODEX_AUDIT_REPORT.md` remains unmodified and excluded from commits.

## 2026-10-14 final continuation batch gates

Fresh Docker Desktop PostgreSQL 16 disposable database; generated database/JWT credentials stayed only in the test process. Current final outputs: migration runner PASS (full current chain); real PG PASS, 67 suites / 621 tests; backend mocks PASS, 53 suites / 1,005 tests; `npm run lint:guards` PASS (`lint-guards: ok`); frontend CI PASS, 31 suites / 128 tests; `i18n:check` PASS; parity PASS, 35 namespaces / 1,283 English keys; frontend production build PASS (`Compiled successfully`); Pixel 7 mobile route sweep PASS, 36/36. The full PG suite includes the new residential fixture and metrics authorization/contract tests. No remote CI job was run.

Pilot smoke and full backup/restore rehearsal remain unverified in this continuation because their scripts load `.env.docker` and `.staging-users.json`, which the request forbids reading. Production remains NO-GO per `docs/GO_NOGO.md`. No plan exit checkbox was closed by this gate run. `docs/GO_NOGO.md` and `docs/SECURITY_REVIEW_PREP.md` now reflect the final 621-test count.

## 2026-10-14 - Phase 9 repeatable residential golden demo fixture

Added a safe, idempotent `seed:golden-demo` CLI, reused by the real-PostgreSQL residential fixture test. The CLI requires a test/staging app environment and database name, loopback host, valid port, and process-only DB credentials. It does not load dotenv files. A fresh disposable PostgreSQL 16 run applied all 126 migrations and ran the seed twice: both runs produced 96 units, an EGP 504,000 C35 BOQ, and 122.4 m3 net recipe demand. Guard unit tests passed 8/8; focused golden-chain PostgreSQL tests passed 1 suite / 7 tests.

Closeout batch gates: PostgreSQL 67 suites / 621 tests; backend mocks 54 suites / 1,013 tests; lint guards; frontend CI 31 suites / 128 tests; i18n check; parity 35 namespaces / 1,283 English keys; production build; Pixel 7 route sweep 36/36 all passed. The unprivileged browser launch was blocked with `spawn EPERM`, then the local browser runner completed the 36-route sweep. The temporary PostgreSQL container and generated credentials were removed.

Phase exit status remains open: full tender-to-warranty journey and browser flow need missing Spec 28 and approved commercial inputs; Phase 7 font/Lighthouse, Phase 8 restored-copy parity, Phase 10 Arabic PDF/native review, and Phase 11 seeded reconciliation defect coverage, restored-copy report, independent review, rollout rollback, and UAT remain outstanding. Pilot smoke and backup/restore rehearsal remain unrun because the scripts read prohibited secret files. Production stays NO-GO.
## 2026-10-14 - Phase 11 seeded reconciliation defect cases

Added real-PG regressions for two seeded reconciliation defects: payment allocations above the payment total and client invoice allocations crossing project boundaries. Each check reported one violation, and the test rolled back its seed data. Updated `GO_NOGO.md` with the current 68-suite / 623-test PG total and this new scoped evidence. A complete per-invariant defect matrix and restored-real-data clean report remain open.

Batch gates PASS: fresh Docker PostgreSQL 16, all 126 migrations; real PG 68 suites / 623 tests; backend mocks 54 suites / 1,013 tests; lint guards; frontend 31 suites / 128 tests; i18n check; parity 35 namespaces / 1,283 keys; production build; Pixel 7 route sweep 36/36.
## 2026-10-14 - Phase 11 reconciliation seeded-defect expansion

Expanded defect coverage to six checks: payment amount, invoice balance, cross-project client allocation, retention balance, advance balance, and stock ledger/projection. Tests compare violation-count deltas against their baseline because the rest of the full PG suite leaves known unrelated reconciliation residue. Fresh disposable PostgreSQL full suite passed 68 suites / 627 tests. Other batch gates remain PASS: backend mocks 54/1,013; guards; frontend 31/128; i18n check/parity; build; and mobile route sweep 36/36. Restored real-data reconciliation is still not available.
## 2026-10-14 - clean seeded-demo reconciliation baseline

Fresh disposable Docker PostgreSQL 16: all 126 migrations applied; golden demo fixture seeded (96 units, EGP 504,000 C35 BOQ, 122.4 m3 net demand); read-only reconciliation returned 0 violations across all 16 checks; data-cleaning report returned []. The exact container and process-only generated credentials were removed. This verifies the clean demo baseline only; restored pilot/real-data reconciliation remains open and the GO criterion stays NO-GO.
## 2026-10-14 - Phase 11 reconciliation matrix test coverage

Expanded seeded-defect PG coverage to 14 test cases that exercise 15/16 reconciliation checks; owned-sequence drift remains covered by a unit test because rewinding a live DB sequence cannot be rolled back safely. Defect cases compare each check's violation delta and run in rollback-only transactions. Fresh full PG gate passed 68 suites / 635 tests after all 126 migrations. Other batch gates passed: backend 54/1,013; lint guards; frontend 31/128; i18n check/parity 35 namespaces / 1,283 keys; build; Pixel 7 route sweep 36/36. Real-data restored-copy gate remains open.
## 2026-10-14 - synthetic golden-demo restore rehearsal

Fresh disposable PostgreSQL 16: 126 migrations and the golden seed; custom-format dump restored to a second empty DB. Source/restore counts matched (96 units, 1 BOQ item, 122.4000 m3 net demand). Restored reconciliation: 16 checks, 0 violations; data-cleaning report: []. The Docker container and process-only credentials were removed. This does not replace the pilot/real-data restore and rollback rehearsal, which remains open.
## 2026-10-14 - Phase 10 font and PDF renderer spike

Bundled IBM Plex Sans and IBM Plex Sans Arabic under OFL-1.1, added an offline same-origin browser font check, and completed a six-pair EN/AR PDFKit-versus-Chromium spike for invoices, payment certificates, and a multi-page WIR register. Rasterized PDFs were visually inspected; Arabic PDFKit shaping is broken in these samples, while Chromium renders connected RTL Arabic and mixed-direction identifiers. `docs/i18n/PDF_SPIKE.md` records evidence and selects Chromium. Updated the Arabic review pack, L8 spike checkbox, and CI catalog parity gate. Phase 10 remains incomplete pending production renderer integration, export call-site migration, CSV localization, remaining L0-L11 work, and native Arabic review.

Verification: font Playwright 1/1; screenshot baseline 32/32; full Playwright 74 passed / 86 skipped; frontend CI 31 suites / 128 tests; backend mock 54 suites / 1,013 tests; fresh Docker PG16 68 suites / 635 tests after 126 migrations; i18n check and parity 35 namespaces / 1,283 keys; build compiled. Production remains NO-GO.

## 2026-10-14 - R0.10 proxy-addr remediation (Africa/Cairo)

Targeted command in backend: npm.cmd update proxy-addr --ignore-scripts --no-audit --no-fund; exit 0, changed 1 package. Lockfile scope comparison against HEAD: PASS, only node_modules/proxy-addr changed (2.0.7 -> 2.0.8), satisfying Express ~2.0.7. Direct dependencies forwarded 0.2.0 and ipaddr.js 1.9.1 unchanged; package.json unchanged. Lock diff contains version, resolved URL, integrity and upstream funding metadata only. No audit fix or other installation command ran.

npm.cmd audit --omit=dev: exit 0, found 0 vulnerabilities (0 critical). Advisory: https://github.com/advisories/GHSA-jqcg-44mw-7w3h; patched version 2.0.8, vulnerable IPv4-mapped IPv6 trust subnet matching. Offline reproducer loaded 2.0.7 source from the existing npm cache without installing or modifying the installed package: req.ip=198.51.100.99 (spoofed), assertion expected 203.0.113.7, exit 1. Same assertion with installed 2.0.8: req.ip=203.0.113.7, PASS, exit 0.

Exposure assessment (source inspection, not deployment or incident verification): server.js sets trust proxy using parseTrustProxy(process.env.TRUST_PROXY). security.js defaults to false; only true, false and non-negative hop counts are accepted, rejecting CIDR strings. docker-compose.yml fixes TRUST_PROXY to 1 for the backend; generate-staging-env.js also generates 1. Frontend nginx appends its immediate peer to X-Forwarded-For, and Compose publishes only frontend port 8090 on loopback, with no published backend port. Thus the checked-in default/Compose configuration does NOT use the subnet configuration required by this advisory, despite carrying the affected runtime package. No credential configuration was read; actual deployed settings and historical exploitation are unverified. TRUST_PROXY=true or exposing the backend directly while trusting one hop can independently allow spoofing; those configurations were not changed in this narrowly scoped ticket.

Added three tests in backend/src/scripts/__tests__/security.test.js using real Express req.ip/req.ips getters: nearest client behind one trusted hop (spoofed earlier entry ignored), no-proxy forwarded spoof retaining the same rate-limit key and returning 429 on the second request, and the advisory subnet regression.

Verification command outputs:
- npm.cmd test -- --runInBand src/scripts/__tests__/security.test.js: PASS, 1 suite / 10 tests.
- npm.cmd test -- --runInBand: PASS, 54 suites / 1,016 tests (+3 tests from baseline 1,013).
- npm.cmd run migrate: PASS, 126 applied / 0 already applied on fresh erp_r01_r010_test.
- TEST_PG=1 npm.cmd run test:pg: PASS, 68 suites / 635 tests.
- git diff --check: PASS.

PG gate used only new volume-free erp-r01-r010-20261014, cached postgres:16 with --pull=never, loopback 127.0.0.1:55461. Random database/JWT credentials stayed in process environment; dotenv config was suppressed with a credential-free temporary preload. Exact container removed in finally; no production database, secrets files or other Docker resources accessed. Existing stopped-run documentation and untracked audit/review reports were preserved. R0.1-R0.9 and R1 remain unimplemented; this verifies R0.10 only. Commit message: R0.10: patch proxy-addr and verify trusted proxy IP handling.
