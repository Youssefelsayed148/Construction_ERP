# ConERP automated pre-UAT sweep - 2026-10-16

Report only. No application defect was fixed. The requested report date is retained; execution continued into 2026-10-17 in Africa/Cairo (raw timestamps are UTC). This is bounded automated evidence, not human UAT acceptance.

| Area | Executed result |
|---|---|
| Clone | MATCH on five requested tables; owner login verified on port 8091 |
| Registered routes | GET 448; POST 427; PUT 116; DELETE 58 |
| GET matrix | 38 accounts; 17,024 final-pass requests; 2 HTTP 5xx |
| Main write probes | 1777 requests; 592/601 registered write routes exercised; 9 safety exclusions; 0 HTTP 5xx |
| Final valid-body probes | 12 requests, 10 successful; every success increased per-actor activity_log/audit_events counts |
| Access/leak flags | 0 unexpected GET successes; 0 explicit foreign-project ID flags; valid project-create denial is S-002 |
| UI | 14 roles, EN then AR, 31 distinct routes, 400 role/language/route page visits |
| UI controls | 3340 clicked; 5754 skipped with reasons; 347 no-observable-change candidates |
| UI diagnostics | 12 uncaught exceptions; 0 raw-key occurrences; 0 undefined/null/NaN/object-text occurrences in final scans |
| RTL | 200 Arabic pages checked at 1280/390px; 0 overflow/direction flags; 0 page locale mismatches |
| Money | Client collected 0; reported collected 9130; supplier payments 9130: FAIL (S-001) |
| Journals | Debits 18260 = credits 18260; 0 unbalanced entries |
| Procurement | 1 PO quantity disagreement(s): PO-00008 |
| Numbering | 51 text number columns checked; 0 duplicate groups |
| List counts | 9/10 match scoped SQL; RFQ header absent |
| Backend logs | 99555 lines scanned; 77 distinct error/stack/unhandled lines; known webhook line separately: 0 |

## Isolation and snapshot counts

Only one command was sent to the pilot: docker exec erp-closeout-pilot-20261013-db-1 sh -c pg_dump (read-only dump, private output). No pilot inspection, SQL count query, HTTP login, seed, smoke, rebuild or restart was performed. Pilot counts below were counted from COPY records in that one consistent dump, then compared with the restored clone. No second pilot dump is authorized or needed to rerun the sweep.

| Table | Pilot dump snapshot | Clone before sweep |
|---|---:|---:|
| users | 77 | 77 |
| projects | 2 | 2 |
| purchase_orders | 20 | 20 |
| goods_receipt_notes | 11 | 11 |
| journal_entries | 22 | 22 |

Clone: Compose project erp-sweep-20261016; database construction_erp_sweep; loopback UI 8091; loopback PostgreSQL 55441; fresh project-owned volumes. The backend is attached only to an internal Docker network; nginx and PostgreSQL additionally use a host-facing network because Docker Desktop did not publish internal-only ports. Outbound adapters were not exercised with real URLs; backend egress is blocked. Browser requests outside the clone and non-login writes are intercepted. Neither database nor pilot credentials are printed here.

Migration output: migrate-1  \| [migrate] all migrations completed (0 applied, 130 already applied); migrate-1  \| [migrate] all migrations completed (0 applied, 130 already applied).

The clone remains running for inspection. Sweep writes intentionally changed clone-only directory/draft records and deactivated one clone organization; no source/pilot data was changed. UI and invariant evidence describe this mutable clone. Initial match counts are not a claim that the clone still matches the snapshot after writes.

## Findings

### S-001 - HIGH - Supplier payments are reported as collected client revenue

- Request/page: GET /api/dashboard/overview; GET /api/finance/summary
- Role: owner_ceo
- Expected: Client collections 0; outstanding 0. Supplier cash outflows are excluded.
- Actual: Dashboard health.revenue_collected=9130, health.total_outstanding=-9130; modules.finance.revenue_collected=9130, outstanding=-9130. Finance summary collected=9130, outstanding=-9130. SQL all payments=9130, supplier payments=9130, client payments=0, unclassified=0, invoices=0.
- Redacted evidence: .sweep/invariants-after.json; independent SQL aggregates and API projections
- Duplicate classification: D-002: YES. D-001: not established. PO-00008/reconcile ticket: NO.

### S-002 - HIGH - Canonical Owner/CEO cannot create a project despite its create grant

