# R4 Capacity and Operations Scorecard

Status: **R4.0 baseline complete; R4.1–R4.6 NOT VERIFIED**. No implementation finding is closed.

| Finding | Before | After | Test / evidence | Commit |
|---|---|---|---|---|
| R4.0 baseline | 4.58 login req/s; loop lag p95/max 809.50 ms; pool waiting peak 4/20; no statement timeout; SIGTERM resets in-flight login; client work continues after disconnect; 2/2 sweep reruns | Measurements captured, no fix | `-R4Baseline` PASS, 129 migrations, container removed; details in `docs/R4_EVIDENCE.md` | Pending R4.0 commit |
| REV-006 password capacity | 4.58 login req/s; loop lag p95/max 809.50 ms | NOT VERIFIED | No implementation test run | None |
| REV-013/015 resilience and metrics | pool max 20; no query timeout; SIGTERM reset; client disconnect did not cancel work | NOT VERIFIED | R4.0 baseline only; resilience tests pending | None |
| REV-014 shared limiter and sweep safety | 21 requests across two processes, no 429 at per-process limit 20; two immediate sweep invocations both ran | NOT VERIFIED | R4.0 baseline only; shared-state implementation/proof pending | None |
| REV-015 list pagination | Review enumerated 73 list endpoints | NOT VERIFIED | Route census and frontend impact inventory pending | None |

**Owner decisions waiting:** none recorded for R4. **NOT VERIFIED:** R4.1–R4.6 and all R4 exit gates. Commit the R4.0 baseline before starting R4.1.
