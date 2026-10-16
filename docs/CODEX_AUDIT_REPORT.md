# Independent closeout audit — 2026-10-12

Audited checkout: `449b06a` (Phase 5.5). Phase numbers below refer to `docs/ERP_CLOSEOUT_PLAN.md`, not the older expansion-plan numbering used in `docs/audit/PHASES_09_18_REVIEW.md`. Source was read only. No fixes, deployments, account switches, configured-database migrations, or `.env` edits were performed. The only authored repository file is this report. Test writes were directed to a newly created PostgreSQL 16 container/database: `erp-codex-audit-20261012` / `erp_audit_test_20261012`, port 55439. Test credentials were synthetic. Historical documentation and comments are evidence of claims, not evidence that those claims passed.

## 1. Executive summary — ten lines

1. Overall status: **NO-GO for production; staging/UAT readiness remains incomplete** (defects D1–D10; plan GO criteria at `docs/ERP_CLOSEOUT_PLAN.md:521`).
2. The checkout was clean; LF-in-Git/CRLF-on-disk normalization is present, with no actual uncommitted diff (E1).
3. Phase 5.4 and 5.5 implementations exist in mounted backend routes; most new operations have no frontend callers (E5; D7).
4. Fresh PostgreSQL 16 migration passed: 98 applied, then 98 skipped on repeat; missing numeric version 0030 did not prevent execution (E2).
5. Mock backend verification: **928 passed / 42 suites**, versus the historical 921 / 42 (E3).
6. Real PostgreSQL verification: **565 passed, 1 failed / 56 suites**; delegation fixture collision reproduced on rerun (E3; D1).
7. Frontend verification: **97 passed / 17 suites**; i18n and lint guards passed; production compilation passed in memory (E3–E4).
8. Browser E2E is unverified: local Playwright test package cannot resolve and the available CLI rejects `test`; remote CI is also unproven (E4; E8).
9. Confirmed gaps include webhook secret disclosure, missing SSRF protection, swallowed audit failures, and unposted retention/advance/deductions (D2–D5).
10. A bounded staging pilot needs security closure, a green PG gate, usable selected workflows, isolated data/secrets, restore/reconciliation and role-based smoke tests; full parity adds Phases 5.6–11 (sections 5–7).

## 2. Evidence ledger and repository truth

### E1 — working tree, history and line endings

Commands executed from the repository root:

```text
git status --short                         [no output]
git diff --stat                            [no output]
git diff --numstat                         [no output]
git diff --ignore-space-at-eol --stat       [no output]
git log -40 --oneline                      [40 commits read]
449b06a Phase 5.5: commercial and finance (spec 09, 10) ...
cd89906 Phase 5.4: procurement (spec 08) ... requester-step fix
a206167 Phase 5.3: materials and inventory (spec 07) ...
78e52a3 Phase 5.2: project setup (spec 05, 06) ...
a4d439a Phase 5.1: organizations + RBAC slice (spec 03/04) ...
```

`git ls-files --eol` reported `i/lf w/crlf` for `backend/server.js`, `src/middleware/auth.js`, `src/middleware/security.js`, `src/routes/v1.js`, `src/config/database.js`, and SQL migrations 0001–0009. Group verdicts: server/auth/security/API/database — clean, normalized line endings; early migrations — clean, normalized line endings; all other tracked groups — clean according to Git. There is no evidence of the described modified-file incident in this checkout. Its historical cause is **unverified**; do not infer that some earlier uncommitted work was safe or discarded. Nothing was discarded in this audit.

Inputs read: master plan; progress; log; implementation status; migrations/testing guides; legacy-role-switch guide; report catalog; dashboard matrix; active acceptance review; last 40 commits and Git status. `docs/IMPLEMENTATION_STATUS.md:15` says Phase 3 is not started and `:16` describes only 15 PG suites; current code/tests and E3 contradict that snapshot. `docs/CLOSEOUT_PROGRESS.md:20` is an October 4 checkpoint, not a current test result. These files were not corrected, per the read-only instruction.

### E2 — fresh migration and schema verification

Created an isolated `postgres:16-alpine` container with a new explicitly test-named DB, no mounted application data or dump. All DB commands used explicit `DB_HOST=127.0.0.1`, `DB_PORT=55439`, `DB_NAME=erp_audit_test_20261012`, `DB_USER=erp_audit`, a throwaway password, and a synthetic JWT secret. Owner auto-seeding was disabled for migration.

```text
cd backend
npm run migrate
[migrate] all migrations completed (98 applied, 0 already applied)
npm run migrate
[migrate] all migrations completed (0 applied, 98 already applied)

node src/scripts/run-all-migrations.js --dry-run
Migrations that would run: [complete list in Appendix A]

read-only SQL/catalog probe:
migration_inventory {"legacy":63,"versioned":35,"gaps":[30],"duplicates":[],"missing_legacy":[]}
ledger [{"kind":"legacy","n":63},{"kind":"versioned","n":35}]
tables [{"n":234}]
constraints [{"contype":"f","n":632},{"contype":"t","n":1},{"contype":"c","n":100},{"contype":"u","n":108},{"contype":"p","n":234}]
invalid [{"n":0}]
unpaired [{"table_name":"daily_laborers","column_name":"full_name_en"}]
```

Schema counts above were captured immediately after migration, before the PG suites added fixtures. Queries ran inside `BEGIN READ ONLY` / `ROLLBACK`:

```sql
SELECT kind,count(*)::int n FROM schema_migrations GROUP BY kind;
SELECT count(*)::int n FROM information_schema.tables
 WHERE table_schema='public' AND table_type='BASE TABLE';
SELECT contype,count(*)::int n FROM pg_constraint
 WHERE connamespace='public'::regnamespace GROUP BY contype;
SELECT count(*)::int n FROM pg_constraint
 WHERE connamespace='public'::regnamespace AND NOT convalidated;
```

Numbering/order assessment: versioned filenames sort lexically (`run-all-migrations.js:97`); there are no duplicate numeric SQL versions and no missing frozen legacy files. Version 0030 is absent. The successful fresh run proves ordering works on an empty database, not that the gap was intentional or that a previously applied 0030 can be forgotten. Legacy wrappers and their library migration modules are both in the frozen list; they are distinct ledger entries, not duplicate SQL version numbers. Legacy checksum changes cause reruns, while changing an applied versioned SQL file is fatal (`run-all-migrations.js:123–138`). Missing legacy scripts are silently skipped (`:122`), a future packaging risk; none was missing here. Repeat success is runner skip/idempotence evidence, not proof that every SQL statement can be replayed manually.

| Planned schema slice | Independently observed | Limits |
|---|---|---|
| 2 integrity/cost/events | 98 migration ledger entries; 632 FKs, 100 CHECKs; constraint, numbering, journal, cost, concurrency and outbox suites passed (E3). Migrations 0007–0029 in Appendix A. | Empty schema is not a historical-data upgrade. |
| 5.1 organizations/RBAC | `company_profiles`, `departments`, `job_positions`, `delegations`, `org_qualifications`, `org_bank_accounts`, `org_performance_scores` returned by catalog probe; migration 0031. | Configurable role/action approval-limit table not found (D6); legacy blankets retained. |
| 5.2 setup | `project_settings` (7 columns), `project_calendars` (12); 9 PG setup tests passed, including register work-package FKs. Migration 0033. | Team work-package write path still absent per `CLOSEOUT_LOG.md:231`; full tenant/company isolation unverified. |
| 5.3 inventory | `stock_lots` (14 columns), `inventory_documents` (16), conversion/document services; 17 PG tests passed. Migration 0034 composite `(lot_id,warehouse_id,material_id)` FK at `:110`. | Adjustment GL and source-lot supplier returns remain gaps (D10). |
| 5.4 procurement | `rfq_award_recommendations` (20 columns); `uq_rfq_award_live` partial index (`0035:55`); seeded workflow/legacy-award backfill verified by test 1. | Browser forms and complete role journeys unverified. |
| 5.5 finance/commercial | `contract_parties` (14), `guarantees` (19), `insurances` (18), `payment_applications` (25), `invoice_lines` (11), `currency_rates` (8), `budget_versions` (12), `budget_lines` (5), `forecast_versions` (12), `forecast_lines` (6), `credit_notes` (18), `payment_batches` (18), `payment_batch_items` (7); 14 PG tests passed. | Invoice-line table has no client-invoice writer; deductions lack GL postings (D5,D8). |

