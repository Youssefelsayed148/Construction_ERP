# Role testing and demo data - report

Generated from `e2e/role-testing/out/*` by `e2e/role-testing/build-report.js` (rows in `results.json`).
Backup taken first: `test-run/pre-e2e-20261102-005336.dump`. All demo records are prefixed `DEMO-` (demo project id 6). No users were created, edited or deleted.
Per owner instruction, tests that passed were **not rerun** in the closing session.

## Summary (results.json: 2937 rows)
| Result | Rows |
|---|---|
| PASS | 536 |
| FAIL | 23 |
| FINDING (works but is a gap/decision) | 28 |
| SKIPPED: ACCOUNT NOT FOUND | 564 (12 roles x 47 modules) |
| N/A (no parameter-free GET) | 38 |
| NOT RUN | 1748 (access matrix, see below) |

## What passed
- Demo data seeded through the real API as the matching roles (seed1-7): client > project > locations/team > BOQ > cost codes > schedule > supplier > items/warehouse > PR > RFQ > award > PO > goods receipt > issue > work order/subcontract > measurements > QA/QC > HSE > documents/RFI/submittals > client billing (AR) > supplier invoices (AP) > ledger > HR/payroll > assets/maintenance > handover. Approve and reject paths included.
- Forbidden actions: 105/105 denied as expected.
- Value visibility probes: 180/180 as expected (but see open item 12).

## NOT RUN / invalid
- **Access matrix (36 accounts x 47 modules)**: the single run answered 401 for every call (session/login failure; a fresh single login for `owner_ceo` later returned 200, so the harness cached bad sessions or hit the login limiter). Rows are recorded as NOT RUN, not pass/fail. Expected matrix for all 48 roles is in `out/access-results.json` (`expectedMatrix`).
- **Playwright UI pass**: never ran; no screenshots exist.
- Items to confirm once the matrix is run: `owner_ceo` 403 on workflow-templates / approval-limits / activity / handover; legacy-vs-modern comparisons; admin/owner/accountant full access; viewer read-only.

## Roles with no account (skipped)
admin, client, consultant, engineer, legal_mgr, maintenance_mgr, manager, site_supervisor, staff, subcontractor, supplier, viewer.

## Bugs found (see `e2e/role-testing/out/bugs.md`)
Fixed in code (this commit): wizard date 500; wizard participants missing legacy ids; QA/QC, HSE and consultant engines hard-coded legacy role keys; engines threw status-less errors (HTTP 500 instead of 403); `consultantEngine` 32 untyped errors now 400/403/404/409; consultant routes now accept canonical consultant roles; project_manager handover grants (migration 0086); quantities review/approve grants (migration 0085).
Open:
1. Quantities review is judged as `create`; `site_engineer` could approve its own measurement (0085 adds grants; re-check).
2. Consultant-stage steps (WIR result, payment-certificate recommendation) still stalled for `consultant_coordinator` in the seed run; re-check after the fix.
3. No API to add project participants after creation; API-created orgs/clients get no legacy ids, so client, consultant and subcontractor portals show no DEMO data.
4. Value-visibility flags are not enforced on regular REST list endpoints (15 probe leaks: invoice, payment-application, subcontract amounts). Owner decision on masking policy needed.
5. Role fallbacks in seed (intended role got 403): project_manager create location; construction_manager create work order; quantity_surveyor subcontract certificate; technical_office_engineer / project_manager RFI and submittal stages; accountant_ap invoice workflow; document_controller handover package items; qa_qc_manager WIR submit; site_manager permit submit. Each needs a decision: grant the action or accept that another role owns it.
6. RFI/submittal single-answer endpoints return 410 `staged_response_required` (retired); the seed must use the revisioned response register.
7. No notification created for: rejected requisition, NCR, incident, permit reject, RFI, client invoice. No audit/activity row for NCR.

## Next
Run the access matrix and UI pass once, serially with a delay between logins; resolve open items 1-7; rerun only the failed seed steps.