- Request/page: POST /api/projects
- Role: owner_ceo
- Expected: A schema-valid local draft project is accepted with the active projects/create grant (0031 RBAC matrix).
- Actual: HTTP 403 for {name_en:"<sweep marker>", name_ar:"اختبار", project_type:"commercial"}. The route coarse allow-list contains owner/admin/project_manager and excludes owner_ceo. PUT /api/projects/2 succeeds for the same account. No role or assignment was changed by the harness.
- Redacted evidence: .sweep/valid.json; .sweep/evidence.json ownerProjectCreateGrant; backend/src/routes/projects.js
- Duplicate classification: D-001/D-002: no documented ID match available. PO-00008/reconcile ticket: NO.

### S-003 - MEDIUM - PO-00008 accepted quantity is not backed by a posted GRN

- Request/page: SQL reconciliation of PO-00008 / purchase_order_lines.id=8
- Role: owner_ceo (read-only SQL inspection)
- Expected: Stored delivered/accepted quantities reconcile with live delivery lines and net posted GRN lines; accepted MIR quantities are traceable to receipts.
- Actual: {"po_number":"PO-00008","line_id":8,"ordered":10,"delivered_quantity":6,"accepted_quantity":6,"delivery_lines":6,"posted_grn":0,"accepted_mir":6}
- Redacted evidence: .sweep/invariants-after.json checks.poQuantities; no GRN was posted to repair it
- Duplicate classification: PO-00008: YES. Known PO quantity reconciliation ticket: YES. D-002: NO. D-001: not established.

### S-004 - MEDIUM - Procurement role dashboard returns HTTP 500

- Request/page: GET /api/dashboard/role?limit=200&offset=0&project_id=2
- Role: procurement_manager, workflow_checker
- Expected: HTTP 200 for the permitted role dashboard, or a typed client error for invalid input.
- Actual: 2 failures in the final matrix, error_code=internal_error. Clone logs contain column "project_id" does not exist through procurementWidgets/dashboardWidgets.js.
- Redacted evidence: .sweep/api.json; .sweep/evidence.json errors
- Duplicate classification: D-001: not established because its original ticket text is unavailable. D-002/PO-00008/reconcile ticket: NO.

### S-005 - MEDIUM - My Actions becomes a blank page for scoped operational accounts

- Request/page: /my-actions in EN and AR (1280px)
- Role: procurement_officer, storekeeper
- Expected: The action feed or an empty/error state remains rendered.
- Actual: Independent page-load-only confirmation, with no control clicks, reproduces React error #31 (object with keys {}) and bodyLength=0 in all four role/language combinations. Dashboard-only loads do not reproduce it. The broader crawl also captured these exceptions during link navigation; focused evidence establishes the exact failing page.
- Redacted evidence: .sweep/ui-confirm.json (4 failures / 4 My Actions loads; 0 failures / 4 dashboard loads)
- Duplicate classification: D-001: not established. D-002/PO-00008/reconcile ticket: NO.

### S-006 - MEDIUM - RFQ list omits X-Total-Count

- Request/page: GET /api/procurement/rfq?limit=1&offset=0; offset=1
- Role: owner_ceo
- Expected: Both pages report X-Total-Count=24, matching scoped SELECT COUNT(*).
- Actual: HTTP 200/200; header absent on both pages; first IDs=[24], second IDs=[23]. Offset advances, but clients cannot learn the total.
- Redacted evidence: .sweep/invariants-after.json checks.listCounts; .sweep/evidence.json rfqPagination
- Duplicate classification: D-001/D-002/PO-00008: not established/no. Related to pagination contract; no claim that it is the known quantity reconciliation ticket.

### S-007 - LOW - Raw English system enum values remain in Arabic controls

- Request/page: /projects/new, /my-actions
- Role: storekeeper, owner_ceo, coo, accountant_ap, site_engineer, accountant_ar, qa_qc_manager, finance_manager, hse_manager, client_reviewer, hr_manager
- Expected: System severity and channel labels use Arabic catalog labels; business text and approved acronyms remain unchanged.
- Actual: in_app, email, sms, whatsapp, critical, high, medium, low
- Redacted evidence: .sweep/ui.json latinSystemCandidates; locale locked and html lang checked
- Duplicate classification: D-001: not established. D-002/PO-00008/reconcile ticket: NO. Similar category to prior localization observations, without asserting an unavailable defect ID.

D-001 was referenced in the request but no locally identifiable ticket text carrying that ID was found. No duplicate relationship to D-001 is invented.

## API and invariant detail

