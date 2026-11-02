# Role testing and demo data - final report (session 2026-11-02)

Backups: `test-run/pre-e2e-20261102-005336.dump` (before any test data) and `test-run/pre-seed-rerun-20261102-071712.dump` (before the seed re-run). Both are gitignored.
Demo records are prefixed `DEMO-` (project id 6). No users were created, edited or deleted. Nothing was pushed by this session after `93cd7dc`.
Rows: `results.json` (role, module, action, expected, actual, result, evidence). Screenshots: `e2e/role-testing/screenshots/` (38).

## Summary (results.json, 3014 rows)
PASS 2312 | FAIL 9 (all 9 = the live dashboard regression below) | FINDING 6 (known gaps) | SUPERSEDED 49 | SKIPPED: ACCOUNT NOT FOUND 564 | N/A 38 | NOT RUN 36 (costing-summary probes, path answers 404)

## URGENT - live regression found by the UI pass (fix is committed, NOT deployed)
UI pass on the live app (one Chromium, one role at a time; MemAvailable 3984 MB at start, lowest 3837 MB, 3921 MB at end; no leftover processes): **29 PASS, 9 FAIL, 0 NOT RUN.**
The 9 failing roles (site_manager, planning_engineer, contracts_manager, procurement_manager, accountant_ap, qa_qc_manager, hse_manager, equipment_manager, hr_manager) get a **blank app**: the dashboard throws `Cannot read properties of undefined (reading 'month_total')`.
Cause: the dashboard masking rule matched the KEY `expenses` and deleted the whole `modules.expenses` object for roles without a finance flag; `Dashboard.js` then read `mods.expenses.month_total`.
Fix (commit after this report): masking now strips only leaf values and recurses into objects; `month_total`/`total_*` are treated as money on the dashboard; `Dashboard.js` reads `mods.expenses?.` / `mods.finance?.`. New unit test covers it (9/9).
**The live backend still runs the old masking, so these 9 roles currently get a blank dashboard until the backend is rebuilt and restarted** (no frontend recreate is needed for the fix itself). Screenshots in `screenshots/` for these 9 are stale (from the earlier 38/38 run); the harness now saves a screenshot and the page error on failure.

## Deployed state (live app)
Backend + migrate images rebuilt from this branch and restarted (`docker compose --env-file .env.docker`, backend/migrate only; frontend image, DB container and `docker-compose.yml` untouched). Migrations 0087, 0088, 0089, 0090 are applied on the live DB.
The frontend image WAS rebuilt and recreated (new bundle live). That recreate resolved `backend` to other stacks' containers on the shared `dokploy-network` (502 on /api); you applied a runtime nginx patch, and commit 18ae2ee adds the unique alias `construction-erp-backend` in docker-compose.yml and points nginx at it (not yet applied: needs a backend recreate + frontend rebuild/recreate, awaiting your approval).

## Owner decisions implemented
1. **owner_ceo / coo read-only view** of approval-limits, activity, handover (migration 0089; `GET /api/approval-limits` route list widened, PUT stays owner/admin). users and workflow-templates stay owner/admin. Verified live: 200 on the three, 403 on writes, 403 on users/workflow-templates.
2. **consultant_reviewer = review actions only**: consultant.approve and consultant.reject (0089), the four recommendation routes accept it, its RFI/submittal stage responses are judged approve/reject and its comments `submit`; create/edit stay 403 (verified live). Also fixed: the consultant engine's decision functions only accepted the legacy `consultant` key and skipped the project-assignment check for every canonical consultant role; canonical roles are now accepted and must be assigned to the project (fail-closed).
3. **POST /api/projects/:id/participants** (project_manager, projects_director, owner_ceo, coo; project-scoped): adds client/supplier/subcontractor/consultant, creates and links the legacy client/supplier/subcontractor record for API-created organizations, audited in the same transaction, typed 404/409/400/403. Verified live (DEMO-ORG-CONS, DEMO-ORG-SUP) and by a real-PG suite.
4. **Masking, default-deny, one layer** (`services/valueMasking.js`, hooked in `authorize()`): see list below. Hidden fields are removed from the payload; the frontend formatter shows a hidden marker instead of 0.
5. **Unassigned account sees nothing on the dashboard**: empty-state message (EN/AR) when every dashboard call is refused (repo only, see above).

