# CURRENT - A2 token30 + v1 idle10 PASS; v1 loaded next - 2026-10-17

V1 idle command diagnose.ps1 -SuiteName v1 -Mode idle -Count10 completed **10/10 suites,100/100 tests**,130 migrations per fresh DB, all exits0. Jest times5.066,4.896,4.684,5.851,4.883,4.805,4.998,4.745,5.760,4.608s. Together with both token modes, A2 has40 passed suites/490 passed tests and zero unavailability diagnostics; no timeout/503 reproduced yet. Remaining mode: v1 LOAD1..10; A2 not complete before that mode.

Installed primary code evidence: backend/node_modules/pg-pool/index.js:190-225 places a timer on pending checkout using connectionTimeoutMillis and raises a generic Error with the fixed connection-timeout message at :224. Thus the configured5000ms applies to queued pool acquisition as well as connection setup; no SQLSTATE is guaranteed. This possible mechanism was NOT observed in current runs. OAuth CAS/scrypt/pool app-source references remain below. Between PG groups (no PG gate active), a single2-operation timing sample measured bcrypt verification pair107ms idle/141ms loaded and scrypt hash pair141ms idle/243ms loaded, N32768/r8/p3.12 busy workers used only in loaded sample and terminated; no credentials/hashes printed. These samples are not production latency estimates or root-cause proof.

Next exact resume v1 LOAD1. A4 remains0/5; S-003/header test drafts unrun/uncommitted. No app behavior fix, no B/C/push. Scratch kdf-{idle,load}.log and v1-idle-{1..10}*.log retain evidence.

---

# Prior token-mode checkpoint

# A2 token idle/load 30/30 PASS; v1 idle next - 2026-10-17

Token reproduction groups completed: **idle15/15 + load15/15 = 30 passed suites / 390 passed tests, zero failures**. Each iteration used its own new disposable PG, applied130 migrations and exited0 with13/13 tests. Loaded Jest times: 6.571, 6.679, 6.976, 7.190, 7.616, 7.120, 7.636, 7.177, 7.285, 7.477, 7.302, 7.607, 7.814, 7.637, 7.963s. New rate-limit/auth-unavailable diagnostics count0; the historical503 was NOT reproduced in either token mode. This does not prove absence of an intermittent failure or eliminate full-suite shared-state/environment effects. No concurrency fix justified.

CPU mode used12 busy worker threads, bounded10 minutes per process and explicitly stopped after each gate; all15 CPU stderr logs empty. Valid elevated host sample during load: CPU82%, free RAM1,803MiB. An earlier sandbox WMI sample was denied; its zero value is explicitly marked INVALID and excluded from evidence. Full gate/CPU/snapshot logs and parsed a2-summary.log retained under .scratch-5a-resume. Next: v1 idle1..10, then v1 load1..10. No broad A4 gate executed; count0/5. Three drafted S-003/header test files are unrun and excluded from this docs checkpoint. B/C not started, no push.

---

# Prior A2 idle checkpoint

# A2 token idle 15/15 PASS; loaded mode next - 2026-10-17

A1 committed at ed94887 after LF normalization and successful cached whitespace check (initial attempt exposed v1.js CRLF; corrected before retry). A2 command: `powershell.exe -NoProfile -File .scratch-5a-resume/diagnose.ps1 -SuiteName token -Mode idle -Count 15`. Each iteration invokes the unchanged r02 gate with `-Suite src/scripts/__tests__/token-typing.pg.test.js -Filter '.*'` on a separate Docker-assigned-port throwaway database; 130 migrations each. Result: **15/15 suites, 195/195 tests passed, zero failures**, all exits 0. Per-run Jest times: 7.782, 4.488, 4.417, 4.362, 4.562, 4.237, 4.590, 4.349, 4.157, 4.254, 4.349, 4.262, 4.332, 4.356, 4.352 seconds. Unfiltered logs and sampled activity/locks are retained as `.scratch-5a-resume/token-idle-{1..15}*.log`. No 503 reproduced; neither a path/SQLSTATE nor root cause has been established by idle success.

Static OAuth findings: oauthService.js:170 derives the replacement scrypt hash BEFORE transaction at :197; :203 compare-and-swap updates the legacy hash; :206 updates last_used_at inside the same transaction and issuance audit. passwords.js:6 uses N=32768/r=8/p=3, keyLength=64/maxmem=64 MiB; :15 uses asynchronous crypto.scrypt, legacy bcrypt compare at :43. database.js:11 pool max=20, :16 acquisition/connect timeout default=5000 ms, :44 connects and :54 releases in finally. No crypto work holds that upgrade transaction open. These facts do not exclude host/pool pressure or prove a race caused the historic 503; no concurrency fix made on inference.

