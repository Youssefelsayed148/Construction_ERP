# Closeout session state

## Completed

- Batch A security and green-gate slices: see commits on `closeout/batch-a-to-6` and `docs/CLOSEOUT_LOG.md`.
- Batch B local Docker staging, seed, smoke and backup rehearsal: see `docs/STAGING.md` and closeout logs.
- Batch C procurement UI and live journeys: commits `7c24499` and preceding C slices; 4/4 language/viewport journeys and 1/1 denied-access journey passed.
- Batch D UAT preparation: commit `0243d3e`; human UAT remains with pilot users.
- Batch E1 mapping foundation: commit `9be0cfb`; account purpose confirmation is still pending from the finance owner.
- Batch E1/E2 certificate postings and invoice lines: commit `f88c15b`; focused unit tests passed 5/5.
- Batch E3/E4 are implemented in the current uncommitted slice: source-lot supplier returns, finance maker/checker on forecasts, and approved forecast input to ETC/EAC. Focused isolated-Postgres cases passed.

## In progress

- Batch E5: finance screens for applications/certificates, credit notes, payment batches, budget versions and forecast versions.
- After Batch E, write and commit `docs/PLAN_5_6_TO_6.md` before starting Phases 5.6, 5.7, 5.8 or 6.

## Decisions and limits

- Chart mappings are provisional. Finance-owner confirmation is outstanding; the implementation must not mark these mappings confirmed on the owner's behalf.
- Human UAT has not been executed.
- User requested related-ticket tests during phases instead of rerunning whole suites each time. Verification so far followed that cadence.
- `docs/CODEX_AUDIT_REPORT.md` was present as an untracked user artifact and has been left untouched.

## Next actions

1. Review and commit the E3/E4 slice after focused checks and docs updates.
2. Implement the E5 screens and focused screen/API checks; update this file and closeout logs.
3. Verify Phases 5.6–6 against code, commit the plan, then execute phase slices with focused tests.
