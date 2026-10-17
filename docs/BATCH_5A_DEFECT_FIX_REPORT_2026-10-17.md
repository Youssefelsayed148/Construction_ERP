# Verification-only resume - full-PG run 3 FAIL / STOP - 2026-10-17

Resumed after the user restored Docker. Branch closeout/batch-a-to-6; starting HEAD 8dac539 (documentation checkpoint); implementation/test source is unchanged from cc1a3ea. Initial working tree clean. No source, test, timeout, dependency, schema or environment-file change. This section supersedes the earlier blocked recovery and historical gate counts below.

## Docker recovery, pilot and exact cleanup

docker info --format '{{.ServerVersion}}' returned 28.3.2, exit 0. No Desktop/backend restart by the agent in this resume. The earlier attempt's pre-recovery pilot status was unavailable. Permitted compose ps -a now showed pilot db/backend/frontend all healthy, Up 50 seconds; final permitted status showed all three healthy, Up 15 minutes. The migrate container stayed Exited (0). HTTP http://127.0.0.1:8090 returned 200. No start needed or executed; no pilot seed/build/recreate/SQL/exec operation. Sweep clone and demo received no direct operations.

Name-only inventory before tests: 25 containers / 595 volumes / 8 networks. No container matched prior-attempt erp-r02-gate-202610170344*. All pre-existing containers, anonymous/named volumes and networks were left in place because further ownership was not proven. Protected pilot/sweep names were preserved; no demo-named resource appeared in the inventory. Full names are in ignored .batch5a-verify-docker-inventory.log.

Each new runner removed its own exact container: erp-r02-gate-20261017043817, erp-r02-gate-20261017044252, erp-r02-gate-20261017044637. Final inventory confirmed all three absent. Container cleanup left three new anonymous volumes (598 volumes before explicit cleanup). These were absent from baseline, had the anonymous-volume label and exact matching creation timestamps, and were verified unattached before removal:

| Owned volume removed by exact name | Created UTC / matching disposable run |
|---|---|
| a55d9ae63435e5012beaff626550ab1d0c8f05ad3134722e973bff974f206fbe | 01:38:17 / run 1 |
| 58ca7958293aa9863462934a4c8c4426b0454cabb57d5179e72329e19bf7ea9c | 01:42:52 / run 2 |
| a3026efb94977003396cc2af99f7b237f0cfd9e90efbec331e17c094604e9875 | 01:46:37 / run 3 |

All three docker volume rm operations exited 0; final volume count returned to 595. No other resources removed; all original 25 containers / 595 volumes / 8 networks retained. The saved .batch5a-verify-docker-final-inventory.log was captured BEFORE explicit volume cleanup and therefore lists the three subsequently removed volumes. An intermediate tool-output claim that --rm had also cleaned the volumes was incorrect; the inventory exposed them and explicit cleanup above corrected it. No prune/down command.

Post-cleanup exact-name comparison confirmed ZERO differences from the pre-test container, volume and network inventories (25 / 595 / 8). Final names saved in .batch5a-verify-docker-postcleanup-inventory.log; this is the authoritative final inventory.

## Full unfiltered PG and v1 repetition results

Each run used powershell.exe -NoProfile -File backend/scripts/r02-pg-gate.ps1 -All -Filter '.*' on its own new disposable loopback PG database. All 130 migrations applied on EACH run. Unfiltered emitted output was saved independently; no failure filter hid the timeout details. The loop stopped after the first nonzero exit.

| Full-suite run | Suites passed / failed | Tests passed / failed | Jest time | v1-contract within full suite | Exit |
|---|---|---|---|---|---|
| 1 | 93 / 0 | 1,982 / 0 | 225.674 s | PASS, 10/10; suite 30.371 s | 0 |
| 2 | 93 / 0 | 1,982 / 0 | 201.179 s | PASS, 10/10; suite 28.959 s | 0 |
| 3 | 92 / 1 | 1,981 / 1 | 297.801 s | FAIL, 9/10 plus afterAll timeout; suite 60.718 s | 1 |
| 4 | NOT RUN | NOT RUN | - | NOT RUN after stop | - |
| 5 | NOT RUN | NOT RUN | - | NOT RUN after stop | - |

The latest batch5a-last-scope pagination refinements, aggregate-scope and batch5a-directory-scope passed in ALL THREE full runs. There were no new fixture setup failures. Only 2/5 requested v1 full-suite repetitions passed; three were executed and two remain unrun. A failure plus its teardown timeout counts as one failed test, not two failed PG attempts. No retry after this failure.