A3b static route classification: **38 class (a), 43 class (b)** across all 81 missing-header observations; full route names/reasons in docs/BATCH_5A_HEADER_CLASSIFICATION_2026-10-17.md. Growing/capped financial registers remain class (a), not automatically treated as bounded lookups. No fix claimed yet. S-001 code/seed scan found neither 9,130 nor 9,130,000 constant or x1,000 money scaling in seed-pilot-data/formatter; discrepancy remains undetermined, non-blocking. Draft S-003 tests are unrun/uncommitted; implementation pending.

Exact next resume: token loaded iteration 1, then v1 idle/load groups. A2 is not complete until both modes for both suites are covered or the stop condition applies. A4 count remains 0/5; all broad gates unrun on current source. B/C remain not started. This is a docs checkpoint, not phase completion/push authorization.

---

# A1 checkpoint history

# Controlled resume from d7c7664: A1 diagnostics complete; A2 next - 2026-10-17

Phase A1 implemented with unchanged responses: shared/public limiter, authenticated v1 limiter, internal authentication and idempotency lookup/persistence/release paths log sanitized `{code,name,messageClass}`. `connection_timeout` is a fixed classification derived from the message without printing it; other messages classify as `other`. No SQL parameters, error detail, tokens or runtime credentials are logged. A1 production diff: 22 added / 8 removed lines (30 changed), under the requested ~40-line limit.

Test-first: fixture setup initially loaded oauthService with an incomplete tokens stub (zero tests); diagnosed and isolated that dependency. Intended red then reached 6 failing assertions. Green command in backend: `npm.cmd test -- --runInBand src/scripts/__tests__/infrastructure-diagnostics.test.js src/scripts/__tests__/postgres-rate-limit.test.js src/scripts/__tests__/auth-infrastructure.test.js src/scripts/__tests__/external-api.test.js` -> **4 suites / 68 tests passed**, 8.034 s, exit 0. New coverage verifies exact 503/504 bodies/headers and forwarded errors, optional idempotency behavior, logging, metadata redaction and connection-timeout classification. Existing OAuth/middleware tests remain green. Logs `.scratch-5a-resume/a1-red.log` and `a1-green.log`; no existing assertions/timeouts relaxed.

Docker preflight bounded at 30 s: 28.3.2, exit 0 in 0.723 s outside sandbox. Baseline names saved: 25 containers / 595 volumes / 8 networks. Six running containers are protected pilot/sweep frontend/backend/db; only names inventoried, no sweep operations. Host before PG runs: 1,354 MiB free of 16,005 MiB RAM; 16 logical CPUs; CPU load 18%. Pilot permitted ps shows three healthy services, migrate Exited (0); HTTP 8090=200. No restart/mutation or test DB created yet.

Current gates: A1 focused checks PASS above; A2 NOT STARTED; S-003/S-006 classification pending; A4 full PG **0/5**, Docker/golden/mocks/frontend/i18n/guards/lint/build NOT RUN on this source. A5 review pending. No phase complete, no push. Exact next resume: A2 token-typing idle iteration 1, followed by bounded idle/load reproductions for both suites and guarded disposable-only snapshots/cleanup. A4 counters reset after any source change. B/C remain gated. STATE.md records the checkpoint and protected files.

---

# Historical checkpoint at d7c7664 (superseded above)

# Controlled A/B/C run: Gate A FAILED / STOP - 2026-10-17

Start: closeout/batch-a-to-6 at 2264ab1; initial working tree had no changes. This section supersedes the historical sections below. Phase reached A2, complete PG run 1; it failed. Batch 5A remains INCOMPLETE. Gate A FAILED; Gates B/C NOT EVALUATED, both phases NOT STARTED. No push, PR, deployment, application fix, or production acceptance. Established A1 diagnosis was not extended or repeated; environmental pressure remains an unproven hypothesis, and five consecutive complete passing runs were NOT obtained.

## Execution and hard stop

The existing runner selected unchecked random ports and removed the database without collecting a failure snapshot. A narrow prerequisite implements the user's explicit port/evidence/cleanup requirements: Docker-assigned loopback binding, excluded-range/protected-port rejection, activity/lock capture before teardown and owned anonymous-volume removal. Implementation is 19 added / 3 removed runner lines plus 8 SQL lines; the separate test has 26 lines. No existing application/test assertion, timeout, migration, dependency or environment file changed.

Failing-first test command: `npm.cmd test -- --runInBand src/scripts/__tests__/r02-runner-safety.test.js` in backend. First fixture setup used one too many parent path segments, resolving to root scripts instead of backend/scripts (ENOENT; zero tests); corrected after inspecting the actual location. Intended red then executed 2 tests, both failed on absent safety behavior. After implementation: 1 passed suite / 2 passed tests, 0.237 s, exit 0. These are source-contract checks, not behavioral proof on their own. The real disposable run below additionally exercised assigned-port allocation, failure SQL and cleanup. No intentional red test is counted as a completed PG run.

