# Role testing and demo data - report (final for this session)

Backup taken first: `test-run/pre-e2e-20261102-005336.dump`. Demo records are prefixed `DEMO-` (demo project id 6). No users were created, edited or deleted.
Rows: `results.json` (role, module, action, expected, actual, result, evidence). Screenshots: `e2e/role-testing/screenshots/` (38).

## Deployment status (updated)
The backend image was rebuilt and restarted from this branch (`docker compose --env-file .env.docker`, backend + migrate only; frontend, DB and `docker-compose.yml` untouched).
Migration 0087 is applied on the live DB (0085, 0086 already were). The masking, self-approval, NCR/incident audit+events and requisition-rejected code is live.

## Summary (results.json, 2975 rows)
PASS 2281 | FAIL 23 (historical seed rows from the run on the old code; not re-run) | FINDING 33 | SKIPPED: ACCOUNT NOT FOUND 564 | N/A 38 | NOT RUN 36 (probe paths answering 404)

## Results by part
- **Access matrix (36 accounts + unassigned/expired/workflow accounts, 47 modules, serial run, 1.5 s between logins): 1745 PASS / 3 FAIL / 38 N/A.** The 3 FAILs (purchasing_mgr boq/work-orders/locations 403) are a harness error: that account is procurement_manager on project 1 (the probed project), so 403 is correct; recorded as scope-adjusted PASS.
  - owner_ceo / coo get 403 on: users and workflow-templates (route restricted to owner/admin in code), approval-limits, activity, handover, consultant, client-portal, portal (no `view` grant). The grants match the code, so these are "as built"; whether they are *intended* (e.g. CEO without approval-limits/activity/handover view) is an owner decision.
  - owner: 0 denied modules (handover answers 400 only because the probe has no project context). accountant: denied only users, workflow-templates, approval-limits. admin and viewer have no account (not tested).
  - Legacy vs modern: owner vs owner_ceo differs on 8 modules (above); accountant vs finance_manager differs on 8 (activity, legal, assets, maintenance, consultant, portals, delegations ...); purchasing_mgr vs procurement_manager differs on 26 (legacy is much broader). Legacy roles are broader than their canonical equivalents.
- **UI / Playwright (one browser, one context at a time): 38 accounts, 38 PASS** (sidebar shows exactly the policy-allowed modules; unassigned and expired accounts show an empty sidebar, dashboard shell only).
- **Forbidden actions: 105/105 denied (403)** (valid: a 403 needs an authenticated session).
- **Value visibility (live, after deploying the masking): 0 leaks in 144 valid probes** (was 9 before; the first rebuild left 2 on `/api/invoices` because the list field is `total_paid`, added to the catalog). Full-access roles still see all values. 36 probes (BOQ items, costing summary) hit paths that answer 404: NOT RUN. The earlier "180/180 PASS" was wrong (401/404) and is withdrawn.
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

## Step 2 - what we need exactly (owner decisions, then a small re-run)
1. **owner_ceo / coo view access**: confirm whether they should get `approval-limits.view`, `activity.view` and `handover.view` (today: 403). If yes, one additive grant migration (0088) for owner_ceo and coo. `users` and `workflow-templates` stay owner/admin-only unless you say otherwise.
2. **consultant_reviewer**: should it be able to record WIR results / recommendations (the routes accept `consultant` and `consultant_coordinator` only)? If yes, add it to those routes.
3. **Portals show no DEMO data** for client / consultant / subcontractor: needs an API (or wizard step) to add project participants and link organizations after creation (items 7 and 9 of the bug list). Decide: build the endpoint now, or accept portals are tested with the migrated pilot data only.
4. **Masking scope**: confirm the catalog (client price, subcontract price, internal cost) and whether hr/payroll salaries, finance-ledger and finance summaries must be masked too; then the frontend screens need a "hidden value" rendering pass.
5. **Dashboard** financial-summary card shows to an account with no assignment (empty data): hide it when the role lacks finance view?
6. **Re-run only the failed seed steps** (23 rows) on the new code, then rebuild the report. Needs your OK because it creates more DEMO rows on the live DB.
7. **i18n:check** cannot run until `typescript` is installed in `frontend/` (`npm ci`); not a code issue.
8. **Manual pass** (you or a tester): portals, masked screens, measurement approval by a second user, NCR/incident notifications.
