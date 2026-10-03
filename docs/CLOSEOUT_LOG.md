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
