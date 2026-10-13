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
- Phase 5.7.4 handover evidence and the standalone warranty register are implemented and focused checks passed; local commit is the next action. Migration 0057 is applied and reruns cleanly on the disposable PostgreSQL database.

## Next

1. Commit the verified Phase 5.7.4 handover evidence and warranty register slice.
2. Continue Phase 5.8, then Phase 6 in the audited order in `docs/PLAN_5_6_TO_6.md`.

## Decisions and limits

- GL account mappings stay provisional until the finance owner confirms account purposes.
- Human UAT has not been executed.
- The user asked for ticket-related tests during phase work instead of whole suites on every slice.
- `docs/CODEX_AUDIT_REPORT.md` is a pre-existing untracked user artifact and has not been edited.
