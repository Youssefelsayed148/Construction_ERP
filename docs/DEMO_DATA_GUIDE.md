# 2026-10-17 - RUN 1b-3 Gate C blocked at masters preflight

- Harness checkpoint `aaf1df9`: import target resolved to existing helper; the earlier MODULE_NOT_FOUND was because it was run before helper creation. Red reproduced with one diagnosed `TypeError` in the test recorder; both POST-count assertions now use `(call) => (call[2] || {}).method === 'POST'`. Focused red: 1 suite, 1 passed / 1 failed, 0.29 s, exit 1. Focused green: 1 suite, 2/2 passed, 0 skipped, 0.375 s, exit 0.
- Read-only proper-role probe command `node .scratch-company-demo/master-counts.js`: exit 0, approximately 0.9 s. `GET /api/clients`, `/api/projects`, `/api/suppliers`, `/api/subcontractors`, `/api/items`, `/api/warehouses`, `/api/costing/codes` all returned 200; counts respectively 0, 0, 0, 0, 5, 0, 12. Counts are current API rows, not created rows. No API writes were made.
- Static route inspection confirms the mounted warehouse API has no create route: `/api/warehouses` exposes GET collection/detail and POST movement/transfer/reservation operations only; v1 aliases the same route set. Project provisioning also contains no warehouse creation. The two required warehouses cannot be created through the permitted services/API. Direct SQL is disallowed for creation, and product changes are disallowed, so masters cannot satisfy its required entities.
- C-MASTER-001 remains MEDIUM (broken flow/capability): no authorized warehouse-creation endpoint/service. Gate C is BLOCKED before module execution; masters module created 0 records and its module-specific idempotency test was not written/run. Procurement, finance, HR, site/QHSE, second full run, document-number list, and nine-state check are NOT RUN. Gate D and E are NOT RUN. No business rows were changed.
- Next action: resume masters only after a supported warehouse create API/service path is made available or scope changes to authorize its implementation. Continue with masters idempotency tests/count/commit before procurement.
# 2026-10-17 - RUN 1b-3 Gate C helper checkpoint and masters API blocker

- Diagnosed import resolution: from `backend/src/scripts/__tests__`, `../company-demo-business` resolves to the existing `backend/src/scripts/company-demo-business.js`; the earlier MODULE_NOT_FOUND occurred because that helper had not yet been created, not because the require path was wrong. PowerShell `Test-Path` confirmed the resolved file exists.
- Failing-first reproduction after import diagnosis: `npm.cmd --prefix backend test -- --runInBand --runTestsByPath src/scripts/__tests__/company-demo-business.test.js` -> 1 failed suite, 1 passed / 1 failed tests, 0.29 s, exit 1. Exact red cause was the test's `options.method` dereference on a GET call (`TypeError`, no code). Fixed both POST counters to `(call) => (call[2] || {}).method === 'POST'`.
- Green focused command -> 1 suite, 2 passed / 2 tests, 0 skipped, 0.375 s, exit 0. It covers exact-target rejection before an API call and mock-API stable-key idempotency (first run creates 2; second creates 0). This is helper-only evidence, not proof of a real business module or live dataset rerun.
- Masters capability preflight: route source inventory shows `/api/warehouses` has GET collection/detail and POST movements/transfers/reservations, but no POST warehouse creation. The v1 router aliases the same routes and has no create alias. `projectProvisioning.js` contains no warehouse creation. Creating warehouses would therefore require a raw SQL write or a product/API change; both are outside this request's allowed seed actions. No POST probe or database write was made.
- Gate C STOP/FAIL before the masters module. Masters: created by this run=0; live starting counts were not queried; module tests not written/run. Procurement, finance, HR, site/QHSE, second full seed, document-number table, and all nine-state checks: NOT RUN. D/E: NOT RUN. No demo business records were written.
- Defect logged: C-MASTER-001, MEDIUM — no authenticated warehouse-creation service/API is available to seed the required two warehouses through the permitted path. No product code change. Next action: provide an authorized supported warehouse-creation API/service path or authorize product endpoint work, then resume masters before other modules.
# 2026-10-17 - RUN 1b-3 STOP at Gate C safety tests