The final GET pass uses IDs from the account's assigned project where available and inspects Express stacks plus exported v1 family/read-model definitions. 1330 requests (35 route templates per account) recorded missing sample IDs or unsupported non-ID parameters and used explicit missing placeholders. 228 requests use public/self-service/file/assistant semantics without the ordinary permission oracle; these were still requested and status-scanned. The permission oracle shares the production policy engine, so it cannot independently prove that the grant design is correct. The canonical project-create mismatch is supported independently by the RBAC migration matrix and a schema-valid request.

Foreign-project detection traverses explicit project_id/projectId/project_ids in successful JSON bodies for the requested project-scoped account groups. A zero flag count is not proof against leakage in unlabeled scalar aggregates, opaque files, or fields without ownership identifiers. Supplier-identity confidentiality beyond project ownership was not exhaustively certified.

No accessible list with a reported total over 200 was observed (0 qualifying lists); large-dataset no-gap/no-repeat pagination is therefore NOT VERIFIED. RFQ limit=1/offset=0,1 returned distinct IDs but no total header.

| List request | X-Total-Count | Scoped SQL count | Result |
|---|---:|---:|---|
| /api/projects?limit=1&offset=0 | 1 | 1 | MATCH |
| /api/clients?limit=1&offset=0 | 1 | 1 | MATCH |
| /api/suppliers?limit=1&offset=0 | 1 | 1 | MATCH |
| /api/items?limit=1&offset=0 | 8 | 8 | MATCH |
| /api/invoices?limit=1&offset=0 | 0 | 0 | MATCH |
| /api/payments?limit=1&offset=0 | 11 | 11 | MATCH |
| /api/expenses?limit=1&offset=0 | 0 | 0 | MATCH |
| /api/assets?limit=1&offset=0 | 0 | 0 | MATCH |
| /api/warehouses?limit=1&offset=0 | 1 | 1 | MATCH |
| /api/procurement/rfq?limit=1&offset=0 | absent | 24 | FAIL |

SQL scope matches the seeded Owner/CEO assignment, not the unfiltered whole database. Full SELECT statements are in the ignored invariant JSON. Number checks cover discovered text document-number columns; gaps/reservation sequence semantics and numeric/external-reference namespaces were not certified.

Main probe counted stores: audit_events (43 -> 46, delta 3). The original audit_events-only run produced false audit candidates: client creation is correctly recorded in activity_log. The organization deactivation also had an audit increment. Two replenishment sweep calls succeeded with no audit increment; these were no-op job invocations, not demonstrated unaudited business mutations. The final valid-body pass counts both audit stores per actor: 12 total audit increments across 10 successful writes, zero successful writes without an increment. Authentication/background work also grows audit counts; whole-run deltas cannot prove per-request attribution or transaction atomicity. No audit rollback/fault-injection guarantee is claimed.

Two earlier harness candidates are dismissed: an empty body is valid for a no-argument replenishment sweep, and a company-only payment-batch endpoint is correctly forbidden to project-bound pilot seats. These are not counted as application defects.

| Final valid request | Role | HTTP | Actor audit delta |
|---|---|---:|---:|
| POST /api/clients | owner_ceo | 201 | 1 |
| POST /api/suppliers | owner_ceo | 201 | 1 |
| POST /api/organizations | owner_ceo | 201 | 2 |
| POST /api/projects | owner_ceo | 403 | 0 |
| PUT /api/clients/2 | owner_ceo | 200 | 1 |
| PUT /api/suppliers/2 | owner_ceo | 200 | 1 |
| PUT /api/projects/2 | owner_ceo | 200 | 1 |
| POST /api/procurement/pr | owner_ceo | 201 | 1 |
| PUT /api/procurement/pr/29 | owner_ceo | 200 | 1 |
| POST /api/procurement/rfq | owner_ceo | 201 | 2 |
| POST /api/procurement/po | owner_ceo | 201 | 1 |
| POST /api/procurement/pr | client_reviewer | 403 | 0 |

## UI coverage and observations

| Account | EN pages | AR pages |
|---|---:|---:|
| owner_ceo | 30 | 30 |
| coo | 30 | 30 |
| procurement_officer | 5 | 5 |
| storekeeper | 5 | 5 |
| accountant_ap | 18 | 18 |
| accountant_ar | 15 | 15 |
| finance_manager | 29 | 29 |
| site_engineer | 4 | 4 |
| qa_qc_manager | 23 | 23 |
| hse_manager | 20 | 20 |
| hr_manager | 16 | 16 |
| client_reviewer | 3 | 3 |
| supplier_sales | 1 | 1 |
| unassigned | 1 | 1 |