Raw full logs: .batch5a-verify-pg-run-1.log, .batch5a-verify-pg-run-2.log, .batch5a-verify-pg-run-3.log (ignored, retained locally). SHA256 respectively: 5656D37561EAAFB5DB46CB733688C1804D0DC91DE1D70FB6CF57E590E07B020E; 9B697BA403B2A4C17B25E1CEE383E143A2793653760A59BDFF5776C501B68B06; 0E35EEA5DFE4BE53513EB59BD40A8BF47290BD59B6D8200AB16C2060CF479F81.

## Complete failure text and source/schema diagnosis

The unique Jest failure summary below preserves both complete errors and stack/source locations. Only PowerShell's repetitive System.Management.Automation.RemoteException wrapper lines and blank lines are omitted; the unfiltered raw log is retained. No Expected/Received assertion diff exists because the test never reached its final envelope assertions. Also saved as .batch5a-verify-v1-failure.log.

```text
Summary of all failing tests
FAIL src/scripts/__tests__/v1-contract.pg.test.js (60.718 s)
  ● B5 API contract: OpenAPI spec vs the live /api/v1 › every documented (method, path) answers with a JSON envelope when called
    thrown: "Exceeded timeout of 30000 ms for a test.
    Add a timeout value to this test to increase the timeout, if this is a long-running test. See https://jestjs.io/docs/api#testname-fn-timeout."
      69 |   });
      70 |
    > 71 |   test('every documented (method, path) answers with a JSON envelope when called', async () => {
         |   ^
      72 |     // Health + openapi are public GETs; oauth/token is exercised separately.
      73 |     const skip = new Set(['/health', '/openapi.json', '/oauth/token']);
      74 |     const unanswerable = [];
      at test (src/scripts/__tests__/v1-contract.pg.test.js:71:3)
      at Object.describePg (src/scripts/__tests__/v1-contract.pg.test.js:18:1)
  ● Test suite failed to run
    thrown: "Exceeded timeout of 30000 ms for a hook.
    Add a timeout value to this test to increase the timeout, if this is a long-running test. See https://jestjs.io/docs/api#testname-fn-timeout."
      56 |   });
      57 |
    > 58 |   afterAll(async () => {
         |   ^
      59 |     await db.query('DELETE FROM user_project_roles WHERE user_id = (SELECT id FROM users WHERE email = $1)', [`b5-${tag}@test.io`]);
      60 |     await db.query('UPDATE users SET is_active = false WHERE email = $1', [`b5-${tag}@test.io`]);
      61 |     await db.query('UPDATE users SET is_active = false WHERE email = $1', [`b5-metrics-${tag}@test.io`]);
      at afterAll (src/scripts/__tests__/v1-contract.pg.test.js:58:3)
      at Object.describePg (src/scripts/__tests__/v1-contract.pg.test.js:18:1)
```

Confirmed trace: the route-loop's last request was POST /api/v1/materials/replenishment/sweep at 2026-10-17T01:48:29.572Z; following health test began at 01:48:57.877Z, after the route-loop's deadline. v1.js:249 maps it to materials.js:360; that handler awaits sweepLeader.runSweepAsLeader and replenishment.runReplenishmentSweep before returning. replenishment.js:610 selects all active item_master rows and evaluates them sequentially, then evaluates other alerts, querying warehouse_stock, stock_movements, purchase orders/lines, material_requirements, business_rules and replenishment_alerts. This is a database-wide synchronous job in the contract loop.

Schema inspection: replenishment-migration.js defines replenishment_alerts.material_id -> item_master and purchase_order_id -> purchase_orders, with material/type indexes; 0020_event_outbox.sql defines background_sweep_runs and its sweep/started_at index. policy-migration.js defines the teardown's indexed user_project_roles.user_id FK and nullable project_id. All 130 migrations and the global migration inventory check succeeded. The failed v1 section contains NO Database query error, missing relation/column, violated constraint or deadlock diagnostic. There is no evidence for a schema mismatch.

Confirmed failure mechanism is the 30-second test budget exceeded while that sweep request was outstanding. call() has no AbortSignal/deadline; afterAll awaits server.close at line 62, consistent with an uncancelled in-flight request keeping teardown open. This is a source-based inference about teardown, not a captured hook await stack. Exact slow query, workload/cardinality, lock wait or other underlying sweep cause is UNPROVEN: no live query/lock snapshot was captured before the disposable DB was removed. No schema cause is invented. The previously uncaptured historic v1 failure cannot be conclusively equated with this timeout; this run now provides concrete failure evidence.

