# Task: Construction ERP closeout - Session F (all fix batches F1-F4)

Continue the closeout of the Osiris Labs Construction ERP (React, Express, PostgreSQL, bilingual EN/AR, RBAC). Base: branch `closeout/batch-a-to-6` (it already contains the merged Batches 0-4 work, merge commit `680fc09`; if `git log` does not show it, STOP and report - do not redo that work). Read first: `AGENTS.md`, `docs/CLOSEOUT_PLAN_F_AND_T.md`, `docs/ERP_CLOSEOUT_PLAN.md`, `docs/CLOSEOUT_GAPS.md`, the top ~120 lines of `STATE.md`. Inspect code before changing it. Status claims need current command output.

You own PRODUCT-CODE fixes. A separate Session T owns test authoring and the single full PG run; do not write golden-journey, role-by-role UAT, or pilot-environment tests, and do not run the full PG suite.

## TEST-RUN DISCIPLINE (owner instruction: fix batches do NOT run suites)
- Run NO full suites and NO per-batch gates in this session: not `test`, not `test:pg`, not the frontend suite, not the build. Verification of the whole system happens in Session T, once.
- Per slice only: write the test red-first and run ONLY that one focused test file, once, to see it fail and then pass. Never rerun an unchanged passing file. `.pg.test.js` files you add are not run here (Session T runs them); only check them with a single `node --check`.
- The only other commands allowed, each at most ONCE at the very end of the session: `npm --prefix backend run lint:guards`, `i18n:check`, `i18n:parity` (cheap static checks needed to lock baselines). No retry loops: after two failed attempts at a step, stop it, record the blocker, continue.

## Hard constraints
- Additive versioned migrations only; next number is `0072` (check the directory; `0030` is a gap, never reuse). EN/AR columns paired; i18n keys namespaced. Locked decisions: no Redux Toolkit or Socket.io; labour cost from `labor_payments.total_amount`; centralized listener costs; business-rule retention with per-contract override.
- Every endpoint: authenticate, authorize, project-scope filter, typed errors via `routeFail`/error_code contract, audit event in the same transaction, EN/AR keys. New screens: loading/empty/error, localization, RTL-safe, permission-driven.
- Throwaway local PostgreSQL 16 only (Docker if available, else the installed service; DB name like `erp_closeout_test`). Never touch demo/pilot/clone databases, `.env`, secrets, external services, or the legacy role switch.
- Git: work directly ON the existing branch `closeout/batch-a-to-6` - do NOT create a new branch. If the cloud environment pre-created a `claude/...` working branch, run `git checkout closeout/batch-a-to-6` (tracking origin) before any change, commit each slice there with the harness Co-Authored-By trailer, and push with `git push origin closeout/batch-a-to-6` (run `git pull --rebase origin closeout/batch-a-to-6` first). Session T starts only after you finish, so there is no concurrent writer. Never push `main`, open a PR, force-push, deploy.
- After each batch (F1..F4) append command output to `STATE.md`, `docs/CLOSEOUT_PROGRESS.md`, `docs/CLOSEOUT_LOG.md`. At the end write a line `F-SESSION COMPLETE <commit>` at the top of `STATE.md` so Session T can detect it.

## Owner decisions already taken (use as given; do not re-ask)
1. External-role portal: GRANT canonical external roles the same portal data access as their legacy alias family (migration 0031 mapping: client_executive/client_reviewer/pmc_manager -> client portal; consultant_coordinator/consultant_reviewer -> consultant portal; subcontractor_manager/subcontractor_site_engineer -> subcontractor portal; supplier_sales/testing_lab -> supplier portal).
2. C-PROC-002 (rejected delivery): NO new return document. Provide a minimal "rejected - supplier to collect" record on the rejected delivery/MIR (note + status/flag, stock-neutral, audited), only if the existing status vocabulary can carry it additively; otherwise add one additive column. No GL effect.
3. `owner_ceo` approval wait state: DROP from the demo census; document in `docs/CLOSEOUT_GAPS.md`. No product change.
4. Production approval limits: NOT decided by you. Do not seed production values. Only produce `docs/APPROVAL_LIMITS_DECISION_SHEET.md` (matrix of role x 7 monetary actions, currency, blank "approved limit" column, the demo ladder for reference) for the owner to fill.
5. Golden values are Session T's concern; do not touch `docs/GOLDEN_VALUES.md`.