## Masked modules (14)
invoices, commercial (payment applications, client contracts), boq (unit rates/prices = client price), subcontractors, work-orders, costing, projects (budget/contract value), dashboard (money cards) - by flag; hr (salaries; also hr_manager), payroll (also hr_manager) - internal cost; finance-ledger, finance, payments, expenses - any finance flag, plus accountant_ap by role.
Own enforcement already: client-portal, portal, mcp/agent (agentPolicy), commercial budget/forecast/commitment routes.

## Modules still UNMASKED that carry money (decision needed for each)
- procurement (PO totals, RFQ/quotation unit prices) - needs the `see_supplier_value` flag wired into policy decisions (the permission exists, 7 holders, but `decide()` does not return it); procurement roles would otherwise lose their own prices.
- inventory, warehouses, materials, items (stock value, unit prices)
- assets, maintenance (purchase and maintenance cost), legal (contract values)
- clients (credit limit, balance), suppliers, organizations (credit_limit, insurance_amount)
- approvals (the amount under approval is shown to every approver), reports (generated payloads), sales, handover, quantities, schedule (if cost-loaded)
- approval-limits (the limits themselves; owner/admin/CEO/COO only by route list)
No money fields: auth, users, workflow-templates, activity, documents, docs, qhse, hse, actions, notifications, locations, delegations, team, consultant, health.
Frontend caveat: screens that SUM masked fields (reduce over undefined) can show 0/NaN for roles without the flag; only the shared currency formatter was converted to the hidden marker.

## Results by part (live)
- **Access matrix (serial, 1.5 s between logins): 1745 PASS, 3 scope-adjusted (purchasing_mgr is procurement_manager on project 1), 38 N/A.** owner_ceo/coo denials as listed in the earlier report were run BEFORE 0089; the targeted check after 0089 supersedes them for the three modules (full matrix not re-run).
- **UI**: the earlier 38/38 run predates masking of the dashboard; the re-run after the deploy is 29/38 (see URGENT).
- **Forbidden actions 105/105**; **targeted post-deploy checks 24/24** (CEO/COO view-only, reviewer create/edit denied, HR salary hidden from site_engineer and visible to hr_manager, ledger values for accountant_ap, storekeeper denied).
- **Value visibility: 0 leaks in 144 valid probes** (was 9 before masking). BOQ rates are `see_client_price`; the probe now expects that flag (it used to expect see_internal_cost, which was wrong). 36 probes (costing summary path) answer 404: NOT RUN.
- **Seed re-run (2..8, serial, idempotent)**: all steps pass; seed8 (participants) 11/11. 6 FINDING rows remain, all known gaps: supplier record-scope reads (2), subcontractor / consultant portals empty because those pilot accounts have no organization link (users cannot be edited), consultant certificate recommendation (consultant_coordinator is not assigned to the project: the new fail-closed check), client portal row from the first run.

## Gates (current output)
lint:guards ok | i18n:parity ok | lint:api ok | **i18n:check NOT RUN** (typescript missing in this install) | **frontend page tests NOT RUN** (react-router-dom and other deps not installed; the pure formatter test ran and passed).
Backend mock suite: 93/93 earlier; after the latest changes only the affected suites were re-run: valueMasking 8/8, consultant, approval-limits, policy, module-override-coverage, client-portal, agent (all pass), lint:guards ok.
Real-PG (throwaway PostgreSQL 16, 151 migrations applied clean): earlier full run 103/103; after the latest changes: project-participants, canonical-action-holders, role-matrix, org-rbac-5-1, consultant-observation, policy-flows, fail-closed, media-role-matrix, policy-matrix, nav-visibility, portal-acceptance, t3-role-coverage, get-routes, document-register-fields, subcontractor-submissions, role-sync, commercial-5-5, batch5a-dashboard all pass. NOT re-run in full after the last changes: the remaining ~85 PG suites.

## Items to review before you push
- **Migration 0090 deletes one grant row** (accountant_ap + see_internal_cost) that 0088 added earlier the same day, because that flag also opens commercial budgets to the AP clerk (caught by nav-visibility). It is the only DELETE; review it. 0088 stays in history so the migration checksums stay valid.
- Frontend rebuild is pending (see above).
- Seed script `seed3.js`/`visibility.js` edits are harness-only.

## Still open
1. Rebuild the frontend image and re-run the UI pass; run the full frontend and PG suites once on a machine with the dependencies.
2. Decide masking for the unmasked list above (procurement first: wire `see_supplier_value`).
3. Consultant, subcontractor and testing-lab pilot accounts have no organization link, so those portals stay empty (needs an `organization_users` row; user edits were out of scope).
4. 36 costing-summary probes: find the correct costing summary path.
