# R3 ledger and database performance evidence

## R3.0 baseline — 2026-10-15

This evidence was captured before any R3 implementation change. Findings are limited to REV-004, REV-005, and REV-016 in `docs/REVIEW_REPORT_2026-10-14.md`.

The repeatable baseline is `backend/scripts/r3-performance-gate.ps1`, which starts a loopback-only, disposable PostgreSQL 16 container, applies the current migration set, runs `backend/src/scripts/r3-performance-baseline.js`, and removes the container. The benchmark requires `APP_ENV=test`, the exact database name `erp_r3_perf_test`, loopback `DB_HOST`, and credentials generated in the runner process. It does not load `.env` or retain credentials. The original R3.0 run used no payment/allocation rows; R3.2 extends the same benchmark with one payment and one allocation for each invoice, making the after measurement representative of settlement joins.

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

### R3.1 — journal balance validation and parent index

Migration `0065_journal_balance_statement_check.sql` adds `idx_journal_entry_lines_journal_entry_id`. Three statement triggers collect distinct old/new journal entry IDs into a transaction-keyed queue. A deferred constraint trigger checks each queued entry once at commit, using the new index, then removes the queue row. The prior deferred row trigger and function are removed. This preserves deferred multi-statement posting and rejects invalid final balances.

Focused command through the tracked runner: `powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/r02-pg-gate.ps1 -Suite src/scripts/__tests__/journal-balance-statement.pg.test.js -Filter '.*'` — **PASS**, 1/1 suites and 6/6 tests, 127 migrations, simulated 0064-to-0065 migration through the real migration runner; container `erp-r02-gate-20261015050355` removed, exit 0. Coverage includes separate statements in one transaction, rejected insert rollback, old/new parent tracking on UPDATE, rejected DELETE rollback, bulk insert, and an upgrade path with the old 0064 row trigger restored first.

The identical 300,000-line benchmark workload ran with the new trigger active and balanced validation at commit: bulk insert plus deferred balance commit **3,116.99 ms**; all three entries balanced. The journal lookup changed from a parallel sequential scan (13.933 ms, 1,911 shared-buffer hits) to `idx_journal_entry_lines_journal_entry_id` index scan (14.594 ms, 717 hits). On this all-cached local run, elapsed lookup time is similar, while buffers fell 62.5% and the plan reads only the selected entry's 100,000 lines. This measured result does not imply a timing improvement for an entry containing 100,000 lines; the index removes reads of unrelated entries and supports the balance trigger as the ledger grows.

The same run still uses sequential scans for invoice list (17.746 ms), open invoice aggregate (19.159 ms), active project POs (14.156 ms), and commitment count (5.810 ms). These remain R3.2/R3.5 work. Container `erp-r3-perf-20261015050435` removed; 127 migrations; exit 0.

R3.2–R3.6 remain open. R4 has not started.

### R3.2 — aggregate AR/AP ageing

`financeEngine.arAging` and `apAging` now use one grouped SQL query each. Allocation totals are grouped once and left-joined to invoices, outstanding values and overdue buckets are calculated in PostgreSQL, and the existing JavaScript service response shape is preserved. `finance.test.js`'s local MockDb handles the new query contract. The PostgreSQL equivalence test runs the previous per-invoice calculation as a reference against seeded boundary dates (0/30/31/61/91 days, future and null dates), net-amount fallback, credits, multiple allocations, voided allocations, and excluded statuses.

Verification: focused finance PG suites **PASS 2/2 suites, 10/10 tests**, 127 migrations, including AR/AP old-vs-new equivalence and existing finance flows; container `erp-r02-gate-20261015050826` removed, exit 0. Existing finance unit suite **PASS 1/1 suite, 14/14 tests**. Golden reconciliation after the aggregate change **PASS 16/16**, zero violations; container `erp-r02-gate-20261015051032` removed, exit 0.

With 150,000 invoices, 150,000 payment rows, and 150,000 allocation rows, the AR aggregate service measured **300.63 ms** and the four parallel data calls used by the cash-flow route (AR, AP, client retention, subcontractor retention) measured **309.87 ms**. This local query-path timing excludes HTTP auth and serialization. It is below the plan's 1-second data-path target; the prior route observation was 97.6 seconds at 150,000 invoices. The performance container `erp-r3-perf-20261015051206` was removed; 127 migrations; exit 0.

R3.3–R3.6 remain open. R4 has not started.

### R3.3 — source-backed commitments and read-only GETs

