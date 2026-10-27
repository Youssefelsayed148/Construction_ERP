# Closeout remaining-work plan

Written 2026-10-27 from `STATE.md`, `docs/GO_NOGO.md`, `docs/CLOSEOUT_GAPS.md` and git at `cf946dd` on `closeout/batch-a-to-6` (pushed, in sync with origin). Verdict stays **NO-GO** until Batch 8 evidence exists. Nothing here is a status claim; every item is open until command output says otherwise.

## Execution order

Critical path: Batch 0 -> Batch 2 -> Batch 6 -> Batch 8. Batches 1, 3, 5, 7 can start in parallel.
The first run covers Batches 0-4 in the cloud session (see `docs/prompts/REMOTE_BATCH_0_4_PROMPT.md`). The full PG suite runs once, at the end of that run.

| Batch | Scope | Blocked by | Owner |
|---|---|---|---|
| 0 | Environment: working PostgreSQL 16 (Docker or service) and a CI run | Machine / push approval | You + agent |
| 1 | Finance defect C-FIN-AR-001, AP mismatch, regression tests | Nothing (PG proof needs 0) | Agent |
| 2 | Full real-PG gate, triage and fix fallout, B1 dry run, `--approval-limits` stage | Batch 0 | Agent; `--apply` needs you |
| 3 | Phase 1 security checklist (re-audit first) | Nothing (PG proof needs 0) | Agent |
| 4 | Phase 4 test infrastructure: PG harness, concurrency, constraints, contract, permission matrix | Batch 0 | Agent |
| 5 | Owner decisions (parallel, no engineering) | Nothing | You |
| 6 | Golden journey tender-to-warranty, golden-value assertions, demo UI crawl | 1, 2, 5 | Agent + you |
| 7 | Arabic PDFs/CSV, localization gates, native Arabic review, visual/RTL review | Sign-off needs people | Agent + reviewers |
| 8 | Audit triage, pilot-copy reconciliation, restore drill, UAT, green remote CI, final GO/NO-GO | 1-6 | You + operators |

## Batch 0 - Environment
- Working PostgreSQL 16 throwaway database (Docker engine fails in the local sandbox: "protocol not available").
- First remote CI run of `.github/workflows/ci.yml` (needs push approval; branch is not merged, `main` is 307 commits behind).

## Batch 1 - Finance correctness
1. C-FIN-AR-001 (High): `routes/invoices.js` list GET recalculates status to `overdue` without `glPosting.syncInvoicePosting`; `routes/payments.js` then accepts payment on the draft/overdue row; `financeEngine.transitionInvoice` refuses paid -> issued. Fix, with regression test from the INV-0010 reproduction (gross 1,000 / retention 100 / net 900).
2. Diagnose the AP mismatch (subledger 43,000 vs GL payable credit 67,500): product defect or seed artifact.
3. Repair of existing demo rows (INV-0005 etc.) - script only; applying it needs your approval and the demo stack.
4. Re-run AR/AP invariants.

## Batch 2 - Full PG gate
1. Run `test:pg` (all `.pg` suites incl. the C5 nav matrix and Phase B/C suites) once.
2. Triage and fix failures, one commit per slice.
3. B1 repair-script dry run on the demo DB (demo stack required). `--apply` needs your approval.
4. `--approval-limits` demo stage (demo stack required).

## Batch 3 - Phase 1 security (re-audit each box before building)
1. Data exposure: secrets never returned by GET (hash/encrypt, show once); report column whitelist, authorize on `spec.module`, CSV formula neutralisation; media visibility filter.
2. Input/network: SSRF guard (private/loopback/link-local block, resolve-then-pin, no redirects); upload magic-byte validation, size limits, AV-scan queue.
3. Auth hygiene: constant-time login, no disabled-account disclosure, bcrypt cost 12, lockout, last-owner protection, `TRUST_PROXY`, keyed rate limiter.
4. Logs/events: audit coverage (`logActivity` loud in transactions, before/after, IP, request id, denials); wildcard subscriptions; per-hook project filter and outbox.
5. Error leakage: remaining 374 `error: e.message` sites (lint baseline may only go down); `x-powered-by` off; validate `CORS_EXTRA_ORIGINS`.

## Batch 4 - Phase 4 test infrastructure
1. Real-PG harness (migrate once, transaction- or schema-per-suite); port inventory, finance, procurement, workflow-engine, policy suites.
2. Concurrency suite: stock-issue race, double MIR decision, double approval, numbering collisions, duplicate delivery, idempotent cost posting.
3. Constraint tests: negative stock, over-delivery, FK RESTRICT, duplicate pending approval.
4. OpenAPI-vs-live contract tests for `/api/v1`.
5. Permission matrix: every role x module x action against seeded policy, including MCP.

## Batch 5 - Owner decisions
- Canonical external roles (client_executive etc.): portal menu exists but portal APIs return 403 - grant or leave.
- C-PROC-002: return path for rejected delivery DLV-00003.
- Production approval limits per role/action.
- `owner_ceo` approval wait state: add or drop from demo census.
- Commercial assumptions and golden values.
- Push / merge strategy for the closeout branch.

## Batch 6 - Golden journey
Tender-to-warranty test (current `golden-chain.pg.test.js` is a partial P2P slice); assert cost, progress, finance against `docs/GOLDEN_VALUES.md`; re-run demo UI crawl.

## Batch 7 - Localization and PDF
Production Arabic PDFs/CSV; remaining inline branches (53) and localization gates; native Egyptian Arabic review; owner visual/RTL review.

## Batch 8 - Sign-off
Audit triage (GO 1); pilot-copy reconciliation (GO 3); restore drill and rollback sign-off (GO 6); UAT signatures finance/procurement/site/owner (GO 7); green remote CI (GO 2); update `GO_NOGO.md` with fresh evidence.