- Gate B remains PASS and its docs checkpoint is committed as `a9b39bc`. Gate C FAIL/STOP at the focused seed-helper test step; D and E are NOT RUN.
- Failing-first attempt 1: `npm.cmd --prefix backend test -- --runInBand --runTestsByPath src/scripts/__tests__/company-demo-business.test.js` exited 1 before tests ran (1 failed suite, 0 tests). The test imports the not-yet-created helper; this was not valid assertion-level red evidence. Redacted error: module not found (`MODULE_NOT_FOUND`; no application/API call).
- Attempt 2, after adding the helper: same command exited 1; 1 suite, 1 passed / 1 failed. The target guard passed. The idempotency test recorder threw `TypeError` because it dereferenced missing options on a GET call (no error code). Stop after two failed attempts at this step; no third test run, helper correction, or business-seed attempt.
- No business data writes, reset, or other mutations occurred. Target health remains read-only evidence from Gate B. New local files `backend/src/scripts/company-demo-business.js` and `backend/src/scripts/__tests__/company-demo-business.test.js` are incomplete and uncommitted; preserve them for continuation. Scratch digest helper remains under `.scratch-company-demo/` and uncommitted.
- Next action in a new continuation: inspect and correct the test recorder with safe GET handling, rerun only this focused test, then continue C implementation only after both guard and stable-key idempotency assertions pass. Do not start D/E before C passes.
# 2026-10-17 - RUN 1b-3 Gate B account idempotency checkpoint

- Start: `f3e92a9a0144852caa5425d969cce77ec0de6f1c`, branch `closeout/batch-a-to-6`; working tree was clean. Only target: `erp-demo-20261017` / `construction_erp_demo`.
- Focused command `npm.cmd --prefix backend test -- --runInBand --runTestsByPath src/scripts/__tests__/company-demo-safety.test.js`: PASS, 1 suite / 34 tests, 0 skipped, 0.564 s, exit 0.
- Read-only `GET http://127.0.0.1:8092/api/health`: HTTP 200, database healthy. `docker compose ... ps --format json` could not inspect service state because Docker Desktop denied its engine pipe (exit 1); no retry or Docker mutation followed.
- Scratch-only digest helper queried the 38 `demo-*@demo.example.com` users ordered by id and SHA-256 hashed ordered `(id,password,token_version)` tuples. Before seed: accounts=38, digest=`73ff43c906bdcea9b2219daa158df48c23caed6a66a3e481c383c247078e06bc`. Seed command `npm.cmd --prefix backend run seed:company-demo` ran twice; each exit 0, about 7.4 s, accounts=38, created=0, logins=38. Post-run digest after each: same 38 and same digest. Hashes, token versions, credentials and environment values were not printed. The current roster's total is 38, including its bootstrap `workflow_owner` entry.
- Owner-run failing-first evidence supplied with this request: at `e1a6adb`, 1 failed / 33 passed and only the email-validation test failed; at `f3e92a9`, 34 / 34 passed. Current 34-test focused suite also passed. No baseline replay was needed or performed in this run.
- Gate B: PASS for the defined 38-account roster, two idempotent reruns and current safety suite. Gate C, D and E: NOT RUN. No company business records were seeded. Docker inspection denial was bypassed with a successful read-only health check; it did not block Gate B.
- No source/test edits, reset, raw SQL writes, pilot/clone access, external sends, product fixes, or review-report staging. `.scratch-company-demo/account-digest.js` is local scratch only.
# Current demo status - 2026-10-17 continuation

UI: http://127.0.0.1:8092. Compose: erp-demo-20261017. Database: construction_erp_demo, loopback 55442 via nginx stream proxy. Demo db/backend are healthy; frontend is running. No pilot or clone operation was performed.

Current accounts: **38 real accounts; 38/38 logins successful; zero registrations on rerun**. Addresses follow demo-<rolekey>@demo.example.com. Credentials stay in the ignored demo-only file; none are included here. The earlier email blocker below is superseded. Project-only/unassigned/expired role assignments remain pending; successful login does not establish business access.

