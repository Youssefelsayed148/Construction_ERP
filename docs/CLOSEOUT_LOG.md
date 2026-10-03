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

## 2026-10-03: Phase 2.5c, users are deactivated, never deleted (migration 0011)

- Reproduced first: any user without references could be deleted with plain SQL; deleting one cascaded into `user_project_roles`, `organization_users` and `saved_views`; 33 foreign keys to users were SET NULL, so `created_by` / `approved_by` on financial documents would silently become NULL. 3 of 4 new tests failed on the old schema.
- Migration `0011_users_deactivate_only.sql`: the 36 CASCADE/SET NULL foreign keys to users become RESTRICT (the 128 NO ACTION keys already refuse a delete while children exist, left as they are); a BEFORE DELETE trigger refuses every delete with SQLSTATE 23001 and a message that names the policy. **Existing rows: untouched** (constraints replaced, child tables re-checked once). Preflight rows added to `scripts/preflight-upgrade.sql`; anything that deletes users (scripts, manual SQL) must deactivate instead.
- `DELETE /api/users/:id` already deactivated; there is no Users screen yet (Phase 6 admin), so no UI changes in this PR.
- Tests: `users-policy.pg.test.js` (4, real PG). One existing suite (`fail-closed.pg.test.js`) deleted its fixture users in teardown; it deactivates them now. Backend mock 968, real-PG 165.
- Open: a privacy erasure procedure (anonymise a user row) is not designed; say if it is needed before go-live.
- Phase 2.5 is complete: all five items checked.

## 2026-10-03: Phase 2.6a, CHECK constraints (migration 0012)

- Reproduced first: 17 real-PG probes failed on the old schema: quantity 0 or -5 on PO/PR/RFQ/delivery/return lines, invoices and payments of 0 or less, negative money, and a work order with status 'banana' were all accepted by the database.
- Migration `0012_check_constraints.sql`: 22 CHECKs, each added NOT VALID (enforced on new writes at once), validated if no existing row breaks it, otherwise left NOT VALID with a NOTICE and listed by `npm run data-cleaning-report` (never auto-fixed). **Existing rows: untouched.** Preflight rows added to `scripts/preflight-upgrade.sql` count the rows that would keep each group NOT VALID.
- Status vocabularies only for tables whose writers I could read to a closed list: invoices (lifecycle plus legacy `sent`), work orders, projects, phases, milestones, units, buildings, expenses. I did not constrain the other ~75 status columns: procurement, quality, HSE, doc-control and handover statuses are written from several places and by the workflow engine's approve/reject maps, and a wrong list would reject legitimate writes. A runtime status audit on a restored copy of the real database is the safe way to do it.
- Probe technique: a CHECK is evaluated before the foreign-key triggers, so a probe row pointing at a missing parent answers 23514 when the CHECK rejects it and 23503 when it accepts it. No fixtures.
- Tests: `constraints.pg.test.js` (17, real PG). The whole real-PG suite (19 suites, 182 tests) and backend mock (968) pass with the constraints in force, which exercises invoices, payments, work orders, procurement and inventory flows.
- Open questions: (1) status audit for the remaining workflow tables on real data (needs a restored copy); (2) invoices `amount > 0` rejects zero-value valuations: tell me if a zero or credit invoice is a real case.

## 2026-10-03: Phase 2.6b, money standard, one pending approval, one current revision (migration 0013)

