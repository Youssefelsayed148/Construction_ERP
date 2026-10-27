# Task: Construction ERP closeout, Batches 0-4 (single cloud session)

You are continuing the closeout of the Osiris Labs Construction ERP (React frontend, Express backend, PostgreSQL, bilingual EN/AR, RBAC) on branch `closeout/batch-a-to-6`. Read `AGENTS.md`, `docs/ERP_CLOSEOUT_PLAN.md` (phase authority), `docs/CLOSEOUT_REMAINING_PLAN.md` (this task's plan), `docs/CLOSEOUT_GAPS.md` and the top ~80 lines of `STATE.md` first. Inspect the implementation before changing it. Status claims need current command output; do not claim a gate you did not run.

## Scope and order
Do the work in this order: Batch 0 -> Batch 1 -> Batch 3 -> Batch 4 -> Batch 2 (the single full PG run, at the very end). Batch definitions are in `docs/CLOSEOUT_REMAINING_PLAN.md`.

## TEST-RUN DISCIPLINE (most important rule)
- Do NOT run any full suite (backend `npm test`, `test:pg` without a file filter, full frontend `npm test`) until all code for Batches 0, 1, 3 and 4 is written and committed.
- While working, run at most the single focused test file you just wrote or changed, once per slice, to confirm red-then-green. Do not rerun a file that has not changed since it last passed. Do not rerun lint/i18n/build gates per slice; run each exactly once at the end.
- At the end: run the full PG suite ONCE (`npm --prefix backend run test:pg`), plus once each: `npm --prefix backend run lint:guards`, `npm --prefix backend run lint:api` (use the script names that exist in package.json), frontend `npm run i18n:check`, `npm run i18n:parity`, and the full backend mock-db suite once. Save full unfiltered output to ignored log files.
- If failures occur, fix them, then rerun ONLY the failing test files. Do NOT run a second full suite; list it under "NOT RUN: full-suite confirmation" in your report.
- Never loop on a failing command. After two failed attempts at the same step, stop that item, record the exact blocker, and move on.

## Hard constraints (from AGENTS.md)
- Additive, versioned SQL migrations only, numbered after the highest existing version (check `backend` migrations; `0030` is a known gap - never reuse it). Keep EN/AR columns paired and i18n keys namespaced.
- Locked decisions: no Redux Toolkit or Socket.io; labour cost from `labor_payments.total_amount`; centralized listener costs; business-rule retention with per-contract override.
- Every endpoint authenticates, authorizes, filters by project scope, returns typed errors (use `routeFail`/error_code contract from `typedRoute.js`), writes audit events in the same transaction as the change, and has EN/AR keys.
- Use only a throwaway local PostgreSQL 16 (Docker if the sandbox allows; otherwise a locally installed postgres service). Database name must look disposable (e.g. `erp_closeout_test`); refuse anything production-looking. Never read or print secrets, never edit `.env`, no external messages, no paid services, never execute the legacy role switch; use stubs for external adapters.
- Do not touch any demo/pilot/clone database. Anything needing the demo stack (B1 repair `--apply`, `--approval-limits` seed stage, repair of existing demo rows) is out of scope: write the script/code only, mark "NOT RUN - needs demo stack and owner approval".
- Git: commit each slice on `closeout/batch-a-to-6` with the Co-Authored-By trailer the harness provides. You may push ONLY to `closeout/batch-a-to-6` (or the working branch the cloud session creates from it). Never push to `main`, never open a PR, never force-push or rewrite history, never deploy.
- Update `STATE.md`, `docs/CLOSEOUT_PROGRESS.md` and `docs/CLOSEOUT_LOG.md` with command output after each batch (not after each command). At any stop condition record state, exact blocker, evidence, next action in `STATE.md`.

## Batch 0 - Environment
1. Bring up a throwaway PostgreSQL 16 and set `DB_*`, `JWT_SECRET`, `TEST_PG=1` in the process environment only (never in a file). Run all migrations once via the repo's migration runner; record the migration count.
2. Confirm `.github/workflows/ci.yml` jobs reference scripts that exist; fix drift only. Do not trigger remote CI yourself.
3. If no PostgreSQL can be obtained, record the blocker and still complete code work for Batches 1, 3, 4 with mock-db tests; mark all PG proof NOT RUN.

## Batch 1 - Finance correctness (C-FIN-AR-001, AP mismatch)
Known facts (verify in code first):
- `routes/invoices.js`: list `GET /api/invoices` recalculates a status to `overdue` without calling `glPosting.syncInvoicePosting`, so no `client_invoice` journal entry exists for that invoice.
- `routes/payments.js` accepts payment on a draft/overdue invoice; the receipt posts but the invoice never did. `financeEngine.transitionInvoice` then refuses paid -> issued. Result: invoice subledger open 0 vs GL receivable net negative (INV-0010: gross 1,000, retention 100, net 900, GL delta +900).
- Correct controls: plain `POST /api/invoices` and `POST /api/finance-ledger/invoices/:id/transition` (approved -> issued) post and reconcile.
Tasks:
1. Red-first regression tests (focused, mock-db or PG as fits the existing suite): (a) GET list must not change status in a way that bypasses posting (either remove the read-side mutation or make it go through `syncInvoicePosting` inside a transaction with the audit event), (b) payment against an invoice that never posted is refused with a typed error_code (EN/AR keys) or posts the invoice first, choose the smaller change consistent with the draft -> approved -> issued lifecycle, and explain the choice in `STATE.md`, (c) balanced-entry check holds.
2. Implement the fix. Keep retention behaviour (business-rule retention with per-contract override) unchanged.
3. Write a demo-repair script (dry-run by default, `--apply` flag) for rows like INV-0005 (paid, 90,000, no client_invoice posting) that posts the missing entry idempotently. Do NOT run it against any demo DB.
4. AP mismatch (subledger 43,000 vs GL payable credit 67,500; GRN accruals 72,000, supplier invoice 43,000, payment 43,000, return 4,500): read the posting code and decide from code whether this is a product defect or a seed-order artifact. If a defect, fix with a test; if an artifact, document the reasoning in `docs/CLOSEOUT_GAPS.md` and add an invariant test that would catch a true defect.
5. Add an AR/AP invariant test (subledger open == GL balance) to the PG suites for the final run.

## Batch 3 - Phase 1 security (re-audit before building)
For each unchecked box under "Phase 1" in `docs/CLOSEOUT_GAPS.md`, first grep the code and migrations to see whether it is already implemented; mark done items as verified-by-code (with file:line) and do not rebuild them. Then implement what is genuinely open, in this order:
1. Secrets never returned from GET (hash/encrypt at rest, shown once); reports: server-side column whitelist, authorize on `spec.module`, no arbitrary column filters, CSV formula-prefix neutralisation (`= + - @`); media visibility/approval filter and `file_url` ownership validation.
2. SSRF guard (block private/loopback/link-local, resolve-then-pin IP, no redirects); upload magic-byte validation, size limits, remove zip/doc/xlsx unless justified, AV-scan queue stub.
3. Auth hygiene: constant-time login path, no disabled-account disclosure before password check, bcrypt cost 12, lockout, MFA design stub, block demoting/deactivating the last owner; `TRUST_PROXY` handling and keyed limiter after v1 auth.
4. Audit: `logActivity` fails loudly in transactions, before/after, IP, request id, denials; cover boq, subcontractors, portal, actions, documents mutations. Event bus: wildcard subscription pattern matcher (`rfi.*`), per-hook project filter, outbox table with retry and dispatch tracking (additive migration).
5. Error leakage: continue converting `error: e.message` sites using `routeFail`; the lint-guards baseline may only decrease (record before/after). `x-powered-by` off; validate `CORS_EXTRA_ORIGINS`.
Each item: test first (focused), implementation, EN/AR keys for new error codes, one commit.

## Batch 4 - Phase 4 test infrastructure
1. Real-PG harness (migrate once, transaction-per-test or schema-per-suite); reuse existing `.pg.test.js` conventions; port inventory, finance, procurement, workflow-engine, policy suites from mock-db where practical (keep mock-db for unit-level).
2. Concurrency suite: stock-issue race, double MIR decision, double approval, numbering collisions, duplicate delivery, idempotent cost posting.
3. Constraint tests: negative stock, over-delivery, FK RESTRICT, duplicate pending approval.
4. API contract tests: OpenAPI spec vs live `/api/v1` responses.
5. Permission matrix: every role x module x action against the seeded policy, including MCP, generated from the seeded policy tables, not hand-written lists.
Write these tests but do not run them individually beyond one syntax/collect check each; they execute in the final full PG run.

## Batch 2 - Final gate (once, at the end)
Run the commands listed under TEST-RUN DISCIPLINE. Triage failures; fix; rerun only failing files. Do not run the B1 dry run or demo stages (no demo stack).

## Final report (in your last message and in STATE.md)
- Per batch: commits (hash + subject), items done, items verified-already-done, items blocked (exact blocker, evidence, next action).
- Gate table: command, exit code, pass/fail counts, or NOT RUN with reason.
- Lint baseline before/after, migration numbers added, new error_code keys.
- Decisions taken without asking, and anything that needs the owner (demo repair approval, push/merge, production approval limits).
