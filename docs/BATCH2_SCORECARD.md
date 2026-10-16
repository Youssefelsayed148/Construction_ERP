# Batch 2 scorecard - frontend fixes, tests, browser role matrix

As of 2026-10-16. Frontend suite passed; remaining exit gates are pending.

| Finding | Before | After | Test / evidence | Commit |
|---|---|---|---|---|
| 2.1 Admin dynamic labels and table CSS | Nine configured dynamic field/column labels were missing in both locales; `i18n:check` skipped keys assembled by templates; admin table classes had no CSS. | EN/AR labels added, admin tables styled with logical CSS properties, and `i18n:check` extracts configured field and column names. | Initial check failed on nine missing labels per locale; corrected `npm.cmd run i18n:check` passed. Visual layout and RTL appearance NOT VERIFIED. | `447e103` |
| 2.2 Admin write paths | Existing tests covered only selected create/error/denial paths. | Tests cover configured writes, each writable area's validation/server error response, no-fetch denials, and API-token show-once dismissal. Added organization paging coverage. | `CI=true npm.cmd test -- --runInBand --silent --no-colors src/pages/AdminWorkspace.test.js`: PASS 1 suite / 84 tests. | `e115053` |
| 2.3 Page-level paging and untested screens | No page-level Load More assertions; 21 named screens were not imported in component tests. | Smoke matrix covers the 21 screens for empty response, API error response, and role-denied response; Login rejection is covered. Page-level paging cases cover all 34 source files containing `LoadMore`, including `AdminWorkspace`; error checks assert survival and no sentinel data, not a user-visible error message. | `CI=true npm.cmd run test:ci -- --no-colors`: PASS 37 suites / 323 tests. | `41049da`, `4137544` |
| 2.4 Dashboard canonical role aliases | Seeded canonical roles without registry keys fell back to site-engineer widgets. | Resolver maps every seeded canonical role to a documented widget family; test asserts all canonical keys resolve. | `npm.cmd test -- --runInBand --no-colors src/scripts/__tests__/dashboard-widgets.test.js`: PASS 1 suite / 26 tests. | `c2fbd51` |
| 2.5 Pilot browser role matrix | No browser role-matrix evidence. | Read-only matrix ran for 38 accounts in English and Arabic; screenshots stored under ignored `frontend/e2e-artifacts`. 76 screenshots. No unexpected non-login methods. The owner project API exposed one real project ID, and no out-of-scope project target was available for 72 account/language checks, so cross-project isolation is NOT VERIFIED. | Playwright: 1 test passed (3.1m). See `docs/ROLE_MATRIX_RESULTS.md`. Two HIGH candidate entries: `/invoices` for `accountant_ap` in EN/AR returned a data-bearing 200 API response on a denied URL; visible data was not detected. No access changes made. | `1cbe7bc` |
| Batch 2 exit gates | Not run for this batch. | Frontend full suite passed; remaining gates pending. | `test:ci`: PASS 37 suites / 323 tests; i18n, API/guard lint, root build, backend mock and PG `-All` remain pending. | — |

## NOT DONE / NOT VERIFIED

- The frontend full suite passed. i18n, lint, build, backend mock and PostgreSQL exit gates are pending.
- Browser role matrix completed, but real cross-project record isolation could not be tested because only one project ID was available and it was in the tested accounts' recorded scope.
- Error-response smoke cases prove the page stays mounted and does not render the sentinel response data; they do not establish that each page displays a user-facing error state.
- No human visual review was done; layout and RTL appearance are NOT VERIFIED.

## Decisions waiting

- Review the two HIGH candidate entries for `/invoices` in `docs/ROLE_MATRIX_RESULTS.md`. No pilot access changes were made.
