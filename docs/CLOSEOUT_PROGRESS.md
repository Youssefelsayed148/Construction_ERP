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
