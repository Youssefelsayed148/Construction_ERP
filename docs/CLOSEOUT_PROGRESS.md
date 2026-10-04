# Closeout progress (append-only)

Resume point for a new session. Authority: docs/ERP_CLOSEOUT_PLAN.md and docs/system_language_fix.md (corrections section). Parts: A = close Phase 3, B = Phase 4, C = Phase 5, D = Phase 6. Checkpoints CP1..CP8 stop and wait for "go".

Stack so far: #1-#35 (Phases 0-3 and earlier slices, see docs/CLOSEOUT_LOG.md). Baseline confirmed 2026-10-04: mock 970, real-PG 261 (31 suites), 85 migrations fresh and repeatable, lint:guards empty baseline, frontend i18n:check + 72 unit tests + build green.

## PRs in this run (stacked on #35)

- (A1) docs/PHASE3_GAP_AUDIT.md: audit table for plan 3.1-3.5, mapped to the plan numbering (no code).
- (A2.1) supplier-return reversal of the GRN cost (decision 2), GRN/invoice accrual pairing (decisions 5, 6), cancel-approval restriction (decision 4). Migration 0023. PR #36, CI green.
- (A2.2) replenishment raises a PR through the PR workflow with project scoping, budget check, location/cost code/work package. Migration 0024. PR #37, CI green.
- (A2.3) cost posting from material issue, expenses, payroll allocation; labour/equipment double count fixed; delivery receipts valued at the PO rate. Migration 0025.

## Current checkpoint

Working on Part A (A2.3 in review). Next: A2.4 remove the catch-to-zero guards and add one shared cost view. CP1 was skipped because every audited gap is inside the A2 list; CP2 follows A2.7.
