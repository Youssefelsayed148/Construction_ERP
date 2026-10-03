# Closeout log

One entry per PR: date, PR, what changed, tests added, open questions. Newest last. Source of truth for scope is `docs/ERP_CLOSEOUT_PLAN.md`.

## Before this log (backfilled from the PR list)

| Date | PR | Change |
|---|---|---|
| 2026-10-02 | #1 | Phase 0: baseline docs, CI gates, real-PG suite |
| 2026-10-02 | #2 | Phase 2.1: schema_migrations ledger, transactional migrations |
| 2026-10-02 | #3 | Phase 2.4: atomic document numbering, single invoice path |
| 2026-10-02 | #4, #5 | Phase 1.1 token typing, 1.2 fail-open removal |
| 2026-10-02 | #6-#9 | Phase 10 L0-L3 (localization baseline, provider, catalog, shell) |
| 2026-10-03 | #10, #11 | Doc-control numbering; role sync and owner guards |
| 2026-10-03 | #12, #13 | Phase 1.3 record scoping; 1.4 approval gate and agent safety |
| 2026-10-03 | #14 | Phase 5.1 slice 1: role templates, resource-derived module/action |
| 2026-10-03 | #15, #16 | Phase 2.2 inventory integrity; 2.3 procurement locking |

## 2026-10-03: queued item 1, upgrade preflight and data-cleaning report

- `scripts/preflight-upgrade.sql`: read-only report of what migrations 0001-0008 do to existing rows (written, unchanged, left NOT VALID, needs attention). Run on a restored copy before upgrading. On the throwaway database it runs and reports 13 rows.
- `services/dataCleaning.js` + `npm run data-cleaning-report`: for every NOT VALID CHECK or foreign key in the database, counts and samples the offending rows; never fixes; exit 2 when offenders exist. `validateConstraint` refuses while offenders remain. Generic, so future NOT VALID constraints (2.5, 2.6) are covered without registering them. This closes the plan's "validate the NOT VALID constraints from 0007/0008" tracking item: they validate at migrate time on clean data, otherwise the report lists the rows.
- Tests: `data-cleaning.pg.test.js` (4, real PG): CHECK and FK offenders (NULL passes a CHECK, MATCH SIMPLE FK), read-only, validate refuses then succeeds.
- Open: none.

## 2026-10-03: queued item 2, work-orders unit-cost input removed

- Reproduced: the backend already ignored a client `unit_cost` (2.2, issue cost comes from the stock ledger), but the Issue Material modal still showed a Unit Cost input and posted it. A user typed a number that was silently discarded.
- Removed the input and the field from the request body; the materials table still shows the server-derived cost read-only. `WOMaterialFormModal` is exported for the test.
- Tests: `WorkOrderMaterialForm.test.js` (2, frontend): no unit-cost field; POST body has no `unit_cost`. Both fail on the previous modal.
- Open: none.

## 2026-10-03: queued item 4, role-based project page (Phase 6 item, first slice)

Frontend stack (off the L3 shell branch, because it needs the L1-L3 catalog): PR base is `phase-10-l3-shell`.

- `ProjectShell` layout route at `/projects/:id`: six groups (Overview, Scope & Planning, Site & Quality, Procurement & Cost, Documents & Reports, Handover & Sales) with the active group's sub-tabs. The 13 hard-coded buttons in ProjectDetail are gone; all 13 sub-page URLs still work.
- One visibility map in `utils/projectNav.js` (spec role keys plus `site_supervisor`, `purchasing_mgr`; unknown or legacy roles see everything, `engineer` untouched). Contract value, budget and finance cards show only where the role has the procurement and cost group. Units & Sales only for residential, commercial, mixed projects (one constant to change). Presentation only: no backend check removed.
- All labels are catalog keys (`projects.nav.*`, EN and AR). 13 inline branches removed; i18n baseline regenerated (went down).
- Tests: `projectNav.test.js` (22: matrix per role, legacy mapping, type gating), `ProjectShell.test.js` (5: rendered tabs per role), Playwright `project-page.spec.js` (3 x desktop and mobile: owner, site engineer, Arabic RTL). Whole frontend suite 65/65.
- Not done (left open in the plan): count badges, "needs attention" list, spec 30 record layout, permission-driven path, `hidden group => 403` tests.
- Open questions: (1) `equipment_manager` sees Overview only because no equipment sub-page exists yet; (2) unit-selling project types are my assumption.

## 2026-10-03: integration base