Later read-only catalog query returned `uq_budget_versions_one_approved`, `uq_forecast_versions_one_approved`, `uq_budget_lines_code`, `uq_forecast_lines_code`, and `idx_stock_movements_lot`. The 5.5 migration test verifies NUMERIC(15,2), variation backfill and repeat execution (`commercial-5-5.pg.test.js:101`). This is sampled phase-contract verification, not an exhaustive column-by-column comparison against every spec entity.

### E3 — actual test results and historical-count differences

No test dependencies were installed. Mock/unit caches were disabled. PG suites ran against only the isolated DB above.

```text
backend: npm test -- --runInBand --no-cache
Test Suites: 42 passed, 42 total
Tests:       928 passed, 928 total
Time:        22.367 s

backend: TEST_PG=1 npm run test:pg -- --no-cache
Test Suites: 1 failed, 55 passed, 56 total
Tests:       1 failed, 565 passed, 566 total
Time:        155.044 s

backend: TEST_PG=1 npm run test:pg -- --no-cache --silent org-rbac-5-1.pg.test.js
FAIL ... › 9. lookupDelegation: window, is_active, scope and amount all gate between a row and null
An active delegation 239 → 244 with scope "approvals" already exists (#7)
at Object.createDelegation (src/services/orgService.js:351:11)
at Object.<anonymous> (src/scripts/__tests__/org-rbac-5-1.pg.test.js:487:18)
Tests: 1 failed, 10 passed, 11 total

frontend: npm run test:ci -- --no-cache
Test Suites: 17 passed, 17 total
Tests:       97 passed, 97 total
Time:        29.292 s

backend: npm run lint:guards
lint-guards: ok
frontend: npm run i18n:check
i18n:check ok
```

All PG suites other than `org-rbac-5-1.pg.test.js` passed. Negative-path SQL errors logged by passing constraint tests are expected assertions, not separate suite failures. The final failing gate above must not be described as green.

Comparison with `CLOSEOUT_PROGRESS.md:20`:

| Layer | Historical | Audit | Explanation |
|---|---|---|---|
| Mock | 921 / 42 | 928 / 42 | +5 route-file parameter cases (47→52 files, `route-guards.test.js:62`) and +2 requester-step regressions (`workflow-engine.test.js:198` onward). Exact +7. |
| Frontend | 91 / 15 | 97 / 17 | +4 `WorkPackageSelect` cases and +2 `wizardPayload` cases; both files introduced by 5.2. Exact +6 / +2 suites. |
| Real PG | 502 / 50 | 566 total / 56, with 1 failure | Six new suites: org 11, role dry-run 5, setup 9, inventory 17, procurement 9, commercial 14 = 65 cases. Existing historical suite population therefore contributes 501 cases now. The historical 502 claim differs by one; no removed ordinary `test(...)` declaration was found in `git diff bd68153..HEAD -- backend/src/scripts/__tests__/*.pg.test.js`. Historical parameter expansion/count accuracy is **unverified**; that one-case discrepancy is not explained by evidence available here. Net total +64, and the new org failure is D1. |
| Migrations | 92 | 98 | +0031 through 0036 = six migrations; no 0030 file. Exact +6. |
| Playwright | 32 passed / 46 skipped | no execution result | Missing local runner; old totals cannot be reused as current evidence (E4). |

### E4 — frontend build/browser limits

The exact `npm run build` wrapper clears/writes `frontend/build` and copies public files (`frontend/node_modules/react-scripts/scripts/build.js:72`, `:221`). To comply with the only-report-file constraint, the production Webpack configuration was compiled with `memfs` as `compiler.outputFileSystem`; Webpack/Babel/ESLint disk caches were disabled. Source/config files were not edited. Result:

```text
NODE_ENV=production, BABEL_ENV=production
require('react-scripts/config/webpack.config')('production')
compiler.outputFileSystem = createFsFromVolume(new Volume())
"errors": [], "warnings": []
static/js/main.d79482b4.js: 993387 bytes
static/css/main.f7ce6f7c.css: 23229 bytes
READ_ONLY_PRODUCTION_COMPILE PASS
```

This verifies production bundling only. The standard npm build wrapper, public-file copy, filesystem packaging, Docker image and nginx-served deployment remain **unverified**.

Actual attempted browser-runner discovery:

```text
frontend: node -e "...require.resolve('@playwright/test')..."
MODULE_NOT_FOUND
frontend: npm run test:e2e -- --list
> playwright test --list
error: unknown command 'test'
```

`frontend/package.json` declares `@playwright/test`, but the installed resolution cannot find it. No browser installation/dependency changes were made. The backend journey guard additionally needs `E2E_BACKEND` and a seeded test owner (`frontend/e2e/journeys-backend.spec.js:18`). Playwright journeys, screenshots, mobile/RTL/offline acceptance and existing 32/46 counts are **unverified** in this audit.

### E5 — route mounting, callers and permissions

`backend/server.js:87–89` mounts procurement, commercial and finance-ledger. `v1.js:255–278` maps 5.4 routes; `:328–370` maps 5.5 families. Registered-and-unmounted is **not found in these three reviewed families**; completeness across every repository router is unverified.

Executed caller search:

```text
rg -n 'createBatch|createApplication|createBudget|createForecast|createCredit|award-recommendations|analytics/spend|vendor-performance' frontend/src
[no matches]
rg -n 'award|payment-applications|payment-batches|credit-notes|budget-versions|forecast-versions' frontend/src
PortalDashboard.js:176 ... '/api/portal/subcontractor/payment-applications' ...
ProcurementReview.js:56 ... award decision ...
```

The portal submission is a separate existing route, not the new `/api/commercial/payment-applications` workflow. `ProcurementReview.js:28` calls comparison and `:38–41` downloads PDFs; it has no recommendation/decision/update forms. `ProjectOperations.js:45–53` reads requirements, warehouses, procurement overview, commercial overview, invoices, retention and finance; it has no new 5.4/5.5 write callers. No confirmed call to a nonexistent endpoint was identified in these sampled pages; a complete dynamic caller-to-router comparison is unverified.

`authenticate`/`authorize` are present on the reviewed new routes. Permission derivation and record scope are centralized in `policy.js:157`, `:282`, `:411`, `:542`; project list payload filtering is at `auth.js:26`/`:166`. The 5.4 role test (`:354`) and 5.5 role test (`:546`) passed internal/v1 denial, project scope, and financial visibility assertions. Payment batches additionally require company-wide authority (`financeLedger.js:222`, `:260–299`). These results do not prove arbitrary multi-company tenant isolation: company-wide grants/data have not been tested between independent tenants.

### E6 — directly reproduced gaps

An inline Node probe replaced the DB module **in that process's require cache only**, using a failing synthetic query. It did not edit code, insert data or send webhook messages:

```text
[ACTIVITY_LOG] Failed to log: AUDIT_SIMULATED_LOG_FAILURE
logActivity result: resolved despite failed INSERT
GET model contains secret: true
loopback URL validation: accepted
```

Probe operations: call `utils/activity.logActivity` with a query throwing `AUDIT_SIMULATED_LOG_FAILURE`; call `webhookService.getWebhook` with a supplied synthetic row containing a secret; validate `http://127.0.0.1:9/private` with the same Joi HTTP/HTTPS URI schema as `v1.js:615`. Network dispatch was deliberately not invoked. Reachability/exploitation of specific private services is unverified, but missing guard/returned-secret behavior is proven by E6 plus D2/D3 source references.

### E7 — health and RBAC catalog

Read-only catalog probe plus a local GET against `app.listen(0,'127.0.0.1')` on the audit DB:

```text
SELECT table_name FROM information_schema.tables
 WHERE table_schema='public' AND table_name LIKE '%limit%';
missinglimits []

blankets [accountant,admin,engineer,finance_manager,legal_mgr,maintenance_mgr,
          manager,owner,project_manager,purchasing_mgr,site_supervisor,staff]
SELECT count(*)::int n FROM invoice_lines;
invoicelines [{"n":0}]

GET /api/health
200 {"name":"Construction ERP","version":"1.0.0","status":"ready",
     "database":{"status":"healthy","message":"Database connection successful"},...}
```

Wildcard query: join `roles`, `role_permissions`, `permissions` where module/action are both `'*'`. Zero invoice-line rows after the finance suites is supporting evidence only; the missing writer is established by source search (D8). Health success is local test-DB evidence, not production monitoring evidence.

### E8 — CI and documentation gates

`.github/workflows/ci.yml:68`, `:84`, `:89–93` contains PG, i18n, build and browser gates. `CLOSEOUT_PROGRESS.md:36` states GitHub Actions stopped starting because of billing/spending limits. Remote run status was **not queried**, so the billing cause and its current resolution are historical claims, not independently verified account facts. There is no remote green-gate evidence for this audit.

## 3. Phase-by-phase verification

`VERIFIED` means the named bounded scope below passed the executed suite; it never means production/full-spec acceptance. `PARTIAL` means implemented evidence with an outstanding required gate/gap. `BROKEN` identifies an executed failure. A passing test's existence was not used as a substitute for executing its containing suite.

Paths in this table are relative to `backend/src/` unless prefixed otherwise. E3 gives actual containing-suite outcomes. Tests include internal/v1 HTTP calls where stated, not just mocked queries.

| Phase/slice | Planned scope | Evidence it exists | Evidence it works this audit | Verdict |
|---|---|---|---|---|
| 0 | Current docs; mock/PG/build/browser CI gates | `.github/workflows/ci.yml:68,84,89`; status/progress docs | E2/E3 local checks; E4 missing browser runner; stale status E1, remote E8 | PARTIAL |
| 1 | Token typing/revocation, fail-closed, scoping, safe approvals, webhook/report/upload/auth hygiene | `services/tokens.js:18–47`; `middleware/auth.js:125`; `services/policy.js:411`; `services/mcpService.js:371` | token-typing, fail-closed, record-scoping, mcp-safety, agent-approval PG suites passed; E6 confirms webhook gaps; plan `:96–109` still open | PARTIAL |
| 2 | Migration ledger, locks, counters, delete rules, constraints, GL, atomic approvals | migrations 0001–0017; runner `:107`; `config/database.js:35` transactions | E2 fresh/repeat; inventory-integrity, procurement-locking, numbering, journal, ledger-postings, approvals-atomic, constraints suites passed | PARTIAL — status-enum/real-data upgrade gates open (`plan:176`) |
| A2.1 | Return cost reversal, accrual pairing, restricted cancellation | `services/costAccrual.js:257`; migration 0023 | cost-accrual, approvals-cancel, golden-chain PG suites passed; return variant `golden-chain.pg.test.js:244` | VERIFIED (bounded cost/approval behavior) |
| A2.2 | Replenishment creates scoped workflow PR with budget and references | `services/replenishment.js:394`; migration 0024 | `replenishment-pr.pg.test.js:89,117,167` scoped create, replay/race and rollback assertions passed | VERIFIED |
| A2.3 | Material/expense/payroll posting; prevent labour/equipment double count | `services/costAccrual.js:363,419`; migration 0025 | `cost-posting.pg.test.js:124,135,165,201,271,335` all passed | VERIFIED (covered sources) |
| A2.4 | Shared cost view; fail loudly on query failure | migration 0026 `:11`; `services/costView.js`; guard script | cost-guards PG suite and lint passed; activity-log reads still swallow errors E6/D4 | VERIFIED for cost-view slice; not a repository-wide swallow-free claim |
| A2.5 | Routed event names, enqueue in same transaction, no lost enqueue | `utils/activity.js:23–37`; `services/outboxDispatcher.js:70` | `event-integrity.pg.test.js:87,122,152,195,245,260` passed | VERIFIED for covered domain events; activity audit is separate D4 |
| A2.6 | Pending daily measurements, common progress hook, weighted dashboards | daily report/progress PG tests `:83,104,151,168` | all 9 `daily-report-progress` cases passed, including other-project rejection `:117` | VERIFIED |
| A2.7 | Reconciled PR→PO→GRN→invoice→payment chain, partial/return handling | `golden-chain.pg.test.js:236,244`; migration 0027 | golden-chain suite passed: both cost/AP/stock reconciliation variants and status-length assertions | VERIFIED — API subset, not full Phase 9 UI chain |
| 3 | Accrual/uniqueness; duplicate invoice refusal; durable outbox; sweep leadership; derived progress | migrations 0018–0022; outbox `:70`; sweepLeader `:20`; A2 above | cost-accrual, supplier-invoice-duplicate, outbox, sweep-leader, progress-derivation suites passed | PARTIAL — production-like reconciliation and full chained browser gate unverified |
| 4 | Twelve-layer test infrastructure and acceptance gates | `docs/TESTING.md:73`; `jest.pg.global-setup.js:12` | mock/PG/frontend actually run; one PG failure, missing browser runner | PARTIAL |
| B1 | PG fail-fast/refuse production-name DB | `jest.pg.global-setup.js:12–29`; `docs/TESTING.md:42` | All suites reached migrated audit DB; production-refusal/unreachable branches not independently triggered | PARTIAL — ledger completeness check weakness below |
| B2 | Five critical real-PG flow suites | inventory-flows, procurement-flows, workflow-flows PG files | inventory-flows, procurement-flows, workflow-flows, finance-flows and policy-flows all passed in full PG run | VERIFIED for existing test assertions |
| B3 | Eight concurrent races | `scripts/__tests__/concurrency.pg.test.js`; locking services | concurrency PG suite passed | VERIFIED for tested races, not untested 5.5 certificate/version races |
| B4 | Stock/overdelivery/FK/unique/journal refusal | `constraints-b4.pg.test.js:47–106`; migration 0029 | constraints-b4 passed real SQL and service refusal assertions | VERIFIED |
| B5 | Internal/v1 envelope/404/validation contract | `routes/v1.js`; v1-contract PG file | v1-contract suite passed | VERIFIED for asserted routes |
| B6 | Full seeded grant grid, external isolation, v1 action parity | `policy-matrix.pg.test.js:41,64,120` | policy-matrix suite passed against seeded catalog | VERIFIED — blanket grants are explicitly permitted fixtures, E7 |
| B7 | Role navigation and forbidden API routes | `nav-visibility.pg.test.js:107,138`; frontend `utils/projectNav.js:60` | API cases passed; rendering test `:138` explicitly records a pending placeholder | PARTIAL |
| B8 | Four restored-copy reconciliation assertions | `scripts/reconcile-database.js`; `docs/TESTING.md:102` | reconcile-database mock suite passed; no restored production-like DB reconcile executed | PARTIAL |
| B9 | Clients/Suppliers/Expenses/Payroll/MyActions loading/empty/error | frontend corresponding `.test.js` files | all five component suites passed in 97/17 run | VERIFIED for covered component states |
| B10 | Real-backend desktop/mobile journeys | frontend `e2e/journeys-backend.spec.js:18` | Not runnable, E4; not counted as passed | PARTIAL |
| B11 | Load baselines and dashboard ID contract | `scripts/load-profiling.js`; `docs/LOAD_BASELINES.md`; dashboard-id PG test | dashboard-id suite passed; historical baseline/load results not rerun | PARTIAL |
| B12 | Portal financial redaction, caging, expiry | `middleware/auth.js:6–18`; portal-acceptance PG file | portal-acceptance suite passed | VERIFIED for tested four legacy families; all nine canonical portal journeys unverified |
| B13 | Honest spec-26 exit-gate mapping | `docs/TESTING.md:73–100` | Mapping exists; remote CI, browser and load gates unverified E4/E8 | PARTIAL |
| 5.1 | Organizations; 24+9 roles; delegations/team expiry; limits | migration 0031 `:142,250`; orgService `:324`; teamService; policy | 10 org tests passed / 1 failed, E3; no limits table E7/D6 | BROKEN gate; implemented portions are partial |
| 5.1b | Read-only old/new per-seat role/permission report, no switch | `services/legacyRoleDryRun.js:27,61`; `docs/LEGACY_ROLE_SWITCH.md:3` | all 5 dry-run PG tests passed, including `READ ONLY` transaction test `:44` | VERIFIED report only — switch unperformed by design |
| 5.2 | Settings/calendars/WBS/work-package FKs and wizard | migration 0033; projectSetupService `:39,140,241`; frontend wizardPayload | 9 setup PG + 6 added frontend tests passed | VERIFIED backend/wizard slice; missing admin screens and team link remain |
| 5.3 | Lots/FEFO/conversions/documents/expiry/replenishment | migration 0034; inventoryDocuments `:227`; inventoryLots | 17 inventory-5-3 PG tests passed | PARTIAL — source-lot returns, adjustment GL and UI gaps |
| 5.4 | Award entity/approval; RFQ reads; PR/PO edits/cancel; analytics | migration 0035; procurement routes `:248–410`; awardService `:65,93,111` | 9 procurement-5-4 PG tests passed plus existing chain suites; detailed checks below | PARTIAL — backend slice passes, UI/i18n/audit gaps remain |
| 5.5 | Parties/compliance/rates; application/certificate; versioned control; credits/batches/maker-checker | migration 0036; commercialRecords `:215,242`; budgeting `:111`; financeDocuments `:92,222` | all 14 commercial-5-5 PG tests passed; D5/D8/D9 remain | PARTIAL |