Exact full gate command:

```text
powershell.exe -NoProfile -File backend/scripts/r02-pg-gate.ps1 -All -Filter '.*'
disposable erp-r02-gate-20261017161730 mapped to loopback port 61067
migrations: [migrate] all migrations completed (130 applied, 0 already applied)
Test Suites: 2 failed, 91 passed, 93 total
Tests:       2 failed, 1980 passed, 1982 total
Snapshots:   0 total
Time:        287.199 s
container erp-r02-gate-20261017161730 removed; exit=1
full PG run 1 exit=1
```

Stopped on the FIRST failing complete run, with no retry, assertion relaxation, allowlist addition, timeout increase, source diagnosis experiment or speculative application fix. Jest completed all 93 suites within this one command before returning the failing result. Consecutive complete passing count reset to ZERO. No A2 item after the PG repetitions was run.

## Current gate table

| Gate | Actual current output / numbers | Result |
|---|---|---|
| Full PG 1 | 91 passed / 2 failed suites; 1,980 passed / 2 failed tests; 130 migrations; 287.199 s; exit 1 | FAIL; v1 9 passed / 1 failed of 10, suite 57.198 s |
| Full PG 2 | 0 suites / 0 tests executed | NOT RUN; v1 NOT RUN |
| Full PG 3 | 0 suites / 0 tests executed | NOT RUN; v1 NOT RUN |
| Full PG 4 | 0 suites / 0 tests executed | NOT RUN; v1 NOT RUN |
| Full PG 5 | 0 suites / 0 tests executed | NOT RUN; v1 NOT RUN |
| Backend Docker test-stage build | 0 builds / 0 test executions | NOT RUN; no cache hits or PG skips counted |
| Disposable golden -Reconcile | 0 fixture seeds / 0 checks | NOT RUN |
| Full backend mocks | 0 full-gate suites/tests | NOT RUN; separate focused harness check above was 1 suite / 2 tests |
| Frontend CI tests | 0 suites / 0 tests | NOT RUN |
| i18n check / parity | 0 commands | NOT RUN |
| lint:guards | 0 commands | NOT RUN |
| API lint | 0 commands | NOT RUN |
| Root CI build | 0 builds | NOT RUN |

v1's 9/10 is obtained from the ten declared test cases and the single failing case in Jest's complete failure summary; Jest's default reporter prints overall totals, not a separate per-file passed count. Its other nine tests and teardown had no reported failure. Unlike the earlier historical run, this run reports no afterAll timeout. The second failed suite is token-typing (6.082 s), with one failed test.

## Failure text and snapshot limits

The full failure-summary text is retained locally in `.scratch-controlled-run/failures-redacted.log`; only native PowerShell wrapper-only lines and fixture-secret text are removed/redacted. The unfiltered original remains `.scratch-controlled-run/pg-1.log`. No .env file, account credential file or runtime secret was read or printed. Relevant complete exception/assertion messages:

```text
FAIL src/scripts/__tests__/v1-contract.pg.test.js (57.198 s)
  B5 API contract: OpenAPI spec vs the live /api/v1
  every documented (method, path) answers with a JSON envelope when called
  thrown: "Exceeded timeout of 30000 ms for a test.
  Add a timeout value to this test to increase the timeout, if this is a long-running test. See https://jestjs.io/docs/api#testname-fn-timeout."
  at test (src/scripts/__tests__/v1-contract.pg.test.js:71:3)
  at Object.describePg (src/scripts/__tests__/v1-contract.pg.test.js:18:1)

FAIL src/scripts/__tests__/token-typing.pg.test.js (6.082 s)
  token typing (real PostgreSQL, real app)
  concurrent real HTTP client grants upgrade a legacy service secret once
  expect(received).toEqual(expected) // deep equality
  - Expected  - 1
  + Received  + 1
    Array [
      200,
  -   200,
  +   503,
    ]
  at Object.toEqual (src/scripts/__tests__/token-typing.pg.test.js:87:50)
```

The v1 route-loop's last logged request before the next test was `POST /api/v1/materials/replenishment/sweep` at 13:19:37.179 UTC; the next test's health call was at 13:20:05.782 UTC. The later sweep request at 13:20:41.301 belongs elsewhere in the complete log; do not confuse it with the failed loop. No new timeout root cause is established. The OAuth response body was not retained by that test's failure assertion; its 503 cause is unproven, not evidence of wrong authorization. No source fix is proposed as proven from these outputs.

