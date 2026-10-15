# R4 Evidence

## R4.0 baseline - 2026-10-15

Captured before R4 fixes on a fresh, disposable PostgreSQL 16 database. Hardware/runtime: Windows x64; Node v24.14.0; Intel Core i7-12650H; 16 logical CPUs; 15.63 GiB RAM. Seed row counts: projects 0, users 0, invoices 0. The run used ten simultaneous invalid-credential requests so password comparison was measured without writing user data; expected auth failures were 10/10. Login rate is a local baseline signal, not a production load guarantee.

Tracked command: `powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/r02-pg-gate.ps1 -R4Baseline` — PASS, 129 migrations applied to fresh DB, disposable container `erp-r04-baseline-20261015144017` removed, exit 0. The runner is repeatable and uses generated process-only credentials plus loopback binding. One earlier run exposed an invalid probe order (the first server was stopped before its limiter requests); that run is excluded. The corrected run below sent all two-instance requests while both servers were live.

| Probe | Measured result |
|---|---|
| Login burst | 10/10 expected 401; 2,184.8 ms total; 4.58 requests/s (review reference 4.6/s); monitorEventLoopDelay p95/max sample 809.50 ms |
| Pool saturation | pool max 20; 24 concurrent 200 ms queries; peak waiting 4; 430.0 ms total; afterward waiting 0, idle 20 |
| SIGTERM mid-request | sent 50 ms after login request began; client ECONNRESET; process exited on SIGTERM; no drain handler |
| Slow query without statement timeout | `pg_sleep(500 ms)` succeeded in 502.7 ms; `statement_timeout=0` |
| Client disconnect | HTTP login client aborted at 50 ms and received ECONNRESET; no server error was logged. Direct pool-client release during `pg_sleep(2)` showed backend still active and query unfinished at release. The work was not cancelled. |
| Two-instance limiter | 21 requests total across two live processes (10 + 11), combined above the configured per-process limit 20; all 21 were admitted to password comparison and returned expected 401; no 429. Limit is process-local. |
| Sweep immediate rerun | two sequential leader calls in one process invoked the sweep twice; no minimum interval |

`backend/server.js` includes event-loop monitoring only when `R4_BASELINE_ID` is set; it exists solely to measure this baseline and emits no credentials. Migration head remains 0067 (129 migrations). No R4 implementation fix or migration was included in this ticket.

Earlier prerequisite attempt: sandbox Docker version and runner access were denied/unavailable. After the user-authorized elevated path was used, `docker version` reported 28.3.2 and the repeatable baseline completed as recorded above.