`commercialEngine.projectCommercial` and `budgeting.listCommitments` now read the commitments ledger without scanning or mutating POs/subcontracts. Migration `0066_commitment_source_backfill.sql` reconciles existing source-linked rows, inserts missing active PO/subcontract commitments with deterministic numbers, and seeds the atomic `document_counters` scope. New source changes synchronize the ledger in the same transaction: PO issuance and cancellation, and incorporated subcontract variations. PO issue/cancel and subcontract creation write their outbox events through the same transaction query client.

The existing PG fixture now seeds its source-backed commitment instead of relying on GET self-healing. Coverage also verifies an active but unledgered source remains untouched after commercial/budgeting reads, the row/timestamp snapshot is unchanged, and 20 concurrent commitment GETs all return 200. The procurement flow checks that issuance commits both the ledger row and `purchase_order.issued` event; subcontract creation checks `subcontract.created` in the outbox.

Focused command: `powershell -ExecutionPolicy Bypass -File backend/scripts/r02-pg-gate.ps1 -Suite src/scripts/__tests__/commercial-5-5.pg.test.js,src/scripts/__tests__/procurement-flows.pg.test.js` — **PASS**, 2/2 suites / 28/28 tests, 128 migrations; container `erp-r02-gate-20261015052205` removed; exit 0. `node --check` passed for changed modules and tests; `rg -n "syncCommitments" backend/src` found no references.

R3.3 complete. R3.4–R3.6 remain open. R4 has not started.
### R3.4 — CM numbering concurrency and rollback

`commitment-numbering.pg.test.js` exercises 20 concurrent source syncs through the same ledger helper used by PO source transactions. All 20 allocated distinct CM numbers. A separate source row is synced and then intentionally rolled back: no commitment remains and the next committed retry receives the same number, confirming the counter and ledger insert share the caller transaction. The existing numbering suite also runs its 50-way first-use, seeded-scope and rollback checks.

Focused command: `powershell -ExecutionPolicy Bypass -File backend/scripts/r02-pg-gate.ps1 -Suite src/scripts/__tests__/commitment-numbering.pg.test.js,src/scripts/__tests__/numbering.pg.test.js` — **PASS**, 2/2 suites / 9/9 tests, 128 migrations; container `erp-r02-gate-20261015052406` removed; exit 0. R3.4 complete; R3.5–R3.6 remain open. R4 has not started.
### R3.5 — ranked FK and query indexes

The disposable catalog audit ranks missing full leading indexes by referencing table row estimates. Before 0067 it found 481 uncovered FK constraints / 483 FK columns. Largest seeded relations were `journal_entry_lines` (300k, `account_id`), `invoices` (150k, seven remaining FK columns), `payments` (150k, seven), `payment_allocations` (150k, two), and `purchase_orders` (100k, five). Review examples also identify `project_costs.project_id` as a dashboard/cost-view candidate. Fresh, unseeded tables show estimate `-1`; the report labels this limitation instead of ranking them as measured high-volume tables.

Migration `0067_r3_ranked_query_and_fk_indexes.sql` adds six indexes: `invoices(created_at DESC) INCLUDE (id, invoice_number, amount)` for the measured list; `purchase_orders(project_id, created_at DESC, id DESC) INCLUDE (status, total_amount)` for the scoped PO list and FK; `project_costs(project_id, transaction_date DESC, id DESC) INCLUDE (amount, cost_code_id)`; plus full leading indexes on `journal_entry_lines.account_id`, `payments.supplier_id`, and `payment_allocations.supplier_invoice_id`. Five FK columns are thereby covered. The post-migration audit reports 476 constraints / 478 FK columns still uncovered. The broader inventory remains ranked for future targeted batches; this migration does not index every FK.

Same workload and runner before/after: invoice list changed from parallel sequential scan at 17.429 ms / 2,765 shared-buffer hits to an index-only scan at 0.041 ms / 5 hits. The active PO filter/limit changed from parallel sequential scan + sort at 13.508 ms / 1,681 hits to index-only scan at 0.055 ms / 5 hits. The exact 200-row project PO route query uses the new index at 0.070 ms / 8 hits. The open-invoice amount aggregate still favors a parallel sequential scan (18.599 ms after vs 19.265 ms before); its candidate index was removed before finalizing 0067 because it did not improve the plan. AR service measured 280.53 ms, and the four-query cash-flow path 325.70 ms. These are local cached test-database measurements, not production latency guarantees.

Pre-index gate: 128 migrations, container `erp-r3-perf-20261015052719` removed. Post-index gate: 129 migrations, container `erp-r3-perf-20261015052930` removed. Index assertion suite passed 1/1 test with 129 migrations; container `erp-r02-gate-20261015053020` removed. R3.5 complete; R3.6 final gate batch remains. R4 has not started.