**Company dataset is not complete.** No business seed ran during this continuation; document numbers remain unavailable. Earlier empty-dataset counts below are historical and were not freshly recounted. The three-project Alexandria story, suppliers/subcontractors, materials, procurement, finance, HR/payroll and QHSE records and all walkthrough states remain unverified. Do not present this environment as a completed company demo.

See [current verification report](DEMO_VERIFICATION_REPORT_2026-10-17.md). Execution stopped after two failures reconstructing baseline regression evidence, per the requested stop rule. Resume instructions are in STATE.md.

---

Historical guide follows; account status is superseded above.

# Company demo guide - Gate C in progress (masters, procurement and finance)

**Masters and procurement records are loaded; the full company dataset is incomplete.** UI: `http://127.0.0.1:8092`; database: `construction_erp_demo` on loopback `55442`; Compose project: `erp-demo-20261017`. No pilot/clone environment was contacted.

The account stage remains 38 verified logins from Gate B. Credentials remain in ignored demo-only files and are not included here. HR and site/QHSE, the final whole-seed rerun, and full nine-state verification are still pending. Procurement and finance have real document numbers below. C-PROC-001/002 leave the owner_ceo PR state and a return directly linked to the rejected delivery unavailable.

## Masters counts (2026-10-18)

| Record | Count | Notes |
|---|---:|---|
| Clients | 3 | Demo target |
| Projects | 3 | A 55%, B 90%, C 5% |
| Phases / milestones | 12 / 9 | Four phases and three milestones per project |
| Team assignments | 26 | Includes scoped, external and expired assignment rows; unassigned user remains without project seat |
| Cost codes | 12 | Existing seeded catalog; no new codes |
| BOQ sections / items | 3 / 15 | Five items per project |
| Suppliers / subcontractors | 6 / 2 | Demo target |
| Materials | 30 | 25 demo materials plus 5 pre-existing catalog rows |
| Warehouses | 2 | Approved guarded inserts; project-bound to A and B |
| Project locations | 9 | Three per project |

## Finance counts and document numbers (2026-10-18)

| Record | Count | Real document numbers / state |
|---|---:|---|
| Client invoices | 4 | INV-0001 paid (100,000 EGP); INV-0002 partially paid (200,000 EGP, 50,000 received); INV-0003 unpaid/sent (80,000 EGP); INV-0004 overdue (40,000 EGP) |
| Client receipts (AR only) | 2 | DEMO-AR-RCPT-PAID-001 (100,000 EGP); DEMO-AR-RCPT-PARTIAL-001 (50,000 EGP) |
| Supplier invoices | 1 | DEMO-AP-001, approved, 43,000 EGP |
| Supplier payments (AP only) | 1 | DEMO-AP-PAY-001, 43,000 EGP, direction=ap; separate from client receipts |

The finance seed uses the invoice, supplier invoice and payment service routes. AR receipts are created with direction=ar; AP payment uses direction=ap and supplier_id without client invoice_id. `npm.cmd --prefix backend run seed:company-demo:finance` created 9 on its initial execution and 0 on its second complete execution. Readback command `node .scratch-company-demo/finance-counts.js` returned client invoices=4, AR receipts=2, AP supplier payments=1, supplier invoices=1, and confirmed statuses paid/partially_paid/sent/overdue. Focused helper test passed 1 suite/1 test; its first red was the diagnosed missing-module import, not an assertion-level behavior red.

## Procurement counts and document numbers (2026-10-18)