- Reproduced first (6 real-PG tests, all failing on the old code): invoices/payments amount were NUMERIC(14,2) and two price columns (12,2) against 125 money columns at (15,2); two pending approvals for one record were accepted; and `POST /api/docs/documents/:id/versions` left a document with NO current version (it inserted the new version as current, then superseded every current version, itself included). It also never updated `project_documents.version`, so a second upload collided on UNIQUE(document_id, version_no).
- Migration `0013_money_standard_unique_pending_current.sql`: widens the four columns to NUMERIC(15,2) (lossless; tables rewritten once), then builds `uq_approval_requests_one_pending` and `uq_document_versions_one_current`. Unique indexes cannot be NOT VALID, so if duplicates exist the migration STOPS with the counts and changes nothing (no auto-resolve). **Existing rows: untouched.** `scripts/preflight-upgrade.sql` reports the widened row counts and both duplicate counts; run it on a restored copy first.
- Routes: version upload is one transaction that locks the document row, supersedes first, inserts the new version as the only current one and updates the document's version. `POST /api/approvals/request` uses `INSERT ... ON CONFLICT DO NOTHING` and returns the winner's row to the loser.
- `scripts/status-audit.sql` (read only): every status-like column with each distinct value, row count and whether a CHECK exists. Run on a restored copy; its output is what the remaining status vocabularies (the other workflow tables) must be built from. That plan item stays open.
- Tests: `constraints-2-6b.pg.test.js` (6, real PG). Backend mock 968, real-PG 188.
- Not done in 2.6: status enums for the other workflow tables (needs the audit on real data); removing the legacy header `material_id` (next slice, 2.6c: needs a backfill of lines for header-only POs, so it is a data-writing migration).
- Open questions: none new.

## 2026-10-03: Phase 2.6c, purchase lines are authoritative (migration 0014)

- Reproduced first (4 of 6 real-PG tests failed on the old code): replenishment wrote one material into the PO and PR header and found open orders through that header column; `openConfirmedQuantity` wrapped its line query in `try { ... } catch (e) { /* database before line tables */ }`, hiding any error; a delayed PO raised its alert for the header material only.
- Code: replenishment creates the PR/PO header without a material and always writes the line (the `if (!/purchase_request_lines/.test(e.message))` fallbacks are gone); the open-order and incoming-quantity queries go through lines; idempotency of PRs uses `source_key`; delayed-PO alerts are raised per line material; the PO header quantity and total are derived by `recomputePoTotals`.
- Migration `0014_backfill_header_only_lines.sql`: **adds** one line to every PO and PR that has a header material and positive quantity but no lines (copied from the header; repeatable; documents that already have lines are untouched). **Existing rows: none changed or deleted; line rows added.** Header columns are kept and commented as deprecated; dropping them is a later decision. Preflight rows added (`will_change` counts).
- Behaviour change to be aware of: before, a header-only legacy PO counted as incoming stock through its header quantity; after the migration it counts through its backfilled line. A legacy PO partly delivered before line tables existed has no delivered quantity on the new line, so its incoming quantity is the full header quantity (same as before, since the header had no delivered column).
- Tests: `legacy-headers.pg.test.js` (6, real PG). `replenishment.test.js` (mock) updated to query by lines and source_key (its fake-query test asserted the header double counting). Mock 968, real-PG 194, lint guards ok.
- Open questions: drop the deprecated header columns after checking a restored copy? (I would, in a later migration.)

## 2026-10-03: Phase 2.7a, the journal posts in the caller's transaction (migration 0015)

