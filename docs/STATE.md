# Closeout session state

## Completed

- Batches A and B are complete; see `docs/CLOSEOUT_LOG.md` and `docs/STAGING.md`.
- Batch C procurement UI and live journeys are complete; commits include `7c24499` and preceding C slices.
- Batch D UAT preparation is complete in commit `0243d3e`; human UAT remains outstanding.
- Batch E1 account mapping foundation is committed in `9be0cfb`; finance-owner confirmation is still pending.
- Batch E1/E2 certificate postings and invoice lines are committed in `f88c15b`.
- Batch E3/E4 source-lot supplier returns and forecast approval/ETC/EAC behavior are committed in `164c9e9`.
- Batch E5 finance workbench and journal-backed retention release are committed in `7370bca`; focused checks passed.
- Phase 5.6.1, the delivered 5.6.2 workflow slices, and 5.6.3 are implemented. Phase 5.6.2 SLA administration remains open.
- Phase 5.6.4 client actions are committed in `940d2f3`. Phase 5.6.5.a structured subcontractor submission intake/history is committed in `d6070bc`; 5.6.5.b formal WIR/MIR registers are committed in `f7e291d`; 5.6.5.c RFI/submittal forms are committed in `04c8ff0`; 5.6.5.d RFI acknowledgement/resubmittal forms are committed in `ba2a00c`; 5.6.5.e remaining subcontractor action forms are committed in `1f3a345`. Supplier portal MIRs currently show their number, current status, and decision date through own deliveries. Line-level accepted/rejected quantities and full internal inspection history remain on the procurement register.
- Phase 5.7.1 canonical incident source changes and populated legacy-conversion checks are committed in `a090a36`. QHSE and site internal queries now use `incidents`; HSE compatibility conversion retains the legacy view.
- Phase 5.7.2.a RFI location/work-package/cost/schedule impacts are committed in `ea2227c`; migration 0053 is applied on the disposable test database.
- Phase 5.7.2.b QA/QC certificate register is committed in `8ca1850`; migration 0054 is applied on the disposable test database. Spec 15 QA/QC certificates are distinct from finance payment certificates.
- Phase 5.7.2.c controlled-document issue dates/confidentiality and external confidentiality enforcement are committed in `f9d8c52`; migration 0055 is applied on the disposable test database.
- Phase 5.7.2.d transmittal recipient/document form and project-scope checks are committed in `4c89759`; no migration was required. Focused UI, route, PostgreSQL scope and i18n checks passed.
- Phase 5.7.3 schedule progress history and employee/asset assignments are committed in `8978b35`; its state-record correction is `697ccee`. Migration 0056 is applied on the disposable PostgreSQL database and focused route/component checks passed.
- Phase 5.7.4 handover evidence and the standalone warranty register are committed in `4e5da68`; focused checks passed. Migration 0057 is applied and reruns cleanly on the disposable PostgreSQL database.
- Phase 5.8.1 API tokens, durable MCP sessions, and action comments are committed in `42f255e`; focused PostgreSQL tests, the affected MCP safety case, lint guards, migration rerun, and syntax checks passed. Migration 0058 is applied and reruns cleanly on the disposable database.

## Next

1. Continue route-wide audit verification, especially transactional audit failures, safe error behavior, adjustment GL treatment, and project journeys.
2. Complete Phase 6 route-to-screen/API/permission inventory and remove all remaining prompt flows in bounded slices.
3. Continue remaining Phases 5.6 and 7-11 items in master-plan order; see `docs/CARRYOVER.md`.

## In progress / stopped
- Phase 5.8.2 notification delivery tracking and related gate repairs are committed as `ad8f9f6` on `closeout/batch-a-to-6`. Migration 0059 and forward migration 0060 applied successfully to fresh throwaway Postgres 16 test databases using runtime-generated credentials; no credential values were printed or written to tracked files.
- Current closeout gates: backend mock 53 suites / 999 tests; real PG 67 suites / 605 tests; `lint-guards: ok`; frontend CI 28 suites / 107 tests; `i18n:check ok`; production build passed; Playwright 34 passed / 50 skipped. Details and exact output summaries are in `docs/CLOSEOUT_LOG.md`.
- The Docker pilot smoke remains unverified. Automatic review rejected the smoke command because its script reads the explicitly prohibited `.env.docker` and `.staging-users.json` files. No workaround was attempted.

