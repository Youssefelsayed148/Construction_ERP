# Batch 2 scorecard - frontend fixes, tests, browser role matrix

As of 2026-10-16. This is an in-progress checkpoint; later ticket results will be added with command output.

| Finding | Before | After | Test / evidence | Commit |
|---|---|---|---|---|
| 2.1 Admin dynamic labels and table CSS | Nine configured dynamic field/column labels were missing in both locales; `i18n:check` did not inspect keys assembled by templates; admin table classes had no CSS. | EN/AR labels added, admin table and responsive wrapper styled with logical CSS properties, and `i18n:check` now extracts configured `field()` names and `columns` entries for both catalogs. | Before: `npm.cmd run i18n:check` failed with the nine missing labels in EN and AR. After: same command PASS (`i18n:check ok`). Visual layout and RTL appearance NOT VERIFIED. | Pending |
| 2.2 Admin write paths | Existing tests covered organization create, one validation/server failure, token show-once, and one denial; configured updates and row actions were uncovered. | Added parameterized coverage for every configured write action, including organization/user/delegation/approval-limit/inventory/variation/webhook/token/numbering/replenishment paths; per-area module denial asserts zero API calls. | Focused harness run: 61 passed / 2 failed before correcting the inventory detail fixture; targeted inventory update/void rerun passed. Full focused file rerun pending. | Pending |
| 2.3 Page-level paging and untested screens | No page-level Load More coverage and 21 named pages have no imported component tests. | NOT DONE. | NOT VERIFIED. | — |
| 2.4 Dashboard canonical role aliases | Seeded canonical roles without registry keys fell back to site-engineer widgets. | Added aliases for every role in `seed-staging.js`; resolver now applies alias targets; registry test asserts each canonical key resolves to a defined widget family. | Before: dashboard focused test failed for a canonical role. After: `npm.cmd test -- --runInBand --no-colors src/scripts/__tests__/dashboard-widgets.test.js` PASS 1 suite / 26 tests. | Pending |
| 2.5 Pilot browser role matrix | No browser role-matrix evidence. | NOT DONE. | NOT VERIFIED. Pilot must remain read-only. | — |
| Batch 2 exit gates | Not run. | NOT DONE. | Frontend full tests, i18n check, API/guard lint, root build, and backend mock/PG gates if backend changes remain pending. | — |

## NOT DONE / NOT VERIFIED

- Page-level paging, smoke coverage for the 21 listed screens, and the pilot browser role matrix remain NOT DONE.
- Admin write-path file verification is still in progress; do not treat its earlier partial run as the final result.
- No human visual review was done; layout and RTL appearance are NOT VERIFIED.

## Decisions waiting

- Candidate browser access defects will be listed with severity for owner review. No pilot access changes are authorized in this batch.
