# Closeout progress (append-only)

Resume point for a new session. Authority: docs/ERP_CLOSEOUT_PLAN.md and docs/system_language_fix.md (corrections section). Parts: A = close Phase 3, B = Phase 4, C = Phase 5, D = Phase 6. Checkpoints CP1..CP8 stop and wait for "go".

Stack so far: #1-#35 (Phases 0-3 and earlier slices, see docs/CLOSEOUT_LOG.md). Baseline confirmed 2026-10-04: mock 970, real-PG 261 (31 suites), 85 migrations fresh and repeatable, lint:guards empty baseline, frontend i18n:check + 72 unit tests + build green.

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