B1 caveat: the global precheck compares **total** `schema_migrations` count with SQL-file count (`jest.pg.global-setup.js:26–28`). It does not verify the set/checksum of applied SQL filenames. With 63 legacy ledger rows, that count can exceed 35 SQL files even if some SQL migrations are absent. This is a static, medium-confidence harness defect; no bypass DB was created to execute it. The audit DB itself was fully migrated, so this did not invalidate E2/E3.

### Deep verification: 5.4 procurement

| Concern | Code/schema/test evidence and outcome |
|---|---|
| Award recommendation and approval | `0035:29,55`; `awardService.js:65,93,111`; tests 1/3/4 at `procurement-5-4.pg.test.js:89,130,152` passed migration/backfill, basis/deviation/compliance/same-RFQ/one-live rules and final approval awarding the RFQ atomically. |
| Direct award | route `procurement.js:208`; test 5 `:190` passed owner/admin restriction, justification and approved recommendation record. Shortcut exists deliberately. |
| RFQ list/detail | routes `:248` onward; test 2 `:111` passed lines/vendors/quotes/recommendation reads and non-enumerable unknown-ID refusal. |
| PR update/cancel | procurementDocuments service and route family; test 6 `:203` passed draft edits, cancellation reason, refusal once linked order exists. |
| PO update/cancel | test 7 `:236` passed derived totals, draft-only edit and delivered/invoiced cancellation refusal. |
| Analytics | `procurementAnalytics.js:40,57,111`; tests 8/9 `:281,354` passed exact dataset figures, project filter and `see_supplier_value` requirements. |
| Requester-step fix | `workflow-engine.test.js:198` onward: the two new mock tests passed requester draft/submit, deny own approval and deny another actor's requester step. Procurement PG approval flow also passed. |
| Chain/cost | procurement-flows and golden-chain PG suites passed actual app/database paths. `golden-chain.pg.test.js:236,244` reconciles stocked receipt, returned quantity, invoice, allocation/payment, dashboard cost and balanced journal. This does not cover every portal/browser permutation. |
| Scope/access | test 9 passed internal/v1 role parity, unassigned/external denial, project-bound seats and analytics visibility. Central policy evidence E5. |
| Audit/events | Domain events use caller query through `fireEvent` and passed event-integrity tests. New route calls `auditProc` **after** `atomic` (`procurement.js:272–273,280–281,290–291`); audit persistence is not atomic and can silently fail (D4). No blanket audit guarantee. |
| Frontend/EN-AR | Comparison and document downloads have callers, E5. New workflow/analytics writers absent from caller search. `ProcurementReview.js:56–71` hardcodes English, and its locale files have only basic title/comparison/RFQ keys. E3 i18n guard is a regression ceiling, not translation completion. |

### Deep verification: 5.5 commercial/finance

| Concern | Code/schema/test evidence and outcome |
|---|---|
| Contract parties, guarantees, insurance, rates | commercialRecords and migration 0036; tests 3/4 at `commercial-5-5.pg.test.js:155,190` passed scoped references, state/refusal rules, dated rates/inverse fallback/missing-rate error. |
| Payment application/certificate | `commercialRecords.js:211,238`; routes `commercial.js:364–409`; test 5 `:210` passed claimed/certified bounds, contract retention and seeded workflow. Retention/advance/deduction amounts are stored, not separately ledgered (D5). |
| Versioned budgets | `budgeting.js:111` checks submitter/checker; routes `commercial.js:439–475`; test 6 `:256` passed maker/checker, one approved version, budget changes and QS internal-cost denial. |
| Forecasts | `budgeting.js:166`; test 7 `:304` passed actual-to-date from shared cost view and one approved version. Engine still ignores approved forecast input, D9; forecast approval itself has no maker/checker call. |
| Commitment adjustments | `budgeting.js:186`; test 8 `:319` passed range/reason/history and committed-cost change. |
| Client credit notes | financeDocuments `:92`; test 9 `:351` passed ledger/outstanding/maker-checker/void-once behavior. |
| Supplier credit notes | test 10 `:412` passed cost/VAT reversal bounds and restoration. Does not prove all mixed-stock/service historical invoice cases. |
| Payment batches | financeDocuments `:180,222,232`; companyOnly routes E5; test 11 `:458` passed different checker, payable holds, release/allocation/GL once and all-or-nothing rollback on changed payable. |
| Supplier invoice workflow | financeDocuments `:267,294`; test 12 `:515` passed seeded match/AP/approval stages, accrual at approval once, rejection without cost and closed-workflow refusal. |
| Permissions/reconciliation | tests 13/14 `:546,607` passed internal/v1 parity, project-seat restrictions, visibility and tested journal balance/cost ties. This is fixture reconciliation, not a restored real-data report. |
| Invoice lines/frontend/i18n/audit | Migrated client `invoice_lines` is unwired, D8. Caller search E5 found no new credit/batch/budget/forecast/application UI. Locale catalogs do not cover new workflows; raw error fallback and audit weakness repeat across route families (`utils/typedRoute.js:19`, D4/D11). |

Double-counting assessment: executed cost-posting/golden-chain/credit-note tests verify their named receipt/issue/expense/payroll/return/credit cases without double counting. They are not proof about every historical finance document or concurrent application/certificate creation. No new generalized double-count defect is asserted without reproduction.

## 4. Defects and ranked risks

Top ten are ordered by potential impact on acceptance/data/security. Severity applies to the identified behavior or gate; static findings are labeled explicitly.