The backend stack (#17, #18) and the frontend stack (#19 on #6-#9) are merged into `integration-base`, which is the base of every PR from here on (UI work needs the L1-L3 catalog, and each converted delete route ships its UI in the same PR). CLOSEOUT_LOG.md conflicted add/add; both sides kept. Merge only, no new code.

## 2026-10-03: Phase 2.5a, soft delete and void-with-reason (items, suppliers, payments, invoices)

- Reproduced first: the four routes ran `DELETE FROM`; deleting an item or supplier cascaded into POs, order lines, quotations and supplier invoices. 16 real-PG tests failed on the old code (missing columns and hard deletes).
- Migration `0009_soft_delete_masters_and_voids.sql` (additive only, existing rows untouched, nothing to preflight): `deleted_at/deleted_by/delete_reason` on item_master and suppliers; `voided_at/voided_by/void_reason` on payments; `voided_at` on payment_allocations; `voided_by/void_reason` on invoices; CHECKs that a void names a reason and a user (new columns, cannot break existing rows).
- Items and suppliers: DELETE sets deleted_at, hides from lists (`include_deleted=true` shows), sets is_active=false, stays readable by id so history resolves; `POST /:id/restore`.
- Payments: DELETE needs a reason, voids the payment and its allocations in one transaction (row locks on the payment and its invoices, concurrent voids: one 200, rest 409), recalculates invoice status, returns paid supplier invoices to `received`. All sums over payments and allocations now filter `voided_at IS NULL` (finance, dashboard, invoices, units, reports, financeEngine, clientEngine, reconcile). A voided payment cannot be allocated.
- Invoices: DELETE needs a reason and sets status `void` (kept; refused while live payments exist). Bug found and fixed on the way: reading a voided invoice that was past due flipped it back to `overdue`; voided/cancelled/credited invoices were also counted in project and company invoiced totals and overdue counts.
- Bug found and fixed: `GET /api/items` returned 500 for any filter (the count query renumbered placeholders by -2).
- Bug found and fixed (frontend, from L2): `common.actions` was an object, so every table's Actions header rendered a missing-key marker; the object is now `common.buttons` and `common.actions` is the column label.
- Policy: new `void` action for DELETE on payments and invoices, `delete` action for the two restore routes (`ACTION_OVERRIDES`). MCP: `void_financial_record` now requires a `reason` and passes it to the invoice void.
- UI (same PR): shared `ReasonDialog` (validated, accessible), used by Items, Suppliers (optional reason, show deleted, restore) and Invoices (void invoice, void payment with required reason, voided payments struck through, void status and filter). No `prompt()`/`confirm()` left on these four flows.
- Tests: `soft-delete.pg.test.js` (16, real PG: rows kept, lists, history, restore, concurrency, totals, allocation block, void stays void, permission for `void` on internal API, `/api/v1` has no delete or void route for these, MCP reason), module-override-coverage (+5 assertions), `ReasonDialog.test.js` (5), Playwright `void-delete.spec.js` (3 journeys x desktop and mobile, English and Arabic). Backend mock suite, real-PG suite, frontend unit suite (72), Playwright (28) all pass locally.
- Not done in 2.5a: FKs are still CASCADE (next slice), supplier invoice and other hard deletes listed in the plan, new POs/RFQs do not yet refuse a soft-deleted supplier or item.
- Open questions: should a new PO/RFQ refuse a soft-deleted supplier or item? (I would say yes; it is a one-line guard per route, and I held back to keep this PR to what was asked.)

## 2026-10-03: Phase 2.5b, RESTRICT on protected foreign keys (migration 0010)

- Reproduced first: the new test failed on the migrated schema: 59 cascade foreign keys hung off financial, procurement, contractual, inventory and handover tables, and another batch of `SET NULL` links silently detached documents (a PO losing its supplier, a BOQ item its section, an invoice its contract). Deleting a warehouse with stock movements did not fail cleanly: it cascaded into the append-only ledger and tripped the trigger.
- Migration `0010_restrict_protected_foreign_keys.sql`: every CASCADE and SET NULL foreign key whose child table is in a fixed list (52 tables plus payments, invoices, work_orders) becomes RESTRICT, except links to `users` (2.5c). It keeps name, columns, parent, ON UPDATE and deferrability. Adds `work_orders.cancelled_at/by/reason`. **Existing rows: untouched.** Constraints are replaced, so each child table is re-checked once; large tables should be migrated in a maintenance window. `scripts/preflight-upgrade.sql` now reports how many constraints change and how many rows the old SET NULL links had already detached (those stay as they are).
- Routes: `DELETE /api/work-orders/:id` now cancels (status, who, why; rows and cost records stay; second call 409). BOQ section/item, payroll period and location deletes answer 409 `record_in_use` instead of a 500 or, for BOQ, an unhandled rejection (they had no try/catch). A BOQ entry nothing references can still be removed: this is the one hard delete of a contractual row I left in on purpose, flagged below.
- UI (same PR): WorkOrders uses `ReasonDialog` to cancel (no `prompt()`, no button on cancelled orders); BOQ now confirms before deleting (it deleted on a single click) and shows the translated refusal (`errors.recordInUse`).
- Tests: `fk-restrict.pg.test.js` (9, real PG): protected list has no cascade or set null, names exist, every remaining cascade is classified (a new cascade must be added on purpose), PO/warehouse/invoice/payment/project deletes refused with 23503, supplier delete no longer detaches POs, work order cancel keeps children, BOQ 409 and the free item still deletable. Playwright `restrict-delete.spec.js` (2 journeys x desktop and mobile). Whole backend mock 968, real-PG 161, frontend unit 72, Playwright 32, build, i18n check ok.
- Open questions: (1) BOQ hard delete of unreferenced entries: keep, or soft-delete BOQ rows too (touches every BOQ read)? (2) Many other delete routes remain hard (listed in the plan); none now cascades into protected rows.
