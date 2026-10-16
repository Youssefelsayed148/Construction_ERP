# Batch 1 scorecard - data integrity and API contract

As of 2026-10-16. Findings below are based on current command output. Full exit gates are pending unless recorded as PASS.

| Finding | Before | After | Test / evidence | Commit |
|---|---|---|---|---|
| 1.1 PO delivered/accepted reconciliation | Reconciliation summed cancelled delivery lines and counted returned posted-GRN quantity; one seeded row reported stored 4/1 vs legacy aggregate 9/2. | Check excludes cancelled/voided deliveries, excludes non-posted GRNs, and subtracts returned quantity. No historical rows were changed; no migration needed. | Focused throwaway PG `reconcile-defects.pg.test.js`: PASS 1 suite / 15 tests, 130 migrations. Printed seeded legacy violating row. Golden 16/16: NOT VERIFIED yet. | Pending implementation commit |
| 1.2 Shared pagination and route coverage | 4b routes had mixed limits/ignored offsets; 4c had unbounded collections; route test was heuristic; `/v1/webhooks` used page/per_page only and omitted total header. | Shared route helpers enforce default 200/max 1,000, clamped invalid values, stable ordering, offset and total header. Route audit enumerates mounted Express GET handlers and catches nested child lists. Webhook supports both query styles; admin reads structured v1 errors. | Pagination + route audit: PASS 2 suites / 8 tests; focused v1 pagination: PASS 5 tests; admin workspace: PASS 1 suite / 27 tests. Focused PG route smoke: PASS 1 suite / 14 tests; 448 GET routes / 0 server errors. Page-two/no-overlap/total checks cover assets, clients, suppliers, HR employees, notifications, and procurement project workspace. Focused v1 PG: PASS 1 suite / 10 tests, including webhook offset and legacy params. Other touched route-family page-two coverage: NOT VERIFIED. | Pending implementation commit |
| 1.3 Housekeeping | Existing fallback edits were uncommitted; git-less parity test absent; stray root file `tatus --short`. | Git and fallback scanner parity regression added; stray file removed; audit reports remain unstaged. | Password guard test: PASS 1 suite / 9 tests; `lint:guards`: PASS. | `4527166` |
| Batch exit gates | Current batch baselines not re-run. | Backend mock 65/65 suites, 1,087/1,087 tests; full PG 84/84 suites, 1,904/1,904 tests at 130 migrations; golden 16/16 with zero violations; `lint:guards`, `lint:api`, and root build pass. | Commands: backend `npm.cmd test -- --runInBand --no-colors`; PG gate `-All`; PG gate `-Reconcile`; `npm.cmd run lint:guards`; frontend `npm.cmd run lint:api`; root `npm.cmd run build`. The full PG pass preceded the addition of one separately passing v1 webhook test; no application code changed after the full PG pass. | Pending implementation commit |

## NOT DONE / NOT VERIFIED

- Real PostgreSQL page-two assertions have not yet been added for every touched route family. Existing focused coverage proves the shared helper and the six listed route families above; all other route families are NOT VERIFIED for page-two/no-overlap/total behavior.
- Page-two/no-overlap/total checks remain missing for several touched route families beyond the seven named above. The required exit gates are now verified.

## Decisions waiting

- None.
