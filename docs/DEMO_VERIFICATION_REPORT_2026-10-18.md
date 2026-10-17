# Demo verification report - RUN C2 (2026-10-18)

Target: `erp-demo-20261017` only; UI `127.0.0.1:8092`; PostgreSQL `127.0.0.1:55442`; DB `construction_erp_demo`. Branch `closeout/batch-a-to-6`; base `6d94e7c`. No push, pilot/clone contact, reset, secret output, external contact or product route changes. Historical Gate B and prior attempts are in [the 2026-10-17 report](DEMO_VERIFICATION_REPORT_2026-10-17.md).

## Gate C

| Step / command | Result |
|---|---|
| `node .scratch-company-demo/c2-preflight.js` | Exit 0; exact target DB confirmed; A/B/C project IDs 1/2/3; two intended stock rows identified. |
| `node .scratch-company-demo/c2-low-stock.js` | Exit 0; exactly two rows updated: DEMO-MAT-023 75/100 and DEMO-MAT-021 0/1; dashboard alert readback present. |
| `node .scratch-company-demo/c2-retention.js` | Initial exit 1: direct draft-to-issued transition returned HTTP 400; code requires draft -> approved -> issued. Corrected run exit 0; created/reused CC-00001, INV-0005, AR receipt DEMO-RETENTION-B-RCPT-001 and one 10,000 EGP hold. Idempotency rerun exit 0, created none. Public readback held 10,000, released 0, balance 10,000. |
| `node .scratch-company-demo/c2-backdate.js` | Exit 0; 134 rows across 31 unique table families; timestamps/document/payment dates only. Before/after amount/status/key digest identical at 115 table families. |
| Five module commands | Masters, procurement, finance, HR, site/QHSE each ultimately exit 0 and `created=0`. Procurement first returned 400 because old delivery stable keys were dates changed by back-date; seed dates aligned and retry passed. Site first reported created=3 due its report-date lookup; readback remained exactly three reports (API idempotency key replay); seed dates aligned and retry passed. No business count duplication. |
| Census: `node .scratch-company-demo/c2-census.js` plus five module count scripts | Exit 0. Masters 3 clients / 3 projects / 6 suppliers / 2 subcontractors / 30 materials / 2 warehouses / 12 cost codes / 12 phases / 9 milestones / 9 locations / 3 BOQ sections / 15 items / 32 team seats. Procurement PR12 / RFQ4 / 3 quotes / PO10 / DLV3 / MIR3 / GRN2 / SRN1. Finance invoices5 / AR receipts3 / AP supplier invoice1 / AP payment1. HR employees25 / attendance25 / leaves4 / payroll25 lines. Site reports3 / inspections3 / open NCR1 / incident1 / permit1 / RFI1 / variation1 / project settings3. |

Nine-state census has seven present: INV-0004 overdue; INV-0002 partially paid; RFQ-00001 with three quotations; two low-stock alerts; NCR-2026-0001 open; Project B retention pending. VAR-0001 is workflow-linked. PO-00001 with DLV-00001/02 is an additional verified procurement state. Owner_ceo wait remains unavailable: `role_action_approval_limits` gates monetary agent actions; `issue_purchase_order` queues finance_manager, and no mapped document type produces an owner_ceo wait step. Item stopped only; PR-00001 remains draft. C-PROC-002 is accepted; DLV-00003/MIR-00003 stays rejected without a return. SRN-00001 is linked separately to GRN-00002.

Gate C passes the seed count/idempotency/date-digest criteria with the two documented limitations above.

## Gate D

Gate D stopped at the first unexplained failure: the EN/AR Playwright crawl could not log in through the UI. No fixes or allowlisting were made.

| Step / command | Result |
|---|---|
| `node .scratch-company-demo/c2-invariants.js` | Exit 1. Client-receipt-only collected amount passed: 240,000 EGP, matching the finance summary; supplier/AP payments were separately 43,000 EGP and unclassified receipts were 0. PO accepted delivery quantity matched order limits; GRN quantities matched accepted delivery quantities; no negative quantity/available/reserved stock. Project dashboard reads for A/B/C returned HTTP 200. AR failed: open subledger 270,000 EGP vs GL receivable 180,000 EGP, no overallocated invoices. AP failed: aging/open subledger 43,000 EGP vs GL payable credit 67,500 EGP, no overallocated invoices. |
| `node .scratch-company-demo/c2-finance-diagnosis.js` | Exit 0, read-only. INV-0005 is paid/net 90,000 EGP and allocated 90,000 EGP but has no `client_invoice` GL posting; its client-payment posting exists. This explains the 90,000 EGP AR/GL difference. AP journal evidence: GRN accrual credits 72,000 EGP, supplier invoice cost credit 43,000 EGP, supplier payment debit 43,000 EGP, supplier return cost debit 4,500 EGP; resulting GL payable credit 67,500 EGP vs AP aging 43,000 EGP (24,500 EGP difference). Defects recorded; no product or business data changes made. |
| `node .scratch-company-demo/c2-api-sweep.js` | Exit 0; exact target, all 38 account logins succeeded. 1,444 requests total (38 logins + 1,406 GETs across 37 routes/account): 523 2xx, 883 403, 0 other 4xx, 0 500, 0 other 5xx, 0 transport failures. All 883 authorization responses remain recorded; none were allowlisted. |
| `node e2e/c2-demo-ui-crawl.js` | Initial sandbox attempt exit 1 (`spawn EPERM` launching Chromium); local authorized retry exit 1. Across 76 jobs (38 accounts x EN/AR), 0 successful UI logins, 0 pages/routes visited, 0 observed React crashes, 0 HTTP 500s, 0 captured request failures. All 76 reported `TimeoutError` during login; page locale was therefore unverified (the harness's 76 locale mismatch flags are not valid locale observations). `node e2e/c2-ui-one.js` diagnostic exit 0 displayed the UI error `Failed to fetch`; API logins succeeded in the separate API sweep. The transport/configuration cause is unexplained, so the crawl stopped here. No browser writes or external requests were allowed. |

Gate D status: FAIL / stopped. The money-collected predicate, PO/GRN quantity checks, stock non-negativity, and all-account API sweep passed. AR and AP reconciliation failed as above. UI route, locale, HTTP-error, and crash coverage could not be measured because UI login failed. No additional dashboard/route crawl or later Gate flow was run after the stop condition. Gate E was NOT RUN. No product defects were fixed and no responses were allowlisted.

Command capture and current scratch digest remain ignored/local under `.scratch-company-demo/`; secrets and credentials were not printed or staged.