## Remaining gates and stop

| Requested gate after PG repetitions | This resume |
|---|---|
| Docker test-stage build | NOT RUN |
| Disposable golden verification | NOT RUN; 0 checks |
| Backend mock / frontend | NOT RUN |
| i18n check/parity | NOT RUN |
| lint:guards / API lint / root build | NOT RUN |

Stopped on the FIRST failure under the explicit stop rule; no second attempt, speculative fix, timeout increase or assertion change. No product acceptance or all-green claim. Next action requires separate authorization to diagnose/fix the replenishment sweep using request/query timing and lock evidence on a new disposable DB, then rerun all five full suites and remaining gates. This verification-only task made documentation changes to STATE.md, CLOSEOUT_PROGRESS.md, CLOSEOUT_LOG.md and this report. Both excluded review reports preserved, ignored and unstaged. No external messages, paid adapters, legacy role switch, push, PR or deploy. Batch 5A remains incomplete.

# Historical recovery stop at 8dac539 (superseded above)

# Verification-only resume at cc1a3ea - Docker recovery STOP - 2026-10-17

Starting branch closeout/batch-a-to-6, HEAD cc1a3ea08e2f5a85f93ff46d838d5aad6a99d856, clean working tree. This attempt changed documentation only. Results below supersede historical gate counts for this resume.

Docker recovery (approximately 03:54-03:58 Cairo): sandbox docker info failed with named-pipe Access is denied. The outside-sandbox health check then failed to answer within 30 seconds; its client was terminated. Stopped the four Docker Desktop processes (18420, 18852, 21944, 24864) and both com.docker.backend processes (3932, 17104), then started C:\Program Files\Docker\Docker\Docker Desktop.exe with a hidden window. Replacement Desktop/backend processes were observed. No second restart occurred.

The bounded three-minute polling command emitted:

```text
Docker Desktop launched from default install path.
docker info poll 1 exit=
docker info poll 2 timed out
docker info poll 3 timed out
docker info poll 4 timed out
docker info poll 5 timed out
docker info poll 6 timed out
docker info poll 7 timed out
docker info poll 8 timed out
docker info poll 9 timed out
docker info poll 10 timed out
docker info poll 11 timed out
STOP: Docker did not recover within 3 minutes. Manual Docker Desktop/WSL restart required.
```

Recovery exit 1. Poll 1 provided no usable successful result; later probes did not answer. A separate unresponsive info client was also terminated. No test, migration or schema assertion ran, so the underlying daemon/WSL cause is unestablished; this is an infrastructure blocker, not evidence of a schema defect.

Pilot before/after container status and uptime are UNAVAILABLE. Step 0c was not reached: no compose ps, start, or HTTP check. Step 0d was not reached: no daemon inventory, no container/volume/network removal. Removed: NONE. Left: ALL Docker resources, including every protected pilot/sweep/demo resource and any old disposable PG resources; exact old disposable inventory remains unconfirmed. The authorized Desktop/backend restart may affect existing container availability, which could not be checked. No direct protected-stack operation, seed, build, recreation or cleanup ran.

| Requested gate | This attempt's result |
|---|---|
| Full PostgreSQL suite, unfiltered | NOT RUN; 0 suites / 0 tests executed; no test failure count available |
| v1-contract inside full PG, runs 1 / 2 / 3 / 4 / 5 | ALL NOT RUN; 0/5 completed; no assertion failure |
| Docker test-stage build | NOT RUN |
| Disposable golden verification | NOT RUN; 0 checks executed |
| Backend mock / frontend | NOT RUN; 0 suites/tests executed |
| i18n check/parity / lint:guards / API lint / build | NOT RUN |

STOP as instructed at step 0b. User action required: restart Docker Desktop manually; if necessary run wsl --shutdown, then reopen Docker Desktop. No automatic WSL shutdown or further verification attempt. After manual recovery, resume health check, the permitted pilot status/start and HTTP check, exact-name disposable cleanup and every requested gate. Batch 5A remains incomplete. Excluded review reports preserved, ignored and unstaged; no feature/source/test/dependency/migration/environment-file changes, external messages, push, PR or deployment.

# Historical report at cc1a3ea (superseded above for this resume)

# Last Batch 5A scope blocker - fixed; final verification BLOCKED - 2026-10-17