| ID/rank | Severity | Defect, evidence, reproduction and observed result |
|---|---|---|
| D1 / 1 | high | **Real-PG gate fails.** `org-rbac-5-1.pg.test.js:487` creates a pair/scope already left active by test 4 (`:345` onward), although its date window is expired. `orgService.js:347–353` rejects any `is_active` duplicate without date comparison; migration 0032 also restricts active scope. Repro: E3 full command, then targeted org rerun. Observed: `delegation_duplicate`, 1 failed / 10 passed in rerun. Primarily test-fixture/lifecycle mismatch, not proven unauthorized access. Whether renewal must auto-expire/deactivate is a product decision; the suite is unquestionably red. |
| D2 / 2 | high | **Webhook SSRF guard missing.** HTTP/HTTPS Joi URI only (`v1.js:615,644`); delivery calls `fetch(hook.url)` without address validation, DNS pinning or `redirect:'error'` (`webhookService.js:165–178`). Repro: E6 Joi probe; `rg -n 'fetch\(hook.url|redirect|dns|lookup' backend/src/services/webhookService.js`. Observed: loopback URL accepted; direct fetch source, no redirect/address guard in reviewed service. A real private-network POST was not sent. Admin registration reduces attacker population, not network reachability risk. |
| D3 / 3 | high | **Webhook secret disclosed again on GET and stored raw.** `webhookService.js:77,89` INSERT includes raw secret and GET selects `*`; `v1.js:634–639` returns that object despite the show-once comment at `:627`. Repro: E6 `getWebhook` with synthetic query row. Observed: `GET model contains secret: true`. No real secret printed. Route exposure is source-verified; live OAuth GET was not executed. |
| D4 / 4 | high | **Successful business mutation can lose its activity audit.** `utils/activity.js:3–14` catches failed INSERT; new procurement audit happens after transaction (`procurement.js:272–273`); finance does the same (`financeLedger.js:285–289`). Repro: E6 inline failure injection into query, call `logActivity`. Observed: error logged, promise resolves. Domain outbox events have stronger transactional guarantees and must not be confused with activity audit. Read helpers also return empty arrays on DB failure (`activity.js:47,54,61`). |
| D5 / 5 | high | **Retention, advance recovery and other deductions are not separately posted.** `commercialRecords.js:237–241` explicitly stores amounts with no posting; `glPosting.js:14–15` says no separate accounts. Repro: `rg -n 'post nowhere|nowhere yet|no separate retention|accounts wait' backend/src/services/commercialRecords.js backend/src/services/glPosting.js`. Observed source: deductions `post nowhere yet`, chart waits for owner. Finance test success proves net/certificate math, not omitted ledger balances. Owner account confirmation and implementation are required before financial UAT signoff. |
| D6 / 6 | high | **Configurable role/action monetary approval limits missing.** Plan `:87,251` assigns them to 5.1; catalog query E7 returns no `%limit%` table; `mcpService.js:371` and `agentPolicy.js:330` still use interim owner-only money approvals. Repro: E7 SQL and `rg -n 'Until approval limits|Until configurable' backend/src/services`. Observed: interim comments/guard remain; delegation max_amount is a different feature. Fail-closed restriction, not proven over-approval, but claimed spec foundation is incomplete. |
| D7 / 7 | high (UAT scope) | **New 5.4/5.5 workflows lack usable frontend callers/forms.** E5 search returns no recommendation/analytics/credit/batch/version UI matches. `ProcurementReview.js:28,38` reads comparison/PDF only; `ProjectOperations.js:45–53` reads overviews. Repro: E5 `rg` searches. Observed: zero relevant matches except distinct portal submission path. This blocks selected end-to-end UAT unless those workflows are explicitly excluded; it is also planned Phase 6 work, not a claim that every backend endpoint must already have a screen. |
| D8 / 8 | med | **Client invoice lines migrated but unwired.** `0036_commercial_finance.sql` creates `invoice_lines`; search `rg -n 'invoice_lines|INSERT INTO invoices' backend/src/services backend/src/routes` found the client header INSERT (`financeEngine.js:165`) and supplier_invoice_lines operations, no client invoice-line INSERT. E7 count stays zero after suites. Read/search absence supports an unwired-model gap, not loss of already-existing rows. |
| D9 / 9 | med | **Approved forecasts do not drive canonical EAC; forecast maker/checker not enforced.** `commercialEngine.js:209–215` calculates ETC from current budget/commitments; `budgeting.js:166–175` approves forecasts without `assertNotMaker`. Repro: inspect those ranges, `rg -n 'forecast_versions|forecast_lines|assertNotMaker' backend/src/services/commercialEngine.js backend/src/services/budgeting.js`. Observed: forecast reads absent from engine; maker check only at budget decision `:111`. Static scope gap; self-approval HTTP scenario and financial impact amount unverified. Phase 8 remains necessary. |
| D10 / 10 | med | **Inventory financial/traceability work remains.** Supplier return service `procurementService.js:791` uses material movement rather than identifying the GRN's lot; adjustment posting `inventoryDocuments.js:227–266` creates stock movements without GL. Repro: read named ranges; `CLOSEOUT_LOG.md:248` independently states both limitations. Observed source: adjustment branches call movement/settle, no GL call. Existing lot tests pass but do not close these scenarios; lot-specific return reproduction not executed. |

Additional confirmed/limited findings:

- **D11, med — raw errors and incomplete EN/AR.** `utils/typedRoute.js:19` returns `e.message` for untyped errors; the 5.5 suite printed a raw contract-party CHECK failure at that handler. `ProcurementReview.js:56–71` hardcodes "Compare invited suppliers…", "RFQ ID", "Compare", and the empty state; `ProjectOperations.js:16–23` hardcodes tab names. Repro: `rg -n 'Compare|RFQ ID|No quotations' frontend/src/pages/ProcurementReview.js`, and inspect typedRoute `:19`. E3 i18n guard passed because it only stops count increases against baseline, not all untranslated text. Full browser-language/error leak reproduction unverified.
- **D12, low — bilingual column pair absent.** Catalog suffix-pair query E2 found only `daily_laborers.full_name_en` without `full_name_ar`; definition at `migrate-1.4.js:13`. Repro: information_schema self anti-join replacing `_en` with `_ar` and conversely. Observed single row in E2. Whether a language-neutral name column should supersede it needs schema/UX review.
- **D13, med — project navigation is not complete permission-driven visibility.** `frontend/src/utils/projectNav.js:60` falls back to `FULL` for unmapped roles; `:54` uses `hr` although seeded canonical key is `hr_manager` (`0031:61`), and legacy staff/engineer/accountant deliberately keep full navigation. Repro: read ROLE_MAP/specFor, B7 rendering placeholder `nav-visibility.pg.test.js:138`. Observed source fallback. Backend denial still applies; this is a UI/role-alignment gap, not proven data access bypass.
- **D14, med — deployment test-user script unsafe as a general staging command.** `create_test_users.js:6–10` hardcodes configured-looking DB/port/user and shared weak password; `:25–36` changes roles/seats without token-version bump or clearing prior seats. Repro: read script; not executed. It has no throwaway-name guard and is not an acceptable default staging-account procedure.
- **D15, med — docs/CI gate truth and harness completeness.** E1 stale status, E8 unproven remote CI, and B1 count-only migration precheck. Repro commands E1/E7; static precheck evidence above. No remote-account billing assertion was independently proved.

Other requested searches: cost catch-to-zero regression guard passed; remaining activity catch-to-empty exists (D4). Source scaffolding repeats post-commit activity audit and raw-error fallback across new modules (D4/D11). No comprehensive claim is made that all unmounted routes, missing project filters, hard-coded strings or frontend/API mismatches have been exhausted.

## 5. Remaining work and dependencies

Sizes are planning estimates, not measured durations: S = bounded script/config task, M = several linked components, L = substantial multi-module work. GO1–GO7 are the exact plan criteria quoted in E8/plan `:521–528`: zero high findings; CI golden/concurrency/permission gates; real-data reconciliation; golden totals; offline/mobile/localization; rehearsed restore/rollback; signed UAT.

