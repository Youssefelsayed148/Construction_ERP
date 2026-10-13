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

1. Revalidate Batch C/E and D1-D15 audit leads against current source; classify each with fresh evidence.
2. Complete Phase 6 route-to-screen/API/permission inventory and remove all remaining prompt flows in bounded slices.
3. Continue remaining Phases 5.6 and 7-11 items in master-plan order; see `docs/CARRYOVER.md`.

## In progress / stopped
- Phase 5.8.2 notification delivery tracking and related gate repairs are committed as `ad8f9f6` on `closeout/batch-a-to-6`. Migration 0059 and forward migration 0060 applied successfully to fresh throwaway Postgres 16 test databases using runtime-generated credentials; no credential values were printed or written to tracked files.
- Current closeout gates: backend mock 53 suites / 999 tests; real PG 67 suites / 605 tests; `lint-guards: ok`; frontend CI 28 suites / 107 tests; `i18n:check ok`; production build passed; Playwright 34 passed / 50 skipped. Details and exact output summaries are in `docs/CLOSEOUT_LOG.md`.
- The Docker pilot smoke remains unverified. Automatic review rejected the smoke command because its script reads the explicitly prohibited `.env.docker` and `.staging-users.json` files. No workaround was attempted.

## Decisions and limits

- GL account mappings stay provisional until the finance owner confirms account purposes.
- Human UAT has not been executed.
- The current prompt scan finds 49 calls across 17 frontend page files; Phase 6 remains open. `docs/CARRYOVER.md` records the audit inventory and next actions.
- `docs/CODEX_AUDIT_REPORT.md` is a pre-existing untracked user artifact and has not been edited.