Resume source: e5cd943 on closeout/batch-a-to-6. Application fix has focused real-PG evidence. Batch closure is blocked by Docker engine availability; five full-PG runs and final Docker verification are incomplete. Earlier report sections below are historical and do not establish final gate status.

## Assertion and failing-first proof

aggregate-scope.pg.test.js's unexplained=[] assertion finds byte-identical nonempty owner/one-project responses outside the documented shared/zero responses. Equality is a discovery oracle, not ownership proof. Original R12 fixtures attached both projects to one client and supplier, so those directory results could legitimately match. Each project now has a distinct supplier and client. The assertion, route discovery, allowlist and timeouts are unchanged.

New batch5a-last-scope.pg.test.js inserts two projects, distinct clients/suppliers and POs, own/foreign team members, a NULL-project owner_ceo seat, an unassigned actor and client_reviewer. It independently checks exact IDs/statuses/totals on all five routes for all four requested roles, including v1 meta.total. Team checks cover pagination and explicit authorized/foreign project selection.

Failing-first disposable PG: 130 migrations; **18 passed / 4 failed**; erp-r02-gate-20261017034208 removed, exit 1. Full assertion output is in ignored .batch5a-last-scope-red.log. Initial Docker pipe access denial was an infrastructure failure before this executed regression.

**HIGH data-leak defect:** GET /api/team and GET /api/organizations/team, project_manager assigned only project 1. Expected seat IDs [1,2,5], total 3; received [1,2,3,5], total 5. Seat 3 is the company-wide owner_ceo assignment (NULL project), exposing identity fields. Foreign project 2 seat 4 was pruned from the response, but contributed to total 5. No foreign seat row content was returned in this reproduction; confidentiality failure is company identity plus out-of-scope totals. Reported before applying the fix.

Schema diagnosis: user_project_roles.project_id is nullable (policy-migration.js); projectReadScope intentionally excludes this table because policy needs complete identity rows. Response pruning runs after COUNT/LIMIT and preserves NULL-project seats. Both GET handlers now pass authorized project_ids into teamService's listing predicate before COUNT/LIMIT. It excludes foreign and NULL-project seats for scoped callers while company-wide callers retain their directory. No identity query or RBAC grant changed.

## Exact before/after S-002 comparison

Isolated source snapshots: **90a024d** immediately before S-002 and **0222817** immediately after it. Used git archive under ignored .claude/worktrees, existing dependencies, the same new regression and independent throwaway migrated DBs; no historical checkout or protected environment. Both runs: 130 migrations; 18 passed / 4 expected failed; respective containers ...20261017034314 and ...34315 removed. PowerShell compared all 20 JSON observations: **20/20 identical**, including exact IDs/totals/statuses.

The following results apply at BOTH snapshots (own project 1, foreign project 2). IDs are sorted for comparison; total is X-Total-Count, with the same meta.total on v1. Forbidden responses have no total header or meta total.

| Route | project_manager actual IDs / total | unassigned | client_reviewer | owner_ceo IDs / total |
|---|---|---|---|---|
| /api/suppliers | [1] / 1 | 403, [] / absent | 403, [] / absent | [1,2] / 2 |
| /api/clients | [1] / 1 | 403, [] / absent | 403, [] / absent | [1,2] / 2 |
| /api/organizations/team | [1,2,3,5] / 5 (defect; expected [1,2,5] / 3) | 403, [] / absent | 403, [] / absent | [1,2,3,4,5] / 5 |
| /api/team | [1,2,3,5] / 5 (same defect) | 403, [] / absent | 403, [] / absent | [1,2,3,4,5] / 5 |
| /api/v1/companies/ | [1] / 1; meta.total=1 | 403, [] / absent | 403, [] / absent | [1,2] / 2; meta.total=2 |

**S-002 did not widen access on any of the five routes.** Its application diff changes only authorize role lists on GET /api/projects/templates, GET /api/projects/templates/:key, POST /api/projects/wizard and POST /api/projects. Those four routes intentionally permit RBAC-granted canonical roles previously blocked by the coarse owner/admin/project_manager list (e.g. owner_ceo); policy grants and project scoping remain enforced. This is an intentional entry-route widening, not a change to these five directory/team routes. No assertion of universal safety of every other route is made.

## Focused fix verification

