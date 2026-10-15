# R3 ledger and database performance evidence

## R3.0 baseline — 2026-10-15

This evidence was captured before any R3 implementation change. Findings are limited to REV-004, REV-005, and REV-016 in `docs/REVIEW_REPORT_2026-10-14.md`.

The repeatable baseline is `backend/scripts/r3-performance-gate.ps1`, which starts a loopback-only, disposable PostgreSQL 16 container, applies the current migration set, runs `backend/src/scripts/r3-performance-baseline.js`, and removes the container. The benchmark requires `APP_ENV=test`, the exact database name `erp_r3_perf_test`, loopback `DB_HOST`, and credentials generated in the runner process. It does not load `.env` or retain credentials.

Command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/r3-performance-gate.ps1
```

Result: **PASS**, 126 migrations applied; container `erp-r3-perf-20261015045726` removed; exit 0. Fixture counts were 150,000 invoices, 100,000 purchase orders, 75,000 existing commitments, and 300,000 balanced journal lines across three journal entries. A grouped debit/credit check passed before the journal balance trigger was re-enabled. These rows exist only in the disposable benchmark database.

| Query shape | Plan before R3 changes | Actual time | Shared buffers |
|---|---|---:|---:|
| Journal line balance lookup by `journal_entry_id` | Parallel sequential scan; 50,000 matching and 100,000 rejected rows per two-worker plan | 13.933 ms | 1,911 hits |
| Invoice list ordered by `created_at DESC LIMIT 100` | Parallel sequential scan + top-N sort | 17.612 ms | 2,765 hits |
| Open invoice amount aggregate by status | Parallel sequential scan + aggregate | 18.746 ms | 2,731 hits |
| Active purchase orders filtered by project/status and sorted | Parallel sequential scan + top-N sort | 14.841 ms | 1,681 hits |
| Existing commitment `COUNT(*)` used by current `COUNT(*) + 1` allocator | Sequential scan across 75,000 commitments | 6.288 ms | 1,072 hits |

Standalone measured reads: invoice list returned 100 rows in 15.34 ms; the unbounded current project/status purchase-order query returned 100,000 rows in 67.34 ms. PostgreSQL `EXPLAIN (ANALYZE, BUFFERS, TIMING)` details are reproducible by the benchmark script, so post-fix evidence uses the same schema, fixture sizes, queries, and runner.

The review's route-level observations remain separate from this database-level reproduction: at 150,000 invoices, cash-flow GET took 97.6 s, company-dashboard did not respond within 304.9 s, and the GET wrote 75,000 commitments; concurrent commitment GETs produced a duplicate-number 409 in 15/15 rounds. R3.2–R3.4 will add application-level equivalence, read-only, and concurrency evidence.

## R3 implementation evidence

Not run yet. R3.1–R3.6 must append post-fix plans, result equivalence, GET side-effect checks, numbering concurrency results, FK-index ranking, and final exit gates here. R4 has not started.
