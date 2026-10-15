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

## R4.1 password hash choice and after measurement

The password service uses the OWASP Password Storage Cheat Sheet's listed scrypt set `N=2^15, r=8, p=3` (32 MiB working memory), with Node `maxmem=64 MiB`, a random 16-byte per-password salt, a 64-byte key, and timing-safe comparison. See [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). The selected set took 140.7 ms for a single hash in the initial local benchmark. On production Node `v20.20.2`, 50 concurrent derivations completed in 1,009.3 ms with `UV_THREADPOOL_SIZE=16` (50 concurrent hash calls consume up to 512 MiB at 16 active workers). A 16-worker pool was selected to match the 16 logical CPUs; the same Node 20 measurement was slower at 32 workers (1,036.3 ms) and default four workers took 2,271.5 ms. Larger OWASP-listed sets did not improve latency at concurrency 50 on this host; the chosen set is the best-performing 32 MiB option measured.

The production Docker image now sets `UV_THREADPOOL_SIZE=16`; the R4 PG runner also sets it before starting Jest. No dependency was added. The app's 10-request invalid-login burst on the same Windows host measured 42.12 requests/s after the change vs. 4.58 requests/s before. The baseline event-loop reporter's p95 sample was 809.50 ms; after scrypt, the maximum sampled 100 ms-window p95 was 23.74 ms. Reporter windows changed from one second to 100 ms so the shorter burst was sampled. Both runs returned the expected 10/10 generic 401 responses.

At c=50 in the isolated production Node 20 crypto benchmark, this OWASP-listed set's hash-completion p95 was 913.2 ms; the review's aspirational login p95 target of 500 ms is **not met by this isolated high-concurrency hash benchmark** on this host. The full app was not measured at c=50 after the change. The lower-memory OWASP option (N=2^13,r=8,p=10) still measured 700.3 ms p95 at c=50 with 32 workers, so it did not meet that target either. Do not claim the c=50 target passed.

Focused verification: mock password/auth/lockout tests PASS 3/3 suites / 13 tests; seed-staging import guard BEFORE 1 failed / 3 passed because module import loaded `.env.docker`, then AFTER 1 suite / 4 tests passed after moving dotenv loading into the script's `main`; real PG password-upgrade plus token-typing suites PASS 2/2 / 16 tests at 129 migrations, container `erp-r04-gate-20261015144957` removed. Coverage includes bcrypt legacy login and OAuth grant upgrades, wrong password, current format, timing-safe compare, password change, audit, and no direct dotenv-file access during test import.

The retained `bcryptjs` use in `oauthService` verifies service-account client secrets, which are a separate credential type; user password verification calls it only for legacy bcrypt hashes through `services/passwords.js`. There is no password-reset route in the current backend; new registration, password change, initial-owner setup, and staging-seed password creation now use scrypt.
