# Closeout carryover register

Audit date: 2026-10-13 (Africa/Cairo)
Branch: `closeout/batch-a-to-6`
Last verified implementation slice: `ad8f9f6` (Phase 5.8.2 plus gate repairs)

This register captures evidence-backed work that remains after the 5.8.2 slice. It is not a production readiness approval. The working tree contains only the pre-existing untracked `docs/CODEX_AUDIT_REPORT.md` artifact; it has not been edited or staged.

## Verified gates and limits

- Fresh throwaway PostgreSQL 16 database applied migrations through 0060. Backend mock: 53 suites / 999 tests; real PostgreSQL: 67 suites / 605 tests; frontend: 28 suites / 107 tests.
- `lint-guards`, `i18n:check`, production build passed. Playwright discovered 84 tests: 34 passed, 50 skipped.
- Pilot smoke was not run. Automatic review rejected its invocation because `smoke:staging` reads `.env.docker` and `.staging-users.json`, which repository instructions prohibit reading. Do not bypass this condition; use a newly designed smoke route that consumes supplied runtime configuration without opening those files, if permitted by the applicable instructions.
- The audit report is a user-provided, untracked artifact. Its findings below are summarized as audit leads and must be revalidated against current source before being represented as newly reproduced.

## Remaining work by area

### Revalidation of audit report leads

The following dispositions use current-source inspection plus the fresh 5.8.2 gate output. This is targeted revalidation, not an exhaustive security or specification review.

| Audit lead | Current evidence | Disposition |
|---|---|---|
| D1 delegation renewal/test fixture | Fresh full PostgreSQL gate passed 67 suites / 605 tests, including the org/RBAC suite. | Prior red-gate symptom is not reproduced in current gates; keep regression coverage. |
| D2 webhook SSRF | `backend/src/services/webhookService.js` resolves host addresses, rejects prohibited ranges, pins the connection to the checked address, and does not follow redirects through its direct HTTP request implementation. | Earlier finding appears fixed in current code; retain focused adversarial DNS/IP tests and recheck at security review. |
| D3 webhook secret disclosure | Webhook create/rotate encrypts the secret; list/get queries select explicit non-secret columns. | Earlier finding appears fixed in current code. |
| D4 transactional activity audit | `logActivity` now throws on insert failure; finance mutation routes use `auditedTransaction`. | Improved, but route-wide transactional audit coverage was not re-proved; inspect every mutation family and test rollback on audit failure. |
| D5 retention/advance/deduction accounting | `glPosting.js` records certificate memo/retention ledger entries; `docs/DECISIONS.md` still keeps account mappings provisional pending finance-owner confirmation. | Finance policy/signoff remains blocked. Reconcile all required debit/credit mappings and postings after owner confirmation. |
| D6 configurable approval limits | `approvalLimits` service, admin routes, migration 0037, and MCP limit enforcement exist. | Earlier missing-foundation finding is superseded by current implementation; verify configured role/action values and business approval before finance use. |
| D7 procurement/finance UI callers | `ProcurementWorkspace.js` exposes award recommendations; `ProjectFinanceWorkbench.js` provides forecast, credit-note, payment-batch and certificate workflows. | The audit's earlier “no UI caller” evidence is stale; full role-based golden journey remains to be verified. |
| D8 client invoice lines | `financeEngine.js` inserts `invoice_lines`; `invoices.js` reads them. | Earlier unwired-model finding is fixed in current code; finance reconciliation still needed. |
| D9 forecast EAC/maker-checker | `commercialEngine.js` reads approved forecast versions; `budgeting.js` applies `assertNotMaker` on forecast approval. | Earlier static gap is fixed in current code; retain tested concurrency and financial reconciliation coverage. |
| D10 inventory traceability/accounting | `procurementService.js` links supplier returns to GRN lots; `inventoryDocuments.js` posts stock adjustments but no GL posting was found in that service. | Lot-specific supplier return gap appears fixed. Adjustment GL/accounting treatment remains open. |
| D11 raw errors/localization | Current `backend/src/utils/typedRoute.js` logs untyped exceptions with a request ID and returns `internal_error` with generic text; direct/typed error paths and screen strings still need broad review. | Untyped fallback leak appears fixed. Continue route-wide review for typed/database error detail and untranslated UI text. |
| D12 bilingual laborer name columns | `migrate-1.4.js` defines `full_name_en`; paired `full_name_ar` was not found in the inspected migration. | Open schema/UX decision: determine whether this is intentional language-neutral data or add a paired column through a versioned migration. |
| D13 project tab visibility | `projectNav.js` filters by policy grants and project scope, with no legacy role fallback. | Earlier navigation finding appears fixed; still run canonical-role rendering and backend 403 coverage. |
| D14 hard-coded test-user seeder | `backend/create_test_users.js` now prints a retirement notice and exits instead of mutating users. | Earlier unsafe-seeder finding is fixed; use the guarded staging seed only in its approved isolated workflow. |
| D15 audit/CI truth | Local gates are current and listed above; remote GitHub Actions/billing state is not freshly verified. | Local status reporting is current; remote CI remains unverified.