| Remaining item and source | Size | Depends on | Principal risk / GO |
|---|---|---|---|
| Security 1.5/1.6: SSRF, secrets, webhook project filtering; reports export/column/formula protection; media visibility/ownership; upload magic bytes/limits/AV; login/last-owner/MFA design; shared multi-replica rate limiting; generic correlated errors; complete transactional audit; CORS/header review (`plan:96–109`, D2–D4,D11) | L | Stable permission/error contracts, staging | Exposure/audit loss; GO1,2,7. Wildcard matcher and webhook delivery retry already exist (`webhookService:57,230`); do not rebuild them blindly. |
| Phase 2 status-enum audit and data cleaning/validation on restored data; deferred hard-delete/legacy-column decisions (`plan:156–184`) | M | Restored copy, authoritative status vocabularies | Historical-data rejection/loss; GO1,3. Fresh validity is not historic validity. |
| 5.1 admin user-create API (users route POST absent except preview), approval limits and legacy role review/switch; renewal lifecycle/test fixture repair (D1,D6; `LEGACY_ROLE_SWITCH.md:42–64`) | M | Owner mapping/limit decisions, before/after access report | Lost or blanket access; GO1,2,7. Dry-run report complete; switch not authorized/executed. |
| 5.2 remaining team work-package writer and free-text retirement (`CLOSEOUT_LOG:231`) | S/M | Restored-data review, setup UI | Incomplete linkage; GO3,7. |
| 5.3 lot-specific supplier returns and adjustment GL (D10) | M | Account decisions, lot reconciliation | Incorrect lot/cost traceability; GO1,3,4. |
| 5.5 invoice-line writers; retention/advance/deduction accounts/postings (D5,D8) | M | Owner chart confirmation, invoice/certificate rules | Ledger mismatch; GO1,3,4,7. |
| 5.6 consultant/site/client/portals: observation due/drawing/photo fields; visit/WIR/MIR/instruction/recommendation endpoints; formal WIR reads/SLA; retire single-answer RFI/submittal routes; client responses/acknowledgement; real portal registers and supplier compliance (`plan:277–281`) | L | Roles, staged workflows, shared forms | Parallel registers/assignment leakage; GO1,2,7. Existing partial portal/staged functionality in active review is not accepted end-to-end. |
| 5.7 quality/HSE/docs/planning/handover entities: incident compatibility/consolidation, certificate/safety observations, distribution/drawing register, RFI package/impact links, schedule/progress/resources, asset documents/warranty/uploads (`plan:284–288`) | L | Data migration mapping, module UI | Duplicate/missing authoritative records; GO3,4,7. Incident migration already creates compatibility views (E2 migration output); unchecked checklist is not evidence it is wholly absent. |
| 5.8 verify APIToken/AgentSession/action-comment entity parity (not independently established); real notification providers behind adapter interface (`plan:292`) | M | Provider selection and explicit paid/external-send authorization | Console-only delivery; GO2,7. Current notification mock suite logged console email; no real email sent. |
| 6 shared validated form/upload/confirm/toast kit; admin Organizations/Users/Roles/Delegations/Settings/workflow/policy/numbering/notifications/webhooks/tokens (`plan:302–303`) | L | 1,5 and locale foundations | Unusable administration/security configuration; GO1,7. |
| 6 project WBS/packages/team/settings/calendar UI; tab-count badges, Overview needs-attention list, edit/phase/member actions, timeline/audit/files/comments/related-record layout; permission-derived per-role project tabs including canonical roles (D13; `plan:304–332`) | M | RBAC/role-switch decisions, setup services | Tab/API mismatch and stale roles; GO2,7. Existing ProjectShell/map is a partial implementation, not wholly missing. |
| 6 procurement full PR/RFQ/quote/comparison/award/PO/delivery/MIR/GRN/return/invoice/match/vendor screens (`plan:334`, D7) | L | 5.4, form kit, tested role/action gates | No end-to-end operator journey; GO2,4,7. |
| 6 inventory recipe/requirement/reservation/replenishment/lot/expiry screens (`plan:335`) | M | 5.3, forms, stock reconciliation | Operator stock errors; GO3,7. |
| 6 commercial contracts/full variations/budget/forecast/commitments; finance AP/cash-flow/certified valuations/batches (`plan:336–337`) | L | 5.5,8, finance accounts | Wrong or unavailable finance workflow; GO3,4,7. |
| 6 replace portal prompts with real forms/registers; handover upload/asset/warranty; role dashboards beyond counts; one incident screen (`plan:338–341`) | L | 5.6/5.7, form kit, canonical metrics | Usability/duplicate-register risk; GO2,5,7. |
| 7 offline manifest/service-worker shell, IndexedDB site queue/idempotency/retry/conflict/sync status, local fonts/CSP (`plan:350–352`) | L | Server idempotency/upload contracts | Duplicate/lost site submissions; GO2,5. |
| 7 responsive grids/table wrappers/44px touch targets/14px forms, each major screen and portal mobile test (`plan:355–358`) | M/L | Selected screens and browser runner | Field usability; GO5,7. RTL follows Phase 10. |
| 8 approved forecast→ETC/EAC/cash-contribution integration (D9; `plan:369`) | M | 5.5 versions and golden cost inputs | Misleading forecasts; GO4,7. Version storage overlaps 5.5, engine consumption does not. |
| 8 retention/advance contract derivation/caps/audited overrides, certified-quantity valuation pull, pre-due/per-client reminders (`plan:370–372`) | M/L | Accounts, measured quantities/certificates | Incorrect billings/GL; GO3,4,7. 5.5 certificate retention math is only partial overlap. |
| 8 default SPI/CPI on baselines and resource-loaded planning (`plan:373`) | M | Schedule/resource entities, baselines | Invalid metrics; GO4,7. |
| 8 retire legacy approvals after in-flight migration/parity, remove duplicate certificate/transition surfaces (`plan:374–375`) | M | Role decisions, restored-data parity | Lost approvals/double surfaces; GO1,3,7. |
| 9 full spec-28 demo org/role/project/BOQ/C35 recipe/schedule/vendor/stock seed, complete API and UI golden journey through warranty with stock/cost/progress/approval/notification/audit assertions (`plan:385–388`) | L | 3,5,6,8; browser runner | Existing stocked-material chain is too narrow; GO2,4,7. |
| 10 L4 operations/comparison/portals; L5 all QA/QC/HSE/docs/schedule/reports/handover/agent/core/dashboard screens (`plan:441–455`) | L | Locale foundations, stable screens/forms | English-only Arabic experience; GO5,7. |
| 10 L6 enum/entity-name/format/data-column pairs; L7 stable API errors and system notification/action/template content, locale propagation and local fonts; L8 Arabic reports/CSV/PDF glyph/order/page review; L9 logical CSS/RTL/accessibility/mixed LTR content; L10 missing-key/inventory/parity/toggle/error/export/visual/E2E gates; L11 native construction-domain Arabic review, role UAT, dev guide/CI and missing-key monitoring (`plan:459–506`) | L | Shared helpers, backend errors, renderer/font support | Inconsistent language/finance presentation; GO1,2,5. Current guard/unit passes are partial evidence only. |
| 11 expanded reconciliation, migrated restored-copy dry run and signoff (`plan:512–513`) | M | 2/3/5/8, realistic copy | Silent historical drift; GO3,4. Four B8 assertions exist, full ledger/stock/sequence/retention coverage and clean run still needed. |
| 11 feature flags/dual-validation cutover/rollback, backups/restore monitoring/outbox lag, independent security/dependency review, load budget (`plan:514–517`) | M/L | Accepted staging, operational owner | Irrecoverable or unobservable rollout; GO1,2,6. |
| 11 operator/admin/API/training docs, UAT with real roles, triage/freeze (`plan:518–519`) | M | All chosen workflows accepted | Unsigned operational readiness; GO7. |
| Requested Phase-11 agentic AI foundation | M/L, scope uncertain | Approved agent scope, roles/limits/audit/error boundaries | **Not listed as a Phase-11 deliverable in the master plan.** Existing agentPolicy/MCP, owner money gating and logs are present (`agentPolicy:89,330`, `mcpService:356–383`), but no acceptance definition for this requested foundation was found. Owner must define whether this means completing current gated assistant controls or adding another foundation; GO1,2,7. |

## 6. Minimal ordered path to live for testing

This is a proposed bounded pilot path, not permission to deploy or to cut required production scope. No staging environment was created/deployed. Full specification parity requires all open items above and all seven GO criteria; a restricted online UAT pilot can intentionally defer broader screens/offline/engines only after the owner chooses its explicit scope.

