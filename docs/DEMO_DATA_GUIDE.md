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

# Company demo guide - environment only; dataset not loaded

**STOP at Phase B stage1. Gate B failed; do not present this as a running-company demo.** UI:http://127.0.0.1:8092; database:construction_erp_demo on loopback55442; Compose project:erp-demo-20261017. Existing pilot/clone environments were not changed.

Only the bootstrap owner exists (1of38 actual accounts); 38 generated credential entries are preserved in the ignored demo credential file. No password, token or environment value belongs in this guide. The bootstrap `workflow_owner` login is currently blocked by the generated email domain failing the real email validator; see D-001 in [verification report](DEMO_ENVIRONMENT_VERIFICATION_2026-10-17.md). Other account keys are planned, not verified logins.

Actual company records:projects0,clients0,suppliers0,employees0,PR0,RFQ0,PO0,deliveries0,MIR0,GRN0,invoices0,payments0,expenses0,journals0. One default organization and130 migrations are present. [All251 public-table row counts](DEMO_TABLE_COUNTS_2026-10-17.md) include migration defaults. Demo document numbers: **none**.

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