| Skipped control reason | Count |
|---|---:|---:|
| not visible | 394 |
| locale fixed for this pass | 394 |
| denylist: asserted rendered/enabled state | 527 |
| shared link already exercised in this role/language | 4182 |
| form submission prohibited | 64 |
| unlabeled control requires manual safety review | 119 |
| click failed: TimeoutError | 69 |
| disabled | 5 |

The crawler discovers live menu/content links, clicks visible safe controls and discovered tabs, and records page/tab screenshots under ignored .sweep/screenshots/. Shared navigation links are exercised once per role/language. Denylisted controls are observed for rendered/enabled state only; this does not independently prove that each control state matches its business authorization. Confirmation dialogs are dismissed, and forms are never submitted after login. Unlabeled, obscured, disabled and dynamically inaccessible controls are listed as skipped. A DOM-changing button chain is not a proof that every possible form/input state was reached.

229 final page scans contained an empty-state phrase. 347 clicks produced no observed DOM, URL or network change; many are already-selected filters/navigation, so these remain candidates, not automatically defects. Full control labels/reasons are retained in ignored ui.json. Focused page-only confirmation separates S-005 from errors caused by blocked write attempts or changing navigation.

Latin-label candidates after acronym/data-marker exclusions: 236; confirmed raw severity/channel enum observations: 76. Allowlisted acronyms include BOQ/PR/RFQ/PO/GRN/MIR/WIR/NCR/ITP/HSE/QHSE/QA/QC/PDF/CSV/XLSX/API/ID/EGP/USD/ISO/RFI/WBS/PUNCH/CAPA/JSA and the product name. Pilot/sweep identifiers remain user data. Other candidates require human/native Arabic review; no blanket translation defect is asserted for business names.