r02-pg-gate.ps1 -Suite batch5a-last-scope.pg.test.js,aggregate-scope.pg.test.js,batch5a-directory-scope.pg.test.js (full source paths under src/scripts/__tests__) -> **3 suites / 28 tests passed**, 130 migrations, exit 0; erp-r02-gate-20261017034316 removed. Discovery: 238 parameterless GETs, 26 identical documented responses, unexplained=0, server failures=0. Application source unchanged thereafter. Later test-only changes add third/empty-page assertions and owner default-page handling; they have NOT run on PG because the engine became unavailable.

In this combined run own/foreign project IDs were 4/5:

| Route | project_manager exact IDs / total | owner_ceo exact IDs / total |
|---|---|---|
| /api/suppliers | [4] / 1 | [1,2,3,4,5] / 5 |
| /api/clients | [3] / 1 | [1,2,3,4] / 4 |
| /api/organizations/team | [3,4,7] / 3 | [3,4,5,6,7] / 5 |
| /api/team | [3,4,7] / 3 | [3,4,5,6,7] / 5 |
| /api/v1/companies/ | [3] / 1; meta.total=1 | [1,2,3,4] / 4; meta.total=4 |

Unassigned and client_reviewer: all five returned exactly 403, [] IDs, no total header/meta total. Expected owner IDs are independently queried from the disposable DB, including earlier suites' fixture rows. No response-derived oracle.

## Gates after final source/test edits

| Gate / command | Actual result |
|---|---|
| npm.cmd --prefix backend test -- --runInBand --no-colors | PASS 67 suites / 1,110 tests; 15.241s |
| CI=true npm.cmd --prefix frontend run test:ci -- --no-colors | PASS 42 suites / 341 tests; 10.625s |
| frontend i18n:check and i18n:parity | PASS; 36 namespaces / 2,871 English keys |
| frontend lint:api | PASS; direct-call baseline 1/1 |
| backend lint:guards | PASS |
| CI=true npm.cmd run build | PASS; Compiled successfully; exit 0. First sandbox attempt spawn EPERM; authorized retry passed. |
| docker build --target test --tag erp-batch5a-last-test:20261017 --progress=plain backend | BLOCKED; stalled with no build output; interrupted. No tests counted. |
| r02-pg-gate.ps1 -Reconcile | BLOCKED; stalled with no gate output; interrupted. No checks counted. |
| r02-pg-gate.ps1 -All -Filter '.*' | BLOCKED during migration; Connection terminated unexpectedly after output for migration 0067. Jest not reached. No suite/test counts. |

Full emitted failure output remains in .batch5a-last-pg-run-1.log. No filtering was applied to the captured run. The runner emits only its existing last-1500-character migration error block on migration failure; this is not a Jest assertion failure. The default unfiltered Jest path never ran. Docker's engine named pipe accepted connections but both bounded GET /_ping probes timed out after 5 seconds. Docker processes remained present. No restart or protected-container query was attempted. Pending commands were interrupted; cleanup of this attempt's disposable ...202610170344* containers is unconfirmed.

| Requested full-PG run | Full suite | v1-contract |
|---|---|---|
| 1 | Migration connection failed; Jest not reached | NOT REACHED; no assertion |
| 2 | NOT RUN after infrastructure stop | NOT RUN |
| 3 | NOT RUN | NOT RUN |
| 4 | NOT RUN | NOT RUN |
| 5 | NOT RUN | NOT RUN |

**0/5 completed full-suite v1 runs.** Historic v1 instability remains unresolved. No v1 assertion failed in this attempt; no unavailable assertion is reconstructed or claimed captured.

## Files, limits and resume

Application files: routes/organizations.js, routes/team-assignments.js, services/teamService.js. Tests: aggregate-scope.pg.test.js, new batch5a-last-scope.pg.test.js. Reporting: STATE.md, CLOSEOUT_LOG.md, CLOSEOUT_PROGRESS.md and this report. No new dependencies or migrations; no allowlist, policy grant, authentication identity lookup or v1 contract-test edits.

STOP at Docker availability. Restore availability without agent restarts of protected environments, clean only this attempt's throwaways, rerun focused tests and EVERY final gate including at least five complete unfiltered full-PG runs. Capture any full v1 assertion; after two failures, diagnose the schema before retry. Final Batch 5A completion is not claimed. Human UAT and deployed behavior remain unverified. Pilot, clone and existing demo were not queried, rebuilt, restarted or seeded. In-process golden seeding occurred only inside new disposable test databases. No env values read/printed, external message/service, legacy role switch, push, PR or deploy. Excluded review reports remain untouched/unstaged. LF and staged whitespace checks apply to the checkpoint.

---

# Historical e5cd943 report (superseded by the current status above)

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