| Record | Count | Real document numbers / state |
|---|---:|---|
| Purchase requests | 12 | PR-00001 through PR-00012; PR-00001 remains draft because the active template has no owner_ceo step |
| RFQs | 4 | RFQ-00001 through RFQ-00004; RFQ-00001 has 3 quotations and no award |
| Purchase orders | 10 | PO-00001 through PO-00010; PO-00001 and PO-00002 are partially delivered |
| Deliveries | 3 | DLV-00001 and DLV-00002 are 40-unit partial receipts on PO-00001; DLV-00003 on PO-00002 was rejected |
| MIRs | 3 | MIR-00001 and MIR-00002 accepted; MIR-00003 rejected |
| GRNs | 2 | GRN-00001 and GRN-00002 for accepted deliveries |
| Supplier returns | 1 | SRN-00001 linked to GRN-00001; it is not a return from rejected DLV-00003 |
| Client invoices / receipts / NCRs | 4 / 2 / 0 | Finance is loaded; site/QHSE is not run |

Masters focused test: `npm.cmd --prefix backend test -- --runInBand --runTestsByPath src/scripts/__tests__/company-demo-masters.test.js` -> 1 suite / 2 tests PASS, 0 skipped, exit 0. Seed command `npm.cmd --prefix backend run seed:company-demo:masters` -> exit 0; complete rerun -> `created=0`. See `STATE.md` for timings, diagnosed intermediate seed corrections and test-red limitation.

Defects logged: C-MASTER-001 MEDIUM (no supported warehouse-create route for real users; demo used the owner-approved narrow SQL exception); C-MASTER-002 MEDIUM (`hr_manager` cannot create employees; use `workflow_owner`). Product code has not been changed.

| Interesting state | Present | Intended role key after seeding |
|---|---|---|
| Overdue client invoice |Present: INV-0004|accountant_ar / owner_ceo|
| Partially paid invoice |Present: INV-0002; 50,000 of 200,000 EGP received|accountant_ar|
| PO with two partial deliveries |Present: PO-00001 / DLV-00001, DLV-00002|procurement_officer / storekeeper|
| RFQ award pending |Present: RFQ-00001, 3 quotations|procurement_manager|
| PR waiting on CEO |Missing: PR-00001 is draft; workflow has no owner_ceo step|owner_ceo|
| Low-stock alert |Not run|storekeeper|
| Open NCR |Not run|qa_qc_manager|
| Pending variation |Not run|commercial_manager|
| Project B retention pending |Not run|finance_manager|

### Document numbers

Client invoice numbers are INV-0001..INV-0004. Receipt identifiers are the real API reference numbers DEMO-AR-RCPT-PAID-001 and DEMO-AR-RCPT-PARTIAL-001. NCR remains pending. All listed identifiers and statuses were read from the demo API.

---

Historical guide follows; superseded by the current masters status above.

# Company demo guide - environment only; dataset not loaded

**Historical status only.** The account/bootstrap status and empty dataset counts below predate the 2026-10-18 masters module and must not be treated as current.

| Interesting state | Present | Intended role key after seeding |
|---|---|---|
| Overdue client invoice |No|accountant_ar / owner_ceo|
| Partially paid supplier |No|accountant_ap|
| PO with two partial deliveries |No|procurement_officer / storekeeper|
| RFQ comparison ready for award |No|procurement_manager|
| PR waiting on CEO |No|owner_ceo|
| Low-stock alert |No|storekeeper|
| Open NCR |No|qa_qc_manager|
| Pending variation |No|commercial_manager|
| Project B retention release pending |No|finance_manager|

Distinct stored demo city strings: **none** (no client/supplier/project records). Required future strings are exactly EN`Alexandria` / AR`الإسكندرية`; optional second cities only`Cairo`/`القاهرة` and`Giza`/`الجيزة`.

The 20-minute CEO walkthrough is unavailable until stages2-7 and Gate B pass. Planned order only:portfolio3min;project A/progress3min;procurement/partial receipts4min;finance/collections4min;quality/HSE2min;CEO approvals/My Actions2min;project B retention and project C mobilization2min. None of those business states has been loaded or verified.

Resume only in a new authorized continuation after the stop:email-contract test/correction, exact demo-only reset/reinitialization, accounts/idempotency, then seven stage checkpoints. Do not run seed:staging or repair business data with SQL. No back-dating SQL used. Keep external adapters disabled and backend/database on the internal-only network. Reset command exists and has negative target tests; it has not been executed.