| Arabic page | Account | Candidate text |
|---|---|---|
| /projects/new | storekeeper | in_app |
| /projects/new | storekeeper | email |
| /projects/new | storekeeper | sms |
| /projects/new | storekeeper | whatsapp |
| /my-actions | owner_ceo | critical |
| /my-actions | owner_ceo | high |
| /my-actions | owner_ceo | medium |
| /my-actions | owner_ceo | low |
| /my-actions | coo | critical |
| /my-actions | coo | high |
| /my-actions | coo | medium |
| /my-actions | coo | low |
| /my-actions | accountant_ap | critical |
| /my-actions | accountant_ap | high |
| /my-actions | accountant_ap | medium |
| /my-actions | accountant_ap | low |
| /projects/new | owner_ceo | in_app |
| /projects/new | owner_ceo | email |
| /projects/new | owner_ceo | sms |
| /projects/new | owner_ceo | whatsapp |
| /projects/new | coo | in_app |
| /projects/new | coo | email |
| /projects/new | coo | sms |
| /projects/new | coo | whatsapp |
| /projects/2/reports | accountant_ap | Quality tests |
| /projects/2/reports | accountant_ap | Work inspection requests |
| /projects/2/reports | accountant_ap | Punch list |
| /projects/2/reports | accountant_ap | Incidents |
| /projects/2/reports | accountant_ap | Near misses |
| /projects/2/reports | accountant_ap | Permits to work |
| /projects/2/reports | accountant_ap | Corrective actions |
| /projects/2/reports | accountant_ap | Schedule activities |
| /projects/2/reports | accountant_ap | Document register |
| /projects/2/reports | accountant_ap | Transmittals |
| /projects/2/reports | accountant_ap | Correspondence |
| /projects/2/reports | accountant_ap | Purchase requisitions |
| /projects/2/reports | accountant_ap | Purchase orders |
| /projects/2/reports | accountant_ap | Deliveries |
| /projects/2/reports | accountant_ap | Subcontracts |
| /projects/2/reports | accountant_ap | Variations |
| /projects/2/reports | accountant_ap | Client invoices |
| /projects/2/reports | accountant_ap | Expenses |
| /projects/2/reports | accountant_ap | Employees |
| /projects/2/reports | accountant_ap | Inductions |
| /projects/new | accountant_ap | in_app |
| /projects/new | accountant_ap | email |
| /projects/new | accountant_ap | sms |
| /projects/new | accountant_ap | whatsapp |
| /projects/2/reports | owner_ceo | Quality tests |
| /projects/2/reports | owner_ceo | Work inspection requests |
| /projects/2/reports | owner_ceo | Punch list |
| /projects/2/reports | owner_ceo | Incidents |
| /projects/2/reports | owner_ceo | Near misses |
| /projects/2/reports | owner_ceo | Permits to work |
| /projects/2/reports | owner_ceo | Corrective actions |
| /projects/2/reports | owner_ceo | Schedule activities |
| /projects/2/reports | owner_ceo | Document register |
| /projects/2/reports | owner_ceo | Transmittals |
| /projects/2/reports | owner_ceo | Correspondence |
| /projects/2/reports | owner_ceo | Purchase requisitions |
| /projects/2/reports | owner_ceo | Purchase orders |
| /projects/2/reports | owner_ceo | Deliveries |
| /projects/2/reports | owner_ceo | Subcontracts |
| /projects/2/reports | owner_ceo | Variations |
| /projects/2/reports | owner_ceo | Client invoices |
| /projects/2/reports | owner_ceo | Expenses |
| /projects/2/reports | owner_ceo | Employees |
| /projects/2/reports | owner_ceo | Inductions |
| /projects/2/reports | coo | Quality tests |
| /projects/2/reports | coo | Work inspection requests |
| /projects/2/reports | coo | Punch list |
| /projects/2/reports | coo | Incidents |
| /projects/2/reports | coo | Near misses |
| /projects/2/reports | coo | Permits to work |
| /projects/2/reports | coo | Corrective actions |
| /projects/2/reports | coo | Schedule activities |
| /projects/2/reports | coo | Document register |
| /projects/2/reports | coo | Transmittals |
| /projects/2/reports | coo | Correspondence |
| /projects/2/reports | coo | Purchase requisitions |
| /projects/2/reports | coo | Purchase orders |
| /projects/2/reports | coo | Deliveries |
| /projects/2/reports | coo | Subcontracts |
| /projects/2/reports | coo | Variations |
| /projects/2/reports | coo | Client invoices |
| /projects/2/reports | coo | Expenses |
| /projects/2/reports | coo | Employees |
| /projects/2/reports | coo | Inductions |
| /my-actions | site_engineer | critical |
| /my-actions | site_engineer | high |
| /my-actions | site_engineer | medium |
| /my-actions | site_engineer | low |
| /projects/new | site_engineer | in_app |
| /projects/new | site_engineer | email |
| /projects/new | site_engineer | sms |
| /projects/new | site_engineer | whatsapp |
| /my-actions | accountant_ar | critical |
| /my-actions | accountant_ar | high |
| /my-actions | accountant_ar | medium |
| /my-actions | accountant_ar | low |

Browser console errors/warnings: 2354; recorded failed/4xx/5xx network observations: 1471; intentionally blocked requests: 53. These raw observations include expected forbidden lookups, navigation aborts and harness-blocked writes and are not all application defects.

## Backend log scan

Distinct matching lines are listed below. Connection termination during the clone-only network correction and HTTP client-disconnect messages during browser navigation are separated from the reproducible missing-column dashboard failure by context. No unhandled-rejection finding is inferred solely from a stack line.

