# Batch 5A defect-fix resume - STOPPED - 2026-10-17

Resumed from 897e823 on closeout/batch-a-to-6. Eight implementation/hygiene slices are committed through f06a7a3. The full PG gate and one focused integration attempt failed; stopped under the two-failed-attempt rule. This batch is incomplete. No pilot, sweep clone or existing demo environment was accessed. No environment file, dependency, migration, deployment or external service changed.

## Exact stop blocker and next action

The full unfiltered gate reported **90 passed / 1 failed suites; 1,956 passed / 1 failed tests** (91 / 1,957 total), 130 migrations, 215.101 s, exit 1; container erp-r02-gate-20261017031051 removed. v1-contract passed (9.941 s). The failing assertion was aggregate-scope.pg.test.js:101: expected unexplained=[]; received 21 byte-identical owner/scoped responses. Preserving timestamps exposed a pre-existing blind spot in that equality test.

Schema inspection distinguished shared catalogs from real indirect ownership gaps. New failing-first tests confirmed foreign/unassigned laborer visibility and mixed/unallocated company payroll visibility. The follow-up scopes laborers through project-linked records, payroll headers/details only when the entire salary is allocated within authorized projects, and alert snapshots through an authorized PO. Seventeen shared-catalog/explicit organization-scope responses were documented individually.

The second post-fix attempt ran the new ownership tests with aggregate-scope.pg.test.js: **1 passed / 1 failed suites; 5 passed / 1 failed tests**, 130 migrations, exit 1; container erp-r02-gate-20261017031708 removed. All three new ownership tests passed, but the aggregate assertion remained:

```text
aggregate-scope.pg.test.js:101 expect(unexplained).toEqual([])
Expected: []
Received: ["/api/suppliers", "/api/clients", "/api/organizations/team",
           "/api/team", "/api/v1/companies/"]
```

No third attempt or further application edit was made. This follow-up is checkpointed with incomplete integration verification. Its local unfiltered output is .batch5a-scope-integration-green.log; the filename does not mean it passed.

Next action on an authorized resume: use distinct own/foreign client and supplier fixtures plus own/foreign/company team seats; assert exact visible IDs and totals on these five routes. The existing aggregate fixture shares one client and supplier between both projects, and v1 companies aliases clients. Team lists query user_project_roles, intentionally excluded from generic scope rewriting for authentication; inspect list-specific scope without filtering policy identity reads. Do not blanket-allowlist these five responses.

| Item | Implemented behavior and failing-first evidence |
|---|---|
| S-001 | Shared clientCollections summary/predicate excludes supplier and voided payments while preserving client advances and legacy invoice receipts. Finance summary, dashboard overview/project finance and receivables widgets agree. Red: collected 9430 vs 300; outstanding -8430 vs 700; profit 9390 vs 260. Widget red: 9480 vs 300. Focused PG green: 3/3 tests. |
| S-002 | Project creation and wizard entry use existing action grants. Red: owner_ceo/coo had grants but got 403 instead of 201. Green: 5/5 tests, including audit and denial controls. Complete coarse-role table: 1,048 mounted method/routes; all 73 remaining explicit coarse lists and grant-layer mismatches recorded. Unrelated privileged restrictions preserved. |
| S-004 | Procurement widget derives delivery ownership from purchase_orders rather than nonexistent deliveries.project_id. Red: 500 vs 200; four matrix mismatches. Green: 3/3 tests, 48 roles x four scopes = 192 cases, zero mismatches. Delivery list/own record/foreign record isolation passed; existing resource expression required no change. |
| S-005 | Diagnosed from fresh schema and payload: scoped traversal converted PostgreSQL Dates to {}, then shared formatter returned that object to React. Both operational roles reproduced the timestamp type failure; EN/AR UI reproduced invalid-object-child. Preserve Dates, reject malformed date objects and provide localized render recovery/retry. PG green 2/2; focused frontend 14/14; scope-filter mock 2/2. |
| S-006 | RFQ count and page SQL share the same filter builder and project scope. Red: missing header vs expected 3 on both owner/scoped pages. Green: 3/3 tests including page two, no overlap, exact totals, empty pages, status filters and implicit scope. Complete inspection includes all 448 GET routes, their actual response array shapes and total headers. |
| S-007 / report labels | Red: three Arabic UI tests displayed raw priority/channel values and English report labels. Green 3/3. Catalog now covers 22 report definitions, columns, three packs, 19 section headings and channel labels. Dynamic guard: 164 report/enum keys x two locales; zero missing. Stored business values are preserved. |
| Reconciliation | Accepted quantities follow decided MIRs, plus legacy receipts with no MIR links, less returns. Linked receipts never double count acceptance. Separate checks detect stale posted GRN snapshots and return projection drift. Missing GRNs are explicit pending-workflow notices. Red: two valid MIR-before-GRN scenarios incorrectly added one violation; stale/return checks absent. Expanded green 6/6; existing/new focused PG 29/29; disposable golden 18/18 checks, zero violations. Read-only verifier; no data repaired. |
| Hygiene | Both excluded local review reports remain preserved and untracked; explicit root-anchored ignore entries added. Neither was read, edited or staged. |

## v1-contract diagnosis

The historic failure is **not reproduced**, so its exact assertion and regression category remain unestablished. No speculative application or test relaxation was made. The prior run hid its failure details; that cannot be reconstructed from a suite summary.