- Reproduced by inspection first (the old code cannot run on the new schema, so these tests exist only as the new contract): `utils/journal.js` caught every error and returned null; expense and payroll routes called it fire-and-forget (`.catch(console.error)`), so an expense could exist with no entry, silently; account ids 1, 8, 9, 10 were hard-coded and `createdBy` defaulted to 1; saving payroll with `posted_to_finance: true` twice posted two entries; nothing refused an unbalanced entry.
- `utils/journal.js`: `postJournalEntry(q, ...)` runs on the caller's query function (pass the transaction client), validates (two or more lines, one side per line, non-negative, balanced, exact BigInt arithmetic via the new `utils/money.js`), and throws `JournalError`. Lines name an account KEY; a missing key is an error naming the key. No try/catch around the posting anywhere.
- Migration `0015_gl_account_map_and_balanced_entries.sql`: new `gl_account_map` (key to account, RESTRICT) seeded from the chart by code; CHECK that a line has a non-negative amount on one side (NOT VALID then validated if clean); deferred constraint trigger that refuses to commit an unbalanced entry. **Existing rows: untouched** (the trigger only checks entries touched later). Preflight rows added (accounts that will be mapped, existing unbalanced entries, lines that would keep the CHECK NOT VALID).
- Routes: `POST /api/expenses` inserts the expense and posts its entry in one transaction (failure: 500, nothing created); `PUT /api/payroll/:id` locks the period, and posts only the first time `posted_to_finance` becomes true. Both record the real user.
- Behaviour change: expense creation now fails (500, message names the key) when a ledger key is not mapped, instead of succeeding without an entry. There is no UI to edit `gl_account_map` yet (admin screen, Phase 6); until then it is edited in SQL.
- Tests: `journal.pg.test.js` (10, real PG, real app). Mock 968, real-PG 204, lint guards ok.
- Next (2.7b): post client invoices, payments and supplier invoices through this service, with the idempotency index.
- Open questions: which accounts to use for tax and retention when invoices carry them (the chart has no VAT or retention accounts); I will make them optional keys in 2.7b and post only what is mapped, listing the rule in the PR.

## 2026-10-03: Phase 2.7b, client invoices and payments post to the ledger (migration 0016)

- Reproduced first: nothing posted an invoice or a payment; the ledger held only expenses and payroll.
- `services/glPosting.js` with one `POSTING_RULES` map (the place to change policy): invoice entering an issued state: Dr receivable (amount) / Cr revenue (amount minus tax) / Cr `vat_output` (tax); payment: Dr cash / Cr receivable; invoice void or cancel and payment void: the original entry reversed once. Hooked at the choke points, inside the caller's transaction: `createInvoiceRecord` (used by manual invoices and unit sales), `transitionInvoice`, `PUT` and `DELETE` on `/api/invoices`, `POST` and `DELETE` on `/api/payments`. Those routes now run in a transaction (invoices create, unit-sale invoices, finance-ledger transition).
- Only the transition INTO an issued state posts. Invoices issued before this change get no entry when a payment later flips them to paid (no backfill, same stance as the stock ledger); the preflight lists how many issued invoices that is so an opening balance can be decided separately.
- A posted invoice's amount cannot be edited (409: void and reissue); `PUT` with a status follows the same posting rules.
- Migration `0016_one_posting_per_document.sql`: partial unique index (reference_type, reference_id) for the four new kinds, the backstop for concurrent requests; **adds one chart account** (2100 Output VAT Payable, mapped as `vat_output`) when no account with code 2100 exists, because the seeded chart has no tax account and a taxed invoice could not otherwise be issued. **Existing rows: untouched** (one `accounts` row added).
- Fixed on the way: migration 0015 failed on a FRESH database (`pg_temp.add_check` already created by 0012 in the same session); now CREATE OR REPLACE. A fresh-database migration is now part of my local checklist before every push.
- Tests: `ledger-postings.pg.test.js` (8, real PG, real app) covers postings, tax split, reversals, concurrent voids (5 racing, one reversal), PUT rules, legacy invoices, atomic failure (no invoice, no payment when a key is unmapped), the unique index. `finance.test.js` (mock) gets the ledger fixture; `numbering.pg.test.js` creates drafts (it tests numbers, not postings). Mock 968, real-PG 212, lint guards ok.
- Not done in 2.7: supplier invoices and supplier payments are not posted. There is no approve step for supplier invoices yet and the posting point is the cost accrual decision (GRN for stocked materials, approved invoice for services), so they are posted together with 3.1 to avoid double counting. The plan item stays unchecked.
- Open questions: (1) tax account: I added 2100; say if your chart has a real one to map instead. (2) Retention, advance recovery and other deductions are inside the invoice amount and not posted separately (no accounts); Phase 8. (3) 'credited' invoices post nothing yet (credit notes are not modelled).