```text
backend-1  | PostgreSQL connection error: error: terminating connection due to administrator command
backend-1  |     at parseErrorMessage (/app/node_modules/pg-protocol/dist/parser.js:305:11)
backend-1  |     at Parser.handlePacket (/app/node_modules/pg-protocol/dist/parser.js:143:27)
backend-1  |     at Parser.parse (/app/node_modules/pg-protocol/dist/parser.js:37:38)
backend-1  |     at Socket.<anonymous> (/app/node_modules/pg-protocol/dist/index.js:12:42)
backend-1  |     at Socket.emit (node:events:524:28)
backend-1  |     at addChunk (node:internal/streams/readable:561:12)
backend-1  |     at readableAddChunkPushByteMode (node:internal/streams/readable:512:3)
backend-1  |     at Readable.push (node:internal/streams/readable:392:5)
backend-1  |     at TCP.onStreamRead (node:internal/stream_base_commons:191:23) {
backend-1  |     _events: [Object: null prototype] { error: [Function (anonymous)] },
backend-1  |     _connectionError: false,
backend-1  | Database query error: error: column "project_id" does not exist
backend-1  |     at /app/node_modules/pg-pool/index.js:45:11
backend-1  |     at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
backend-1  |     at async rawQuery (/app/src/config/database.js:30:20)
backend-1  |     at async rowsOf (/app/src/services/dashboardWidgets.js:30:11)
backend-1  |     at async agg (/app/src/services/dashboardWidgets.js:43:16)
backend-1  |     at async Promise.all (index 2)
backend-1  |     at async procurementWidgets (/app/src/services/dashboardWidgets.js:298:34)
backend-1  |     at async Object.roleDashboard (/app/src/services/dashboardWidgets.js:636:23)
backend-1  |     at async /app/src/routes/dashboard.js:315:18 {
backend-1  |   severity: 'ERROR',
backend-1  |   routine: 'errorMissingColumn'
backend-1  | error: [API] request_id=bccaebbf-3294-498b-8eb8-30030e38bea5 {"detail":"column \"project_id\" does not exist","timestamp":"2026-10-16T20:54:31.027Z"}
backend-1  | error: [API] request_id=a0327b16-8b7b-40cd-888a-184b78c141ac {"detail":"column \"project_id\" does not exist","timestamp":"2026-10-16T20:54:49.175Z"}
backend-1  | error: [API] request_id=3f995c11-b209-4325-ad85-33ee1a21e2db {"detail":"column \"project_id\" does not exist","timestamp":"2026-10-16T20:57:08.213Z"}
backend-1  | error: [API] request_id=ab1141bb-5ff9-4078-95ed-b6ba4beb9f4f {"detail":"column \"project_id\" does not exist","timestamp":"2026-10-16T20:57:24.328Z"}
backend-1  | error: [API] request_id=410a9372-ed18-4518-b37f-ece706b5f56f {"detail":"column \"project_id\" does not exist","timestamp":"2026-10-16T20:59:15.247Z"}
backend-1  | error: [API] request_id=b93be20f-5d60-47fc-8d61-57a28bc69add {"detail":"column \"project_id\" does not exist","timestamp":"2026-10-16T20:59:32.547Z"}
backend-1  | error: Error: HTTP client disconnected
backend-1  |     at queryCancellable (/app/src/config/database.js:105:49)
backend-1  |     at async safe (/app/src/routes/reports.js:312:19)
backend-1  |     at async autoProjectReport (/app/src/routes/reports.js:386:24)
backend-1  |     at async /app/src/routes/reports.js:286:22 {"timestamp":"2026-10-16T21:01:00.740Z"}
backend-1  |     at async autoProjectReport (/app/src/routes/reports.js:371:19)
backend-1  |     at async /app/src/routes/reports.js:286:22 {"timestamp":"2026-10-16T21:01:25.873Z"}
backend-1  |     at async autoProjectReport (/app/src/routes/reports.js:319:20)
backend-1  |     at async /app/src/routes/reports.js:286:22 {"timestamp":"2026-10-16T21:01:31.051Z"}
backend-1  |     at async autoProjectReport (/app/src/routes/reports.js:383:22)
backend-1  |     at async /app/src/routes/reports.js:286:22 {"timestamp":"2026-10-16T21:02:57.644Z"}
backend-1  |     at async autoProjectReport (/app/src/routes/reports.js:360:15)
backend-1  |     at async /app/src/routes/reports.js:286:22 {"timestamp":"2026-10-16T21:03:07.567Z"}
backend-1  |     at async autoProjectReport (/app/src/routes/reports.js:405:23)
backend-1  |     at async /app/src/routes/reports.js:286:22 {"timestamp":"2026-10-16T21:03:54.501Z"}
backend-1  |     at async /app/src/routes/reports.js:286:22 {"timestamp":"2026-10-16T21:04:52.433Z"}
backend-1  |     at async autoProjectReport (/app/src/routes/reports.js:351:21)
backend-1  |     at async /app/src/routes/reports.js:286:22 {"timestamp":"2026-10-16T21:05:20.598Z"}
backend-1  |     at async autoProjectReport (/app/src/routes/reports.js:368:16)
backend-1  |     at async /app/src/routes/reports.js:286:22 {"timestamp":"2026-10-16T21:06:24.319Z"}
backend-1  |     at async autoProjectReport (/app/src/routes/reports.js:387:24)
backend-1  |     at async /app/src/routes/reports.js:286:22 {"timestamp":"2026-10-16T21:06:46.741Z"}
backend-1  |     at async /app/src/routes/reports.js:286:22 {"timestamp":"2026-10-16T21:07:13.232Z"}
backend-1  |     at async autoProjectReport (/app/src/routes/reports.js:385:24)
backend-1  |     at async /app/src/routes/reports.js:286:22 {"timestamp":"2026-10-16T21:07:31.581Z"}
backend-1  |     at async queryPaginated (/app/src/utils/pagination.js:64:17)
backend-1  |     at async /app/src/routes/reports.js:107:22 {"timestamp":"2026-10-16T21:10:05.908Z"}
backend-1  | error: [API] request_id=d570c1b7-adc1-42f5-8e5d-5f79cd6615ec {"detail":"column \"project_id\" does not exist","timestamp":"2026-10-16T21:10:06.916Z"}
backend-1  | error: [API] request_id=59e142ab-1766-4c9f-a8de-eee5a41030d7 {"detail":"column \"project_id\" does not exist","timestamp":"2026-10-16T21:10:30.171Z"}
backend-1  |     at async autoProjectReport (/app/src/routes/reports.js:377:24)
backend-1  |     at async /app/src/routes/reports.js:286:22 {"timestamp":"2026-10-16T21:11:32.217Z"}
backend-1  |     at async queryPaginated (/app/src/utils/pagination.js:66:18)
backend-1  |     at async /app/src/routes/reports.js:107:22 {"timestamp":"2026-10-16T21:11:40.888Z"}
backend-1  |     at async /app/src/routes/reports.js:107:22 {"timestamp":"2026-10-16T21:11:44.157Z"}
backend-1  | error: [API] request_id=06ae3096-d5ad-42ff-b247-3727627fc741 {"detail":"column \"project_id\" does not exist","timestamp":"2026-10-16T21:11:48.889Z"}
backend-1  | error: [API] request_id=907b638e-d5c0-4d47-97b7-f4e7805bce0c {"detail":"column \"project_id\" does not exist","timestamp":"2026-10-16T21:12:11.198Z"}
backend-1  |     at async autoProjectReport (/app/src/routes/reports.js:375:16)
backend-1  |     at async /app/src/routes/reports.js:286:22 {"timestamp":"2026-10-16T21:13:22.593Z"}
backend-1  |     at async autoProjectReport (/app/src/routes/reports.js:398:18)
backend-1  |     at async /app/src/routes/reports.js:286:22 {"timestamp":"2026-10-16T21:13:30.217Z"}
backend-1  |     at async autoProjectReport (/app/src/routes/reports.js:359:15)
backend-1  |     at async /app/src/routes/reports.js:286:22 {"timestamp":"2026-10-16T21:14:17.390Z"}
backend-1  |     at async /app/src/routes/reports.js:286:22 {"timestamp":"2026-10-16T21:14:31.666Z"}
backend-1  |     at async /app/src/routes/reports.js:286:22 {"timestamp":"2026-10-16T21:15:24.552Z"}
backend-1  |     at async autoProjectReport (/app/src/routes/reports.js:362:16)
backend-1  |     at async /app/src/routes/reports.js:286:22 {"timestamp":"2026-10-16T21:15:26.534Z"}
backend-1  |     at async /app/src/routes/reports.js:286:22 {"timestamp":"2026-10-16T21:16:21.682Z"}
```