| Source / command | Current result |
|---|---|
| Resume source, v1-contract.pg.test.js alone, full unfiltered output | 1 suite / 10 tests passed; 3.869 s; 130 migrations |
| Clean detached ad2eaa1 worktree, same file alone | 1 suite / 10 tests passed; 6.17 s; 130 migrations |
| Clean ad2eaa1 FULL PG suite | 84 suites / 1,934 tests passed; 216.063 s; 130 migrations |
| Early resume FULL PG diagnostic | 85 suites / 1,937 tests passed; 214.139 s; 130 migrations |

The v1 test source did not change between ad2eaa1 and 897e823. The comparison does not establish a deterministic hotfix/5A/sweep regression or a pre-existing deterministic failure. PG gate output is now unfiltered by default. Local full outputs are preserved in ignored .batch5a-v1-head.log, .batch5a-pg-diagnostic.log and the baseline worktree's .batch5a-v1-baseline.log / .batch5a-pg-baseline.log. No protected environment was used to investigate it.

## Executed gate results and current limits

The passing broad gates below ran before the latest ownership follow-up. Backend mock, lint guards, Docker test stage, golden reconciliation and full PG have **not** been rerun on that follow-up because the stop rule was reached. No all-gates-green claim is made. Frontend source was unchanged after its passing gate.

| Gate | Actual result |
|---|---|
| Backend mock: npm.cmd --prefix backend test -- --runInBand --no-colors | PASS 67 suites / 1,110 tests |
| Frontend: CI=true npm.cmd --prefix frontend run test:ci -- --no-colors | PASS 42 suites / 341 tests |
| i18n:check / i18n:parity | PASS; 36 namespaces / 2,871 English keys; report/enum contract 164 keys per locale |
| Backend lint:guards / frontend lint:api | PASS; API direct-call baseline 1/1 |
| Root build, CI=true npm.cmd run build | PASS, exit 0; sandbox spawn EPERM resolved by elevated local build |
| Docker: docker build --target test --tag erp-batch5a-test:20261017 --progress=plain backend | PASS 65 suites / 1,083 tests; 91 PG suites / 1,962 tests skipped in this stage; two repo-context mock suites covered by host gate |
| Disposable golden reconciliation: r02-pg-gate.ps1 -Reconcile | PASS 18/18 zero-violation checks; zero pending receipts; 130 migrations; fixture seed exit 0; container removed |
| FULL PG: r02-pg-gate.ps1 -All (unfiltered) | FAIL: 90 passed / 1 failed suites; 1,956 passed / 1 failed tests; 130 migrations; aggregate-scope.pg.test.js:101 |
| Follow-up ownership + aggregate focused PG | FAIL: 1 passed / 1 failed suites; 5 passed / 1 failed tests; all 3 new ownership cases pass; 5 unresolved equality candidates |

Raw current gate logs are preserved locally as .batch5a-backend-final.log, .batch5a-frontend-final.log, .batch5a-build-final.log, .batch5a-docker-final.log, .batch5a-golden-final.log and .batch5a-pg-final.log. Counts are from executed commands, not older baseline reports. Docker's PG skips are not PG verification. Existing Dockerfile test-secret declaration triggers one BuildKit warning; no production secret is involved.

## Modified files

- Backend application: src/services/clientCollections.js, src/services/dashboardWidgets.js, src/services/procurementDocuments.js, src/services/projectReadScope.js; src/routes/dashboard.js, finance.js, projects.js, procurement.js; src/middleware/auth.js.
- Backend verification: scripts/r02-pg-gate.ps1; src/scripts/batch5a-route-inventory.js, reconcile-database.js; eight new PG suites (client-collections and batch5a-project-create/inventory/dashboard/my-actions/lists/reconcile/directory-scope); existing scope-filter.test.js.
- Frontend: pages/MyActions.js, ProjectWizard.js, Reports.js; utils/formatters.js; two new page regression suites; EN/AR actions, enums and reports catalogs; scripts/report-contract.js and i18n-inventory.js.
- Repository/reporting: .gitignore; STATE.md; docs/CLOSEOUT_LOG.md; docs/CLOSEOUT_PROGRESS.md; this report; docs/BATCH_5A_COARSE_ROLE_TABLE.md, docs/BATCH_5A_LIST_ROUTE_TABLE.md and docs/R1_AGGREGATE_ALLOWLIST.json.

## Limits and next action

- The aggregate-isolation blocker above must be resolved before Batch 5A can close; rerun every requested gate after the follow-up is verified. Do not treat earlier broad-gate passes as verification of the latest source.
- Historic v1 failure assertion remains unavailable/unreproduced. If it recurs, retain the complete failure block using the unfiltered gate before changing code; no test timeout or assertion was weakened.
- Full GET table records 254 responses with array fields, 81 without total headers. These include fixed catalogs and nested aggregate arrays; classify them route by route before asserting 81 product defects. Missing-record/denied rows need dedicated fixtures to verify list behavior. No universal pagination claim is made.
- Coarse-role table records grant-layer mismatches, including intentional privileged restrictions. Removing those restrictions requires endpoint-specific security analysis.
- Native Arabic and human RTL review, generated narrative report content and localized export documents remain unverified. No deployed/browser UAT or acceptance signoff is claimed.
- Pilot, clone and demo keep their existing code/data. No rebuild or restart is part of this task. No phase-authority completion checkbox or production GO decision advanced.
