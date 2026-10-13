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

| Area | Evidence and current status | Next action / dependency |
|---|---|---|
| Phase 6.2 prompt replacement | Current `rg -n "prompt\\s*\\(" frontend/src --glob '*.{js,jsx,ts,tsx}'` finds 49 calls in 17 page files: Approvals, Assets, Clients, DocControlExtended, Expenses, Handover, HR, Legal, PortalDashboard, ProjectDocuments, QHSE, QHSEExtended, Reports, SiteManagement, SiteWorkspace, UnitsSales. | Replace in bounded, localized form/confirmation slices; validate input and select scoped records. Exit criterion is zero prompt calls. |
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