Known [WEBHOOK] global.eventBus unavailable line: 0 occurrence(s), recorded separately.

## What was not tested and why

- Pilot mutation/health/login/reconciliation: prohibited; the sole pilot operation was its dump.
- Complete happy paths for all 601 write registrations: bounded valid-body coverage uses local directories and procurement drafts. Other routes need workflow state, checker identities, file uploads, external adapters or unavailable fixtures; malformed probes alone do not certify those paths.
- PUT/PATCH/DELETE malformed probes use deliberately missing target IDs to avoid invalidating the 38 login accounts before UI coverage. Record-dependent validation behind 403/404 is not fully exercised. Selected real-record PUTs are covered by the valid-body pass.
- POST /api/auth/register: credential/session mutation, external adapter or legacy role switch.
- POST /api/auth/login: credential/session mutation, external adapter or legacy role switch.
- POST /api/auth/change-password: credential/session mutation, external adapter or legacy role switch.
- POST /api/auth/logout-all: credential/session mutation, external adapter or legacy role switch.
- POST /api/users/preview/:role: credential/session mutation, external adapter or legacy role switch.
- POST /api/client-portal/preview: credential/session mutation, external adapter or legacy role switch.
- POST /api/v1/oauth/token: credential/session mutation, external adapter or legacy role switch.
- POST /api/mcp: credential/session mutation, external adapter or legacy role switch.
- POST /api/agent/tokens/:id/revoke: credential/session mutation, external adapter or legacy role switch.
- Real external sends, payment-provider calls, webhook delivery and uploads: not exercised. Egress was blocked rather than testing provider behavior. No seed:staging or legacy role switch was run.
- Browser coverage of all 38 accounts: the requested minimum 14 roles was used. No form submissions, confirmation acceptance or denylisted destructive actions were performed in the UI phase.
- Dynamic controls that were unlabeled, obscured, disabled, already exercised navigation, or required input/confirmation remain explicitly skipped. Exhaustive tab/form-state reachability and independent enabled-state RBAC correctness are not certified.
- Lists over 200 accessible rows: none observed; no additional synthetic 200-row dataset was seeded.
- Absence of raw keys or invalid text is limited to scanned page states. Intermediate non-semantic tab states, opaque files, localization inside all entered data and native Arabic wording are not certified.
- Full PostgreSQL regression suites, deployment, production checks and human UAT signoff were not run. The actual clone SQL/API checks above ran on PostgreSQL; mock-suite success does not replace them.

