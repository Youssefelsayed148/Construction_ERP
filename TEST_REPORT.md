# Role testing and demo data - report (final for this session)

Backup taken first: `test-run/pre-e2e-20261102-005336.dump`. Demo records are prefixed `DEMO-` (demo project id 6). No users were created, edited or deleted.
Rows: `results.json` (role, module, action, expected, actual, result, evidence). Screenshots: `e2e/role-testing/screenshots/` (38).

## IMPORTANT limitation
The live app container was built at 2026-11-02 00:36. Rebuilding/restarting it was blocked (production-deploy guard), so the **live app does not yet contain this session's code**
(value masking, self-approval block, NCR/incident audit+events, requisition-rejected notification) or migration 0087. Migrations 0085 and 0086 ARE applied on the live DB (verified).
Everything below that ran against the live app tested the older code. The new code is verified by tests on a throwaway DB only.

## Summary (results.json, 2975 rows)
PASS 2265 | FAIL 32 (23 historical seed rows + 9 live visibility leaks) | FINDING 40 | SKIPPED: ACCOUNT NOT FOUND 564 | N/A 38 | NOT RUN 36 (404 probe paths)

## Results by part
- **Access matrix (36 accounts + unassigned/expired/workflow accounts, 47 modules, serial run, 1.5 s between logins): 1745 PASS / 3 FAIL / 38 N/A.** The 3 FAILs (purchasing_mgr boq/work-orders/locations 403) are a harness error: that account is procurement_manager on project 1 (the probed project), so 403 is correct; recorded as scope-adjusted PASS.
  - owner_ceo / coo get 403 on: users and workflow-templates (route restricted to owner/admin in code), approval-limits, activity, handover, consultant, client-portal, portal (no `view` grant). The grants match the code, so these are "as built"; whether they are *intended* (e.g. CEO without approval-limits/activity/handover view) is an owner decision.
  - owner: 0 denied modules (handover answers 400 only because the probe has no project context). accountant: denied only users, workflow-templates, approval-limits. admin and viewer have no account (not tested).
  - Legacy vs modern: owner vs owner_ceo differs on 8 modules (above); accountant vs finance_manager differs on 8 (activity, legal, assets, maintenance, consultant, portals, delegations ...); purchasing_mgr vs procurement_manager differs on 26 (legacy is much broader). Legacy roles are broader than their canonical equivalents.
- **UI / Playwright (one browser, one context at a time): 38 accounts, 38 PASS** (sidebar shows exactly the policy-allowed modules; unassigned and expired accounts show an empty sidebar, dashboard shell only).
- **Forbidden actions: 105/105 denied (403)** (valid: a 403 needs an authenticated session).
- **Value visibility (live, pre-fix code): 9 real leaks** - technical_office_engineer (payment applications, subcontract value), contracts_manager and procurement_manager (client invoices, payment applications, subcontract value), subcontractor_site_engineer (subcontract value) see values without the matching flag. Full-access roles see all values. 36 probes (BOQ items, costing summary) hit paths that answer 404: NOT RUN. The earlier "180/180 PASS" in the previous report was wrong (those calls were 401/404) and is withdrawn.
- **Demo seed (live, run 1 + fixes)**: all steps in the brief seeded through the API (project 6 ... handover). The 23 FAIL / 28 FINDING rows are the historical outcome of the seed run on the old code; many are fixed in code (see below) but the seed was NOT re-run (per instruction), so they stay as recorded. Some are superseded rows from steps the seed scripts no longer issue.

## Code fixes in this session (committed; verified by tests, not live)
- Shared server-side value masking, default-deny, in `authorize()` (`services/valueMasking.js`): client price (invoices, payment applications, client contracts, BOQ rates), subcontractor price (subcontracts, certificates, work-order rates), internal cost (costing). Coverage is by mount/field catalog: hr/payroll/finance-ledger/finance summaries are not masked yet.
- Measurement review judged as `quantities.approve` (QS, PM, CM, CEO, COO) and self-approval blocked (`self_approval_forbidden`, EN/AR keys).
- NCR and incident create now write audit_events and raise events (`ncr.raised`, `incident.reported`); `purchase_requisition.rejected` now notifies the requester. Other "no notification" rows were a seed timing artefact (notifications are delivered asynchronously); the seed check now waits.
- Migration 0087: locations create/edit and work-orders create for project_manager and construction_manager. Not granted (seed changed instead): WIR submit by QA/QC, permit submit by site manager, handover items by document controller, AP invoice workflow, RFI/submittal stages.
- Seed uses the revisioned RFI/submittal register.
- Credential files are gitignored.

## Gates (current output)
- lint:guards ok; i18n:parity ok (3158 keys); lint:api ok; **i18n:check NOT RUN** (the `typescript` package is missing from this install).
- Backend mock suite: 93/93 suites, 1344 tests.
- Real-PG suites on a throwaway PostgreSQL 16 (149 migrations applied clean): first run 99/103; the 4 failures were fixtures broken by the self-approval rule (3) and a hard-coded RFQ date that expired (1), fixed; re-run: golden-journey, daily-report-progress, progress-derivation pass; mutation-audit 1206/1206 on a fresh DB. Net 103/103.

## Still open / decisions
1. Deploy this commit (rebuild backend) so migration 0087 and the code are live, then re-run the visibility probe and the seed failures only.
2. Owner decision: is the owner_ceo/coo denial of approval-limits, activity and handover view intended?
3. Consultant routes accept `consultant` and `consultant_coordinator`; `consultant_reviewer` has no write route (intended?). Portals still show no DEMO data for client/consultant/subcontractor because there is no API to add project participants after creation.
4. Masking coverage beyond the listed mounts; frontend screens that read masked fields need a "hidden" rendering pass.
5. Dashboard shows the financial-summary card to an account with no assignment (empty data, but the card is shown).
