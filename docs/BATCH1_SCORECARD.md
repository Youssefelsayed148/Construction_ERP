# Batch 1 scorecard - data integrity and API contract

As of 2026-10-16. Findings below are based on current command output.

| Finding | Before | After | Test / evidence | Commit |
|---|---|---|---|---|
| 1.1 PO delivered/accepted reconciliation | Reconciliation summed cancelled delivery lines and counted returned posted-GRN quantity; one seeded row reported stored 4/1 vs legacy aggregate 9/2. | Check excludes cancelled/voided deliveries, excludes non-posted GRNs, and subtracts returned quantity. No historical rows were changed; no migration needed. | Focused throwaway PG `reconcile-defects.pg.test.js`: PASS 1 suite / 15 tests, 130 migrations. Printed seeded legacy violating row. Golden 16/16: PASS. | `c19c2e6` |
| 1.2 Shared pagination and route coverage | 4b routes had mixed limits/ignored offsets; 4c had unbounded collections; route test was heuristic; `/v1/webhooks` used page/per_page only and omitted total header. | Shared route helpers enforce default 200/max 1,000, clamped invalid values, stable ordering, offset and total header. Route audit enumerates mounted Express GET handlers and catches nested child lists. Webhook supports both query styles; admin reads structured v1 errors. | Pagination + route audit: PASS 2 suites / 8 tests; focused v1 pagination: PASS 5 tests; admin workspace: PASS 1 suite / 27 tests. Latest focused PG GET gate: PASS 1 suite / 42 tests; 448 GET routes / 0 server failures, 130 migrations; `erp-r02-gate-20261016161710` removed. Page-two/no-overlap/total assertions cover all requested 4b/4c collection endpoints: assets/assignments/usage logs; clients; invoices/payments/expenses; items/item suppliers; suppliers/materials; legal; subcontractors; maintenance; payroll; HR employees/laborers/attendance/leaves/labor payments; doc-control documents/revisions; procurement project/invoices/vendor quotations; warehouse transfers/reservations/movements; notifications/inbox/deliveries; agent sessions/activity/requests; quantities measurements/allocations; site reports; commercial variations/legacy snapshots; inventory lots/expiring lots; approvals pending; consultant RFI responses/submittal revisions; and `/v1/webhooks` (focused v1 PG: 1 suite / 10 tests). | Implementation `c19c2e6`; verification `46f9e85` plus follow-up |
| 1.3 Housekeeping | Existing fallback edits were uncommitted; git-less parity test absent; stray root file `tatus --short`. | Git and fallback scanner parity regression added; stray file removed; audit reports remain unstaged. | Password guard test: PASS 1 suite / 9 tests; `lint:guards`: PASS. | `4527166` |
| Batch exit gates | Current batch baselines not re-run. | Backend mock 65/65 suites, 1,087/1,087 tests; full PG 84/84 suites, 1,904/1,904 tests at 130 migrations; golden 16/16 with zero violations; `lint:guards`, `lint:api`, and root build pass. | Commands: backend `npm.cmd test -- --runInBand --no-colors`; PG gate `-All`; PG gate `-Reconcile`; `npm.cmd run lint:guards`; frontend `npm.cmd run lint:api`; root `npm.cmd run build`. The full PG pass preceded the addition of one separately passing v1 webhook test; no application code changed after the full PG pass. | `c19c2e6` |

## NOT DONE / NOT VERIFIED

- No ticket-specific implementation or page-two PostgreSQL coverage remains NOT DONE / NOT VERIFIED. The full PostgreSQL `-All`, backend mock, golden reconciliation, lint guards, API lint, and root build passed earlier in this batch. The last additions changed only the focused PostgreSQL test file and documentation; the focused PG gate was rerun afterward.

## Decisions waiting

- None.