## Verification commands and outcomes

- Failing-first guard test: npm.cmd --prefix backend test -- --runInBand --no-colors sweep-guard.test.js -> FAIL before sweep-common existed. After implementation: 1 suite / 6 tests PASS, including pilot port/database rejection. The first RED was a missing-module failure, not a falsely claimed behavioral assertion failure.
- npm.cmd --prefix backend test -- --runInBand --no-colors -> 67 suites / 1,109 tests PASS.
- npm.cmd --prefix frontend run test:ci -> 40 suites / 332 tests PASS.
- npm.cmd --prefix backend run lint:guards -> lint-guards: ok.
- npm.cmd --prefix frontend run i18n:check -> i18n:check ok; i18n:parity -> 36 namespaces / 2,709 English keys; lint:api -> Direct API calls 1/1.
- npm.cmd run build -> Compiled successfully; exit 0. Clone image build also ran 65 backend-context suites / 1,082 tests successfully.
- node --check on new sweep scripts and e2e scripts; final LF, secret-value and staged whitespace checks are recorded in STATE.md/CLOSEOUT_LOG.md after execution.

Harness corrections only: Docker permission access, internal-network host ports, a PO SQL column name, scoped list-count expectations, audit-store selection, v1 policy metadata, locale-toggle exclusion and the valid PO unit_rate field. GET passes were refreshed after instrumentation changes. An earlier 399-page crawl is retained privately as ui-initial.json; the final locale-locked crawl is authoritative. A preliminary 12-request valid-body run preceded the final one and included an incorrectly named PO field (400); it is not claimed as successful PO coverage. No step remained failed twice.

## Exact rerun commands

Run from D:\The Osiris Labs\Construction_ERP. Private clone configuration, saved dump, account credentials and installed browser must still exist. Do not run prepare/dump again: the pilot dump authorization was consumed once. These clone reset commands explicitly name the permitted project and reuse the existing dump:

```powershell
docker compose --project-name erp-sweep-20261016 --env-file .env.sweep -f .sweep/compose.json down -v
node backend/src/scripts/sweep-clone.js start-db
node backend/src/scripts/sweep-clone.js restore
node backend/src/scripts/sweep-clone.js build
node backend/src/scripts/sweep-clone.js start
node backend/src/scripts/sweep-clone.js verify
```

Phase 2 (includes clone writes):

```powershell
node backend/src/scripts/sweep-api.js
node backend/src/scripts/sweep-valid.js
node backend/src/scripts/sweep-evidence.js
```

Phase 3:

```powershell
npm.cmd --prefix e2e ci --ignore-scripts --no-audit --no-fund
npm.cmd --prefix e2e run sweep
node e2e/sweep-confirm-ui.js
```

Phase 4 and refreshed report:

```powershell
node backend/src/scripts/sweep-invariants.js
node backend/src/scripts/sweep-evidence.js
node backend/src/scripts/sweep-report.js
```

One spot-check per phase (reads guarded evidence and re-enumerates live source routes for Phase 2; these do not repeat the full sweep):

```powershell
node backend/src/scripts/sweep-summary.js clone
node backend/src/scripts/sweep-summary.js api
node backend/src/scripts/sweep-summary.js ui
node backend/src/scripts/sweep-summary.js invariants
```

Recommended next action: triage S-001/S-002 before human finance/project setup acceptance, then address the reproducible API/UI failures and retest on a fresh clone in a separately authorized fix batch. This batch leaves application code unchanged.