1. **Declare pilot boundary and owners.** Choose one test project, participating canonical roles, online EN/AR workflows, no real payments or external webhook/notification dispatch. Confirm which 5.4/5.5 workflows must be operable through UI, account mappings and role strategy. Label deferred functions visibly and retain production NO-GO. Dependencies: decisions below; satisfies a bounded GO7 preparation, not GO7 itself.
2. **Close pilot security and red gate first.** Repair D1 fixture/lifecycle mismatch; implement/test D2–D4 safeguards, limits where pilot approvals require them, scoped files and errors. Re-run all real PG/matrix/concurrency gates plus browser runner after dependencies are restored. Do not claim a finance pilot with D5/D8 outstanding. Dependencies: security/finance owners; GO1/2.
3. **Prepare isolated infrastructure and build.** Separate staging DB/upload volumes/domain/secrets from real data. Review `docker-compose.yml:1–63`, backend Dockerfile and frontend Dockerfile; database dump mount is first-boot only and must be omitted for a truly empty staging seed. Build images and test actual npm build/public-copy/nginx packaging in a writable build environment. These actions were not run here. GO2/6 preparation.
4. **Provision data/users deliberately.** Run versioned migration in staging only after DB identity validation. Use a reviewed residential demo seed and canonical per-role/project assignments, including no-assignment/expired-assignment accounts. Seed initial owner using `SEED_DEFAULT_OWNER` with explicit email and a unique 12+ character secret (`setupDb.js:455–465`); never ship example/default credentials. Do not run `create_test_users.js` unchanged (D14). Revoke/rotate secrets and invalidate affected sessions on subsequent role changes. GO2/4/7.
5. **Finish pilot forms and role navigation.** Share validated form/upload/reason/loading/error components. At minimum provide selected PR→RFQ→comparison→recommendation approval→PO→delivery→MIR→GRN→invoice→payment paths and the finance forms included in the pilot. Bind screen visibility to actual permissions including project seats; language-check every included surface. GO2/4/5/7.
6. **Rehearse backup/restore and reconcile.** Back up staging DB plus uploads, restore to another named throwaway copy, dry-run/preflight/migrate/reconcile there. Validate stock/projection, AR/AP/allocation/credit/deduction balances, commitments, document revisions, journal balance and sequence maxima before/after. Keep the output and rollback procedure; then run `data-cleaning-report`. `reconcile-database.js` requires `RECONCILIATION_BACKUP_CONFIRMED=true` (`docs/TESTING.md:109`); set it only after the copy is actually backed up. GO3/4/6.
7. **Run smoke and golden pilot journeys, then seek staging approval.** Use distinct requester/checker/site/finance/portal accounts; prove same/cross-project access, denied routes, expiry/no assignments, uploads, EN/AR shell/forms and error/loading states. Reconcile after the pilot chain. Record triage and owner/finance/procurement/site signoff. Remote CI rerun remains necessary for production GO2. No production promotion until all production GO criteria close.

Deployment checklist, grounded in inspected configuration:

| Requirement | Existing evidence | What staging still needs |
|---|---|---|
| Compose/env | DB/backend/frontend services and persistent DB/uploads; `.env.example`/`.env.docker.example` have placeholders only | Validate explicit DB identity and separate volumes; inject secrets without printing config values; no production-named target. Do not assume `docker compose config` output is safe to paste because it can include secrets. |
| Build/start | Backend Dockerfile test stage; start command `npm run start:migrated`; frontend nginx build/proxy | Actual image/packaging build and controlled migration job; do not blindly migrate on production restart. In-memory compile E4 is not an image build. |
| Health | E7 `/api/health` 200, DB healthy; `server.js:37` returns 503 when unhealthy | Probe through staging TLS/reverse proxy and verify failure/alert behavior; readiness endpoint alone is not monitoring. |
| Logging/jobs | HTTP winston output observed in E3/E7; outbox/sweep suites passed | Structured request IDs, log retention/redaction, error alerts, sweep failures and outbox lag monitoring; repair D4. |
| Secrets/auth | Typed derived or per-kind JWT secrets (`tokens.js:40–47`); owner seed opt-in | Strong isolated keys/passwords, rotation, no raw webhook GET secret, least-privilege DB runtime/migration roles. Last-owner protection review remains open. |
| CORS/security headers | `server.js:20` explicit FRONTEND_ORIGIN/extras; `frontend/nginx.conf:10–15` CSP/frame/content/referrer headers | Match actual staging domain/proxy trust; test OPTIONS, cookies/bearers, protected file delivery and TLS edge; font CSP/offline choice. Backend `x-powered-by` disabling not found in inspected server. |
| Test users/default credentials | setupDb opt-in guard; root test-user script D14 | Reviewed seed using selected DB env, unique strong passwords, canonical scoped seats, requester/checker separation, external assignment expiry. |
| Smoke-test script | Existing Playwright backend journeys, gated (`journeys-backend.spec.js:18`); E4 runner missing | A dedicated parameterized staging smoke script remains to be authored in an implementation task. No additional file was created during this audit. |

Required smoke-script contract: refuse production-named DB/host, accept staging base URL without embedding secrets, GET readiness, authenticate seeded test accounts, assert unassigned/cross-project 403, create/review scoped PR and PO, receive partial delivery/MIR/GRN, invoice/credit/allocate test payment if included, verify balanced journal and unchanged out-of-scope project, upload/read/deny a scoped file, assert EN/AR rendering and logout/revocation, then reconcile. Persist test evidence without printing access tokens/passwords. Any external dispatch must remain stubbed/disabled until separately approved. A read-only audit cannot deliver the new executable script under the one-file rule; its actual implementation is **unverified/not done**.

## 7. Decisions needed from the owner

1. Confirm chart accounts and mappings for retention receivable/payable, advance/recovery and each deduction, including VAT treatment (D5; `CLOSEOUT_LOG.md:268`). Confirm desired caps/derivation and acceptable finance pilot scope.
2. Review the legacy-role dry-run **on a restored real-data copy**: retain owner/admin blankets or move them; resolve finance_manager identity blanket and project_manager blanket; confirm each provisional mapping and whether coarse `users.role` changes too (`LEGACY_ROLE_SWITCH.md:42–64`, E7). No switch executed.
3. Set configurable approval limits and authorized maker/checker roles; decide whether the single-person bypass is ever allowed (`commercialErrors.js:17–30`). Decide whether forecasts also require maker/checker and how expired delegations renew.
4. Choose a bounded UAT scope and explicitly accept deferrals versus full spec parity: online/mobile/offline, 5.4/5.5 forms, portal formal registers, notification providers, forecast/planning and localization/export scope. Production GO5 cannot be waived merely by labeling a pilot.
5. Define the requested Phase-11 agentic AI foundation and acceptance boundaries; it is not presently an explicit task in the read master plan. Current tools alone do not prove that unspecified foundation complete.
6. Designate staging host/database/operator, recovery objectives, secrets owner, finance/procurement/site UAT signers, and staging deployment approval. Resolve/recheck remote CI billing with the account owner; no billing changes attempted.

## 8. Not verified

- Production and configured application DB state; no connection/migration/test writes were directed there. No restored production-like upgrade/reconciliation, data cleaning or backup/restore drill was executed.
- Standard `npm run build` wrapper and Docker/nginx packaging; in-memory production compilation passed, but filesystem artifact creation/public copy was avoided under the one-file constraint.
- Playwright journeys, screenshots, mobile/RTL/offline tests: package resolution/CLI failed before test discovery (E4); no dependency installation or browser downloads performed.
- Current GitHub Actions/billing state and green remote gates: not fetched; documented failure reason is historical (E8).
- Live webhook OAuth GET/external dispatch, SSRF exploitation, real email/push/SMS/WhatsApp/provider integrations: synthetic/static probes only; no external messages sent.
- Complete multi-company tenant isolation, all nine canonical external role UI journeys, every frontend caller/router pair, every legacy record scope and all audit-denial/financial-field cases: sampled code and passing suites are bounded evidence.
- New concurrent certificate/application/currency/forecast races, historical invoice/cost/VAT combinations and real-data forecast accuracy beyond existing assertions.
- Load baseline/performance budgets; no fresh load run. Historical `LOAD_BASELINES.md` is not a current measurement.
- One historical PG-test count discrepancy: six new suites contain 65 tests but net observed increase is 64. Baseline historical expansion/claim remains unverified; E3 states the mismatch explicitly.
- Missing 0030 intent/history outside the read commit window; no ordering failure on the empty audit DB, but no assertion that this version never existed elsewhere.
- Full detailed schema/spec parity beyond sampled catalogs, constraints/index probes and executed phase tests; unwired entities and known omissions are identified, not exhaustively enumerated as proved absent.