## F1 - Hardening left open by the Batch 0-4 session
1. `middleware/auth.js` `logDenial` writes one awaited `audit_events` row per 403: add a dedupe/rate cap (e.g. in-memory window per user+module+path, bounded map) so a denial burst cannot flood the table or add DB latency per request; keep the 403 reply independent of logging success; test it.
2. Review the `procurementService.js` diff from commit `fda42d4` (BadRequestError use) for wrong status mappings; review the test files edited in `fda42d4`/`6fd3dc6`/`c8242b5` for assertions that were loosened rather than corrected (`git show` each). Fix any you find, with a note per file in STATE.md; report "none found" if so.
3. Type remaining business-rule throws that surface as 500: grep services for `throw new Error(` that represent caller faults (validation, state, insufficient, duplicate) in procurement, inventory, finance, hr, site, qaqc, hse; attach `.status`/error_code the same way the existing NotFoundError/ConflictError/BadRequestError do. Add EN/AR keys for any new code. One table-driven test file covers the lot.
4. `routes/documents.js` mutation audit coverage: every create/update/delete/approve/supersede writes `logActivity`/audit in the same transaction with before/after, ip and request id; test it.

## F2 - Error-contract cleanup
Convert remaining raw `error: e.message` route sites (366 at baseline) to `routeFail` (4xx business errors keep their message under a stable error_code with error_params; unexpected -> 500 `internal_error` with request id, no leak). Order by files with the most sites. Lock the new lower baseline in lint-guards (it may only go down). Add EN/AR keys for each new error_code in `errors.json` (parity must hold). Per-route-group focused contract tests in the style of `c2-error-contract.test.js` (auth stubbed, db failing), not one test per route.

## F3 - Decision-dependent fixes
1. Portal grants (decision 1): additive migration `0072` granting canonical external roles the portal-module data grants their alias family holds (copy the exact module/action pairs from migration 0031/legacy alias grants; read them, do not guess). Check `EXTERNAL_PORTAL_PATHS` caging in `middleware/auth.js`: caging canonical roles must not remove internal read access they use today (e.g. client_executive reading `/api/projects`); decide from code and cover with a test either way. Extend `App.js` `LandingRedirect` so mapped external roles land on their portal. Update Sidebar tests and the C5 nav matrix expectations (`nav-visibility.pg.test.js`) to match; do not run that PG file (Session T does).
2. C-PROC-002 minimal record (decision 2): inspect `procurement` delivery/MIR rejection code (`decideMir`, `mir_rejections`) and implement the smallest additive change with audit, EN/AR keys, a small UI affordance on the rejected delivery if a delivery detail screen exists, and a focused test.
3. Demo census: remove the owner_ceo item from the demo final-states/census helpers if they are tracked in git; document in gaps.
4. Write `docs/APPROVAL_LIMITS_DECISION_SHEET.md` (decision 4).

## F4 - Localization and PDF
1. Read `docs/i18n/PDF_SPIKE.md` and the spike output; implement production Arabic-capable PDF export (correct shaping, RTL, embedded font) for the document types the spike covers, reusing the chosen renderer and without paid services; CSV export keeps UTF-8 BOM and neutralises formula prefixes. Focused tests assert Arabic text is present and the PDF is generated for EN and AR.
2. Reduce the remaining ~53 `inlineBranches` sites (en/ar ternaries) to shared helpers/keys, biggest screens first; the `rawEnumRendering` site in `Handover.js` too. Lock new baselines (down only).
3. Regenerate `docs/ARABIC_REVIEW_PACK.md`. This is NOT a native-review sign-off; say so.

## Final report (last message and STATE.md)
Per batch: commits (hash + subject), done / verified-already-done / blocked (exact blocker, evidence, next action). Gate table: only what was actually run (focused files and the three static checks); everything else listed NOT RUN - deferred to Session T. Lint baselines before/after, migration numbers added, new error codes. Decisions taken without asking. Explicitly list "NOT RUN: all suites and build (deferred to Session T)".
