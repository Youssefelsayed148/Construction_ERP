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

## 2026-10-03: Phase 2.8, approvals are created atomically and decided once (migration 0017)

- Reproduced first: (1) `POST /api/approvals/request` started the workflow in a try/catch that only logged, and (worse) never set `workflow_instances.legacy_approval_id` (only the context JSON), so EVERY new request had an orphan instance: the first decision found no instance, auto-healed by creating a second one from the legacy row, and left the first active forever with its action item. (2) `recordLegacyDecision` read the request without a lock: on the throwaway database my first race test left up to 6 twin instances for one request (3 requests, 13 instances), which is also why migration 0017's stop-with-counts guard fired locally.
- Code: request row and workflow instance are created in one transaction and linked; if the workflow cannot start nothing is saved (500). The route now refuses a module the workflow does not handle (400; the list is the existing module map, nothing in the UI calls this route). Decisions run in one transaction with `SELECT ... FOR UPDATE` on the request, so parallel approvals decide each stage once.
- Migration `0017_link_approval_workflows.sql`: links an instance to its request only when its context names exactly that request and no other instance claims it (column NULL -> id, nothing else changes); then adds a unique index (one instance per request). If a request already has two linked instances the migration STOPS with the count and changes nothing. Stale instances next to a decided twin are left alone and counted by `scripts/preflight-upgrade.sql` for a person to cancel. **Existing rows: only the NULL link column is filled, no row deleted.** Run the preflight on a restored copy first.
- `docs/APPROVALS_RETIREMENT.md`: how and when the legacy system goes (Phase 8); `npm run approvals-parity` is the check until then.
- Tests: `approvals-atomic.pg.test.js` (7, real PG, real app): atomic create, failure leaves no row, unknown module refused, 6 parallel approvals per stage (one wins, one decision recorded), approve/reject race agrees in both records, parity, migration linking and the unique index. `constraints-2-6b` updated to use a handled module. Mock 968, real-PG 219. Fresh-database migration of all 80 and the parity script on it pass.
- Open questions: stale active instances in the real database (preflight group 0017) need a person to cancel them; there is no cancel action yet (the only tool is `cleanup-orphan-approvals.js --apply`, which hard-deletes).
- Phase 2 remaining open items: status enums for the other workflow tables (needs `scripts/status-audit.sql` on a restored copy), supplier invoice/payment postings (with 3.1).

## 2026-10-04: Closeout A2.1, supplier-return reversal, accrual pairing, cancel restriction (migration 0023)

- Reproduced first (`supplier-return-accrual.pg.test.js`, 9 of 10 failed on the old code; `approvals-cancel.pg.test.js`, 1 failed): a supplier return reduced stock and the GRN quantity but left the GRN cost row and ledger entry; a stocked invoice with no GRN accrual never accrued (the documented "legacy GRN-less" rule returned early), and a later GRN would have accrued the goods again; a mixed invoice posted no input tax; any user with approvals authority could cancel anyone's approval.
- Decision 2: `reverseGrnCostForReturn` writes a negative `project_costs` row (UNIQUE source_type `supplier_return`, source_id), entry Dr payable / Cr material_cost (kind `supplier_return_cost`), valued at the PO line rate the GRN used, proportional to what the GRN accrued, capped at the remaining accrual, exact on the last unit. Same transaction as the return. A GRN with no cost row (legacy, or covered by an invoice) reverses nothing.
- Decisions 5 and 6: `cost_accrual_claims` pairs GRN and invoice quantity per PO line (accrued once, whichever first); a GRN-less stocked invoice accrues at approval; a mixed invoice accrues service net (+ uncovered stocked), books the FULL invoice tax on vat_input and credits payable for what it accrued, so with the GRN's credit AP equals the invoice total.
- Decision 4: `PUT /api/approvals/:id/cancel` (and its v1 mapping) is limited to owner, admin and the original requester; others get 403 `approval_cancel_forbidden`. MCP has no cancel tool (asserted). The v1 error envelope now passes `error_code` and `error_params` through when the internal response has them.
- Migration `0023_cost_accrual_claims_and_return_reversal.sql`: new table, backfill of claims for GRNs that already have a cost row, journal one-posting index widened to `supplier_return_cost`. Existing rows untouched; purely additive, no stop condition.
- Open: the tax of a stocked-only invoice whose goods the GRN already accrued posts nowhere (no cost remains, so no invoice entry). Owner question.

## 2026-10-04: Closeout A2.2, replenishment through the PR workflow (migration 0024)

- Reproduced first (replenishment-pr.pg.test.js, 11 of 12 failed on the old code): the sweep inserted a draft PR with no project, location, work package or cost code and never started the PR workflow; PO-mode policies created purchase orders directly; stock was counted across every project's warehouses; a submitted replenishment PR was no longer a draft so the next sweep (or a second runner) raised another; the budget_check step checked nothing.
- Now: every mode except alert_only raises a requisition per (material, project) and submits it through the PR workflow as a system actor (Draft and Submit completed by the system, no action item for a requester-less step; the budget check and approvals wait for people). A project's need is judged on its own warehouses plus company-level ones and on that project's open orders and requisitions. The reorder-point top-up (no project) is raised only for what the project needs do not cover. One transaction and an advisory lock per source key; unique index on open statuses is the backstop.
- Budget check (computeBudgetCheck): budget - spent (project_costs) - committed (undelivered open orders) against the PR amount; stored on submit and re-run when the budget step is approved; over_budget refuses approval with error_code pr_over_budget (rejecting stays possible); no project, no budget or no price is flagged, not blocked. Manual PRs get location, cost code, work package and the same check.
- Behaviour change to confirm: auto_draft_po and auto_issue_po no longer create POs (the authority-ceiling gate is gone; authority_ceiling is advisory). Mock tests superseded and deleted: 1 draft-PR idempotency test and 3 authority-ceiling tests in replenishment.test.js (replaced by the PG suite); legacy-headers.pg.test.js now asserts the same 2.6c rule on the requisition.
- Migration 0024: 4 nullable columns on purchase_requests, item_master.default_cost_code_id, unique index on source_key for open statuses. STOPS with counts if two open requisitions share a source key. Existing rows untouched.

## 2026-10-04: Closeout A2.3, cost posting from material issue, expenses and payroll (migration 0025)

- Reproduced first (`cost-posting.pg.test.js`, 11 of 14 failed on the old code): a material issue, an expense and a payroll run never reached `project_costs`; work completions accrued the order's labour AND each labour payment accrued itself (labour counted twice), and a second completion of the same order counted the whole order again; a posted expense could be edited or deleted, leaving the ledger and the cost row describing something that no longer existed.
- Found on the way: stock received through the delivery path entered at cost 0 (the 'quarantine' movement carried no unit cost), so the weighted average stayed 0 and every later issue was valued at 0. `createDelivery` now values the receipt at the PO line rate. New receipts only; existing stock keeps its recorded cost (no backfill, same stance as the stock ledger).
- New rules in `COST_ACCRUAL_RULES` (one map, no scattered conditionals): `material_issue`, `expense`, `payroll`, `labor_payment`, `work_order_equipment`, `subcontractor_payment`. Each is idempotent on UNIQUE (source_type, source_id), runs in the caller's transaction and posts no second ledger entry (the ledger already holds these amounts).
- Pairs and their no-double-count rules, one test each: GRN and material issue (an issue accrues only when the stock was not already charged to the project it goes to: +project and an offsetting row against the warehouse's project, so the company total never moves; no resolvable project, nothing guessed); expense and the PO chain (an expense naming a PO is owned by the GRN/invoice); labour payment and work completion (a completion accrues the order's equipment lines once each, labour is its own rows; an order with a legacy `work_completion` row is skipped); payroll (allocated by present/late attendance days per project in the payroll month, one `payroll_cost_allocations` row per period and project; the ledger entry is unchanged; unallocated days stay overhead).
- Expenses: a posted expense (every one since 2.7a) can no longer change amount or project or be deleted (409 `expense_posted`); status and notes stay editable. A void flow for expenses is the next step.
- Migration `0025_payroll_cost_allocations.sql`: one new empty table. Existing rows untouched; payrolls posted earlier are not allocated retroactively (count query in the migration header).
- Open: existing `work_completion` rows (pre-A2.3) hold labour plus equipment for the whole order and may double count against `labor_payment` rows; a data-cleaning report on a restored copy would size it (not run here). Payroll allocation uses attendance.project_id as the basis: confirm that is the intended rule.

## 2026-10-04: Closeout A2.4, no catch-to-zero, one cost view (migration 0026)

