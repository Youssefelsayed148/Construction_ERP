# Demo verification report - 2026-10-17

Target: erp-demo-20261017 only; UI 127.0.0.1:8092; PostgreSQL 127.0.0.1:55442; construction_erp_demo. Branch closeout/batch-a-to-6; resume base e1a6adb. **Stopped during regression-evidence setup. Company demo and scripted-flow work remain incomplete.**

## Current measured gates

| Gate | Current command evidence | Result / open work |
|---|---|---|
| B: accounts | --accounts exit 0: 38 accounts, 0 created, 38 successful logins | Login/count/rerun checks PASS; complete evidence PARTIAL: password/hash/token-version comparison and expected-red baseline replay pending |
| B: guards and email contract | Focused company-demo-safety.test.js: 1 suite / 34 tests passed, 0 skipped, 3.697s, exit 0 | PASS on inherited fix; failing-first chronology not established in this session |
| C: dataset | No business seed or fresh business-count inventory executed | NOT RUN; no real document numbers to report |
| D: invariants and API sweep | 0 invariant runs; 0 all-role API sweeps; account login checks above are not an API sweep | NOT RUN |
| D: UI | 0 of 38 accounts crawled; 0 of 2 languages crawled | NOT RUN; React crashes and HTTP 500 totals unmeasured |
| E: scripted flows | 0 procure-to-pay, 0 RFQ deviation, 0 approval-limit, 0 project-isolation flows | NOT RUN; expected 403/400/200 assertions and both team-route regressions pending |

No allowlisting, timeout increases, skipped guards or validation weakening. No unrun gate is represented as passing.

## Diagnosis and scope

The frontend container intentionally exposes PG port 55442. Its credential-free nginx stream server forwards port 5432 to db:5432, while database/backend remain on the internal-only network. Historical first ECONNREFUSED was caused by host ingress missing from that network layout; existing checkpoint evidence reports :0 host mappings, internal API ready, then successful DB/API connectivity after ingress correction. This session inspected the current mapping; it did not deliberately break the working configuration to reproduce the old failure.

The seeder creates role accounts through the real authenticated POST /api/auth/register route. Both registration and login validate email with Joi.string().email().required(). The inherited change consistently uses demo-<rolekey>@demo.example.com in initializer, reset roster and Compose bootstrap. It does not change auth validation. Bootstrap still uses the application's existing migration path. No raw SQL account/business creation occurs in this continuation.

At session start, ignored stage-1.json reported 38 accounts, 37 created, 38 logins from the previous continuation. A current --accounts execution verified 38 accounts, created 0, logins 38, canonical 33, compatibility/safety 5, externalSends 0, rawSqlWrites 0. It refreshed stage-1.json. The ensureRecord existing-account branch performs no registration/password update; independent pre/post hash and token-version equality remains unmeasured. External, unassigned and expired seats have not been configured for the intended project-isolation scenarios.

Docker version output: 28.3.2. Initial runtime services were Exited 255; the guarded --up command exited 0 without build or pull. Final inspected demo db/backend healthy, frontend Up, migrate Exited 0. Current netsh exclusions do not include 8092 or 55442. No reset was performed in this session; do not infer one from the inherited code or previous result artifact. No pilot/clone command, restart, rebuild, smoke or query was performed.

## Stop evidence

Two attempts to reconstruct baseline expected-red evidence failed during setup:

1. Inline node -e: Windows argument quoting removed JavaScript quotes; SyntaxError: Unexpected token ':'; exit 1, before baseline execution.
2. After inspecting the command and moving it into a JavaScript file: node .scratch-company-demo/resume-accounts.js --baseline -> Account verification failed; raw details withheld; exit 1. The catch hides the error name/code from the Git/module-evaluation path. Exact second cause is unproven. This is not an expected-red test result, not proof of a regression, and not an automatic approval-review rejection.

The requested two-failure STOP applies. No third attempt or downstream business seed/sweep/flow was executed. The scratch helper is excluded locally and must not be committed.

## Next action and limitations

In a new authorized continuation, inspect the helper without executing it, preserve only safe error name/code diagnostics and obtain e1a6adb source with native PowerShell Git rather than a Node child process. Establish a real failing email-contract regression against that baseline, rerun current focused tests, then verify account IDs/hash/token versions unchanged around a guarded rerun without printing them. Finish and commit the accounts evidence, then implement API/service-only idempotent business seed with timestamp-only SQL backdating, project seats, dataset counts/document numbers, invariants, all-role API and EN/AR UI sweeps, and maker/checker scripted flows. Use exact demo target guards throughout.

Batch 5A is **functionally complete, gates deferred**, not closed. Full PG acceptance, backend Docker test stage, disposable golden verification, five-run v1-contract/token-typing acceptance and the remaining full mocks/frontend/i18n/guards/API-lint/build gates in STATE.md remain OPEN. None ran here. Financial reconciliation, S-001 client-receipt isolation, S-005 React regression, native Arabic/RTL review, UAT and finance sign-off remain unverified. Production remains NO-GO.

No dependencies, application routes, migrations, .env, production, pilot, clone, external adapters, messages, paid services, legacy role switch, push, PR or deployment were changed/used. Only the authorized ignored demo artifacts were consumed by guarded demo commands; no secret values were printed or staged.

Pre-commit hygiene: git diff --cached --check exit 0; exactly 9 scoped files staged, all i/lf and w/lf. Ignored credentials/scratch and excluded review reports absent from index.