No functionality was repaired. Recommended next action: address D1–D6 and define the pilot scope, then implement the selected Phase 6/finance gaps and run a writable isolated build/browser/staging verification before approving deployment.

## Appendix A. Complete migration execution inventory

The following inventory is generated from the runner's frozen order and its lexically sorted versioned files; E2 confirms all 98 were applied then skipped. It is not a second manual ordering proposal.

```text
01 legacy setupDb.js
02 legacy migrate-1.3.js
03 legacy migrate-1.4.js
04 legacy migrate-2.1.js
05 legacy migrate-2.2.js
06 legacy migrate-3.js
07 legacy migrate-4.js
08 legacy migrate-5.2.js
09 legacy migrate-7.js
10 legacy migrate-8.js
11 legacy migrate-9.js
12 legacy migrate-10.js
13 legacy migrate-11.js
14 legacy migrate-12.js
15 legacy migrate-13.js
16 legacy migrate-14.js
17 legacy migrate-15.js
18 legacy policy-migration.js
19 legacy migrate-16.js
20 legacy organizations-migration.js
21 legacy migrate-16-organizations.js
22 legacy migrate-17-policy-engine.js
23 legacy migrate-18-project-wizard.js
24 legacy project-wizard-migration.js
25 legacy migrate-19-workflow-engine.js
26 legacy workflow-engine-migration.js
27 legacy migrate-20-action-engine.js
28 legacy action-engine-migration.js
29 legacy migrate-21-locations-quantities.js
30 legacy location-quantity-migration.js
31 legacy migrate-22-material-planning.js
32 legacy material-planning-migration.js
33 legacy migrate-23-inventory.js
34 legacy inventory-migration.js
35 legacy migrate-24-replenishment.js
36 legacy replenishment-migration.js
37 legacy migrate-25-procurement.js
38 legacy procurement-migration.js
39 legacy migrate-26-commercial.js
40 legacy commercial-migration.js
41 legacy migrate-27-finance.js
42 legacy finance-migration.js
43 legacy migrate-28-site.js
44 legacy site-migration.js
45 legacy migrate-29-consultant.js
46 legacy consultant-migration.js
47 legacy migrate-30-portals.js
48 legacy portal-migration.js
49 legacy migrate-31-qaqc.js
50 legacy qaqc-migration.js
51 legacy migrate-32-hse.js
52 legacy hse-migration.js
53 legacy migrate-33-doccontrol.js
54 legacy doccontrol-migration.js
55 legacy migrate-34-planning.js
56 legacy planning-migration.js
57 legacy migrate-35-reporting.js
58 legacy reporting-migration.js
59 legacy migrate-36-handover.js
60 legacy handover-migration.js
61 legacy migrate-37-external-api.js
62 legacy migrate-38-agent-layer.js
63 legacy migrate-39-project-scope-hardening.js
SQL 0001_backfill_project_scope.sql
SQL 0002_document_counters.sql
SQL 0003_users_token_version.sql
SQL 0004_backfill_role_assignments.sql
SQL 0005_retire_legacy_counters.sql
SQL 0006_role_templates_slice1.sql
SQL 0007_inventory_integrity.sql
SQL 0008_procurement_integrity.sql
SQL 0009_soft_delete_masters_and_voids.sql
SQL 0010_restrict_protected_foreign_keys.sql
SQL 0011_users_deactivate_only.sql
SQL 0012_check_constraints.sql
SQL 0013_money_standard_unique_pending_current.sql
SQL 0014_backfill_header_only_lines.sql
SQL 0015_gl_account_map_and_balanced_entries.sql
SQL 0016_one_posting_per_document.sql
SQL 0017_link_approval_workflows.sql
SQL 0018_cost_accrual_idempotency.sql
SQL 0019_purchase_order_terms.sql
SQL 0020_event_outbox.sql
SQL 0021_override_progress_permission.sql
SQL 0022_approval_cancel_columns.sql
SQL 0023_cost_accrual_claims_and_return_reversal.sql
SQL 0024_replenishment_purchase_requests.sql
SQL 0025_payroll_cost_allocations.sql
SQL 0026_project_cost_views.sql
SQL 0027_widen_purchase_order_status.sql
SQL 0028_closeout_answers.sql
SQL 0029_stock_movement_signs.sql
SQL 0031_organizations_rbac.sql
SQL 0032_delegation_active_scope.sql
SQL 0033_project_setup.sql
SQL 0034_inventory_lots_documents.sql
SQL 0035_procurement_awards_cancel.sql
SQL 0036_commercial_finance.sql
```

## Appendix B. Reproduce the non-writing probes

Run from `backend` using a PowerShell here-string piped to `node`; the overrides below live only in the process. No real webhook is delivered or real signing secret is read:

```powershell
@'
const resolved = require.resolve('./src/config/database');
require.cache[resolved] = { id: resolved, filename: resolved, loaded: true,
  exports: { query: async () => { throw new Error('AUDIT_SIMULATED_LOG_FAILURE'); } } };
(async () => {
  await require('./src/utils/activity').logActivity({userId:1, action:'approve', module:'procurement'});
  console.log('logActivity result: resolved despite failed INSERT');
  const row = {id:1, url:'http://127.0.0.1:9/private', secret:'audit-synthetic-only'};
  const got = await require('./src/services/webhookService').getWebhook(1, async () => ({rows:[row]}));
  console.log('GET model contains secret:', Object.hasOwn(got,'secret'));
  const result = require('joi').string().uri({scheme:['http','https']}).validate(row.url);
  console.log('loopback URL validation:', result.error ? 'rejected' : 'accepted');
})();
'@ | node
```

Read-only production compile reproduction, from `frontend` (installed dependencies required):

```powershell
@'
process.env.NODE_ENV='production'; process.env.BABEL_ENV='production'; process.env.CI='false';
const webpack=require('webpack'); const {Volume,createFsFromVolume}=require('memfs');
const config=require('react-scripts/config/webpack.config')('production'); config.cache=false;
function disable(rules){for(const r of rules||[]){
  if(r.options&&r.loader&&r.loader.includes('babel-loader')) r.options.cacheDirectory=false;
  disable(r.oneOf); disable(r.rules);
}}
disable(config.module.rules);
for(const p of config.plugins) if(p.constructor.name==='ESLintWebpackPlugin'&&p.options) p.options.cache=false;
const compiler=webpack(config); const memory=createFsFromVolume(new Volume());
memory.join=require('path').join.bind(require('path')); compiler.outputFileSystem=memory;
compiler.run((err,stats)=>{
  if(err) console.error(err.message);
  console.log(stats&&stats.toJson({all:false,errors:true,warnings:true}));
  const failed=!!err||stats.hasErrors();
  console.log('READ_ONLY_PRODUCTION_COMPILE',failed?'FAIL':'PASS');
  compiler.close(()=>{process.exitCode=failed?1:0;});
});
'@ | node
```

Cleanup actually executed: `docker rm --force --volumes erp-codex-audit-20261012` returned `erp-codex-audit-20261012`. The isolated container/test database was removed; no configured application database or volume was removed.

Final validation: `git status --short` returned only `?? docs/CODEX_AUDIT_REPORT.md`; `git diff --stat` and `git diff --check` returned no output (tracked sources unchanged). A separate read of the untracked report found no trailing whitespace, balanced code fences and ten executive-summary lines. Git's tracked diff check alone does not validate an untracked report.
