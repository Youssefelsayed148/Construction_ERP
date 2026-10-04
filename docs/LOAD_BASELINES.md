# Load baselines (Phase 4 / B11)

No thresholds set (plan rule) — these are `docs/LOAD_BASELINE_2026-10-04.json` (raw percentiles),
measured on this workstation against the throwaway Postgres 16 container with the real app.
Re-run with:

```bash
cd backend
CONFIRM_THROWAWAY_DB=true LOAD_TAG=<label> LOAD_PORT=5130 node src/scripts/load-profiling.js
```

The script refuses to run unless `CONFIRM_THROWAWAY_DB=true` (the DB_* env must point at a
throwaway container), boots its own app instance, creates and deactivates its own load user, and
writes the raw numbers to `docs/LOAD_BASELINE_<date>_<tag>.json`.

## 2026-10-04 baseline (throwaway container, app in-process, concurrency ladders c1/c4/c8, 5 calls per level)

| Target | c1 p50/p95 | c4 p50/p95 | c8 p50/p95 | statuses |
| --- | --- | --- | --- | --- |
| dashboard portfolio | 14 / 54 ms | 15 / 37 ms | 15 / 19 ms | all 200 |
| dashboard project overview | 27 / 33 ms | 16 / 22 ms | 22 / 38 ms | all 200 |
| dashboard alerts | 14 / 20 ms | 8 / 14 ms | 10 / 13 ms | all 200 |
| list purchase requisitions (/api/v1 family) | 17 / 27 ms | 12 / 15 ms | 22 / 26 ms | all 200 |
| list invoices | 10 / 33 ms | 13 / 25 ms | 24 / 36 ms | all 200 |
| list items | 15 / 17 ms | 9 / 26 ms | 16 / 20 ms | all 200 |
| three-way match (record supplier invoice) | 18 / 38 ms | 12 / 23 ms | 18 / 27 ms | all 201 |
| MCP get_inventory_status (POST /api/mcp) | 15 / 16 ms | 4 / 17 ms | 9 / 17 ms | all 200 |
| replenishment sweep (service, full catalog) | 2075 ms single run | — | — | — |

Machine and dataset caveats: single-user latency on a workstation, a Thin catalog (the test-debris
catalog of the throwaway DB plus tagged rows), no think time. Treat these as smoke floors, not
capacity numbers; the first real-data load run (Phase 11 preparation, restored-copy) should re-run
this script and append its table here.

## Found while profiling

- `GET /api/dashboard/project/:id` answered **500** (`dashboard_section_failed`) for a
  non-integer id — the id was passed to SQL raw. Fixed in the same PR: non-integer/invalid ids
  now answer 400 before any query runs (the A2.4 no-catch-to-zero guard is untouched; a real
  section failure still surfaces with `error_code dashboard_section_failed`).