## Decisions and limits

- GL account mappings stay provisional until the finance owner confirms account purposes.
- Human UAT has not been executed.
- The current prompt scan finds zero calls under `frontend/src`; Phase 6 remains open for route-to-screen/API/permission inventory and journey verification. The portal prompt-removal slice passes 10 focused tests, i18n check, and production build; see the latest closeout entries.
- `docs/CODEX_AUDIT_REPORT.md` is a pre-existing untracked user artifact and has not been edited.

- Targeted revalidation of audit leads D1-D15 is recorded in `docs/CARRYOVER.md`; multiple findings from the old report are fixed/superseded in current code. Revalidation is not a full security or business-journey acceptance pass.

## Stop condition � 2026-10-13 � Docker engine unavailable

The required `docker info --format '{{.ServerVersion}}'` check failed: `error during connect: Get "http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.51/info": open //./pipe/dockerDesktopLinuxEngine: Access is denied.` The Phase 7 idempotency changes remain uncommitted. Backend mock coverage passed 46/46; the focused real-Postgres daily-report replay test is unverified. No database or credential files were accessed. Resume after Docker Desktop engine access is restored, verify `docker info`, then run the focused PG test on a named throwaway database.

## 2026-10-14 continuation — Docker access restored; Phase 7 idempotency verified

The normal shell remains denied access to the Docker Desktop pipe; elevated Docker CLI access returned Engine `28.3.2`. Used fresh loopback-only, volume-free PostgreSQL 16 container `erp-closeout-pg16-20261014` and only database `construction_erp_test`. All 122 migrations applied. Daily-report idempotency covers internal, v1 and MCP; full backend mock (53/1,001), real PostgreSQL (67/607), frontend (28/111), i18n, build and guard gates passed. The slice is not yet committed. Continue with the Phase 7 offline queue; Phases 8–11 remain open.

Commit recorded: `2f31c01` (`Phase 7.2: require idempotent daily reports`). The user audit report remains untracked and untouched.

## 2026-10-14 continuation — Phase 7 offline daily-report queue

IndexedDB now stores report drafts, local photo blobs and quantity measurements scoped to owner and project. Sync uses capped exponential retry and the same idempotency key; conflicts/failures stay visible, and users can retry or remove. Desktop and mobile Playwright airplane-mode journeys each passed and confirmed one upload/report POST after reconnect. Backend mock 53/1,002; real PG 67/608; frontend 29/117; i18n and production build passed; full Playwright 34 passed / 50 skipped. Global responsive conversion still has 110 inline grid-template declarations and 64 table tags; local Arabic font assets and Lighthouse are open.

Phase 7.2 offline site-report queue committed as `7487787` (`Phase 7.2: queue site reports offline`). Remaining Phase 7 work is font packaging, Lighthouse, app-wide responsive/table conversion and broader mobile coverage.

## 2026-10-14 continuation — Phase 7 responsive utilities

App-wide page grid declarations were converted to responsive classes (110 to 0). All 72 JSX tables now sit in `.table-container` (AST check: 0 unwrapped). Site Management buttons are 44px minimum and form controls 14px. Post-change Playwright: 36 passed / 50 skipped, including offline flow on desktop/mobile; frontend 29/117, i18n and build passed. Phase 7 remains open for bundled IBM Plex Arabic, Lighthouse evidence, and broader route/portal mobile coverage.

Responsive grid/table slice committed as `7fd068a` (`Phase 7.2: make page grids responsive`).

## 2026-10-14 continuation - Phase 8 baseline BAC, financial EVM, resource loading

Implemented and verified the Phase 8 earned-value/resource-load plan item. Migration 0064 adds activity BAC; baseline snapshots capture BAC and milestone status. Financial SPI/CPI use explicit baseline BAC and the central project cost view. Legacy baselines without complete BAC retain quantity SPI and expose CPI as unavailable. Added transactional audit for BAC changes, project-scoped daily resource-load output for employees/assets, and an EN/AR permission-visible schedule editor and analytics table.

