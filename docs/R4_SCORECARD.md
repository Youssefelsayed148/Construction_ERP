# R4 Capacity and Operations Scorecard

Status: **R4.0 baseline complete; R4.1–R4.6 NOT VERIFIED**. No implementation finding is closed.

| Finding | Before | After | Test / evidence | Commit |
|---|---|---|---|---|
| R4.0 baseline | 4.58 login req/s; loop lag p95/max 809.50 ms; pool waiting peak 4/20; no statement timeout; SIGTERM resets in-flight login; client work continues after disconnect; 2/2 sweep reruns | Measurements captured, no fix | `-R4Baseline` PASS, 129 migrations, container removed; details in `docs/R4_EVIDENCE.md` | `a4524ef` |
| REV-006 password capacity | 4.58 login req/s; event-loop p95 sample 809.50 ms | 42.12 req/s at c=10; max sampled 100 ms-window event-loop p95 23.74 ms. OWASP scrypt `N=2^15,r=8,p=3`, 32 MiB, `UV_THREADPOOL_SIZE=16`. Isolated Node 20 c=50 p95 913–969 ms; 500 ms aspiration NOT MET, full app c=50 NOT MEASURED. | Unit PASS 13 tests; real PG 2 suites / 16 tests; Node 20 parameter benchmarks; see evidence | Pending R4.1 commit |
| R4.1 legacy/hash migrations | bcryptjs password hashing on register/change/login upgrade and seeds | New/changed user passwords use tagged async scrypt; successful legacy internal and OAuth logins transparently upgrade. No password-reset endpoint exists. | `passwords.test.js`; `password-upgrade.pg.test.js`; existing token-typing; seed staging import guard | Pending R4.1 commit |
| REV-013/015 resilience and metrics | pool max 20; no query timeout; SIGTERM reset; client disconnect did not cancel work | NOT VERIFIED | R4.0 baseline only; resilience tests pending | None |
| REV-014 shared limiter and sweep safety | 21 requests across two processes, no 429 at per-process limit 20; two immediate sweep invocations both ran | NOT VERIFIED | R4.0 baseline only; shared-state implementation/proof pending | None |
| REV-015 list pagination | Review enumerated 73 list endpoints | NOT VERIFIED | Route census and frontend impact inventory pending | None |

**Owner decisions waiting:** none recorded for R4. **NOT VERIFIED:** R4.1–R4.6 and all R4 exit gates. Commit the R4.0 baseline before starting R4.1.