- Reproduced first (`cost-guards.pg.test.js`, 29 of 30 failed on the old code): every dashboard section, the commercial engine's commitment sync, the role-dashboard widgets and the location dashboard turned a failing query into a 200 with zeros, an empty list or a missing figure.
- Removed (30): dashboard.js 24 (6 counts, 5 alerts, 12 overview sections, project dashboard's commercial try/catch), dashboardWidgets.js `safeAll` (the one helper behind every widget), commercialEngine.js 2 try/catch-to-[] in commitment sync, quantities.js location dashboard `safe()` (now logs with context and rethrows). A failed section answers 500 with error_code `dashboard_section_failed` and error_params.section; one test per guard forces the query to fail and asserts the error.
- Found by removing the guard: the location dashboard queried tables that do not exist (`documents`, `qhse_records`), so its documents and QHSE sections were permanently empty and nobody could tell. They now read `project_documents`, `ncrs` and `observations`.
- One cost view: migration `0026_project_cost_views.sql` (`v_project_cost_totals`, `v_project_cost_by_code`) and `services/costView.js`. Dashboards (portfolio, project, alerts, overview), costing (rows, by type, grand total, summary), the commercial engine's actual cost, the location dashboard and the PR budget check all read through it; one test asserts they report the same number. Lint guards `catch-to-zero` and `cost-view` keep it that way (baseline stays empty).
- Mock-db tests cannot create views: `commercial.test.js` uses a shim (`test-helpers/cost-view-mock.js`); the real views are tested on PostgreSQL.
- Not touched here (A2.5/other): the `.catch(() => {})` on fireEvent and closeBySource calls, and siteEngine `safeAll` (A2.6).
- Migration 0026: two views, no row touched.

## 2026-10-04: Closeout A2.5, events (no migration)

- Reproduced first (`event-integrity.pg.test.js`, 28 of 28 failed on the old code):
  - names: the RFI route emitted `rfi.created` but the dispatcher routed `rfi.submitted`; `invoice.overdue` was routed but never emitted (the reminder sweep notified directly, swallowed a failed notification and wrote the reminder anyway); the PR workflow announced `purchase_request.approved` while the route was `purchase_requisition.approved`, which only a legacy PO approval produced (a PO announced as a requisition).
  - routes: eleven event families had none (they only reached the in-process bus).
  - atomicity: the events that drive cost postings were enqueued outside the change's transaction or swallowed with `.catch(() => {})` (labour payment, subcontractor payment, work completion verified: enqueued on its own connection BEFORE the verification committed). A failed module-event emission in the workflow engine was logged and dropped. `schedule.activity.changed` was "best-effort". The daily site report emitted `site_report.created` straight on the bus.
- Now: `rfi.submitted` (old name still routes for rows enqueued before); the sweep writes the reminder and emits `invoice.overdue` (overdue_7/14/30) or `invoice.due` (due_soon, due_today) in one transaction, one failing invoice does not stop the others and the run fails at the end for the sweep leader; the PR workflow publishes `purchase_requisition.*`, POs `purchase_order.*`; `NOTIFY_RULES`/`PATTERN_RULES` route the eleven families (title always names the record); the outbox dispatcher resolves families and still emits every delivered event on the bus for webhooks.
- Same-transaction (asserted with xmin, outbox row and changed row): approval request, variation approval, invoice transition, invoice creation, payment, PO decision, MIR decision, GRN, project creation (wizard and legacy), work-completion verification, labour payment, subcontractor payment certificate, daily site report. A failed enqueue rolls the change back. Not made atomic (still awaited, and a failure is an error, but the change commits first): RFI/submittal routes, locations, recipes, allocations, schedule activity, site instructions; they are plain single statements and are listed for the next pass.
- New guard `event-swallow` (lint-guards, baseline empty): a fireEvent call that is not awaited/returned or is followed by .catch.
- Bonus bug found by the new test: `PUT /api/subcontractors/certificates/:id` failed on EVERY call on real PostgreSQL ("inconsistent types deduced for parameter $1": one parameter used as the status and in a CASE comparison). Certifying or paying a subcontractor certificate never worked; mock-db could not see it. Fixed with a separate boolean parameter.
- Out of scope, as the plan says: webhook fan-out (plan 1.5). Not changed: `escalationScheduler`, `actionService` and `siteEngine` emit through their own paths.

## 2026-10-04: Closeout A2.6, progress wiring (no migration)

- Reproduced first (`daily-report-progress.pg.test.js`, 8 of 8 failed on the old code): a daily report carried no measurements (`daily_report` was an allowed source nothing produced); verifying a work completion approved its measurements and re-synced allocations but never recomputed the quantity-driven activities or the project's progress; the PM dashboard's progress was the plain mean of activity percents and the portfolio/overview averages plain means of project percents.
- Now: one hook `progressEngine.onMeasurementsChanged` for every measurement source; one writer `quantityEngine.recordMeasurement` (also checks the BOQ item, location and work package belong to the project: the measurement route used to trust the ids it was given); daily reports take measurements (pending, in the report's transaction); PM/portfolio/overview figures are weighted.
- Decision applied, flag if you disagree: daily-report quantities enter as `pending`. Executed progress counts approved/certified quantities only, so a report moves progress once a reviewer approves its lines. If site-reported quantities should count immediately, that is one line in `recordReportMeasurements` plus the executed-state rule.
- The soft-delete scenario for schedule_activities stays skipped until soft delete lands (the `deleted_at` guard in durationWeighted is already there).

## 2026-10-04: Closeout A2.7, the golden chain (migration 0027)

- `golden-chain.pg.test.js` (real PostgreSQL, real app, real replenishment sweep): requirement -> requisition (through the PR workflow, budget check) -> approvals -> PO from the requisition (issued through its workflow) -> delivery -> MIR -> GRN -> supplier invoice (three-way matched, approved) -> payment (allocated) -> cost. Reconciled at every step, every figure read from the database: requisition amount = PO total = GRN valued total = invoice net; project cost rows = ledger material cost = cost view = stock valuation = dashboard and costing totals; AP carries the goods at the GRN and is zero after payment; the invoice adds no second cost row; every ledger entry balances; a second sweep raises nothing. Variant 2 puts a supplier return in the middle (50 received, 10 returned, 40 invoiced and paid): the reversal takes its share of cost, ledger, AP and stock, and the chain reconciles on the kept quantity.
- Bugs the chain found (both reproduced by the test before the fix):
  1. **No purchase order could ever be issued through its workflow on PostgreSQL**: purchase_orders.status was VARCHAR(30) and the PO workflow's first approval step is 'commercial_procurement_approval' (31 characters), so the first decision failed with "value too long for type character varying(30)". mock-db does not enforce lengths. Migration `0027_widen_purchase_order_status.sql` widens the column (metadata only, no row touched). A new test pins that every workflow step key fits the status column of the document it is mirrored into (po, requisition, wir, mir).
  2. **The three-way match flagged every partial invoice as a price variance** (invoice total compared with the WHOLE PO total): a partial delivery, goods returned or the second of two invoices went to the AP review queue. The header check now compares the invoice net with what its PO-linked lines are worth at the PO's rates; quantity over-billing stays the line check's job; an invoice with no PO-linked line falls back to the PO total as before. A price above the PO rate is still flagged.
- Phase 3 exit gate: met.

## 2026-10-04: Closeout Part B, Phase 4 test infrastructure (PRs #44-#54)

- B1 harness: `jest.pg.global-setup.js` fails fast when TEST_PG is unset, the database is unreachable within `DB_CONNECT_TIMEOUT_MS` or migrations are missing; refuses prod-named databases. Isolation documented (migrate-once, tagged rows, no transaction-per-test because the suites test transactions/locks/constraints). `docs/TESTING.md` carries the run recipes, the three-suite table and the spec-26 12-layer exit-gate table (one automated CI test per layer 1-11; layer 12 = recorded manual baselines by plan).
- B3 concurrency (8 tests): stock issue race (12x3 vs 20 -> exactly 6 succeed), double MIR decision, double approval stage-claim race, numbering collisions (40+40 distinct), duplicate delivery vs PO tolerance, idempotent cost posting (6 parallel + replay), two dispatcher instances (exactly once), two sweep runners (max 1 running). Proof-of-failure shown by locally removing the `inventoryEngine.lockPairs` advisory lock (all 12 overselling issues succeed) and the `recordLegacyDecision` FOR UPDATE claim (all 8 approvals pass a stage), then restoring. Found while landing: the suite's own request-id overflowed int4 (test bug, fixed in suite).
- B4 constraints (7 tests) + migration `0029_stock_movement_signs.sql`: raw SQL could INSERT a negative-quantity `issue` row (every consumer reads it as a POSITIVE receipt). Preflight STOPS with counts, CHECK `movement_type IN ('adjustment','reversal') OR quantity > 0` after. Preflight proven live: on a reused dirty DB it stopped, changed nothing, and named the count. B4's probe now runs inside a rolled-back transaction so a failed run never pollutes the ledger.
- B2 port: five new real-PG suites (`inventory-flows`, `finance-flows`, `procurement-flows`, `workflow-flows`, `policy-flows`) - 36 tests: ledger sequences, reservation release, paired transfers, valuation arithmetic + cumulative, allocation invariants, retention, AP queue from real three-way-match exceptions, company finance dashboard reconciled, RFQ-comparison-award, PO through its workflow to issued+closed, three-way-match taxonomy incl. the partial-invoice rule, workflow return/reassign/getPendingFor/direct-to-owner/orphan-cleanup/catalog+escalation integrity, visibility-flag trio per role class, listGrants, preview fail-closed, audit dual-write. 45 mock tests deleted as superseded (their fixture chains healed, no assertion moved lost).
- B5 contract: `v1-contract.pg.test.js` walks every documented (method, path) from the LIVE served OpenAPI and asserts JSON envelopes. Found: unmatched /api/v1 routes fell through to Express's HTML 404 - fixed with a v1-level catch-all answering the documented JSON envelope. Health status is 'healthy', 401 code 'unauthenticated', default per_page 50 (test corrections, not app bugs).
- B6 matrix: `policy-matrix.pg.test.js` sweeps the whole seeded grid: every grant works on the shared engine, everything ungranted denies (full grid over explicit-grant internal roles), no-role users denied on everything regardless of users.role, no external wildcard, v1 FAMILY_MAP remounts derive a stable module+action.
- B7 nav visibility: `nav-visibility.pg.test.js` (44 tests) - hidden group dead at the API for the role, visible-group representatives live; external roles portal-only (project page itself denies). Rendering half pending Part D (6.4) with an explicit placeholder; legacy blanket roles pinned as a fixture for the 5.1 switch.
- B8 reconciliation: four read-only checks appended to `reconcile-database.js` (stock ledger vs projection with the exact PHYSICAL_SIGNS map; cost rows vs ledger postings; AP/AR postings vs live documents; approvals vs instances). Structural tests keep them runnable; run on a restored copy only.
- B12 portals: `portal-acceptance.pg.test.js` - recursive payload scans (forbidden data fields absent; see_internal_cost forced false), assigned-project enumeration only, expired active_to vanishes, sibling org invisible, supplier competitor pricing absent, consultant caged, no portal can follow another's prefix. Mobile-viewport half is frontend work (marked pending in-suite).
- B9 frontend: 19 component tests across Clients, Suppliers, Expenses, Payroll, MyActions (rows, empty states, error states on server rejection, form payloads). No component modified. 29 screens remain without dedicated states-coverage (pattern set by the five; cheap to clone).
- B10 journeys: `journeys-backend.spec.js` - seeded-owner login -> live dashboard shell, real portfolio numbers, Arabic-first shell + toggle. Gated (`E2E_BACKEND=1`). Seeding recipe uses SEED_DEFAULT_OWNER/DEFAULT_OWNER_EMAIL/DEFAULT_OWNER_PASSWORD; joi's default TLD rule rejects invented TLDs like `.erp` (use a plausible domain).
- B11 load: `scripts/load-profiling.js` (refuses without CONFIRM_THROWAWAY_DB=true; boots its own app; creates+deactivates its own user; writes docs/LOAD_BASELINE_<date>_<tag>.json). Baseline 2026-10-04: all targets 200/201, p95 <= 54 ms at c1 and <= 38 ms at c8, replenishment sweep 2075 ms over the test catalog. **Bug found and fixed: `GET /api/dashboard/project/:id` answered 500 dashboard_section_failed for a non-integer id (the raw param reached SQL) - now 400 before any query; pinned by `dashboard-id.pg.test.js`.**
- GH Actions remote gate stayed red all through Part B (billing/spend limit - jobs fail at start with zero steps); the three-job parity is maintained locally (mock + PG16 + frontend build/i18n/e2e), documented per PR.

## 2026-10-05: Closeout 5.2, project setup (spec 05, 06), migration 0033

- Where the previous session stopped: PR #55 (5.1) was pushed with a half-written 5.2 commit on top (a migration that failed on every database: it backfilled `itp_points.work_package`, a column that does not exist, and the commit also dragged in three `.claude/worktrees` gitlinks). CI backend-pg was red for that reason. Reproduced locally first (`column p.work_package does not exist`), then the migration was rewritten.
- Migration `0033_project_setup.sql`: `project_settings` (key/value JSONB), `project_calendars` (one default per project by partial unique index, off days CHECKed 0-6), and work-package links by FK: `itps`, `wirs`, `schedule_activities`, `boq_items`, `project_team` gain `work_package_id`, `work_packages` gains `project_location_id`. The free-text `work_package` columns stay and are never rewritten. Backfill is exact and project-scoped: code first, else a name that is unique in the project; blank text counts as no value. Preflight STOPS with counts (unmatched or ambiguous names) and changes nothing; proven in a rolled-back transaction by the new suite. FKs are NO ACTION, so a referenced package cannot be deleted while a project cascade still works.
- Routes (`routes/project-setup.js`, mounted on /api/projects, policy module `projects`, mirrored in /api/v1 under projects): settings GET/PUT, calendars CRUD, WBS CRUD, work-package CRUD. Every refusal carries error_code and error_params. Deleting a node or package that is in use is a 409 with the counts. Cross-project ids are 404, never accepted.
- Registers: ITP, WIR, schedule activity (create, update, CSV import) and BOQ item take `work_package_id`; free text still works when it names a real package (exact code or a unique name) and resolves to the FK; text that matches nothing is a 400 `work_package_unmatched`. The CSV import validates every row before it deletes or writes anything (a refused row used to be able to leave `replace=true` with an empty schedule). The ITP, WIR and schedule forms now use a work-package select (loading, empty and error states, tested) because the API no longer accepts unmatched text.
- Wizard: the advance bug was in the frontend (a percentage sent as `advance_payment_amount`); the body is now built by `buildWizardPayload` (tested). New provisioning steps `role_assignments` (a seat on the new project for the team role's template through the same `teamService` as POST /api/team, so grants and notification subscriptions are inherited) and `default_reports` (four scheduled reports addressed to the creator). Workflows: the old "stubbed" rows used codes the engine never had (`material_approval`, `submittal_review`); a project's workflow register is now one row per active engine template with its real steps, and a test pins that every provisioned code is an active template with steps. Team-role to role-template map is `TEAM_ROLE_TEMPLATES` in projectProvisioning.js (supervisor and foreman have no canonical role and stay a team row without grants; safety_officer maps to hse_manager).
- Tests (written first: 4 of 8 red before the register and wizard changes, the rest passed with the new service; the matrix expectation for storekeeper reads was my mistake: projects.view is seeded): `project-setup-5-2.pg.test.js` (9), frontend `wizardPayload` (2) and `WorkPackageSelect` (4), mock suites adapted (qaqc, wizard, wizard-routes, route-guards count 51, fk-restrict classification).
- Found on the way: a `String.replace` in my own patch script collapsed `$$` to `$` in two UPDATE builders; caught by the new suite before commit. The shared test database had grown to 1,841 projects from repeated runs and the finance dashboard test timed out; recreated the throwaway database (container erp-closeout-pg only).
- Not done in 5.2, honestly: a UI for WBS and work packages (Phase 6.3, the API is ready), `project_team.work_package_id` has no write path yet, dropping the free-text columns (separate migration after review).

## 2026-10-05: Closeout 5.1b, legacy role switch dry run (read-only, no migration)

- The CP4 report item that was missing after 5.1: per existing seat, old role -> canonical role and the exact permissions gained and lost. `services/legacyRoleDryRun.js` + `npm run report:legacy-roles` (SELECT only; the suite runs it inside a READ ONLY transaction and asserts the tables are unchanged). Role-level result in `docs/LEGACY_ROLE_SWITCH.md`: every legacy role currently holds the blanket (137 catalog pairs) and every mapping only loses permissions (owner and admin lose 71, the others 105-118); `finance_manager` is both a legacy and a canonical key, so its identity mapping still carries the blanket.
- NOT done, by your rule: no user was moved and no wildcard was removed. The switch is a separate PR after you review the report on a restored copy (open decisions are listed in the doc: owner/admin, finance_manager, the provisional alias map, users.role).

## 2026-10-05: Closeout 5.3, materials and inventory (spec 07), migration 0034

- Migration `0034_inventory_lots_documents.sql`: `unit_conversions` (table is the authority; per material or company-wide; the per-item JSONB is backfilled and stays readable), `stock_lots` + `stock_movements.lot_id` (composite FK: a movement can only name a lot of its own warehouse and material), the `stock_lot_balances` view (derived from the ledger with the engine's signs), `delivery_lines.lot_id`, `inventory_documents` + `inventory_document_lines` (issue, return, adjustment; each posted line references its `stock_movements` row, UNIQUE), and the grants (`inventory` approve/void for construction_manager, procurement_manager, coo, owner_ceo; `materials` create/edit/approve for procurement_manager, owner_ceo, coo). Preflight stops with counts on malformed JSONB conversions (found on the test database: one seeded item stores `{}` for "none", which is now accepted as empty). The per-(warehouse, material) advisory lock, the weighted-average trigger and the movement immutability trigger are untouched; every existing movement keeps `lot_id` NULL.
- Lots: a receipt of a lot-tracked material (`item_master.batch_lot_tracking`) with no lot gets an automatic one; an outbound movement with no lot is split FEFO (earliest expiry first, no expiry next, then pre-lot stock), the returned row is the first part with `parts`. Issues and transfers skip expired and blocked lots and say so (`lot_stock_unusable`, `lot_expired`, `lot_blocked`, `lot_insufficient`); waste, damage and supplier returns may still take from them so expired stock can be written off. Lot checks run under the pair lock, so the lot race (12 parallel issues of 3 against a lot of 20) yields exactly 6. Deliveries open a lot per line (lot number, batch, expiry accepted on the delivery line), MIR decisions act on that lot, transfers carry the lot to the destination, reversals keep the lot.
- Documents: issue, return, adjustment through `/api/inventory/{issues,returns,adjustments}` (draft, edit, post, void) and `/api/v1/inventory/...`. Posting goes through the engine, so lock, balance gate, valuation and lot rules apply. A return that names its issue line is capped by what is still out, goes back to the same lot, is valued at the ORIGINAL issue cost (the weighted average is unchanged by a round trip) and gives back its share of the project cost (`COST_ACCRUAL_RULES.material_return`, an offset row moves it back to the warehouse's project); voiding an issue reverses stock and its whole cost (`material_issue_void`); an issue with returns and any posted return cannot be voided. Adjustments need a reason (also a CHECK), cannot take more than is on hand, are taken FEFO on lot-tracked material (expired lots included), and posting one needs the `approve` action (the storekeeper drafts, the manager posts; void is its own action).
- Unit conversions: CRUD + `convert` (chains and inverses; material row beats company row; the legacy JSONB answers only for pairs the table lacks); material demand now converts through the table.
- Expiry alert (was a no-op): one `expiring_material` alert per material listing lots that hold stock and expire within 30 days or already have, expired lots are marked, idempotent, resolves itself when the stock is gone.
- Replenishment endpoints on `/api/materials/replenishment`: alerts list, policies GET/PUT/DELETE (the `business_rules` rows the sweep reads), manual sweep under the same leader lock as the scheduler (409 `sweep_already_running` while another run holds it), and open-requirements. One formula, `openProcurementRequirement`: max(scheduled demand - (available + open order quantity + open requisition quantity), 0), scoped to a project's own stock/orders/requisitions; the sweep's per-project requisitions and the endpoint both use it. The `projected_shortage` alert deliberately stays a supply-risk signal (confirmed incoming orders only).
- Tests: `inventory-5-3.pg.test.js` (16, real PostgreSQL): migration + preflight, auto lot, FEFO split + ledger invariant, expired/blocked, lot race, delivery -> MIR lot, transfer lot, issue/return cost at original cost, void rules, FEFO documents, adjustments, role matrix on both surfaces (project-bound seat stays in its warehouses, lists exclude company-level rows it cannot read by id), conversions, expiry alert, replenishment endpoints, the requirement formula.
- Found on the way: lists must not show rows the record route would deny (a project-bound caller saw company-level warehouse lots in a list); fixed in the route layer.
- Not done in 5.3, honestly: no ledger posting for adjustments (a write-off is a stock and valuation change, its GL entry belongs with Phase 8); supplier returns still take stock FEFO instead of from the GRN's own lot; no UI (Phase 6.6 builds lots/expiry screens, the delivery form has no lot fields yet); MCP has no inventory tools (not asked for by the plan).

## 2026-10-05: Closeout 5.4, procurement (spec 08), migration 0035

- Migration `0035_procurement_awards_cancel.sql`: `rfq_award_recommendations` (basis, justification, deviation from the comparison, status, workflow link; at most ONE live recommendation per RFQ by partial unique index), cancel columns on purchase requisitions and orders, grants (`procurement` approve/void/submit for procurement_manager, owner_ceo, coo), and the `rfq_award` workflow template (catalog entry for fresh installs plus an idempotent insert, because the catalog script only re-runs when its own file changes, so a catalog entry alone never reached an upgraded database). Existing awards (`rfqs.awarded_quotation_id`) are backfilled as approved `direct_award` recommendations so every award has a record; the preflight stops with a count if an award points at a quotation that is not on that RFQ.
- Award recommendation: create (compliant quotation of the RFQ, basis, justification of at least 10 characters; the bid comparison's own pick is recorded, a choice that departs from it is flagged and may not claim basis `comparison`), submit (workflow: procurement review, authority approval), decide (the last approval awards the RFQ in the same transaction through the unchanged `awardRfq`), withdraw. `POST /rfq/:id/award` stays as the owner/admin shortcut and now writes an approved `direct_award` record with a mandatory justification (everyone else recommends). Actions: submit, approve, void (withdraw), create.
- RFQ list and GET by id (lines, vendors, quotations with lines, the live recommendation). PR/PO update (draft only; a PO that has entered approval is not editable) and cancel (reason, who, when; the workflow instance is cancelled with it; a requisition with an order and an order with deliveries or supplier invoices refuse with the counts; a cancelled order stops counting as a commitment in the budget check). Cancel is the `void` action.
- Vendor performance and spend (`/api/procurement/analytics/*`, action `see_supplier_value`; every definition is documented at the top of `procurementAnalytics.js`: committed, delivered value, invoiced, on-time rate, acceptance rate, exception rate, response and win rate, average lead days; the score is the unweighted mean of the rates that exist and is labelled a summary, not a rating). A project-bound caller sees only its own projects. Also on `/api/v1` (rfqs, purchase-requisitions, purchase-orders families).
- **Bug found and fixed (reproduced first, mock regression test + the real-PG suite): a requester could not complete their own requester steps.** The workflow engine's self-approval guard refused the requester at their own Draft/Submit step, and the authorization list for a `requester` step was empty, so only an owner, an admin or the system could submit a requisition or issue an order. Everyone else got "You cannot approve or reject your own request". The guard now covers decisions only; a `requester` step is completed by the instance's own requester (and still by owner/admin/system, never by a stranger). The old engine fails the new test, the new engine passes it.
- Tests: `procurement-5-4.pg.test.js` (9, real PostgreSQL): migration + backfill + preflight, RFQ reads, recommendation rules, full approval chain with reject/withdraw paths, direct award, PR and PO edit/cancel incl. budget effect, exact analytics figures from a built dataset, role matrix on both surfaces; 2 new mock tests in `workflow-engine.test.js`.
- Not done in 5.4, honestly: no maker/checker or approval-limit amounts on the award (the limits table is the 5.1 follow-up and spec 10's maker/checker is 5.5); supplier performance has no stored scorecards; PR/PO cancel emits no outbox event yet (no route for it exists); no MCP tools were added (the plan does not ask).

## 2026-10-05: Closeout 5.5, commercial and finance (spec 09, 10), migration 0036

- Migration `0036_commercial_finance.sql` (additive, no data conflict possible so no preflight; the one backfill is exact and repeatable): `contract_parties`, `guarantees`, `insurances`, `payment_applications`, `invoice_lines`, `currency_rates` (rate NUMERIC(18,8)), `budget_versions`/`budget_lines`, `forecast_versions`/`forecast_lines` (one approved version per project by partial unique index), `commitment_adjustments`, `credit_notes`, `payment_batches`/`payment_batch_items`; variation columns (cause, responsibility, linked RFI and instruction, days impact, submitted/recommended/approved amounts; existing rows keep their amount as submitted, an incorporated one also as approved); workflow links on payment certificates and supplier invoices; `supplier_invoices.credited_amount`; the `finance:maker_checker` business rule (one config line); grants. Every money column is NUMERIC(15,2).
- Services: `commercialRecords` (parties, guarantees, insurances, rates with exact SQL conversion and inverse fallback, payment applications whose certification creates the draft certificate with the engine's retention maths, the `payment_certificate` workflow), `budgeting` (budget versions with maker/checker whose approval applies through `applyBudgetChange` and the audit trail, forecasts with actual-to-date from the shared cost view, commitment adjustments with history), `financeDocuments` (credit notes, payment batches, the `supplier_subcontract_invoice` workflow whose `approval` step runs the existing invoice approval so the accrual rule does not move). Posting stays in `glPosting` (client credit note) and `costAccrual` (supplier credit note: reverses its share of the invoice's own cost row and VAT under UNIQUE(source_type, source_id); a goods-only invoice accrued at the GRN is refused with `credit_note_cost_not_on_invoice`: that credit is a supplier return, decision 2).
- Credit notes reduce what is owed everywhere (`invoiceOutstanding`, `supplierInvoiceOutstanding`, AR/AP aging, invoice status); a credit can never exceed the outstanding (an overpayment is a refund).
- Variation: the approving decision may state `approved_amount`; incorporation makes it THE amount, so the revised contract value follows.
- Routes (internal API + /api/v1, typed errors with error_code/error_params); budget, forecast and commitment reads need `see_internal_cost` (decision 8: the Quantity Surveyor does not hold it); lifecycle verbs are their own actions (submit, approve, void, issue_financial_document, record_payment); record scope rules for every new `:id` route; payment batches are company-level and refuse a project-bound seat (`company_scope_required`). Reconcile script covers the new ledger kinds.
- Tests: `commercial-5-5.pg.test.js` (14, real PostgreSQL). Shown failing against the previous code (12 of 14 fail without the implementation), then green.
- Not done in 5.5, honestly: retention, advance recovery and other deductions are stored on the certificate but post nowhere: chart accounts and mapping keys are PROPOSED in the PR description and wait for the owner; `invoice_lines` and `payment_applications` have tables but invoice creation does not write lines yet; no MCP tools (the plan does not ask); no UI (Phase 6); bank accounts are the 5.1 `org_bank_accounts`.
# 2026-10-13: autonomous closeout start — A1 in progress

Branch: `closeout/batch-a-to-6`. A1 commit: `f364461`. Existing untracked `docs/CODEX_AUDIT_REPORT.md` was preserved.

Implemented but not yet committed: `orgService.createDelegation` now sets `is_active=false` for expired rows matching the same grantee, grantor, and module scope before checking for a live duplicate. The 5.1 PG suite now asserts that a matching live overlap returns `delegation_duplicate`, and that an expired grant is deactivated when renewed.

Commands and actual output:

```text
backend> npm run lint:guards
lint-guards: ok

backend> npm test -- --runInBand
Test Suites: 42 passed, 42 total
Tests:       928 passed, 928 total
Snapshots:   0 total
Time:        22.877 s
Ran all test suites.

repo> docker info --format '{{.ServerVersion}}'
error during connect: Get "http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.51/info": open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
exit=1
```

Real PostgreSQL verification is unverified because the Docker Desktop engine is unavailable. The audit report's previous PG result (565 passed, one delegation-fixture failure) is historical and is not evidence for this change. No other DB was used. A1 remains in progress pending the isolated PG rerun; see `STATE.md`.

## 2026-10-13: A2 webhook SSRF controls in progress

Changed `webhookService` to require HTTPS (HTTP only when `WEBHOOK_ALLOW_HTTP_LOCAL=true`), resolve and reject prohibited IPv4/IPv6 answers during registration and each delivery, pin the socket lookup to the checked address, never follow redirects, enforce a 10-second timeout, and cap response bodies at 64 KiB. Added mocked coverage for loopback/private/link-local/metadata/IPv6/mapped IPv4 targets, DNS rebinding, registration and delivery checks, redirect handling, and response size. No real external destination was contacted. A2 remains in progress pending full-batch gates and code review.

Actual command output:

```text
backend> npm test -- --runInBand src/scripts/__tests__/external-api.test.js
Test Suites: 1 passed, 1 total
Tests:       41 passed, 41 total
Snapshots:   0 total
Time:        1.614 s
```

## 2026-10-13: A3 webhook secret handling in progress

Webhook secrets are now AES-256-GCM encrypted at rest with an HKDF-derived key from `WEBHOOK_ENCRYPTION_KEY` (preferred) or the server `JWT_SECRET`. New webhook responses return the generated value once; GET/list service projections omit it. A `POST /webhooks/:id/rotate-secret` route rotates it once, with audit inside the same transaction. Existing plaintext rows remain deliverable and are encrypted on first delivery. Tests assert encrypted storage, decryption for delivery, no secret in create-service/read results, and rotation result redaction.

Actual focused output after A3:

```text
backend> npm test -- --runInBand src/scripts/__tests__/external-api.test.js
Test Suites: 1 passed, 1 total
Tests:       42 passed, 42 total
Snapshots:   0 total
Time:        1.295 s
```

## 2026-10-13: A4 transactional audit progress

`logActivity` now accepts the caller's query function and propagates DB errors. Its recent/user/module read helpers now propagate query failures instead of returning empty arrays. Added `auditedTransaction` to run state changes and activity writes on one DB client. Procurement's PR/PO creation, budget override, award recommendation and supplier-invoice workflow state changes, PR/PO edits/cancellations, and GRN creation now use it. Finance ledger's AP review resolution, credit-note actions, and payment-batch actions also use it. A lint guard checks the two critical route families for direct post-transaction audit calls.

Actual command output:

```text
backend> npm run lint:guards
lint-guards: ok

backend> npm test -- --runInBand src/scripts/__tests__/procurement.test.js src/scripts/__tests__/external-api.test.js src/scripts/__tests__/activity-audit.test.js src/scripts/__tests__/lint-guards.test.js
Test Suites: 4 passed, 4 total
Tests:       57 passed, 57 total
Snapshots:   0 total
Time:        1.567 s
```

Audit sweep is not complete: inspection found 168 route-level activity/audit call sites across the route tree. Other route families remain to inspect/convert. Real-PG failure-injection verification is unverified because Docker Desktop is unavailable.

## 2026-10-13: A5 typed error redaction and A6 migration inventory

`typedRoute.typedFail` now logs untyped details with a request correlation ID and returns a generic 500 envelope. PostgreSQL unique, reference, and check constraint violations map to stable typed codes. Procurement's local failure helper now uses the common boundary. Tests cover raw-message non-disclosure, correlation IDs, and constraint codes. The PG global setup now compares the exact set of versioned migration filenames and normalized SHA-256 checksums with `schema_migrations`, including same-count mismatches. `docs/MIGRATIONS.md` records the unreused 0030 gap; stale `docs/IMPLEMENTATION_STATUS.md` was replaced with a dated, evidence-based snapshot.

Focused output:

```text
backend> npm test -- --runInBand src/scripts/__tests__/migration-global-setup.test.js src/scripts/__tests__/typed-route.test.js
Test Suites: 2 passed, 2 total
Tests:       5 passed, 5 total
```

Full mock and guard rerun after the first agent-fixture issue was fixed:

```text
backend> npm test -- --runInBand
Test Suites: 45 passed, 45 total
Tests:       944 passed, 944 total
Snapshots:   0 total
Time:        4.422 s
Ran all test suites.

backend> npm run lint:guards
lint-guards: ok
```

The PG inventory precheck is unit-tested only; it has not been exercised against PostgreSQL because Docker Desktop is unavailable.


## 2026-10-13: A7 configurable limits (not yet committed)

Implemented migration 0037, an owner/admin `/api/approval-limits` endpoint, fail-closed approval limit service, persisted amount resolution for ID-based MCP money tools, and role/action enforcement during decision. The admin write and activity entry share a transaction. The role cap remains the approver's actual role even when project access comes from delegation; delegation grants project scope and does not add money authority. Defaults are provisional EGP values requiring owner/finance confirmation.

Verification: focused A7 unit suite 1/1, 4/4; full backend mock suite 46/46, 949/949; `npm run lint:guards` prints `lint-guards: ok`. Migration and PG execution are unverified because Docker Desktop is unavailable.

## 2026-10-13: A8 Playwright runner repair

The frontend lockfile declared `@playwright/test` but it was absent from `frontend/node_modules`, and the original npm script could not resolve the command. Added a project-local wrapper that launches the local Playwright CLI and pins browser downloads to ignored `frontend/.playwright-browsers/`, plus a `test:e2e:install` command. Documented the Windows PowerShell setup.

Evidence:

```text
frontend> npm ci --no-audit --no-fund
added 1346 packages in 13s

frontend> npm run test:e2e -- --list
Total: 78 tests in 7 files

frontend> npm run test:e2e:install
Chrome for Testing 153.0.8010.12 downloaded to frontend/.playwright-browsers/chromium-1243
Chrome Headless Shell 153.0.8010.12 downloaded to frontend/.playwright-browsers/chromium_headless_shell-1243
exit 0

frontend> npm run test:e2e
46 skipped
32 passed (1.4m)
exit 0

frontend> npm run test:ci
Test Suites: 17 passed, 17 total
Tests:       97 passed, 97 total

frontend> npm run i18n:check
i18n:check ok

frontend> npm run build
Compiled successfully.
```

The run includes the browser-only desktop/mobile journeys; Playwright reported skipped tests, including the gated real-backend and on-demand screenshot baseline cases. The backend-seeded journey coverage was not run because no isolated PostgreSQL is available.

## 2026-10-13: A9 security scan (implementation in progress)

Reviewed every Phase 1.5/1.6 item against the code. Existing protections confirmed: last active owner cannot be demoted/deactivated; `event_outbox` and webhook retry/dead-letter tables already exist; `matches()` handles exact, prefix wildcard and all-event subscriptions; uploads already had a 25 MiB size cap. Implemented the remaining local changes:

- Webhook wildcard subscriptions now receive every concrete durable outbox event directly. Added per-hook `project_ids` filtering at queue time and rechecked scope before delivery (migration 0039).
- Report routes enforce the report's catalog module and project scope, query only visible allowlisted columns, allow only catalog filters/sorts, and neutralize CSV formula prefixes.
- Internal media now requires uploader ownership or policy access to the linked project; external media requires ownership or an approved document with the role's explicit visibility. Photos without approval metadata are not shared externally.
- Uploads enforce file-size and magic/content checks. ZIP, legacy Office, XLS and XLSX formats are removed from the allowlist.
- Login uses one generic denial for unknown/disabled/bad-password/locked identities, a 5-failure/15-minute lockout stored in PostgreSQL (migration 0038), bcrypt cost 12 for new/changed credentials, and successful-login upgrade of weaker stored hashes.
- Production CORS origins must be exact HTTPS origins; `TRUST_PROXY` accepts only explicit booleans or hop counts; `X-Powered-By` is disabled.
- Untyped 500 JSON responses are logged with request ID and replaced with a generic correlated response.
- Authenticated v1 calls now increment a Postgres-backed subject limiter after authentication (migration 0040); the existing pre-auth IP limiter remains in place.
- Documented the MFA design stub and antivirus boundary in `docs/DECISIONS.md`. No paid/external provider was invoked.

Focused output:

```text
backend> npm test -- --runInBand src/scripts/__tests__/external-api.test.js src/scripts/__tests__/reporting.test.js src/scripts/__tests__/security.test.js src/scripts/__tests__/media-access.test.js src/scripts/__tests__/upload-validation.test.js src/scripts/__tests__/auth-lockout.test.js
Test Suites: 6 passed, 6 total
Tests:       76 passed, 76 total

backend> npm run lint:guards
lint-guards: ok
```

Latest full backend output:

```text
backend> npm test -- --runInBand
Test Suites: 48 passed, 48 total
Tests:       968 passed, 968 total
Snapshots:   0 total
Time:        5.012 s
Ran all test suites.
```

A9 was committed as `67ba313`. PostgreSQL migrations/integration remain unverified because Docker Desktop is unavailable. External security review is not signed. MFA has a design stub only. A4's route-wide audit sweep remains incomplete, so Batch A's PG exit gate is not met.

## 2026-10-13: A4 transactional audit continuation (local, not committed)

Converted equipment create/update/delete, assignment and usage-log creation; client CRUD; item create/update/soft-delete/restore; legal-document CRUD; and supplier CRUD/restore/material-link changes to write their activity row on the same transaction client as the business mutation. Generated codes and duplicate checks for new clients, suppliers and items now run inside the transaction. Equipment usage creation now also records an audit row.

Verification: `node --check` passed for all five changed route files; `git diff --check` passed; full backend mock suite passed (48 suites / 968 tests). A route-tree search then found 129 direct activity-audit call references (down from 168 at the initial A4 inventory); A4 remains incomplete and real PostgreSQL rollback behavior remains unverified because Docker Desktop is unavailable. This master-data slice is committed as `160e1a3`.

## 2026-10-13: A4 QHSE transactional audit continuation (local, not committed)

Moved all existing QHSE `logActivity` call sites into `auditedTransaction`, including quality tests, NCR creation and status/verification, safety inspections and incidents, multi-row ITP creation, WIR engine transitions, checklist templates, CAPA creation, mock-ups, calibration records, and punch-item engine transitions. ITP numbering and point inserts now share the transaction; WIR/punch workflow and outbox mutations use the transaction query passed through the domain engine.

Verification: `node --check` and `git diff --check` passed; full backend mock suite passed (48 suites / 968 tests); `npm run lint:guards` printed `lint-guards: ok`. A route-tree search then found 112 direct activity-audit call references. A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. The QHSE slice is committed as `5a635b4`.

## 2026-10-13: A4 HSE transactional audit continuation (local, not committed)

Moved all existing HSE `logActivity` call sites into `auditedTransaction`: incident and inspection creation, permit create/submit/decision, JSA and risk-assessment creation/status, toolbox-talk creation, and near-miss creation. The permit status engine transition also now runs inside a transaction. Number allocation for near misses now runs on the transaction query. Toolbox-talk PDF rendering remains after the database commit.

Verification: `node --check` and `git diff --check` passed; full backend mock suite passed (48 suites / 968 tests); `npm run lint:guards` printed `lint-guards: ok`. A route-tree search then found 102 direct activity-audit call references. A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. The HSE slice is committed as `4ff6d36`.

## 2026-10-13: A4 document-control transactional audit continuation (local, not committed)

Moved all document-control activity audit writes into the same transaction as document creation/versioning, submit/approve/reject/delete, RFI and submittal creation, document register/supersede, transmittal creation/transitions, and correspondence creation/status/amendment. Initial document version rows and transmittal item rows now share their parent transaction. RFI and submittal durable outbox events are inserted through the same transaction query.

Verification: `node --check` and `git diff --check` passed; full backend mock suite passed (48 suites / 968 tests); `npm run lint:guards` printed `lint-guards: ok`. A route-tree search then found 89 direct activity-audit call references. A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. The document-control slice is committed as `401b17a`.

## 2026-10-13: A4 site transactional audit continuation (local, not committed)

Moved site-report, engineer-instruction, site-visit, assembled-report, photo, sticky-note, and sticky-note-to-action activity writes into their business transactions. The report transaction now includes its audit alongside measurements and the durable report event; instruction number allocation and insertion share a transaction. Site engine operations receive the transaction query for multi-row changes.

Verification: `node --check` and `git diff --check` passed; full backend mock suite passed (48 suites / 968 tests); `npm run lint:guards` printed `lint-guards: ok`. A route-tree search then found 84 direct activity-audit call references. A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. The site slice is committed as `7c8dfc5`.

## 2026-10-13: A4 warehouse transactional audit continuation (local, not committed)

Moved stock movement creation/reversal, MIR quarantine release/reject, transfer creation/completion, and reservation creation/release activity writes into the business transactions. Stock balances and paired transfer movements are calculated on the same transaction client as the audit row.

Verification: `node --check` and `git diff --check` passed; full backend mock suite passed (48 suites / 968 tests); `npm run lint:guards` printed `lint-guards: ok`. A route-tree search then found 81 direct activity-audit call references. A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. The warehouse slice is committed as `16705ca`.

## 2026-10-13: A4 HR transactional audit continuation (local, not committed)

Moved employee and daily laborer creation/update, leave approval/rejection, and labor-payment activity writes into the same transaction as the change. Employee/laborer number generation now runs on the transaction query. Labor-payment audit joins its existing event-outbox transaction.

Verification: `node --check` and `git diff --check` passed; full backend mock suite passed (48 suites / 968 tests). A route-tree search then found 76 direct activity-audit call references. A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. The HR slice is committed as `0d9854b`.

## 2026-10-13: A4 materials transactional audit continuation (local, not committed)

Moved recipe and recipe-line create/update writes, replenishment-policy upsert/removal, activity rows, and recipe-change outbox events into shared transactions. Recipe headers, factor lines, audit rows, and durable recipe events now commit or roll back together. The manual replenishment sweep retains its post-run audit entry because the sweep is an independently leader-locked operation rather than one database mutation.

Verification: `node --check` and `git diff --check` passed; full backend mock suite passed (48 suites / 968 tests). A route-tree search then found 71 direct activity-audit call references. A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. The materials slice is committed as `3231bb5`.

## 2026-10-13: A4 handover transactional audit continuation (local, not committed)

Moved handover process start/transition and warranty-claim create/transition audit writes into their engine transactions. Starting handover now creates default package items in the same transaction as the process and audit. Asset-register creation also commits with its audit.

Verification: `node --check` and `git diff --check` passed; full backend mock suite passed (48 suites / 968 tests); `npm run lint:guards` printed `lint-guards: ok`. The raw route-tree grep then found 66 audit call expressions, including transactional calls; this is not a count of outstanding unconverted sites. A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. The handover slice is committed as `6f63618`.

## 2026-10-13: A4 finance transactional audit continuation (local, not committed)

Moved expense, invoice, and payment activity writes into their database transactions. Expense creation includes ledger posting, project-cost accrual, and activity in one transaction; invoice create/update/void audit joins the ledger transaction; payment create/void audit joins postings, allocation updates, status recalculation, audit events, and outbox events.

Verification: `node --check` and `git diff --check` passed for all three routes; full backend mock suite passed (48 suites / 968 tests); `npm run lint:guards` printed `lint-guards: ok`. The raw route-tree grep reports 66 audit call expressions, including transactional ones. A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. The finance slice is committed as `45cb4e1`.

## 2026-10-13: A4 consultant and work-order transactional audit continuation (local, not committed)

Moved consultant observation, RFI-response, and submittal-response activity rows into their locked engine transactions. Work-order creation/cancellation and completion verification now write activity on the same client as the corresponding mutation, progress recomputation, and verification event.

Verification: `node --check` and `git diff --check` passed for both routes; full backend mock suite passed (48 suites / 968 tests); `npm run lint:guards` printed `lint-guards: ok`. A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. This consultant/work-order slice is committed as `4106d86`.

## 2026-10-13: A4 maintenance and payroll transactional audit continuation (local, not committed)

Maintenance reminder create/update activity rows now share the corresponding SQL transaction. Payroll period creation includes all details and its activity row in one transaction; posting activity now shares the existing transaction with payroll status, journal, and cost allocation.

Verification command output:

```text
node --check src/routes/maintenance.js; node --check src/routes/payroll.js; git diff --check
exit code: 0

npm test -- --runInBand
Test Suites: 48 passed, 48 total
Tests:       968 passed, 968 total
Ran all test suites.

npm run lint:guards
lint-guards: ok
```

A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. This maintenance/payroll slice is not committed yet.

## 2026-10-13: A4 team assignment transactional audit continuation (local, pending commit)

Both `/api/team` and `/api/organizations/team` create/revoke paths now include the team-service mutation, policy audit event, and activity row in one transaction.

Verification command output:

```text
node --check src/routes/organizations.js; node --check src/routes/team-assignments.js; git diff --check
exit code: 0

npm test -- --runInBand
Test Suites: 48 passed, 48 total
Tests:       968 passed, 968 total
Ran all test suites.

npm run lint:guards
lint-guards: ok
```

A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. This team-assignment slice is committed as `b4a18ae`.

## 2026-10-13: A4 portal transactional audit continuation (local, pending commit)

Subcontractor instruction acknowledgements and payment application submissions now include their activity rows in the same transaction as the portal-engine mutation.

Verification command output:

```text
node --check src/routes/portal.js; git diff --check
exit code: 0

npm test -- --runInBand
Test Suites: 48 passed, 48 total
Tests:       968 passed, 968 total
Ran all test suites.

npm run lint:guards
lint-guards: ok
```

A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. This portal slice is committed as `2946d61`.

## 2026-10-13: A4 reports and client preview transactional audit continuation (local, pending commit)

Saved-view and scheduled-report creation now include their activity rows in the same transactions as their inserts. Client portal preview policy/activity audit rows now share a transaction.

Verification command output:

```text
node --check src/routes/reports.js; node --check src/routes/client.js; git diff --check
exit code: 0

npm test -- --runInBand
Test Suites: 48 passed, 48 total
Tests:       968 passed, 968 total
Ran all test suites.

npm run lint:guards
lint-guards: ok
```

A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. This reports/client slice is committed as `429c879`.

## 2026-10-13: A4 authentication transactional audit continuation (local, pending commit)

User creation, password change, and logout-all now write their activity rows inside the transactions that create the user or update credentials/session version.

Verification command output:

```text
node --check src/routes/auth.js; git diff --check
exit code: 0

npm test -- --runInBand
Test Suites: 48 passed, 48 total
Tests:       968 passed, 968 total
Ran all test suites.

npm run lint:guards
lint-guards: ok
```

A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. This auth slice is committed as `7d13d91`.

## 2026-10-13: A4 commercial and finance audit transaction continuation (local, pending commit)

Added `atomicAudited` and moved mutation audit rows into their transactions for variation edits/creation, contract parties, guarantees, insurance, currency rates, payment applications and certificates, budget/forecast versions, and commitment adjustments. Client contract activity now also shares its existing transaction. Operations without an existing audit entry remain unchanged in this slice.

Verification command output:

```text
node --check src/routes/commercial.js; git diff --check
exit code: 0

npm test -- --runInBand
Test Suites: 48 passed, 48 total
Tests:       968 passed, 968 total
Ran all test suites.

npm run lint:guards
lint-guards: ok
```

A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. This commercial slice is committed as `4762081`.

## 2026-10-13: A4 unit sales audit continuation (local, pending commit)

Unit-sale invoice activity now shares the transaction creating and posting the invoice. Bulk unit creation activity now shares the transaction inserting the generated units.

Verification command output:

```text
node --check src/routes/units.js; git diff --check
exit code: 0

npm test -- --runInBand
Test Suites: 48 passed, 48 total
Tests:       968 passed, 968 total
Ran all test suites.

npm run lint:guards
lint-guards: ok
```

A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. This unit-sales slice is committed as `761637c`.

## 2026-10-13: A4 sales and schedule transactional audit continuation (local, pending commit)

Building creation now writes its linked building/floor locations and activity entry in one transaction. Unit status changes write their activity entry in the same transaction. Schedule activity creation/progress updates and baseline replacement now include activity audit in the associated transaction; progress synchronization now propagates failure so the transaction rolls back instead of silently committing stale derived progress.

Verification command output:

```text
node --check src/routes/units.js; node --check src/routes/schedule.js; git diff --check
exit code: 0

npm test -- --runInBand
Test Suites: 48 passed, 48 total
Tests:       968 passed, 968 total
Ran all test suites.

npm run lint:guards
lint-guards: ok
```

A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. This sales/schedule slice is committed as `270c022`.

## 2026-10-13: A4 quantity measurement audit continuation (local, pending commit)

Quantity measurement creation now inserts its activity audit row in the same transaction as the measurement and derived progress updates.

Verification command output:

```text
node --check src/routes/quantities.js; git diff --check
exit code: 0

npm test -- --runInBand
Test Suites: 48 passed, 48 total
Tests:       968 passed, 968 total
Ran all test suites.

npm run lint:guards
lint-guards: ok
```

A4 remains incomplete; PostgreSQL rollback verification remains unavailable because Docker Desktop is unavailable. This quantity slice is committed as `c362950`.

## 2026-10-13: A4 organization audit transaction continuation (local, pending commit)

Organization, company profile, department, job-position, qualification, bank-account, and performance-score mutations now pass the transaction query to their services and insert their `audit_events` row before commit. Organization create also inserts its activity row before commit. Team assignment routes were converted in the prior `b4a18ae` slice.

Verification command output:

```text
node --check src/routes/organizations.js; git diff --check
exit code: 0

npm test -- --runInBand
Test Suites: 48 passed, 48 total
Tests:       968 passed, 968 total
Ran all test suites.

npm run lint:guards
lint-guards: ok

frontend: npm run test:ci
Test Suites: 17 passed, 17 total
Tests:       97 passed, 97 total

frontend: npm run i18n:check
i18n:check ok

frontend: npm run build
Compiled successfully.

frontend: npm run test:e2e (local project browser cache)
Running 78 tests using 8 workers
46 skipped
32 passed (18.5s)

docker info
Server: error during connect: Get "http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.51/info": open //./pipe/dockerDesktopLinuxEngine: Access is denied.
```

The first sandboxed Playwright attempt failed with `Error: spawn EPERM`; the requested browser gate passed on the elevated retry. Real PostgreSQL remains unverified because Docker Desktop is inaccessible. This organization slice is committed as `fb76335`.

## 2026-10-13: A4 schedule CSV import transaction continuation (local, pending commit)

Schedule CSV replacement/import now processes schedule activities, relationships, and the activity audit row through one transaction query. A failure during the import now rolls back the replacement and its writes together.

Verification command output:

```text
node --check src/routes/organizations.js; node --check src/routes/schedule.js; git diff --check
exit code: 0

npm test -- --runInBand
Test Suites: 48 passed, 48 total
Tests:       968 passed, 968 total
Ran all test suites.

npm run lint:guards
lint-guards: ok
```

Real PostgreSQL rollback remains unverified because Docker Desktop is inaccessible. This schedule-import slice is committed as `d573c35`.

## 2026-10-13: A4 agent approval transactional audit continuation (local, pending commit)

The agent approval decision claim now writes its activity audit row inside the same transaction as the conditional decision update. If the audit insert fails, the claim rolls back and remains available for a valid retry; the HTTP route no longer writes a post-operation duplicate audit.

Verification command output:

```text
node --check src/services/mcpService.js; node --check src/routes/agents.js; git diff --check
exit code: 0

npm test -- --runInBand
Test Suites: 48 passed, 48 total
Tests:       968 passed, 968 total
Ran all test suites.

npm run lint:guards
lint-guards: ok
```

Real PostgreSQL rollback remains unverified because Docker Desktop is inaccessible. This agent-approval slice is committed as `4f208c5`.

## 2026-10-13: A4 authentication login audit continuation (local, pending commit)

Successful login now clears the lockout counter, upgrades a legacy password hash if needed, and writes the login activity row inside one transaction.

Verification command output:

```text
node --check src/routes/auth.js; git diff --check
exit code: 0

npm test -- --runInBand
Test Suites: 48 passed, 48 total
Tests:       969 passed, 969 total
Ran all test suites.

npm run lint:guards
lint-guards: ok
```

Real PostgreSQL rollback remains unverified because Docker Desktop is inaccessible. This auth-login slice is committed as `01533ce`.

## 2026-10-13: A4 route-wide transactional audit guard (local, pending commit)

Expanded `lint:guards` to flag route `logActivity` calls that do not receive a transaction query, with a narrow documented exception for the leader-locked replenishment sweep completion entry. Added unit assertions for bound/unbound audit calls and made the route-wide scan fail if any violations exist.

Verification command output:

```text
node --check src/scripts/lint-guards.js; node --check src/scripts/__tests__/lint-guards.test.js; git diff --check
exit code: 0

npm test -- --runInBand
Test Suites: 48 passed, 48 total
Tests:       969 passed, 969 total
Ran all test suites.

npm run lint:guards
lint-guards: ok
```

Real PostgreSQL rollback remains unverified because Docker Desktop is inaccessible. This route-wide guard slice is not committed yet.

## 2026-10-13: Batch A final real-PostgreSQL and full-gate closeout

The first complete PG run exposed three stale/real issues. Fixed the delegation `Date` normalization comparison (A1; `dd268d4`), sent finance invoice/expense posting exceptions through the typed responder while asserting the existing `ledger_account_not_mapped` contract (A5; `2d757b7`), and added restrictive actor foreign keys for approval-limit rows (A7; `80c9005`). The approval-limit PG assertion now reflects the configurable finance-manager action cap. Existing A4 failure-injection tests and route-wide audit guard remain green.

Commands and output:

```text
npm run test:pg -- --silent
Test Suites: 56 passed, 56 total
Tests:       566 passed, 566 total
Snapshots:   0 total
Time:        92.031 s
```

This ran with `TEST_PG=1` and DB variables pointed only to the disposable local Docker Postgres 16 container `erp-closeout-test-pg-20261013`, database `construction_erp_test`, at `127.0.0.1:55439`. No `.env` file was read. Jest printed its expected `Force exiting Jest` notice after the complete passing summary.

```text
npm test -- --runInBand
Test Suites: 48 passed, 48 total
Tests:       969 passed, 969 total
Ran all test suites.

npm run lint:guards
lint-guards: ok

npm run test:ci
Test Suites: 17 passed, 17 total
Tests:       97 passed, 97 total
Ran all test suites.

npm run i18n:check
i18n:check ok

npm run build
Compiled successfully.

npm run test:e2e
Running 78 tests using 8 workers
46 skipped
32 passed (17.4s)
```

The first sandboxed Playwright launch returned `Error: spawn EPERM`; the elevated local retry above passed. Playwright skipped the real-backend seeded-user journeys and screenshot baselines, so those remain unverified. Batch A exit gates are met; Batch B local compose, full pilot smoke, and backup/restore are not covered by this result.
## 2026-10-13: Batch B1 local Docker staging foundation

Reworked Compose so the database starts from an empty named volume without a `db_dump` bind, migrations run in a separate one-shot service, and API startup waits for successful migration. PostgreSQL data and uploads use separate named volumes. Database, API, and frontend health checks gate service readiness; API runtime is the non-root `node` user. `backend:staging:env` generates strong random local credentials into git-ignored root `.env.docker` without printing secret values and refuses overwrite. Production-mode CORS permits plain HTTP only for localhost when the generated staging-only explicit flag is enabled; external HTTP origins remain rejected.

Verification:

```text
npm run staging:env
Generated local staging configuration at ...\\.env.docker. Keep it private; it is git-ignored.

docker compose --env-file .env.docker config --quiet
exit code: 0

docker compose --project-name erp-closeout-pilot-20261013 --env-file .env.docker build backend frontend
backend image tests: 47 suites passed / 953 tests passed (56 PG suites skipped in image build)
frontend production image: Compiled successfully.
exit code: 0

docker compose --project-name erp-closeout-pilot-20261013 --env-file .env.docker up -d
backend healthy; database healthy; frontend healthy
GET http://127.0.0.1:8090/api/health => status=ready, database=healthy
backend container user: node
DB volume: erp-closeout-pilot-20261013_db_data:/var/lib/postgresql/data
Uploads volume: erp-closeout-pilot-20261013_uploads_data:/app/uploads
migrate log: [migrate] all migrations completed (0 applied, 103 already applied)
```

The first build exposed and fixed a stale bootstrap test, then local HTTP CORS validation required an explicit localhost-only setting for this HTTP pilot. The existing `construction_erp_db_data` volume was inspected and left untouched; the pilot uses the unique project name above. The compose healthy-empty-seed check passed; role seeding/smoke and backup/restore remain for B2–B5.
## 2026-10-13: Batch B2 guarded staging users

Added `backend/src/scripts/seed-staging.js`, the `seed:staging` command, and guard tests. It requires `APP_ENV=staging`, a staging/stage/test DB-name segment, and a local/Compose database host. It creates one account for each of the canonical 24 internal + 9 external roles, separate procurement officer (requester) and procurement manager (checker) accounts, a no-assignment account, an expired-assignment account, one pilot project, and supplier/client organization seats. Re-runs rotate passwords, increment token versions, and clear/rebuild all seeder-owned seats. Passwords are stored in ignored root `.staging-users.json`, never printed. The old root and backend `create_test_users.js` entrypoints now fail with the replacement command.

Verification:

```text
npm test -- --runInBand --runTestsByPath src/scripts/__tests__/seed-staging.test.js
Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total

APP_ENV=production npm run seed:staging
Staging seed failed: Refusing to seed: APP_ENV must be exactly staging
(exit 1, checked before DB connection)

npm run seed:staging
Seeded 35 staging users across 33 canonical roles for PILOT-PTP-001.
Generated credentials are stored in ...\\.staging-users.json; passwords are not printed.

Re-run database verification (plaintext credentials and hashes excluded):
before_version=0
after_version=1
users=35
project_assignments=34
unassigned_rows=0
expired_rows=1
organization_seats=2
```

The pilot DB is reachable from the host only through `127.0.0.1:55440`; Compose still uses the private service DNS name and port 5432 internally. `git check-ignore .staging-users.json` is expected to match. The role seed passed; demo materials/BOQ and full procurement smoke remain B3/B4.
## 2026-10-13: Batch B3 procure-to-pay demo data

Added an idempotent guarded `seed:pilot-data` command. It uses the B2 target guard and one transaction to upsert three bilingual materials, cost codes, supplier rates, stock projections, a project warehouse, a BOQ section, and three priced BOQ lines. No real supplier messages or payments are sent; all data is explicitly fictional.

Verification:

```text
npm run seed:pilot-data
Seeded 3 demo materials, rates, stock rows, and BOQ items for PILOT-PTP-001.
Project 2; supplier 2; warehouse 5.

npm run seed:pilot-data
Seeded 3 demo materials, rates, stock rows, and BOQ items for PILOT-PTP-001.
Project 2; supplier 2; warehouse 5.

Post-rerun SQL:
materials=3
cost_codes=3
supplier_rates=3
warehouses=1
warehouse_stock=3
boq_items=3
boq_total=1376500.00

npm test -- --runInBand
Test Suites: 49 passed, 49 total
Tests:       972 passed, 972 total
Ran all test suites.

npm run lint:guards
lint-guards: ok
```

The pilot seed ran against `construction_erp_staging` only, through loopback port 55440. Next B4 verifies the procurement lifecycle through local HTTP APIs and scopes; B5 backup/restore remains separate.
### B3.1 comparison supplier addition (2026-10-13)

Extended the idempotent demo-data seed with a second fictional supplier and a distinct, higher rate for each material so the B4 RFQ comparison can exercise more than one bid. The re-run completed against the same local staging DB:

```text
npm run seed:pilot-data
Seeded 3 demo materials, rates, stock rows, and BOQ items for PILOT-PTP-001.
Project 2; suppliers 2, 4; warehouse 5.
suppliers=2
supplier_rates=6
```
## 2026-10-13: Batch B4 full local API smoke

The smoke is intentionally localhost-only, loads generated `.env.docker` settings without opening `.env`, reads ignored staging credentials programmatically, and never emits passwords or session tokens. It exercises each canonical role login, RBAC denials, requester/checker separation, full P2P, EN/AR headers, file access/deny, balanced journal and project-cost reconciliation, database integrity reconciliation, and session revocation.

```text
npm --prefix backend run smoke:staging
[PASS] health: API ready and database healthy
[PASS] login: 33 canonical roles and 5 staging edge/workflow accounts
[PASS] RBAC: no-assignment and expired-seat users receive 403; cross-project actor is scoped to its own project
[PASS] EN/AR: Accept-Language en/ar requests both include bilingual project names
[PASS] P2P: PR → RFQ → 2 quotations → comparison → award recommendation → separate checker/authority approval
[PASS] P2P: approved PO → partial delivery → MIR/GRN → matched supplier invoice → payment allocation
[PASS] media: uploaded PDF is readable by its uploader and denied outside project scope
[PASS] reconcile: 0 unbalanced chain entries; out-of-scope project unchanged; project cost view updated
[PASS] npm run reconcile
[PASS] logout: checker token revoked and rejected
STAGING_SMOKE_OK base=http://127.0.0.1:8090 project=PILOT-PTP-001 pr=13 rfq=13 po=12 grn=4 invoice=4 payment=4
```

The smoke exposed two implementation defects and they were fixed: `createMir` now carries the PO project ID, which makes approval evaluate against the right project grant; logout-all is now authenticated self-service, bound only to `req.user.id`, and no longer requires a business-module permission. Focused checks: route guard + permission isolation, 2 suites / 424 tests passed. The Docker image build passed the backend mock tests (49 suites / 958 tests; 56 PostgreSQL suites excluded from this image gate).

Backup confirmation was not assumed: local custom-format `pg_dump` was restored into `closeout_pilot_restore_check`; a read-only query returned 305 tables. Only this temporary restore database and `/tmp/closeout-pilot-restore-check.dump` were removed. The `RECONCILIATION_BACKUP_CONFIRMED=true` variable was set only on the final smoke process after restore verification and removed from the PowerShell process environment afterward. B5 still requires its committed rehearsal script, migration dry-run, data-cleaning report, and before/after sequence/count output.

Batch B4 follow-up verification on a fresh disposable PostgreSQL 16 container

A fresh `construction_erp_test` container on `127.0.0.1:55441` was created with a process-generated temporary password, migrated from empty (103 migrations applied; highest versioned SQL migration 0041), and removed with its anonymous volume after the run. No existing test/pilot DB credentials were read.

```text
npm run migrate
[migrate] all migrations completed (103 applied, 0 already applied)

npm run lint:guards
lint-guards: ok

npm run test:pg
Test Suites: 56 passed, 56 total
Tests:       566 passed, 566 total
Time:        79.554 s
Ran all test suites.
```

The PG gate includes the new golden-chain assertion that MIR retains the purchase-order project scope. Backend mock gate also passed on the host with a test-only JWT value: 56 skipped, 49 passed suites; 566 skipped, 958 passed tests. The temporary local Postgres container and volume were removed after the gate.

## 2026-10-13: Batch B5 local backup/restore rehearsal

Added `npm run backup:rehearse`, guarded to `APP_ENV=staging`, a staging/test DB-name segment, and loopback host. It creates a custom-format database dump and uploads snapshot, verifies the dump file, restores into a differently named temporary DB, compares exact row counts and all sequence maxima, runs migration dry-run, reconciliation with the backup-confirmed flag set only after verification, and the read-only data-cleaning report. It removes only the temporary restore DB and container-side scratch dump; the verified backup bundle and exact before/after JSON report remain under the OS temp directory.

```text
npm --prefix backend run backup:rehearse
BACKUP_VERIFIED database=construction_erp_staging dump_bytes=1127764 uploads_files=4 uploads_bytes=292
RESTORE_VERIFIED database=construction_erp_staging_restore_1791898190875 tables=237 rows=3323 sequences=226
SNAPSHOT_COUNTS before={tables:237,rows:3323,users:77,projects:2,PR:13,RFQ:13,PO:12,deliveries:10,MIR:10,GRN:4,supplier_invoices:4,payments:4,journal_entries:8}
SNAPSHOT_COUNTS after={tables:237,rows:3323,users:77,projects:2,PR:13,RFQ:13,PO:12,deliveries:10,MIR:10,GRN:4,supplier_invoices:4,payments:4,journal_entries:8}
SEQUENCE_MAXIMA before/after matched exactly across 226 sequences
SNAPSHOT_REPORT C:\Users\joe-y\AppData\Local\Temp\erp-closeout-backup-1791898190847\snapshot-before-after.json
MIGRATION_DRY_RUN_OK entries=103
[OK] payment allocations do not exceed payment amounts: 0
[OK] client invoice allocations do not exceed invoice amounts: 0
[OK] retention releases do not exceed held balances: 0
[OK] client payment allocations stay within one project: 0
[OK] supplier payment allocations stay within one project: 0
[OK] project warehouse transfers do not cross projects: 0
[OK] active workflows have a current pending step: 0
[OK] stock ledger reconciles with the warehouse_stock projection: 0
[OK] project cost rows reconcile with their ledger entries: 0
[OK] AP and AR money moves stay tied to live documents: 0
[OK] approvals mirror their workflow instances: 0
RECONCILE_OK
[]
BACKUP_RESTORE_REHEARSAL_OK backup_dir=C:\Users\joe-y\AppData\Local\Temp\erp-closeout-backup-1791898190847
```

Focused B5 checks passed 1 suite / 2 tests, syntax check passed, and `npm run lint:guards` printed `lint-guards: ok`. The rehearsal is local only; it did not read or print `.env` contents. B6 PowerShell instructions and full Batch B gates remain.

## 2026-10-13: Batch B6 Windows staging runbook

Added `docs/STAGING.md` with copy-paste Windows PowerShell commands for generated ignored configuration, Compose start/health checks, staging and demo seeds, full smoke, backup/restore rehearsal, account-file location, Compose status/logs, and stop/restart. It warns against displaying env or password files and against removing persistent pilot volumes. `git diff --check` passed for the documentation edit.

## 2026-10-13: Batch B end-of-batch gate

```text
npm run lint:guards
lint-guards: ok

npm test -- --runInBand --testPathIgnorePatterns decision-record
Test Suites: 56 skipped, 50 passed, 50 of 106 total
Tests:       566 skipped, 960 passed, 1526 total

npm run test:pg
Test Suites: 56 passed, 56 total
Tests:       566 passed, 566 total
Time:        90.192 s
Ran all test suites.
```

The real-PG gate ran after applying all 103 migrations to a new loopback-only PostgreSQL 16 container (`construction_erp_test`, port 55442) with a generated one-run password; the container and anonymous volume were removed afterward. The earlier attempt to reuse an existing test-container password was rejected by automatic review, so no existing secret was read; the fresh isolated container completed the required gate.

```text
npm run test:ci
Test Suites: 17 passed, 17 total
Tests:       97 passed, 97 total

npm run i18n:check
i18n:check ok

npm run build
Compiled successfully.

npm run test:e2e
46 skipped
32 passed (18.9s)
```

The first sandboxed Playwright invocation returned `spawn EPERM`; the same local gate passed when rerun with elevated Windows process permissions. The final Compose health check returned `status=ready`, `database=healthy`; backend, database and frontend containers were healthy. Batch B commits: B1 `6c7a1ee`, B2 `6ecf390`, B3 `237a6cf`, B3.1 `1e90f7c`, B4 `0a41103`, B5 `a918f9f`, B6 `157711b`.

## 2026-10-13: Batch C1 shared UI kit

```text
npm run test:ci
Test Suites: 20 passed, 20 total
Tests:       103 passed, 103 total

npm run i18n:check
i18n:check ok
```

Coverage added for validation rules, structured server field errors, accessible field labels/error descriptions, and permission-aware action visibility. Existing dialog and shell suites cover reason/confirm dialogs and generic loading/empty/error states. Upload controls now localize labels/errors and enforce configurable client-side file count and size limits. The first i18n check identified one inline RTL expression; it was removed by inheriting the document direction, and the final check above passed. Production build and full Batch C exit gates will run at Batch C close.

## 2026-10-13: Batch C2 procurement workspace (implementation in progress)

Added the project procurement workspace and the project-scoped supplier invoice register. RFQ bid comparison now follows the effective `see_supplier_value` policy action. The focused workspace test passed (1 suite / 1 test), `i18n:check` passed, the frontend production build compiled, backend syntax checks passed, and `git diff --check` was clean. A prior local procurement API smoke passed the main procurement journey and invoice register scope assertions but stopped at reconcile because Windows returned `spawnSync node.exe EPERM`; record it as incomplete. The Docker image build also invoked the backend mock suite as part of its test stage (50 suites / 960 tests passed; 56 PostgreSQL suites skipped). Per the user's instruction, subsequent phase changes will use ticket-related tests and broader suites will be reserved for batch exits.

## 2026-10-13: Batch C3 effective-permission navigation (implementation in progress)

Login now returns unique effective module/action pairs. Sidebar visibility follows those grants, including the supplier-value requirement for quotation comparison, exact policy module keys for inventory and external portals, and fail-closed behavior for explicit empty grants. The focused shell test passed 1 suite / 16 tests; `node --check src/routes/auth.js` and `git diff --check` passed. No broad suite was run for this slice.

## 2026-10-13: Batch C4 procurement browser journey (implementation in progress)

Added a desktop Playwright journey for project-scoped purchase request creation and submission. The test asserts the payload sent to the API mock and the submitted state rendered in the workspace. The focused command passed 1 test. The default sandbox process launch returned `spawn EPERM`; an elevated local retry of the same single test passed. Since the test mocks the API, this verifies frontend interaction only; the C2 API smoke assertions cover the backend project scoping checks.

## 2026-10-13: Batch C3 follow-up — project tabs use scoped grants

Removed the remaining role-key map and FULL fallback from project navigation. The login response preserves `project_id` on each effective module/action grant, project tabs evaluate those grants for the active project, and financial cards require the internal-cost visibility action. Unknown roles and empty grants fail closed. Focused frontend tests passed 3 suites / 26 tests. The project-page browser file passed 6/6 on desktop and mobile, including the scoped site engineer and Arabic RTL cases. `node --check src/routes/auth.js` and `git diff --check` passed. No full suite was run for this slice.

## 2026-10-13: Batch C4 real procurement browser journey

Implemented the real backend browser journey and closed the schema/UI gaps it found. The project procurement read model now resolves delivery and GRN project ownership through purchase orders because those receipt tables have no `project_id`. PR/RFQ entry supports a material selector and sends the material ID in each line. Draft POs expose the approval-start action, and the existing PO issue route now records the state change through the audited transaction helper.

The journey exercised a requester plus distinct accountant, purchasing manager, finance manager, inventory checker, and owner/requester actors through PR submission and approval, two-supplier RFQ quotations, award review, PO approval, delivery, MIR approval, GRN, supplier invoice approval, and a supplier payment allocation. It passed on desktop and mobile in English and Arabic. An unassigned pilot user received 403 from `GET /api/procurement/project/:id`.

Focused evidence: live Playwright 4/4; denial Playwright 1/1; `ProcurementWorkspace.test.js` 1/1; `i18n:check`; production build; backend route syntax check; and read-only database reconciliation (11 checks, 0 violations). The reconciliation function was invoked directly because the CLI wrapper requires a separately confirmed restorable backup; the function itself is read-only. No full suite was run for this slice, following the user's test cadence.

The first attempts found a local API origin mismatch, form selectors that assumed an explicit `type="submit"`, and role assumptions that did not match configured workflow resolvers. The harness and actor handoffs were corrected. The four final live runs each completed the full chain.

Batch C is complete. D UAT execution requires human pilot users; E finance account mappings stay provisional until the finance owner confirms them. Continue with the UAT guide, provisional enablement, and Phase 5.6–6 work.

## 2026-10-13: Batch D UAT preparation

Added `docs/UAT_PILOT.md`: pilot-only P2P scope, finance-posting exclusion, account keys without credentials, role-by-role scripts, seeded checklist, deferred items, defect template, and human signoff table. It points to the local-only startup and smoke procedure in `docs/STAGING.md`. The guide does not claim business UAT is complete. It notes that the seeded storekeeper lacks procurement-workspace view access, so the receiving maker script uses the enabled workflow owner pilot actor. `git diff --check` passed; this documentation-only slice did not require automated tests.

## 2026-10-13: Batch E1 provisional GL account mapping foundation

```text
Migration runner: [migrate] 0042_provisional_gl_account_mappings.sql ...
[migrate] all migrations completed (1 applied, 103 already applied)

backend npm test -- --runInBand src/scripts/__tests__/gl-account-mappings.test.js
Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total

frontend npm test -- --watchAll=false --runInBand src/components/layout/Shell.i18n.test.js
Test Suites: 1 passed, 1 total
Tests:       17 passed, 17 total

npm run i18n:check
i18n:check ok
```

The additive migration marks existing mappings provisional, inserts new configurable keys against existing chart codes, and links a certificate to at most one client invoice. Mapping changes and owner confirmations use transactional activity audit. Settings is bilingual and displays status; an edit clears confirmation. The finance owner has not confirmed the default account purposes. No broad suites were run.

## 2026-10-13: Batch E1/E2 certificate postings and invoice lines

Client certificate final approval creates a linked draft invoice with bilingual typed invoice lines; invoice detail returns those lines. Issuing that invoice posts balanced receivable, revenue, output-tax, retention, advance-recovery, and deduction entries. Subcontractor certificate final approval posts balanced cost, input-tax, payable, retention, advance-recovery, and deduction entries. Voids require a reason and reverse the original entries and retention/advance ledger movements; paid certificates cannot be voided, and a client certificate cannot be voided until its linked invoice is void or cancelled.

The focused `certificate-gl-posting.test.js` passed 1 suite / 5 tests. `node --check` passed on changed services and routes. Migration `0043_subcontractor_certificate_postings.sql` applied locally (1 applied, 104 already applied). No broad suites or full live certificate workflow were run. Finance account purposes remain provisional pending finance-owner confirmation.

## 2026-10-13: Batch E3/E4 lot returns and forecast approval

Migration `0044_lot_specific_supplier_returns.sql` applied to the isolated `construction_erp_closeout_test_20261013` DB (1 applied, 105 already applied). Lot-tracked supplier returns now require the GRN line, attach that GRN line's lot to the return record and stock movement, and retain the existing cost reversal. Return creation is transactionally audited and expected return errors have typed status/code responses.

Forecast maker/checker now prevents the creator from approving their own version when the finance maker/checker business rule is enabled. An approved forecast feeds project ETC; EAC remains actual + accrued + ETC. Focused test output: supplier-return PG cases 3 passed; forecast, credit-note regression, role matrix and certificate-ledger tie-out cases 4 passed. No full suites were run. The first focused test attempt exposed an ambiguous forecast query and ordinary-invoice certificate detection issue; both were fixed and the selected regression tests passed afterward.

## 2026-10-13: Batch E5 finance workbench and retention release

Added the project Finance workbench for applications/certificates, budget and forecast versions, client and supplier credit notes, payment batches, and retention releases. Retention releases are project-scoped, use idempotency keys, respect posted retention balances, create balanced GL entries and can be voided with a reason and reversing entry. Direct release creation through the older retention endpoint is rejected.

Migration `0045_retention_release_postings.sql` was applied to local staging and the isolated PostgreSQL test database. Focused PostgreSQL cases passed 2/2; Finance workbench component test passed 1/1. `i18n:check`, production build, backend syntax checks, and `git diff --check` passed. No full suite was run, per the user's test cadence. Finance mappings remain provisional pending finance-owner confirmation; human UAT remains outstanding.

## 2026-10-13: Phase 5.6–6 code audit and execution plan

Reviewed the Phase 5.6–6 checklist in `ERP_CLOSEOUT_PLAN.md` against current backend routes/migrations/services and frontend routes/components. `PLAN_5_6_TO_6.md` records evidence, stale source-plan entries, open work, acceptance criteria, focused checks, dependencies and external decisions. Key corrections: the incident merge migration/view, schedules, handover records, project setup APIs and procurement/finance workspaces are already present; remaining work is narrower and tied to missing formal workflows, registers and screens. The plan must be committed before phase implementation.

## 2026-10-13: Phase 5.6.1 observation record completeness

Observations now include due date, drawing reference and an optional project drawing link. Before/after uploads attach to the shared photo model after server-side owner, project, type and portal-visibility checks. Consultant media access is constrained to the assigned organization/project. `myReviews` returns the due date as a stable date-only string. The consultant portal's raise action is a bilingual form backed by the upload component and selects only the consultant's assigned projects and approved visible drawings.

Verification: migration 0046 applied to the disposable PostgreSQL database; focused real-Postgres round-trip/scoping test 1/1; consultant/media mock tests 18/18; portal component test 1/1; locale check and frontend build passed; syntax and diff checks passed. No broad suite was run.

## 2026-10-13: Phase 5.6.2 formal WIR inbox and SLA read

Consultant `My Reviews` and dashboard WIR items now come from the formal `wirs` register at `consultant_review`, rather than the legacy `sub_work_verifications` table. Inbox rows include drawing reference and inspection date. Due timestamps are calculated from the open consultant workflow step's `opened_at` and configured `workflow_steps.sla_hours`; if no SLA or opening time is configured, the row stays undated.

Focused verification on the disposable local PostgreSQL database: `consultant-observation.pg.test.js` passed 1 suite / 2 tests, including formal WIR inbox sourcing, configured 24-hour SLA, and denial by project filter. `consultant.test.js` passed 1 suite / 12 tests. No full suite was run. Inspection decisions/recommendations and the focused inbox component test remain open under 5.6.2.

## 2026-10-13: Phase 5.6.2 consultant WIR result action

Added `POST /api/consultant/wirs/:id/result`. It accepts the formal WIR result vocabulary, locks and checks the WIR against the consultant's assigned project inside the audited transaction, delegates state changes to the QA/QC engine, and records the activity audit and workflow action history together. Out-of-project records return a typed not-found response.

Focused verification: `consultant-observation.pg.test.js` passed 1 suite / 3 tests against the disposable local PostgreSQL database, including approved-with-comments state, terminal workflow state, two formal workflow actions, and out-of-project denial. `consultant.test.js` plus `qaqc.test.js` passed 2 suites / 27 tests. Changed route/service/test files passed `node --check`. The first PG attempt found a test expectation mismatch (there are two workflow action entries, one for the decision and one for terminal close); the assertion was corrected and the same test file passed. No full suite was run. Recommendation records and inbox UI remain open.

## 2026-10-13: Phase 5.6.2 consultant WIR portal actions

The consultant My Reviews list now shows formal WIR review actions (approve, approve with comments, reject, reinspect) and posts the selected decision to the audited consultant endpoint. Action controls and empty/error text use paired English/Arabic portal locale keys; repeat submissions are disabled while the request is active.

Focused verification: `PortalDashboard.test.js` passed 1 suite / 2 tests, including the selected result payload to `/api/consultant/wirs/34/result`; `npm run i18n:check` returned `i18n:check ok`. No full frontend suite or production build was run.

## 2026-10-13: Phase 5.6.2 variation and certificate recommendations

The consultant inbox now includes variations at their formal `consultant_recommendation` step and payment certificates at `consultant_client`, with workflow-step SLA due times. New consultant endpoints use the existing variation/certificate workflow services, verify assigned-project scope while holding the target row lock, and append audit/workflow actions transactionally. The portal review rows now expose bilingual approve/reject recommendation actions. Migration `0047_consultant_review_permissions.sql` backfills the consultant role's already-declared create/edit/submit/approve/reject grants on upgraded databases, with project record-scope and decision-action mappings in policy.

The certificate integration test exposed that the consultant stage incorrectly made a certificate `certified` and could trigger financial effects before the finance-manager stage. `decideCertificate` now distinguishes intermediate `finance_review` from final `certified`, checks the active workflow instance to allow the finance step, and posts/creates final outputs only when the workflow is approved.

Focused verification: `npm run migrate` applied 0047 (1 applied, 108 already applied) to the disposable local PostgreSQL DB. `consultant-observation.pg.test.js` passed 1 suite / 5 tests, including the live scoped WIR decision route; the named certificate lifecycle test in `commercial-5-5.pg.test.js` passed 1/1 with consultant recommendation followed by finance finalization. Backend consultant/QHSE/scope tests passed 35/35; policy module/action coverage passed 4/4. `PortalDashboard.test.js` passed 1 suite / 2 tests for WIR, variation and certificate decisions; `npm run i18n:check` passed, changed JS files passed syntax checks, and `git diff --check` passed. Early focused attempts found stale role grants and fixture/assertion mismatches; migration 0047 and corrected fixtures resolved them. One forced Jest shutdown printed a Windows libuv assertion after reporting PASS, so the same route test was rerun without `--forceExit` and exited 0. No full suite was run.

## 2026-10-13: Phase 5.6.2 engineer-instruction recommendations

Added migration `0048_engineer_instruction_recommendations.sql` with a single linked recommendation record per instruction. Consultants see unreviewed issued/acknowledged instructions in My Reviews and can submit an approve/reject recommendation with a comment. The endpoint checks the consultant role and assigned project under a row lock, refuses a second recommendation or instructions outside the eligible lifecycle states, and records activity audit in the same transaction. The instruction lifecycle remains owned by the site instruction register. Policy maps the endpoint action and resolves its target project. The portal exposes recommendation controls using existing localized labels.

Focused verification on the disposable local PostgreSQL database: migration 0048 applied (1 applied, 109 already applied); `consultant-observation.pg.test.js` passed 1 suite / 6 tests; module override and record-scope tests passed 2 suites / 9 tests; `PortalDashboard.test.js` passed 1 suite / 2 tests; `npm run i18n:check` returned `i18n:check ok`; changed backend JavaScript passed `node --check`; `git diff --check` passed. The first HTTP fixture returned 403 because it omitted the consultant's project permission row; the fixture was corrected and all 6 PG tests then passed. No full suite was run.

## 2026-10-13: Phase 5.6.3 retire single-answer RFI/submittal writes

The single-answer `/api/docs/rfis/:id/respond` and `/api/docs/submittals/:id/respond` routes remain mounted for compatibility, including through their v1 paths, but now refuse writes with HTTP 410 and `staged_response_required`, including the replacement v1 route. Migration `0049_backfill_rfi_submittal_response_history.sql` copies pre-existing answer/response values into `rfi_responses` and `submittal_revisions` without deleting or overwriting the original fields; its `NOT EXISTS` guards make the backfill idempotent. Consultant read endpoints return the parent record, latest history item, and ordered full history. API v1 exposes those history reads and the staged RFI response writer. The staged RFI route now accepts acknowledgement, matching its service transition rules.

Focused verification on the disposable local PostgreSQL DB: migration runner applied 0049 (1 applied, 110 already applied); `consultant-observation.pg.test.js` passed 1 suite / 7 tests, including idempotent backfill, staged acknowledgement/history, v1 read parity, cross-project denial, and both v1 deprecation responses with legacy data unchanged. `external-api.test.js`'s v1 router build/remount check passed 1/1; module override and record-scope tests passed 2 suites / 9 tests; changed backend JS syntax checks and `git diff --check` passed. No full suite was run.

## 2026-10-13: Phase 5.6.4 client portal actions

Added scoped client variation decisions and project-document acknowledgements to the action center. Variation responses advance the existing workflow and record workflow action history; document acknowledgements persist actor, organization, comment, and timestamp and update the document status. Both routes write the activity audit transactionally, enforce active assignment at mutation time, and have v1 mappings and policy grants. The client portal now shows localized action controls and hides them in read-only preview mode. Migrations `0050_client_document_acknowledgements.sql` and `0051_client_action_permissions.sql` add the acknowledgement register and upgraded-client role permissions.

Focused verification: migration runner applied 0050 and 0051 plus the policy role-grant update (3 applied, 110 already applied) to the disposable PostgreSQL DB. `client-actions.pg.test.js` passed 4/4, including multiple projects, expiry and cross-organization denial, formal variation history, acknowledgement idempotency, and HTTP audit. Client portal, module override, and record-scope tests passed 19/19; `PortalDashboard.test.js` passed 3/3; the v1 router remount check passed 1/1; `i18n:check`, changed-file syntax checks, and `git diff --check` passed. No full suite was run, following the user's test cadence.

## 2026-10-13: Phase 5.6.5.a subcontractor submission intake and history

The subcontractor portal now validates the seven submission categories with category-specific fields, requires an awarded package in the selected project, and verifies related NCR/observation/variation records against that same package. Submissions remain intake rows and do not change formal registers. A scoped history endpoint returns only the exact assigned organization/project pairs and allowlisted payload fields. Creation and activity audit commit in one transaction. The portal replaces the seven record-ID prompts with a bilingual form and shows submission status/history. Migration `0052_subcontractor_portal_permissions.sql` creates and backfills the external portal action rows. Supplier compliance cards now label expired, within-30-day, and within-90-day documents in EN/AR.

Focused verification: migration 0052 applied to the disposable PostgreSQL DB; after restoring the unchanged policy migration helper checksum, the migration runner reported 1 applied, 113 already applied. `subcontractor-submissions.pg.test.js` passed 2/2; `portal.test.js` and `policy-migration.test.js` passed 35/35; `PortalDashboard.test.js` passed 5/5; the v1 router remount check passed 1/1; `i18n:check` passed. No full suites were run.

## 2026-10-13: Phase 5.6.5.b formal external inspection registers

The subcontractor dashboard now lists formal WIR records for active packages belonging to the caller's assigned organization, with WIR number, status, result, and inspection date. The supplier dashboard includes MIR number, status, project, and decision date, scoped to deliveries from that supplier's purchase orders. The portal renders both lists with paired EN/AR labels and localized statuses. No schema or permission migration was required.

Focused verification: `portal.test.js` passed 15/15, including organization isolation; `subcontractor-submissions.pg.test.js` passed 3/3, including real-PostgreSQL organization and active-project WIR isolation; `PortalDashboard.test.js` passed 5/5; `i18n:check` passed. No full suite was run.

## 2026-10-13: Phase 5.6.5.c subcontractor RFI and submittal forms

Replaced the subcontractor RFI and submittal prompt submissions with bilingual forms. Package selection uses the assigned package list and derives the project/package IDs for the request. The RFI form captures subject, question, priority and optional due date; the submittal form captures title, type and recipient. Submission failures appear in the form.

Focused verification: `PortalDashboard.test.js` passed 7/7, including assigned-package-derived RFI payload and submittal type/recipient payload; `i18n:check` passed. No backend or whole-suite tests were needed for this frontend-only change.

## 2026-10-13: Phase 5.6.5.d scoped RFI and submittal follow-up actions

RFI acknowledgements now use a record selector populated by the user's package-scoped RFI list. Returned submittals have a separate dashboard list restricted to `resubmit_required` records on the user's packages; the portal resubmission form selects from that list and captures revision comments. Both forms provide localized labels and error handling.

Focused verification: `portal.test.js` passed 16/16, including returned-submittal package isolation; `PortalDashboard.test.js` passed 8/8, including acknowledgement and resubmission payloads; `i18n:check` passed. No full suite was run.

## 2026-10-13: Phase 5.6.5.e remaining subcontractor action forms

Replaced subcontractor package and instruction acknowledgement, quantity claim, and payment application prompts. Instruction choices include only issued instructions assigned to the user's package or the user; quantity forms draw the BOQ item from the chosen awarded package; payment forms derive project/package scope from that same package. Empty BOQ availability is explained in the form.

Focused verification: `portal.test.js` passed 17/17, including assigned instruction filtering; `PortalDashboard.test.js` passed 9/9 covering package/instruction acknowledgements and quantity/payment payloads; `i18n:check` and `git diff --check` passed. No full suite was run.

## 2026-10-13: Phase 5.7.1 canonical incident source

QHSE's legacy incident routes and site daily-report aggregation now read/write the canonical `incidents` table. The HSE migration's `safety_incidents` view remains for compatibility only. Strengthened the real-PostgreSQL conversion regression to check exact imported IDs and data, compatibility-view row parity, rerun idempotency, and sequence continuation.

Focused verification: the named `legacy HSE conversion leaves usable sequences` case in `migration-runner.pg.test.js` passed 1/1; the named `every source census is exactly its own count` case in `site.test.js` passed 1/1; a source scan found no internal route/service incident SQL using the legacy name. No full suite was run.

## 2026-10-13: Phase 5.7.2.a RFI impacts and project references

Added versioned migration `0053_rfi_project_impacts.sql` for nullable project location, work package, cost impact and schedule impact. RFI creation verifies optional location/package references belong to its project; the document-control read adds display names/codes; consultant reviews include those fields; the bilingual RFI form chooses project references from the location and work-package APIs. The subcontractor RFI view remains allowlisted and omits cost/schedule impact data. Existing workbench certificates, observations and transmittal/document registers were confirmed and not duplicated.

Focused verification: migration runner applied 0053 (1 applied, 114 already applied) to the disposable PostgreSQL database. `rfi-impacts.pg.test.js` passed 2/2, including cross-project refusal; `consultant.test.js` + `portal.test.js` passed 30/30; `ProjectDocuments.test.js` + `PortalDashboard.test.js` passed 10/10; `WorkPackageSelect.test.js` passed 4/4; `i18n:check` passed. No full suite was run.

## 2026-10-13: Phase 5.7.2.b QA/QC certificate register

Spec 15's QA/QC certificate register is distinct from finance payment certificates. Added versioned migration 0054 and project-scoped certificate CRUD for type, title, issuer, issue/expiry dates, status, and optional same-project controlled-document/MIR links. The QHSE screen now supports register create/read and active-to-superseded/revoked transitions in EN/AR.

Focused verification output: `[migrate] 0054_qaqc_certificate_register.sql ...`; `[migrate] all migrations completed (1 applied, 115 already applied)` on `construction_erp_closeout_test_20261013`; `qaqc-certificates.pg.test.js` passed 1 suite / 3 tests; `QHSECertificatesTab.test.js` passed 1 suite / 2 tests; `i18n:check ok`; `node --check src/routes/qhse.js` exited 0. No full suite was run.

## 2026-10-13: Phase 5.7.2.c controlled-document fields and confidentiality

Migration 0055 adds issue date and confidentiality to the existing controlled-document register. Existing explicitly shared portal documents are backfilled as public, and external audience access now also requires public classification across portals, consultant drawing links, search, acknowledgements and protected media. The upload form captures register metadata in EN/AR, and the controlled register displays dates and classification. Strict date-only validation plus response normalization prevents Cairo timezone shifts.

Focused verification output: `[migrate] 0055_document_register_confidentiality.sql ...`; `[migrate] all migrations completed (1 applied, 116 already applied)` on `construction_erp_closeout_test_20261013`; `document-register-fields.pg.test.js` + `qaqc-certificates.pg.test.js` + `client-actions.pg.test.js` + `consultant-observation.pg.test.js` passed 4 suites / 16 tests; `media-access.test.js` + `client-portal.test.js` + `consultant.test.js` + `portal.test.js` + `doccontrol.test.js` passed 5 suites / 60 tests; `ProjectDocuments.test.js` passed 1 suite / 2 tests; `i18n:check ok`; changed backend files passed `node --check`. No full suite was run.

## 2026-10-13: Phase 5.7.2.d transmittal form and scope

Completed the existing project transmittal form with active project-recipient and controlled-document choices, purpose/attention/response date, submitted document items, and recipient/item count columns. Added project-scope enforcement to recipient/list/detail/status/PDF/item operations and same-project recipient/document validation on create and item addition. Item additions now use the audited transaction path. No migration was needed.

Focused verification: `TransmittalsTab.test.js` passed 1/1; `doccontrol.test.js` passed 13/13; `transmittals-project-scope.pg.test.js` passed 3/3 on the disposable PostgreSQL database; `i18n:check ok`; changed route and test syntax checks and `git diff --check` passed. No full suite was run.

## 2026-10-13: Phase 5.7.3 schedule progress history and resource assignments

Added migration `0056_schedule_progress_assignments.sql` for progress history and dated employee/asset assignments. The progress endpoint atomically records previous/current values, source, data date, notes and actor. Assignment endpoints require a project team employee active for the complete assignment period or an asset from the same project's asset register. Advisory locks serialize assignments to each resource while overlap checks reject conflicting planned/active windows. Assignment status follows planned → active → completed/cancelled. The schedule page now supports history review and bilingual progress/resource forms; date-only values are normalized consistently.

Focused verification: migration 0056 applied to `construction_erp_closeout_test_20261013` (1 applied, 117 already applied); rerun reported 0 applied, 118 already applied. `schedule-progress-assignments.pg.test.js` passed 3/3; `planning.test.js` passed 12/12; `Schedule.test.js` passed 2/2; `i18n:check ok`; changed backend route/test syntax and `git diff --check` passed. `i18n:parity` has seven pre-existing `common.suppliers` misses in `ProcurementWorkspace.js`, no schedule-key misses. No full suite was run.

## 2026-10-13: Phase 5.7.4 handover evidence and warranty register

Migration 0057 adds project-document links for handover checklist evidence, a project asset-document register, and standalone warranty coverage rows. Existing complete `asset_register` warranty date pairs backfill as `WAR-LEGACY-*` entries with notes that the source lacked issuer and document details. Uploads reuse `/api/documents/upload`, then register internal controlled project documents before linking them. Package item updates no longer accept raw URLs, uploaded status requires an attached controlled document, asset/warranty links check project ownership, and warranty dates remain date-only. Existing DLP claim lifecycle remains in place.

Focused command output: `npm run migrate` on `construction_erp_closeout_test_20261013` reported `1 applied, 118 already applied`; rerun reported `0 applied, 119 already applied`. `npm run test:pg -- --runTestsByPath src/scripts/__tests__/handover-documents-warranties.pg.test.js` passed 1 suite / 3 tests. `npm test -- --watchAll=false --runInBand src/pages/Handover.test.js` passed 1 suite / 1 test. `npm run i18n:check` reported `i18n:check ok`. `npm run i18n:parity` reported seven existing `common.suppliers` misses in `ProcurementWorkspace.js`; no handover key issues. `node --check` passed for the changed backend route/test; `git diff --check` passed. An initial negative assertion reused a package item that already had evidence and correctly received 200; the test was corrected to use an unlinked fixture item, and the focused PostgreSQL test then passed. No full suite was run.

## 2026-10-13: Phase 5.8.1 API tokens, agent sessions, and action comments

Migration `0058_agent_credentials_sessions_comments.sql` adds `api_tokens`, `agent_sessions`, and `action_comments`. API token secrets use a high-entropy opaque format, SHA-256 storage, one-time response display, explicit v1 family scopes with wildcard scopes rejected, fixed v1 audience, 30-day default expiry and 90-day maximum. OAuth v1/MCP authentication accepts them and checks status, expiry, active user, and token version. MCP now creates and resumes owner-bound persisted sessions with 90-day expiry; foreign/malformed/expired/closed IDs fail closed. Internal action comment GET/POST routes use parent-record project scope, reject external portal roles, and write activity audit transactionally for reads and appends. The comment routes are available through v1 family scopes.

Focused command output: `npm run migrate` applied migration 0058 (1 applied, 119 already applied); rerun reported 0 applied, 120 already applied. `npm run test:pg -- --runTestsByPath src/scripts/__tests__/agent-platform-records.pg.test.js` passed 1 suite / 3 tests. The named test in `mcp-safety.pg.test.js` passed 1/1. `npm run lint:guards` reported `lint-guards: ok`; changed route/service/test `node --check` commands exited 0; `git diff --check` exited 0. No full test suite was run.

## 2026-10-13: Phase 5.8.2 notification delivery tracking — verification stopped

Implemented local changes for migration 0059, durable per-channel delivery status, stable event/user/channel idempotency, preference suppression, safe provider placeholders without external sends, bounded retry handling, and user-owned status/retry endpoints with transactional retry audit. The focused PostgreSQL test file is `notification-delivery.pg.test.js`.

Focused command output: `npm test -- --runInBand src/scripts/__tests__/action-engine.test.js --testNamePattern="notificationService|event dispatcher"` passed 1 suite / 11 tests (21 skipped). Changed-file `node --check` commands exited 0. `npm run lint:guards` reported `lint-guards: ok`; `git diff --check` exited 0. No full suite was run.


## 2026-10-13: Phase 5.8.2 resumed — Postgres verification and closeout gates

Created a new local Postgres 16 container `erp-closeout-pg16-20261013201559` on loopback port 55471 and fresh test DBs with runtime-generated credentials. No `.env.docker` or `.staging-users.json` file was opened or printed for database setup. The initial migration run applied 121 migrations through 0059. The focused `notification-delivery.pg.test.js` first exposed a PostgreSQL conflict-target error because `notifications.delivery_id` is protected by a partial unique index. Updated the insert to specify `WHERE delivery_id IS NOT NULL`; the focused test then passed 3/3.

The full PG run exposed stale/newly incomplete safety checks and a numbering-test cleanup issue. Updated record-scope rules for QA/QC certificates, classified caller-owned agent records, refreshed route inventory coverage, added provisional GL accounts to the mock finance fixture, extended FK classification for new user-owned/history tables, made handover package document deletion `RESTRICT` with forward-only migration 0060, updated the user-FK allowlist, and deleted invoice lines before invoice rows in the numbering fixture. Focused affected PG tests passed 3 suites / 21 tests.

Final fresh database `erp_closeout_pg_final_20261013202700` applied 122 migrations through 0060. Gate results from current command output:

- Backend mock: 53 suites / 999 tests passed.
- Real PostgreSQL: 67 suites / 605 tests passed.
- `lint:guards`: `lint-guards: ok`.
- Frontend CI: 28 suites / 107 tests passed.
- `i18n:check`: `i18n:check ok`.
- Frontend production build: compiled successfully.
- Playwright: 34 passed / 50 skipped (configured backend-seeded journey and screenshot cases).
- Docker pilot smoke: not run. Automatic review rejected the requested smoke command because its implementation reads the explicitly prohibited `.env.docker` and `.staging-users.json`; no workaround was attempted.

An initial repository-root Jest autodiscovery run was discarded as an invalid gate invocation: it mixed backend, PostgreSQL and frontend tests, and produced 44 suite failures from the wrong root/config. The official backend package Jest configuration subsequently passed 53/53 suites and the PG configuration passed 67/67 suites. A first frontend unit run found missing `common.suppliers` catalog entries; added paired EN/AR keys. The first production build found a missing `apiCall` hook dependency in Handover; stabilized the callback and the build passed. Playwright needed elevated local process launch after sandbox `spawn EPERM` and then completed 34/34 executed tests.

The Phase 5.8.2 changes and gate repairs are verified locally and are awaiting explicit-path staging and commit on `closeout/batch-a-to-6`.

## 2026-10-13: 5.8.2 committed and carryover audit started

Commit `ad8f9f6` records the verified 5.8.2 slice and associated gate repairs. A current Phase 6 prompt scan found 48 `prompt()` calls across 16 page files, so the phase remains open. Added `docs/CARRYOVER.md` with evidence, known owner decisions, and the remaining work sequence. `docs/CODEX_AUDIT_REPORT.md` remains an untracked user artifact and was not modified or staged. The route-to-screen/API inventory and fresh revalidation of the Batch C/E audit leads remain next actions.

## 2026-10-13: Phase 6.2 typed-name deletion prompts

The first prompt-removal slice converted Assets, Clients, Expenses, and Legal to an accessible shared typed-confirmation dialog. It preserves exact-name matching and localizes the input instruction in EN/AR. The current scan now finds 40 `prompt()` calls across 12 page files (down from 48 across 16).

Verification output: `Shell.i18n.test.js` passed 1 suite / 18 tests; `node frontend/scripts/i18n-inventory.js --check` reported `i18n:check ok`; frontend production build reported `Compiled successfully`; `git diff --check` exited 0. No full frontend suite or browser journey was run.

## 2026-10-13: Phase 6.2 HR deletion confirmations

Converted employee and daily-laborer deletion prompts to the shared typed-confirmation dialog. The prompt scan now finds 36 calls across 11 page files.

Verification output: `Shell.i18n.test.js` passed 1 suite / 18 tests; `node scripts/i18n-inventory.js --check` reported `i18n:check ok`; frontend production build reported `Compiled successfully` with no ESLint warning; `git diff --check` exited 0. No HR-specific page test exists in the current frontend test inventory.

## 2026-10-13: Revalidated legacy audit findings against current source

Targeted current-source inspection superseded several older claims in `docs/CODEX_AUDIT_REPORT.md`: webhook SSRF protections and secret encryption/allowlisted reads exist; configurable role/action limits are implemented; procurement and finance workbenches expose the cited flows; client invoice-line writers/readers exist; approved forecasts feed EAC with maker/checker enforcement; supplier returns retain GRN lot links; project tab visibility follows policy grants; and the legacy hard-coded test-user seeder is retired. The fresh PostgreSQL gate also passed the org/RBAC suite. These checks do not replace full golden-journey, security, or finance reconciliation verification.

Still open from targeted revalidation: end-to-end transactional audit coverage across all mutation routes; finance-owner mapping confirmation and complete deduction/retention posting reconciliation; inventory adjustment GL treatment; raw untyped error fallback; the `full_name_en`/`full_name_ar` schema decision; remote CI state; and remaining Phase 6 prompt/navigation/dashboard work. Details are in `docs/CARRYOVER.md`.

## 2026-10-13: Phase 6.2 shared text-entry dialog

Added `TextEntryDialog` and used it for Handover claim titles, saved report-view names, and site-photo captions. The dialog validates required input, keeps API errors in the dialog, and uses paired EN/AR catalog labels. Current prompt scan: 33 calls across 8 page files.

Verification output: `Shell.i18n.test.js` + `Handover.test.js` passed 2 suites / 20 tests; `node scripts/i18n-inventory.js --check` reported `i18n:check ok`; frontend production build reported `Compiled successfully`; `git diff --check` exited 0. A Handover test mock was stabilized because it returned a new translation callback every render, causing an effect loop under the mounted page test.

## 2026-10-13: Phase 6.2 approval and NCR notes

Converted approval decision notes and NCR resolution notes to the shared text-entry dialog. Required behavior is retained for NCR resolution; approval notes remain optional. Current prompt scan: 31 calls across 6 files.

Verification output: `Shell.i18n.test.js` passed 1 suite / 19 tests; `node scripts/i18n-inventory.js --check` reported `i18n:check ok`; frontend production build reported `Compiled successfully`; `git diff --check` exited 0. No focused Approvals or QHSE page test exists.

## 2026-10-13: Phase 6.2 submittal response reasons

Replaced the prompt for rejected/revised submittal response text with the shared text-entry dialog; the reason remains optional. Current prompt scan: 30 calls across 5 page files.

Verification output: `ProjectDocuments.test.js` + `Shell.i18n.test.js` passed 2 suites / 21 tests; `node scripts/i18n-inventory.js --check` reported `i18n:check ok`; frontend production build reported `Compiled successfully`; `git diff --check` exited 0.

## 2026-10-13: Phase 6.2 engineer-instruction response

Converted the optional response prompt used when closing engineer instructions to `TextEntryDialog`. Current prompt scan: 29 calls across 4 files.

Verification output: `node scripts/i18n-inventory.js --check` reported `i18n:check ok`; frontend production build reported `Compiled successfully`; `git diff --check` exited 0. No SiteManagement page-specific test exists.

## 2026-10-13: Phase 6.2 correspondence amendment

Converted the amended-body prompt to a multiline dialog prefilled from the selected correspondence. Current prompt scan: 28 calls across 3 files.

Verification output: `node scripts/i18n-inventory.js --check` reported `i18n:check ok`; frontend production build reported `Compiled successfully`; `git diff --check` exited 0. No DocControlExtended page-specific test exists.

## 2026-10-13: Phase 6.2 ITP point form and unit contract amount

Replaced three sequential ITP inspection-point prompts with a structured form; replaced the unit sold-amount prompt with a validated numeric dialog. Prompt inventory now has 24 calls, all in `PortalDashboard.js`.

Verification output: `Shell.i18n.test.js` passed 1 suite / 20 tests, including non-negative numeric validation; `node scripts/i18n-inventory.js --check` reported `i18n:check ok`; frontend production build reported `Compiled successfully`; `git diff --check` exited 0. No focused QHSEExtended or UnitsSales page test exists.

## 2026-10-13: Phase 6.2 consultant and supplier portal prompt removal

Replaced consultant and supplier prompt flows with localized forms and scoped record selectors. RFQ/PO details load through portal endpoints; quotation and invoice line values are validated; client preview selects from the loaded portfolio. `rg -n "prompt\\s*\\(" frontend/src --glob '*.{js,jsx,ts,tsx}'` returned no matches.

Verification output: `npm run test:ci -- --runTestsByPath src/pages/PortalDashboard.test.js` passed 1 suite / 10 tests; `npm run i18n:check` reported `i18n:check ok`; `npm run build` reported `Compiled successfully`; `git diff --check` exited 0. The pilot smoke remains unverified because automatic review rejected the script due to its reads of `.env.docker` and `.staging-users.json`, prohibited by the closeout request.

## 2026-10-13: Arabic portal catalog correction

Corrected the Arabic quick-action and client-preview values to valid UTF-8 Arabic after detecting terminal-pipeline character loss in a staged diff. The catalog now stores Arabic text, not replacement question marks.

Verification output: `npm run i18n:check` reported `i18n:check ok`; JSON parsing succeeded; `git diff --check` exited 0.

## 2026-10-13: Phase 6 Settings navigation reachability

The existing Settings route was not reachable from the sidebar. Added an owner/admin Settings entry filtered by the existing settings module grant.

Verification output: `npm run test:ci -- --runTestsByPath src/components/layout/Layout.test.js` passed 1 suite / 2 tests; `npm run i18n:check` reported `i18n:check ok`; `git diff --check` exited 0. Remaining route-to-screen inventory and RBAC journey checks are open.

## 2026-10-13: Phase 7.1 app-shell foundation

Added a manifest, SVG app icon, production service worker, versioned shell/static caching, offline navigation fallback, and user-controlled waiting-worker activation. Cache logic excludes `/api/` and `/uploads/`. Removed external Google Fonts import and restricted nginx style/font sources to self. Marked only the app-shell plan checkbox complete.

Verification output: `npm run build` reported `Compiled successfully`; `node --check public/service-worker.js` exited 0; `npm run i18n:check` reported `i18n:check ok`; `git diff --check` exited 0. Lighthouse/PWA installation and an offline browser journey were not run. Local IBM Plex assets are absent from the repo and dependencies; local font packaging remains unverified/open, along with offline mutation queue/idempotency and responsive work.

## 2026-10-13: stop � Docker engine unavailable for Phase 7 idempotency PG gate

Command: `docker info --format '{{.ServerVersion}}'`.

Output: `error during connect: Get "http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.51/info": open //./pipe/dockerDesktopLinuxEngine: Access is denied.` `docker ps --format '{{.Names}} {{.Ports}}'` failed on the same pipe. Per the closeout request's Docker STOP RULE, work stops here without retrying through another access path.

Current idempotency changes are uncommitted. Backend mock middleware suite passed 1 suite / 46 tests. Real-Postgres replay test is unverified; no DB was started or changed. Resume by restoring Docker Desktop access, rerunning the required `docker info` check, then running the focused PG test against a named throwaway Postgres 16 database.

## 2026-10-14: Phase 7.2 daily-report idempotency verified

The normal workspace shell continued to receive `Access is denied` for the Docker Desktop engine pipe; the authorized elevated Docker CLI check returned Engine `28.3.2`. Used a new volume-free, loopback-only PostgreSQL 16 container named `erp-closeout-pg16-20261014`, bound to `127.0.0.1:55441`, with database `construction_erp_test`. Did not use the pilot container or the existing persistent test volume. `npm run migrate` completed with 122 migrations applied.

Daily-report POSTs require an `Idempotency-Key` across the internal API, v1 remount and MCP. Completed results replay, in-flight duplicates return 409, missing keys return typed 400, and the report modal retains a key for retries. MCP exposes `idempotency_key` and passes it as the internal header. Fixed v1 double-wrapping by marking a successfully claimed request; fixed global typed-error handling to preserve valid status and error codes. Added paired portal catalog entries discovered by the frontend parity test.

Gate output: backend mock 53 suites / 1,001 tests; real PostgreSQL 67 suites / 607 tests; frontend 28 suites / 111 tests; `i18n:check ok`; production build `Compiled successfully`; `lint-guards: ok`; focused `node --check` and `git diff --check` exited 0. The focused report suite passed 11/11, including replay/no-duplicate rows and missing-key behavior. No production/pilot database or external service was used.

The Phase 7.2 code slice is ready for explicit-path commit. PWA offline browser journey, Lighthouse, IndexedDB mutation queue, responsive/table/touch work, and local Arabic font package remain unverified/open.

Commit: `2f31c01` — `Phase 7.2: require idempotent daily reports` (explicit-path commit on `closeout/batch-a-to-6`). The only untracked file is the pre-existing user artifact `docs/CODEX_AUDIT_REPORT.md`, not staged or modified.

## 2026-10-14 — Phase 7.2 IndexedDB site-report queue

Implementation: `frontend/src/services/siteReportQueue.js` provides an owner/project-filtered IndexedDB store, local staged photos and daily-report measurements, atomic claim/update/remove, network backoff, stale sync recovery, and replay through the same server idempotency key. `SiteManagement.js` now stages photos locally, lets site staff associate quantities to project locations and BOQ items, displays queue state, and supports retry/removal. Responsive form classes, 14px inputs and 44px queue action targets were added. `backend/src/middleware/v1.js` now releases an idempotency claim on client 4xx so corrected requests can retry; PostgreSQL and mock tests cover this.

Commands and observed results:
- `npm test -- --runInBand`: PASS, 53 suites / 1,002 tests.
- `TEST_PG=1 npm run test:pg -- --silent` with `DB_HOST=127.0.0.1`, `DB_PORT=55441`, `DB_NAME=construction_erp_test`, `DB_USER=construction_erp_test`, blank `DB_PASSWORD`, and a throwaway process-only `JWT_SECRET`: PASS, 67 suites / 608 tests.
- `npm run test:ci`: PASS, 29 suites / 117 tests.
- `npm run i18n:check`: `i18n:check ok`.
- `npm run build`: `Compiled successfully.`
- `npm run lint:guards`: `lint-guards: ok`.
- `npm run test:e2e -- --reporter=line`: PASS, 34 passed / 50 skipped; gated backend/pilot/screenshots remain skipped.
- `npx playwright test e2e/site-report-offline.spec.js --project=desktop-chromium --reporter=line`: PASS, 1 test.
- `npx playwright test e2e/site-report-offline.spec.js --project=mobile-chromium --reporter=line`: PASS, 1 test.
- `git diff --check`: run before commit.

The fresh local Docker Desktop Postgres container is `erp-closeout-pg16-20261014`, loopback-only and volume-free. No `.env.docker`, `.staging-users.json`, production DB, pilot DB, paid service, or external provider was accessed. The existing normal-shell Docker pipe denial remains a host permission quirk; elevated local Docker CLI access was used. PWA Lighthouse score and local Arabic font packaging are unverified. Current global responsive audit count is 110 inline `gridTemplateColumns` occurrences and 64 `<table>` tags; these and Phase 7 exit requirements remain open.

Final verification correction: `git diff --check` and `git diff --cached --check` both exited 0. Commit `7487787` (`Phase 7.2: queue site reports offline`) contains this implementation and its evidence. The audit report artifact was excluded.

## 2026-10-14 — Phase 7.2 responsive layout follow-up

Replaced all 110 page-level inline `gridTemplateColumns` declarations with responsive classes and breakpoints; `rg --no-heading -o gridTemplateColumns frontend/src/pages` returned `0`. Babel parser/traverse audit output: `tables=72 unwrapped=0`; this includes the previously uncontained My Actions and Procurement Comparison tables. Site Management scope now enforces 44px buttons and 14px control text.

Verification: `npm run test:ci` PASS, 29 suites / 117 tests; `npm run i18n:check` PASS; `npm run build` reported `Compiled successfully`; `npm run lint:guards` printed `lint-guards: ok`; `git diff --check` exited 0. Full Playwright after grid/table changes: 36 passed / 50 skipped (the 50 backend/pilot/screenshot cases remain gated). The offline report journey passed 1/1 desktop and 1/1 mobile after final touch sizing. Previously completed backend gates remain 53/1,002 mock and 67/608 real PG; no backend code changed in this layout-only slice.

Phase 7 remains open: font files are absent locally, Lighthouse has not been run, and mobile journeys are not yet present for every major screen and portal.

Responsive layout/table commit: `7fd068a` (`Phase 7.2: make page grids responsive`). The audit report artifact was excluded; explicit-path staging showed 35 files in this slice.

## 2026-10-14 — Phase 8 project cash contribution slice

Implementation: `commercialEngine.projectCommercial` aggregates non-voided payment amounts for its project with SQL `SUM`: direction `ar` is cash in, direction `ap` is cash out, and the contribution expression sums AR positive/AP negative. It returns all three values. Project Operations adds a localized cash contribution metric and moves the existing eight commercial metric labels to paired `commercial.fields.*` keys. The real-PG regression covers AR, AP, void exclusion, another project, and the authenticated commercial endpoint. No migration was required.

Docker Desktop: unprivileged `docker info --format '{{.ServerVersion}}'` returned pipe `Access is denied`; the user-authorized elevated local CLI retry returned `28.3.2`. Inspecting only the known throwaway container confirmed it running at loopback `127.0.0.1:55441`. No production or pilot container was used.

Gate commands and results:
- `npm test -- --runInBand --silent` — PASS, 53 suites / 1,003 tests.
- `TEST_PG=1 npm run test:pg -- --silent` — PASS, 67 suites / 609 tests on throwaway Postgres 16 `construction_erp_test`.
- `TEST_PG=1 npm run test:pg -- --silent src/scripts/__tests__/commercial-5-5.pg.test.js` — PASS, 17/17.
- `npm run test:ci -- --silent` — PASS, 29 suites / 117 tests.
- `npm run i18n:check` — `i18n:check ok`.
- `npm run i18n:parity` — `i18n parity ok: 35 namespaces, 1085 English keys`.
- `npm run build` — `Compiled successfully`.
- `npm run lint:guards` — `lint-guards: ok`.
- JSON parse and `git diff --check` — exit 0.

This completes only the cash-contribution subtask. The indicator is the recorded payment cash basis (AR minus AP), excludes voided/unrecorded transactions, and is not accrual profit or a ledger-reconciled statement. Remaining Phase 8 items and all pending Phase 7/9/10/11 exit work remain open. No production GO decision is implied.

## 2026-10-14 — Phase 8 baseline-driven SPI slice

The `/api/schedule/schedule/kpis` route now looks up the current baseline for the requested project. When its snapshot is valid, planned value comes from saved baseline start/finish dates and planned quantities while earned value uses current progress by activity ID; the KPI is enabled even if `projects.earned_value_enabled` is false. New response field `spi_source` distinguishes baseline and legacy opt-in calculations. The live schedule path remains for explicitly enabled projects without a current baseline. Invalid non-array/JSON snapshots do not activate baseline-derived SPI.

Verification: `npm test -- --runInBand src/scripts/__tests__/planning.test.js` — PASS 12/12; `TEST_PG=1 npm run test:pg -- --silent src/scripts/__tests__/schedule-progress-assignments.pg.test.js` — PASS 4/4 on the throwaway PG16 database. The real route regression asserts SPI 1.0 from baseline PV=50 and EV=50, whereas the changed current plan would yield 0.5. `git diff --check` and backend lint guards are recorded before commit.

Still open: CPI has no activity-level actual-cost source in the existing schema; resource loading is separate; baseline SPI and these two items do not complete the Phase 8 earned-value plan task.

## 2026-10-14 — Phase 8 capped retention and advance recovery

Added advance amount fields/derivation for client and subcontract contracts and active-business-rule retention defaults with per-contract override. Certificate retention is bounded by project cap remaining; automatic advance recovery uses the project setting and is bounded by contract advance remaining. Manual overrides beyond the remaining balance return typed `advance_recovery_exceeds_balance`; valid manual values are written to the same transaction's activity audit description. Subcontract contract creation now enforces project scope and atomically writes the contract plus audit record. Additive migration `0061_subcontract_advance_caps.sql` adds the subcontract advance fields; old subcontract rows receive 0 and must be configured by finance before recovery.

Commands/results on local throwaway Docker Desktop PostgreSQL 16 (`construction_erp_test`, `127.0.0.1:55441`):
- `npm test -- --runInBand --silent` — PASS, 53 suites / 1,003 tests.
- `TEST_PG=1 npm run test:pg -- --silent` — PASS, 67 suites / 611 tests.
- `TEST_PG=1 npm run test:pg -- --silent src/scripts/__tests__/commercial-5-5.pg.test.js` — PASS, 18/18.
- `npm run test:ci -- --silent` — PASS, 29 suites / 117 tests.
- `npm run build` — `Compiled successfully`.
- `npm run i18n:check` — `i18n:check ok`; `npm run i18n:parity` — 35 namespaces / 1,086 English keys.
- `npm run lint:guards` (backend) — `lint-guards: ok`; syntax checks, locale JSON parsing, and `git diff --check` passed.

Docker Desktop server version 28.3.2 and loopback-only disposable container were confirmed using the user-requested local Docker CLI path. Production/pilot databases and `.env.docker`/`.staging-users.json` were not accessed. Finance must confirm contract defaults before production. Phase 8 remains incomplete; Phase 7 and Phases 9–11 remain open.

## 2026-10-14 — Phase 7 mobile route smoke sweep

Added `frontend/e2e/mobile-route-sweep.spec.js` for the login, dashboard, projects, project detail/operations/site/QHSE/HSE/schedule/BOQ, invoices, procurement comparison, approvals, and consultant/client/subcontractor/supplier portals. It uses test-only auth state and mocked empty API responses, then checks the route renders and document width fits the viewport.

`npx playwright test e2e/mobile-route-sweep.spec.js --project=mobile-chromium --reporter=line` — PASS, 17 tests. The unprivileged launch first failed with `spawn EPERM`; the authorized local Playwright runner passed. This test does not satisfy full major-screen journey coverage by itself. IBM Plex Arabic local font packaging and Lighthouse remain open.

## 2026-10-14 — Phase 8 forecast ETC and EAC basis

The current closeout plan specifies EAC = actual + ETC, with ETC supplied by a per-cost-code ForecastVersion or remaining-commitment rules. New ForecastVersions now carry `forecast_basis='etc'`; each line is ETC for its cost code. The no-forecast fallback combines outstanding commitment and remaining uncommitted current budget. The API response exposes `approved_forecast_basis`. Finance workbench forecast form supports multiple cost-code lines. Existing versions are preserved with `forecast_basis='eac'` by migration `0062_forecast_etc_basis.sql`, and the engine continues the old total-EAC calculation for those versions.

Verification:
- `npm run migrate` on disposable Postgres 16 — migration 0062 applied; 123 prior migrations recorded.
- `npm test -- --runInBand --silent` (backend) — PASS, 53 suites / 1,003 tests.
- `TEST_PG=1 npm run test:pg -- --silent src/scripts/__tests__/commercial-5-5.pg.test.js` — PASS, 18/18 (current ETC hand calculation and explicit legacy EAC compatibility).
- `npm run test:ci -- --silent` (frontend) — PASS, 29 suites / 118 tests.
- `npm test -- --watchAll=false --runInBand --silent src/components/project/ProjectFinanceWorkbench.test.js` — PASS, 2/2.
- `npm run build` — `Compiled successfully`.
- `npm run i18n:check` / `npm run i18n:parity` — pass; parity 35 namespaces / 1,089 English keys.
- `npm run lint:guards` (backend), `node --check` for changed JS, and `git diff --check` — pass.

This resolves the formula mismatch for new forecasts while preserving legacy approvals. Finance owner signoff is still required before production. Remaining Phase 8 work and Phases 7, 9, 10, and 11 are not complete.

Commit references: `c8cc6fe` (`Phase 8: cap contract retention and advance recovery`), `96c344e` (`Phase 7: add mobile route sweep`), `0a2ee09` (`Phase 8: define forecast ETC basis per cost code`). All three commits exclude the pre-existing user artifact `docs/CODEX_AUDIT_REPORT.md`.

## 2026-10-14 continuation — Phase 8 certified-quantity valuation

Implemented quantity-backed valuation for both client and subcontractor payment applications. Each application line links to a certified `quantity_measurements` row and snapshots its unique matching contract-line rate. Row locks and active-application reservations prevent duplicate claims; certification records the accepted quantity and computes `gross_current_work` from the line snapshots. Partially certified remainder can be claimed later. Rejected and withdrawn applications release their reservations by lifecycle status. Manual legacy applications remain supported. Migration `0063_payment_application_quantity_valuation.sql` adds the valuation basis and line table; no legacy amounts were rewritten.

Verification on disposable Docker Desktop PostgreSQL 16 (`construction_erp_test`, loopback `127.0.0.1:55441`): `npm run migrate` applied migration 0063 (1 applied, 124 already applied); focused commercial PG suite passed 19/19; full real-PG suite passed 67 suites / 612 tests; backend mocks passed 53 suites / 1,003 tests; backend lint guards passed; i18n check passed and parity reports 35 namespaces / 1,098 English keys; JS syntax, EN/AR JSON parsing, and `git diff --check` passed. First PG run caught certificate totals using the request's supplied money amount rather than the derived quantity amount; corrected and reran focused and full PG suites successfully.

Phase 8 valuation checkbox is closed. Phase 8 remains open for reminder tiers, CPI/resource loading, legacy approval retirement, and duplicate transition/payment-certificate surfaces. Phases 7 and 9–11 remain open.

Final follow-up after exposing quantity lines on application detail and rejecting manual work overrides for quantity-based certification: `TEST_PG=1 npm run test:pg -- --silent src/scripts/__tests__/commercial-5-5.pg.test.js` — PASS, 19/19; `npm run i18n:check` — PASS; `npm run i18n:parity` — PASS, 35 namespaces / 1,099 English keys; `node --check` on the commercial route/service/test and `git diff --check` — PASS. The full PG run (67 suites / 612 tests) preceded these final additive validation/read changes; the focused commercial PG suite was rerun after them.

Valuation implementation commit: `c2a68a5` (`Phase 8: derive valuation from certified quantities`). The pre-commit full PostgreSQL run passed 67 suites / 612 tests; the final focused commercial rerun after the last validation/read changes passed 19/19.

## 2026-10-14 continuation — Phase 8 receivable reminder tiers

Receivable reminders now apply active client-specific rules before project and company defaults, resolving configuration per invoice instead of once per sweep. An explicit disabled client rule suppresses reminders. The pre-due `due_soon` tier now fires once whenever an outstanding invoice is 1–7 days from its due date, so a missed scheduler day does not lose the seven-day reminder. The event payload includes `days_until_due`; existing due-today and overdue 7/14/30 tiers remain.

Verification: real PostgreSQL `event-integrity.pg.test.js` passed 30/30, including the six-day pre-due case, client-over-project role priority, once-only idempotency, and client disable. Backend mock suite passed 53 suites / 1,003 tests; `npm run lint:guards` passed; changed-file `node --check` and `git diff --check` passed. The first run found only a test invoice number exceeding the schema's 20-character limit; the fixture was shortened and the suite reran green. No migration was needed.

Phase 8 reminder tier task is closed. Remaining Phase 8 work: CPI/resource-loaded planning, legacy approval retirement, and duplicate transition/payment-certificate surfaces. Phase 7 and Phases 9–11 remain open.

Reminder-tier implementation commit: `3ae651e` (`Phase 8: honor client receivable reminder rules`). Focused PostgreSQL verification passed 30/30 after correction of the overlong test fixture.

## 2026-10-14 - Phase 8 baseline financial EVM and resource-load planning

Changes: additive migration `0064_schedule_activity_bac.sql` adds explicit, non-negative activity BAC. Baseline snapshots capture BAC and milestone status. The schedule KPI endpoint uses financial PV/EV/SPI when every non-milestone baseline activity has BAC and planned dates; legacy/incomplete snapshots retain quantity SPI, and CPI is explicitly unavailable until the required baseline inputs and positive actual cost exist. CPI actual cost comes from `services/costView.projectTotal`. Added a transactional, audited activity-BAC update route and a daily resource-load endpoint scoped to the authorized project; added a permission-visible editor and EN/AR KPI/resource labels, statuses, and typed errors.

Command evidence:

- `docker version --format '{{.Server.Version}}'` / `docker ps`: `28.3.2`; disposable loopback PostgreSQL container `erp-closeout-pg16-20261014`, `127.0.0.1:55441->5432`.
- `npm run migrate` (`backend`, test DB only): `[migrate] 0064_schedule_activity_bac.sql ...` then `[migrate] all migrations completed (1 applied, 125 already applied)`.
- `TEST_PG=1 npm run test:pg -- --runTestsByPath src/scripts/__tests__/schedule-progress-assignments.pg.test.js --silent`: PASS, 6/6. Covers financial baseline PV/EV/SPI/CPI against project_costs, transactional audit presence, baseline BAC snapshot, invalid BAC, project-scope denial, daily resource load, and invalid ranges.
- `TEST_PG=1 npm run test:pg -- --silent`: PASS, 67 suites / 616 tests.
- `npm test -- --runInBand --silent`: PASS, 53 suites / 1,003 tests.
- `npm run lint:guards`: `lint-guards: ok`.
- `npm run test:ci -- --silent` (`frontend`): PASS, 29 suites / 120 tests. Focused Schedule component test: PASS, 4/4, including budget permission visibility.
- `npm run i18n:check`: `i18n:check ok`; `npm run i18n:parity`: `i18n parity ok: 35 namespaces, 1123 English keys`.
- `npm run build` (`frontend`): `Compiled successfully`.
- `node --check` on changed backend JS, EN/AR locale JSON parse, and `git diff --check`: PASS.

Phase 8 earned-value/resource-load plan item is closed based on these checks. Phase 8 remains open for the approval-system hold and duplicate commercial surfaces; no claim is made that Phase 8 exit golden values, Phase 9-11, PWA Lighthouse, or human acceptance is complete. Implementation commit: f818692.

## 2026-10-14 - Phase 8 legacy approval retirement preparation

Approval API status/stage now project from the linked workflow for pending, my-requests, audit, check, detail, and stale reads; dashboard pending/owner counts and stale-cancel reporting also use workflow state. Decision mirroring is controlled by `APPROVALS_LEGACY_DUAL_WRITE` and remains on by default. The flag-off path preserves legacy history and returns typed 409 `approval_resubmission_requires_legacy_mirror` if the legacy pending index blocks re-submission. Added integration coverage for the two-stage workflow-only path and this blocker.

Verification on loopback-only disposable Docker Desktop PostgreSQL 16 (`construction_erp_test`, `127.0.0.1:55441`): focused approval PG suite 9/9; full PG suite 67 suites / 618 tests; backend mocks 53 suites / 1,004 tests; lint guards passed; changed JS syntax and `git diff --check` passed. The read-only approval parity check initially reported two unlinked test rows; the existing idempotent `migrateLegacyApprovals` helper created their missing twins, and parity then passed for all 55 rows. No migration was added.

Open: no real-data two-week parity hold has occurred. Same-record re-submission after completed workflow remains unavailable while dual writes are off because migration 0013's pending-only index is still present. The additive-only migration rule does not authorize replacing that index; document a migration decision, then perform the restored-real-data preflight and two-week hold before cutover. Approval-retirement plan item stays open. Implementation commit: db10c5e.