| Area | Evidence and current status | Next action / dependency |
|---|---|---|
| Phase 6.2 prompt replacement | The initial scan found 48 calls in 16 page files. Deletion prompts now use exact-name bilingual confirmation; text-entry prompts use the shared dialog; ITP point creation uses a validated form; and unit sale amount uses a numeric dialog. The final portal slice replaced consultant and supplier prompts with bilingual forms and scoped dashboard record selection. Current scan: zero `prompt()` calls under `frontend/src`. | Prompt exit criterion met locally. Remaining Phase 6 route-to-screen/API/permission inventory and bilingual journey checks are open. |
| Phase 6.1 / 6.3 route-to-screen audit and admin UX | `docs/PLAN_5_6_TO_6.md` marks shared form kit and administration partial and requires an App/sidebar/API inventory. Existing settings, setup, shell, and module pages exist, so source-plan “missing screen” claims need route-level verification. | Build an explicit route → screen → API/permission inventory; implement only proven missing owner-facing screens. |
| Phase 6.4 / 6.5 navigation and dashboards | Plan records project/module workspaces mostly implemented but calls out navigation reachability, attention counts, role dashboards, and canonical incident entry point for validation. | Verify each required journey from navigation with authorized role, project scope, 403 checks, and loading/empty/error behavior; document intentional API-only modules. |
| 5.6 consultant SLA administration | `docs/PLAN_5_6_TO_6.md` §5.6.2 says due times use configured SLA and null when absent; SLA administration remains open. | Add scoped, permission-guarded administration for workflow SLA values and focused tests. |
| 5.6 supplier/subcontractor register completeness | Plan §5.6.5 says supplier MIR shows number/status/decision date; line-level accepted/rejected quantities and full internal inspection history remain internal. | Decide whether portal users need additional line detail; keep supplier/org/project authorization and allowlisted fields. |
| Batch C/E and 5.6–5.8 audit reconciliation | `docs/CODEX_AUDIT_REPORT.md` §§4–5 lists D1–D15, including webhooks, transactional activity audit, finance postings, UI callers, forecast controls, inventory traceability, role navigation, and owner decisions. These findings require current-source revalidation; this carryover does not claim they remain unchanged. | Reproduce each applicable item against current source/tests and map dispositions to the master closeout plan before taking implementation slices. |
| Finance/accounting | `docs/DECISIONS.md` records provisional GL mappings; audit D5/D8/D9 identify retention/deduction posting and client invoice-line gaps; finance owner signoff remains pending. | Confirm account purposes, VAT and certificate treatment, then implement missing postings/invoice-line writers with PG reconciliation tests. No financial signoff until owner confirmation. |
| Security and operations | Audit D2–D4/D11/D14 identify webhook SSRF/secret handling, activity audit failure behavior, raw errors, and unsafe test-user script concerns. | Revalidate and remediate before any deployment/pilot expansion. No legacy role switch, external sends, or production changes. |
| Phase 7–11 | `docs/CODEX_AUDIT_REPORT.md` §5 and master plan describe offline/mobile, localization, reconciliation, recovery/rollback, monitoring, security review, training and signed UAT as open deliverables. | Reconcile each with current plan and obtain required product/owner decisions; implement against disposable environments and capture command output. |
| Human acceptance | `docs/UAT_PILOT.md` signoff table is pending; finance mappings are blocked pending owner confirmation. | Business users execute and sign UAT; finance owner confirms mappings. These are human decisions and cannot be inferred from automated checks. |

## Decisions and hard boundaries

- GL account-purpose mappings and approval thresholds remain provisional until the finance/business owner confirms them.
- Notification provider choice, credentials, templates/consent, and spend limits are not approved; 5.8.2 intentionally has no live external delivery.
- The Phase 11 agentic AI request lacks a specific acceptance definition in the audit; define scope, allowed actions, authorization, and audit boundary before implementation.
- Do not deploy, push, open a PR, run destructive migrations, execute the legacy role switch, read prohibited credential files, or send external messages.
- `docs/PLAN_RECONCILIATION.md` was not present at audit time. Reconcile directly against `docs/ERP_CLOSEOUT_PLAN.md` and record the source plan/version when preparing the missing reconciliation artifact.

## Next implementation sequence

1. Revalidate Batch C/E and the D1–D15 audit leads against current code; classify fixed, open, superseded, and decision-blocked with current evidence.
2. Finish the Phase 6 route-to-screen inventory and remove prompt flows in cohesive page slices, starting with internal confirmations and edits; keep EN/AR and project-scoped record selection.
3. Close the agreed 5.6 and finance/security blockers after their owner decisions are available.
4. Continue Phases 7–11 in master-plan order, using versioned migrations, throwaway databases, per-slice commits, and current command output.
5. Keep production status NO-GO until all required security, finance, reconciliation, recovery, and human UAT criteria are signed.