Verification: Docker Desktop Engine 28.3.2; only disposable loopback PostgreSQL container `erp-closeout-pg16-20261014` and test database `construction_erp_test` used. Migration output: 1 applied, 125 already applied. Focused schedule PG 6/6; full PG 67/616; backend mocks 53/1,003; lint guards passed; frontend CI 29/120; focused Schedule component 4/4; i18n check/parity passed (35 namespaces / 1,123 English keys); build compiled; changed JS syntax, EN/AR JSON parse, `git diff --check` passed. Exact commands/output summary recorded in `docs/CLOSEOUT_LOG.md`.

Current open Phase 8 items: legacy approvals dual-write hold/retirement and duplicate transition/payment-certificate surfaces. Phase 7 PWA/Lighthouse, Phases 9-11, and all human/production-evidence gates remain open. `docs/CODEX_AUDIT_REPORT.md` remains an untracked user artifact and is not part of this slice. Implementation commit: db10c5e.

## 2026-10-14 stop note — approval retirement cutover

Phase 8 legacy approval retirement preparation is complete but not cut over. Workflow-backed status is used by approval API reads, dashboard, stale report, and stale-cancel script; legacy status mirroring remains enabled by default. Verification: approval PG 9/9; full PG 67 suites / 618 tests; backend mocks 53 suites / 1,004 tests; `lint:guards: ok`; changed-file JavaScript syntax and `git diff --check` passed. Approval parity passed for all 55 rows after the idempotent repository migration helper created two missing workflow twins on the disposable test DB.

Exact blocker: migration 0013's partial unique pending index keeps a stale legacy row reserved after a workflow decision when mirroring is disabled, preventing same-record re-submission. The API now returns typed 409 `approval_resubmission_requires_legacy_mirror`; no history is rewritten. Replacing the index conflicts with the repository's additive-only migration rule and needs a schema/migration decision. The real-data two-week parity hold has not started. Next action: approve a compatible uniqueness design and migration, then run parity/preflight on restored real-like data and start the two-week monitored hold; keep dual-write default enabled until that evidence and signoff exist.

## 2026-10-14 in progress — Phase 11 reconciliation coverage

`reconcile-database.js` now covers the planned reconciliation categories, including journal balance, sequence drift, PO delivery/GRN quantities, credit-aware payment allocation, project-cost source linkage, and advance ledger direction totals. Unit tests (3/3), backend mocks (53/1,005), lint guards, changed-file syntax/diff checks passed. All added SQL executed read-only against the local disposable PostgreSQL database.

Do not treat this as the Phase 11 restored-copy gate. The disposable database includes retained test fixtures and returned nonzero findings: 16 active workflows missing a current pending step, 64 stock projection mismatches, 59 cost/journal-link rows, 16 missing cost source rows, 84 AP/AR journal references without live documents, and 174 PO delivery/GRN quantity mismatches. No repair or deletion was performed. Restored-real-data backup/copy, reconciliation, discrepancy resolution, and saved report remain the next actions. Implementation commit: 75b6f36.

## 2026-10-14 in progress — Phase 10 shared locale helpers

Implemented the L6 formatting/name helper foundation in `frontend/src/utils/formatters.js`. Formatters follow document `lang` by default or accept an explicit locale; Arabic-digit selection is configurable. Formatter suite passed 5/5; frontend CI 29/123; i18n checks passed (35 namespaces / 1,123 keys); production build compiled. Existing call sites have not all been migrated, so Phase 10 remains open for page migration, API error localization, PDF/RTL/accessibility review, and E2E. Implementation commit: 39e0b6e.

## 2026-10-14 continuation - repeatable Phase 9 golden demo seed

Added `npm run seed:golden-demo`, a process-environment-only fixture CLI guarded to `APP_ENV=test|staging`, a test/staging database-name segment, loopback DB host, valid port, and present DB credentials. Added guard unit cases and changed the real-PG residential fixture to use the same idempotent seed function. On a fresh disposable PostgreSQL 16 database, all 126 migrations applied; the CLI ran twice and returned 96 units, EGP 504,000 C35 BOQ, and 122.4 m3 net demand on both runs. The focused golden-chain suite passed 1 suite / 7 tests.

