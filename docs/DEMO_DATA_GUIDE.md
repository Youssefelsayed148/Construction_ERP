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
