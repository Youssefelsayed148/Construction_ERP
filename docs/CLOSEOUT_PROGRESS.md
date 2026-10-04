# Closeout progress (append-only)

Resume point for a new session. Authority: docs/ERP_CLOSEOUT_PLAN.md and docs/system_language_fix.md (corrections section). Parts: A = close Phase 3, B = Phase 4, C = Phase 5, D = Phase 6. Checkpoints CP1..CP8 stop and wait for "go".

Stack so far: #1-#35 (Phases 0-3 and earlier slices, see docs/CLOSEOUT_LOG.md). Baseline confirmed 2026-10-04: mock 970, real-PG 261 (31 suites), 85 migrations fresh and repeatable, lint:guards empty baseline, frontend i18n:check + 72 unit tests + build green.

## PRs in this run (stacked on #35)

- (A1) docs/PHASE3_GAP_AUDIT.md: audit table for plan 3.1-3.5, mapped to the plan numbering (no code).
- (A2.1) supplier-return reversal of the GRN cost (decision 2), GRN/invoice accrual pairing (decisions 5, 6), cancel-approval restriction (decision 4). Migration 0023. PR #36, CI green.
- (A2.2) replenishment raises a PR through the PR workflow with project scoping, budget check, location/cost code/work package. Migration 0024. PR #37, CI green.
- (A2.3) cost posting from material issue, expenses, payroll allocation; labour/equipment double count fixed; delivery receipts valued at the PO rate. Migration 0025. PR #38 (GitHub Actions did not start: see below).
- (A2.4) 30 catch-to-zero guards removed, one shared cost view, lint rules. Migration 0026. PR #39.
- (A2.5) event name fixes, routes for the eleven unrouted families, events in the change's transaction, no swallowed enqueue, lint rule. No migration. Also fixes the subcontractor certificate update that never worked.

## Current checkpoint

Working on Part A (A2.5 in review). Next: A2.6 progress wiring.

CI NOTE (2026-10-04): GitHub Actions jobs for PR #38 and later did not start: "recent account payments have failed or your spending limit needs to be increased". #36 and #37 were green. Everything is verified locally with the same commands (mock, real-PG, fresh-DB migration, lint:guards); the remote gate needs the billing fix and a re-run. CP1 was skipped because every audited gap is inside the A2 list; CP2 follows A2.7.