Batch gates: full PostgreSQL suite 67 suites / 621 tests PASS; backend mocks 54 suites / 1,013 tests PASS; `npm run lint:guards` PASS (`lint-guards: ok`); frontend CI 31 suites / 128 tests PASS; `i18n:check` PASS; parity 35 namespaces / 1,283 English keys PASS; production build PASS; Pixel 7 route sweep 36/36 PASS. The first unprivileged Playwright launch returned `spawn EPERM`; the approved local browser runner passed all 36 routes. Seed guard tests passed 8/8. Database and JWT credentials were generated in process memory; the disposable container and temporary dotenv file were removed.

The full tender-to-warranty/browser scenario is still open because Spec 28 is absent and commercial values remain provisional. Phase 7 local font/Lighthouse, Phase 8 restored-real-data approval parity, Phase 10 Arabic PDF/native review, and Phase 11 seeded reconciliation-defect cases, restored-copy report, independent review, rollout rollback, and UAT also remain open. Pilot smoke and backup/restore rehearsal were not run because their scripts read prohibited `.env.docker` and `.staging-users.json`. Production remains NO-GO; no phase exit boxes were closed.
## 2026-10-14 continuation - Phase 11 seeded reconciliation defects

Added real-PostgreSQL defect tests that seed a payment allocation above the payment amount and a client payment allocation across project boundaries. Each matching reconciliation SQL check reported exactly one violation; test transactions rolled back the fixtures. This is focused detection coverage for two checks, not a complete per-invariant matrix or a clean restored-real-data report.

Updated full gates: fresh disposable PostgreSQL 16 full chain 126 migrations; PG 68 suites / 623 tests PASS; backend mocks 54 suites / 1,013 tests PASS; lint guards PASS; frontend CI 31 suites / 128 tests PASS; i18n check and parity (35 namespaces / 1,283 keys) PASS; production build PASS; Pixel 7 route sweep 36/36 PASS. No real or production data was accessed.
## 2026-10-14 continuation - expanded Phase 11 reconciliation defect coverage

Expanded the real-PG seeded-defect suite from two to six invariants: payment allocation total, invoice allocation balance, cross-project payment allocation, retention releases, advance restorations, and stock-ledger projection. Each test compares the check result before and after inserting its fixture, so pre-existing database residue does not mask or create a false positive. Full PG suite passed 68 suites / 627 tests after this correction. The restored-real-data clean report remains outstanding.
## 2026-10-14 continuation - clean demo reconciliation baseline

On a fresh volume-free Docker PostgreSQL 16 database, the full 126-migration chain and idempotent golden demo seed completed. Read-only runReconciliation returned ok=true with zero violations for all 16 checks. The NOT VALID constraint data-cleaning report returned an empty list. The exact disposable container and process-only generated DB/JWT credentials were removed. This is clean seeded-demo evidence only, not the required restored-real-data acceptance; production remains NO-GO.
## 2026-10-14 continuation - Phase 11 seeded defects cover reconciliation matrix

Expanded `reconcile-defects.pg.test.js` to 14 real-PG cases covering 15 of the 16 reconciliation checks. They seed payment and invoice allocation overages, client/supplier cross-project allocations, cross-project warehouse transfers, missing workflow steps, missing cost source/ledger links, orphan money-movement journal references, unbalanced journal lines, PO delivery-line mismatch, retention/advance imbalance, stock projection mismatch, and approval mirror gaps. Every case compares violation deltas against baseline and rolls back its transaction. Owned-sequence drift remains covered by the existing unit test because setval is not transactionally rollbackable.

Fresh full PG gate: 68 suites / 635 tests PASS after 126 migrations. The full backend mocks 54/1,013, lint guards, frontend CI 31/128, i18n check/parity 35 namespaces / 1,283 keys, production build, and Pixel 7 sweep 36/36 passed in the current batch. Restored-real-data reconciliation remains open.
## 2026-10-14 continuation - synthetic golden-demo backup/restore

On a fresh volume-free Docker PostgreSQL 16 container, applied all 126 migrations, seeded the residential demo, created a custom-format pg_dump inside the container, and restored it into a second empty database. Source and restored snapshots matched: project OSIRIS-RES-TOWERS-001, 96 units, 1 BOQ item, net demand 122.4000 m3. The restored DB passed 16/16 read-only reconciliation checks with 0 violations; data-cleaning report returned []. All credentials were process-generated, no protected env or staging-user files were opened, and the exact container was removed. This only rehearses the synthetic demo restore; the approved-pilot/real-data restore and rollback gate remains open.