Failure SQL was executed on ONLY the new disposable container BEFORE `docker rm -fv`, at 13:22:46.711619 UTC (16:22:46.711619 Cairo). Actual snapshot: one active observer session, zero other sessions in that database, two granted observer locks, zero ungranted locks, empty blocker list. Jest had already force-exited, so this is a valid pre-teardown snapshot but NOT a live snapshot of the timed-out request. It cannot rule out earlier locks, slow work, pool pressure or environmental instability. No blocking session was killed. SQL string literals are redacted by the observer query.

## A3 self-review evidence (897e823..cc1a3ea)

This is static review of the implementation diff plus current full-run output, not a new pilot/clone query or UI acceptance. No new HIGH source finding was proven; the failed gates prevent sign-off regardless. The age-warning requirement below is unresolved.

| Item | Current file:line evidence | Finding / limits |
|---|---|---|
| S-001 | backend/src/services/clientCollections.js:7, :9, :18; backend/src/routes/dashboard.js:193, :250; backend/src/routes/finance.js:19, :61; backend/src/services/dashboardWidgets.js:44; backend/src/scripts/__tests__/client-collections.pg.test.js:21, :43 | One shared helper/predicate excludes supplier_id, AP direction and voided receipts; shared exact minor-unit figures feed both main routes. Mixed AR 300 / AP 9,130 fixture expects outstanding 700 and profit 260; suite PASS in current full run. Clone 9,130 versus screenshot 9,130,000 remains NOT DETERMINED: frontend/src/utils/formatters.js:8 formats the supplied amount without x1,000 conversion. No pilot DB/screenshot inspection permitted/performed; neither units nor different source data can be asserted as the cause. |
| S-002 | backend/src/routes/projects.js:69, :98, :126; backend/src/migrations/0031_organizations_rbac.sql:28, :590; backend/src/scripts/__tests__/batch5a-project-create.pg.test.js:18; backend/src/scripts/__tests__/batch5a-inventory.pg.test.js:12 | Entry routes use authorize() and migrated per-action grants. Five-role create/audit test derives expected 201/403 from grants, including owner_ceo. Inventory compares explicit coarse lists with grants and records blocked roles; it does NOT assert zero mismatches across unrelated routes. Current output/table: 1,048 mounted method/routes; 73 coarse lists. Both suites PASS. |
| S-004 | backend/src/services/dashboardWidgets.js:301, :305; backend/src/services/apiResources.js:63, :66, :97, :113; backend/src/scripts/__tests__/batch5a-dashboard.pg.test.js:1 | Widget ownership resolves deliveries.purchase_order_id through purchase_orders.project_id; v1 resource projectExpression does the same for list/detail, overriding its generic projectColumn. Regression suite PASS; static schema contains no deliveries.project_id. |
| S-005 | backend/src/middleware/auth.js:38; frontend/src/utils/formatters.js:32, :47; frontend/src/pages/MyActions.js:44, :60; backend/src/scripts/__tests__/batch5a-my-actions.pg.test.js:1; frontend/src/pages/MyActions.recovery.test.js:1 | pg TIMESTAMPTZ returns Date; scoped traversal converted it to {}, formatter returned that object and React rejected it as a child (#31). Preserve Date serialization; reject malformed objects; localized ActionsBoundary with retry wraps the page. Backend regression PASS in current PG run. Frontend tests/UI not rerun in this stop. |
| S-006 | backend/src/routes/procurement.js:288; backend/src/services/procurementDocuments.js:35; backend/src/scripts/__tests__/batch5a-lists.pg.test.js:1; docs/BATCH_5A_LIST_ROUTE_TABLE.md:5 | RFQ uses shared SQL pagination/count; exact scoped totals, offsets and empty pages tested. Suite PASS. Current table recount: 448 GET routes, 254 array-bearing responses, 81 of those have ABSENT count headers. This includes nested arrays/catalogs; no claim that all lists have correct totals or that all 81 are defects. Inventory is the existing generated table, not a fresh all-role UI/API crawl. |
| S-007 | frontend/src/pages/MyActions.js:183, :208; frontend/src/pages/ProjectWizard.js:566; frontend/src/pages/Reports.js:150, :157, :184; frontend/scripts/report-contract.js:6; frontend/src/pages/Batch5ALabels.ar.test.js:27 | Priority/severity-level filters, notification channels and report catalog/module/column labels use keys. AR catalogs contain priority low/medium/high/urgent/critical, severity minor/moderate/major/critical/low/medium/high, channels inApp/email/push/sms/whatsapp. Current localization gates and native Arabic review NOT RUN; no broader narrative/export translation claim. |
| S-003 | backend/src/scripts/reconcile-database.js:161, :176, :191, :267; backend/src/scripts/__tests__/batch5a-reconcile.pg.test.js:36, :43, :60, :84 | Accepted projection uses decided MIR acceptance (plus legacy GRNs without a MIR), subtracts returns once and does not double-count linked GRNs. Pending accepted MIR without GRN does not fail integrity. Six-case suite PASS. REQUIRED AGE-THRESHOLD WARNING IS MISSING: PENDING_RECEIPTS_SQL counts all ages; CLI says [PENDING], not a stale-age WARNING. Unresolved MEDIUM requirement; do not label it implemented. Stale posted-GRN projection test is a different check. |
| Team/directory leak (cc1a3ea) | backend/src/services/teamService.js:104; backend/src/routes/organizations.js:313; backend/src/routes/team-assignments.js:34; backend/src/services/projectReadScope.js:91, :95; backend/src/scripts/__tests__/batch5a-last-scope.pg.test.js:3, :65, :83 | Five explicit routes x four roles = 20 exact-ID/status/header-total assertions; both team routes add page/empty/foreign-filter assertions. Owner page expected IDs derive independently from SQL; scoped users cannot see foreign/company seats. Suite PASS, as did directory-scope/aggregate-scope suites. These cases are not all-role/all-GET direct-ID acceptance. |

Diff scan saved as `.scratch-controlled-run/batch5a-diff.log`: `git diff --unified=0 897e823 cc1a3ea -- backend frontend`. Added/removed `.skip(`, `.only(`, setTimeout/testTimeout/jest.setTimeout or allowlist lines: no matches. Removed expect/toEqual/toBe/toHave assertion lines: no matches. Nine added `describePg = TEST_PG ? describe : describe.skip` declarations explicitly gate new PG suites; TEST_PG=1 in this run, so they ran. These are disclosed rather than described as no skipped syntax anywhere. Separately, `git diff 897e823 cc1a3ea -- docs/R1_AGGREGATE_ALLOWLIST.json` shows SEVENTEEN historical new exemptions for shared catalogs and organization-scope resources. No new allowlist was added in this session. Their existence prevents a blanket claim of no allowlist changes; route-specific justifications are present, not universal coverage proof. Aggregate fixture change makes clients/suppliers distinct; no assertion was removed. No unrun guard is counted green.

## Docker, pilot and retained evidence

Bounded Docker info: sandbox named-pipe access denied; outside-sandbox command returned 28.3.2, exit 0 in 0.520 s, below 30 s. The scratch preflight initially propagated no reliable exit code from Start-Process despite the sandbox stderr; it was corrected to require a version result and no stderr before the successful outside-sandbox check. No Docker/WSL restart. Port exclusions inspected with the required netsh command before allocation: 27339; 50000-50059; 55916-56015; 56143-56242; 56243-56342; 56432-56531; 56532-56631. Docker assigned 61067; protected PG ports 55440/55441/55442 were not bound.

```text
container before=25 after=25 exact_name_differences=0
volume before=595 after=595 exact_name_differences=0
network before=8 after=8 exact_name_differences=0
pilot HTTP status=200   (before)
pilot HTTP status=200   (after)
```

Only erp-r02-gate-20261017161730 was created and removed, with its attached anonymous volume via `docker rm -fv` on that exact owned name. No orphan volume or network remains by exact-name comparison, not counts alone. No other pre-existing resource was removed; no prune. Pilot received only the explicitly allowed compose ps -a and loopback HTTP checks. db/backend/frontend were healthy before and after (Up About an hour -> Up 2 hours); migrate Exited (0), so no start was needed. No pilot build/up/recreate/down/rm/seed/exec/SQL, no direct sweep operation and no demo operation.

Ignored local evidence under `.scratch-controlled-run/`: pg-1.log (unfiltered, 55,895 lines), failures-redacted.log, snapshot.log, inventory-before.log, inventory-after.log, pilot-before.log, pilot-after.log, batch5a-diff.log, and helper-source logs. Original gate SHA256: `00EB92E288C2FE9469F99912B09269E66293C98C10325D13C801FC0C07A1F3D4`. Scratch helpers were script files, not inline shell programs; their sources are retained as ignored logs. The summary helper's broad Exception match emitted noisy native wrapper lines; the full original log remains intact and the saved redacted summary omits only those wrappers. No claim is based on filtered failure-free output.

## Scope, decisions and exact resume

Seven checkpoint files: backend/scripts/r02-pg-gate.ps1, backend/scripts/r02-pg-failure.sql, backend/src/scripts/__tests__/r02-runner-safety.test.js, STATE.md, docs/CLOSEOUT_PROGRESS.md, docs/CLOSEOUT_LOG.md and this report. No dependencies, environment files, application routes/services, migrations, external adapters or legacy role switch changed. Verification: git diff --check and git diff --cached --check exit 0; staged names exactly these seven files; excluded-review staged names empty; all seven i/lf w/lf and CR_bytes=0. Git staging initially hit sandbox index.lock permission denial, then succeeded outside the sandbox; no approval-review rejection. Final restage/cached check must precede commit. Required Claude trailers apply.

Demo Phase B: 0 stages/records/accounts created by this run; module counts and interesting states are NOT MEASURED, no demo defect candidates collected. These zeros mean no seeding was attempted, not an assertion about any existing environment. Phase C: 0 chains, 0 isolation routes, 0/38 accounts and 0/2 languages crawled; all 38 accounts and both languages untested because Gate A failed. No 5B defect log or severity totals are claimed. The OAuth failure is a new MEDIUM broken-flow candidate with no proven cause; v1 timeout is a recurring MEDIUM broken-flow blocker. No data leak, wrong-money or wrong-role finding was proven by this failed run; that is not security clearance.

Needs your decision: scratch_pdf.txt remains tracked i/crlf w/crlf, untouched. Native Arabic/human RTL, export and deployed UAT acceptance remain unverified. Next authorized follow-up starts with the two current failure repros and the missing S-003 age-threshold warning; use this evidence and the user's test-first/~30-line limit. If no narrow proven fix exists, report the proposed fix. Restart all five complete PG runs from zero, then Docker test stage, disposable golden and every requested host gate. Gate A must pass before branch push or Phase B. No automatic retry or later-phase work remains running.

---

# Historical checkpoint at 2264ab1 (superseded above)

# Batch 5A diagnosis STOP; timeout root cause unproven - 2026-10-17

Started clean at 7d15806643fa361a36fa6983b6e02fb3d16ed0ae on closeout/batch-a-to-6. This section supersedes historical status below. No application, test, assertion, timeout, dependency, migration or environment-file change. Batch 5A is INCOMPLETE. No push, PR or deployment.

## Diagnosis in the requested order

1. **Leader advisory lock:** sweepLeader.js:28 uses SELECT pg_try_advisory_lock(hashtext($1)), with lockName('replenishment') = conerp-sweep:replenishment. Contention skips; this acquisition cannot block waiting for that advisory lock. materials.js:363 and replenishment.js:759 share that key. inventory-5-3.pg.test.js:480 deliberately takes the same key with blocking pg_advisory_lock, then releases it and its client in finally. sweep-leader.pg.test.js uses tagged leader keys; concurrency.pg.test.js uses its own names. Migration serialization uses a separate key, 7240100. This does not exclude other lock waits inside the sweep.
2. **Blocking transaction lock / connections:** replenishment.js:395-424 uses pg_advisory_xact_lock(hashtext(sourceKey)) for sourceKey replenishment:<materialId> or replenishment:<materialId>:p<projectId>, within database.transaction when q is defaultQuery. database.js commits or rolls back, then releases in finally. sweepLeader holds a pooled client for its run and unlocks/releases in finally; its comments calling it unpooled do not match pool.connect(). No missing release/rollback was proven in these inspected paths. afterAll awaits server.close BEFORE pool.end, so the old afterAll timeout does not prove pool.end was hanging. The new passing run completed teardown. A transient migration idle-in-transaction sample is not evidence of an application connection leak.
3. **Jest isolation:** r02-pg-gate.ps1:109 explicitly passes --runInBand; backend test:pg also does. jest.pg.config.js does not override maxWorkers. Files in these gates are serial, not parallel. jest.pg.global-setup.js documents migration once per run with uniquely tagged rows, without transaction-per-suite isolation. State/cardinality leakage across suites remains possible and unproven; a fresh standalone pass cannot rule it out. server.js:194 gates startup under require.main === module; v1-contract imports the app and calls app.listen, so that import does not start the scheduled sweeps.
4. **Environment:** do not attribute the historic intermittent timeout to Docker/WSL pressure: hypotheses above have not all been eliminated by a reproduced failure. Docker stats on this disposable container showed 4.27% CPU and 82.13 MiB / 7.57 GiB at one instant; that is not a resource-pressure diagnosis. A separate, proven Windows excluded-port conflict prevented diagnostic attempt 2 from starting, as detailed below.

## Fresh standalone reproduction and exact stop

The temporary observer invoked powershell.exe -NoProfile -File backend/scripts/r02-pg-gate.ps1 -Suite src/scripts/__tests__/v1-contract.pg.test.js -Filter '.*', alongside a separate job sampling pg_stat_activity and pg_locks on only the new disposable DB at a nominal 3-second cadence. Captured fields include state, wait_event_type, wait_event, query, xact_start, query_start, pg_blocking_pids and lock identities/modes/granted. A successful sample can take longer than the cadence. The observer source is retained locally as .batch5a-closeout-observer-source.log, not committed.

Actual gate output for standalone iteration 1:

```text
migrations: [migrate] all migrations completed (130 applied, 0 already applied)
PASS src/scripts/__tests__/v1-contract.pg.test.js (14.85 s)
  every documented (method, path) answers with a JSON envelope when called (3914 ms)
Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
Time:        15.456 s, estimated 61 s
container erp-r02-gate-20261017150911 removed; exit=0
```

There were 19 samples, 12:09:15.036468 through 12:10:09.621997 UTC. No sampled activity had blockers or a Lock wait; no sampled lock was ungranted. Six granted advisory-lock observations occurred during migrations, before the 12:10:07.300Z manual-sweep request. One migration session was briefly idle in transaction on SELECT pg_get_serial_sequence($1, $2) AS seq; the migrations completed. The last sample shows an idle session whose last query selects open expiring-material alerts and an active rate-limit insert waiting on WALSync. No hung query was reproduced or terminated. Expected route-probe validation SQL errors (for example invalid date '1') appear in the passing log; they are not evidence of the historic timeout.

**Two operational attempts failed, so STOP; no third attempt.** Attempt 1's actual suite passed, but my temporary observer's Docker Go-template quoting was wrong: the native command interpreted volume as an undefined template function. That error surfaced at Receive-Job after Jest completed and interrupted observer cleanup. The activity log was still captured; I inspected the exact container mount separately, corrected only the temporary helper's mount query to parse JSON, and removed the owned volume. Attempt 2 then failed before migration/Jest because the gate selected Windows-excluded port 55930. The wrapper's stop-on-native-stderr behavior left its second output log empty; the full tool-emitted errors are preserved verbatim below and in .batch5a-closeout-errors.log. Both are operational failures, not two failed v1 assertions. Conservatively applying the user stop condition means no further diagnostic or full-suite attempt in this session.

```text
Attempt 1 observer failure AFTER a passing PG suite:
template parsing error: template: :1: function "volume" not defined
At D:\The Osiris Labs\Construction_ERP\.batch5a-closeout-tools.ps1:55 char:5
+     Receive-Job $sampler
+     ~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (template parsin...me" not defined:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
    + PSComputerName        : localhost

Attempt 2 startup failure BEFORE migrations or Jest:
START diagnose-2 2026-10-17T12:10:30.2924087Z
powershell.exe : docker: Error response from daemon: ports are not available: exposing port TCP 127.0.0.1:55930 ->
127.0.0.1:0: listen tcp4 127.0.0.1:55930: bind: An attempt was made to access a socket in a way forbidden by its
access permissions.
At D:\The Osiris Labs\Construction_ERP\.batch5a-closeout-tools.ps1:49 char:5
+     & powershell.exe @args2 2>&1 | ForEach-Object { "$_" } | Out-File ...
+     ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (docker: Error r...ss permissions.:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
```

Read-only diagnosis command netsh interface ipv4 show excludedportrange protocol=tcp returned:

```text
Start Port    End Port
27339         27339
50000         50059 *
55916         56015
56143         56242
56243         56342
56432         56531
56532         56631
* - Administered port exclusions.
```

55930 is within 55916-56015. r02-pg-gate.ps1 selects an unchecked random port in 55000-57999. This proves the startup conflict only; it does not explain the historic running-test timeout. No host port reservation was changed, and no runner/source fix or further retry was made after the stop.

Standalone iterations: 1 PASS (1 suite / 10 tests); 2 SETUP FAILURE (0 migrations/suites/tests executed); 3-10 NOT RUN. The requested ten-iteration reproduction is incomplete. Exact historic timeout root cause remains UNPROVEN; no source/test defect causing that timeout was proven, and no source/test fix was made. The requested fix-size threshold was not reached.

## Current gate table (historical results do not count)

| Gate | Suites / tests / checks executed in this session | Result / v1-contract |
|---|---|---|
| Full PG 1 | 0 / 0 | NOT RUN; v1 NOT RUN |
| Full PG 2 | 0 / 0 | NOT RUN; v1 NOT RUN |
| Full PG 3 | 0 / 0 | NOT RUN; v1 NOT RUN |
| Full PG 4 | 0 / 0 | NOT RUN; v1 NOT RUN |
| Full PG 5 | 0 / 0 | NOT RUN; v1 NOT RUN |
| Docker backend test stage | 0 / 0 | NOT RUN; no cache-hit or PG-skip result claimed |
| Disposable golden -Reconcile | 0 checks | NOT RUN; no fixture seed executed |
| Backend mocks | 0 / 0 | NOT RUN |
| Frontend CI tests | 0 / 0 | NOT RUN |
| i18n:check / i18n:parity | 0 checks | NOT RUN |
| Backend lint:guards | 0 checks | NOT RUN |
| Frontend lint:api | 0 checks | NOT RUN |
| Root CI build | 0 builds | NOT RUN |

The preceding checkpoint's full-PG results (93/1982 PASS, 93/1982 PASS, 92 passed + 1 failed suites / 1981 passed + 1 failed tests, then two unrun) remain historical. This session has zero consecutive complete full-PG passes. No post-diagnosis gate is green by inference.

## Docker, pilot, cleanup and evidence

Initial sandbox info failed with pipe access denied; outside-sandbox docker info --format '{{.ServerVersion}}' returned 28.3.2, exit 0, within the 30-second bound (0.275 s). No Docker/WSL restart. Permitted pilot compose ps -a showed db/backend/frontend healthy, Up 15 minutes initially and Up 18 minutes finally; migrate Exited (0). HTTP 127.0.0.1:8090 returned 200 before and after. No start was needed. No pilot build/up/down/rm/recreate/seed/exec; no direct sweep-clone/demo operation.

Before: 25 containers / 595 volumes / 8 networks. Successful diagnostic container erp-r02-gate-20261017150911 removed by the runner. Its mount ae24e16beb2fa27818e4a005d237644b5b199bbd93de4913c7a02c0ec5ea2eb4 was inspected on that exact container, then removed by exact name. The failed startup left no new container but one anonymous volume a9fd534be2e47d4e8fd031107c48741cf3f89f15bd45b806792c95ca6fae5b6e: absent from baseline, CreatedAt 2026-10-17T12:10:31Z matching attempt 2, anonymous label, no attachments. Removed by exact name after those checks. No uncertain pre-existing resource removed; no prune or network removal.

Final command output:

```text
containers before=25 after=25 exact_name_differences=0
volumes before=595 after=595 exact_name_differences=0
networks before=8 after=8 exact_name_differences=0
HTTP status: 200
```

Local ignored evidence: .batch5a-closeout-diagnose-1.log (unfiltered gate); .batch5a-closeout-diagnose-1-activity.log (full SQL snapshots); .batch5a-closeout-diagnostic-summary.log; .batch5a-closeout-errors.log; .batch5a-closeout-port-exclusions.log; .batch5a-closeout-inventory-{before,stop,after}.log; .batch5a-closeout-pilot-final.log. The empty diagnose-2.log is explicitly not a passing result. Reconstructed error log contains the complete tool-emitted failure text, with no credentials present. SHA256: gate E020B3503F987AE9A2DCBF238B50BC2F642690F095067FA7A62353AD63230E9B; activity F6510DE5ADBDBFC035178A496518C5669B4E1931FA29A5E42F4A2D7B3B0D6C6B; errors 57C1EB52F7B7812817AB5BA319E70617A49CA57A81332F27D3F5342B32A47B49.

## Modified files, limits and next action

Only STATE.md, docs/CLOSEOUT_PROGRESS.md, docs/CLOSEOUT_LOG.md and this report are changed for the checkpoint. Temporary helper was removed after preserving its source as an ignored log. git diff cc1a3ea -- backend frontend package.json package-lock.json docker-compose.yml returned empty. No new dependency, external adapter/service, external message, environment-file read/edit or secret output. Both excluded review reports remain ignored, untouched and unstaged. Branch push is not authorized by the gate condition because all gates have not passed.

Documentation verification output: git diff --check -> exit 0; git diff --cached --check -> exit 0; staged name list exactly the four scoped documents; staged name list for the two excluded review reports -> empty; git ls-files --eol -> all four i/lf w/lf; byte check -> CR_bytes=0 for each. git check-ignore returned both excluded review paths. Final restage and cached whitespace check precede commit. These checks are not product gates.

Needs your decision: scratch_pdf.txt remains tracked with i/crlf w/crlf; it was neither read, modified nor deleted. Native Arabic/human RTL review, exports, deployed UAT and production GO are not established by these checks.

Next authorized resume: correct the temporary observer's native-error capture; select a known available, non-excluded loopback port for each disposable runner (a narrowly scoped runner correction may be proposed from the proven port conflict). Do not change Windows reservations. Finish the standalone sampled reproduction before any full-suite rerun, then make a failing-first narrow timeout fix only if evidence proves one. With no proven timeout defect, change no source/test. Run FIVE consecutive complete PG gates on separate disposable DBs, Docker test stage, disposable golden and all requested host gates; stop on any failure and diagnose, with two failed attempts requiring STOP. Commit scoped evidence with the supplied trailers, and push only after every required gate passes.

---

# Historical checkpoint at 7d15806 (superseded above)

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
