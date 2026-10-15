# R3 closeout scorecard

Date: 2026-10-15. Scope: findings REV-004, REV-005 (a-c), and REV-016 from the 2026-10-14 review. All measurements are from loopback-only disposable PostgreSQL 16 containers using the tracked gates; they are local benchmark results, not production latency commitments.

| Finding | Before | After | Verification | Implementation commit(s) |
|---|---|---|---|---|
| REV-004 — journal entry balance validation and line lookup | Row-level deferred validation rescanned entry lines; lookup used a parallel sequential scan at 13.933 ms / 1,911 shared-buffer hits. | One transaction-level deferred check per affected entry; indexed lookup plan at 14.876 ms / 717 hits. Cached elapsed time is similar; buffer hits fell 62.5%. Bulk insert plus validation of 300k lines: 3,160.56 ms, all entries balanced. | Focused journal balance suite PASS 6/6; full PG suite PASS 81/81 and 1,884/1,884; migration 0064-to-latest verified. | `e0069a1` |
| REV-005a — AR/AP aging and cash-flow data path | At 150k invoices, cash-flow GET was observed at 97.6 s; old aging work performed per-invoice allocation queries. | SQL aggregates: final AR service 302.18 ms; four-call cash-flow data path 332.16 ms on 150k invoices/payments/allocations. Timings exclude HTTP auth and response serialization. | Old-vs-new PG equivalence covers date boundaries, credits, allocations, voids, fallbacks, and statuses; full PG suite PASS. | `d084204` |
| REV-005b — commitment ledger reads and dashboard behavior | Company dashboard did not respond within 304.9 s; GET wrote 75k commitments. | Seven enumerated commercial/finance GET handlers returned 200 with zero INSERT/UPDATE/DELETE/TRUNCATE SQL; an active unledgered PO remained untouched. A 75k-row ledger read measured 230.13 ms. Source changes update commitments in their source transaction. | Route-enumerating PG guard PASS; 20 concurrent GET requests PASS; full PG suite PASS. Service data-path timing does not claim complete HTTP dashboard latency. | `be1935a`, `f099ad2`, `fc54b6b` |
| REV-005c — concurrent commitment numbering | Concurrent commitment GETs returned duplicate-number 409 in 15/15 observed rounds. | Twenty concurrent PO commitment source syncs yielded 20 distinct CM numbers; intentional source transaction rollback left no commitment and the retry reused the rolled-back number. | Real-PG commitment numbering and existing 50-way counter suite PASS 2/2 suites, 9/9 tests; full PG suite PASS. | `de00cd8` |
| REV-016 — query plans and foreign-key index coverage | Invoice and PO lists used sequential scans and sorts: 17.612 ms / 2,765 hits and 14.841 ms / 1,681 hits. Review catalog had 472 uncovered FK columns. | Invoice list 0.070 ms / 5 buffers; active PO list 0.085 ms / 5 buffers; exact 200-row PO list 0.091 ms / 8 buffers. Five selected FK columns are now indexed. Current schema audit ranks all 478 remaining uncovered FK columns in `docs/R3_FK_INDEX_PLAN.md`. | Repeatable R3 performance gate PASS; index assertions and 0064-to-0067 upgrade test PASS; full PG suite PASS. | `f49b525`, `010e110` |

## Final gates

- Backend mock: PASS, 60 suites / 1,059 tests.
- Real PostgreSQL: PASS, 81 suites / 1,884 tests, 129 migrations.
- Frontend: PASS, 32 suites / 131 tests.
- Localization: `i18n:check` and parity PASS, 35 namespaces / 1,288 English keys.
- Lint guards: PASS.
- Root CI production build: PASS.
- Golden reconciliation: PASS, 16/16 checks, zero violations, 129 migrations.
- `git diff --check`: PASS before final documentation commit.

## Explicit limits

- **NOT VERIFIED:** a trial-balance HTTP GET endpoint was not found in the route inventory. The SQL aggregate over 300k journal lines measured 28.906 ms, which does not establish endpoint behavior or latency.
- **NOT VERIFIED:** complete HTTP latency for aging and cash-flow routes after authentication, middleware, and JSON serialization. Recorded after-times are service/data-path measurements.
- **NOT DONE:** promote more of the 478 residual FK candidates without representative workloads or measured query/delete plans. The complete ranking and the unknown-volume limitations are in `docs/R3_FK_INDEX_PLAN.md`.
- **NOT DONE:** optimize the broad open-invoice aggregate. PostgreSQL continued to choose a parallel sequential scan at 18.160 ms for the 50%-selective fixture; the trial index was removed.
- R4 was not started.
